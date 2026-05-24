import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RabbitMQBase } from '../src/base'
import type { RabbitMQConfig } from '../src/types'
import { makeFakeConnection, type FakeChannel, type FakeConnection } from './_helpers/amqp-mock'

/**
 * Concrete subclass for testing — base.ts is abstract w.r.t. connect().
 * We bypass the network entirely by injecting a fake connection + channel.
 */
class TestBase extends RabbitMQBase {
  constructor(
    config: RabbitMQConfig,
    public fakeChannel: FakeChannel,
    public fakeConnection: FakeConnection
  ) {
    super(config)
    // FakeConnection / FakeChannel are structurally narrower than
    // amqp.ChannelModel / amqp.Channel; the cast keeps the test isolated from
    // the full amqplib type surface while exercising the real base.ts code.
    this.connection = fakeConnection as unknown as typeof this.connection
    this.channel = fakeChannel as unknown as typeof this.channel
  }
}

const baseConfig = (): RabbitMQConfig => ({
  connection: { url: 'amqp://test' },
  exchanges: [],
  queues: []
})

describe('RabbitMQBase', () => {
  let channel: FakeChannel
  let connection: FakeConnection
  let base: TestBase

  beforeEach(() => {
    const fakes = makeFakeConnection()
    channel = fakes.channel
    connection = fakes.connection
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('connect()', () => {
    it('throws unless a subclass overrides it', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await expect(base.connect()).rejects.toThrow('Need override this function')
    })
  })

  describe('registerExchange()', () => {
    it('asserts the exchange with the given name, type and options', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerExchange({
        name: 'events.v1',
        type: 'direct',
        options: { durable: true }
      })
      expect(channel.assertExchange).toHaveBeenCalledWith(
        'events.v1',
        'direct',
        { durable: true }
      )
    })

    it('passes an empty options object when options is omitted', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerExchange({ name: 'x', type: 'fanout' })
      expect(channel.assertExchange).toHaveBeenCalledWith('x', 'fanout', {})
    })
  })

  describe('registerQueue()', () => {
    it('defaults maxPriority to 10 and forwards it as x-max-priority', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({ name: 'q', bindings: [] })

      const [name, opts] = channel.assertQueue.mock.calls[0] as [string, Record<string, unknown>]
      expect(name).toBe('q')
      const args = opts['arguments'] as Record<string, unknown>
      expect(args['x-max-priority']).toBe(10)
      expect(opts['maxPriority']).toBe(10)
    })

    it('respects a custom maxPriority', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({ name: 'q', maxPriority: 3, bindings: [] })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      expect((opts['arguments'] as Record<string, unknown>)['x-max-priority']).toBe(3)
    })

    /**
     * Characterisation of the documented defect (PROJECT-BRIEF Track 1 #3):
     * the spread `{arguments: {dlx}, ...assertsOptions}` lets the previous
     * `assertsOptions.arguments` (which holds x-max-priority) OVERWRITE the
     * fresh dead-letter `arguments`. Net effect: when both maxPriority and
     * deadLetter are set, the dead-letter arguments are LOST, not the
     * priority. The Phase 1 fix must merge both into one arguments object.
     */
    it('LOSES dead-letter arguments when maxPriority is also set (current behaviour)', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'work',
        maxPriority: 5,
        deadLetter: { exchange: 'dlx', routingKey: 'failed' },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      // The x-max-priority key wins the spread:
      expect(args['x-max-priority']).toBe(5)
      // …and the dead-letter keys are absent:
      expect(args['x-dead-letter-exchange']).toBeUndefined()
      expect(args['x-dead-letter-routing-key']).toBeUndefined()
    })

    /**
     * Caller-supplied `queue.options` is spread LAST in `registerQueue`, so an
     * `options.arguments` object will completely replace the priority / dead-
     * letter arguments injected by the library. Locked here so the Phase 1
     * merge fix consciously decides whether to keep this behaviour or merge.
     */
    it('lets `queue.options.arguments` overwrite library-injected `arguments` (current spread order)', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        maxPriority: 7,
        options: { arguments: { 'x-custom': 'caller-wins' } },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      expect(args['x-custom']).toBe('caller-wins')
      // Library-injected x-max-priority is gone because options spread overrides it.
      expect(args['x-max-priority']).toBeUndefined()
    })

    it('binds the queue with a routing key when no headers are given', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        bindings: [{ exchange: 'x', routingKey: 'rk' }]
      })
      expect(channel.bindQueue).toHaveBeenCalledWith('q', 'x', 'rk')
      expect(channel.bindQueue).toHaveBeenCalledTimes(1)
    })

    it('binds with a headers argument when binding.headers is set', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        bindings: [{ exchange: 'x', routingKey: '', headers: { 'x-match': 'all', type: 'event' } }]
      })
      expect(channel.bindQueue).toHaveBeenCalledWith(
        'q',
        'x',
        '',
        { 'x-match': 'all', type: 'event' }
      )
    })

    it('returns the assertQueue result so callers can read the (possibly broker-generated) queue name', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      const result = await base.registerQueue({ bindings: [] })
      expect(result.queue).toBe('auto.generated')
    })
  })

  describe('disconnect()', () => {
    it('closes the channel and the connection in order', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.disconnect()
      expect(channel.close).toHaveBeenCalledTimes(1)
      expect(connection.close).toHaveBeenCalledTimes(1)
    })
  })
})
