import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// @aura3d/engine's Rapier chunk uses top-level await, which Vite's
// default ES2020 build target rejects.
export default defineConfig({
  plugins: [svelte()],
  build: { target: "esnext" }
});
