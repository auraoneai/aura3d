/**
 * #1140 (Track 0): `A3D_QR_CORE` frames collapsed to flat colours on the GPU
 * (03-damaged-helmet 2,329 → 31 colours, near-white; 16-instancing 1,148 → 17).
 *
 * Root cause: `@aura3d/rendering` declared `"sideEffects": false`, so a
 * production bundler (Vite/Rollup, esbuild) dropped `src/lanes/prd01.ts` — it
 * exports nothing, it only calls `programCacheSlot.provide(...)` — and the
 * `installProgramGenerator(...)` call in `program/ProgramGenerator.ts`. The C-02
 * slot then returned its PR-0a stub, which compiles the legacy `pbr-direct`
 * program for every lit record: no texture maps, no instancing, the generated
 * binding contract fed to a legacy program. The unit suites never saw it: they
 * import source directly and nothing is tree-shaken.
 *
 * This test bundles the rendering entry the way the benchmark build does and
 * checks that the lane-01 provides survive tree-shaking.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { programCacheSlot } from "../../../../packages/rendering/src/contracts/program";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { rendererProgramCache, setRendererProgramDegradationSink } from "../../../../packages/rendering/src/renderer/qrSubFlags";
import { MockRenderDevice } from "@aura3d/rendering";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const renderingDir = join(repoRoot, "packages/rendering");

async function bundleRenderingEntry(): Promise<string> {
  // Consumer-shaped entry: imports one symbol from the package index, exactly
  // like engine code does. Everything else is subject to tree-shaking.
  const result = await build({
    stdin: {
      contents: `export { Renderer } from ${JSON.stringify(join(renderingDir, "src/index.ts"))};`,
      resolveDir: repoRoot,
      loader: "ts",
      sourcefile: "entry-1140.ts"
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    treeShaking: true,
    minify: false,
    logLevel: "silent"
  });
  return result.outputFiles[0]!.text;
}

describe("#1140: lane barrels survive production tree-shaking", () => {
  it("keeps the C-02 real program cache and the generator install in a bundled build", async () => {
    const bundle = await bundleRenderingEntry();
    // lanes/prd01.ts: C-02/C-07/C-08 real providers.
    expect(bundle).toMatch(/programCacheSlot\.provide\(/);
    expect(bundle).toMatch(/frameUniformsSlot\.provide\(/);
    expect(bundle).toMatch(/instanceBufferSlot\.provide\(/);
    // program/ProgramGenerator.ts: the real generator installs itself on import.
    expect(bundle).toMatch(/installProgramGenerator\(\(features\) => generateProgramImpl\(features\)\)/);
  }, 120_000);

  it("declares every lane barrel and the generator as side-effectful in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(renderingDir, "package.json"), "utf8")) as { sideEffects?: unknown };
    expect(Array.isArray(pkg.sideEffects)).toBe(true);
    const globs = pkg.sideEffects as string[];
    expect(globs).toContain("./src/lanes/**/*.ts");
    expect(globs).toContain("./dist/lanes/**/*.js");
    expect(globs).toContain("./src/program/ProgramGenerator.ts");
    expect(globs).toContain("./dist/program/ProgramGenerator.js");
    // Every barrel file is under the lanes glob (no barrel lives elsewhere).
    const barrels = readdirSync(join(renderingDir, "src/lanes")).filter((f) => /^prd\d\d\.ts$/.test(f));
    expect(barrels.length).toBeGreaterThanOrEqual(15);
  });
});

describe("#1140: a missing C-02 provider is reported, never silent", () => {
  it("emits program-generator-missing when A3D_QR_CORE is on but the real cache was not provided", () => {
    // Simulate the tree-shaken bundle: shadow `provided` (a prototype getter)
    // with an own `false` for the duration of the call.
    Object.defineProperty(programCacheSlot, "provided", { value: false, configurable: true });
    const device = new MockRenderDevice();
    const seen: string[] = [];
    setRendererProgramDegradationSink(device, (d) => seen.push(d.code));
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    try {
      rendererProgramCache(device, resolveQrFlags({ env: { A3D_QR_CORE: "v2" } }));
    } finally {
      console.error = original;
      delete (programCacheSlot as { provided?: boolean }).provided;
      setRendererProgramDegradationSink(device, undefined);
    }
    expect(seen).toEqual(["program-generator-missing"]);
    expect(errors.length).toBe(1);
  });

  it("stays silent when the real cache is provided", () => {
    Object.defineProperty(programCacheSlot, "provided", { value: true, configurable: true });
    const device = new MockRenderDevice();
    const seen: string[] = [];
    setRendererProgramDegradationSink(device, (d) => seen.push(d.code));
    try {
      rendererProgramCache(device, resolveQrFlags({ env: { A3D_QR_CORE: "v2" } }));
    } finally {
      delete (programCacheSlot as { provided?: boolean }).provided;
      setRendererProgramDegradationSink(device, undefined);
    }
    expect(seen).toEqual([]);
  });
});

describe("#1140: OutputPass dither uniform matches the device upload", () => {
  it("declares u_dither as float (the device sets numbers with uniform1f; an int uniform raised GL_INVALID_OPERATION)", async () => {
    const { outputFragmentGlsl } = await import("../../../../packages/rendering/src/output/ToneMappingOperators.glsl");
    const src = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: false, overlay: false });
    expect(src).toMatch(/uniform float u_dither;/);
    expect(src).not.toMatch(/uniform int u_dither;/);
  });
});
