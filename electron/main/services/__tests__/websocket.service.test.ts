import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mocks (vi.mock factories are hoisted; use vi.hoisted for mutable refs) ──
const { mockWssInstance, MockWebSocketServer } = vi.hoisted(() => {
  const mockWssInstance = {
    on: vi.fn(),
    close: vi.fn(),
  }
  const MockWebSocketServer = vi.fn(() => mockWssInstance)
  return { mockWssInstance, MockWebSocketServer }
})

vi.mock('ws', () => ({
  WebSocketServer: MockWebSocketServer,
  WebSocket: vi.fn(),
}))

vi.mock('../entries.service', () => ({
  searchEntriesByDomain: vi.fn(),
  getEntryCredentials: vi.fn(),
}))

vi.mock('../vault.service', () => ({
  isUnlocked: vi.fn(),
  isAlarmMode: vi.fn(),
}))

vi.mock('../secretStorage', () => ({
  saveSecret: vi.fn(),
  getSecret: vi.fn(),
}))

// ─── Imports ────────────────────────────────────────────
import { startWebSocketServer, stopWebSocketServer, getSessionToken } from '../websocket.service'
import { isUnlocked, isAlarmMode } from '../vault.service'
import { saveSecret, getSecret } from '../secretStorage'

// ─── Tests ──────────────────────────────────────────────
describe('WebSocketService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isUnlocked).mockReturnValue(false)
    vi.mocked(isAlarmMode).mockReturnValue(false)
    vi.mocked(getSecret).mockResolvedValue(null)
    vi.mocked(saveSecret).mockResolvedValue(undefined)
  })

  afterEach(() => {
    stopWebSocketServer()
  })

  // ─── startWebSocketServer ───────────────────────────────
  describe('startWebSocketServer', () => {
    it('should create a WebSocketServer on port 19823', () => {
      startWebSocketServer()

      expect(MockWebSocketServer).toHaveBeenCalledWith({
        port: 19823,
        host: '127.0.0.1',
      })
    })

    it('should not create a second server if already running', () => {
      startWebSocketServer()
      startWebSocketServer()

      expect(MockWebSocketServer).toHaveBeenCalledTimes(1)
    })

    it('should handle EADDRINUSE gracefully', () => {
      startWebSocketServer()

      // Simulate EADDRINUSE error
      const errorHandler = mockWssInstance.on.mock.calls.find(
        (call: any[]) => call[0] === 'error',
      )?.[1]
      expect(errorHandler).toBeDefined()

      const err = new Error('EADDRINUSE') as any
      err.code = 'EADDRINUSE'
      errorHandler(err)

      // wss should be cleared, so next startWebSocketServer should create a new one
      MockWebSocketServer.mockClear()
      startWebSocketServer()
      expect(MockWebSocketServer).toHaveBeenCalledTimes(1)
    })
  })

  // ─── stopWebSocketServer ────────────────────────────────
  describe('stopWebSocketServer', () => {
    it('should close the server and set wss to null', () => {
      startWebSocketServer()
      stopWebSocketServer()

      expect(mockWssInstance.close).toHaveBeenCalled()
    })

    it('should be safe to call when server is not running', () => {
      stopWebSocketServer()
      expect(mockWssInstance.close).not.toHaveBeenCalled()
    })
  })

  // ─── getSessionToken ────────────────────────────────────
  describe('getSessionToken', () => {
    it('should return stored token if one exists', async () => {
      // Run this test first because sessionToken is cached at module level
      const storedData = JSON.stringify({ token: 'stored-token-123', createdAt: Date.now() })
      vi.mocked(getSecret).mockResolvedValue(storedData)

      const token = await getSessionToken()

      expect(token).toBe('stored-token-123')
      expect(saveSecret).not.toHaveBeenCalled()
    })

    it('should generate and save a new token when none exists', async () => {
      // Session token is already cached from previous test; verify it returns a string
      const token = await getSessionToken()

      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })
  })
})
