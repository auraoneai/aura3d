import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { removeLocalAuraAssets, rewriteBuiltAuraAssetUrls } from "./showcase-cdn-assets.mjs";

const expectedEngineVersion = "1.4.0";
const expectedShowcaseAssetPackage = "@aura3d/showcase-assets-web";
const expectedShowcaseAssetVersion = "1.4.0";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const marketingDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(marketingDir, "..");
const distDir = path.join(marketingDir, "dist");
const enginePackageJson = path.join(marketingDir, "node_modules", "@aura3d", "engine", "package.json");
const engineEntry = path.join(marketingDir, "node_modules", "@aura3d", "engine", "dist", "engine", "agent-api", "index.js");

const showcaseRoutes = [
  "showcase-index",
  "showcase-product-configurator",
  "showcase-material-asset-inspector",
  "showcase-smart-city-control",
  "showcase-cinematic-architecture",
  "showcase-digital-twin-ops",
  "showcase-blockfall-reactor",
  "showcase-data-galaxy",
  "showcase-webgpu-particle-lab"
];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertEngineVersion() {
  const marketingPackage = readJson(path.join(marketingDir, "package.json"));
  const packageDependency = marketingPackage.dependencies?.["@aura3d/engine"];
  if (packageDependency !== expectedEngineVersion) {
    throw new Error(`marketing/package.json must depend on @aura3d/engine@${expectedEngineVersion}; found ${packageDependency ?? "missing"}`);
  }

  if (!existsSync(enginePackageJson)) {
    throw new Error("marketing/node_modules/@aura3d/engine is missing. Run pnpm install before building the marketing site.");
  }

  const installedEngine = readJson(enginePackageJson);
  if (installedEngine.version !== expectedEngineVersion) {
    throw new Error(`marketing build requires npm @aura3d/engine@${expectedEngineVersion}; installed ${installedEngine.version}`);
  }

  if (!existsSync(engineEntry)) {
    throw new Error(`@aura3d/engine package entry is missing: ${engineEntry}`);
  }
}

function writeViteConfig(tempDir) {
  const routeInputs = Object.fromEntries(
    showcaseRoutes.map((route) => [route, path.join(repoRoot, "apps", route, "index.html")])
  );

  const configPath = path.join(tempDir, "vite.config.mjs");
  writeFileSync(
    configPath,
    `export default {
  root: ${JSON.stringify(repoRoot)},
  publicDir: false,
  base: "/",
  resolve: {
    alias: [
      { find: /^@aura3d\\/engine$/, replacement: ${JSON.stringify(engineEntry)} }
    ],
    dedupe: ["@aura3d/engine"]
  },
  build: {
    target: "es2022",
    outDir: ${JSON.stringify(distDir)},
    emptyOutDir: false,
    sourcemap: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: ${JSON.stringify(routeInputs, null, 6)}
    }
  },
  optimizeDeps: {
    entries: ${JSON.stringify(Object.values(routeInputs), null, 4)}
  }
};
`,
    "utf8"
  );
  return configPath;
}

function runViteBuild(configPath) {
  const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", configPath], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`showcase route build failed with exit code ${result.status ?? "unknown"}`);
  }
}

function copyRouteHealth() {
  for (const route of showcaseRoutes) {
    const routeHealth = path.join(repoRoot, "apps", route, "route-health.json");
    if (!existsSync(routeHealth)) continue;
    const outputDir = path.join(distDir, "apps", route);
    cpSync(routeHealth, path.join(outputDir, "route-health.json"));
  }
}

function copyAuraAssets() {
  const manifest = readJson(path.join(repoRoot, "aura.assets.json"));
  const manifestAssets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const routeAssetIds = collectRouteAssetIds();
  const ignoredTokens = new Set();
  const copiedAssetIds = new Set();

  for (const assetId of routeAssetIds) {
    const asset = manifestAssets.get(assetId);
    if (!asset) {
      ignoredTokens.add(assetId);
      continue;
    }
    copyAuraAssetFile(asset.url);
    if (asset.thumbnailUrl) copyAuraAssetFile(asset.thumbnailUrl);
    copiedAssetIds.add(assetId);
  }

  console.log(`Copied ${copiedAssetIds.size} typed Aura assets for website showcase routes.`);
  if (ignoredTokens.size > 0) {
    console.log(`Ignored non-asset documentation tokens: ${Array.from(ignoredTokens).sort().join(", ")}.`);
  }
}

function resolveShowcaseAssetBaseUrl() {
  const configuredBase = process.env.AURA3D_SHOWCASE_ASSET_BASE_URL?.trim();
  if (!configuredBase) return "";
  if (configuredBase === "jsdelivr") {
    return `https://cdn.jsdelivr.net/npm/${expectedShowcaseAssetPackage}@${expectedShowcaseAssetVersion}/aura-assets`;
  }
  return configuredBase.replace(/\/+$/, "");
}

function collectRouteAssetIds() {
  const routeAssetIds = new Set();
  const assetReferencePattern = /\bassets\.([A-Za-z0-9_$]+)\b/g;
  for (const route of showcaseRoutes) {
    const routeDir = path.join(repoRoot, "apps", route, "src");
    if (!existsSync(routeDir)) continue;
    for (const file of collectRouteFiles(routeDir)) {
      const content = readFileSync(file, "utf8");
      for (const match of content.matchAll(assetReferencePattern)) {
        routeAssetIds.add(match[1]);
      }
    }
  }
  return routeAssetIds;
}

function collectRouteFiles(routeDir) {
  const files = [];
  for (const entry of readdirSync(routeDir, { withFileTypes: true })) {
    const entryPath = path.join(routeDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...collectRouteFiles(entryPath));
    } else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|json|md)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function copyAuraAssetFile(assetUrl) {
  if (!assetUrl.startsWith("/aura-assets/")) {
    throw new Error(`Website showcase asset URL must be under /aura-assets/: ${assetUrl}`);
  }
  const source = path.join(repoRoot, "public", assetUrl);
  const target = path.join(distDir, assetUrl);
  if (!existsSync(source)) {
    throw new Error(`Website showcase asset file is missing: ${source}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function assertBuiltRoutes() {
  for (const route of showcaseRoutes) {
    const builtHtml = path.join(distDir, "apps", route, "index.html");
    if (!existsSync(builtHtml)) {
      throw new Error(`showcase route did not build: ${builtHtml}`);
    }
  }

  for (const route of ["showcase-turbo-drift-circuit", "showcase-skyline-runner"]) {
    const blockedHtml = path.join(distDir, "apps", route, "index.html");
    if (existsSync(blockedHtml)) {
      throw new Error(`prototype game route must not be published by marketing build: ${blockedHtml}`);
    }
  }
}

function main() {
  assertEngineVersion();
  const showcaseAssetBaseUrl = resolveShowcaseAssetBaseUrl();
  const tempDir = mkdtempSync(path.join(tmpdir(), "aura3d-marketing-showcase-"));
  try {
    const configPath = writeViteConfig(tempDir);
    runViteBuild(configPath);
    copyRouteHealth();
    if (showcaseAssetBaseUrl) {
      removeLocalAuraAssets(distDir);
      rewriteBuiltAuraAssetUrls(distDir, showcaseAssetBaseUrl);
    } else {
      copyAuraAssets();
    }
    assertBuiltRoutes();
    console.log(`Built ${showcaseRoutes.length} showcase routes with @aura3d/engine@${expectedEngineVersion}.`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

main();
