const { createHash } = require('crypto')
const { readFileSync, writeFileSync } = require('fs')

const args = process.argv.slice(2)
const exePath = args[0]

if (!exePath) {
  console.log('Usage: node scripts/generate-hash.js <path-to-exe>')
  console.log('Example: node scripts/generate-hash.js dist/ciphervault-1.0.0-setup.exe')
  process.exit(1)
}

const buffer = readFileSync(exePath)
const hash = createHash('sha256').update(buffer).digest('hex')

const hashPath = exePath + '.sha256'
writeFileSync(hashPath, hash)

console.log(`SHA-256: ${hash}`)
console.log(`Saved to: ${hashPath}`)
