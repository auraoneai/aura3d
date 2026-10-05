import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import rootConfig from "../../vite.config";
import { benchmarkAssetFiles } from "./shared/assets";

/*
 * Same alias strategy as apps/showcase-* vite configs: reuse the repo-root
 * `resolve.alias` table, which maps `@aura3d/engine` (and every other
 * `@aura3d/*` package) to its TypeScript source, so no package build is needed.
 * `three` resolves from the repo-root devDependency (pinned to 0.185.1).
 */
const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchmarkDir, "../..");

function readVersion(packageJsonPath: string): string {
  return (JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }).version;
}

const auraVersion = readVersion(resolve(repoRoot, "package.json"));
const threeVersion = readVersion(resolve(repoRoot, "node_modules/three/package.json"));
if (threeVersion !== "0.185.1") {
  throw new Error(`quality-rebuild requires three@0.185.1, found ${threeVersion} in node_modules/three`);
}

/** Serves (dev) and copies (build) the shared asset table so both engines load identical bytes from /qr-assets/. */
function qualityRebuildAssets(): Plugin {
  const files = benchmarkAssetFiles();
  let outDir = resolve(benchmarkDir, "dist");
  return {
    name: "quality-rebuild-assets",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? "").split("?")[0] ?? "";
        const match = files.find((file) => file.url === path);
        if (!match) {
          next();
          return;
        }
        const source = resolve(repoRoot, match.repoPath);
        if (!existsSync(source)) {
          response.statusCode = 404;
          response.end(`missing benchmark asset ${match.repoPath}`);
          return;
        }
        response.setHeader("Content-Type", path.endsWith(".hdr") ? "application/octet-stream" : "model/gltf-binary");
        createReadStream(source).pipe(response);
      });
    },
    closeBundle() {
      const target = resolve(outDir, "qr-assets");
      mkdirSync(target, { recursive: true });
      // Missing or unfetched-LFS assets are skipped (and listed) instead of failing the build,
      // so the unaffected scenes still capture; affected scenes then report load errors.
      const skipped: { repoPath: string; reason: string }[] = [];
      for (const file of files) {
        const source = resolve(repoRoot, file.repoPath);
        if (!existsSync(source)) {
          skipped.push({ repoPath: file.repoPath, reason: "missing" });
          continue;
        }
        const head = readFileSync(source).subarray(0, 64).toString("utf8");
        if (head.startsWith("version https://git-lfs")) {
          skipped.push({ repoPath: file.repoPath, reason: "unfetched Git LFS pointer (check out with lfs: true or run git lfs pull)" });
          continue;
        }
        copyFileSync(source, resolve(target, basename(file.url)));
      }
      writeFileSync(resolve(target, "asset-copy-report.json"), JSON.stringify({ copied: files.length - skipped.length, skipped }, null, 2));
      for (const item of skipped) this.warn(`quality-rebuild asset skipped: ${item.repoPath} (${item.reason})`);
    }
  };
}

export default defineConfig({
  root: benchmarkDir,
  base: "./",
  publicDir: false,
  plugins: [qualityRebuildAssets()],
  resolve: rootConfig.resolve,
  define: {
    __AURA3D_VERSION__: JSON.stringify(auraVersion),
    __THREE_VERSION__: JSON.stringify(threeVersion)
  },
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: false,
    fs: { allow: [repoRoot] }
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: resolve(benchmarkDir, "index.html")
    }
  }
});
