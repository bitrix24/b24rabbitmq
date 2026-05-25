import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQProducer } from '../src/producer'
import type { Logger, RabbitMQConfig } from '../src/types'
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initialize()', () => {
    it('connects, creates a channel, then declares the exchanges', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()

      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost')
      expect(channel.assertExchange).toHaveBeenCalledWith(
        'events.v1',
        'direct',
        { durable: true }
      )
    })

    /**
     * Regression test for PROJECT-BRIEF Phase 1 #4: `prefetch` is a
     * consumer-side flow-control setting and has no effect on a publish
     * channel. Calling it on the producer side was a no-op-with-extra-
     * roundtrip; removed in PR #13.
     */
    it('does NOT call channel.prefetch() on the publish channel', async () => {
      const producer = new RabbitMQProducer(config)
      await producer.initialize()
      expect(channel.prefetch).not.toHaveBeenCalled()
    })

    it('rethrows the original error if amqp.connect fails', async () => {
      vi.mocked(amqp.connect).mockRejectedValueOnce(new Error('boom'))
      const producer = new RabbitMQProducer(config)
      await expect(producer.initialize()).rejects.toThrow('boom')
    })

    /**
     * Covers the false branch of `error instanceof Error` in producer.ts:
     * when amqp.connect rejects with a non-Error value, the producer
     * wraps it in a new Error with the raw rejection as `.cause`. The
     * wrapper's `.message` is what reaches the logger; `safeErrorMessage`
     * does not walk `.cause` — by design (see `src/logger.ts` JSDoc).
     * Net effect: credentials in the rejection value do NOT leak into the
     * log, because the wrapper hides them in `.cause`.
     */
    it('wraps a non-Error rejection (URL credentials in cause stay out of logs)', async () => {
      vi.mocked(amqp.connect).mockReset()
      vi.mocked(amqp.connect).mockRejectedValueOnce('connect failed: amqps://alice:s3cret@host')
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } satisfies Logger
      const producer = new RabbitMQProducer({ ...config, logger })

      await expect(producer.initialize()).rejects.toThrow('[RabbitMQ::Producer] connected error')

      // The wrapper's message is logged; the credentials in `.cause` are not.
      const errorCalls = logger.error.mock.calls.flat().join(' ')
      expect(errorCalls).toContain('[RabbitMQ::Producer] connected error')
      expect(errorCalls).not.toContain('s3cret')
      expect(errorCalls).not.toContain('alice')
    })
  })

  describe('logger (DI)', () => {
    it('routes producer.connect diagnostics through a custom logger', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } satisfies Logger
      const producer = new RabbitMQProducer({ ...config, logger })

      await producer.initialize()

      expect(logger.info).toHaveBeenCalledWith('[RabbitMQ::Producer] connect ...')
      expect(logger.info).toHaveBeenCalledWith('[RabbitMQ::Producer] connected successfully')
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
