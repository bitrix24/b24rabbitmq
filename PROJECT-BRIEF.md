# @bitrix24/b24rabbitmq — Project Brief

> **Status**: reanimation, pre-v0.1. This document is the source of truth for what the library is and where it is going. Shipped code lives on `main`; work branches off `fix/*`, `feat/*` or `claude/*`.

## Goal

A small, dependency-light TypeScript library that wraps [`amqplib`](https://github.com/amqp-node/amqplib) with opinionated, config-driven `Producer`, `Consumer` and `RPC` primitives for integrating **Bitrix24** applications with **RabbitMQ**. Declare exchanges, queues and bindings once in a config object; get reconnect, dead-letter and priority handling for free. Ship ESM, keep the public surface minimal, grow incrementally.

## Project coordinates

- **Repository**: https://github.com/bitrix24/b24rabbitmq
- **Package**: `@bitrix24/b24rabbitmq` (npm, public, MIT)
- **Module format**: ESM only (built with `unbuild`)
- **Peer dependency**: `amqplib` ^0.10
- **Reference architecture / process**: [`bitrix24/templates-mcp`](https://github.com/bitrix24/templates-mcp) — we mirror its CI, commitlint, renovate and test discipline (but not its Nuxt runtime; this is a plain library). The `skills/` directory there is MCP-agent-specific and is intentionally not used here.

## Technology stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js ^20 \|\| >=22 | Native `fetch`, ESM, BigInt for uuidv7 |
| Language | TypeScript 5.x (strict) | Type safety, declaration output |
| Broker client | `amqplib` ^0.10 (peer) | De-facto Node AMQP 0-9-1 client |
| Build | `unbuild` (rollup + esbuild) | ESM + `.d.mts`, banner injection |
| Lint | `eslint-config-unjs` | Matches Bitrix24 OSS conventions |
| Tests | `vitest` | Fast, ESM-native |
| Logging | `@bitrix24/b24jssdk` logger | Runtime dependency; will replace stray `console.*` |
| Docs i18n | AI-agent skill (see #3) | EN → RU markdown translation, no LLM SDK dependency |

## Public API

```
src/
├── index.ts      # barrel: re-exports everything below
├── types.ts      # RabbitMQConfig, ExchangeParams, QueueParams, Message, MessageOptions, MessageHandler
├── base.ts       # RabbitMQBase: connect (abstract), setup/register exchanges & queues, disconnect
├── producer.ts   # RabbitMQProducer: initialize, connect, publish
├── consumer.ts   # RabbitMQConsumer: initialize, connect + reconnect, registerHandler, consume
├── rpc.ts        # RabbitRPC: request/reply over a producer + consumer pair
└── tools/
    └── uuidv7.ts  # internal: dependency-free UUIDv7 generator for RPC correlation ids (not part of the public exports)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the runtime model.

## Roadmap

### Phase 0 — Reanimation (current)

- ✅ **Process foundation**: PR CI (lint + typecheck + test + build), commitlint, vitest scaffold, renovate, issue/PR templates, this brief.
- ☐ **Characterization tests** locking current behaviour of `base`/`producer`/`consumer`/`rpc` before refactor.

### Phase 1 — Correctness refactor

Known defects to fix (with regression tests first):

1. **`rpc.ts` does not work.** `call()` registers a reply queue + handler but never calls `consumer.consume(replyQueue)`, so replies are never delivered. The handler also compares `msg.correlationId`, but `consumer.consume` only parses message **content** (JSON body) and drops AMQP `properties`, so the correlation id is unavailable. Decide on a transport for the correlation id (body field vs. AMQP `properties.correlationId` surfaced to the handler) and wire consumption.
2. **`consumer.ts` reconnect is unsafe.** `throw` inside the `setTimeout` callback crashes the process; `this.connect()` is called without `await`, so failures are swallowed. Replace with an awaited, bounded backoff loop and re-establish handlers/consumers after reconnect.
3. **`producer.ts` has no reconnect** and calls `channel.prefetch` (meaningless on a publish channel). Consider publisher confirms for `publish()`’s boolean return to be trustworthy. The "exchange not registered" guard is commented out — decide keep or drop.
4. **`base.ts registerQueue`** — the `deadLetter` branch overwrites `arguments`, dropping `x-max-priority` (`// @todo fix this`). Merge arguments instead of replacing.
5. **Logging** — replace stray `console.log`/`console.error` with the `@bitrix24/b24jssdk` logger (runtime dependency, added for this purpose).

### Phase 2 — Capabilities (after correctness)

- Confirm channels / publisher confirms option
- Optional graceful shutdown helpers
- PHP consumer/producer template (README promises "PHP support soon")
- Expand `docs/` (terms, demos) and finish the translated RU docs

## Non-functional requirements

- **License**: MIT
- **Module**: ESM only; no CommonJS unless a consumer needs it
- **Dependencies**: keep runtime deps minimal (`@bitrix24/b24jssdk` for logging; `amqplib` is a peer)
- **Tests**: every behavioural change ships with a vitest test; broker-touching logic uses a mocked `amqplib` channel
- **Commits**: Conventional Commits, enforced by commitlint in CI
- **Secrets**: never committed
- **Docs**: English in `docs/en`, translated to `docs/ru` by an AI-agent skill (see #3)
