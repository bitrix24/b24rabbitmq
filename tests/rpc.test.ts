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
  })

  it('asserts the reply queue and publishes the request with correlationId + replyTo', async () => {
    const producer = new RabbitMQProducer(config)
    const consumer = new RabbitMQConsumer(config)
    await producer.initialize()
    await consumer.initialize()

    const rpc = new RabbitRPC(producer, consumer)
    // Fire and forget — we only inspect the side effects, not the resolution.
    void rpc.call('rpc.ex', 'rk', { hello: 1 }, 50).catch(() => { /* timeout expected */ })
    // Let the synchronous setup inside call() flush.
    await new Promise(resolve => setTimeout(resolve, 10))

    // Reply queue was asserted on the consumer side with an "rps-" prefix
    // (sic — the source uses `rps-` instead of `rpc-`; Phase 1 #1 will decide).
    const replyAssert = consumerChannel.assertQueue.mock.calls.find(
      ([name]) => typeof name === 'string' && name.startsWith('rps-')
    )
    expect(replyAssert, 'reply queue should be asserted').toBeTruthy()
    const replyOpts = replyAssert?.[1] as Record<string, unknown>
    expect(replyOpts['exclusive']).toBe(true)

    // The producer published the request with correlationId + replyTo set.
    const publishCall = producerChannel.publish.mock.calls.find(
      ([ex]) => ex === 'rpc.ex'
    ) as [string, string, Buffer, Record<string, unknown>] | undefined
    expect(publishCall, 'producer should publish to rpc.ex').toBeTruthy()
    expect(publishCall![3]['correlationId']).toMatch(/^[0-9a-f-]{36}$/)
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
    void rpc.call('rpc.ex', 'rk', { hello: 1 }, 50).catch(() => { /* timeout expected */ })
    await new Promise(resolve => setTimeout(resolve, 10))

    const replyConsume = consumerChannel.consume.mock.calls.find(
      ([name]) => typeof name === 'string' && name.startsWith('rps-')
    )
    expect(replyConsume, 'reply queue is never consumed — this is the defect').toBeUndefined()
  })

  /**
   * Defect #2 (related; characterised in consumer.test.ts):
   *   Even if consume() were called, the consumer's callback hands the
   *   handler only the parsed JSON body, so `msg.correlationId` is
   *   always undefined and the equality check inside RabbitRPC.call()
   *   would never succeed. Confirmed here by the end-to-end observation
   *   that the call rejects on timeout.
   */
  it('rejects with a timeout because no reply path exists', async () => {
    const producer = new RabbitMQProducer(config)
    const consumer = new RabbitMQConsumer(config)
    await producer.initialize()
    await consumer.initialize()

    const rpc = new RabbitRPC(producer, consumer)
    await expect(
      rpc.call('rpc.ex', 'rk', { hello: 1 }, 30)
    ).rejects.toThrow('[RabbitRPC] timeout')
  })
})
