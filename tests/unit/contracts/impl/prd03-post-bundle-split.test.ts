import { describe, expect, it } from "vitest";
import { build, type Metafile, type Plugin } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PRD-03 Phase 2 bundle gate (§9): `Renderer`-side code reaches `post/`
 * GPU modules only through `import()` in `PostprocessExecution.ts`, so a
 * flag-off consumer's critical-path chunk never contains them.
 *
 * Two proofs:
 *  1. Structural — the only `post/` GPU import in the renderer is the
 *     dynamic edge in PostprocessExecution; the lane barrel re-exports no
 *     phase-2 GPU values.
 *  2. Real — an esbuild metafile build of the rendering entry puts
 *     `post/v2Entry.ts` and the phase-2 shader/pool/LUT inputs in deferred
 *     chunks only.
 */

const root = resolve(__dirname, "../../../..");

const DEFERRED_ONLY_INPUTS = [
  "packages/rendering/src/post/v2Entry.ts",
  "packages/rendering/src/post/PostResources.ts",
  "packages/rendering/src/post/CubeLut.ts",
  "packages/rendering/src/post/shaders/bloom.glsl.ts",
  "packages/rendering/src/post/shaders/composite.glsl.ts",
  "packages/rendering/src/post/shaders/displayGrade.glsl.ts",
  "packages/rendering/src/post/shaders/finalize.glsl.ts",
  // Phase 3: S1/S2/S4 GLSL + the stage driver.
  "packages/rendering/src/post/v2Stages.ts",
  "packages/rendering/src/post/shaders/depthDownsample.glsl.ts",
  "packages/rendering/src/post/shaders/gtao.glsl.ts",
  "packages/rendering/src/post/shaders/gtaoDenoise.glsl.ts",
  "packages/rendering/src/post/shaders/godrays.glsl.ts",
  // Phase 6: S8 auto-exposure + S11 SMAA GLSL, and the §8.14 lazy texture
  // chunk (reached only via `import("./smaa/textures.js")` inside v2Stages).
  "packages/rendering/src/post/shaders/exposure.glsl.ts",
  "packages/rendering/src/post/shaders/smaa.glsl.ts",
  "packages/rendering/src/post/smaa/textures.ts",
  // Phase 7: §8.18 WGSL mirrors (lane-11 consumes them via Q-11-2; nothing in
  // the root chunk may import them).
  "packages/rendering/src/post/shaders/common.wgsl.ts",
  "packages/rendering/src/post/shaders/exposure.wgsl.ts",
  "packages/rendering/src/post/shaders/gtao.wgsl.ts",
  "packages/rendering/src/post/shaders/gtaoDenoise.wgsl.ts",
  "packages/rendering/src/post/shaders/godrays.wgsl.ts",
  "packages/rendering/src/post/shaders/taa.wgsl.ts",
  "packages/rendering/src/post/shaders/dof.wgsl.ts",
  "packages/rendering/src/post/shaders/motionBlur.wgsl.ts",
  "packages/rendering/src/post/shaders/velocityDilate.wgsl.ts",
  "packages/rendering/src/post/shaders/depthDownsample.wgsl.ts",
  "packages/rendering/src/post/shaders/bloom.wgsl.ts",
  "packages/rendering/src/post/shaders/composite.wgsl.ts",
  "packages/rendering/src/post/shaders/displayGrade.wgsl.ts",
  "packages/rendering/src/post/shaders/finalize.wgsl.ts",
  "packages/rendering/src/post/shaders/fxaa.wgsl.ts",
  "packages/rendering/src/post/shaders/smaa.wgsl.ts"
];

function workspaceAliasPlugin(): Plugin {
  const aliases = new Map<string, string>([
    ["@aura3d/math", "packages/math/src/index.ts"],
    ["@aura3d/scene", "packages/scene/src/index.ts"],
    ["@aura3d/scene/math", "packages/scene/src/MathTypes.ts"],
    ["@aura3d/core", "packages/core/src/index.ts"]
  ]);
  return {
    name: "prd03-workspace-alias",
    setup(api) {
      api.onResolve({ filter: /^@aura3d\// }, (args) => {
        const target = aliases.get(args.path);
        return target ? { path: resolve(root, target) } : { path: args.path, external: true };
      });
    }
  };
}

/** Output-chunk keys statically reachable from the entry output. */
function criticalPathChunks(metafile: Metafile, entryKey: string): Set<string> {
  const seen = new Set<string>();
  const walk = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const output = metafile.outputs[key];
    if (!output) return;
    for (const imported of output.imports) {
      if (imported.kind === "import-statement" && imported.path in metafile.outputs) {
        walk(imported.path);
      }
    }
  };
  walk(entryKey);
  return seen;
}

