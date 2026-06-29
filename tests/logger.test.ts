import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultLogger, sanitizeUrl, safeErrorMessage } from '../src/logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sanitizeUrl', () => {
    it('scrubs username and password from amqp://', () => {
      expect(sanitizeUrl('amqp://alice:s3cret@host:5672/vhost')).toBe('amqp://***:***@host:5672/vhost')
    })

    it('scrubs credentials from amqps:// (TLS)', () => {
      expect(sanitizeUrl('amqps://alice:s3cret@broker.example.com')).toBe('amqps://***:***@broker.example.com')
    })

    it('leaves URLs without credentials unchanged', () => {
      expect(sanitizeUrl('amqp://localhost')).toBe('amqp://localhost')
      expect(sanitizeUrl('amqp://host:5672/vhost')).toBe('amqp://host:5672/vhost')
    })

    it('handles multiple URLs in a single string', () => {
      const s = 'failed amqps://u:p@a.example.com and amqps://x:y@b.example.com'
      expect(sanitizeUrl(s)).toBe('failed amqps://***:***@a.example.com and amqps://***:***@b.example.com')
    })

    it('scrubs username-only URLs (no password)', () => {
      expect(sanitizeUrl('amqp://admin@host:5672')).toBe('amqp://***@host:5672')
      expect(sanitizeUrl('amqps://admin@broker.example.com/vhost')).toBe('amqps://***@broker.example.com/vhost')
    })

    it('does not double-scrub an already-scrubbed URL', () => {
      // After the with-password regex masks the user, the user-only regex
      // must not match `***@` again. Belt-and-suspenders check.
      expect(sanitizeUrl('amqp://u:p@host')).toBe('amqp://***:***@host')
    })
  })

  describe('safeErrorMessage', () => {
    it('extracts the message from an Error and scrubs URL credentials', () => {
      const error = new Error('connect failed for amqp://alice:s3cret@host')
      expect(safeErrorMessage(error)).toBe('connect failed for amqp://***:***@host')
    })

    it('coerces non-Error values to string and scrubs them', () => {
      expect(safeErrorMessage('plain string: amqp://u:p@h')).toBe('plain string: amqp://***:***@h')
      expect(safeErrorMessage({ toString: () => 'amqps://a:b@c' })).toBe('amqps://***:***@c')
    })

    it('leaves messages without credentials unchanged', () => {
      expect(safeErrorMessage(new Error('ECONNREFUSED'))).toBe('ECONNREFUSED')
    })

    it('handles primitives without throwing', () => {
      expect(safeErrorMessage(42)).toBe('42')
      expect(safeErrorMessage(null)).toBe('null')
      expect(safeErrorMessage(undefined)).toBe('undefined')
    })

    it('scrubs credentials hidden in error.cause', () => {
      // amqplib often throws a clean wrapper Error whose `cause` carries the
      // original error whose message still contains amqp://user:pass@host.
      const cause = new Error('getaddrinfo ENOTFOUND amqp://alice:s3cret@host')
      const error = new Error('connect failed', { cause })
      const out = safeErrorMessage(error)
      expect(out).toContain('connect failed')
      expect(out).toContain('amqp://***:***@host')
      expect(out).not.toContain('s3cret')
    })

    it('walks a nested cause chain and scrubs each level', () => {
      const inner = new Error('amqps://u:p@inner')
      const middle = new Error('wrap amqps://x:y@middle', { cause: inner })
      const outer = new Error('top', { cause: middle })
      const out = safeErrorMessage(outer)
      expect(out).not.toContain(':p@')
      expect(out).not.toContain(':y@')
      expect(out).toContain('amqps://***:***@inner')
      expect(out).toContain('amqps://***:***@middle')
    })

    it('does not loop forever on a self-referential cause', () => {
      const error = new Error('amqp://u:p@host')
      ;(error as Error & { cause: unknown }).cause = error
      const out = safeErrorMessage(error)
      expect(out).toContain('amqp://***:***@host')
      expect(out).not.toContain(':p@')
    })
  })

  describe('defaultLogger', () => {
    it('routes info/warn/error/debug to the matching console methods', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      defaultLogger.debug('d', 1)
      defaultLogger.info('i', 2)
      defaultLogger.warn('w', 3)
      defaultLogger.error('e', 4)

      expect(debug).toHaveBeenCalledWith('d', 1)
      expect(info).toHaveBeenCalledWith('i', 2)
      expect(warn).toHaveBeenCalledWith('w', 3)
      expect(error).toHaveBeenCalledWith('e', 4)
    })
  })
})
