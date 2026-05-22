import { describe, expect, it } from 'vitest'
import uuidv7 from '../src/tools/uuidv7'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('produces a canonical lowercase uuid string', () => {
    expect(uuidv7()).toMatch(UUID_RE)
  })

  it('sets the version nibble to 7', () => {
    expect(uuidv7()[14]).toBe('7')
  })

  it('sets the variant bits to 0b10 (8, 9, a or b)', () => {
    expect('89ab').toContain(uuidv7()[19])
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()))
    expect(ids.size).toBe(1000)
  })

  it('orders by the leading timestamp across calls over time', async () => {
    const first = uuidv7()
    await new Promise(resolve => setTimeout(resolve, 5))
    const second = uuidv7()
    expect(first.slice(0, 8) <= second.slice(0, 8)).toBe(true)
  })
})
