const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const { createHash } = require('crypto')
const path = require('path')

const ROOT = path.join(__dirname, '..')

console.log('=== CipherVault Secure Build ===\n')

// Step 1: Build the app
console.log('[1/5] Building app...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

// Step 2: Build installer (first pass - without hash)
console.log('\n[2/5] Building installer (first pass)...')
execSync('npx electron-builder --win --config.win.signAndEditExecutable=false', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
})

// Step 3: Calculate hash
console.log('\n[3/5] Calculating SHA-256 hash...')
const installerName = getInstallerName()
const installerPath = path.join(ROOT, 'dist', installerName)
const buffer = readFileSync(installerPath)
const hash = createHash('sha256').update(buffer).digest('hex')
console.log(`   Hash: ${hash}`)

// Save hash to file
writeFileSync(path.join(ROOT, 'dist', installerName + '.sha256'), hash)
console.log(`   Saved to dist/${installerName}.sha256`)

// Step 4: Generate NSIS custom script with embedded hash
console.log('\n[4/5] Generating installer with embedded hash...')
const nshContent = `!macro customInit
  ; Get path to the installer executable
  StrCpy $R1 "$EXEPATH"

  ; Calculate SHA-256 hash using certutil
  nsExec::ExecToStack 'cmd /c certutil -hashfile "$R1" SHA256 | findstr /v "CertUtil"'
  Pop $0
  Pop $1

  ; Clean up hash
  \${TrimNewLines} $1 $1
  \${WordReplace} "$1" " " "" 1 $1

  ; Expected hash
  StrCpy $2 "${hash}"

  ; Compare
  \${If} "$1" != "$2"
    MessageBox MB_ICONSTOP|MB_OK "Installer integrity check failed. The file may have been corrupted or tampered with. Please download again from the official source."
    Abort
  \${EndIf}
!macroend
`
writeFileSync(path.join(ROOT, 'customInstall.nsh'), nshContent)

// Step 5: Rebuild installer with hash check
console.log('\n[5/5] Building installer with integrity check...')
execSync('npx electron-builder --win --config.win.signAndEditExecutable=false', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
})

// Regenerate hash for the new installer
const newBuffer = readFileSync(installerPath)
const newHash = createHash('sha256').update(newBuffer).digest('hex')
writeFileSync(path.join(ROOT, 'dist', installerName + '.sha256'), newHash)

console.log(`\n=== Build Complete ===`)
console.log(`Installer: dist/${installerName}`)
console.log(`Hash: ${newHash}`)
console.log(`Hash file: dist/${installerName}.sha256`)

function getInstallerName() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
  return `ciphervault-${pkg.version}-setup.exe`
}
