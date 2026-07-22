import type { IPCChannels } from '@shared/types'

declare global {
  interface Window {
    electronAPI: Record<string, (...args: any[]) => Promise<any>>
  }
}

const isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

// Lazy-load the web backend only on non-Electron platforms
let webHandlers: Record<string, (...args: any[]) => any> | null = null

async function getWebHandlers() {
  if (!webHandlers) {
    const mod = await import('./webBackend')
    webHandlers = mod.webHandlers as Record<string, (...args: any[]) => any>
  }
  return webHandlers
}

export function invoke<K extends keyof IPCChannels>(
  channel: K,
  ...args: Parameters<IPCChannels[K]>
): ReturnType<IPCChannels[K]> {
  if (isElectron) {
    return window.electronAPI[channel](...args) as ReturnType<IPCChannels[K]>
  }

  // Web/Capacitor backend — resolve lazily and dispatch
  return (async () => {
    const handlers = await getWebHandlers()
    const handler = handlers[channel]

    if (!handler) {
      console.warn(`[WebBackend] Unhandled channel: ${channel}`)
      throw new Error(`Channel not supported on this platform: ${channel}`)
    }

    return handler(undefined, ...args)
  })() as ReturnType<IPCChannels[K]>
}

// ─── Clipboard Helper ────────────────────────────────────
// Reads clipboard_ttl_ms setting and passes it to clipboard:copy
// Clears previous clipboard content before copying new value
let cachedClipboardTtl: number | null = null

export async function copyWithTtl(text: string): Promise<void> {
  if (cachedClipboardTtl === null) {
    try {
      const val = await invoke('settings:get', 'clipboard_ttl_ms')
      cachedClipboardTtl = val ? Number(val) : 30000
    } catch {
      cachedClipboardTtl = 30000
    }
  }
  // Clear previous clipboard content first (defense in depth)
  try {
    await invoke('clipboard:clear')
  } catch {}
  return invoke('clipboard:copy', text, cachedClipboardTtl)
}

export function invalidateClipboardTtlCache(): void {
  cachedClipboardTtl = null
}
