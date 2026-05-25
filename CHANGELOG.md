# Changelog

## Unreleased

### Added

* **Logger DI.** `RabbitMQConfig.logger` (optional) accepts any object satisfying the new exported `Logger` interface (`{ debug, info, warn, error }`, all required, shape-compatible with `console`, `pino`, `consola`, and the `@bitrix24/b24jssdk` logger). Default is a thin `console.*` wrapper — out-of-the-box behaviour is unchanged. Every diagnostic in `src/base.ts`, `src/producer.ts`, `src/consumer.ts` routes through the injected logger; the only `console.*` calls left in `src/` live inside the new `src/logger.ts` as the default adapter. New `sanitizeUrl` / `safeErrorMessage` helpers (also in `src/logger.ts`) scrub `amqp[s]://user:pass@host` credentials before any error message reaches the logger — applied wherever a caught error is fed to the log. (#15)

### Changed

* **consumer:** reconnect is now bounded and safe. The old `handleReconnect` synchronously threw on max-retries-exceeded — an uncatchable crash path from the `'close'` event listener — and fired `this.connect()` inside `setTimeout` without awaiting it. New behaviour: an awaitable async loop with a `reconnectInProgress` guard against concurrent reconnects; sleeps `reconnectInterval` between attempts (`maxRetries: 0` disables reconnect entirely with a distinct log message); on success re-asserts the topology and re-subscribes every queue that had an active `consume()`; on exhaustion logs and returns instead of throwing. `connect()` no longer special-cases ENOTFOUND/ECONNREFUSED — all errors propagate; reconnect is driven solely by the `'close'` event. `RabbitMQConsumer.disconnect()` now clears the reconnect-tracking state so an instance can be safely re-`initialize()`d; `unRegisterHandler()` also drops the queue from the re-subscribe set so a future reconnect doesn't restore a dead handler. **Behavioural change** for callers who relied on the old synchronous throw to detect exhaustion: there is no programmatic state-introspection API yet (planned for Track 4); for now, observe the `console.error` log lines `max connection retries (N) exceeded` and `reconnect disabled (maxRetries=0)`, or wrap `initialize()` in your own supervisor retry. (#14)
* **producer:** `channel.prefetch()` is no longer called inside `producer.connect()`. `prefetch` is a consumer-side flow-control setting; calling it on a publish channel was a no-op (plus one wasted broker round-trip per connect). New `connect()` carries a JSDoc note explaining this; `publish()` JSDoc now documents that its boolean return reflects only the client-side write buffer (back-pressure signal), not broker acknowledgment — see Track 4 for publisher confirms. The commented-out "exchange not registered" guard inside `publish()` is removed (lenient behaviour preserved; test pins it). (#13)

### Removed

* **`RabbitRPC` dropped from v0.1 scope.** The class was already unexported from the public barrel (since PR #5) pending verification; the verification confirmed two compounding defects (reply queue never subscribed; AMQP `properties.correlationId` not surfaced to handlers). Fixing them required an architectural change to `MessageHandler` for a primitive that no consumer was using yet — not justified for v0.1. Removed: `src/rpc.ts`, `src/tools/uuidv7.ts` (its only user), and their tests. If request/reply is needed, build it on top of `Producer` + `Consumer` for now; a properties-aware RPC may return in v0.2.

### Bug Fixes

* **base/registerQueue:** merge `x-max-priority`, dead-letter and caller-supplied `options.arguments` into a single `arguments` object passed to `channel.assertQueue`. Two compounding spread defects previously caused (a) the dead-letter pair to be silently dropped when both `maxPriority` and `deadLetter` were set, and (b) caller-supplied `options.arguments` to wholesale-replace the library-injected keys. **Behavioural change** for any consumer that previously combined raw `x-dead-letter-*` keys with `maxPriority`: both now reach the broker (correct), where before only the priority did. The redundant top-level `maxPriority` field is no longer passed, so explicit overrides via `options.arguments['x-max-priority']` now take effect on the wire. `maxPriority: 0` no longer ships an invalid `x-max-priority: 0` (AMQP requires 1–255); the key is omitted. (#10)

## [0.0.4](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.3...v0.0.4) (2025-05-28)

### Fix

* **type/Message:** improve

## [0.0.3](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.2...v0.0.3) (2025-05-08)

### Bug Fixes

* **uuidv7:** improve

## [0.0.2](https://github.com/bitrix24/b24rabbitmq/compare/v0.0.1...v0.0.2) (2025-05-07)

### Bug Fixes

* **uuidv7:** improve

## 0.0.1

### Chore

* **Initial commit**
