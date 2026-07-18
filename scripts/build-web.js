const { resolve } = require('path')
const { defineConfig } = require('electron-vite')
const react = require('@vitejs/plugin-react')

// Build only the renderer (web) part for Capacitor
const config = defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, '..', 'index.html')
      }
    },
    outDir: 'dist'
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@shared': resolve('shared')
    }
  }
})

module.exports = config
