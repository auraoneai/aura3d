import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { createReadStream } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import rootConfig from "../vite.config";

const marketingDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(marketingDir, "..");
const rootServer = typeof rootConfig.server === "object" ? rootConfig.server : {};

const docsDir = resolve(marketingDir, "docs");
const appInputs = [
  "apps/wow-concept-car-cinema/index.html",
  "apps/wow-damaged-helmet-pbr-detail/index.html"
];
const htmlInputs = Object.fromEntries([
  ["index", resolve(marketingDir, "index.html")],
  ...readdirSync(docsDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [
      `docs/${file.replace(/\.html$/, "")}`,
      resolve(docsDir, file)
    ] as const),
  ...appInputs.map((file) => [
    file.replace(/\/index\.html$/, "/index"),
    resolve(repoRoot, file)
  ] as const)
]);

function serveRootAuraAssets() {
  const rootAuraAssetsDir = resolve(repoRoot, "public/aura-assets");
  const marketingAuraAssetsDir = resolve(marketingDir, "public/aura-assets");
  return {
    name: "aura3d-serve-root-aura-assets",
    configureServer(server: { middlewares: { use: (m: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const path = (request.url ?? "").split("?")[0] ?? "";
        if (!path.startsWith("/aura-assets/") && !path.startsWith("/previews/")) {
          next();
          return;
        }
        let candidates: string[] = [];
        if (path.startsWith("/aura-assets/")) {
          const file = path.replace(/^\/aura-assets\//, "");
          candidates = [
            resolve(marketingAuraAssetsDir, file),
            resolve(rootAuraAssetsDir, file),
          ];
        } else if (path.startsWith("/previews/")) {
          const file = path.replace(/^\/previews\//, "");
          candidates = [
            resolve(marketingDir, "public/previews", file),
            resolve(repoRoot, "public/previews", file),
            resolve(marketingDir, "public/previews/showcase-index", file),
            resolve(repoRoot, "public/previews/showcase-index", file),
          ];
        }
        const found = candidates.find((candidate) => existsSync(candidate));
        if (!found) {
          next();
          return;
        }
        const ext = extname(found);
        const contentTypes: Record<string, string> = {
          ".glb": "model/gltf-binary",
          ".gltf": "model/gltf+json",
          ".wasm": "application/wasm",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".wav": "audio/wav",
          ".mp3": "audio/mpeg",
          ".ogg": "audio/ogg",
          ".json": "application/json",
        };
        response.setHeader("Content-Type", contentTypes[ext] ?? "application/octet-stream");
        createReadStream(found).pipe(response);
      });
    }
  };
}

function copyMarketingPublicFiles() {
  return {
    name: "aura3d-marketing-public-files",
    closeBundle() {
      const outDir = resolve(marketingDir, "dist");
      mkdirSync(outDir, { recursive: true });
      mirrorMarketingHtmlOutput(outDir);
      copyAdvancedGalleryAssets(outDir);
      for (const file of ["favicon.svg", "favicon.ico", "robots.txt", "sitemap.xml", "llms.txt", "llms-full.txt"]) {
        const marketingSource = resolve(marketingDir, file);
        const source = existsSync(marketingSource) ? marketingSource : resolve(repoRoot, file);
        if (existsSync(source)) copyFileSync(source, resolve(outDir, file));
      }

      const dracoDir = resolveDracoDir();
      if (dracoDir) {
        const targetDir = resolve(outDir, "node_modules/draco3d");
        mkdirSync(targetDir, { recursive: true });
        for (const file of ["draco_decoder_nodejs.js", "draco_decoder.wasm"]) {
          copyFileSync(resolve(dracoDir, file), resolve(targetDir, file));
        }
      }
    }
  };
}

function copyDir(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = resolve(sourceDir, entry.name);
    const target = resolve(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target);
    } else if (entry.isFile()) {
      copyFileSync(source, target);
    }
  }
}

function copyAdvancedGalleryAssets(outDir: string): void {
  // The asset-corpus fixtures live outside git (.gitignore fixtures/ with a
  // tracked allow-list), so remote builds without the local corpus (CI
  // filmstrip runs) may not have them. Default behavior stays a hard error —
  // only AURA3D_ALLOW_MISSING_FIXTURES=1 degrades to skip-with-warning, and
  // production deploys never set it (they build on a corpus-complete machine).
  const allowMissing = process.env.AURA3D_ALLOW_MISSING_FIXTURES === "1";
  const fixtureFiles = [
    "fixtures/advanced-gallery/assets/water-cinematic-marina-blender/water-cinematic-marina-blender.glb",
    "fixtures/threejs-parity/assets/physics/duck.glb",
    "fixtures/advanced-gallery/assets/ocean-observatory-cinematic-blender/ocean-observatory-cinematic-blender.glb",
    "fixtures/threejs-parity/assets/materials/compare-transmission.glb",
    "fixtures/advanced-gallery/assets/reactor-command-center-blender/reactor-command-center-blender.glb",
    "fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb",
    "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
    "fixtures/advanced-gallery/assets/robotics-training-lab-blender/robotics-training-lab-blender.glb",
    "fixtures/threejs-parity/assets/character/soldier.glb",
    "fixtures/threejs-parity/assets/character/robot-expressive.glb",
    "fixtures/advanced-gallery/assets/physics-robotics-testbed-blender/physics-robotics-testbed-blender.glb",
    "fixtures/advanced-gallery/assets/fog-cathedral-blender/fog-cathedral-blender.glb",
    "fixtures/advanced-gallery/assets/digital-twin-factory-blender/digital-twin-factory-blender.glb",
    "fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb",
    "fixtures/advanced-gallery/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb",
    "fixtures/advanced-gallery/assets/product-configurator-car-batched/car-concept-batched.glb",
    "fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb",
    "fixtures/workflow-assets/assets/material-spheres/material-spheres.glb",
    "fixtures/workflow-assets/assets/product-camera/product-camera.glb",
    "fixtures/workflow-assets/assets/variant-product/variant-product.glb",
    "fixtures/asset-corpus/damaged-helmet.glb",
    "fixtures/asset-corpus/avocado.glb",
    "fixtures/asset-corpus/boom-box.glb",
    "fixtures/asset-corpus/clear-coat-test.glb",
    "fixtures/asset-corpus/sheen-test-grid.glb",
    "fixtures/asset-corpus/antique-camera.glb",
    "fixtures/asset-corpus/duck.glb",
    "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    "fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr"
  ];
  const missing: string[] = [];
  for (const fixtureFile of fixtureFiles) {
    const source = resolve(repoRoot, fixtureFile);
    if (!existsSync(source)) {
      if (allowMissing) { missing.push(fixtureFile); continue; }
      throw new Error(`Advanced-gallery production asset is missing: ${source}`);
    }
    const target = resolve(outDir, fixtureFile);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  if (missing.length > 0) {
    console.warn(`[marketing-build] skipped ${missing.length} advanced-gallery fixtures absent from this machine (AURA3D_ALLOW_MISSING_FIXTURES=1)`);
  }

  const smartCitySource = resolve(repoRoot, "fixtures/advanced-gallery/assets/smart-city-district");
  if (!existsSync(smartCitySource)) {
    if (allowMissing) { console.warn("[marketing-build] skipped smart-city-district fixtures (absent)"); return; }
    throw new Error(`Advanced-gallery smart-city asset directory is missing: ${smartCitySource}`);
  }
  copyDir(smartCitySource, resolve(outDir, "fixtures/advanced-gallery/assets/smart-city-district"));
}

function copyAuraClashRuntimeAssets(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    copyFileSync(resolve(sourceDir, entry.name), resolve(targetDir, entry.name));
  }
}

function pruneAuraClashRuntimeAssets(targetDir: string): void {
  if (!existsSync(targetDir)) return;
  for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    unlinkSync(resolve(targetDir, entry.name));
  }
}

