/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the project site at /choices/; local and any
// dedicated origin stay at /. The Phase-5 gate asserts start_url "/".
declare const process: { env: Record<string, string | undefined> }
const base = process.env.GITHUB_PAGES === 'true' ? '/choices/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Choices',
        short_name: 'Choices',
        description: 'Choose between instances of a thing.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#08090b',
        theme_color: '#08090b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole shell for full offline; the plugin adds the
        // manifest and its icons to the precache automatically. Fonts are
        // self-hosted (Phase 8) and must ride along or offline falls back
        // to system faces.
        globPatterns: ['**/*.{js,css,html,woff,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
