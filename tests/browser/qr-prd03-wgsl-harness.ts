/**
 * PRD-03 Phase 7 — §8.18 exit gate: every `post/shaders/*.wgsl.ts` mirror
 * compiles standalone on a real WebGPU device
 * (`GPUShaderModule.getCompilationInfo()` → zero `type === "error"`).
 *
 * `tests/qr/prd03/wgsl-compile.spec.ts` per the PRD — located beside the
 * other lane-03 browser specs so the `qr-prd03-` ownership slot applies.
 * Executed remote-only (post-quality.yml, macos-14 Chromium, ANGLE Metal).
 */
import { POST_COMMON_WGSL } from "../../packages/rendering/src/post/shaders/common.wgsl";
import { EXPOSURE_LUMA_LOG_WGSL, EXPOSURE_REDUCE_WGSL, EXPOSURE_ADAPT_WGSL, EXPOSURE_MUL_WGSL } from "../../packages/rendering/src/post/shaders/exposure.wgsl";
import { GTAO_WGSL } from "../../packages/rendering/src/post/shaders/gtao.wgsl";
import { GTAO_DENOISE_WGSL, GTAO_APPLY_WGSL } from "../../packages/rendering/src/post/shaders/gtaoDenoise.wgsl";
import { GODRAYS_WGSL } from "../../packages/rendering/src/post/shaders/godrays.wgsl";
import { TAA_RESOLVE_WGSL, TAA_UPSCALE_WGSL } from "../../packages/rendering/src/post/shaders/taa.wgsl";
import { DOF_PREFILTER_WGSL, DOF_NEAR_TILE_WGSL, DOF_GATHER_WGSL, DOF_COMPOSITE_WGSL } from "../../packages/rendering/src/post/shaders/dof.wgsl";
import { MB_TILE_MAX_WGSL, MB_NEIGHBOR_WGSL, MB_RECONSTRUCT_WGSL } from "../../packages/rendering/src/post/shaders/motionBlur.wgsl";
import { VELOCITY_DILATE_WGSL } from "../../packages/rendering/src/post/shaders/velocityDilate.wgsl";
import { DEPTH_LINEARIZE_WGSL, DEPTH_MINMAX_HALF_WGSL, CAMERA_VELOCITY_WGSL } from "../../packages/rendering/src/post/shaders/depthDownsample.wgsl";
import { BLOOM_PREFILTER_WGSL, BLOOM_DOWNSAMPLE_WGSL, BLOOM_UPSAMPLE_WGSL } from "../../packages/rendering/src/post/shaders/bloom.wgsl";
import { COMPOSITE_WGSL, CA_PASS_WGSL } from "../../packages/rendering/src/post/shaders/composite.wgsl";
import { DISPLAY_GRADE_WGSL, LUT_BAKE_WGSL } from "../../packages/rendering/src/post/shaders/displayGrade.wgsl";
import { FINALIZE_WGSL, FINALIZE_FXAA_FUSED_WGSL } from "../../packages/rendering/src/post/shaders/finalize.wgsl";
import { FXAA_185_FRAGMENT_WGSL } from "../../packages/rendering/src/post/shaders/fxaa.wgsl";
import { SMAA_EDGES_WGSL, SMAA_WEIGHTS_WGSL, SMAA_BLEND_WGSL } from "../../packages/rendering/src/post/shaders/smaa.wgsl";

/** A complete renderable module: fullscreen-triangle VS + the fragment twin. */
const VS = `struct VsOut {
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

`;

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

interface ModuleReport {
  errors: number;
  messages: Array<{ type: string; lineNum: number; linePos: number; message: string }>;
}

interface WgslRunResult {
  ok?: boolean;
  error?: string;
  modules?: Record<string, ModuleReport>;
}

async function run(): Promise<WgslRunResult> {
  if (!navigator.gpu) return { error: "webgpu-unavailable" };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { error: "webgpu-no-adapter" };
  const device = await adapter.requestDevice();

  const modules: Record<string, ModuleReport> = {};
  for (const [name, fs] of Object.entries(MODULES)) {
    const shader = device.createShaderModule({ code: VS + fs });
    const info = await shader.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    modules[name] = {
      errors: errors.length,
      messages: info.messages.map((m) => ({
        type: m.type,
        lineNum: m.lineNum,
        linePos: m.linePos,
        message: m.message.slice(0, 240),
      })),
    };
  }
  device.destroy();
  return { ok: true, modules };
}

(window as unknown as { runQrPrd03Wgsl: () => Promise<WgslRunResult> }).runQrPrd03Wgsl = run;
