import amqp from 'amqplib'
import { RabbitMQBase } from './base'
import { safeErrorMessage } from './logger'
import type { MessageHandler } from './types'

export class RabbitMQConsumer extends RabbitMQBase {
  private retries = 0
  private handlers = new Map<string, MessageHandler>()
  /** Queue names we have an active `consume()` subscription on, so we can re-subscribe after reconnect. */
  private subscribedQueues = new Set<string>()
  /** queueName → active amqplib consumerTag, so `unRegisterHandler` can issue `basic.cancel`. */
  private consumerTags = new Map<string, string>()
  /** Guard so multiple 'close' events don't kick off concurrent reconnect loops. */
  private reconnectInProgress = false

  /**
   * Open the connection + consumer channel, assert every exchange and
   * queue (with bindings) from the config, then arm the reconnect
   * listener. Throws if the broker is unreachable or any assertion
   * fails. Call once before {@link registerHandler} + {@link consume}.
   */
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
    this.logger.info('[RabbitMQ::Consumer] connect ...')

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
      this.logger.error('[RabbitMQ::Consumer] connection error', safeErrorMessage(error))
    })

    this.logger.info('[RabbitMQ::Consumer] connected successfully')
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
   *
   * `maxRetries: 0` disables reconnect entirely (the loop never enters);
   * the log message in that case is "reconnect disabled" rather than
   * "max retries exceeded".
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectInProgress) return
    this.reconnectInProgress = true
    // Start each reconnect series from a clean counter. `retries` is only
    // otherwise reset on a successful `connect()`; without this, a series
    // that exhausted `maxRetries` would leave the counter pinned at the
    // ceiling, so the NEXT 'close' event would find `retries >= maxRetries`
    // immediately and give up without a single attempt.
    this.retries = 0

    const maxRetries = this.config.connection.maxRetries ?? 5
    const interval = this.config.connection.reconnectInterval ?? 5000

    try {
      while (this.retries < maxRetries) {
        this.retries++
        this.logger.info(`[RabbitMQ::Consumer] reconnecting (attempt ${this.retries}/${maxRetries}) in ${interval}ms`)

        await new Promise<void>(resolve => setTimeout(resolve, interval))

        try {
          await this.connect()
          await this.setupExchanges()
          await this.setupQueues()
          for (const queueName of this.subscribedQueues) {
            const reply = await this.channel.consume(queueName, this.buildDeliveryCallback(queueName))
            this.consumerTags.set(queueName, reply.consumerTag)
          }
          this.logger.info('[RabbitMQ::Consumer] reconnected and re-subscribed')
          // Clear the guard BEFORE the implicit return so that a fresh
          // 'close' arriving right after success can re-enter cleanly.
          // (The `finally` below is then a harmless no-op double-clear.)
          this.reconnectInProgress = false
          return
        } catch (error) {
          this.logger.error(
            `[RabbitMQ::Consumer] reconnect attempt ${this.retries} failed:`,
            safeErrorMessage(error)
          )
          // fall through to the next iteration of the while-loop
        }
      }

      if (maxRetries === 0) {
        this.logger.error('[RabbitMQ::Consumer] reconnect disabled (maxRetries=0); the consumer is no longer connected.')
      } else {
        this.logger.error(`[RabbitMQ::Consumer] max connection retries (${maxRetries}) exceeded; giving up. The consumer is no longer connected.`)
      }
    } finally {
      this.reconnectInProgress = false
    }
  }

  /**
   * Register an async handler for a queue. Storage only — no broker
   * traffic happens here; the handler activates once {@link consume} is
   * called for the same `queueName`. Registering twice for the same
   * queue replaces the previous handler.
   *
   * The handler receives the JSON-parsed message body plus terminal
   * `ack` / `nack` callbacks. `nack` always sends `requeue=false` so
   * rejected messages route through any configured dead-letter
   * exchange — to replay, publish a fresh copy.
   *
   * Parse errors (invalid JSON) and uncaught handler rejections are
   * logged and `nack`'d by the library — the handler itself never sees
   * a parse failure.
   *
   * The library does NOT validate the parsed body — spreading it into
   * a trusted object (`{ ...trusted, ...msg }`) or assigning to
   * `Object.prototype`-adjacent keys is the caller's responsibility.
   * Validate the shape before merging.
   *
   * @typeParam T the parsed message body shape. The library does not
   *   validate at runtime; supply a narrow type and validate at the
   *   call site if needed.
   * @param queueName must match an asserted queue (see `RabbitMQConfig.queues`).
   * @param handler async callback invoked for every delivery.
   */
  registerHandler<T>(
    queueName: string,
    handler: MessageHandler<T>
  ): void {
    // Storage erases T: the map holds `MessageHandler<unknown>` (after the
    // `any → unknown` tightening of the type alias's default). The explicit
    // `<unknown>` makes the boundary visible at the call site and survives a
    // future change to the `MessageHandler` default. `buildDeliveryCallback`
    // invokes the handler with a parsed payload the caller chose to type as T.
    this.handlers.set(queueName, handler as MessageHandler<unknown>)
  }

  /**
   * Remove a previously registered handler, issue an AMQP `basic.cancel`
   * for the queue's active consumer (if any), and drop the queue from the
   * reconnect-resubscribe set.
   *
   * Issuing `basic.cancel` is what actually stops the broker delivering on
   * the live channel: without it the consumer tag stays open, deliveries
   * keep arriving at a now-handlerless callback, and — with
   * `prefetchCount=1` — the unacked delivery blocks the queue. Dropping the
   * queue from `subscribedQueues` covers the same hazard across a reconnect.
   *
   * Returns a promise because the cancel is a broker round-trip. The handler
   * map and tracking sets are cleared synchronously **before** the await, so
   * even an un-awaited call immediately stops dispatching to the handler.
   *
   * @param queueName the queue whose subscription to tear down. Unknown
   *   queues are a no-op.
   */
  async unRegisterHandler(queueName: string): Promise<void> {
    this.handlers.delete(queueName)
    // Drop from subscribedQueues so a future reconnect doesn't re-subscribe
    // a queue with no handler (which would silently leave its deliveries
    // un-acked and, with prefetchCount=1, block the queue).
    this.subscribedQueues.delete(queueName)

    const consumerTag = this.consumerTags.get(queueName)
    if (consumerTag === undefined) return
    this.consumerTags.delete(queueName)
    try {
      await this.channel.cancel(consumerTag)
    } catch (error) {
      // A cancel failure (e.g. channel already closed) is non-fatal: the
      // handler is already detached and the tag forgotten. Log and move on.
      this.logger.warn(
        `[RabbitMQ::Consumer] basic.cancel for "${queueName}" failed:`,
        safeErrorMessage(error)
      )
    }
  }

  /**
   * Subscribe to a queue. Tracks the subscription so the reconnect
   * loop can re-attach after a broker drop. Each delivery is
   * JSON-parsed and forwarded to the handler registered via
   * {@link registerHandler}; if no handler exists for the queue, the
   * delivery is silently ignored (it stays un-acked until the channel
   * closes — register your handler **before** calling `consume`).
   *
   * @param queueName name of an already-asserted queue. Server-named
   *   queues (where the broker assigns the name in `initialize()`)
   *   should be looked up via the `assertQueue` reply if you need to
   *   pass the generated name back in.
   * @returns the amqplib `Replies.Consume` (contains `consumerTag`).
   */
  async consume(
    queueName: string
  ): Promise<amqp.Replies.Consume> {
    this.subscribedQueues.add(queueName)
    const reply = await this.channel.consume(queueName, this.buildDeliveryCallback(queueName))
    this.consumerTags.set(queueName, reply.consumerTag)
    return reply
  }

  /**
   * Close the channel and connection, and reset the consumer to a clean
   * state so it can be safely re-`initialize()`d. Without this override
   * the reconnect tracking (`subscribedQueues`, `reconnectInProgress`,
   * `retries`) would leak across consumer lifecycles.
   */
  override async disconnect(): Promise<void> {
    this.subscribedQueues.clear()
    this.handlers.clear()
    this.consumerTags.clear()
    this.reconnectInProgress = false
    this.retries = 0
    await super.disconnect()
  }

  /**
   * Build the delivery callback for a queue. Extracted so the reconnect path
   * can use the same logic without duplicating the closure inline.
   *
   * Each invocation owns a per-delivery `terminated` flag that guards
   * `channel.ack` / `channel.nack` so only the FIRST terminal call wins:
   *
   * - `ack()` then `throw` → only `ack` fires; the catch's safety-net
   *   `nack` is suppressed. amqplib treats a second terminal call on the
   *   same delivery as a protocol error (channel close in production).
   * - `nack()` then `throw` → only `nack` fires.
   * - `ack(); ack()` → only the first ack fires.
   * - Handler throws without calling `ack`/`nack` → the catch nacks once.
   *
   * Idempotency is per-delivery: a separate `terminated` lives in each
   * outer-`return async (msg) => …` invocation, so two messages each get
   * their own first-call-wins guard.
   */
  private buildDeliveryCallback(queueName: string): (msg: amqp.ConsumeMessage | null) => Promise<void> {
    return async (msg) => {
      if (!msg) return

      const handler = this.handlers.get(queueName)
      if (!handler) return

      let terminated = false
      const ack = () => {
        if (terminated) {
          // `warn`, not `debug` — `ack(); ack()` (or `ack(); nack()`) without
          // a surrounding throw produces zero `error`-level output, so a
          // silent suppression would mask the handler bug at default log
          // levels. The rate is bounded by handler defects, not traffic.
          this.logger.warn('[RabbitMQ::Consumer] ack suppressed — delivery already terminated')
          return
        }
        // Call the broker FIRST, flip the flag on success only. If
        // `channel.ack` throws synchronously (channel closed mid-handler),
        // `terminated` stays false and the catch-safety-net below can
        // still nack — otherwise the delivery would sit unacked until the
        // reconnect re-asserts the channel.
        this.channel.ack(msg)
        terminated = true
      }
      const nack = () => {
        if (terminated) {
          this.logger.warn('[RabbitMQ::Consumer] nack suppressed — delivery already terminated')
          return
        }
        this.channel.nack(msg, false, false)
        terminated = true
      }

      try {
        const content = JSON.parse(msg.content.toString())
        await handler(content, ack, nack)
      } catch (error) {
        this.logger.error(`[RabbitMQ] Error processing message: ${safeErrorMessage(error)}`)
        // Safety-net: if the handler threw before reaching a terminal
        // call, nack the delivery. If a terminal call already fired,
        // skip — the `terminated` guard makes this idempotent. The
        // call-broker-first ordering above guarantees a synchronous
        // throw from `channel.ack/nack` leaves `terminated === false`,
        // so this path still nacks for that broker-error case.
        if (!terminated) {
          this.channel.nack(msg, false, false)
          terminated = true
        }
      }
    }
  }
}
