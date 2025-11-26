import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build (main output for modern bundlers)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist/esm',
    splitting: true,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outExtension: () => ({ js: '.js' }),
    tsconfig: 'tsconfig.build.json',
    platform: 'browser',
    external: ['@webgpu/types', '@types/webxr'],
    esbuildOptions(options) {
      options.chunkNames = 'chunks/[name]-[hash]';
      options.mangleProps = undefined;
      options.keepNames = true;
    },
  },
  // CJS build (for Node.js compatibility and legacy bundlers)
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    outDir: 'dist/cjs',
    splitting: false,
    treeshake: true,
    minify: false,
    target: 'es2022',
    outExtension: () => ({ js: '.cjs' }),
    tsconfig: 'tsconfig.build.json',
    platform: 'neutral',
    external: ['@webgpu/types', '@types/webxr'],
    esbuildOptions(options) {
      options.keepNames = true;
    },
  },
  // Browser bundle (single file IIFE for CDN usage)
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'G3D',
    dts: false,
    sourcemap: true,
    outDir: 'dist/browser',
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.min.js' }),
    tsconfig: 'tsconfig.build.json',
    platform: 'browser',
    external: [],
    esbuildOptions(options) {
      options.banner = {
        js: `/**
 * G3D 5.0 - High-performance TypeScript-first 3D game engine
 * @version 5.0.0
 * @license MIT
 * @author G3D Team
 *
 * Browser bundle (minified) - For CDN usage
 * Import as: <script src="g3d.min.js"></script>
 * Access via global: window.G3D
 */`,
      };
    },
  },
]);
