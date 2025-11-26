import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),

  build: {
    outDir: resolve(__dirname, '../dist-examples'),
    emptyOutDir: true,

    rollupOptions: {
      input: {
        // Main gallery page
        main: resolve(__dirname, 'index.html'),

        // Game examples
        fps: resolve(__dirname, 'fps-game/index.html'),
        racing: resolve(__dirname, 'racing-game/index.html'),
        platformer: resolve(__dirname, 'platformer/index.html'),
        space: resolve(__dirname, 'space-shooter/index.html'),

        // Simulation examples
        physics: resolve(__dirname, 'physics-sandbox/index.html'),
        voxel: resolve(__dirname, 'voxel-world/index.html'),

        // Visualization examples
        archviz: resolve(__dirname, 'arch-viz/index.html'),
      },
    },
  },

  resolve: {
    alias: {
      // Alias g3d to the source code for development
      'g3d': resolve(__dirname, '../src/index.ts'),
    },
  },

  server: {
    port: 5173,
    host: true,
    open: true,
  },

  preview: {
    port: 4173,
    host: true,
  },

  optimizeDeps: {
    exclude: ['g3d'],
  },
});
