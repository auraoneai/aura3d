import { defineConfig } from "vite";

// The episode package is rendered to `dist/episodes/<id>/` by `npm run episode:render`.
// Vite's default `emptyOutDir` wipes the whole `dist/` on every `vite build`, which
// silently destroyed the rendered episode. Keep `emptyOutDir: false` so the route
// build and the episode render output can coexist in `dist/` without clobbering each
// other. (Order-independent: build and render no longer destroy one another.)
export default defineConfig({
  // The legacy SVG-puppet `index.html` → `src/main.ts` route was deleted. The real
  // live-3D render route is the only entry: `live-route.html` → `src/render-live-route.ts`.
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: "live-route.html"
    }
  }
});
