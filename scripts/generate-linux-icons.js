const { writeFileSync, readFileSync, mkdirSync } = require('fs')
const { join } = require('path')
const sharp = require('sharp')

const RESOURCES_DIR = join(__dirname, '..', 'resources')
const svgPath = join(RESOURCES_DIR, 'icon.svg')
const svgBuffer = readFileSync(svgPath)

async function generateIcons() {
  console.log('Generating Linux icons from icon.svg...')

  const sizes = [512, 256, 128, 64, 48, 32, 16]

  for (const size of sizes) {
    const filename = size === 512 ? 'icon.png' : `icon-${size}.png`
    const outputPath = join(RESOURCES_DIR, filename)

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath)

    console.log(`Created resources/${filename} (${size}x${size})`)
  }

  console.log('\nLinux icons generated!')
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err)
  process.exit(1)
})
