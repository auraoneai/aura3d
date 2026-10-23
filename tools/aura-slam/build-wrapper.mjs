#!/usr/bin/env node
// Production build of apps/showcase-aura-slam (the native Aura Slam wrapper) without registering a live route.
//   node tools/aura-slam/build-wrapper.mjs [outDir]    default outDir: tests/browser/aura-slam-dist
// Mirrors the alias set of marketing/scripts/build-showcase-routes.mjs, then copies the stadium models the page loads from /aura-assets/.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "tests/browser/aura-slam-dist"));
const enginePublicEntry = path.join(repoRoot, "packages/engine/src/public/index.ts");
const gamePackageEntry = path.join(repoRoot, "packages/game/src/index.ts");
const input = path.join(repoRoot, "apps/showcase-aura-slam/index.html");
const STADIUM_FILES = ["showcaseStadiumSeats.afb44897.glb", "rooftopScoreboardRigMeshy.866123b7.glb", "rooftopFloodlightTowerMeshy.1bfcdd0b.glb"];

const tempDir = mkdtempSync(path.join(tmpdir(), "aura-slam-build-"));
const configPath = path.join(tempDir, "vite.config.mjs");
writeFileSync(configPath, `import rootConfig from ${JSON.stringify(path.join(repoRoot, "vite.config.ts"))};
const rootAliases = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
export default {
  root: ${JSON.stringify(repoRoot)},
  publicDir: false,
  base: "/",
  resolve: {
    alias: [
      { find: /^@aura3d\\/engine\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/engine$/, replacement: ${JSON.stringify(enginePublicEntry)} },
      ...rootAliases.filter((entry) => entry.find !== "@aura3d/engine")
    ],
    dedupe: ["@aura3d/engine"]
  },
  build: { target: "es2022", outDir: ${JSON.stringify(outDir)}, emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 3000, rollupOptions: { input: { "showcase-aura-slam": ${JSON.stringify(input)} } } },
  optimizeDeps: { exclude: ["@aura3d/engine"] }
};
`);
const vite = path.join(repoRoot, "node_modules/.bin/vite");
const result = spawnSync(vite, ["build", "--config", configPath], { cwd: repoRoot, stdio: "inherit", env: { ...process.env, FORCE_COLOR: "0" } });
rmSync(tempDir, { recursive: true, force: true });
if (result.status !== 0) { console.error("aura-slam wrapper build failed"); process.exit(result.status ?? 1); }

const assetsOut = path.join(outDir, "aura-assets");
mkdirSync(assetsOut, { recursive: true });
for (const file of STADIUM_FILES) {
  const source = path.join(repoRoot, "public/aura-assets", file);
  if (!existsSync(source)) { console.error(`missing ${source}`); process.exit(1); }
  cpSync(source, path.join(assetsOut, file));
}
// The site serves /fonts/* from marketing/public/fonts (vercel.json rewrite); mirror it so the page finds its licensed fonts.
const fontsSource = path.join(repoRoot, "marketing/public/fonts");
if (existsSync(fontsSource)) cpSync(fontsSource, path.join(outDir, "fonts"), { recursive: true });
console.log(`aura-slam wrapper built: ${outDir}`);
