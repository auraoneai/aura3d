import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// @aura3d/engine's Rapier chunk uses top-level await. Vite 5's chunk
// transpile rejects it under the default target (and rewrites "esnext" to
// the baseline target when minifying), so pin an ES2022 target — the first
// with top-level await — and declare the support to esbuild explicitly.
export default defineConfig({
  plugins: [svelte()],
  build: { target: "es2022" },
  esbuild: { supported: { "top-level-await": true } },
  optimizeDeps: { esbuildOptions: { target: "es2022" } }
});
