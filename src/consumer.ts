import amqp from 'amqplib'
import { RabbitMQBase } from './base'
import type { MessageHandler } from './types'

export class RabbitMQConsumer extends RabbitMQBase {
  private retries = 0
  private handlers = new Map<string, MessageHandler>()
  /** Queue names we have an active `consume()` subscription on, so we can re-subscribe after reconnect. */
  private subscribedQueues = new Set<string>()
  /** Guard so multiple 'close' events don't kick off concurrent reconnect loops. */
  private reconnectInProgress = false

  public async initialize(): Promise<void> {
    await this.connect()
    await this.setupExchanges()
    await this.setupQueues()
  }

  /**
   * Open a connection, create a channel, apply prefetch, and wire the
   * close-listener that drives reconnect. Throws on failure — the caller
   * (initialize or the reconnect loop) decides what to do with errors.
   */
  override async connect(): Promise<void> {
    console.log('[RabbitMQ::Consumer] connect ...')

    this.connection = await amqp.connect(this.config.connection.url)
    this.channel = await this.connection.createChannel()
    await this.channel.prefetch(this.config.channel!.prefetchCount!)

    // The 'close' event fires when the broker drops the connection or the
    // peer side closes it. Each successful connect attaches its own listener
    // to the new connection object.
    this.connection.on('close', () => { void this.handleReconnect() })
    // 'error' typically precedes 'close' — we log here and let 'close' drive
    // the actual recovery so we don't double-trigger.
    this.connection.on('error', (error) => {
      console.error('[RabbitMQ::Consumer] connection error', error instanceof Error ? error.message : error)
    })

    console.log('[RabbitMQ::Consumer] connected successfully')
    this.retries = 0
  }

  /**
   * Bounded async reconnect loop. Triggered by the 'close' event on the
   * connection. Sleeps `reconnectInterval` between attempts, re-asserts the
   * topology and re-subscribes any queues that had active consume() calls.
   *
   * Never throws — a synchronous throw out of an event listener would be
   * uncatchable for the caller and cause an unhandled-exception crash.
   * On exhaustion we log and give up; the process stays alive and the
   * caller can decide to recreate the consumer.
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectInProgress) return
    this.reconnectInProgress = true

    const maxRetries = this.config.connection.maxRetries ?? 5
    const interval = this.config.connection.reconnectInterval ?? 5000

    try {
      while (this.retries < maxRetries) {
        this.retries++
        console.log(`[RabbitMQ::Consumer] reconnecting (attempt ${this.retries}/${maxRetries}) in ${interval}ms`)

        await new Promise<void>(resolve => setTimeout(resolve, interval))

        try {
          await this.connect()
          await this.setupExchanges()
          await this.setupQueues()
          for (const queueName of this.subscribedQueues) {
            await this.channel.consume(queueName, this.buildDeliveryCallback(queueName))
          }
          console.log('[RabbitMQ::Consumer] reconnected and re-subscribed')
          return
        } catch (error) {
          console.error(
            `[RabbitMQ::Consumer] reconnect attempt ${this.retries} failed:`,
            error instanceof Error ? error.message : error
          )
          // fall through to the next iteration of the while-loop
        }
      }

      console.error(
        `[RabbitMQ::Consumer] max connection retries (${maxRetries}) exceeded; giving up. The consumer is no longer connected.`
      )
    } finally {
      this.reconnectInProgress = false
    }
  }

  registerHandler<T>(
    queueName: string,
    handler: MessageHandler<T>
  ): void {
    this.handlers.set(queueName, handler)
  }

  unRegisterHandler(queueName: string): void {
    if (this.handlers.has(queueName)) {
      this.handlers.delete(queueName)
    }
  }

  async consume(
    queueName: string
  ): Promise<amqp.Replies.Consume> {
    this.subscribedQueues.add(queueName)
    return this.channel.consume(queueName, this.buildDeliveryCallback(queueName))
  }

  /**
   * Build the delivery callback for a queue. Extracted so the reconnect path
   * can use the same logic without duplicating the closure inline.
   */
  private buildDeliveryCallback(queueName: string): (msg: amqp.ConsumeMessage | null) => Promise<void> {
    return async (msg) => {
      if (!msg) return

      const handler = this.handlers.get(queueName)
      if (handler) {
        try {
          const content = JSON.parse(msg.content.toString())
          await handler(
            content,
            () => this.channel.ack(msg),
            () => this.channel.nack(msg, false, false)
          )
        } catch (error) {
          console.error(`[RabbitMQ] Error processing message: ${error instanceof Error ? error.message : error}`)
          this.channel.nack(msg, false, false)
        }
      }
    }
  }
}
