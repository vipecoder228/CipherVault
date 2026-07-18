import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockWriteText = vi.fn()
const mockReadText = vi.fn()
const mockClear = vi.fn()

vi.mock('electron', () => ({
  clipboard: {
    get writeText() { return mockWriteText },
    get readText() { return mockReadText },
    get clear() { return mockClear },
  },
}))

import { copyToClipboard, clearClipboard } from '../clipboard.service'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockReadText.mockReturnValue('default')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Clipboard Service', () => {
  it('should write text to clipboard', async () => {
    await copyToClipboard('password123')
    expect(mockWriteText).toHaveBeenCalledWith('password123')
  })

  it('should clear clipboard when value matches after TTL', async () => {
    mockReadText.mockReturnValue('password123')
    await copyToClipboard('password123', 5000)

    vi.advanceTimersByTime(5000)

    expect(mockClear).toHaveBeenCalled()
  })

  it('should NOT clear clipboard if user copied something else', async () => {
    mockReadText.mockReturnValue('other-text')
    await copyToClipboard('password123', 5000)

    vi.advanceTimersByTime(5000)

    expect(mockClear).not.toHaveBeenCalled()
  })

  it('should clear immediately when clearClipboard is called', async () => {
    mockReadText.mockReturnValue('password123')
    await copyToClipboard('password123', 5000)

    clearClipboard()

    expect(mockClear).toHaveBeenCalled()
  })

  it('should cancel previous timer on new copy', async () => {
    mockReadText.mockReturnValue('first')
    await copyToClipboard('first', 5000)

    mockReadText.mockReturnValue('second')
    await copyToClipboard('second', 5000)

    vi.advanceTimersByTime(5000)

    // Only second copy should trigger clear
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('should clamp TTL to valid range', async () => {
    mockReadText.mockReturnValue('password')
    // TTL of 0 should not set a timer
    await copyToClipboard('password', 0)
    vi.advanceTimersByTime(100000)
    expect(mockClear).not.toHaveBeenCalled()
  })
})
