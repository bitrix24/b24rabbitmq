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
 * Walks the `error.cause` chain (as set by `new Error(msg, { cause })`,
 * which amqplib and our own `connect()` wrappers use) so credentials
 * hidden in a nested cause are scrubbed too, not just the top-level
 * `message`. The walk is bounded and cycle-safe.
 *
 * @param error any thrown value (Error, string, primitive, object).
 * @returns a scrubbed string suitable for the logger.
 */
export function safeErrorMessage(error: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  // Bound the walk: cycle guard via `seen`, plus a hard depth cap as a
  // belt-and-suspenders backstop against pathological chains.
  for (let depth = 0; depth < 10 && current != null && !seen.has(current); depth++) {
    seen.add(current)
    if (current instanceof Error) {
      parts.push(current.message)
      current = current.cause
    } else {
      parts.push(String(current))
      break
    }
  }

  if (parts.length === 0) {
    parts.push(String(error))
  }

  return sanitizeUrl(parts.join(': '))
}
