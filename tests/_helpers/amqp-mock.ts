import { vi } from 'vitest'
import type { Mock } from 'vitest'

export type { Mock } from 'vitest'

/**
 * Minimal fake of an `amqplib` channel. Every method returns a sensible
 * default; tests override only what they assert on.
 */
export interface FakeChannel {
  assertExchange: Mock
  assertQueue: Mock
  bindQueue: Mock
  prefetch: Mock
  publish: Mock
  consume: Mock
  cancel: Mock
  ack: Mock
  nack: Mock
  ackAll: Mock
  nackAll: Mock
  close: Mock
}

export function makeFakeChannel(): FakeChannel {
  return {
    // Echo the requested exchange name back so tests can assert on it.
    assertExchange: vi.fn(async (name: string) => ({ exchange: name })),
    // assertQueue echoes the requested name back, or invents one when omitted.
    assertQueue: vi.fn(async (name: string) => ({
      queue: name && name.length > 0 ? name : 'auto.generated',
      messageCount: 0,
      consumerCount: 0
    })),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockReturnValue(true),
    consume: vi.fn().mockResolvedValue({ consumerTag: 'tag' }),
    cancel: vi.fn().mockResolvedValue({}),
    ack: vi.fn(),
    nack: vi.fn(),
    ackAll: vi.fn(),
    nackAll: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

/**
 * Minimal fake of an `amqplib` ChannelModel (the value returned by
 * `amqp.connect()`). Carries the channel it will hand out plus the
 * `close` event listeners the consumer attaches.
 */
export interface FakeConnection {
  createChannel: Mock
  on: Mock
  close: Mock
  /** Trigger the registered 'close' listener — used to characterise reconnect. */
  emitClose: () => void
}

export function makeFakeConnection(channel: FakeChannel = makeFakeChannel()): {
  connection: FakeConnection
  channel: FakeChannel
} {
  const listeners = new Map<string, (() => void)[]>()
  const connection: FakeConnection = {
    createChannel: vi.fn().mockResolvedValue(channel),
    on: vi.fn((event: string, cb: () => void) => {
      const arr = listeners.get(event) ?? []
      arr.push(cb)
      listeners.set(event, arr)
    }),
    close: vi.fn().mockResolvedValue(undefined),
    emitClose: () => {
      for (const cb of listeners.get('close') ?? []) cb()
    }
  }
  return { connection, channel }
}

/**
 * Convenience helper: extracts the delivery callback registered by
 * `channel.consume(queueName, callback)`. Returns the callback from the
 * first matching call.
 */
export function getConsumeCallback(
  channel: FakeChannel,
  queueName: string
): (msg: unknown) => Promise<void> {
  const call = channel.consume.mock.calls.find(([name]) => name === queueName)
  if (!call) throw new Error(`channel.consume was not called with queue "${queueName}"`)
  return call[1] as (msg: unknown) => Promise<void>
}

