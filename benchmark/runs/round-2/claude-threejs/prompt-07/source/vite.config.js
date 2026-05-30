import { defineConfig } from 'vite';

// Material Lab is a static client-side three.js app.
// Use a relative base so the production build works from any path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
