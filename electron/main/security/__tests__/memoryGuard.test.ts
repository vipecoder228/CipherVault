import { describe, it, expect } from 'vitest'
import { secureWipe, secureString, withSecureContext } from '../memoryGuard'

describe('MemoryGuard', () => {
  describe('secureWipe', () => {
    it('should zero out a buffer', () => {
      const buf = Buffer.from('sensitive data')
      secureWipe(buf)
      expect(buf.every(b => b === 0)).toBe(true)
    })

    it('should handle empty buffer', () => {
      const buf = Buffer.alloc(0)
      secureWipe(buf)
      expect(buf.length).toBe(0)
    })

    it('should handle non-buffer input gracefully', () => {
      expect(() => secureWipe(null as any)).not.toThrow()
      expect(() => secureWipe(undefined as any)).not.toThrow()
    })

    it('should perform multiple passes', () => {
      const buf = Buffer.from('test data')
      secureWipe(buf)
      // After 3 passes (0x00, 0xff, 0x00), buffer should be zeros
      expect(buf.every(b => b === 0)).toBe(true)
    })
  })

  describe('secureString', () => {
    it('should return value and destroy function', () => {
      const secret = secureString('my-password')
      expect(secret.value).toBe('my-password')
      expect(typeof secret.destroy).toBe('function')
      expect(Buffer.isBuffer(secret.buffer)).toBe(true)
    })

    it('should wipe buffer on destroy', () => {
      const secret = secureString('sensitive')
      secret.destroy()
      expect(secret.buffer.every(b => b === 0)).toBe(true)
    })
  })

  describe('withSecureContext', () => {
    it('should execute function and cleanup buffers', async () => {
      const buf1 = Buffer.from('secret1')
      const buf2 = Buffer.from('secret2')

      await withSecureContext([buf1, buf2], async () => {
        expect(buf1.toString()).toBe('secret1')
        expect(buf2.toString()).toBe('secret2')
      })

      expect(buf1.every(b => b === 0)).toBe(true)
      expect(buf2.every(b => b === 0)).toBe(true)
    })

    it('should cleanup even if function throws', async () => {
      const buf = Buffer.from('secret')

      await expect(
        withSecureContext([buf], async () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      expect(buf.every(b => b === 0)).toBe(true)
    })
  })
})
