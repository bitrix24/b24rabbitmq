# Architecture

> _Last reviewed: 2026-05-26._

`@bitrix24/b24rabbitmq` is a thin, config-driven layer over [`amqplib`](https://github.com/amqp-node/amqplib). One `RabbitMQConfig` object describes the topology (connection, exchanges, queues, bindings); the `Producer` and `Consumer` classes turn that config into live AMQP resources.

## Class model

```
          RabbitMQBase (abstract)
          ├─ config: RabbitMQConfig
          ├─ connection / channel        (amqplib)
          ├─ connect()                   ← throws unless overridden
          ├─ setupExchanges()/registerExchange()
          ├─ setupQueues()/registerQueue()   (priority + dead-letter args)
          └─ disconnect()
               ▲                      ▲
               │                      │
     RabbitMQProducer          RabbitMQConsumer
     ├─ initialize()           ├─ initialize()
     ├─ connect()              ├─ connect() + handleReconnect()
     └─ publish()              ├─ registerHandler()/unRegisterHandler()
                               └─ consume()
```

## Configuration

`RabbitMQConfig` (`src/types.ts`):

- `connection` — `url`, `reconnectInterval` (default 5000ms), `maxRetries` (default 5)
- `exchanges[]` — `name`, `type` (`direct`/`fanout`/`topic`/`headers`), `options`
- `queues[]` — `name`, `options`, `maxPriority` (default 10 → `x-max-priority`), `bindings[]` (exchange + routingKey or headers), optional `deadLetter` (exchange + routingKey → `x-dead-letter-*`)
- `channel.prefetchCount` — unacked-message limit (default 1)

## Lifecycle

**Producer**: `initialize()` → `connect()` (open connection + channel) → `setupExchanges()`. Then `publish(exchange, routingKey, message, options)` serialises the payload to JSON and publishes with a default `priority: 5`.

**Consumer**: `initialize()` → `connect()` → `setupExchanges()` → `setupQueues()`. Register a per-queue async handler with `registerHandler(queue, handler)`, then `consume(queue)`. The handler receives `(parsedContent, ack, nack)`; on a thrown error the message is `nack`ed without requeue (dead-letter territory).

## Build & distribution

`unbuild` (`build.config.ts`) emits ESM only into `dist/esm` with `.d.mts` declarations and a license/version banner. `__SDK_VERSION__` / `__SDK_USER_AGENT__` are replaced at build time. Package `exports` point `import` at `dist/esm/index.mjs` and `types` at `dist/esm/index.d.mts`.

## Known limitations

Tracked in [`PROJECT-BRIEF.md`](../PROJECT-BRIEF.md) under **Track 1 — Phase 1**.
