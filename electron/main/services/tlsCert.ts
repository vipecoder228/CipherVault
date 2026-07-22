// Self-signed TLS certificate generation for localhost API server
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { generate } from 'selfsigned'

let cachedCert: { cert: string; key: string } | null = null

/**
 * Get or generate a self-signed TLS certificate for localhost.
 * The certificate is cached in memory and persisted in userData for reuse across restarts.
 */
export async function getLocalhostCert(): Promise<{ cert: string; key: string }> {
  if (cachedCert) return cachedCert

  const certDir = join(app.getPath('userData'), 'certs')
  const certPath = join(certDir, 'localhost.pem')
  const keyPath = join(certDir, 'localhost-key.pem')

  // Try to load existing cert
  if (existsSync(certPath) && existsSync(keyPath)) {
    try {
      const cert = readFileSync(certPath, 'utf-8')
      const key = readFileSync(keyPath, 'utf-8')
      if (cert.includes('BEGIN CERTIFICATE') && key.includes('BEGIN PRIVATE KEY')) {
        cachedCert = { cert, key }
        return cachedCert
      }
    } catch {}
  }

  // Generate new self-signed cert
  const now = new Date()
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  const attrs = [{ name: 'commonName', value: 'localhost' }]
  const altNames = [
    { type: 2 as const, value: 'localhost' },
    { type: 7 as const, ip: '127.0.0.1' },
    { type: 7 as const, ip: '::1' },
  ]

  const pems = await generate(attrs, {
    notBeforeDate: now,
    notAfterDate: oneYear,
    keyType: 'ec',
    curve: 'P-256',
    algorithm: 'sha256',
    extensions: [
      { name: 'subjectAltName' as const, altNames },
    ],
  })

  const certPem = pems.cert
  const keyPem = pems.private

  cachedCert = { cert: certPem, key: keyPem }

  // Persist to disk for reuse — key file gets restrictive permissions
  try {
    mkdirSync(certDir, { recursive: true })
    writeFileSync(certPath, certPem, 'utf-8')
    writeFileSync(keyPath, keyPem, 'utf-8')
    // Restrict key file permissions to owner only (0o600)
    try {
      chmodSync(keyPath, 0o600)
    } catch {
      // chmod may not work on Windows, but Windows has its own ACLs
    }
  } catch {}

  return cachedCert
}
