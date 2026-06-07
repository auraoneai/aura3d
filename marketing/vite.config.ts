import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../vite.config";

const marketingDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(marketingDir, "..");
const rootServer = typeof rootConfig.server === "object" ? rootConfig.server : {};

const docsDir = resolve(marketingDir, "docs");
const appInputs = [
  "apps/advanced-examples-gallery/index.html",
  "apps/wow-boombox-texture-lab/index.html",
  "apps/wow-concept-car-cinema/index.html",
  "apps/wow-damaged-helmet-pbr-detail/index.html",
  "apps/wow-simple-transforms/index.html",
  "apps/wow-standard-material-spheres/index.html",
  "apps/wow-tokyo-keyframes/index.html",
  "apps/wow-webgpu-compute-particles/index.html"
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

function copyMarketingPublicFiles() {
  return {
    name: "aura3d-marketing-public-files",
    closeBundle() {
      const outDir = resolve(marketingDir, "dist");
      mkdirSync(outDir, { recursive: true });
      mirrorMarketingHtmlOutput(outDir);
      for (const file of ["favicon.svg", "robots.txt", "sitemap.xml", "llms.txt"]) {
        const marketingSource = resolve(marketingDir, file);
        const source = existsSync(marketingSource) ? marketingSource : resolve(repoRoot, file);
        if (existsSync(source)) copyFileSync(source, resolve(outDir, file));
      }

      copyAuraClashApp(outDir);

      const auraClashAssetsDir = resolve(repoRoot, "apps/aura-clash-showcase/public/aura-assets");
      if (existsSync(auraClashAssetsDir)) {
        pruneAuraClashRuntimeAssets(resolve(outDir, "aura-assets"));
        copyAuraClashRuntimeAssets(auraClashAssetsDir, resolve(outDir, "aura-assets"));
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

function copyAuraClashApp(outDir: string): void {
  const sourceDir = resolve(repoRoot, "apps/aura-clash-showcase/dist");
  if (!existsSync(resolve(sourceDir, "index.html"))) return;

  copyDir(resolve(sourceDir, "assets"), resolve(outDir, "assets"));
  const routeRoots = [
    "apps/aura-clash-showcase",
    "apps/aura-clash",
    "showcase/aura-clash"
  ];
  const routeLeaves = [
    "",
    "playable",
    "evidence",
    "accessibility",
    "deploy-check",
    "poster"
  ];
  for (const routeRoot of routeRoots) {
    for (const routeLeaf of routeLeaves) {
      const targetDir = routeLeaf ? resolve(outDir, routeRoot, routeLeaf) : resolve(outDir, routeRoot);
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(resolve(sourceDir, "index.html"), resolve(targetDir, "index.html"));
    }
  }

  for (const routeLeaf of ["playable", "evidence", "accessibility", "deploy-check", "poster"]) {
    const targetDir = resolve(outDir, routeLeaf);
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(resolve(sourceDir, "index.html"), resolve(targetDir, "index.html"));
  }

  for (const file of ["robots.txt", "sitemap.xml"]) {
    const source = resolve(repoRoot, "apps/aura-clash-showcase", file);
    if (!existsSync(source)) continue;
    mkdirSync(resolve(outDir, "apps/aura-clash-showcase"), { recursive: true });
    mkdirSync(resolve(outDir, "apps/aura-clash"), { recursive: true });
    mkdirSync(resolve(outDir, "showcase/aura-clash"), { recursive: true });
    copyFileSync(source, resolve(outDir, "apps/aura-clash-showcase", file));
    copyFileSync(source, resolve(outDir, "apps/aura-clash", file));
    copyFileSync(source, resolve(outDir, "showcase/aura-clash", file));
  }
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
  const generatedIndex = resolve(generatedMarketingDir, "index.html");
  if (existsSync(generatedIndex)) {
    copyFileSync(generatedIndex, resolve(outDir, "index.html"));
  }

  const generatedDocsDir = resolve(generatedMarketingDir, "docs");
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

export default defineConfig({
  root: repoRoot,
  publicDir: resolve(marketingDir, "public"),
  plugins: [
    ...(rootConfig.plugins ?? []),
    copyMarketingPublicFiles()
  ],
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
