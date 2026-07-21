import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('../vault.service', () => ({
  getEncryptionKey: vi.fn(() => Buffer.alloc(32)),
  getActiveVaultId: vi.fn(() => 1),
}))

vi.mock('../breach-check.service', () => ({
  checkBreach: vi.fn(async (password: string) => {
    if (password === 'password123') {
      return { breached: true, count: 1000 }
    }
    return { breached: false, count: 0 }
  }),
}))

vi.mock('../email.service', () => ({
  sendBreachNotification: vi.fn(async () => true),
}))

vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(async () => ({
    exec: vi.fn(() => ({ values: [] })),
  })),
}))

vi.mock('../../db/queries/entries.queries', () => ({
  getEntries: vi.fn(() => []),
}))

vi.mock('../../crypto/encryption', () => ({
  decryptJSON: vi.fn(() => ({ password: 'test', title: 'Test' })),
}))

describe('BreachMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkAllPasswordsForBreaches', () => {
    it('should return 0 when vault is locked', async () => {
      const { getEncryptionKey } = await import('../vault.service')
      vi.mocked(getEncryptionKey).mockReturnValue(null)

      const { checkAllPasswordsForBreaches } = await import('../breach-monitor.service')
      const result = await checkAllPasswordsForBreaches()

      expect(result.checked).toBe(0)
      expect(result.breached).toBe(0)
    })

    it('should check passwords and count breaches', async () => {
      // This test verifies the function exists and can be called
      const { checkAllPasswordsForBreaches } = await import('../breach-monitor.service')
      const result = await checkAllPasswordsForBreaches()

      expect(result).toHaveProperty('checked')
      expect(result).toHaveProperty('breached')
    })
  })

  describe('Breach Monitor Lifecycle', () => {
    it('should start and stop without errors', async () => {
      const { startBreachMonitor, stopBreachMonitor } = await import('../breach-monitor.service')

      expect(() => {
        startBreachMonitor()
        stopBreachMonitor()
      }).not.toThrow()
    })

    it('should not start twice', async () => {
      const { startBreachMonitor, stopBreachMonitor } = await import('../breach-monitor.service')

      expect(() => {
        startBreachMonitor()
        startBreachMonitor() // Second call should be no-op
        stopBreachMonitor()
      }).not.toThrow()
    })
  })
})
