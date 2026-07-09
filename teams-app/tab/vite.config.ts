import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The tab is served by the Teams app server, which proxies /api to the shared
// Deal Room backend (single data source). In dev, proxy /api to the server.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8090',
    },
  },
  build: {
    outDir: 'dist',
  },
});
