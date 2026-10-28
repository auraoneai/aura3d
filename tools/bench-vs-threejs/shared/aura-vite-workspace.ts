/* Vite config for the CANDIDATE build: resolves @aura3d/* to the workspace sources (/repo/packages/<pkg>/src) through the repo's own generated alias
   table (vite.aliases.generated.ts, which build-all.mjs turns into BENCH_ALIASES json) instead of installing a published version.
   Used only when tools/bench-vs-threejs/candidate.json exists (harness/run-candidate.sh). Bundle byte sizes from this build are source builds, not published-tarball sizes. */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "vite";

const REPO = process.env.BENCH_AURA_SOURCE ?? "/repo";
const NODE_BUILTINS = /^(node:)?(fs|path|crypto|url|os|zlib|stream|util|buffer|module|child_process|worker_threads)$/;
const nodeBuiltinStubs = () => ({
  name: "node-builtin-stubs",
  enforce: "pre" as const,
  resolveId(id: string) { if (NODE_BUILTINS.test(id)) return `\0stub:${id}`; },
  load(id: string) { if (id.startsWith("\0stub:")) return { code: "export default {};", syntheticNamedExports: true }; }
});

/** Same effect as @aura3d/assets/vite's auraDecodersPlugin: ship the vendored decoders under <outDir>/aura-decoders/. */
const decoders = () => {
  let outDir = "dist";
  return {
    name: "aura3d-aura-decoders-workspace",
    configResolved(config: { root: string; build: { outDir: string } }) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      for (const dir of ["basis", "draco", "meshopt"]) {
        const from = join(REPO, "packages/assets/vendor", dir);
        if (!existsSync(from)) throw new Error(`missing decoder family ${dir}`);
        mkdirSync(join(outDir, "aura-decoders"), { recursive: true });
        cpSync(from, join(outDir, "aura-decoders", dir), { recursive: true });
      }
    }
  };
};

const generated: Array<[string, string]> = JSON.parse(readFileSync(process.env.BENCH_ALIASES ?? join(REPO, "bench-aliases.json"), "utf8"));
// Subpaths the generated table does not carry but the example dev server maps (tests/browser/example-dev-server.ts); deeper paths first (prefix match).
const extra: Array<[string, string]> = [
  ["@aura3d/game/capture", "./packages/game/src/capture/index.ts"],
  ["@aura3d/game/art", "./packages/game/src/art/index.ts"],
  ["@aura3d/game/util", "./packages/game/src/util/index.ts"],
  ["@aura3d/engine/game", "./packages/game/src/index.ts"],
  ["@aura3d/game", "./packages/game/src/index.ts"]
];
const entries = [...extra.filter(([find]) => !generated.some(([f]) => f === find)), ...generated];

export default defineConfig({
  plugins: [nodeBuiltinStubs(), decoders()],
  resolve: { alias: entries.map(([find, replacement]) => ({ find, replacement: resolve(REPO, replacement) })) }
});
