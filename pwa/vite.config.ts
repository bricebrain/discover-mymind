import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Discover & My Mind',
        short_name: 'Discover',
        description: 'Découvrir, écouter et réfléchir : mon journal de bord personnel.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F2EA',
        // « Partager vers Discover » depuis Chrome Android : titre, texte sélectionné, lien → une note My Mind.
        share_target: { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        theme_color: '#0E6B61',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'] },
    }),
  ],
  server: {
    port: 5173,
    // En développement, l'API tourne dans `wrangler dev` (port 8787).
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
});
