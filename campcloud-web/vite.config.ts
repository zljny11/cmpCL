import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      src: resolve(__dirname, 'src'),
      '@redux': resolve(__dirname, 'src/redux'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
