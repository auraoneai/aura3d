/**
 * Display stages that run on the native WebGPU depth-of-field chain: the v2
 * graph's chromatic aberration (radial 3-tap on working HDR, `CA_PASS_GLSL`),
 * S10b vignette (`DISPLAY_GRADE_*`, without a LUT) and S12 finalize (film
 * grain plus the triangular dither, `FINALIZE_*`). The math mirrors the WebGL2
 * v2 stages so a WebGPU frame matches the default backend.
 *
 * Bind convention is the device's sampled fullscreen pass: binding 0 is a
 * vec4 uniform array, binding 1 the linear sampler, binding 2 the source.
 */

import { POST_COMMON_WGSL } from "../post/shaders/common.wgsl.js";
import { vignetteColorRgb } from "../post/vignetteColor.js";

/**
 * Custom passes anchored before the v2 graph's S6 depth of field would run
 * after it on the native chain (which starts with depth of field), so only
 * tone-map and display anchors combine with native depth of field.
 */
export function nativeDofCustomAnchorPrecedesDof(insertAt: string | undefined): boolean {
  return insertAt === "after-depth" || insertAt === "before-taa" || insertAt === "after-taa";
}

export interface NativeDofDisplayStages {
  /** Runs on HDR right after the depth-of-field composite. */
  readonly chromaticAberration?: { readonly intensity: number };
  /** Display-referred, after tone mapping and grade, before FXAA. */
  readonly vignette?: { readonly intensity: number; readonly smoothness: number; readonly roundness: number; readonly color: readonly [number, number, number] };
  /** The last display write: grain (intensity may be zero) plus the triangular dither. */
  readonly finalize?: { readonly grainIntensity: number; readonly grainSize: number; readonly grainLuminanceResponse: number };
}

const finite = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/**
 * The stages a v2 pipeline bag asks for, using the same presence rules as the
 * WebGL2 graph: CA only with a non-zero intensity, vignette whenever authored,
 * and the finalize pass whenever the LDR tail runs (vignette or grain).
 */
export function nativeDofDisplayStagesFor(pipeline: {
  readonly chromaticAberration?: unknown; readonly vignette?: unknown; readonly filmGrain?: unknown;
} | undefined): NativeDofDisplayStages | undefined {
  if (!pipeline) return undefined;
  const ca = pipeline.chromaticAberration as { intensity?: unknown } | undefined;
  const vignette = pipeline.vignette as { intensity?: unknown; smoothness?: unknown; roundness?: unknown; color?: unknown } | undefined;
  const grain = pipeline.filmGrain as { intensity?: unknown; size?: unknown; luminanceResponse?: unknown } | undefined;
  const caIntensity = ca && typeof ca === "object" ? finite(ca.intensity, 0) : 0;
  const stages: {
    chromaticAberration?: NativeDofDisplayStages["chromaticAberration"];
    vignette?: NativeDofDisplayStages["vignette"];
    finalize?: NativeDofDisplayStages["finalize"];
  } = {};
  if (caIntensity !== 0) stages.chromaticAberration = { intensity: caIntensity };
  if (vignette && typeof vignette === "object") {
    stages.vignette = { intensity: finite(vignette.intensity, 0), smoothness: finite(vignette.smoothness, 1),
      roundness: finite(vignette.roundness, 1), color: vignetteColorRgb(vignette.color) };
  }
  const grainObject = grain && typeof grain === "object" ? grain : undefined;
  if (stages.vignette || grainObject) {
    stages.finalize = { grainIntensity: grainObject ? finite(grainObject.intensity, 0) : 0,
      grainSize: grainObject ? finite(grainObject.size, 1) : 1,
      grainLuminanceResponse: grainObject ? finite(grainObject.luminanceResponse, 1) : 1 };
  }
  return stages.chromaticAberration || stages.vignette || stages.finalize ? stages : undefined;
}

/** `params.x` = intensity. Same radial 3-tap as `CA_PASS_GLSL`. */
export const NATIVE_DOF_CA_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@fragment fn fs_dof_ca(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let centre = uv - vec2<f32>(0.5);
  let dir = centre * dot(centre, centre) * params.x;
  let c = textureSampleLevel(source, linearSampler, uv, 0.0);
  return vec4<f32>(textureSampleLevel(source, linearSampler, uv - dir, 0.0).r, c.g,
    textureSampleLevel(source, linearSampler, uv + dir, 0.0).b, c.a);
}`;

/**
 * params[0] = (intensity, smoothness, roundness, 0), params[1] = (color, 0),
 * params[2] = (width, height, 0, 0). Same shape as the S10b vignette.
 */
export const NATIVE_DOF_VIGNETTE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: array<vec4<f32>, 3>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@fragment fn fs_dof_vignette(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(source, linearSampler, uv, 0.0);
  var disp = c.rgb;
  let v = params[0];
  if (v.x > 0.0) {
    var p = (uv - vec2<f32>(0.5)) * 2.0;
    p.x = p.x * (params[2].x / params[2].y) * v.z;
    let len = length(p) * v.x;
    disp = disp * mix(vec3<f32>(1.0), params[1].xyz, pow(clamp(len, 0.0, 1.0), v.y));
  }
  return vec4<f32>(disp, c.a);
}`;

/** params = (frame, grainIntensity, grainSize, grainLuminanceResponse). Same as S12 without RCAS. */
export const NATIVE_DOF_FINALIZE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
${POST_COMMON_WGSL}
@fragment fn fs_dof_finalize(@location(0) uv: vec2<f32>, @builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(source, linearSampler, uv, 0.0);
  var disp = c.rgb;
  let luma = dot(disp, vec3<f32>(0.2126, 0.7152, 0.0722));
  let seed = vec2<u32>(frag_coord.xy * params.z) + vec2<u32>(u32(params.x) * 747796405u);
  let rnd = vec2<f32>(pcg2d(seed)) / 4294967296.0;
  disp = disp + vec3<f32>((rnd.x - 0.5) * params.y * mix(1.0, 1.0 - luma, params.w));
  disp = disp + vec3<f32>(triangular_dither(frag_coord.xy, params.x));
  return vec4<f32>(clamp(disp, vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}`;