function mirrorMarketingHtmlOutput(outDir: string): void {
  const generatedMarketingDir = resolve(outDir, "marketing");
  const generatedMarketingIndex = resolve(generatedMarketingDir, "index.html");
  const generatedDocsDir = resolve(generatedMarketingDir, "docs");
  if (existsSync(generatedMarketingIndex)) {
    copyFileSync(generatedMarketingIndex, resolve(outDir, "index.html"));
  }

  const publicDocsDir = resolve(outDir, "docs");
  if (!existsSync(generatedDocsDir)) return;
  mkdirSync(publicDocsDir, { recursive: true });
  for (const file of readdirSync(generatedDocsDir)) {
    if (!file.endsWith(".html")) continue;
    copyFileSync(resolve(generatedDocsDir, file), resolve(publicDocsDir, file));
  }
}

function resolveDracoDir(): string | undefined {
  const directCandidates = [
    resolve(repoRoot, "node_modules/draco3d"),
    resolve(marketingDir, "node_modules/draco3d")
  ];
  for (const candidate of directCandidates) {
    if (
      existsSync(resolve(candidate, "draco_decoder_nodejs.js")) &&
      existsSync(resolve(candidate, "draco_decoder.wasm"))
    ) {
      return candidate;
    }
  }

  const pnpmDir = resolve(repoRoot, "node_modules/.pnpm");
  if (!existsSync(pnpmDir)) return undefined;
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith("draco3d@")) continue;
    const candidate = resolve(pnpmDir, entry, "node_modules/draco3d");
    if (
      existsSync(resolve(candidate, "draco_decoder_nodejs.js")) &&
      existsSync(resolve(candidate, "draco_decoder.wasm"))
    ) {
      return candidate;
    }
  }
  return undefined;
}

function resolveRetargetWorker() {
  const target = resolve(repoRoot, "packages/animation/src/pose/retarget.worker.ts");
  return {
    name: "resolve-retarget-worker",
    resolveId(id: string) {
      if (
        id.endsWith("packages/animation/src/pose/retarget.worker.js") ||
        id.endsWith("packages/animation/src/pose/retarget.worker.ts")
      ) {
        return target;
      }
      return null;
    }
  };
}

export default defineConfig({
  root: repoRoot,
  publicDir: resolve(marketingDir, "public"),
  plugins: [
    resolveRetargetWorker(),
    ...(rootConfig.plugins ?? []),
    serveRootAuraAssets(),
    copyMarketingPublicFiles()
  ],
  worker: {
    plugins: () => [resolveRetargetWorker(), ...(rootConfig.plugins ?? [])]
  },
  resolve: rootConfig.resolve,
  optimizeDeps: rootConfig.optimizeDeps,
  server: {
    ...rootServer,
    host: "127.0.0.1",
    port: 7782,
    strictPort: true
  },
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 650,
    outDir: resolve(marketingDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: htmlInputs
    }
  }
});

