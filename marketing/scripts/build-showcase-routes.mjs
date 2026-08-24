import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { removeLocalAuraAssets, rewriteBuiltAuraAssetUrls } from "./showcase-cdn-assets.mjs";

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

const showcaseRoutes = [
  "showcase-index",
  "showcase-product-configurator",
  "showcase-smart-city-control",
  "showcase-cinematic-architecture",
  "showcase-digital-twin-ops",
  "showcase-blockfall-reactor",
  "showcase-turbo-drift-circuit",
  "showcase-skyline-runner",
  "showcase-gravity-post",
  "showcase-aurora-lander",
  "showcase-siege-golf",
  "showcase-neon-swarm",
  "showcase-courier-rush",
  "showcase-pulse-tunnel",
  "showcase-mech-hangar",
  "showcase-vault-breakers",
  "showcase-bank-shot",
  "showcase-patrol-wing",
  "showcase-gallery-shift",
  "showcase-deep-recovery",
  "showcase-rooftop-buckets",
  "showcase-data-galaxy",
  "showcase-webgpu-particle-lab"
];

const evidenceRoutes = [
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

const publicRoutes = [...showcaseRoutes, ...evidenceRoutes];

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

function assertRequiredEngineSourceHelpers() {
  const engineSource = readFileSync(engineSourceEntry, "utf8");
  const missingHelpers = requiredPublicGameEngineHelpers.filter((helper) => !engineSource.includes(`${helper}:`));
  if (missingHelpers.length > 0) {
    throw new Error(`@aura3d/engine public game presentation helpers are missing from source game API: ${missingHelpers.join(", ")}`);
  }
}

function writeViteConfig(tempDir) {
  const routeInputs = Object.fromEntries(
    publicRoutes.map((route) => [route, path.join(repoRoot, "apps", route, "index.html")])
  );

  const configPath = path.join(tempDir, "vite.config.mjs");
  writeFileSync(
    configPath,
    `import rootConfig from ${JSON.stringify(rootViteConfig)};

const rootAliases = Array.isArray(rootConfig.resolve?.alias) ? rootConfig.resolve.alias : [];

export default {
  root: ${JSON.stringify(repoRoot)},
  publicDir: false,
  base: "/",
  resolve: {
    alias: [
      { find: /^@aura3d\\/engine$/, replacement: ${JSON.stringify(engineSourceEntry)} },
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
  const assetReferencePattern = /\bassets\.([A-Za-z0-9_$]+)\b/g;
  for (const route of publicRoutes) {
    const routeDir = path.join(repoRoot, "apps", route, "src");
    if (!existsSync(routeDir)) continue;
    const routeFiles = collectRouteFiles(routeDir);
    const routeSource = routeFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    /*
     * Keep route-local assets even when a game selects them through a
     * generated key (for example `bankShotBall${number}`) instead of a
     * statically analyzable `assets.foo` member. The old collector copied only
     * the first ball and left the rest as production 404s, which caused the
     * renderer to wait on an incomplete scene and present a blank canvas.
     * Matching the manifest source path also keeps this bounded to the route's
     * own authored asset folder rather than shipping the entire catalog.
     * Shared set-dressing IDs are included when their literal typed key is
     * present in the route source (for example Patrol Wing's island props).
     */
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
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function assertBuiltRoutes() {
  const auraClashPlayable = path.join(distDir, "showcase", "aura-clash", "playable", "index.html");
  if (!existsSync(auraClashPlayable)) {
    throw new Error(`homepage Aura Clash playable route was not emitted: ${auraClashPlayable}`);
  }

  /*
   * Routes that must not appear in the published site.
   *
   * `showcase-public-racing-presentation-proof` and `showcase-public-platformer-presentation-proof`
   * were deleted from `apps/` outright: they were superseded by Turbo Drift Circuit and Skyline Runner,
   * and keeping them as "historical certification evidence" meant two low-quality public routes stayed
   * shippable and kept consuming review, screenshot and gate budget. They stay listed here so a stale
   * `dist/` from an older build is still pruned.
   */
  const supersededPublicRoutes = [
    "showcase-material-asset-inspector",
    "showcase-public-racing-presentation-proof",
    "showcase-public-platformer-presentation-proof"
  ];
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

  for (const route of ["showcase-turbo-drift-circuit", "showcase-skyline-runner"]) {
    const publicHtml = path.join(distDir, "apps", route, "index.html");
    if (!existsSync(publicHtml)) {
      throw new Error(`release-ready game route must be published by marketing build: ${publicHtml}`);
    }
  }

}

function main() {
  assertEngineBuildContract();
  const showcaseAssetBaseUrl = resolveShowcaseAssetBaseUrl();
  const tempDir = mkdtempSync(path.join(tmpdir(), "aura3d-marketing-showcase-"));
  try {
    const configPath = writeViteConfig(tempDir);
    runViteBuild(configPath);
    ensureBuiltRouteFavicons();
    copyRouteHealth();
    if (showcaseAssetBaseUrl) {
      removeLocalAuraAssets(distDir);
      rewriteBuiltAuraAssetUrls(distDir, showcaseAssetBaseUrl);
    } else {
      copyAuraAssets();
    }
    assertBuiltRoutes();
    console.log(`Built ${showcaseRoutes.length} showcase routes and ${evidenceRoutes.length} evidence routes with local @aura3d/engine agent-api source for package version ${expectedEngineVersion}.`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

main();
