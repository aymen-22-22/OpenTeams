/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

const api = process.env.API_URL ?? 'http://localhost:8000'
const proxy = { '/api': api, '/ws': { target: api, ws: true } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Never inline fonts as data: URLs: the production CSP only allows fonts from our own origin.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: true, proxy },
  // `vite preview` serves the production build (used by the end-to-end tests).
  preview: { host: true, proxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
