import { describe, expect, it } from "vitest";
import { POST_COMMON_WGSL } from "../../../../packages/rendering/src/post/shaders/common.wgsl.js";
import { EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_REDUCE_WGSL, EXPOSURE_ADAPT_WGSL, EXPOSURE_MUL_WGSL } from "../../../../packages/rendering/src/post/shaders/exposure.wgsl.js";
import { GTAO_WGSL } from "../../../../packages/rendering/src/post/shaders/gtao.wgsl.js";
import { GTAO_DENOISE_WGSL, GTAO_APPLY_WGSL } from "../../../../packages/rendering/src/post/shaders/gtaoDenoise.wgsl.js";
import { GODRAYS_WGSL } from "../../../../packages/rendering/src/post/shaders/godrays.wgsl.js";
import { TAA_RESOLVE_WGSL, TAA_UPSCALE_WGSL } from "../../../../packages/rendering/src/post/shaders/taa.wgsl.js";
import { DOF_PREFILTER_WGSL, DOF_NEAR_TILE_WGSL, DOF_GATHER_WGSL, DOF_COMPOSITE_WGSL } from "../../../../packages/rendering/src/post/shaders/dof.wgsl.js";
import { MB_TILE_MAX_WGSL, MB_NEIGHBOR_WGSL, MB_RECONSTRUCT_WGSL } from "../../../../packages/rendering/src/post/shaders/motionBlur.wgsl.js";
import { VELOCITY_DILATE_WGSL } from "../../../../packages/rendering/src/post/shaders/velocityDilate.wgsl.js";
import { DEPTH_LINEARIZE_WGSL, DEPTH_MINMAX_HALF_WGSL, CAMERA_VELOCITY_WGSL } from "../../../../packages/rendering/src/post/shaders/depthDownsample.wgsl.js";
import { BLOOM_PREFILTER_WGSL, BLOOM_DOWNSAMPLE_WGSL, BLOOM_UPSAMPLE_WGSL } from "../../../../packages/rendering/src/post/shaders/bloom.wgsl.js";
import { COMPOSITE_WGSL, CA_PASS_WGSL } from "../../../../packages/rendering/src/post/shaders/composite.wgsl.js";
import { DISPLAY_GRADE_WGSL, LUT_BAKE_WGSL } from "../../../../packages/rendering/src/post/shaders/displayGrade.wgsl.js";
import { FINALIZE_WGSL, FINALIZE_FXAA_FUSED_WGSL } from "../../../../packages/rendering/src/post/shaders/finalize.wgsl.js";
import { FXAA_185_FRAGMENT_WGSL } from "../../../../packages/rendering/src/post/shaders/fxaa.wgsl.js";
import { SMAA_EDGES_WGSL, SMAA_WEIGHTS_WGSL, SMAA_BLEND_WGSL } from "../../../../packages/rendering/src/post/shaders/smaa.wgsl.js";

/** A complete WGSL module: a real fullscreen-triangle vertex shader + the fragment source. */
function moduleFor(fs: string): string {
  return `struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) vertex_index: u32) -> VsOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VsOut;
  out.position = vec4<f32>(pos[vertex_index], 0.0, 1.0);
  out.uv = (pos[vertex_index] + vec2<f32>(1.0)) * 0.5;
  return out;
}

` + fs;
}

const MODULES: Record<string, string> = {
  "common-chunk": POST_COMMON_WGSL,
  "exposure-luma-log": EXPOSURE_LUMA_LOG_WGSL,
  "exposure-reduce": EXPOSURE_REDUCE_WGSL,
  "exposure-adapt": EXPOSURE_ADAPT_WGSL,
  "exposure-mul": EXPOSURE_MUL_WGSL,
  "gtao": GTAO_WGSL,
  "gtao-denoise": GTAO_DENOISE_WGSL,
  "gtao-apply": GTAO_APPLY_WGSL,
  "godrays": GODRAYS_WGSL,
  "taa-resolve": TAA_RESOLVE_WGSL,
  "taa-upscale": TAA_UPSCALE_WGSL,
  "dof-prefilter": DOF_PREFILTER_WGSL,
  "dof-near-tile": DOF_NEAR_TILE_WGSL,
  "dof-gather": DOF_GATHER_WGSL,
  "dof-composite": DOF_COMPOSITE_WGSL,
  "camera-velocity": CAMERA_VELOCITY_WGSL,
  "velocity-dilate": VELOCITY_DILATE_WGSL,
  "depth-linearize": DEPTH_LINEARIZE_WGSL,
  "depth-minmax-half": DEPTH_MINMAX_HALF_WGSL,
  "mb-tile-max": MB_TILE_MAX_WGSL,
  "mb-neighbor": MB_NEIGHBOR_WGSL,
  "mb-reconstruct": MB_RECONSTRUCT_WGSL,
  "bloom-prefilter": BLOOM_PREFILTER_WGSL,
  "bloom-downsample": BLOOM_DOWNSAMPLE_WGSL,
  "bloom-upsample": BLOOM_UPSAMPLE_WGSL,
  "composite": COMPOSITE_WGSL,
  "ca-pass": CA_PASS_WGSL,
  "display-grade": DISPLAY_GRADE_WGSL,
  "lut-bake": LUT_BAKE_WGSL,
  "finalize": FINALIZE_WGSL,
  "finalize-fxaa-fused": FINALIZE_FXAA_FUSED_WGSL,
  "fxaa-185": FXAA_185_FRAGMENT_WGSL,
  "smaa-edges": SMAA_EDGES_WGSL,
  "smaa-weights": SMAA_WEIGHTS_WGSL,
  "smaa-blend": SMAA_BLEND_WGSL,
};

describe("PRD-03 Phase 7 — post/* WGSL twins parse under naga (wasm twin)", () => {
  it("exports cover every §8.15 v2 stage + shared chunk (35 modules)", () => {
    expect(Object.keys(MODULES)).toHaveLength(35);
    for (const fs of Object.values(MODULES)) expect(fs.length).toBeGreaterThan(64);
  });

  it("every entry module declares a @fragment stage and validates under `naga` when installed", async () => {
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    let hasNaga = true;
    try {
      execFileSync("naga", ["--version"], { stdio: "pipe" });
    } catch {
      hasNaga = false;
    }

    const dir = mkdtempSync(join(tmpdir(), "prd03-wgsl-"));
    for (const [name, fs] of Object.entries(MODULES)) {
      const source = moduleFor(fs);
      if (name !== "common-chunk") {
        expect(source).toMatch(/@fragment/);
        expect(source).toMatch(/fn fs_/);
      }
      if (hasNaga) {
        const file = join(dir, `${name}.wgsl`);
        writeFileSync(file, source);
        // naga exits non-zero with a diagnostic on any parse/validation error.
        expect(() => execFileSync("naga", [file], { encoding: "utf8" }), name).not.toThrow();
      }
    }
  });
});
