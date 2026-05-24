import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQProducer } from '../src/producer'
import { RabbitMQConsumer } from '../src/consumer'
import { RabbitRPC } from '../src/rpc'
import type { RabbitMQConfig } from '../src/types'
import { makeFakeChannel, makeFakeConnection, type FakeChannel } from './_helpers/amqp-mock'

vi.mock('amqplib', () => ({
  default: { connect: vi.fn() }
}))

const config: RabbitMQConfig = {
  connection: { url: 'amqp://localhost' },
  exchanges: [{ name: 'rpc.ex', type: 'direct' }],
  queues: []
}

/** A UUIDv7 has version nibble 7 (char 14) and variant bits in [8,9,a,b] (char 19). */
const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * This file is the executed counterpart to issue #6. The claim that
 * RabbitRPC is "broken" was inferred from code reading; these tests turn
 * the inference into evidence and lock the exact failure mode so the
 * Phase 1 fix has a baseline to refactor against.
 */
describe('RabbitRPC.call() — verification of issue #6', () => {
  let producerChannel: FakeChannel
  let consumerChannel: FakeChannel

  beforeEach(() => {
    producerChannel = makeFakeChannel()
    consumerChannel = makeFakeChannel()
    const producerConn = makeFakeConnection(producerChannel).connection
    const consumerConn = makeFakeConnection(consumerChannel).connection
    vi.mocked(amqp.connect).mockReset()
    vi.mocked(amqp.connect)
      .mockResolvedValueOnce(producerConn as unknown as Awaited<ReturnType<typeof amqp.connect>>)
      .mockResolvedValueOnce(consumerConn as unknown as Awaited<ReturnType<typeof amqp.connect>>)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('asserts the reply queue, registers a handler on it, and publishes the request with correlationId + replyTo', async () => {
    const producer = new RabbitMQProducer(config)
    const consumer = new RabbitMQConsumer(config)
    await producer.initialize()
    await consumer.initialize()

    // Spy on registerHandler to lock that the handler IS registered (positive assertion).
    const registerHandlerSpy = vi.spyOn(consumer, 'registerHandler')

    const rpc = new RabbitRPC(producer, consumer)
    // Awaiting the rejection drains every microtask inside call() deterministically;
    // no flaky wall-clock sleeps.
    await expect(
      rpc.call('rpc.ex', 'rk', { hello: 1 }, 20)
    ).rejects.toThrow('[RabbitRPC] timeout')

    // Reply queue was asserted on the consumer side with an "rps-" prefix
    // (sic — the source uses `rps-` instead of `rpc-`; Phase 1 #1 will decide).
    const replyAssert = consumerChannel.assertQueue.mock.calls.find(
      ([name]) => typeof name === 'string' && name.startsWith('rps-')
    )
    expect(replyAssert, 'reply queue should be asserted').toBeTruthy()
    const replyOpts = replyAssert?.[1] as Record<string, unknown>
    expect(replyOpts['exclusive']).toBe(true)

    // A handler WAS registered against the reply queue (so the surface looks
    // wired up — the defect is that nothing ever consumes it; locked below).
    expect(registerHandlerSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^rps-/),
      expect.any(Function)
    )

    // The producer published the request with correlationId + replyTo set.
    const publishCall = producerChannel.publish.mock.calls.find(
      ([ex]) => ex === 'rpc.ex'
    ) as [string, string, Buffer, Record<string, unknown>] | undefined
    expect(publishCall, 'producer should publish to rpc.ex').toBeTruthy()
    expect(publishCall![3]['correlationId']).toMatch(UUIDV7_RE)
    expect(publishCall![3]['replyTo']).toMatch(/^rps-/)
  })

  /**
   * Defect #1 (confirmed by this test):
   *   RabbitRPC.call() calls consumer.registerQueue() to assert the reply
   *   queue but NEVER calls consumer.consume() on it. The handler is
   *   registered against the queue name, but without an active
   *   subscription on the channel, no delivery callback will ever fire.
   */
  it('does NOT call channel.consume() on the reply queue — replies cannot arrive', async () => {
    const producer = new RabbitMQProducer(config)
    const consumer = new RabbitMQConsumer(config)
    await producer.initialize()
    await consumer.initialize()

    const rpc = new RabbitRPC(producer, consumer)
    await expect(
      rpc.call('rpc.ex', 'rk', { hello: 1 }, 20)
    ).rejects.toThrow('[RabbitRPC] timeout')

    const replyConsume = consumerChannel.consume.mock.calls.find(
      ([name]) => typeof name === 'string' && name.startsWith('rps-')
    )
    expect(replyConsume, 'reply queue is never consumed — this is the defect').toBeUndefined()
  })

  // Defect #2 (the AMQP-properties surfacing gap that would make the
  // correlationId comparison fail even if the reply queue WERE consumed)
  // is characterised in tests/consumer.test.ts under "passes ONLY the
  // parsed JSON body to the handler". End-to-end timeout behaviour is
  // already asserted by the two tests above; no separate test needed.
})
