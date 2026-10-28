#!/usr/bin/env node
/*
 * Dev-only per-route build probe for apps/<route>/index.html.
 *
 * Mirrors the aliasing contract of marketing/scripts/build-showcase-routes.mjs
 * (@aura3d/engine -> packages/engine/src/agent-api/index.ts, the game package
 * -> packages/game/src/index.ts, plus the repo's generated vite aliases) but
 * writes to a caller-chosen outDir instead of the shared marketing/dist, so
 * parallel agents can verify a single route without racing the site build.
 *
 * Usage:
 *   node tools/dev-route-build.mjs <route> <outDir>
 *   node tools/dev-route-build.mjs showcase-top-tennis /tmp/a3d-tt-dist
 *
 * Exit code is the vite build exit code. This is a compile/import smoke
 * check only — it does not copy public/, aura-assets, route-health, or
 * inject favicons; the marketing build still owns production output.
 */
import { mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [route, outDir] = process.argv.slice(2);

if (!route || !outDir) {
  console.error("usage: node tools/dev-route-build.mjs <route> <outDir>");
  process.exit(2);
}

const input = path.join(repoRoot, "apps", route, "index.html");
if (!existsSync(input)) {
  console.error(`route entry missing: ${input}`);
  process.exit(2);
}

const rootViteConfig = path.join(repoRoot, "vite.config.ts");
const engineSourceEntry = path.join(repoRoot, "packages", "engine", "src", "agent-api", "index.ts");
const gamePackageEntry = path.join(repoRoot, "packages", "game", "src", "index.ts");
const retargetWorkerPath = path.join(repoRoot, "packages", "animation", "src", "pose", "retarget.worker.ts");
const resolvedOutDir = path.resolve(process.cwd(), outDir);

const tempDir = mkdtempSync(path.join(tmpdir(), "aura3d-dev-route-build-"));
try {
  const configPath = path.join(tempDir, "vite.config.mjs");
  writeFileSync(
    configPath,
    `import rootConfig from ${JSON.stringify(rootViteConfig)};

const rootAliases = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];
const retargetWorkerTarget = ${JSON.stringify(retargetWorkerPath)};

function resolveRetargetWorker() {
  return {
    name: "resolve-retarget-worker",
    resolveId(id) {
      if (
        id.endsWith("packages/animation/src/pose/retarget.worker.js") ||
        id.endsWith("packages/animation/src/pose/retarget.worker.ts")
      ) {
        return retargetWorkerTarget;
      }
      return null;
    }
  };
}

export default {
  root: ${JSON.stringify(repoRoot)},
  publicDir: false,
  base: "/",
  plugins: [resolveRetargetWorker()],
  worker: {
    plugins: () => [resolveRetargetWorker()]
  },
  resolve: {
    alias: [
      { find: /^@aura3d\\/engine\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/engine$/, replacement: ${JSON.stringify(engineSourceEntry)} },
      ...rootAliases.filter((entry) => entry.find !== "@aura3d/engine")
    ],
    dedupe: ["@aura3d/engine"]
  },
  build: {
    target: "es2022",
    outDir: ${JSON.stringify(resolvedOutDir)},
    emptyOutDir: true,
    sourcemap: true,
    minify: process.env.AURA3D_BUILD_NO_MINIFY === "1" ? false : "esbuild",
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: { ${JSON.stringify(route)}: ${JSON.stringify(input)} }
    }
  },
  optimizeDeps: {
    entries: [${JSON.stringify(input)}],
    exclude: ["@aura3d/engine"]
  }
};
`,
    "utf8"
  );

  const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", configPath], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
