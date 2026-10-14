import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Tech Portal',
        short_name: 'TechApp',
        description: 'Technician PWA Portal',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    watch: { usePolling: true, interval: 1000 },
    allowedHosts: ['tech-portal'],
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3182', changeOrigin: true },
      '/uploads': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3182', changeOrigin: true },
    },

    host: true,
    port: 3002
  }
})
