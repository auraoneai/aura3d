/**
 * `bundle.test.ts` — S19 per-tier bundle budgets (PRD-08 §17): esbuild ESM
 * + splitting + minify + gzip on the lane's two fixtures, mirroring
 * `tools/bundle-size/` (read-only — that tool is lane 11's and unchanged).
 *
 * Budgets: "typical game" ≤ 15 KB gzip; "everything" ≤ 24 KB gzip.
 * Tree-shake gate: the typical fixture's metafile inputs must not reach
 * rail/Spline/BicycleModel — optional systems must not cost a typical game.
 */
import { describe, expect, it } from "vitest";
import { build, type Plugin } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CWD = process.cwd();
const EXTERNAL = [
  "react", "three", "three/examples/jsm/loaders/GLTFLoader.js",
  // Non-lane packages: §17 budgets measure lane-08 code cost, not the app
  // shell — assets/physics/input barrels carry their own lanes budgets.
  "@aura3d/assets", "@aura3d/physics-rapier", "@aura3d/physics",
  "@dimforge/rapier3d-compat", "@gltf-transform/core", "@gltf-transform/functions"
];

function loadAliases(): Map<string, string> {
  const generated = JSON.parse(
    readFileSync(resolve(CWD, "tsconfig.paths.generated.json"), "utf8")
  ) as { compilerOptions?: { paths?: Record<string, string[]> } };
  const aliases = new Map<string, string>();
  for (const [specifier, targets] of Object.entries(generated.compilerOptions?.paths ?? {})) {
    const target = targets[0];
    if (!target || specifier.includes("*") || target.includes("*")) continue;
    aliases.set(specifier, `./${target}`);
  }
  return aliases;
}

const aliasPlugin: Plugin = {
  name: "aura3d-source-alias",
  setup(b) {
    const aliases = loadAliases();
    const externalSet = new Set(EXTERNAL);
    // §17 budgets price lane-08 code. Platform packages (math, scene,
    // controls, rendering internals, assets, physics) sit beside the lane the
    // same way `three` does — externalized by resolved path, EXCEPT lane-08's
    // own camera-fade.glsl.ts which lives inside packages/rendering.
    const PLATFORM = /packages\/(math|scene|controls|assets|physics|physics-rapier|rendering)\//;
    const isLaneOwned = (p: string) => /camera-fade\.glsl\.ts$/.test(p);
    const externalize = (args: { path: string; resolveDir: string }) => {
      if (externalSet.has(args.path)) return { path: args.path, external: true };
      const target = aliases.get(args.path);
      const resolved = target
        ? resolve(CWD, target)
        : resolve(args.resolveDir, args.path);
      if (PLATFORM.test(resolved) && !isLaneOwned(resolved)) {
        return { path: args.path, external: true };
      }
      return target ? { path: resolved } : undefined;
    };
    b.onResolve({ filter: /^(@aura3d\/|@dimforge\/|@gltf-transform\/|node:)/ }, (args) =>
      externalize({ path: args.path, resolveDir: args.resolveDir }));
    b.onResolve({ filter: /^\.\.?\// }, (args) =>
      externalize({ path: args.path, resolveDir: args.resolveDir }));
  }
};

interface Measure {
  jsBytes: number;
  gzipBytes: number;
  inputs: string[];
}

async function measure(entry: string): Promise<Measure> {
  const result = await build({
    absWorkingDir: CWD,
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    splitting: true,
    outdir: "out",
    treeShaking: true,
    sourcemap: false,
    logLevel: "silent",
    plugins: [aliasPlugin],
    entryPoints: [entry]
  });
  let js = 0;
  let gz = 0;
  for (const out of result.outputFiles ?? []) {
    if (!out.path.endsWith(".js")) continue; // critical-path chunks only, like the lane tool
    js += out.contents.byteLength;
    gz += gzipSync(out.contents, { level: 9 }).byteLength;
  }
  return { jsBytes: js, gzipBytes: gz, inputs: Object.keys(result.metafile?.inputs ?? {}) };
}

describe("S19 lane bundle budgets", () => {
  it("'typical game' fixture ≤ 15 KB gzip and shakes rail/Spline/Bicycle", async () => {
    const m = await measure("tests/qr/prd08/bundle/typical-game.ts");
    const optional = m.inputs.filter((p) => /Spline\.|BicycleModel|rigs\/(flight|follow2d|fighting|shoulder|orbit|topDown|altitude|rail)\.ts|VirtualTouch|PlatformerMotion/.test(p));
    console.log(`typical pulled optional: ${optional.join(", ") || "(none)"}`);
    console.log(`typical: ${m.jsBytes} js / ${m.gzipBytes} gzip (budget 15000)`);
    expect(optional).toEqual([]);
    expect(m.gzipBytes).toBeLessThanOrEqual(15_000);
    expect(m.gzipBytes).toBeGreaterThan(0);
  });

  it("'everything' fixture ≤ 24 KB gzip", async () => {
    const m = await measure("tests/qr/prd08/bundle/everything.ts");
    console.log(`everything: ${m.jsBytes} js / ${m.gzipBytes} gzip (budget 24000)`);
    expect(m.gzipBytes).toBeLessThanOrEqual(24_000);
  });
});
