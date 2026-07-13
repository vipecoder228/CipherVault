import { authenticator } from 'otplib'

export function generateSecret(): string {
  return authenticator.generateSecret(20)
}

export function generateQRCodeUrl(secret: string, username: string = 'Vault User'): string {
  return authenticator.keyuri(username, 'Vault Password Manager', secret)
}

export function verifyTOTP(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret })
}

export function generateTOTPToken(secret: string): string {
  return authenticator.generate(secret)
}
