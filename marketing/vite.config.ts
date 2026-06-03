import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
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
      for (const file of ["favicon.svg", "robots.txt", "sitemap.xml", "llms.txt"]) {
        const source = resolve(repoRoot, file);
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
    outDir: resolve(marketingDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: htmlInputs
    }
  }
});
