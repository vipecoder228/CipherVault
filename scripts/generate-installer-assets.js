const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const BUILD_DIR = join(__dirname, '..', 'build')
mkdirSync(BUILD_DIR, { recursive: true })

// Generate BMP header for NSIS
function createBMP(width, height, pixels) {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelDataSize = rowSize * height
  const fileSize = 54 + pixelDataSize

  const buf = Buffer.alloc(fileSize)

  // BMP Header (14 bytes)
  buf.write('BM', 0)
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(54, 10) // Pixel data offset

  // DIB Header (40 bytes)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26) // Planes
  buf.writeUInt16LE(24, 28) // Bits per pixel
  buf.writeUInt32LE(0, 30) // Compression
  buf.writeUInt32LE(pixelDataSize, 34)

  // Pixel data (BGR format, bottom-up)
  let offset = 54
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3
      const [r, g, b] = pixels(x, y)
      buf[offset++] = b
      buf[offset++] = g
      buf[offset++] = r
    }
    // Pad row
    const padding = rowSize - width * 3
    for (let p = 0; p < padding; p++) buf[offset++] = 0
  }

  return buf
}

// Colors
const BG_DARK = [15, 15, 20]      // #0f0f14
const BG_LIGHT = [24, 24, 32]     // #181820
const ACCENT = [99, 102, 241]     // #6366f1
const ACCENT_LIGHT = [129, 140, 248] // #818cf8
const TEXT = [255, 255, 255]
const BORDER = [50, 50, 60]

// ─── Header Image (150x57) ───────────────────────────────
const header = createBMP(150, 57, (x, y) => {
  // Gradient background
  const t = x / 150
  const r = Math.round(BG_DARK[0] + (BG_LIGHT[0] - BG_DARK[0]) * t)
  const g = Math.round(BG_DARK[1] + (BG_LIGHT[1] - BG_DARK[1]) * t)
  const b = Math.round(BG_DARK[2] + (BG_LIGHT[2] - BG_DARK[2]) * t)

  // Accent line at bottom
  if (y >= 54) return ACCENT

  // Shield icon (simplified)
  const cx = 30, cy = 28
  const dx = x - cx, dy = y - cy
  if (dx * dx + dy * dy < 200 && dy > -15 && dy < 15) {
    return ACCENT_LIGHT
  }

  return [r, g, b]
})

writeFileSync(join(BUILD_DIR, 'header.bmp'), header)
console.log('Created build/header.bmp (150x57)')

// ─── Sidebar Image (164x314) ─────────────────────────────
const sidebar = createBMP(164, 314, (x, y) => {
  // Dark gradient
  const t = y / 314
  const r = Math.round(BG_DARK[0] * (1 - t * 0.3))
  const g = Math.round(BG_DARK[1] * (1 - t * 0.3))
  const b = Math.round(BG_DARK[2] * (1 - t * 0.3))

  // Top accent bar
  if (y < 4) return ACCENT

  // Shield icon (center)
  const cx = 82, cy = 100
  const dx = x - cx, dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)

  // Shield body
  if (dy > -40 && dy < 40 && dist < 45) {
    // Shield outline
    if (dist > 35 && dist < 45) return ACCENT
    // Shield fill
    if (dist < 35) {
      const glow = Math.max(0, 1 - dist / 40)
      return [
        Math.round(ACCENT[0] * 0.3 + ACCENT_LIGHT[0] * glow * 0.3),
        Math.round(ACCENT[1] * 0.3 + ACCENT_LIGHT[1] * glow * 0.3),
        Math.round(ACCENT[2] * 0.3 + ACCENT_LIGHT[2] * glow * 0.3)
      ]
    }
  }

  // Glow effect around shield
  if (dist < 80) {
    const glow = Math.max(0, 1 - dist / 80)
    return [
      Math.round(r + ACCENT[0] * glow * 0.15),
      Math.round(g + ACCENT[1] * glow * 0.15),
      Math.round(b + ACCENT[2] * glow * 0.15)
    ]
  }

  // Bottom accent bar
  if (y > 310) return ACCENT

  return [r, g, b]
})

writeFileSync(join(BUILD_DIR, 'sidebar.bmp'), sidebar)
console.log('Created build/sidebar.bmp (164x314)')

console.log('\nInstaller assets generated!')
