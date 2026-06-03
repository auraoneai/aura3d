import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import rootConfig from "../vite.config";

const marketingDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(marketingDir, "..");
const rootServer = typeof rootConfig.server === "object" ? rootConfig.server : {};

const docsDir = resolve(marketingDir, "docs");
const htmlInputs = Object.fromEntries([
  ["marketing/index", resolve(marketingDir, "index.html")],
  ...readdirSync(docsDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [
      `marketing/docs/${file.replace(/\.html$/, "")}`,
      resolve(docsDir, file)
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
    }
  };
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
