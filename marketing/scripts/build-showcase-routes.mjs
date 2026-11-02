import { closeSync, constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { removeLocalAuraAssets, rewriteBuiltAuraAssetUrls } from "./showcase-cdn-assets.mjs";
import { assertNoGitLfsPointers, assertNotGitLfsPointer } from "./git-lfs-pointer.mjs";
import { assertSafeAssetSegment, catalogRouteAliases, planAliasRedirects } from "../../tools/site/route-aliases.mjs";

/*
 * Engine version is derived from the repository, not restated here.
 *
 * This was hardcoded to "1.4.5" and blocked the 1.5.0 marketing build, because a release now has to remember to
 * edit a constant in a build script. The guard itself is worth keeping -- it stops the marketing site silently
 * drifting from the engine it claims to ship -- but the *expected* value belongs to the root manifest, which is
 * the thing the release actually bumps.
 */
const expectedEngineVersion = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8")
).version;
const expectedShowcaseAssetPackage = "@aura3d/showcase-assets-web";
/*
 * Pinned to a version that actually exists on npm.
 *
 * This tracked the engine version and read "1.4.5", but `@aura3d/showcase-assets-web` has only ever been published
 * up to **1.4.0** -- so the CDN URL it builds (`.../showcase-assets-web@1.4.5/aura-assets`) returns **HTTP 404**,
 * verified against jsDelivr. The asset package is versioned independently of the engine and is only republished
 * when the shared showcase assets change, so coupling it to the engine version was the bug. Bump this only when a
 * new asset-package version is actually published.
 */
const expectedShowcaseAssetVersion = "1.4.0";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const marketingDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(marketingDir, "..");
const distDir = path.join(marketingDir, "dist");
const rootViteConfig = path.join(repoRoot, "vite.config.ts");
const engineSourceEntry = path.join(repoRoot, "packages", "engine", "src", "agent-api", "index.ts");
/*
 * The app alias must point at the public entry, not agent-api/index.ts.
 * public/index.ts evaluates `src/lanes/index.ts`, which is what registers the
 * C-38 app extensions (`member: "camera"`, time, feel, lighting, ...). Aliasing
 * the agent-api entry left `appExtensionsAll()` empty in every built route, so
 * `app.camera` was undefined and `app.camera?.setPose()` silently did nothing:
 * shipped games rendered one static camera pose. Verified against the built
 * bundle: `prd08.camera"` was absent from the route chunk.
 */
const enginePublicEntry = path.join(repoRoot, "packages", "engine", "src", "public", "index.ts");
// PRD-15 split the agent API: the game presentation helpers now live in nodes/game.
const engineGameSource = path.join(repoRoot, "packages", "engine", "src", "agent-api", "nodes", "game", "index.ts");

const showcaseRoutes = [
  "showcase-index",
  "showcase-top-tennis",
  "showcase-roadster-rush",
  "showcase-heatsink",
  "showcase-teleoperator",
  "showcase-iron-crown",
  "showcase-pips-big-leap",
  "showcase-aura-hoops-3d",
  "showcase-aura-diamond-3d",
  "showcase-aura-fc-3d",
  "showcase-aura-links-3d",
  "showcase-bunker-zero",
  "showcase-slingshot-siege",
  "showcase-dot-dash-3d",
  "showcase-cross-hop",
  "showcase-strange-orbit-port",
  "showcase-splat-rush-port",
  "showcase-serpentine-sky-run-port",
  "showcase-drift-and-deliver-port",
  "showcase-heatsink-port",
  "showcase-ninja-runner-port",
  "showcase-last-train-port",
  "showcase-roadster-hours-port",
  "showcase-where-the-wind-wanders-port",
  "showcase-silt-and-signal-port",
  "showcase-cloud-runner-port"
];

