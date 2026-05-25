import type amqp from 'amqplib'

export interface ExchangeParams {
  name: string
  type: 'direct' | 'fanout' | 'topic' | 'headers'
  options?: amqp.Options.AssertExchange
}

export interface QueueParams {
  name?: string
  options?: amqp.Options.AssertQueue
  /**
   * Maximum supported priority
   * @default 10
   */
  maxPriority?: number
  bindings: {
    exchange: string
    routingKey?: string
    headers?: Record<string, any>
  }[]
  deadLetter?: {
    exchange: string
    routingKey?: string
  }
}

export interface RabbitMQConfig {
  connection: {
    url: string
    /**
     * Milliseconds to wait between consumer reconnect attempts.
     * `0` is technically valid (retry as fast as the event loop allows)
     * but not recommended — use the default unless you have a reason.
     * @default 5000
     */
    reconnectInterval?: number
    /**
     * Maximum number of consumer reconnect attempts after a connection
     * drop. Set to `0` to disable reconnect entirely (the consumer will
     * give up on the first `'close'` event).
     * @default 5
     */
    maxRetries?: number
  }
  exchanges: ExchangeParams[]
  queues: QueueParams[]
  channel?: {
    // Limit of unconfirmed messages (1)
    prefetchCount?: number
  }
  /**
   * Optional logger receiver. Defaults to a thin `console.*` wrapper
   * (see `src/logger.ts: defaultLogger`). Pass `pino`, `consola`,
   * the `@bitrix24/b24jssdk` logger, or any object satisfying the
   * {@link Logger} interface to route diagnostics through your own
   * stack. Credentials in connection URLs are scrubbed before they
   * reach the logger.
   */
  logger?: Logger
}

/**
 * Minimal logger interface the library calls into. Compatible by shape
 * with `console`, `pino`, `consola`, and the `@bitrix24/b24jssdk`
 * logger. All four levels are required so call sites stay simple;
 * implementations that don't care about a level can supply a noop.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface Message {
  routingKey: string
  date: string
  entityTypeId?: number
  entityId?: number
  retryCount?: number
  additionalData?: Record<string, any>
  [key: string]: any
}

export interface MessageOptions extends amqp.Options.Publish {
  /**
   * Message priority
   * @min:0
   * @max:10
   *
   * @default 5
   */
  priority?: number
  headers?: Record<string, any>
  [key: string]: any
}

export type MessageHandler<T = any> = (
  msg: T,
  ack: () => void,
  nack: () => void
) => Promise<void>
