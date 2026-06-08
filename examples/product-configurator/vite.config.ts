import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../../dist-examples/product-configurator'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      g3d: resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    port: 5181,
    host: true,
  },
});
