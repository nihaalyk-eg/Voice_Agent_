import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'email.html'),
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/voice-api': 'http://localhost:8080',
      '/health': 'http://localhost:3000'
    }
  }
});
