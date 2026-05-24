# Changelog

## Unreleased

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
