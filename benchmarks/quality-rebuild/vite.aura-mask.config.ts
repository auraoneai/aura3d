/** Isolated native mask entry; it does not load the mixed benchmark config. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { aliasEntries } from "../../vite.aliases.generated";

const benchmarkRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchmarkRoot, "../..");
const version = (JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as { version: string }).version;

export default defineConfig({
  root: benchmarkRoot,
  base: "./",
  publicDir: false,
  resolve: {
    alias: aliasEntries.filter(([name]) => !name.endsWith("/three")).map(([find, target]) => ({ find, replacement: resolve(repoRoot, target) }))
  },
  define: { __AURA3D_VERSION__: JSON.stringify(version) },
  server: { host: "127.0.0.1", port: 5200, strictPort: false, fs: { allow: [repoRoot] } },
  build: { target: "es2022", outDir: "dist-aura-mask", emptyOutDir: true, rollupOptions: { input: resolve(benchmarkRoot, "aura-mask.html") } }
});
