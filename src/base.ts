import amqp from 'amqplib'
import { defaultLogger } from './logger'
import type { ExchangeParams, Logger, QueueParams, RabbitMQConfig } from './types'

export abstract class RabbitMQBase {
  protected connection!: amqp.ChannelModel
  protected channel!: amqp.Channel
  protected config: RabbitMQConfig
  protected logger: Logger

  constructor(config: RabbitMQConfig) {
    this.config = {
      channel: { prefetchCount: 1 },
      ...config
    }
    this.logger = config.logger ?? defaultLogger
  }

  /**
   * Open the AMQP connection and channel. Not a TypeScript `abstract`
   * method — the base implementation throws unless a subclass overrides
   * it; `RabbitMQProducer` and `RabbitMQConsumer` do exactly that
   * (publish channel vs consumer channel + reconnect listener).
   */
  async connect(): Promise<void> {
    throw new Error('Need override this function')
  }

  /**
   * Iterate the config's `exchanges` array and assert each one against
   * the broker. Called by `initialize()`; idempotent on the broker side.
   * @protected
   */
  protected async setupExchanges(): Promise<void> {
    for (const exchange of this.config.exchanges) {
      await this.registerExchange(exchange)
    }
  }

  /**
   * Declare a single exchange on the active channel. `Producer` overrides
   * this to also cache the exchange in a local map.
   *
   * @param exchange the exchange to assert — see {@link ExchangeParams}.
   */
  async registerExchange(
    exchange: ExchangeParams
  ): Promise<void> {
    await this.channel.assertExchange(
      exchange.name,
      exchange.type,
      exchange.options || {}
    )
  }

  /**
   * Iterate the config's `queues` array, assert each queue and create
   * its bindings. Called by `Consumer.initialize()`.
   * @protected
   */
  protected async setupQueues(): Promise<void> {
    for (const queue of this.config.queues) {
      await this.registerQueue(queue)
    }
  }

  /**
   * Declare a single queue (and its bindings) on the active channel.
   *
   * The library merges three sources into the queue's `arguments`:
   * (1) library-injected `x-max-priority` (from `queue.maxPriority`,
   * default 10; omitted when set to 0),
   * (2) library-injected `x-dead-letter-exchange` / `x-dead-letter-routing-key`
   * (from `queue.deadLetter`),
   * (3) caller-supplied `queue.options.arguments`.
   *
   * On per-key conflict, the caller wins; sibling keys survive.
   *
   * @param queue the queue to assert — see {@link QueueParams}.
   * @returns the amqplib assertQueue reply (with the broker-assigned
   *   queue name if `queue.name` was empty).
   */
  async registerQueue(
    queue: QueueParams
  ): Promise<amqp.Replies.AssertQueue> {
    const maxPriority = queue.maxPriority ?? 10

    // Build a single `arguments` object so x-max-priority, dead-letter args
    // and caller-supplied options.arguments all coexist. Earlier code spread
    // them in three separate steps and accidentally let later spreads wipe
    // the earlier ones; caller options.arguments now win per-key but do not
    // replace sibling keys.
    const mergedArguments: Record<string, unknown> = {}
    // AMQP rejects x-max-priority outside 1..255; treat 0 / negative as
    // "no priority queue" and omit the key so the broker accepts the assert.
    if (maxPriority > 0) {
      mergedArguments['x-max-priority'] = maxPriority
    }
    if (queue.deadLetter) {
      mergedArguments['x-dead-letter-exchange'] = queue.deadLetter.exchange
      mergedArguments['x-dead-letter-routing-key'] = queue.deadLetter.routingKey ?? ''
    }
    // Object.assign is a shallow copy — nested values share references with
    // the caller's config. Safe here because we hand the result straight to
    // assertQueue and never mutate after.
    const { arguments: callerArguments, ...callerRestOptions } = queue.options ?? {}
    if (callerArguments) {
      Object.assign(mergedArguments, callerArguments)
    }

    // We deliberately do NOT pass `maxPriority` as a top-level option:
    // amqplib translates it to x-max-priority internally, which would
    // silently shadow a caller's explicit override in options.arguments.
    const q = await this.channel.assertQueue(
      queue.name || '',
      {
        ...callerRestOptions,
        arguments: mergedArguments
      }
    )

    for (const binding of queue.bindings) {
      if (binding.headers) {
        await this.channel.bindQueue(
          q.queue,
          binding.exchange,
          binding.routingKey || '',
          binding.headers
        )
      } else {
        await this.channel.bindQueue(
          q.queue,
          binding.exchange,
          binding.routingKey || ''
        )
      }
    }

    return q
  }

  /**
   * Close the channel and the connection. Safe to call repeatedly or
   * before `initialize()` (the optional-chaining handles a missing
   * channel/connection). `RabbitMQConsumer` overrides this to also
   * clear its reconnect-tracking state.
   */
  async disconnect(): Promise<void> {
    await this.channel?.close()
    await this.connection?.close()
    this.logger.info('[RabbitMQ::Base] disconnect')
  }
}
