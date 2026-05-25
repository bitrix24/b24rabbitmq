import type { Logger } from './types'

/**
 * Default `Logger` implementation: a thin wrapper over `console.*`.
 *
 * Picked when `RabbitMQConfig.logger` is not supplied — preserves the
 * out-of-the-box behaviour of earlier versions where this library
 * wrote diagnostics straight to the process's stdout/stderr.
 *
 * Consumers who want silence pass a noop logger explicitly; consumers
 * who want structured logging pass `pino`, `consola`, the
 * `@bitrix24/b24jssdk` logger, or any object that satisfies the
 * {@link Logger} interface.
 */
export const defaultLogger: Logger = {
  debug: (message: string, ...args: unknown[]) => { console.debug(message, ...args) },
  info: (message: string, ...args: unknown[]) => { console.log(message, ...args) },
  warn: (message: string, ...args: unknown[]) => { console.warn(message, ...args) },
  error: (message: string, ...args: unknown[]) => { console.error(message, ...args) }
}

/**
 * Regex matching `amqp://user:pass@host` and `amqps://user:pass@host`.
 * Used to scrub credentials before they reach the logger — applies to
 * the AMQP connection URL itself and to any string that may quote it
 * (e.g. an amqplib error message that includes the failing URL).
 */
const URL_CREDENTIAL_REGEX = /(amqps?:\/\/)([^:@]+):([^@]+)@/g

/** Replace `amqp://user:pass@host` with `amqp://***:***@host`. */
export function sanitizeUrl(url: string): string {
  return url.replace(URL_CREDENTIAL_REGEX, '$1***:***@')
}

/**
 * Pull a loggable message out of an unknown thrown value and scrub any
 * credentials before returning. Use whenever a caught error is fed to
 * the logger.
 */
export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(URL_CREDENTIAL_REGEX, '$1***:***@')
}
