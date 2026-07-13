import type { IPCChannels } from '@shared/types'

declare global {
  interface Window {
    electronAPI: Record<string, (...args: any[]) => Promise<any>>
  }
}

export function invoke<K extends keyof IPCChannels>(
  channel: K,
  ...args: Parameters<IPCChannels[K]>
): ReturnType<IPCChannels[K]> {
  return window.electronAPI[channel](...args) as ReturnType<IPCChannels[K]>
}
