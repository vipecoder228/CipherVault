# Build signed Windows installer
# Usage: .\scripts\build-signed.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== CipherVault Signed Build ===" -ForegroundColor Cyan

# Check if cert exists
if (-not (Test-Path "resources\certs\code-signing.pfx")) {
    Write-Host "ERROR: Certificate not found at resources\certs\code-signing.pfx" -ForegroundColor Red
    Write-Host "Run: .\scripts\generate-cert.ps1" -ForegroundColor Yellow
    exit 1
}

# Set signing env vars
$certPath = (Resolve-Path "resources\certs\code-signing.pfx").Path
$env:CSC_LINK = $certPath
$env:CSC_KEY_PASSWORD = "ciphervault"

Write-Host "[1/3] Building app..." -ForegroundColor Yellow
npm run build

Write-Host "[2/3] Packaging with signature..." -ForegroundColor Yellow
npx electron-builder --win

Write-Host "[3/3] Done!" -ForegroundColor Green
Write-Host "Installer: dist\ciphervault-*-setup.exe" -ForegroundColor Cyan
