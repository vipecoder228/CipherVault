import { describe, it, expect, beforeEach, vi } from 'vitest'

// sql.js's WASM loader has no .wasm file available under vitest/Node — force
// the asm.js fallback, same trick as webBackend.kdf.test.ts.
vi.mock('sql.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sql.js')>()
  return { ...actual, default: () => Promise.reject(new Error('wasm disabled in tests')) }
})

// @capacitor/filesystem's web shim needs window/indexedDB, unavailable under
// plain Node/vitest. Back it with an in-memory Map so writeAttachmentFile/
// readAttachmentFile/deleteAttachmentFile round-trip realistically without
// needing a browser environment. Declared via vi.hoisted so beforeEach can
// clear it — each test must start with a clean "disk", otherwise the second
// test's vault:setup finds the first test's persisted DB file and skips
// creating a fresh vault.
const mockFiles = vi.hoisted(() => new Map<string, string>())

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    writeFile: vi.fn(async ({ path, data }: any) => {
      mockFiles.set(path, data)
    }),
    rename: vi.fn(async ({ from, to }: any) => {
      mockFiles.set(to, mockFiles.get(from)!)
      mockFiles.delete(from)
    }),
    readFile: vi.fn(async ({ path }: any) => {
      if (!mockFiles.has(path)) throw new Error('File does not exist')
      return { data: mockFiles.get(path) }
    }),
    deleteFile: vi.fn(async ({ path }: any) => {
      if (!mockFiles.has(path)) throw new Error('File does not exist')
      mockFiles.delete(path)
    }),
  },
}))

async function freshBackend() {
  vi.resetModules()
  const backend = await import('../webBackend')
  const db = await import('../webDb')
  return { backend, db }
}

describe('webBackend attachments + cascade delete', () => {
  beforeEach(() => {
    mockFiles.clear()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
  })

  it('uploads, lists, downloads, and deletes an attachment through the real DB', async () => {
    const { backend } = await freshBackend()
    await backend.webHandlers['vault:setup'](null, 'master-pw')
    const entry = await backend.webHandlers['entries:create'](null, { entry_type: 'login', title: 'Site' })

    const data = new Uint8Array([1, 2, 3, 4])
    const meta = await backend.webHandlers['attachments:add'](null, entry.id, 'note.txt', 'text/plain', data)
    expect(meta.filename).toBe('note.txt')

    const list = await backend.webHandlers['attachments:list'](null, entry.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(meta.id)

    const fetched = await backend.webHandlers['attachments:get'](null, meta.id)
    expect(fetched.data).toEqual(data)
    expect(fetched.meta.filename).toBe('note.txt')

    await backend.webHandlers['attachments:delete'](null, meta.id)
    const listAfter = await backend.webHandlers['attachments:list'](null, entry.id)
    expect(listAfter).toHaveLength(0)
  })

  it('cleans up the attachment file when its entry is permanently deleted', async () => {
    const { backend } = await freshBackend()
    const { Filesystem } = await import('@capacitor/filesystem')
    await backend.webHandlers['vault:setup'](null, 'master-pw')
    const entry = await backend.webHandlers['entries:create'](null, { entry_type: 'login', title: 'Site' })
    const meta = await backend.webHandlers['attachments:add'](null, entry.id, 'note.txt', 'text/plain', new Uint8Array([1, 2]))

    await backend.webHandlers['entries:delete'](null, entry.id) // soft delete
    await backend.webHandlers['entries:permanent-delete'](null, entry.id)

    const list = await backend.webHandlers['attachments:list'](null, entry.id)
    expect(list).toEqual([])
    expect(vi.mocked(Filesystem.deleteFile)).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining(meta.storage_key) })
    )
  })
})
