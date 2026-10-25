import path from "node:path";
const repo = "/private/tmp/aura3d-shotsd";
import rootConfig from "./vite.config";
const routes = ["showcase-top-tennis","showcase-iron-crown","showcase-pips-big-leap","showcase-bunker-zero","showcase-dot-dash-3d","showcase-cross-hop","showcase-teleoperator","showcase-heatsink"];
const input = Object.fromEntries(routes.map((r) => [r, path.join(repo, "apps", r, "index.html")]));
const g = (p) => path.join(repo, "packages/game/src", p);
const rootAliases = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
export default {
  root: repo, publicDir: false, base: "/",
  resolve: { alias: [
    { find: /^@aura3d\/engine\/game\/art$/, replacement: g("art/index.ts") },
    { find: /^@aura3d\/engine\/game\/capture$/, replacement: g("capture/index.ts") },
    { find: /^@aura3d\/engine\/game\/util$/, replacement: g("util/index.ts") },
    { find: /^@aura3d\/engine\/game\/styles\.css$/, replacement: g("styles.css") },
    { find: /^@aura3d\/engine\/game$/, replacement: g("index.ts") },
    { find: /^@aura3d\/game$/, replacement: g("index.ts") },
    ...rootAliases.filter((e) => e.find !== "@aura3d/engine/game")
  ], dedupe: ["@aura3d/engine"] },
  build: { target: "es2022", outDir: path.join(repo, "tests/browser/shotsd-dist"), emptyOutDir: true, chunkSizeWarningLimit: 9000, rollupOptions: { input } },
  optimizeDeps: { exclude: ["@aura3d/engine"] }
};
