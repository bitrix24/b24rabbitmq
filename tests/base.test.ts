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
      // Top-level `maxPriority` is no longer passed: we set it via the
      // arguments object so caller overrides in options.arguments can win.
      expect(opts['maxPriority']).toBeUndefined()
    })

    it('omits x-max-priority when maxPriority is 0 (caller opts out of priority queue)', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({ name: 'q', maxPriority: 0, bindings: [] })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      // AMQP rejects x-max-priority outside 1..255; we don't send it at all.
      expect(args['x-max-priority']).toBeUndefined()
    })

    it('defaults x-dead-letter-routing-key to empty string when routingKey is omitted', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        deadLetter: { exchange: 'dlx' },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      expect(args['x-dead-letter-exchange']).toBe('dlx')
      expect(args['x-dead-letter-routing-key']).toBe('')
    })

    it('respects a custom maxPriority', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({ name: 'q', maxPriority: 3, bindings: [] })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      expect((opts['arguments'] as Record<string, unknown>)['x-max-priority']).toBe(3)
    })

    /**
     * Regression test for Phase 1 #3: when both `maxPriority` and `deadLetter`
     * are set, `channel.assertQueue` receives a single `arguments` object
     * carrying x-max-priority AND the x-dead-letter-* keys. Previously the
     * `{arguments: {dlx}, ...assertsOptions}` spread let the earlier
     * `arguments` overwrite the dead-letter args.
     */
    it('merges x-max-priority and dead-letter into a single arguments object', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'work',
        maxPriority: 5,
        deadLetter: { exchange: 'dlx', routingKey: 'failed' },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      // toStrictEqual: assert exactly these three keys — no surplus from a
      // future over-merge regression.
      expect(args).toStrictEqual({
        'x-max-priority': 5,
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'failed'
      })
    })

    /**
     * Regression test for Phase 1 #3 (second vector): caller-supplied
     * `queue.options.arguments` is merged into the final arguments per-key
     * rather than wholesale-replacing the library-injected x-max-priority /
     * dead-letter keys. Caller keys win on conflict; sibling keys survive.
     */
    it('merges `queue.options.arguments` with library-injected arguments per-key', async () => {
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
      expect(args['x-max-priority']).toBe(7)
    })

    it('lets `queue.options.arguments` override a library-injected key on conflict', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        maxPriority: 3,
        options: { arguments: { 'x-max-priority': 9 } },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      // Caller wins on conflict — explicit override.
      expect(args['x-max-priority']).toBe(9)
    })

    /**
     * Composite test: all four sources contribute to `arguments` in a single
     * call. Sibling caller key survives; conflicting caller key overrides
     * the library default; the library-injected dead-letter pair is intact.
     * Catches `Object.assign` order regressions that pass the simpler tests
     * but fail when all four interact.
     */
    it('merges library defaults, deadLetter and caller arguments simultaneously (override + sibling)', async () => {
      base = new TestBase(baseConfig(), channel, connection)
      await base.registerQueue({
        name: 'q',
        maxPriority: 3,
        deadLetter: { exchange: 'dlx', routingKey: 'failed' },
        options: {
          arguments: {
            'x-max-priority': 99,   // overrides the library default
            'x-message-ttl': 6000   // sibling: must survive
          }
        },
        bindings: []
      })

      const opts = channel.assertQueue.mock.calls[0]?.[1] as Record<string, unknown>
      const args = opts['arguments'] as Record<string, unknown>
      expect(args).toStrictEqual({
        'x-max-priority': 99,
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'failed',
        'x-message-ttl': 6000
      })
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
