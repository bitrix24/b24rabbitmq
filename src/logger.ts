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
  info: (message: string, ...args: unknown[]) => { console.info(message, ...args) },
  warn: (message: string, ...args: unknown[]) => { console.warn(message, ...args) },
  error: (message: string, ...args: unknown[]) => { console.error(message, ...args) }
}

/**
 * Regex matching `amqp://user:pass@host` and `amqps://user:pass@host`.
 * Used by {@link sanitizeUrl} via `String.prototype.replace`, which resets
 * `lastIndex` per call — safe to share at module scope. Do NOT call
 * `.test()` / `.exec()` on it directly; the `g` flag would carry state.
 */
const URL_CREDENTIAL_WITH_PASSWORD = /(amqps?:\/\/)([^:@]+):([^@]+)@/g

/**
 * Regex matching `amqp://user@host` (username only, no password). Run
 * AFTER the with-password sweep so an already-scrubbed URL is not
 * matched again.
 */
const URL_CREDENTIAL_USER_ONLY = /(amqps?:\/\/)([^:@/]+)@/g

/**
 * Replace `amqp://user:pass@host` and `amqp://user@host` with
 * `amqp://***:***@host` and `amqp://***@host`. Limitation: malformed
 * URLs with multiple literal `@` signs only have the first segment
 * scrubbed (RFC 3986 valid URLs never have unencoded `@` after the
 * authority).
 *
 * @param url any string that may contain an AMQP connection URL.
 * @returns the same string with credentials masked.
 */
export function sanitizeUrl(url: string): string {
  return url
    .replace(URL_CREDENTIAL_WITH_PASSWORD, '$1***:***@')
    .replace(URL_CREDENTIAL_USER_ONLY, '$1***@')
}

/**
 * Pull a loggable message out of an unknown thrown value and scrub any
 * credentials before returning. Use whenever a caught error is fed to
 * the logger.
 *
 * Note: only `error.message` is processed. `error.cause` chains and
 * any structured fields are NOT walked — if a future call site logs
 * the full Error object, it must sanitize separately.
 *
 * @param error any thrown value (Error, string, primitive, object).
 * @returns a scrubbed string suitable for the logger.
 */
export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return sanitizeUrl(raw)
}
