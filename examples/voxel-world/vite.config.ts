import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'g3d': path.resolve(__dirname, '../../src/index.ts')
    }
  },
  server: {
    port: 3002,
    open: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true
  }
});
