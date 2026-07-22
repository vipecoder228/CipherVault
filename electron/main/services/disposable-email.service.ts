import { getDatabase, saveDatabase } from '../db/connection'
import { randomInt } from 'crypto'
import {
  getDisposableEmails,
  getDisposableEmailById,
  createDisposableEmail,
  updateDisposableEmailToken,
  deleteDisposableEmail,
} from '../db/queries/disposable-emails.queries'
import type { DisposableEmailRow } from '../db/queries/disposable-emails.queries'
import { encryptCredential, decryptCredential } from './credentialEncryption'

// Detect if a value is already encrypted (JSON with iv/ciphertext/authTag)
function isEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && 'iv' in parsed && 'ciphertext' in parsed && 'authTag' in parsed
  } catch {
    return false
  }
}

// Decrypt credential, handling both encrypted and legacy plaintext
function safeDecryptCredential(value: string): string {
  if (!value) return value
  if (isEncrypted(value)) {
    try {
      return decryptCredential(value)
    } catch {
      return value // Fallback if vault is locked
    }
  }
  return value // Legacy plaintext
}

const MAIL_TM_BASE = 'https://api.mail.tm'

// Generate cryptographically secure random alphanumeric string
function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[randomInt(chars.length)]
  }
  return result
}

// Generate a random password for the email account
function generatePassword(): string {
  return randomString(16) + '!'
}

interface MailTmDomain {
  id: string
  domain: string
  isActive: boolean
}

interface MailTmAccount {
  id: string
  address: string
  token?: string
}

interface MailTmMessage {
  id: string
  from: { address: string; name: string }
  to: Array<{ address: string; name: string }>
  subject: string
  intro: string
  text: string
  html: string[]
  createdAt: string
  size: number
}

async function fetchDomains(): Promise<MailTmDomain[]> {
  const res = await fetch(`${MAIL_TM_BASE}/domains`)
  if (!res.ok) throw new Error('Failed to fetch domains')
  const data = await res.json()
  return data['hydra:member'] || []
}

async function createAccount(address: string, password: string): Promise<MailTmAccount> {
  const res = await fetch(`${MAIL_TM_BASE}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to create email account')
  }
  return res.json()
}

async function getToken(address: string, password: string): Promise<string> {
  const res = await fetch(`${MAIL_TM_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, password }),
  })
  if (!res.ok) throw new Error('Failed to get token')
  const data = await res.json()
  return data.token
}

async function getMessages(token: string): Promise<MailTmMessage[]> {
  const res = await fetch(`${MAIL_TM_BASE}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch messages')
  const data = await res.json()
  return data['hydra:member'] || []
}

async function getMessage(token: string, messageId: string): Promise<MailTmMessage> {
  const res = await fetch(`${MAIL_TM_BASE}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch message')
  return res.json()
}

async function deleteMessageApi(token: string, messageId: string): Promise<void> {
  const res = await fetch(`${MAIL_TM_BASE}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete message')
}

async function deleteAccountApi(token: string, accountId: string): Promise<void> {
  const res = await fetch(`${MAIL_TM_BASE}/accounts/${accountId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to delete account')
}

// ─── Public API ──────────────────────────────────────────

export async function createDisposableEmailAddress(): Promise<{ id: number; address: string }> {
  const db = await getDatabase()

  // Get available domains
  const domains = await fetchDomains()
  if (domains.length === 0) throw new Error('No domains available')

  const domain = domains[0].domain
  const username = randomString(8)
  const address = `${username}@${domain}`
  const password = generatePassword()

  // Create account on mail.tm
  const account = await createAccount(address, password)

  // Get token
  const token = await getToken(address, password)

  // Save to local DB with encrypted credentials
  const encPassword = encryptCredential(password)
  const encToken = encryptCredential(token)
  const row = createDisposableEmail(db, address, encPassword, encToken, account.id)
  saveDatabase()

  return { id: row.id, address }
}

export async function listDisposableEmails(): Promise<Array<{ id: number; address: string; createdAt: string }>> {
  const db = await getDatabase()
  const emails = getDisposableEmails(db)
  return emails.map(e => ({ id: e.id, address: e.address, createdAt: e.created_at }))
}

export async function getDisposableEmailMessages(emailId: number): Promise<Array<{
  id: string
  from: string
  subject: string
  intro: string
  createdAt: string
  size: number
}>> {
  const db = await getDatabase()
  const email = getDisposableEmailById(db, emailId)
  if (!email) throw new Error('Email not found')

  // Refresh token if needed or if API call fails with 401
  let token = safeDecryptCredential(email.token || '')
  const password = safeDecryptCredential(email.password)
  if (!token) {
    token = await getToken(email.address, password)
    const encToken = encryptCredential(token)
    updateDisposableEmailToken(db, emailId, encToken, email.account_id)
    saveDatabase()
  }

  let messages
  try {
    messages = await getMessages(token)
  } catch {
    // Token may be expired — refresh and retry
    token = await getToken(email.address, password)
    const encToken = encryptCredential(token)
    updateDisposableEmailToken(db, emailId, encToken, email.account_id)
    saveDatabase()
    messages = await getMessages(token)
  }
  return messages.map(m => ({
    id: m.id,
    from: m.from.address,
    subject: m.subject,
    intro: m.intro,
    createdAt: m.createdAt,
    size: m.size,
  }))
}

export async function getDisposableEmailMessage(emailId: number, messageId: string): Promise<{
  id: string
  from: string
  subject: string
  text: string
  html: string
  createdAt: string
}> {
  const db = await getDatabase()
  const email = getDisposableEmailById(db, emailId)
  if (!email) throw new Error('Email not found')

  let token = safeDecryptCredential(email.token || '')
  const password = safeDecryptCredential(email.password)
  if (!token) {
    token = await getToken(email.address, password)
    const encToken = encryptCredential(token)
    updateDisposableEmailToken(db, emailId, encToken, email.account_id)
    saveDatabase()
  }

  let msg
  try {
    msg = await getMessage(token, messageId)
  } catch {
    // Token may be expired — refresh and retry
    token = await getToken(email.address, password)
    const encToken = encryptCredential(token)
    updateDisposableEmailToken(db, emailId, encToken, email.account_id)
    saveDatabase()
    msg = await getMessage(token, messageId)
  }
  return {
    id: msg.id,
    from: msg.from.address,
    subject: msg.subject,
    text: msg.text,
    html: msg.html?.join('\n') || '',
    createdAt: msg.createdAt,
  }
}

export async function deleteDisposableEmailMessage(emailId: number, messageId: string): Promise<void> {
  const db = await getDatabase()
  const email = getDisposableEmailById(db, emailId)
  if (!email) throw new Error('Email not found')

  let token = safeDecryptCredential(email.token || '')
  if (!token) {
    const password = safeDecryptCredential(email.password)
    token = await getToken(email.address, password)
  }

  await deleteMessageApi(token, messageId)
}

export async function deleteDisposableEmailAccount(emailId: number): Promise<void> {
  const db = await getDatabase()
  const email = getDisposableEmailById(db, emailId)
  if (!email) throw new Error('Email not found')

  // Try to delete from mail.tm
  if (email.token && email.account_id) {
    try {
      const token = safeDecryptCredential(email.token)
      await deleteAccountApi(token, email.account_id)
    } catch {
      // Account may already be deleted
    }
  }

  // Delete from local DB
  deleteDisposableEmail(db, emailId)
  saveDatabase()
}
