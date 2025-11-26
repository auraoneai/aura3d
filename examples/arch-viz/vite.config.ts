import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'g3d': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
  },
});
