import type amqp from 'amqplib'

/**
 * Declarative description of an AMQP exchange. Passed to
 * {@link RabbitMQBase.registerExchange} (called automatically from
 * `Producer.initialize()` / `Consumer.initialize()` for every entry in
 * {@link RabbitMQConfig.exchanges}).
 */
export interface ExchangeParams {
  /** Exchange name. Must match the routing target used in `Producer.publish()`. */
  name: string
  /** Exchange type — see the AMQP 0-9-1 specification for routing semantics. */
  type: 'direct' | 'fanout' | 'topic' | 'headers'
  /** Optional amqplib assertion options (`durable`, `autoDelete`, `internal`, etc.). */
  options?: amqp.Options.AssertExchange
}

/**
 * Declarative description of an AMQP queue plus its bindings and an
 * optional dead-letter destination. Library-injected `x-max-priority`
 * and `x-dead-letter-*` arguments are merged with any caller-supplied
 * `options.arguments` per-key — caller values win on conflict, sibling
 * keys survive.
 */
export interface QueueParams {
  /** Queue name. Omit or pass `''` to let the broker auto-generate one. */
  name?: string
  /** Optional amqplib assertion options (`durable`, `exclusive`, `arguments`, etc.). */
  options?: amqp.Options.AssertQueue
  /**
   * Maximum supported priority for AMQP priority queues. Translated to
   * `x-max-priority` in the queue arguments. AMQP accepts 1..255; values
   * `<= 0` are treated as "opt out of priority" and the key is omitted
   * before the assert (the broker rejects `x-max-priority: 0`). Values
   * above 255 are not clamped by this library — the broker will reject
   * the assert. RabbitMQ's own guidance is to stay in the 1..10 range.
   * @default 10
   */
  maxPriority?: number
  /** Exchange-to-queue bindings created together with the queue. */
  bindings: {
    /** Source exchange name. */
    exchange: string
    /** Routing key for `direct` / `topic` exchanges. Empty string when binding to a `fanout`. */
    routingKey?: string
    /** Header match arguments for `headers` exchanges. */
    headers?: Record<string, unknown>
  }[]
  /**
   * Dead-letter destination — translated to `x-dead-letter-exchange` and
   * `x-dead-letter-routing-key` queue arguments. The library merges these
   * with `maxPriority` and any caller-supplied `options.arguments` into
   * one arguments object.
   */
  deadLetter?: {
    exchange: string
    routingKey?: string
  }
}

/**
 * The full configuration object accepted by `RabbitMQProducer` and
 * `RabbitMQConsumer`. One config describes the topology end-to-end;
 * `initialize()` asserts exchanges + queues + bindings against the
 * broker.
 */
export interface RabbitMQConfig {
  /** AMQP connection settings. Prefer `amqps://` outside localhost. */
  connection: {
    /**
     * Connection URL — `amqp://` or `amqps://` (TLS). Keep credentials
     * in environment variables, not in source-controlled config.
     */
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
  /** Exchanges to assert at `initialize()` time. */
  exchanges: ExchangeParams[]
  /** Queues to assert at `initialize()` time (consumer side). */
  queues: QueueParams[]
  /** Channel-level options applied at `connect()` time. */
  channel?: {
    /** Consumer prefetch: max unacked deliveries per channel. @default 1 */
    prefetchCount?: number
  }
  /**
   * Optional logger receiver. Defaults to a thin `console.*` wrapper
   * (see `src/logger.ts: defaultLogger`). Pass `pino`, `consola`,
   * the `@bitrix24/b24jssdk` logger, or any object satisfying the
   * {@link Logger} interface to route diagnostics through your own
   * stack.
   *
   * Credentials in connection URLs are scrubbed by THIS LIBRARY
   * before they reach the logger — but only for messages emitted by
   * this library. If your logger implementation also receives errors
   * from your own code paths (e.g. forwards to an error-reporter),
   * sanitize URL credentials there too.
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
  /** Verbose-level diagnostic; emitted on hot paths if the implementation honours debug. */
  debug(message: string, ...args: unknown[]): void
  /** Informational diagnostic — lifecycle transitions, successful connects, etc. */
  info(message: string, ...args: unknown[]): void
  /** Recoverable anomaly — e.g. a reconnect attempt that failed but will be retried. */
  warn(message: string, ...args: unknown[]): void
  /** Unrecoverable or noteworthy failure — connect errors, reconnect exhaustion, parse errors. */
  error(message: string, ...args: unknown[]): void
}

/**
 * Loose convenience shape for application messages. The library itself
 * does NOT enforce this — `Consumer.registerHandler<T>` lets callers
 * supply their own narrower type. Provided for users who want a
 * starting point; recommend defining your own typed payload instead of
 * relying on the open index signature.
 */
export interface Message {
  routingKey: string
  date: string
  entityTypeId?: number
  entityId?: number
  retryCount?: number
  additionalData?: Record<string, unknown>
  /** Open index signature: extra fields are typed `unknown` and must be narrowed at access. */
  [key: string]: unknown
}

/**
 * Publish options. Extends `amqplib`'s `Options.Publish` (correlationId,
 * replyTo, messageId, persistent, expiration, etc. — see amqplib types)
 * and pins a sensible default priority.
 */
export interface MessageOptions extends amqp.Options.Publish {
  /**
   * Message priority for AMQP priority queues. Valid range 0..255 per
   * the AMQP spec; values above `QueueParams.maxPriority` are capped by
   * the broker. On a non-priority queue (no `x-max-priority` argument)
   * the broker accepts but ignores this field.
   * @default 5
   */
  priority?: number
  /** Custom AMQP headers (routing for `headers` exchanges; arbitrary metadata otherwise). */
  headers?: Record<string, unknown>
}

/**
 * Async handler for a single delivery. Receives the parsed JSON payload
 * plus terminal `ack` / `nack` callbacks. AMQP message properties
 * (correlationId, headers, replyTo, …) are NOT currently surfaced —
 * embed them in the body if you need them.
 *
 * `nack` always sends `requeue=false` so the message routes through any
 * configured dead-letter exchange. To replay, publish a fresh copy
 * (see `examples/02-retry-dlq`).
 *
 * The library does NOT validate payloads at runtime; the `T = unknown`
 * default forces TypeScript callers to narrow before access, but
 * provides no JS-level guarantee. For untrusted payloads, validate the
 * shape (zod / valibot / hand-rolled type guard) inside the handler
 * before acting on fields.
 *
 * @typeParam T the shape of the parsed message body.
 */
export type MessageHandler<T = unknown> = (
  msg: T,
  ack: () => void,
  nack: () => void
) => Promise<void>
