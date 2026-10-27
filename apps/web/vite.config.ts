import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'HDP Taiz meal verification',
        short_name: 'HDP Taiz',
        description: 'One hot meal per household per day for Al-Mudhaffar and Al-Qahira.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f3efe4',
        theme_color: '#0e3a45',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
})
