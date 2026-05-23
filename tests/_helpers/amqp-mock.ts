import { vi, type Mock } from 'vitest'

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
  sendToQueue: Mock
  consume: Mock
  ack: Mock
  nack: Mock
  close: Mock
}

export function makeFakeChannel(): FakeChannel {
  return {
    assertExchange: vi.fn().mockResolvedValue({ exchange: 'x' }),
    // assertQueue echoes the requested name back, or invents one when omitted.
    assertQueue: vi.fn(async (name: string) => ({
      queue: name && name.length > 0 ? name : 'auto.generated',
      messageCount: 0,
      consumerCount: 0
    })),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockReturnValue(true),
    sendToQueue: vi.fn().mockReturnValue(true),
    consume: vi.fn().mockResolvedValue({ consumerTag: 'tag' }),
    ack: vi.fn(),
    nack: vi.fn(),
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
