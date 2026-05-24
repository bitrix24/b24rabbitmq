import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQConsumer } from '../src/consumer'
import type { RabbitMQConfig } from '../src/types'
import { makeFakeConnection, getConsumeCallback, type FakeChannel, type FakeConnection } from './_helpers/amqp-mock'

vi.mock('amqplib', () => ({
  default: { connect: vi.fn() }
}))

const config: RabbitMQConfig = {
  connection: { url: 'amqp://localhost', reconnectInterval: 1000, maxRetries: 3 },
  exchanges: [{ name: 'ex', type: 'direct' }],
  queues: [
    {
      name: 'q1',
      bindings: [{ exchange: 'ex', routingKey: 'rk' }]
    }
  ]
}

describe('RabbitMQConsumer', () => {
  let channel: FakeChannel
  let connection: FakeConnection

  beforeEach(() => {
    const fakes = makeFakeConnection()
    channel = fakes.channel
    connection = fakes.connection
    vi.mocked(amqp.connect).mockReset()
    vi.mocked(amqp.connect).mockResolvedValue(connection as unknown as Awaited<ReturnType<typeof amqp.connect>>)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initialize()', () => {
    it('connects, sets prefetch, declares exchanges and asserts/binds queues', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost')
      expect(channel.prefetch).toHaveBeenCalledWith(1)
      expect(channel.assertExchange).toHaveBeenCalledWith('ex', 'direct', {})
      expect(channel.assertQueue).toHaveBeenCalledWith('q1', expect.any(Object))
      expect(channel.bindQueue).toHaveBeenCalledWith('q1', 'ex', 'rk')
    })

    it('subscribes to the connection close event so reconnect can fire', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      expect(connection.on).toHaveBeenCalledWith('close', expect.any(Function))
    })
  })

  describe('reconnect (current behaviour)', () => {
    /**
     * Characterisation of PROJECT-BRIEF Track 1 #2: handleReconnect schedules
     * `this.connect()` inside a setTimeout — fire-and-forget, not awaited.
     */
    it('schedules a reconnect via setTimeout when the connection closes', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      connection.emitClose()
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    /** Network-class errors (ENOTFOUND, ECONNREFUSED) are rethrown — no retry. */
    it('rethrows ENOTFOUND without scheduling a reconnect', async () => {
      vi.useFakeTimers()
      vi.mocked(amqp.connect).mockReset()
      vi.mocked(amqp.connect).mockRejectedValue(new Error('ENOTFOUND amqp://nowhere'))
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      const consumer = new RabbitMQConsumer(config)
      await expect(consumer.connect()).rejects.toThrow('ENOTFOUND')
      expect(setTimeoutSpy).not.toHaveBeenCalled()
    })

    /** Generic (non-network) errors go through handleReconnect. */
    it('schedules a reconnect when amqp.connect fails with a generic (non-network) error', async () => {
      vi.useFakeTimers()
      vi.mocked(amqp.connect).mockReset()
      vi.mocked(amqp.connect).mockRejectedValue(new Error('something else'))
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      const consumer = new RabbitMQConsumer(config)
      await consumer.connect()
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    /**
     * Defect lock: the reconnect timer callback increments `retries` and
     * fires a non-awaited `this.connect()`. We stub `connect` so the
     * successful re-connection branch (which resets retries to 0) doesn't
     * mask the increment; this also documents the fire-and-forget call.
     */
    it('increments retries and re-invokes connect() (not awaited) when the reconnect timer fires', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      // Replace connect with a no-op so the increment isn't immediately
      // reset by the success branch inside the original connect().
      const reconnectSpy = vi.spyOn(consumer, 'connect').mockResolvedValue(undefined)

      // @ts-expect-error — access private field for characterisation.
      expect(consumer.retries).toBe(0)

      connection.emitClose()
      await vi.advanceTimersByTimeAsync(1000)

      // @ts-expect-error
      expect(consumer.retries).toBe(1)
      expect(reconnectSpy).toHaveBeenCalledTimes(1)
    })

    /**
     * Defect lock (PROJECT-BRIEF Phase 1 #2): handleReconnect throws
     * synchronously when retries are exhausted. Called from an event
     * listener context this is an uncatchable crash.
     */
    it('throws synchronously at the retries === maxRetries boundary (uncatchable from event listener)', async () => {
      // Fake timers so the "not.toThrow" branch's setTimeout doesn't leak a
      // real 1 s timer that would fire during a later test (CI flakiness).
      vi.useFakeTimers()
      const maxRetries = config.connection.maxRetries
      if (maxRetries === undefined) throw new Error('test config must set maxRetries')

      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      // Just-below-boundary does NOT throw — schedules the next attempt.
      // @ts-expect-error — access private field for characterisation.
      consumer.retries = maxRetries - 1
      expect(() => {
        // @ts-expect-error — access private method for characterisation.
        consumer.handleReconnect()
      }).not.toThrow()

      // At-or-above boundary throws. Locks the current `>=` guard.
      // @ts-expect-error — access private field for characterisation.
      consumer.retries = maxRetries
      expect(() => {
        // @ts-expect-error — access private method for characterisation.
        consumer.handleReconnect()
      }).toThrow('Max connection retries exceeded')
    })
  })

  describe('handlers', () => {
    it('registerHandler / unRegisterHandler keep an internal map', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      const handler = vi.fn().mockResolvedValue(undefined)
      consumer.registerHandler('q1', handler)
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({ a: 1 })) }
      await callback(msg)
      expect(handler).toHaveBeenCalledTimes(1)

      consumer.unRegisterHandler('q1')
      await callback(msg)
      // unregistered: still only the one prior invocation
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('consume()', () => {
    /**
     * Characterisation of the AMQP-properties surfacing gap (related to
     * PROJECT-BRIEF Track 1 #1): the consume callback parses `msg.content`
     * as JSON and passes ONLY the parsed body to the handler. AMQP
     * properties — correlationId, replyTo, headers, etc. — are not
     * exposed. Any handler that needs them currently has to embed them
     * in the body. Phase 1 #1 (RPC) and the broader message-properties
     * design are gated on this.
     */
    it('passes ONLY the parsed JSON body to the handler (no AMQP properties surfaced)', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      let received: unknown
      const handler = vi.fn(async (body: unknown) => { received = body })
      consumer.registerHandler('q1', handler)
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')

      const incoming = {
        content: Buffer.from(JSON.stringify({ payload: 42 })),
        properties: { correlationId: 'cid', replyTo: 'rps-x' },
        fields: { exchange: 'ex', routingKey: 'rk' }
      }
      await callback(incoming)

      // Final guard: a future bug that double-routes the delivery would
      // be invisible without this — `received` would just hold the last value.
      expect(handler).toHaveBeenCalledOnce()
      expect(received).toEqual({ payload: 42 })
      expect((received as Record<string, unknown>)['correlationId']).toBeUndefined()
      expect((received as Record<string, unknown>)['replyTo']).toBeUndefined()
      expect((received as Record<string, unknown>)['headers']).toBeUndefined()
    })

    it('acks on handler success and nacks (false, false) on handler failure', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      // _content is the parsed JSON body (NOT the raw amqp message); ack is the 2nd arg.
      const okHandler = vi.fn(async (_content, ack) => { ack() })
      const failHandler = vi.fn(async () => { throw new Error('boom') })

      consumer.registerHandler('q1', okHandler)
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const okMsg = { content: Buffer.from(JSON.stringify({})) }
      await callback(okMsg)
      expect(channel.ack).toHaveBeenCalledWith(okMsg)

      // Re-bind a failing handler on the same queue and trigger again.
      consumer.registerHandler('q1', failHandler)
      await callback(okMsg)
      expect(channel.nack).toHaveBeenCalledWith(okMsg, false, false)
    })

    it('silently ignores a null delivery (broker cancel)', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', vi.fn())
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      await expect(callback(null)).resolves.toBeUndefined()
      expect(channel.ack).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
    })
  })
})
