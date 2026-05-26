import amqp from 'amqplib'
import { RabbitMQBase } from './base'
import { safeErrorMessage } from './logger'
import type { ExchangeParams, MessageOptions } from './types'

export class RabbitMQProducer extends RabbitMQBase {
  private exchanges = new Map<string, ExchangeParams>()

  /**
   * Open the connection + publish channel and assert every exchange
   * from the config. Throws if the broker is unreachable or the
   * topology assertion fails. Call once before {@link publish}.
   */
  public async initialize(): Promise<void> {
    await this.connect()
    await this.setupExchanges()
  }

  /**
   * Open the AMQP connection and create a publish channel.
   *
   * Intentionally does NOT call `channel.prefetch()` — `prefetch` is a
   * consumer-side flow-control setting (limits unacked deliveries on the
   * channel) and has no effect on publishing.
   */
  override async connect(): Promise<void> {
    try {
      this.logger.info('[RabbitMQ::Producer] connect ...')

      this.connection = await amqp.connect(this.config.connection.url)
      this.channel = await this.connection.createChannel()
      this.logger.info('[RabbitMQ::Producer] connected successfully')
    } catch (error) {
      const problem = error instanceof Error ? error : new Error(`[RabbitMQ::Producer] connected error`, { cause: error })

      this.logger.error('[RabbitMQ::Producer] connect failed:', safeErrorMessage(problem))
      throw problem
    }
  }

  /**
   * Assert an exchange on the broker (delegates to `RabbitMQBase`) and
   * remember it in the Producer's local map. The cached entries are
   * informational — `publish()` does not re-assert before sending.
   */
  override async registerExchange(
    exchange: ExchangeParams
  ): Promise<void> {
    await super.registerExchange(exchange)
    this.exchanges.set(exchange.name, exchange)
  }

  /**
   * Publish a message to an exchange, serialized as JSON.
   *
   * @param exchangeName Target exchange (must be declared in the config).
   * @param routingKey   Routing key for the broker to match against bindings.
   * @param message      Payload — JSON-serialized into a Buffer.
   * @param options      AMQP publish options. Defaults to `priority: 5`.
   *
   * @returns
   * The boolean returned by `amqplib`'s `channel.publish()`. This reflects
   * **only the client-side write buffer state**, not broker acknowledgment:
   * - `true`  — the message was written to the channel's outgoing buffer.
   * - `false` — the buffer is full; the caller should wait for the channel's
   *   `'drain'` event before publishing more (back-pressure signal).
   *
   * It does **not** mean the broker has received or persisted the message.
   * For at-least-once delivery you need publisher confirms (Track 4 capability,
   * post-v0.1) — switch to `createConfirmChannel()` and await
   * `channel.waitForConfirms()`.
   */
  async publish<T>(
    exchangeName: string,
    routingKey: string,
    message: T,
    options: MessageOptions = {}
  ): Promise<boolean> {
    return this.channel.publish(
      exchangeName,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        priority: 5,
        ...options
      }
    )
  }
}
