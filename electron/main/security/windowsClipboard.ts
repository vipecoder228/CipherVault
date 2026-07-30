// ─── Windows Clipboard History / Cloud Sync Exclusion ───
// Writes text to the clipboard using the raw Win32 API so we can mark the
// clipboard entry as excluded from Windows' Clipboard History (Win+V) and
// Cloud Clipboard in the same atomic OpenClipboard/CloseClipboard session.
// Electron's clipboard API has no way to set these extra formats, so this
// bypasses it entirely on Windows. Falls back silently to the regular
// Electron clipboard write if the native call fails for any reason.

import type { LibraryHandle } from 'koffi'

const CF_UNICODETEXT = 13
const GMEM_MOVEABLE = 0x0002

// Win32 BOOL is a 4-byte int, not C99 bool (1 byte) — use 'int' in the
// signatures below to match the real ABI and compare against 0 in JS.
interface User32 {
  OpenClipboard(hWndNewOwner: bigint | null): number
  EmptyClipboard(): number
  CloseClipboard(): number
  SetClipboardData(uFormat: number, hMem: bigint | null): bigint | null
  RegisterClipboardFormatW(lpszFormat: string): number
}

interface Kernel32 {
  GlobalAlloc(uFlags: number, dwBytes: number): bigint | null
  GlobalLock(hMem: bigint | null): bigint | null
  GlobalUnlock(hMem: bigint | null): number
}

let user32: User32 | null = null
let kernel32: Kernel32 | null = null
let loadFailed = false

function loadNative(koffiModule: typeof import('koffi')): void {
  if (user32 && kernel32) return
  if (loadFailed) throw new Error('windowsClipboard: native library previously failed to load')

  try {
    const user32Lib: LibraryHandle = koffiModule.load('user32.dll')
    const kernel32Lib: LibraryHandle = koffiModule.load('kernel32.dll')

    user32 = {
      OpenClipboard: user32Lib.func('int __stdcall OpenClipboard(void *hWndNewOwner)'),
      EmptyClipboard: user32Lib.func('int __stdcall EmptyClipboard()'),
      CloseClipboard: user32Lib.func('int __stdcall CloseClipboard()'),
      SetClipboardData: user32Lib.func('void *__stdcall SetClipboardData(unsigned int uFormat, void *hMem)'),
      RegisterClipboardFormatW: user32Lib.func('unsigned int __stdcall RegisterClipboardFormatW(const char16_t *lpszFormat)'),
    } as unknown as User32

    kernel32 = {
      GlobalAlloc: kernel32Lib.func('void *__stdcall GlobalAlloc(unsigned int uFlags, size_t dwBytes)'),
      GlobalLock: kernel32Lib.func('void *__stdcall GlobalLock(void *hMem)'),
      GlobalUnlock: kernel32Lib.func('int __stdcall GlobalUnlock(void *hMem)'),
    } as unknown as Kernel32
  } catch (err) {
    loadFailed = true
    user32 = null
    kernel32 = null
    throw err
  }
}

function writeUtf16Global(koffiModule: typeof import('koffi'), text: string): bigint {
  const byteLength = (text.length + 1) * 2 // UTF-16 code units + NUL terminator
  const hMem = kernel32!.GlobalAlloc(GMEM_MOVEABLE, byteLength)
  if (!hMem) throw new Error('GlobalAlloc failed')

  const ptr = kernel32!.GlobalLock(hMem)
  if (!ptr) throw new Error('GlobalLock failed')
  try {
    koffiModule.encode(ptr, 'str16', text)
  } finally {
    kernel32!.GlobalUnlock(hMem)
  }
  return hMem
}

function writeUint32Global(koffiModule: typeof import('koffi'), value: number): bigint {
  const hMem = kernel32!.GlobalAlloc(GMEM_MOVEABLE, 4)
  if (!hMem) throw new Error('GlobalAlloc failed')

  const ptr = kernel32!.GlobalLock(hMem)
  if (!ptr) throw new Error('GlobalLock failed')
  try {
    koffiModule.encode(ptr, 'uint32', value)
  } finally {
    kernel32!.GlobalUnlock(hMem)
  }
  return hMem
}

/**
 * Writes text to the Windows clipboard as CF_UNICODETEXT, along with the
 * CanIncludeInClipboardHistory=0 and CanUploadToCloudClipboard=0 sentinel
 * formats, in a single clipboard-open transaction. Returns true on success.
 * Throws on any failure — callers should catch and fall back to
 * Electron's clipboard.writeText().
 */
export function writeSecureText(text: string, koffiModule: typeof import('koffi') = require('koffi')): boolean {
  loadNative(koffiModule)

  if (user32!.OpenClipboard(null) === 0) {
    throw new Error('OpenClipboard failed')
  }

  try {
    if (user32!.EmptyClipboard() === 0) {
      throw new Error('EmptyClipboard failed')
    }

    const textMem = writeUtf16Global(koffiModule, text)
    if (!user32!.SetClipboardData(CF_UNICODETEXT, textMem)) {
      throw new Error('SetClipboardData(CF_UNICODETEXT) failed')
    }

    const historyFormat = user32!.RegisterClipboardFormatW('CanIncludeInClipboardHistory')
    const cloudFormat = user32!.RegisterClipboardFormatW('CanUploadToCloudClipboard')

    const historyMem = writeUint32Global(koffiModule, 0)
    user32!.SetClipboardData(historyFormat, historyMem)

    const cloudMem = writeUint32Global(koffiModule, 0)
    user32!.SetClipboardData(cloudFormat, cloudMem)

    return true
  } finally {
    user32!.CloseClipboard()
  }
}
