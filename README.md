# CipherVault

Secure desktop password manager with AES-256-GCM encryption, built with Electron + React + TypeScript.

## Features

- **AES-256-GCM encryption** — all data encrypted locally with your master password
- **PBKDF2 key derivation** — 600,000 iterations for brute-force protection
- **TOTP 2FA** — two-factor authentication via authenticator apps
- **Duress code** — secondary password that opens an empty vault
- **Breach checking** — HIBP integration (k-anonymity)
- **Import/Export** — CSV and JSON support
- **Password generator** — configurable length and character types
- **Stealth mode** — hidden window, global hotkey (Ctrl+Shift+Space)
- **Auto-lock** — configurable timeout + lock on minimize
- **Clipboard auto-clear** — copies cleared after 30 seconds

## Install

Download the latest `.exe` installer from [Releases](https://github.com/vipecoder228/CipherVault/releases).

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Create installer
npm run dist
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 33 |
| UI | React 19 + TypeScript |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 |
| Database | sql.js (SQLite WASM) |
| Crypto | Node.js crypto (AES-256-GCM, PBKDF2) |
| 2FA | otplib + qrcode.react |
| Icons | Lucide React |
| Build | electron-vite + electron-builder |

## Security

- Master password never stored — only derived key hash
- Each entry encrypted with unique IV
- Rate limiting on unlock attempts (lock after 10 failures)
- DevTools disabled in production
- Context isolation enabled, no nodeIntegration

## License

MIT
