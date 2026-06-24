import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // TODO: Enable PWA plugin with manifest configuration
    // VitePWA({
    //   registerType: 'autoUpdate',
    //   manifest: {
    //     name: 'Aegis Geo-Swarm',
    //     short_name: 'Aegis',
    //     description: 'Privacy-preserving geospatial incident alerts for your neighborhood',
    //     theme_color: '#0f172a',
    //     background_color: '#0f172a',
    //     display: 'standalone',
    //     orientation: 'portrait',
    //     icons: [
    //       { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    //       { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    //     ],
    //   },
    // }),
  ],
  server: {
    port: 3000,
    host: true, // Expose to local network for mobile testing
  },
});
