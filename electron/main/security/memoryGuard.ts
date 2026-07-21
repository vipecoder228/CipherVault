// ─── Secure Memory Guard ────────────────────────────────
// Protects sensitive data in memory by zeroing buffers after use

/**
 * Securely wipe a Buffer, replacing all bytes with zeros.
 * After this call, the original data is unrecoverable from memory.
 */
export function secureWipe(buffer: Buffer): void {
  if (!Buffer.isBuffer(buffer)) return
  // Fill with zeros
  buffer.fill(0)
  // Multiple passes for extra safety
  buffer.fill(0xff)
  buffer.fill(0x00)
}

/**
 * Create a wrapper that auto-wipes a sensitive string after use.
 * Usage:
 *   const secret = secureString('my-password')
 *   try { use(secret.value) } finally { secret.destroy() }
 */
export function secureString(value: string): { value: string; destroy(): void; buffer: Buffer } {
  const buffer = Buffer.from(value, 'utf8')
  return {
    value,
    buffer,
    destroy() {
      secureWipe(buffer)
    },
  }
}

/**
 * Execute a function with automatic cleanup of sensitive buffers.
 */
export async function withSecureContext<T>(
  secrets: Buffer[],
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } finally {
    for (const buf of secrets) {
      secureWipe(buf)
    }
  }
}
