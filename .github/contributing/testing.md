# Testing

> _Last reviewed: 2026-05-25._

Tests run on [vitest](https://vitest.dev). The goal is fast, deterministic unit tests that never touch a real RabbitMQ broker.

## File location

- Specs live in `tests/` and are named `*.test.ts`.
- Mirror the source path where it helps, e.g. a test for `src/producer.ts` → `tests/producer.test.ts`.
- Shared mocks/helpers go in `tests/_helpers/`.

## Running tests

```bash
pnpm test                                   # whole suite, once
pnpm test producer                          # only files matching "producer"
pnpm exec vitest run tests/consumer.test.ts -t "passes ONLY the parsed JSON body"  # single test by name
pnpm test:watch                             # watch mode
pnpm test:coverage                          # v8 coverage report (text + html + lcov)
```

Coverage is collected from `src/**` only (see `vitest.config.ts`).

## Basic test structure

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('subject', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does the thing with input X', () => {
    expect(true).toBe(true)
  })
})
```

Use descriptive `it` names that state the scenario ("with dead-letter set", "when the broker drops the connection") rather than restating the method name.

## Mocking `amqplib`

The library only talks to RabbitMQ through an `amqplib` channel/connection. Unit tests must mock that boundary — no live broker, no network.

**Use the shared factory** at [`tests/_helpers/amqp-mock.ts`](../../tests/_helpers/amqp-mock.ts) — do not inline ad-hoc mocks. It exports:

- `makeFakeChannel()` — every method on a `Channel` that `src/` touches (`assertExchange`, `assertQueue`, `bindQueue`, `prefetch`, `publish`, `consume`, `cancel`, `ack`, `nack`, `ackAll`, `nackAll`, `close`). `assertExchange` and `assertQueue` echo the requested name back so assertions are precise.
- `makeFakeConnection(channel?)` — returns `{ connection, channel }`. The connection has `createChannel`, `on`, `close`, and an `emitClose()` helper that fires the registered `'close'` listener (used for reconnect characterisation).
- `getConsumeCallback(channel, queueName)` — extracts the delivery callback the consumer registered, so tests can simulate broker deliveries.

Typical wiring in a test file:

```typescript
import { vi } from 'vitest'
import amqp from 'amqplib'
import { makeFakeConnection } from './_helpers/amqp-mock'

vi.mock('amqplib', () => ({ default: { connect: vi.fn() } }))

const { connection, channel } = makeFakeConnection()
vi.mocked(amqp.connect).mockResolvedValue(connection as unknown as Awaited<ReturnType<typeof amqp.connect>>)
```

Then assert against the spies — e.g. that `registerQueue` passed `x-max-priority` / `x-dead-letter-*` in `assertQueue`'s `arguments`, that `publish` serialised the payload to a `Buffer` with the right `priority`, or that `consume` acked on success and nacked on a thrown handler.

For full worked examples see `tests/base.test.ts`, `tests/consumer.test.ts` and `tests/producer.test.ts`.

## Time-dependent code

Anything that reads the clock or schedules timers (consumer reconnect backoff, future RPC-style features) must be tested with fake timers — never with real `setTimeout` or wall-clock comparisons:

```typescript
vi.useFakeTimers()
vi.setSystemTime(1_700_000_000_000)
// ... generate values, advance time with vi.advanceTimersByTimeAsync(ms)
```

## Characterization tests

When fixing a [known defect](../../PROJECT-BRIEF.md), first add a test that captures the **current** behaviour, watch it pass, then change the code and update the test to assert the **fixed** behaviour in the same PR. This makes the behavioural change explicit in review.

The Phase 0 characterisation suite (`tests/base.test.ts`, `tests/producer.test.ts`, `tests/consumer.test.ts`) is the baseline — most Phase 1 fixes flip one or more of those tests from "asserts the defect" to "asserts the fix" (Phase 1 #3 flipped two).
