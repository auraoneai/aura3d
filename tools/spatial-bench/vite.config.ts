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

// Diagnosis (E6-02): SB_EXPERIMENT=1 swaps two engine files for the patched COPIES under experiments/ (A/B probes only).
// Relative imports inside a copy resolve against the ORIGINAL file's directory, so the copy behaves exactly like the original.
const EXPERIMENT_FILES: Record<string, string> = {
  [resolve(REPO, "packages/engine/src/agent-api/app/runtimeNodes.ts")]: resolve(here, "experiments/runtimeNodes.ts"),
  [resolve(REPO, "packages/engine/src/agent-api/compiler/primitives.ts")]: resolve(here, "experiments/primitives.ts")
};
const experimentSwap = () => {
  const reverse = new Map(Object.entries(EXPERIMENT_FILES).map(([orig, copy]) => [copy, orig]));
  return {
    name: "sb-experiment-swap",
    enforce: "pre" as const,
    async resolveId(this: { resolve: (s: string, i?: string, o?: unknown) => Promise<{ id: string } | null> }, source: string, importer: string | undefined, opts: object) {
      let spec = source;
      let from = importer;
      if (importer && reverse.has(importer)) {
        from = reverse.get(importer);
        if (spec.startsWith(".")) spec = resolve(dirname(from!), spec);
      }
      const r = await this.resolve(spec, from, { ...opts, skipSelf: true });
      if (r && EXPERIMENT_FILES[r.id]) return EXPERIMENT_FILES[r.id];
      return from !== importer ? r : null;
    }
  };
};

let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: REPO }).toString().trim(); } catch { /* not a checkout */ }

export default defineConfig({
  root: here,
  plugins: [nodeBuiltinStubs(), ...(process.env.SB_EXPERIMENT === "1" ? [experimentSwap()] : [])],
  define: { __AURA_COMMIT__: JSON.stringify(commit) },
  resolve: {
    alias: (aliasEntries as ReadonlyArray<readonly [string, string]>).map(([find, replacement]) => ({ find, replacement: resolve(REPO, replacement) }))
  },
  server: { fs: { allow: [REPO] } },
  build: {
    outDir: resolve(here, process.env.SB_OUT ?? "dist"),
    emptyOutDir: true,
    target: "es2022",
    // Diagnosis (E6-02): SB_SOURCEMAP=1 emits sourcemaps; SB_MINIFY=0 keeps function names for CPU profiles; SB_OUT overrides outDir.
    sourcemap: process.env.SB_SOURCEMAP === "1",
    minify: process.env.SB_MINIFY === "0" ? false : "esbuild",
    chunkSizeWarningLimit: 100000,
    rollupOptions: { input: { aura: resolve(here, "aura.html"), three: resolve(here, "three.html"), floor: resolve(here, "floor.html") } }
  }
});