describe("post v2 bundle split (§9 gate)", () => {
  it("structural: PostprocessExecution reaches post/ only via import(); the lane barrel re-exports no v2 GPU values", () => {
    const exec = readFileSync(resolve(root, "packages/rendering/src/renderer/PostprocessExecution.ts"), "utf8");
    // invariant: the §9 bundle gate requires v2 GPU code to load only via a
    // dynamic import() edge — a static string keeps it splittable by esbuild.
    expect(exec).toContain('import("../post/v2Entry")');
    // No static `import { ... } from "<post module>"` of phase-2 GPU code.
    // Single exception: `post/postSkipped` — the §6.9 skip registry (a Set of
    // strings, T0-17). It must stay import-free so it can never pull GPU code
    // onto the critical path; that is asserted here, not assumed.
    const SKIP_REGISTRY = /from\s+"\.\.\/post\/postSkipped";?$/;
    const staticPostImports = exec.match(/^import\s.*from\s+"[^"]*post\/.*$/gm) ?? [];
    for (const line of staticPostImports) {
      if (SKIP_REGISTRY.test(line)) continue;
      expect(line).toContain("import type");
    }
    const skipRegistry = readFileSync(resolve(root, "packages/rendering/src/post/postSkipped.ts"), "utf8");
    expect(skipRegistry).not.toMatch(/^\s*(?:import|export)\s[^;]*\sfrom\s/m);
    expect(skipRegistry).not.toMatch(/\bimport\s*\(/);

    const barrel = readFileSync(resolve(root, "packages/rendering/src/lanes/prd03.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // strip comments — only real specifiers count
    const specifiers = [...barrel.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]!);
    for (const banned of ["shaders/", "PostResources", "CubeLut", "NativeBloomPyramid", "v2Entry"]) {
      for (const specifier of specifiers) {
        expect(specifier, `barrel statically exports a v2 GPU module via ${specifier}`).not.toContain(banned);
      }
    }
  });

  it("esbuild metafile: phase-2 post/ GPU inputs land only in deferred chunks", async () => {
    const result = await build({
      absWorkingDir: root,
      bundle: true,
      minify: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      metafile: true,
      splitting: true,
      outdir: "out",
      entryPoints: ["packages/rendering/src/index.ts"],
      plugins: [workspaceAliasPlugin()],
      external: ["@aura3d/*"],
      logLevel: "silent"
    });
    const metafile = result.metafile!;
    const entryKey = Object.keys(metafile.outputs).find((key) =>
      metafile.outputs[key]!.entryPoint === "packages/rendering/src/index.ts"
    )!;
    const critical = criticalPathChunks(metafile, entryKey);

    // Every input file → the chunk(s) containing it, split critical/deferred.
    const chunkOf = (input: string) => {
      const hits = { critical: [] as string[], deferred: [] as string[] };
      for (const [key, output] of Object.entries(metafile.outputs)) {
        if (!(input in output.inputs)) continue;
        (critical.has(key) ? hits.critical : hits.deferred).push(key);
      }
      return hits;
    };

    // v2Entry itself must exist only in a deferred chunk (reached solely
    // through the dynamic edge in PostprocessExecution).
    const v2Entry = chunkOf("packages/rendering/src/post/v2Entry.ts");
    expect(v2Entry.critical).toEqual([]);
    expect(v2Entry.deferred.length).toBeGreaterThan(0);

    for (const input of DEFERRED_ONLY_INPUTS) {
      const hits = chunkOf(input);
      expect(hits.critical, `${input} leaked onto the flag-off critical path`).toEqual([]);
    }
    // Note: post/shaders/fxaa.glsl.ts is intentionally excluded — Phase 1
    // ships it on the legacy eager path (the flag-on present split inside
    // webgl2/LegacyPost.ts, a pre-existing static device module).
    // PostGraph.ts stays eager too: the contract real is provide()d at
    // module eval, by contract.
  }, 60_000);

  it("§6.9: the v2 chunk never imports the reference/ CPU kernels", async () => {
    const result = await build({
      absWorkingDir: root,
      bundle: true,
      minify: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      write: false,
      metafile: true,
      splitting: true,
      outdir: "out",
      entryPoints: ["packages/rendering/src/index.ts"],
      plugins: [workspaceAliasPlugin()],
      external: ["@aura3d/*"],
      logLevel: "silent"
    });
    const metafile = result.metafile!;
    // Every chunk that carries a phase-3 v2 input must have zero reference/
    // inputs in it (transitively bundled inputs appear under output.inputs).
    const v2ChunkKeys = Object.keys(metafile.outputs).filter((key) =>
      Object.keys(metafile.outputs[key]!.inputs).some((input) => input.startsWith("packages/rendering/src/post/v2"))
    );
    expect(v2ChunkKeys.length).toBeGreaterThan(0);
    for (const key of v2ChunkKeys) {
      const referenceInputs = Object.keys(metafile.outputs[key]!.inputs).filter((input) =>
        input.startsWith("packages/rendering/src/reference/")
      );
      expect(referenceInputs, `v2 chunk ${key} bundles reference kernels`).toEqual([]);
    }
  }, 60_000);
});
