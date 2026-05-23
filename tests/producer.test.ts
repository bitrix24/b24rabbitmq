import { describe, it, expect, beforeEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQProducer } from '../src/producer'
import type { RabbitMQConfig } from '../src/types'
import { makeFakeConnection, type FakeChannel } from './_helpers/amqp-mock'

vi.mock('amqplib', () => ({
  default: { connect: vi.fn() }
}))

const config: RabbitMQConfig = {
  connection: { url: 'amqp://localhost' },
  exchanges: [
    { name: 'events.v1', type: 'direct', options: { durable: true } }
  ],
  queues: []
}

describe('RabbitMQProducer', () => {
  let channel: FakeChannel

  beforeEach(() => {
    const fakes = makeFakeConnection()
    channel = fakes.channel
    vi.mocked(amqp.connect).mockReset()
    vi.mocked(amqp.connect).mockResolvedValue(fakes.connection as unknown as Awaited<ReturnType<typeof amqp.connect>>)
  })

  describe('initialize()', () => {
    it('connects, creates a channel, sets prefetch, then declares the exchanges', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()

      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost')
      expect(channel.prefetch).toHaveBeenCalledWith(1)
      expect(channel.assertExchange).toHaveBeenCalledWith(
        'events.v1',
        'direct',
        { durable: true }
      )
    })

    /**
     * Characterisation of PROJECT-BRIEF Track 1 #4: prefetch is meaningful
     * only for consumer channels. The producer currently still calls it.
     * Locked here so the Phase 1 fix removes it intentionally.
     */
    it('CURRENTLY calls channel.prefetch() on the publish channel (defect lock)', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()
      expect(channel.prefetch).toHaveBeenCalled()
    })

    it('rethrows the original error if amqp.connect fails', async () => {
      vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('boom'))
      const producer = new RabbitMQProducer(config)
      await expect(producer.initialize()).rejects.toThrow('boom')
    })
  })

  describe('publish()', () => {
    it('JSON-serialises the payload into a Buffer and applies the default priority of 5', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()

      const ok = await producer.publish('events.v1', 'event.succeeded', { hello: 1 })
      expect(ok).toBe(true)

      const [exchange, routingKey, body, options] = channel.publish.mock.calls[0] as [
        string, string, Buffer, Record<string, unknown>
      ]
      expect(exchange).toBe('events.v1')
      expect(routingKey).toBe('event.succeeded')
      expect(Buffer.isBuffer(body)).toBe(true)
      expect(JSON.parse(body.toString())).toEqual({ hello: 1 })
      expect(options['priority']).toBe(5)
    })

    it('lets callers override the default priority and add extra options', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()
      await producer.publish('events.v1', 'rk', { x: 1 }, { priority: 9, persistent: true, correlationId: 'cid' })
      const options = channel.publish.mock.calls[0]?.[3] as Record<string, unknown>
      expect(options['priority']).toBe(9)
      expect(options['persistent']).toBe(true)
      expect(options['correlationId']).toBe('cid')
    })

    /**
     * The "exchange not registered" guard in publish() is commented out in
     * src/producer.ts. Lock the lenient behaviour so a future re-enabling is
     * intentional, not accidental.
     */
    it('does NOT throw when publishing to an exchange that was never registered (guard is disabled)', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()
      await expect(
        producer.publish('never.registered.v1', 'rk', { x: 1 })
      ).resolves.toBe(true)
    })
  })
})
