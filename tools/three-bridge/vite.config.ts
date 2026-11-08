// Two entries: three.html (the three.js original) and aura.html (the bridged Aura3D scene). @aura3d/* resolves to the
// workspace sources through the repo's generated alias table; three resolves from this folder's own node_modules.
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

export default defineConfig({
  root: here,
  publicDir: resolve(here, "public"),
  plugins: [nodeBuiltinStubs()],
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
