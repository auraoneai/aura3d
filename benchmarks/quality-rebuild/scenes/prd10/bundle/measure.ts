/**
 * PRD-10 §17.4 — bundle numbers for lane 10, measured the same way as
 * `tools/bundle-size` (PRD-11-owned; run, not edited): esbuild ESM, minify,
 * splitting, tree shaking, browser/es2022, `@aura3d/*` resolved to source via
 * `tsconfig.paths.generated.json`, statically reachable critical-path chunks
 * gzipped per chunk and summed. The shared tool has no lane-10 target, so this
 * script builds the `.` core target twice — as-is, and with
 * `engine/src/lanes/prd10.ts` replaced by an empty module — and reports:
 *
 *   rootGrowthGzip   critical-path delta the lane adds to `@aura3d/engine` "."
 *                    (§17.4: ≤ 1.5 KB — budget 1,500 B, decimal, never rounded up)
 *   worldChunkGzip   gzip of the deferred (dynamic-import) chunks the lane adds,
 *                    i.e. the world runtime loaded on first world node
 *                    (§17.4: ≤ 56 KB — budget 56,000 B)
 *
 * While the lane barrel imports its runtime eagerly, every world byte lands in
 * rootGrowthGzip and worldChunkGzip is ~0: the numbers say so instead of
 * hiding it. Run: `pnpm exec tsx benchmarks/quality-rebuild/scenes/prd10/bundle/measure.ts [--enforce] [out.json]`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Metafile, type Plugin } from "esbuild";

export const PRD10_BUNDLE_BUDGETS = { rootGrowthGzip: 1_500, worldChunkGzip: 56_000 } as const;

const ENTRY = "packages/engine/src/public/index.ts";
const EXTERNAL = ["react", "three", "three/examples/jsm/loaders/GLTFLoader.js"];
const LANE_BARREL = /packages\/engine\/src\/lanes\/prd10\.ts$/;
const nodeBuiltinImports = new Set<string>();

function aliasPlugin(): Plugin {
  const generated = JSON.parse(readFileSync(resolve("tsconfig.paths.generated.json"), "utf8")) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  const aliases = new Map<string, string>();
  for (const [spec, targets] of Object.entries(generated.compilerOptions?.paths ?? {})) {
    const target = targets[0];
    if (!target || spec.includes("*") || target.includes("*")) continue;
    aliases.set(spec, resolve(target));
  }
  return {
    name: "aura3d-source-alias",
    setup(b) {
      // Main currently reaches `node:fs`/`node:path` through
      // `@gltf-transform/core` (via physics-rapier) on the "." graph, so the
      // shared esbuild target cannot build. Both arms of this delta carry the
      // same reference, so marking `node:*` external changes neither number;
      // the count is reported (`nodeBuiltinImports`) instead of hidden.
      b.onResolve({ filter: /^node:/ }, (args) => {
        nodeBuiltinImports.add(args.path);
        return { path: args.path, external: true };
      });
      b.onResolve({ filter: /^@aura3d\// }, (args) => {
        if (EXTERNAL.includes(args.path)) return { path: args.path, external: true };
        const target = aliases.get(args.path);
        return target ? { path: target } : undefined;
      });
    }
  };
}

function stubLanePlugin(): Plugin {
  return {
    name: "prd10-lane-stub",
    setup(b) {
      b.onLoad({ filter: LANE_BARREL }, () => ({ contents: "export {};", loader: "ts" }));
    }
  };
}

interface Measured {
  readonly criticalGzip: number;
  readonly deferredGzip: number;
  readonly criticalFiles: number;
}

async function measure(withoutLane: boolean): Promise<Measured> {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [ENTRY],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    splitting: true,
    outdir: resolve("tests/reports/bundle-size/chunks", withoutLane ? "prd10-without" : "prd10-with"),
    entryNames: "entry",
    chunkNames: "chunk-[hash]",
    treeShaking: true,
    sourcemap: false,
    logLevel: "silent",
    external: EXTERNAL,
    plugins: [aliasPlugin(), ...(withoutLane ? [stubLanePlugin()] : [])]
  });
  const meta = result.metafile as Metafile;
  const norm = (p: string): string => resolve(p).replaceAll("\\", "/");
  const keyByPath = new Map(Object.keys(meta.outputs).map((k) => [norm(k), k]));
  const entryKey = Object.entries(meta.outputs).find(([, o]) => o.entryPoint && norm(o.entryPoint) === norm(ENTRY))?.[0];
  if (!entryKey) throw new Error(`no entry output for ${ENTRY}`);
  const critical = new Set<string>();
  const visit = (key: string): void => {
    const n = norm(key);
    if (critical.has(n)) return;
    critical.add(n);
    for (const dep of meta.outputs[key]?.imports ?? []) {
      if (dep.external || dep.kind === "dynamic-import") continue;
      const k = keyByPath.get(norm(dep.path)) ?? keyByPath.get(norm(resolve(dirname(resolve(key)), dep.path)));
      if (k) visit(k);
    }
  };
  visit(entryKey);
  let criticalGzip = 0;
  let deferredGzip = 0;
  for (const file of result.outputFiles ?? []) {
    const gz = gzipSync(file.contents).byteLength;
    if (critical.has(norm(file.path))) criticalGzip += gz;
    else deferredGzip += gz;
  }
  return { criticalGzip, deferredGzip, criticalFiles: critical.size };
}

const args = process.argv.slice(2);
const enforce = args.includes("--enforce");
const outPath = args.find((a) => !a.startsWith("--"));
const [withLane, withoutLane] = await Promise.all([measure(false), measure(true)]);
const report = {
  measuredAt: new Date().toISOString(),
  entry: ENTRY,
  method: "esbuild ESM splitting + statically reachable critical-path chunks + per-chunk gzip sum (tools/bundle-size method)",
  withLane,
  withoutLane,
  rootGrowthGzip: withLane.criticalGzip - withoutLane.criticalGzip,
  worldChunkGzip: withLane.deferredGzip - withoutLane.deferredGzip,
  nodeBuiltinImports: [...nodeBuiltinImports].sort(),
  budgets: PRD10_BUNDLE_BUDGETS
};
const pass = {
  rootGrowthGzip: report.rootGrowthGzip <= PRD10_BUNDLE_BUDGETS.rootGrowthGzip,
  worldChunkGzip: report.worldChunkGzip <= PRD10_BUNDLE_BUDGETS.worldChunkGzip
};
const json = JSON.stringify({ ...report, pass }, null, 2);
if (outPath) writeFileSync(outPath, `${json}\n`, "utf8");
console.log(json);
if (enforce && !(pass.rootGrowthGzip && pass.worldChunkGzip)) {
  console.error("prd10 §17.4: bundle numbers exceed budget");
  process.exit(1);
}