const retiredPrototypeRoutes = [
  "aura-clash-showcase",
  "showcase-blockfall-reactor",
  "showcase-turbo-ball",
  "showcase-bean-brawl-race",
  "showcase-kart-havoc",
  "showcase-bank-shot",
  "showcase-aurora-lander",
  "showcase-vault-breakers",
  "showcase-product-configurator",
  "showcase-smart-city-control",
  "showcase-cinematic-architecture",
  "showcase-digital-twin-ops",
  "showcase-data-galaxy",
  "showcase-webgpu-particle-lab",
  "showcase-skyline-runner",
  "showcase-siege-golf",
  "showcase-mech-hangar",
  "showcase-patrol-wing",
  "showcase-turbo-drift-circuit",
  "showcase-gravity-post",
  "showcase-neon-swarm",
  "showcase-courier-rush",
  "showcase-orbital-defense",
  "showcase-pulse-tunnel",
  "showcase-gallery-shift",
  "showcase-deep-recovery",
  "showcase-rooftop-buckets",
  "loader-gltf-variants",
  "loader-obj",
  "texture-anisotropy",
  "postprocessing-depth-outline",
  "controls-trackball",
  "geometry-drawrange",
  "interactive-picking",
  "camera-multiple-views",
  "webxr-interactions"
];

const evidenceRoutes = [];

const publicRoutes = [...showcaseRoutes, ...evidenceRoutes];
const supersededPublicRoutes = [
  "showcase-material-asset-inspector",
  "showcase-public-racing-presentation-proof",
  "showcase-public-platformer-presentation-proof"
];
const reservedAliasRoutes = [...retiredPrototypeRoutes, ...supersededPublicRoutes, "aura-clash"];

const requiredPublicGameEngineHelpers = [
  "racingRoadMesh",
  "racingStartFinish",
  "publicRacingPresentation",
  "certifyRacingPresentation",
  "platformerGroundMesh",
  "platformerPlatformMesh",
  "platformerHazard",
  "platformerCheckpoint",
  "platformerFinish",
  "publicPlatformerPresentation",
  "certifyPlatformerPresentation"
];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertEngineBuildContract() {
  const marketingPackage = readJson(path.join(marketingDir, "package.json"));
  const packageDependency = marketingPackage.dependencies?.["@aura3d/engine"];
  if (packageDependency !== expectedEngineVersion) {
    throw new Error(`marketing/package.json must depend on @aura3d/engine@${expectedEngineVersion}; found ${packageDependency ?? "missing"}`);
  }

  if (!existsSync(rootViteConfig)) {
    throw new Error(`root Vite config is missing: ${rootViteConfig}`);
  }

  if (!existsSync(engineSourceEntry)) {
    throw new Error(`@aura3d/engine public agent-api source entry is missing: ${engineSourceEntry}`);
  }

  assertRequiredEngineSourceHelpers();
}

