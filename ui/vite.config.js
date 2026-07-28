import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  base: '/voice/',
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      }
    }
  },
  server: {
    proxy: {
      '/voice-api': {
        target: 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/voice-api/, ''),
      },
      '/agents': 'http://localhost:8080',
      '/agent': 'http://localhost:8080',
      '/bench': 'http://localhost:8080',
      '/stream': 'http://localhost:8080',
      '/token': 'http://localhost:8080',
    }
  }
});
