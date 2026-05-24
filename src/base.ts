import amqp from 'amqplib'
import type { ExchangeParams, QueueParams, RabbitMQConfig } from './types'

export abstract class RabbitMQBase {
  protected connection!: amqp.ChannelModel
  protected channel!: amqp.Channel
  protected config: RabbitMQConfig

  constructor(config: RabbitMQConfig) {
    this.config = {
      channel: { prefetchCount: 1 },
      ...config
    }
  }

  async connect(): Promise<void> {
    throw new Error('Need override this function')
  }

  /**
   * Initialize all exchanges from the config
   * @protected
   */
  protected async setupExchanges(): Promise<void> {
    for (const exchange of this.config.exchanges) {
      await this.registerExchange(exchange)
    }
  }

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
   * Initialize queues from config
   * @protected
   */
  protected async setupQueues(): Promise<void> {
    for (const queue of this.config.queues) {
      await this.registerQueue(queue)
    }
  }

  async registerQueue(
    queue: QueueParams
  ): Promise<amqp.Replies.AssertQueue> {
    const maxPriority = queue.maxPriority ?? 10

    // Build a single `arguments` object so x-max-priority, dead-letter args
    // and caller-supplied options.arguments all coexist. Earlier code spread
    // them in three separate steps and accidentally let later spreads wipe
    // the earlier ones; caller options.arguments now win per-key but do not
    // replace sibling keys.
    const mergedArguments: Record<string, unknown> = {
      'x-max-priority': maxPriority
    }
    if (queue.deadLetter) {
      mergedArguments['x-dead-letter-exchange'] = queue.deadLetter.exchange
      mergedArguments['x-dead-letter-routing-key'] = queue.deadLetter.routingKey ?? ''
    }
    const { arguments: callerArguments, ...callerRestOptions } = queue.options ?? {}
    if (callerArguments) {
      Object.assign(mergedArguments, callerArguments)
    }

    const q = await this.channel.assertQueue(
      queue.name || '',
      {
        maxPriority,
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

  async disconnect(): Promise<void> {
    await this.channel?.close()
    await this.connection?.close()
    console.log('[RabbitMQ::Base] disconnect')
  }
}
