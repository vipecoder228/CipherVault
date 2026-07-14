import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for building the renderer (web) part only
// Used by Capacitor to build the Android app
export default defineConfig({
  root: '.',
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@shared': resolve('shared')
    }
  },
  // Define environment variables for web build
  define: {
    'process.env.IS_WEB': 'true',
    'process.platform': JSON.stringify('web'),
    'global': 'globalThis'
  }
})
