import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import amqp from 'amqplib'
import { RabbitMQConsumer } from '../src/consumer'
import type { Logger, RabbitMQConfig } from '../src/types'
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

  describe('reconnect', () => {
    /** The 'close' listener wires the reconnect loop; the loop is awaitable. */
    it('schedules a reconnect via setTimeout when the connection closes', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      connection.emitClose()
      // The reconnect loop sleeps `reconnectInterval` between attempts.
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000)
    })

    /**
     * `connect()` no longer special-cases network errors — every failure
     * propagates to the caller. The reconnect loop in `handleReconnect()`
     * catches errors and retries; `initialize()` lets the original error
     * surface so the app can fail fast on a wrong URL.
     */
    it('connect() propagates ENOTFOUND to the caller without scheduling a reconnect itself', async () => {
      vi.mocked(amqp.connect).mockReset()
      vi.mocked(amqp.connect).mockRejectedValue(new Error('ENOTFOUND amqp://nowhere'))

      const consumer = new RabbitMQConsumer(config)
      await expect(consumer.connect()).rejects.toThrow('ENOTFOUND')
    })

    /**
     * On a successful reconnect, the topology is re-asserted and every
     * queue that had an active `consume()` subscription is re-subscribed
     * — so message delivery resumes without the caller doing anything.
     */
    it('re-asserts topology and re-subscribes consumers after a successful reconnect', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', vi.fn())
      await consumer.consume('q1')

      // Baseline call counts after initial setup.
      const assertExchangeInitial = channel.assertExchange.mock.calls.length
      const assertQueueInitial = channel.assertQueue.mock.calls.length
      const consumeInitial = channel.consume.mock.calls.length

      // Drop the connection — reconnect loop should fire.
      connection.emitClose()
      await vi.advanceTimersByTimeAsync(1000)

      expect(channel.assertExchange.mock.calls.length).toBeGreaterThan(assertExchangeInitial)
      expect(channel.assertQueue.mock.calls.length).toBeGreaterThan(assertQueueInitial)
      expect(channel.consume.mock.calls.length).toBeGreaterThan(consumeInitial)
      // The most recent consume was for 'q1' — the queue we had subscribed to.
      const lastConsumeCall = channel.consume.mock.calls.at(-1) as [string, unknown]
      expect(lastConsumeCall[0]).toBe('q1')
    })

    /**
     * After a successful reconnect the retries counter resets to 0, so a
     * later disconnect gets a fresh budget of attempts.
     */
    it('resets retries to 0 after a successful reconnect', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      connection.emitClose()
      await vi.advanceTimersByTimeAsync(1000)

      // @ts-expect-error — access private field for characterisation.
      expect(consumer.retries).toBe(0)
    })

    /**
     * Concurrent 'close' events (e.g. broker drops + error event firing
     * close again) do NOT kick off parallel reconnect loops.
     */
    it('does not start a second reconnect loop while one is already in progress', async () => {
      vi.useFakeTimers()
      // Make connect hang on the second call so the first loop is still
      // running when we emit the second close.
      let secondConnectResolve: () => void = () => {}
      const secondConnectPromise = new Promise<typeof connection>((resolve) => {
        secondConnectResolve = () => resolve(connection)
      })
      vi.mocked(amqp.connect)
        .mockResolvedValueOnce(connection as unknown as Awaited<ReturnType<typeof amqp.connect>>)
        .mockReturnValueOnce(secondConnectPromise as unknown as ReturnType<typeof amqp.connect>)

      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      connection.emitClose()
      // Advance past the first reconnect's sleep so the second amqp.connect
      // call begins (and now hangs on `secondConnectPromise`).
      await vi.advanceTimersByTimeAsync(1000)

      const connectCallsAfterFirstClose = vi.mocked(amqp.connect).mock.calls.length

      // Second close fires while the first reconnect is still in flight.
      connection.emitClose()
      await Promise.resolve()

      // No additional amqp.connect call should have started.
      expect(vi.mocked(amqp.connect).mock.calls.length).toBe(connectCallsAfterFirstClose)

      // Clean up: release the hanging connect.
      secondConnectResolve()
    })

    /**
     * When retries are exhausted, `handleReconnect` LOGS and returns —
     * no synchronous throw out of the event listener, which used to be
     * an uncatchable crash path.
     */
    it('logs and gives up at maxRetries without throwing (no uncatchable crash)', async () => {
      vi.useFakeTimers()
      // Force every reconnect attempt to fail so we hit the give-up branch.
      vi.mocked(amqp.connect).mockReset()
      vi.mocked(amqp.connect)
        .mockResolvedValueOnce(connection as unknown as Awaited<ReturnType<typeof amqp.connect>>)
        .mockRejectedValue(new Error('still down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      connection.emitClose()
      // Drive the loop through all maxRetries attempts.
      for (let i = 0; i < (config.connection.maxRetries ?? 5); i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      // Process is still alive — no throw escaped. Loop logged the give-up.
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('max connection retries')
      )
    })

    /** `maxRetries: 0` disables reconnect entirely with a clear log message. */
    it('logs "reconnect disabled" when maxRetries is 0 (no attempt made)', async () => {
      const noRetryConfig: RabbitMQConfig = {
        ...config,
        connection: { ...config.connection, maxRetries: 0 }
      }
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const consumer = new RabbitMQConsumer(noRetryConfig)
      await consumer.initialize()
      const connectCallsBeforeClose = vi.mocked(amqp.connect).mock.calls.length

      connection.emitClose()
      await Promise.resolve()

      // No second amqp.connect call — the loop never entered.
      expect(vi.mocked(amqp.connect).mock.calls.length).toBe(connectCallsBeforeClose)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('reconnect disabled')
      )
    })

    /**
     * The connection's 'error' event listener (separate from 'close') just
     * logs and lets 'close' drive recovery — it does not throw or trigger
     * a second reconnect path.
     */
    it("logs but does not throw when the connection emits an 'error' event", async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()

      expect(() => connection.emitError(new Error('ECONNRESET'))).not.toThrow()
      expect(errorSpy).toHaveBeenCalledWith(
        '[RabbitMQ::Consumer] connection error',
        expect.stringContaining('ECONNRESET')
      )
    })

    /** Default `maxRetries` / `reconnectInterval` apply when the config omits them. */
    it('falls back to default maxRetries=5 and reconnectInterval=5000 when both are omitted', async () => {
      vi.useFakeTimers()
      const minimalConfig: RabbitMQConfig = {
        connection: { url: 'amqp://localhost' },
        exchanges: [{ name: 'ex', type: 'direct' }],
        queues: []
      }
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      const consumer = new RabbitMQConsumer(minimalConfig)
      await consumer.initialize()

      connection.emitClose()
      // The reconnect loop sleeps the default 5000ms between attempts.
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
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

    /**
     * Regression test for a bug introduced by Phase 1 #2: `unRegisterHandler`
     * used to only remove the handler from the map, but the reconnect path
     * would still re-subscribe the queue from `subscribedQueues`. Result:
     * messages arrived at a dead callback and stayed un-acked, eventually
     * blocking the queue (with prefetchCount=1 the broker stops delivering).
     */
    it('unRegisterHandler also drops the queue from subscribedQueues so reconnect does NOT re-subscribe a dead handler', async () => {
      vi.useFakeTimers()
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', vi.fn())
      await consumer.consume('q1')

      consumer.unRegisterHandler('q1')

      const consumeCallsBeforeClose = channel.consume.mock.calls.length
      connection.emitClose()
      await vi.advanceTimersByTimeAsync(1000)

      // Reconnect happened (channel.assertExchange called again) but channel.consume
      // was NOT called for 'q1' because we dropped it from subscribedQueues.
      const newConsumeCalls = channel.consume.mock.calls.slice(consumeCallsBeforeClose)
      expect(newConsumeCalls.some(([name]) => name === 'q1')).toBe(false)
    })
  })

  describe('disconnect()', () => {
    /**
     * Without the override, `subscribedQueues`, `handlers`, `retries` and
     * `reconnectInProgress` would leak across a disconnect+initialize
     * cycle and bite anyone reusing a consumer instance.
     */
    it('clears internal state (subscribedQueues, handlers, retries) so the consumer can be re-initialized cleanly', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', vi.fn())
      await consumer.consume('q1')
      // @ts-expect-error — read private state for the assertion.
      consumer.retries = 2

      await consumer.disconnect()

      // @ts-expect-error
      expect(consumer.retries).toBe(0)
      // @ts-expect-error
      expect(consumer.subscribedQueues.size).toBe(0)
      // @ts-expect-error
      expect(consumer.handlers.size).toBe(0)
      // @ts-expect-error
      expect(consumer.reconnectInProgress).toBe(false)
    })
  })

  describe('logger (DI)', () => {
    it('routes diagnostics through a custom logger supplied via config', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } satisfies Logger
      const consumer = new RabbitMQConsumer({ ...config, logger })
      await consumer.initialize()

      expect(logger.info).toHaveBeenCalledWith('[RabbitMQ::Consumer] connect ...')
      expect(logger.info).toHaveBeenCalledWith('[RabbitMQ::Consumer] connected successfully')
    })

    it('scrubs amqp:// credentials from logged error messages', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } satisfies Logger
      const consumer = new RabbitMQConsumer({ ...config, logger })
      await consumer.initialize()

      // Trigger the 'error' listener with an error whose message embeds
      // a credential-bearing URL — the kind amqplib can emit on TLS / auth
      // failures.
      connection.emitError(new Error('handshake failed for amqps://alice:secret-pass@broker.example.com'))

      // The logger captured the call — but the password must NOT appear.
      const captured = logger.error.mock.calls.flat().join(' ')
      expect(captured).not.toContain('secret-pass')
      expect(captured).not.toContain('alice')
      expect(captured).toContain('amqps://***:***@broker.example.com')
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

    /** Covers the explicit-nack closure at src/consumer.ts:85 (third handler arg). */
    it('nacks(false, false) when the handler explicitly calls the nack argument', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, _ack, nack) => { nack() })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({ x: 1 })) }
      await callback(msg)
      expect(channel.nack).toHaveBeenCalledWith(msg, false, false)
      expect(channel.ack).not.toHaveBeenCalled()
    })

    /**
     * Phase 1 #7 — ack/nack idempotency.
     * If the handler calls `ack()` and then throws, the library MUST NOT
     * follow up with `nack` in the catch — `amqplib` rejects the second
     * terminal call (protocol error). The pre-fix shape used to call
     * both; the test that locked the defect was flipped in this PR.
     */
    it('calls only ack (no follow-up nack) when the handler ack()s and then throws', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, ack) => {
        ack()
        throw new Error('after-ack')
      })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({})) }
      await callback(msg)
      expect(channel.ack).toHaveBeenCalledTimes(1)
      expect(channel.ack).toHaveBeenCalledWith(msg)
      expect(channel.nack).not.toHaveBeenCalled()
    })

    it('calls nack only once when the handler nack()s and then throws', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, _ack, nack) => {
        nack()
        throw new Error('after-nack')
      })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({})) }
      await callback(msg)
      expect(channel.nack).toHaveBeenCalledTimes(1)
      expect(channel.nack).toHaveBeenCalledWith(msg, false, false)
      expect(channel.ack).not.toHaveBeenCalled()
    })

    it('ignores a second ack() call from the same handler invocation and logs at warn', async () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
      const consumer = new RabbitMQConsumer({ ...config, logger })
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, ack) => {
        ack()
        ack()
      })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({})) }
      await callback(msg)
      expect(channel.ack).toHaveBeenCalledTimes(1)
      expect(channel.nack).not.toHaveBeenCalled()
      // Suppressed-terminal diagnostic must reach the logger at `warn`
      // (not `debug`) so the handler bug stays visible at default levels.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('ack suppressed')
      )
    })

    it('ignores nack() after ack() in the same handler invocation (first terminal call wins)', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, ack, nack) => {
        ack()
        nack()
      })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg = { content: Buffer.from(JSON.stringify({})) }
      await callback(msg)
      expect(channel.ack).toHaveBeenCalledTimes(1)
      expect(channel.nack).not.toHaveBeenCalled()
    })

    it('idempotency is per-delivery: two separate messages each get their own terminal call', async () => {
      const consumer = new RabbitMQConsumer(config)
      await consumer.initialize()
      consumer.registerHandler('q1', async (_content, ack) => {
        ack()
        ack()
      })
      await consumer.consume('q1')
      const callback = getConsumeCallback(channel, 'q1')
      const msg1 = { content: Buffer.from(JSON.stringify({ n: 1 })) }
      const msg2 = { content: Buffer.from(JSON.stringify({ n: 2 })) }
      await callback(msg1)
      await callback(msg2)
      expect(channel.ack).toHaveBeenCalledTimes(2)
      expect(channel.ack).toHaveBeenNthCalledWith(1, msg1)
      expect(channel.ack).toHaveBeenNthCalledWith(2, msg2)
    })
  })
})