function assertShowcaseAssetsMaterialized() {
  assertNoGitLfsPointers(
    path.join(repoRoot, "public", "aura-assets"),
    "public/aura-assets"
  );
  for (const collection of ["apps", "examples"]) {
    const collectionDir = path.join(repoRoot, collection);
    if (!existsSync(collectionDir)) continue;
    for (const entry of readdirSync(collectionDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      assertNoGitLfsPointers(
        path.join(collectionDir, entry.name, "public", "aura-assets"),
        `${collection}/${entry.name}/public/aura-assets`
      );
    }
  }
}

function assertRequiredEngineSourceHelpers() {
  const engineSource = [engineSourceEntry, engineGameSource]
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const missingHelpers = requiredPublicGameEngineHelpers.filter((helper) => !engineSource.includes(`${helper}:`));
  if (missingHelpers.length > 0) {
    throw new Error(`@aura3d/engine public game presentation helpers are missing from source game API: ${missingHelpers.join(", ")}`);
  }
}

function writeViteConfig(tempDir) {
  const onlyRoute = process.env.AURA3D_ONLY_ROUTE?.trim();
  const routesToBuild = onlyRoute ? publicRoutes.filter((r) => r === onlyRoute) : publicRoutes;
  const routeInputs = Object.fromEntries(
    routesToBuild.map((route) => [route, path.join(repoRoot, "apps", route, "index.html")])
  );
  const retargetWorkerPath = path.join(repoRoot, "packages", "animation", "src", "pose", "retarget.worker.ts");
  const gamePackageEntry = path.join(repoRoot, "packages", "game", "src", "index.ts");

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
      { find: /^@aura3d\\/engine\\/game\\/art$/, replacement: ${JSON.stringify(path.join(repoRoot, "packages", "game", "src", "art", "index.ts"))} },
      { find: /^@aura3d\\/engine\\/game\\/capture$/, replacement: ${JSON.stringify(path.join(repoRoot, "packages", "game", "src", "capture", "index.ts"))} },
      { find: /^@aura3d\\/engine\\/game\\/util$/, replacement: ${JSON.stringify(path.join(repoRoot, "packages", "game", "src", "util", "index.ts"))} },
      { find: /^@aura3d\\/engine\\/game\\/styles\\.css$/, replacement: ${JSON.stringify(path.join(repoRoot, "packages", "game", "src", "styles.css"))} },
      { find: /^@aura3d\\/engine\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/game$/, replacement: ${JSON.stringify(gamePackageEntry)} },
      { find: /^@aura3d\\/engine$/, replacement: ${JSON.stringify(enginePublicEntry)} },
      ...rootAliases.filter((entry) => entry.find !== "@aura3d/engine")
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
    entries: ${JSON.stringify(Object.values(routeInputs), null, 4)},
    exclude: ["@aura3d/engine"]
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
  for (const route of publicRoutes) {
    const routeHealth = path.join(repoRoot, "apps", route, "route-health.json");
    if (!existsSync(routeHealth)) continue;
    const outputDir = path.join(distDir, "apps", route);
    cpSync(routeHealth, path.join(outputDir, "route-health.json"));
  }
  /*
   * Per-route public payloads (audio, textures, css, legacy bundles) are
   * served at both /apps/<route>/<name>/ and /<name>/ because route code
   * references them by absolute path. `aura-assets/` is excluded here: it is
   * mirrored once into dist/aura-assets by copyRouteLocalAuraAssets().
   */
  for (const route of publicRoutes) {
    const routePublic = path.join(repoRoot, "apps", route, "public");
    if (!existsSync(routePublic)) continue;
    for (const entry of readdirSync(routePublic, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "aura-assets") continue;
      const source = path.join(routePublic, entry.name);
      const targetRouteDir = path.join(distDir, "apps", route, entry.name);
      mkdirSync(targetRouteDir, { recursive: true });
      cpSync(source, targetRouteDir, { recursive: true });
      const targetRootDir = path.join(distDir, entry.name);
      mkdirSync(targetRootDir, { recursive: true });
      cpSync(source, targetRootDir, { recursive: true });
    }
  }
}

function lstatIfPresent(file) {
  try {
    return lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function requireDirectory(dir, label) {
  const stat = lstatIfPresent(dir);
  if (!stat?.isDirectory()) throw new Error(`${label} is missing or is not a real directory: ${dir}`);
}

function assertBuiltRootAssets(html, outputDir) {
  const content = readFileSync(html, "utf8");
  for (const match of content.matchAll(/\b(?:src|href)\s*=\s*(["'])(\/assets\/[^"']*)\1/gi)) {
    const assetUrl = match[2].split(/[?#]/, 1)[0];
    const parts = assetUrl.slice("/assets/".length).split("/");
    let file = path.join(outputDir, "assets");
    requireDirectory(file, "Built root assets directory");
    for (let i = 0; i < parts.length; i++) {
      assertSafeAssetSegment(parts[i]);
      file = path.join(file, parts[i]);
      if (i < parts.length - 1) requireDirectory(file, "Built root asset directory");
      else if (!lstatIfPresent(file)?.isFile()) throw new Error(`Missing or unsafe built root asset: ${file}`);
    }
  }
}

function sameFileBytes(left, right) {
  if (lstatSync(left).size !== lstatSync(right).size) return false;
  const leftFd = openSync(left, "r");
  let rightFd;
  try {
    rightFd = openSync(right, "r");
    const a = Buffer.alloc(64 * 1024);
    const b = Buffer.alloc(64 * 1024);
    let position = 0;
    for (;;) {
      const n = readSync(leftFd, a, 0, a.length, position);
      const m = readSync(rightFd, b, 0, b.length, position);
      if (n !== m || !a.subarray(0, n).equals(b.subarray(0, m))) return false;
      if (n === 0) return true;
      position += n;
    }
  } finally {
    closeSync(leftFd);
    if (rightFd !== undefined) closeSync(rightFd);
  }
}

// The normal build already copies public directories to the original route.
// Check every public descendant before advertising its alias. Shared Aura
// assets are deduplicated at /aura-assets and must be byte-identical there.
function assertBuiltPublicTree(source, target, compareBytes = false) {
  requireDirectory(source, "Route public directory");
  requireDirectory(target, "Built route public directory");
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    assertSafeAssetSegment(entry.name);
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const targetStat = lstatIfPresent(targetPath);
    if (entry.isDirectory()) {
      assertBuiltPublicTree(sourcePath, targetPath, compareBytes);
    } else if (entry.isFile()) {
      if (!targetStat?.isFile()) throw new Error(`Missing or unsafe built public asset: ${targetPath}`);
      if (compareBytes && !sameFileBytes(sourcePath, targetPath)) {
        throw new Error(`Shared Aura asset collision: ${sourcePath} differs from ${targetPath}`);
      }
    } else {
      throw new Error(`Unsafe route public asset (symlinks are not supported): ${sourcePath}`);
    }
  }
}

// Exported for fixture-only unit tests. No source public/_redirects is edited:
// Vite copied it to dist already, and only that output receives generated rules.
export function buildCatalogRouteAliases({ catalog, routes, reservedRoutes = [], rootDir, outDir }) {
  const aliases = catalogRouteAliases(catalog, routes, reservedRoutes);
  requireDirectory(rootDir, "Repository root");
  requireDirectory(path.join(rootDir, "apps"), "Repository apps directory");
  requireDirectory(outDir, "Build output");
  const outputApps = path.join(outDir, "apps");
  requireDirectory(outputApps, "Built apps directory");

  const redirectsPath = path.join(outDir, "_redirects");
  const redirectsStat = lstatIfPresent(redirectsPath);
  if (redirectsStat && !redirectsStat.isFile()) throw new Error(`Unsafe build _redirects: ${redirectsPath}`);
  const existingRedirects = redirectsStat ? readFileSync(redirectsPath, "utf8") : "";
  const entriesByApp = new Map();
  const publicFilesToCopy = [];

  for (const alias of aliases) {
    const appDir = path.join(rootDir, "apps", alias.appFolder);
    const builtDir = path.join(outputApps, alias.appFolder);
    requireDirectory(appDir, "Catalog app source");
    requireDirectory(builtDir, "Built catalog app source");
    const html = path.join(builtDir, "index.html");
    const htmlStat = lstatIfPresent(html);
    if (!htmlStat?.isFile() || htmlStat.size === 0) throw new Error(`Missing or unsafe built source HTML: ${html}`);
    assertBuiltRootAssets(html, outDir);

    const entries = new Map();
    for (const entry of readdirSync(builtDir, { withFileTypes: true })) {
      assertSafeAssetSegment(entry.name);
      if (entry.name === "index.html") continue;
      if (!entry.isFile() && !entry.isDirectory()) {
        throw new Error(`Unsafe built route asset (symlinks are not supported): ${path.join(builtDir, entry.name)}`);
      }
      entries.set(entry.name, { name: entry.name, kind: entry.isDirectory() ? "directory" : "file" });
    }

    const publicDir = path.join(appDir, "public");
    const publicStat = lstatIfPresent(publicDir);
    if (publicStat && !publicStat.isDirectory()) throw new Error(`Unsafe route public directory: ${publicDir}`);
    if (publicStat) {
      for (const entry of readdirSync(publicDir, { withFileTypes: true })) {
        assertSafeAssetSegment(entry.name);
        const source = path.join(publicDir, entry.name);
        const built = path.join(builtDir, entry.name);
        if (entry.name === "index.html" || entry.name === "route-health.json") {
          throw new Error(`Route public file collides with built output: ${source}`);
        }
        if (entry.name === "aura-assets") {
          if (!entry.isDirectory() || entries.has(entry.name)) throw new Error(`Unsafe or duplicate Aura assets: ${source}`);
          const sharedAssets = path.join(outDir, "aura-assets");
          if (!lstatIfPresent(sharedAssets)?.isDirectory()) {
            throw new Error(`Shared Aura assets for ${alias.url} are missing; CDN-only builds need an explicit route-local asset mapping: ${sharedAssets}`);
          }
          assertBuiltPublicTree(source, sharedAssets, true);
          entries.set(entry.name, { name: entry.name, kind: "directory", sharedAuraAssets: true });
        } else if (entry.isDirectory()) {
          if (entries.get(entry.name)?.kind !== "directory") throw new Error(`Missing built public directory: ${built}`);
          assertBuiltPublicTree(source, built);
        } else if (entry.isFile()) {
          assertNotGitLfsPointer(source, `Route public asset ${source}`);
          const builtStat = lstatIfPresent(built);
          if (builtStat && (!builtStat.isFile() || !sameFileBytes(source, built))) {
            throw new Error(`Route public file collides with built output: ${built}`);
          }
          if (!builtStat) publicFilesToCopy.push({ source, built });
          entries.set(entry.name, { name: entry.name, kind: "file" });
        } else {
          throw new Error(`Unsafe route public asset (symlinks are not supported): ${source}`);
        }
      }
    }
    entriesByApp.set(alias.appFolder, [...entries.values()]);
  }

  const plan = planAliasRedirects(aliases, entriesByApp, existingRedirects);
  for (const alias of aliases) {
    const targetDir = path.join(outputApps, alias.slug);
    const targetStat = lstatIfPresent(targetDir);
    if (!targetStat) continue;
    if (!targetStat.isDirectory() || plan.previous.get(alias.url) !== alias.sourceUrl) {
      throw new Error(`Catalog alias collides with existing build output: ${targetDir}`);
    }
    for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
      if (entry.name !== "index.html" || !entry.isFile()) {
        throw new Error(`Catalog alias contains unexpected build output: ${targetDir}/${entry.name}`);
      }
    }
  }

  // Preflight above covers every alias before any writes. Only HTML is copied;
  // nested public payloads keep their one existing copy under the source route.
  for (const file of publicFilesToCopy) copyFileSync(file.source, file.built, constants.COPYFILE_EXCL);
  for (const alias of aliases) {
    const targetDir = path.join(outputApps, alias.slug);
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(path.join(outputApps, alias.appFolder, "index.html"), path.join(targetDir, "index.html"));
  }
  if (aliases.length || redirectsStat) writeFileSync(redirectsPath, plan.text, "utf8");
  return aliases;
}

function ensureBuiltRouteFavicons() {
  for (const route of publicRoutes) {
    const builtHtml = path.join(distDir, "apps", route, "index.html");
    if (!existsSync(builtHtml)) continue;
    const html = readFileSync(builtHtml, "utf8");
    if (/rel=["'](?:shortcut )?icon["']/i.test(html)) continue;
    const withFavicon = html.replace(
      /(<meta\s+charset=[^>]+>)/i,
      `$1\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg">`
    );
    if (withFavicon === html) {
      throw new Error(`Could not inject the shared favicon into built route: ${builtHtml}`);
    }
    writeFileSync(builtHtml, withFavicon, "utf8");
  }
}

function copyAuraAssets() {
  const manifest = readJson(path.join(repoRoot, "aura.assets.json"));
  const manifestAssets = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const routeAssetIds = collectRouteAssetIds(manifestAssets);
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

  /*
   * GLB-embedded companion textures (e.g. `Textures/texture-e.png` referenced
   * by URI inside showcaseRunnerGirl) are invisible to the `assets.*` source
   * collector above, so they would 404 in production (seen live 2026-09-22 on
   * Gallery Shift). Mirror the whole companion directory when present.
   */
  const companionTextures = path.join(repoRoot, "public", "aura-assets", "Textures");
  if (existsSync(companionTextures)) {
    assertNoGitLfsPointers(companionTextures, "public/aura-assets/Textures");
    const target = path.join(distDir, "aura-assets", "Textures");
    mkdirSync(target, { recursive: true });
    cpSync(companionTextures, target, { recursive: true });
    console.log(`Mirrored GLB companion textures to aura-assets/Textures/.`);
  }

  for (const sharedPublicSubdir of ["aura-environments", "aura-decoders", "hdri", "packs", "probes"]) {
    const sourceSubdir = path.join(repoRoot, "public", sharedPublicSubdir);
    if (existsSync(sourceSubdir)) {
      const targetSubdir = path.join(distDir, sharedPublicSubdir);
      mkdirSync(targetSubdir, { recursive: true });
      cpSync(sourceSubdir, targetSubdir, { recursive: true, dereference: true, force: true });
      console.log(`Mirrored public/${sharedPublicSubdir} to ${sharedPublicSubdir}/.`);
    }
  }

  for (const route of showcaseRoutes) {
    const routePublicAssets = path.join(repoRoot, "apps", route, "public", "aura-assets");
    if (existsSync(routePublicAssets)) {
      copyRouteLocalAuraAssets(route);
    }
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

function collectRouteAssetIds(manifestAssets) {
  const routeAssetIds = new Set();
  const assetReferencePattern = /(?:assets|rootAssets)(?:\s+as\s+any\))?\.([A-Za-z0-9_$]+)/g;
  const routeEntries = [
    ...publicRoutes.map((route) => [route, path.join(repoRoot, "apps", route, "src")])
  ];
  for (const [route, routeDir] of routeEntries) {
    if (!existsSync(routeDir)) continue;
    const routeFiles = collectRouteFiles(routeDir);
    const routeSource = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    for (const [assetId, asset] of manifestAssets) {
      const sourcePaths = [asset.source, asset.provenance?.sourcePath].filter(
        (value) => typeof value === "string"
      );
      if (
        sourcePaths.some((value) => value.replaceAll("\\", "/").startsWith(`apps/${route}/`))
        || routeSource.includes(assetId)
      ) {
        routeAssetIds.add(assetId);
      }
    }

    for (const file of routeFiles) {
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
  assertNotGitLfsPointer(source, `Website showcase asset ${assetUrl}`);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function copyRouteLocalAuraAssets(route) {
  const source = path.join(repoRoot, "apps", route, "public", "aura-assets");
  const target = path.join(distDir, "aura-assets");
  const rootAuraAssets = path.join(repoRoot, "public", "aura-assets");
  if (!existsSync(source)) throw new Error(`route-local Aura assets are missing: ${source}`);
  assertNoGitLfsPointers(source, `apps/${route}/public/aura-assets`);
  mkdirSync(target, { recursive: true });
  const copyMissingOnly = (srcDir, dstDir, rootCheckDir) => {
    mkdirSync(dstDir, { recursive: true });
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = path.join(dstDir, entry.name);
      const rootPath = path.join(rootCheckDir, entry.name);
      if (entry.isDirectory()) {
        copyMissingOnly(srcPath, dstPath, rootPath);
      } else if (!existsSync(dstPath)) {
        if (existsSync(rootPath)) {
          copyFileSync(rootPath, dstPath);
        } else {
          copyFileSync(srcPath, dstPath);
        }
      }
    }
  };
  copyMissingOnly(source, target, rootAuraAssets);
}

function assertBuiltRoutes() {
  assertNoGitLfsPointers(distDir, "marketing/dist");

  for (const route of supersededPublicRoutes) {
    const staleRoute = path.join(distDir, "apps", route);
    rmSync(staleRoute, { recursive: true, force: true });
    const stalePoster = path.join(distDir, "previews", "showcase", `${route}.png`);
    rmSync(stalePoster, { force: true });
  }

  for (const route of publicRoutes) {
    const builtHtml = path.join(distDir, "apps", route, "index.html");
    if (!existsSync(builtHtml)) {
      throw new Error(`showcase route did not build: ${builtHtml}`);
    }
  }

  for (const route of supersededPublicRoutes) {
    if (existsSync(path.join(distDir, "apps", route, "index.html"))) {
      throw new Error(`superseded or duplicate route must not be published by marketing build: ${route}`);
    }
    if (existsSync(path.join(distDir, "previews", "showcase", `${route}.png`))) {
      throw new Error(`superseded or duplicate poster must not be published by marketing build: ${route}`);
    }
  }

  const redirectHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/apps/showcase-index/"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Aura3D Showcase</title><script>window.location.replace("/apps/showcase-index/");</script></head><body style="background:#fbfbf8;color:#1a1e26;font-family:sans-serif;padding:24px">Redirecting to <a href="/apps/showcase-index/" style="color:#0e6b7c">Aura3D Showcase Index</a>...</body></html>\n`;

  for (const route of retiredPrototypeRoutes) {
    const retiredDir = path.join(distDir, "apps", route);
    rmSync(retiredDir, { recursive: true, force: true });
    mkdirSync(retiredDir, { recursive: true });
    writeFileSync(path.join(retiredDir, "index.html"), redirectHtml, "utf8");
  }

  for (const clashPath of [
    ["showcase", "aura-clash"],
    ["showcase", "aura-clash", "playable"],
    ["apps", "aura-clash"]
  ]) {
    const targetDir = path.join(distDir, ...clashPath);
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(path.join(targetDir, "index.html"), redirectHtml, "utf8");
  }

  const retiredCorridorDir = path.join(distDir, "examples", "neon-corridor-strike");
  rmSync(retiredCorridorDir, { recursive: true, force: true });
  mkdirSync(retiredCorridorDir, { recursive: true });
  writeFileSync(path.join(retiredCorridorDir, "index.html"), redirectHtml, "utf8");
}

function main() {
  assertEngineBuildContract();
  const catalog = readJson(path.join(repoRoot, "tools", "site", "games.catalog.json"));
  // Validate catalog paths/collisions before starting the expensive Vite build.
  catalogRouteAliases(catalog, publicRoutes, reservedAliasRoutes);
  const showcaseAssetBaseUrl = resolveShowcaseAssetBaseUrl();
  if (!showcaseAssetBaseUrl) assertShowcaseAssetsMaterialized();
  const tempDir = mkdtempSync(path.join(tmpdir(), "aura3d-marketing-showcase-"));
  try {
    const configPath = writeViteConfig(tempDir);
    runViteBuild(configPath);
    ensureBuiltRouteFavicons();
    copyRouteHealth();
    if (showcaseAssetBaseUrl) {
      removeLocalAuraAssets(distDir);
    } else if (!process.env.AURA3D_ONLY_ROUTE || !existsSync(path.join(distDir, "aura-assets"))) {
      copyAuraAssets();
    }
    assertBuiltRoutes();
    const aliases = buildCatalogRouteAliases({ catalog, routes: publicRoutes, reservedRoutes: reservedAliasRoutes, rootDir: repoRoot, outDir: distDir });
    // Copy aliases before the optional CDN pass so both HTML copies and any
    // newly included route-local public files receive identical URL rewriting.
    if (showcaseAssetBaseUrl) rewriteBuiltAuraAssetUrls(distDir, showcaseAssetBaseUrl);
    console.log(`Built ${showcaseRoutes.length} showcase routes, ${aliases.length} catalog aliases, and ${evidenceRoutes.length} evidence routes with the local @aura3d/engine public source (lanes included) for package version ${expectedEngineVersion}.`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
