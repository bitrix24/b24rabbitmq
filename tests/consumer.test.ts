import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQConsumer } from '../src/consumer'
import type { RabbitMQConfig } from '../src/types'
import { makeFakeConnection, type FakeChannel, type FakeConnection } from './_helpers/amqp-mock'

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
  })

  describe('handlers', () => {
    it('registerHandler / unRegisterHandler keep an internal map', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      const handler = vi.fn().mockResolvedValue(undefined)
      consumer.registerHandler('q1', handler)
      // Trigger a consume callback to confirm the handler runs.
      await consumer.consume('q1')
      const callback = channel.consume.mock.calls[0]?.[1] as (msg: unknown) => Promise<void>
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

      const handler = vi.fn(async (received) => {
        // The handler receives EXACTLY the parsed content object.
        expect(received).toEqual({ payload: 42 })
        // Properties are NOT attached to the value passed to the handler.
        expect((received as Record<string, unknown>)['correlationId']).toBeUndefined()
        expect((received as Record<string, unknown>)['replyTo']).toBeUndefined()
        expect((received as Record<string, unknown>)['headers']).toBeUndefined()
      })
      consumer.registerHandler('q1', handler)
      await consumer.consume('q1')
      const callback = channel.consume.mock.calls[0]?.[1] as (msg: unknown) => Promise<void>

      const incoming = {
        content: Buffer.from(JSON.stringify({ payload: 42 })),
        properties: { correlationId: 'cid', replyTo: 'rps-x' },
        fields: { exchange: 'ex', routingKey: 'rk' }
      }
      await callback(incoming)

      expect(handler).toHaveBeenCalledOnce()
    })

    it('acks on handler success and nacks (false, false) on handler failure', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      const okHandler = vi.fn(async (_msg, ack) => { ack() })
      const failHandler = vi.fn(async () => { throw new Error('boom') })

      consumer.registerHandler('q1', okHandler)
      await consumer.consume('q1')
      const cb1 = channel.consume.mock.calls[0]?.[1] as (msg: unknown) => Promise<void>
      const okMsg = { content: Buffer.from(JSON.stringify({})) }
      await cb1(okMsg)
      expect(channel.ack).toHaveBeenCalledWith(okMsg)

      // Re-bind a failing handler on the same queue and trigger again.
      consumer.registerHandler('q1', failHandler)
      await cb1(okMsg)
      expect(channel.nack).toHaveBeenCalledWith(okMsg, false, false)
    })

    it('silently ignores a null delivery (broker cancel)', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', vi.fn())
      await consumer.consume('q1')
      const cb = channel.consume.mock.calls[0]?.[1] as (msg: unknown) => Promise<void>
      await expect(cb(null)).resolves.toBeUndefined()
      expect(channel.ack).not.toHaveBeenCalled()
      expect(channel.nack).not.toHaveBeenCalled()
    })
  })
})
