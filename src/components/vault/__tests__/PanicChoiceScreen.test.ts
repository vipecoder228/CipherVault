import { describe, it, expect, vi } from 'vitest'
import { runPanicWipe } from '../panicBackup'

// Builds a fake `invoke` that answers each IPC channel from a lookup table,
// recording every call so tests can assert on call order/args.
function makeInvoke(responses: Record<string, any>, opts: { throwOn?: string[] } = {}) {
  const calls: Array<{ channel: string; args: any[] }> = []
  const invoke = vi.fn(async (channel: string, ...args: any[]) => {
    calls.push({ channel, args })
    if (opts.throwOn?.includes(channel)) {
      throw new Error(`${channel} failed`)
    }
    return responses[channel]
  })
  return { invoke, calls }
}

const SAMPLE_ENTRIES = [
  { id: 1, entry_type: 'login', display_title: 'a', iv: '00', encrypted_data: '11', auth_tag: '22' },
  { id: 2, entry_type: 'login', display_title: 'b', iv: '33', encrypted_data: '44', auth_tag: '55' },
]

describe('runPanicWipe', () => {
  it('deletes all entries when the backup is sent successfully', async () => {
    const { invoke, calls } = makeInvoke({
      'entries:panic-backup': SAMPLE_ENTRIES,
      'settings:get-secure': 'backup-password',
      'vault:status': { activeVaultId: 1 },
      'vault:get-kdf-salt': 'aabbcc',
      'email:send-backup': { sent: true, filePath: '/tmp/backup.enc' },
      'entries:force-delete': undefined,
      'entries:complete-panic': undefined,
    })

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toEqual({ emailed: true, filePath: '/tmp/backup.enc', reason: undefined })
    expect(deletedCount).toBe(SAMPLE_ENTRIES.length)
    const deleteCalls = calls.filter(c => c.channel === 'entries:force-delete')
    expect(deleteCalls.map(c => c.args[0])).toEqual([1, 2])
    expect(calls.some(c => c.channel === 'entries:complete-panic')).toBe(true)
  })

  it('still deletes all entries when the backup is configured but fails to send', async () => {
    const { invoke, calls } = makeInvoke({
      'entries:panic-backup': SAMPLE_ENTRIES,
      'settings:get-secure': 'backup-password',
      'vault:status': { activeVaultId: 1 },
      'vault:get-kdf-salt': 'aabbcc',
      'email:send-backup': { sent: false, filePath: '/tmp/backup.enc', reason: 'network_error' },
      'entries:force-delete': undefined,
      'entries:complete-panic': undefined,
    })

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toEqual({ emailed: false, filePath: '/tmp/backup.enc', reason: 'network_error' })
    expect(deletedCount).toBe(SAMPLE_ENTRIES.length)
    expect(calls.filter(c => c.channel === 'entries:force-delete')).toHaveLength(2)
  })

  it('still deletes all entries when no backup password is configured', async () => {
    const { invoke, calls } = makeInvoke({
      'entries:panic-backup': SAMPLE_ENTRIES,
      'settings:get-secure': null, // panic_backup_password not set
      'entries:force-delete': undefined,
      'entries:complete-panic': undefined,
    })

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toBeNull()
    expect(deletedCount).toBe(SAMPLE_ENTRIES.length)
    expect(calls.some(c => c.channel === 'email:send-backup')).toBe(false)
    expect(calls.filter(c => c.channel === 'entries:force-delete')).toHaveLength(2)
  })

  it('still deletes all entries when there is nothing to back up', async () => {
    const { invoke, calls } = makeInvoke({
      'entries:panic-backup': [],
      'entries:complete-panic': undefined,
    })

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toBeNull()
    expect(deletedCount).toBe(0)
    expect(calls.some(c => c.channel === 'settings:get-secure')).toBe(false)
  })

  it('still deletes all entries when the backup pipeline throws mid-flight', async () => {
    const { invoke, calls } = makeInvoke(
      {
        'entries:panic-backup': SAMPLE_ENTRIES,
        'settings:get-secure': 'backup-password',
        'entries:force-delete': undefined,
        'entries:complete-panic': undefined,
      },
      { throwOn: ['vault:status'] }
    )

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toBeNull()
    expect(deletedCount).toBe(SAMPLE_ENTRIES.length)
    expect(calls.filter(c => c.channel === 'entries:force-delete')).toHaveLength(2)
  })

  it('deletes the remaining entries even if one force-delete call fails', async () => {
    const invoke = vi.fn(async (channel: string, ...args: any[]) => {
      if (channel === 'entries:panic-backup') return SAMPLE_ENTRIES
      if (channel === 'entries:force-delete' && args[0] === 1) throw new Error('locked row')
      return undefined
    })

    const { deletedCount } = await runPanicWipe({ invoke })

    // Entry 1's delete failed but entry 2's still went through.
    expect(deletedCount).toBe(1)
    expect(invoke).toHaveBeenCalledWith('entries:force-delete', 1)
    expect(invoke).toHaveBeenCalledWith('entries:force-delete', 2)
  })

  it('still finalizes panic mode when entries:panic-backup itself throws', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'entries:panic-backup') throw new Error('db locked')
      return undefined
    })

    const { backupResult, deletedCount } = await runPanicWipe({ invoke })

    expect(backupResult).toBeNull()
    expect(deletedCount).toBe(0)
    expect(invoke).toHaveBeenCalledWith('entries:complete-panic')
  })
})
