import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'MediVerify — Edge AI Medicine Scanner',
        short_name: 'MediVerify',
        description: 'Verify medicine strips offline using AI, OCR and a 250k medicine database',
        theme_color: '#0d9488',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/src\/database\/medicines_mini_index\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'medicine-mini-index',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: /\/src\/database\/index_buckets\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'medicine-buckets',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7, maxEntries: 30 }
            }
          },
          {
            urlPattern: /\/src\/database\/chunks\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'medicine-chunks',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30, maxEntries: 100 }
            }
          },
          {
            urlPattern: /\/model\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tfjs-model',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
})
