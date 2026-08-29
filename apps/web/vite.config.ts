import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: [
          '**/*.{js,css,html,ico,svg,woff,woff2,webmanifest}',
          'brand/pwa-*.png',
          'brand/lscala-logo*.png',
          'brand/apple-touch-icon.png',
        ],
        globIgnores: ['**/qz-signing/**'],
      },
      includeAssets: [
        'brand/lscala-logo.png',
        'brand/lscala-logo-mark.png',
        'brand/apple-touch-icon.png',
        'brand/pwa-192.png',
        'brand/pwa-512.png',
      ],
      manifest: {
        name: "L'Scala Inventarios",
        short_name: "L'Scala",
        description:
          "Gestión de inventarios y caja para Boutique L'Scala (Calama). Atria Solutions SpA.",
        lang: 'es-CL',
        dir: 'ltr',
        /** Landing canónico; reopen iOS puede restaurar última URL — ver OwnerColdBootAwayFromPos. */
        start_url: '/?utm_source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFF8FB',
        theme_color: '#E6007E',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/brand/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/brand/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/brand/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
