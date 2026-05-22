import { afterEach, describe, expect, it, vi } from 'vitest'
import uuidv7 from '../src/tools/uuidv7'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** First 48 bits (12 hex chars) encode the timestamp in UUIDv7. */
function timePrefix(uuid: string): string {
  return uuid.replaceAll('-', '').slice(0, 12)
}

describe('uuidv7', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('produces a canonical lowercase uuid string', () => {
    expect(uuidv7()).toMatch(UUID_RE)
  })

  it('sets the version nibble to 7 and the variant bits to 0b10', () => {
    const id = uuidv7()
    expect(id[14]).toBe('7')
    expect('89ab').toContain(id[19])
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()))
    expect(ids.size).toBe(10_000)
  })

  it('encodes the current time in the leading 48 bits', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    const now = 1_700_000_000_000
    vi.setSystemTime(now)

    // The 48-bit prefix is (Date.now() << 16) | subMs; the high 32 bits
    // therefore hold the low 32 bits of the millisecond timestamp.
    const prefix = BigInt(`0x${timePrefix(uuidv7())}`)
    const timestampLow32 = (prefix >> 16n) & 0xffffffffn
    expect(timestampLow32).toBe(BigInt(now) & 0xffffffffn)
  })

  it('is non-decreasing across calls as time advances (strictly)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    vi.setSystemTime(1_700_000_000_000)
    const first = timePrefix(uuidv7())
    vi.setSystemTime(1_700_000_001_000)
    const second = timePrefix(uuidv7())
    expect(first < second).toBe(true)
  })

  it('does not regress the time prefix within the same millisecond', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    vi.setSystemTime(1_700_000_000_000)
    let prev = timePrefix(uuidv7())
    for (let i = 0; i < 500; i++) {
      const cur = timePrefix(uuidv7())
      expect(prev <= cur).toBe(true)
      prev = cur
    }
  })
})
