/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Manifest/icons/iOS specifics land in Phase 5 (PWA & backup).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Choices',
        short_name: 'Choices',
        description: 'Choose between instances of a thing.',
        display: 'standalone',
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
