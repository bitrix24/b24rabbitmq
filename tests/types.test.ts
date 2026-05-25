import { describe, it, expectTypeOf } from 'vitest'
import type { MessageHandler, MessageOptions } from '../src/types'

// Type-only suite: locks the public-surface invariants that Phase 1 #6
// (PR #16) established. No runtime assertions — `expectTypeOf` produces
// compile-time errors via the vitest type test runner. Catches accidental
// reverts to `any` and silent widening of generic defaults that the
// behavioural tests can't see.
describe('types — public surface invariants', () => {
  describe('MessageHandler', () => {
    it('defaults T to unknown (regression guard against `T = any`)', () => {
      type Handler = MessageHandler
      // Default param is `unknown`, NOT `any`. If a future refactor
      // accidentally reverts to `T = any`, the `unknown` assertion below
      // fails and this test stops compiling.
      expectTypeOf<Handler>().parameter(0).toEqualTypeOf<unknown>()
    })

    it('narrows the first parameter to the caller-supplied T', () => {
      type Order = { id: string; total: number }
      expectTypeOf<MessageHandler<Order>>().parameter(0).toEqualTypeOf<Order>()
    })

    it('keeps the ack/nack callbacks typed as `() => void`', () => {
      expectTypeOf<MessageHandler>().parameter(1).toEqualTypeOf<() => void>()
      expectTypeOf<MessageHandler>().parameter(2).toEqualTypeOf<() => void>()
    })

    it('returns Promise<void>', () => {
      expectTypeOf<MessageHandler>().returns.toEqualTypeOf<Promise<void>>()
    })
  })

  describe('MessageOptions', () => {
    it('headers are Record<string, unknown> — not any', () => {
      expectTypeOf<NonNullable<MessageOptions['headers']>>().toEqualTypeOf<Record<string, unknown>>()
    })

    it('priority is optional number (default applied by Producer.publish)', () => {
      expectTypeOf<MessageOptions['priority']>().toEqualTypeOf<number | undefined>()
    })
  })
})
