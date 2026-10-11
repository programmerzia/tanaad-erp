import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered from src/app/pwa.ts so the app can show "offline ready" and "update ready"
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Tanaad Management System',
        short_name: 'Tanaad',
        description: 'Tanaad Packages Limited: mats, bags and recycling in one system. Works offline on the factory floor.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Installed on a desktop, the app draws its own title bar (breadcrumbs, search) into the window frame.
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        theme_color: '#eceef1',
        background_color: '#f3f4f6',
        categories: ['business', 'productivity'],
        launch_handler: { client_mode: 'navigate-existing' },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Group cockpit', short_name: 'Cockpit', url: '/?as=ceo&go=/g/cockpit', icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Mats · Attendance', short_name: 'Attendance', url: '/?as=supervisor&site=mats&go=/s/mats/people/attendance', icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Mats · Dispatch and gate', short_name: 'Dispatch', url: '/?as=storekeeper&site=mats&go=/s/mats/stock/dispatch', icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
          { name: 'Mats · Cash page', short_name: 'Cash', url: '/?as=cashier&site=mats&go=/s/mats/cash', icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }] },
        ],
        screenshots: [
          { src: 'screenshots/desktop.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Site dashboard' },
          { src: 'screenshots/phone.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Group cockpit' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['screenshots/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      // The service worker and manifest are also served by `pnpm demo`, so the install prompt and offline mode work in development.
      devOptions: { enabled: process.env.PWA_DEV !== '0', type: 'module', navigateFallback: 'index.html', suppressWarnings: true },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tanaad/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: { target: 'es2022', sourcemap: false },
});
