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
        main: resolve(__dirname, 'index.html'),
        email: resolve(__dirname, 'email.html'),
        workOrders: resolve(__dirname, 'work-orders.html'),
        communications: resolve(__dirname, 'communications.html'),
        customers: resolve(__dirname, 'customers.html'),
        observability: resolve(__dirname, 'observability.html'),
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
});
