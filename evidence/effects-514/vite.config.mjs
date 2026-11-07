// Dev server for the lane 514 proof pages and the live-game pixel A/B. Usage (repo root): npx vite --config evidence/effects-514/vite.config.mjs
// Aliases mirror the repo vite.config.ts (game subpaths first, then the generated package map).
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasEntries } from "../../vite.aliases.generated.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const gameDir = `${root}/packages/game/src/`;
const gameAliases = [
  { find: /^@aura3d\/engine\/game\/art$/, replacement: `${gameDir}art/index.ts` },
  { find: /^@aura3d\/engine\/game\/capture$/, replacement: `${gameDir}capture/index.ts` },
  { find: /^@aura3d\/engine\/game\/util$/, replacement: `${gameDir}util/index.ts` },
  { find: /^@aura3d\/engine\/game\/styles\.css$/, replacement: `${gameDir}styles.css` },
  { find: /^@aura3d\/engine\/game$/, replacement: `${gameDir}index.ts` },
  { find: /^@aura3d\/game$/, replacement: `${gameDir}index.ts` }
];
// Each game keeps its static files under apps/<game>/public; serve /aura-assets, /assets, /hdri, /textures... from the page that asked (Referer).
const TYPES = { ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".hdr": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ktx2": "image/ktx2", ".json": "application/json", ".cube": "text/plain", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
const perAppPublic = {
  name: "e514-per-app-public",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url ?? "").split("?")[0];
      const game = /\/apps\/([\w-]+)\//.exec(String(req.headers.referer ?? ""))?.[1];
      if (!game || url.startsWith("/apps/") || url.startsWith("/@") || url.startsWith("/packages/") || url.startsWith("/node_modules/")) return next();
      const file = join(root, "apps", game, "public", decodeURIComponent(url));
      if (!existsSync(file) || !statSync(file).isFile()) return next();
      res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
      res.setHeader("content-length", String(statSync(file).size));
      createReadStream(file).pipe(res);
    });
  }
};
export default {
  plugins: [perAppPublic],
  root,
  server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 8514), strictPort: true, fs: { strict: false } },
  resolve: { alias: [...gameAliases, ...aliasEntries.map(([find, replacement]) => ({ find, replacement: new URL(replacement, `file://${root}/`).pathname }))] },
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: "warn"
};
