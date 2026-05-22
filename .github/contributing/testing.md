# Testing

Tests run on [vitest](https://vitest.dev). The goal is fast, deterministic unit tests that never touch a real RabbitMQ broker.

## File location

- Specs live in `tests/` and are named `*.test.ts`.
- Mirror the source path where it helps, e.g. a test for `src/producer.ts` → `tests/producer.test.ts`.
- Shared mocks/helpers go in `tests/_helpers/`.

## Running tests

```bash
pnpm test                                   # whole suite, once
pnpm test producer                          # only files matching "producer"
pnpm exec vitest run tests/uuidv7.test.ts -t "encodes the current time"  # single test by name
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

```typescript
import { vi } from 'vitest'

export function makeFakeChannel() {
  return {
    assertExchange: vi.fn().mockResolvedValue({}),
    assertQueue: vi.fn().mockResolvedValue({ queue: 'q' }),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockReturnValue(true),
    sendToQueue: vi.fn().mockReturnValue(true),
    consume: vi.fn().mockResolvedValue({ consumerTag: 't' }),
    deleteQueue: vi.fn().mockResolvedValue({ messageCount: 0 }),
    ack: vi.fn(),
    nack: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

export function makeFakeConnection(channel = makeFakeChannel()) {
  return {
    createChannel: vi.fn().mockResolvedValue(channel),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

// In the test file:
vi.mock('amqplib', () => ({
  default: { connect: vi.fn() }
}))
```

Then assert against the spies — e.g. that `registerQueue` passed `x-max-priority` / `x-dead-letter-*` in `assertQueue`'s `arguments`, that `publish` serialised the payload to a `Buffer` with the right `priority`, or that `consume` acked on success and nacked on a thrown handler.

## Time-dependent code

Anything that reads the clock or schedules timers (`uuidv7`, consumer reconnect backoff) must be tested with fake timers — never with real `setTimeout` or wall-clock comparisons:

```typescript
vi.useFakeTimers()
vi.setSystemTime(1_700_000_000_000)
// ... generate values, advance time with vi.advanceTimersByTimeAsync(ms)
```

For ordering assertions on UUIDv7, compare the full 48-bit time prefix (first 12 hex chars), not a shorter slice, and assert strict ordering only when time actually advances.

## Characterization tests

When fixing a [known defect](../../PROJECT-BRIEF.md), first add a test that captures the **current** behaviour, watch it pass, then change the code and update the test to assert the **fixed** behaviour in the same PR. This makes the behavioural change explicit in review.
