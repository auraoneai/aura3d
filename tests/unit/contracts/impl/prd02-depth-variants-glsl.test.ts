/**
 * #867 (T0-EXIT-4): every prd02 depth-caster variant compiles as GLSL ES 3.00.
 *
 * `prd02DepthProgram` splices every active C-11 depth feature (prd02
 * instancing / alpha, prd05 LOD dither, prd06 deform, …) into the
 * `aura3d/prd02-depth` body. A bad splice (e.g. prd06 deform composed on top
 * of the built-in A3D_DEPTH_SKINNED path, or a chunk using undeclared
 * symbols) only failed on the GPU under `$ALL,strict` (08-skinned-character).
 * Before #1141 (ec8b3bd2) the skinned body used a raw `#include` that
 * glslang rejects ("'#include' : required extension not requested") in 408
 * of the `everything` variants — this test fails on that library and passes
 * on main. Here each variant key × feature subset is composed exactly as the renderer
 * does (recording device captures the final sources) and validated with
 * Khronos glslangValidator — the same validator lane 01's
 * tests/qr/prd01/glsl/every-chunk-compiles.test.ts uses. The lane gate
 * (lighting-quality unit) installs glslang and sets A3D_REQUIRE_GLSLANG=1, so
 * a missing binary fails there; other repo-wide unit jobs without glslang
 * skip, as prd03-v2-glsl-compile does.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import "../../../../packages/engine/src/lanes/index";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { activeDepthFeatures, prd02DepthProgram, registerPrd02DepthShader } from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import { createDefaultShaderLibrary } from "../../../../packages/rendering/src/ShaderLibrary";
import { MockRenderDevice, type ShaderSources } from "../../../../packages/rendering/src/RenderDevice";
import type { ShadowCasterVariantKey } from "../../../../packages/rendering/src/contracts/shadows";
import { registerPrd06DeformDepthFeature } from "../../../../packages/rendering/src/shaders/deform/depthFeature";
import { SkinningPaletteTextureCache } from "../../../../packages/rendering/src/SkinningPaletteTextureCache";

// prd06 deform registers its depth feature only once a renderer owns a
// palette cache (lanes/prd06.ts); register it here so the `all` set composes
// it exactly as `$ALL,strict` does on the GPU (08-skinned-character).
const disposers: Array<() => void> = [];
disposers.push(registerPrd06DeformDepthFeature(new SkinningPaletteTextureCache()));
afterAll(() => disposers.forEach((dispose) => dispose()));

const dir = mkdtempSync(join(tmpdir(), "a3d-depth-glsl-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Validate one stage; returns the info log on failure, "" on success. */
function validate(name: string, stage: "vert" | "frag", source: string): string {
  const file = join(dir, `${name.replace(/[^A-Za-z0-9_.-]/g, "_")}.${stage}`);
  writeFileSync(file, source);
  const run = spawnSync("glslangValidator", ["-S", stage, file], { encoding: "utf8" });
  if (run.error) throw new Error(`glslangValidator unavailable: ${run.error.message} (install glslang-tools / brew install glslang)`);
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`;
}

/** Records the final (spliced) sources handed to createShaderProgram. */
class RecordingDevice extends MockRenderDevice {
  readonly programs: ShaderSources[] = [];
  override createShaderProgram(descriptor: ShaderSources) {
    this.programs.push(descriptor);
    return super.createShaderProgram(descriptor);
  }
}

const FLAG_SETS = {
  lighting: resolveQrFlags({ options: ["lighting"] }),
  all: resolveQrFlags({ options: "all" }),
  // Every flag and sub-flag on (A3D_QR_ANIMATION_SKINNED_SHADOWS, LOD
  // dither, …): the superset `$ALL,strict` captures can reach.
  everything: { values: {}, on: () => true } as unknown as ReturnType<typeof resolveQrFlags>
} as const;

function* variantKeys(featureIds: readonly string[], values: Readonly<Record<string, string | number | boolean>>): Generator<[string, ShadowCasterVariantKey]> {
  for (const instanced of [false, true]) {
    for (const skinning of [0, 4]) {
      for (const alphaTest of [false, true]) {
        // Subsets: none, each single feature, all, and all-but-one — every
        // feature alone and every pairwise interaction inside the full splice.
        const n = featureIds.length;
        const full = (1 << n) - 1;
        const masks = new Set<number>([0, full, ...featureIds.map((_, bit) => 1 << bit), ...featureIds.map((_, bit) => full & ~(1 << bit))]);
        for (const mask of masks) {
          const features: Record<string, string | number | boolean> = {};
          featureIds.forEach((id, bit) => {
            if (mask & (1 << bit)) features[id] = values[id] ?? true;
          });
          const key = { instanced, skinning, alphaTest, alphaHash: false, doubleSided: false, batched: false, features } as unknown as ShadowCasterVariantKey;
          yield [`i${+instanced}-s${skinning}-a${+alphaTest}-${Object.keys(features).join("+") || "none"}`, key];
        }
      }
    }
  }
}

const glslangAvailable = !spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).error;
const requireGlslang = process.env.A3D_REQUIRE_GLSLANG === "1";

describe("#867 prd02 depth variants compile (glslangValidator)", () => {
  it.runIf(requireGlslang)("glslangValidator is installed (A3D_REQUIRE_GLSLANG)", () => {
    expect(glslangAvailable, "glslangValidator missing (apt-get install glslang-tools)").toBe(true);
  });
  for (const [setName, flags] of Object.entries(FLAG_SETS)) {
    it.runIf(glslangAvailable || requireGlslang)(`every depth variant × active-feature subset compiles under ${setName}`, () => {
      const features = activeDepthFeatures(flags);
      // Feature value used when the feature is on: the "depth" pass value
      // (prd06 deform) or `true`.
      const values: Record<string, string | number | boolean> = Object.fromEntries(features.map((f) => [f.id, f.passes.includes("depth") && f.id === "prd06.deform" ? "depth" : true]));
      const ids = features.map((f) => f.id);
      const failures: string[] = [];
      for (const [name, key] of variantKeys(ids, values)) {
        const device = new RecordingDevice();
        const library = createDefaultShaderLibrary();
        registerPrd02DepthShader(library);
        try {
          prd02DepthProgram(device, library, key, features);
        } catch (error) {
          failures.push(`${setName}/${name}: compose threw ${String(error)}`);
          continue;
        }
        const program = device.programs.at(-1);
        if (!program) {
          failures.push(`${setName}/${name}: no program created`);
          continue;
        }
        const v = validate(`${setName}-${name}`, "vert", program.vertex);
        const f = validate(`${setName}-${name}`, "frag", program.fragment);
        if (v) failures.push(`${setName}/${name} [vert]\n${v.slice(0, 1200)}`);
        if (f) failures.push(`${setName}/${name} [frag]\n${f.slice(0, 1200)}`);
      }
      expect(failures, failures.join("\n\n")).toEqual([]);
    }, 180_000);
  }
});
