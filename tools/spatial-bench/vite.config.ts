// Two entries (aura.html, three.html) built for production. @aura3d/* resolves to the workspace sources through the repo's
// generated alias table, so the Aura3D arm measures the current checkout, not a published tarball.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { aliasEntries } from "../../vite.aliases.generated";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "../..");
const NODE_BUILTINS = /^(node:)?(fs|path|crypto|url|os|zlib|stream|util|buffer|module|child_process|worker_threads)$/;
const nodeBuiltinStubs = () => ({
  name: "node-builtin-stubs",
  enforce: "pre" as const,
  resolveId(id: string) { if (NODE_BUILTINS.test(id)) return `\0stub:${id}`; },
  load(id: string) { if (id.startsWith("\0stub:")) return { code: "export default {};", syntheticNamedExports: true }; }
});

let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: REPO }).toString().trim(); } catch { /* not a checkout */ }

export default defineConfig({
  root: here,
  plugins: [nodeBuiltinStubs()],
  define: { __AURA_COMMIT__: JSON.stringify(commit) },
  resolve: {
    alias: (aliasEntries as ReadonlyArray<readonly [string, string]>).map(([find, replacement]) => ({ find, replacement: resolve(REPO, replacement) }))
  },
  server: { fs: { allow: [REPO] } },
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 100000,
    rollupOptions: { input: { aura: resolve(here, "aura.html"), three: resolve(here, "three.html") } }
  }
});
