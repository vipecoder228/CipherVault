# Generate self-signed code signing certificate
# Run this once on your dev machine

$ErrorActionPreference = "Stop"

Write-Host "=== Generating Code Signing Certificate ===" -ForegroundColor Cyan

# Create certs directory
New-Item -ItemType Directory -Force -Path "resources\certs" | Out-Null

# Create self-signed cert
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=CipherVault, O=CipherVault" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyUsage DigitalSignature `
    -FriendlyName "CipherVault Code Signing" `
    -NotAfter (Get-Date).AddYears(5)

Write-Host "Certificate created: $($cert.Thumbprint)" -ForegroundColor Green

# Export as PFX
$pwd = ConvertTo-SecureString -String "ciphervault" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "resources\certs\code-signing.pfx" -Password $pwd

Write-Host "PFX exported to: resources\certs\code-signing.pfx" -ForegroundColor Green
Write-Host "Password: ciphervault" -ForegroundColor Yellow
Write-Host ""
Write-Host "NOTE: Self-signed cert will show SmartScreen warning." -ForegroundColor Yellow
Write-Host "For production, buy a real cert from DigiCert/Sectigo (~$200/year)." -ForegroundColor Yellow
