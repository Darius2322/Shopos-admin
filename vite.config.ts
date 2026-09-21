import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo-emblem.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ShopOS — Run Your Business Smarter',
        short_name: 'ShopOS',
        description: 'Offline-first POS and business management for small and medium retail businesses.',
        start_url: '/',
        display: 'standalone',
        background_color: '#071845',
        theme_color: '#071845',
        lang: 'en',
        scope: '/',
        orientation: 'portrait',
        // Android "Share" -> ShopOS: long-press an M-Pesa message, tap Share, pick ShopOS, and the
        // Payments page opens with it already filled in. No SMS permission involved: the person
        // explicitly chooses to share that one message. (Installed PWA on Android Chrome.)
        ...({ share_target: { action: '/payments', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } } } as Record<string, unknown>),
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1'),
            handler: 'NetworkFirst',
            options: { cacheName: 'shopos-api-cache', networkTimeoutSeconds: 4 }
          }
        ]
      }
    })
  ],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Vendor code (React, Supabase, Dexie) changes far less often than
        // the app's own features do — splitting it into its own chunk
        // means a returning user's browser cache serves it unchanged
        // across most deployments, instead of re-downloading the whole
        // bundle (including every library) every single release. Matters
        // more here than on a typical web app, given how much of this
        // app's usage is on mobile data.
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          dexie: ['dexie', 'dexie-react-hooks'],
        }
      }
    }
  }
});
