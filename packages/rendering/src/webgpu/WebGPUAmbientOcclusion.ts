/**
 * Native WebGPU ambient occlusion.
 *
 * Two routes, each the WGSL twin of a WebGL2 route:
 *
 * - `WEBGPU_SSAO_FRAGMENT`: the legacy fused-chain `ssao` pass
 *   (`webgl2/LegacyPost.ts` `ensureSsaoProgram`). A 3x3 ring of depth
 *   differences on raw window depth, applied to display-space color after tone
 *   mapping. Reversed depth is converted back to the standard encoding first,
 *   so a reversed WebGPU frame matches a standard WebGL2 frame.
 * - The v2 S2 GTAO stage (`post/v2Stages.ts`, `post/shaders/gtao.glsl.ts`,
 *   `post/shaders/gtaoDenoise.glsl.ts`): linear view depth, half-resolution
 *   min/max depth, depth-horizon AO, two bilateral denoise passes and the
 *   joint-bilateral apply onto linear HDR before bloom and tone mapping.
 *
 * All passes read their inputs with `textureLoad` through an explicit
 * `unfilterable-float` layout: uniforms at binding 0, textures from binding 2.
 * Depth is bound as a `depth-only` view of the single-sample hardware depth
 * attachment (depth formats are compatible with `unfilterable-float`).
 *
 * WGSL frame coordinates are y-down where GLSL `gl_FragCoord` is y-up. Every
 * texture read and write uses the same convention, so only the conversion to
 * NDC flips y. Kernels that are symmetric in y give identical results.
 */

/** The authored fallback weight ceiling for untagged pixels (v2Stages `AO_FALLBACK_STRENGTH_MAX`). */
export const WEBGPU_AO_FALLBACK_STRENGTH_MAX = 0.1;

/** Sky sentinel written for cleared depth, same as the WebGL2 linearize pass. */
export const WEBGPU_AO_SKY_DEPTH = 3e38;

export interface WebGPUSsaoParameters {
  readonly radius: number;
  readonly intensity: number;
  readonly bias: number;
}

/** Same validation and defaults as the WebGL2 `normalizeNativeSsaoOptions`. */
export function normalizeWebGPUSsaoOptions(options: Readonly<Record<string, unknown>>): WebGPUSsaoParameters {
  const read = (key: string, fallback: number): number => {
    const value = options[key];
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`SSAO ${key} must be finite.`);
    return value;
  };
  const rawRadius = read("radius", 2);
  const radius = rawRadius > 0 && rawRadius < 1 ? Math.max(1, Math.min(8, Math.round(rawRadius * 8))) : rawRadius;
  const intensity = read("intensity", 0.38);
  const bias = read("bias", 0.015);
  if (!Number.isInteger(radius) || radius < 1 || radius > 8) throw new RangeError("SSAO radius must be an integer in [1, 8].");
  if (intensity < 0 || intensity > 2) throw new RangeError("SSAO intensity must be finite and in [0, 2].");
  if (bias < 0 || bias > 0.25) throw new RangeError("SSAO bias must be finite and in [0, 0.25].");
  return { radius, intensity, bias };
}

/** `SsaoParams` (32 bytes). */
export function packWebGPUSsaoUniforms(width: number, height: number, options: WebGPUSsaoParameters, reversedDepth: boolean): Float32Array {
  return new Float32Array([width, height, options.radius, options.intensity, options.bias, reversedDepth ? 1 : 0, 0, 0]);
}

export const WEBGPU_SSAO_FRAGMENT = /* wgsl */ `struct SsaoParams {
  size: vec2<f32>,
  radius: f32,
  intensity: f32,
  bias: f32,
  reversed: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> u_ssao: SsaoParams;
@group(0) @binding(2) var u_source: texture_2d<f32>;
@group(0) @binding(3) var u_depth: texture_2d<f32>;

fn ssao_depth_at(coordinate: vec2<i32>) -> f32 {
  let last = vec2<i32>(u_ssao.size) - vec2<i32>(1);
  let d = textureLoad(u_depth, clamp(coordinate, vec2<i32>(0), last), 0).r;
  // Standard encoding (near 0, far 1), the encoding the WebGL2 kernel reads.
  return select(d, 1.0 - d, u_ssao.reversed > 0.5);
}

@fragment
fn fs_ssao(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let radius = i32(u_ssao.radius);
  let center_depth = ssao_depth_at(pixel);
  var occlusion = 0.0;
  var samples = 0.0;
  for (var step_y = -1; step_y <= 1; step_y += 1) {
    for (var step_x = -1; step_x <= 1; step_x += 1) {
      if (step_x == 0 && step_y == 0) { continue; }
      let sample_depth = ssao_depth_at(pixel + vec2<i32>(step_x * radius, step_y * radius));
      occlusion += clamp((center_depth - sample_depth - u_ssao.bias) / (0.14 + u_ssao.radius * 0.04), 0.0, 1.0);
      samples += 1.0;
    }
  }
  let factor = max(0.18, 1.0 - (occlusion / max(1.0, samples)) * u_ssao.intensity * 0.72);
  let source = textureLoad(u_source, pixel, 0);
  return vec4<f32>(source.rgb * factor, source.a);
}
`;

/** Authored GTAO fields the native stage reads (a subset of `GtaoOptions`). */
export interface WebGPUGtaoOptions {
  readonly radius?: number;
  readonly intensity?: number;
  readonly falloff?: number;
  readonly directions?: number;
  readonly steps?: number;
  readonly multiBounce?: boolean;
  readonly fallbackStrength?: number;
}

export interface NormalizedWebGPUGtao {
  readonly radius: number;
  readonly intensity: number;
  readonly falloff: number;
  readonly directions: 2 | 4;
  readonly steps: 4 | 6;
  readonly multiBounce: boolean;
  readonly fallbackStrength: number;
}

/** The v2 S2 defaults (`ao.radius ?? 0.35`, `directions ?? 4`, ...). */
export function normalizeWebGPUGtaoOptions(options: WebGPUGtaoOptions = {}): NormalizedWebGPUGtao {
  const finite = (value: number | undefined, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const fallback = finite(options.fallbackStrength, WEBGPU_AO_FALLBACK_STRENGTH_MAX);
  return {
    radius: finite(options.radius, 0.35),
    intensity: finite(options.intensity, 1),
    falloff: finite(options.falloff, 1),
    directions: options.directions === 2 ? 2 : 4,
    steps: options.steps === 6 ? 6 : 4,
    multiBounce: options.multiBounce !== false,
    fallbackStrength: Math.min(Math.max(fallback, 0), WEBGPU_AO_FALLBACK_STRENGTH_MAX)
  };
}

export interface WebGPUAoDepthEncoding {
  readonly near: number;
  readonly far: number;
  readonly orthographic: boolean;
  /** Hardware depth encoding of the attachment: reversed stores near at 1. */
  readonly reversed: boolean;
}

/**
 * `AoLinearDepthParams` (32 bytes). Perspective window depth is affine in
 * 1/z and orthographic depth in z, so the endpoint values are interpolated
 * (an infinite far plane has 1/far = 0).
 */
export function packWebGPUAoLinearDepthUniforms(encoding: WebGPUAoDepthEncoding): Float32Array {
  const { near, far, orthographic } = encoding;
  if (!Number.isFinite(near) || (!orthographic && near <= 0) || !(far > near) || (orthographic && !Number.isFinite(far))) {
    throw new RangeError("POSTPROCESS_DEPTH_RANGE_INVALID");
  }
  const nearValue = orthographic ? near : 1 / near;
  const farValue = orthographic ? far : Number.isFinite(far) ? 1 / far : 0;
  return new Float32Array([nearValue, farValue, orthographic ? 0 : 1, encoding.reversed ? 1 : 0, 0, 0, 0, 0]);
}

export const WEBGPU_AO_LINEAR_DEPTH_FRAGMENT = /* wgsl */ `struct AoLinearDepthParams {
  near_value: f32,
  far_value: f32,
  perspective: f32,
  reversed: f32,
  _pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_params: AoLinearDepthParams;
@group(0) @binding(2) var u_depth: texture_2d<f32>;

const AO_SKY_DEPTH = 3e38;

@fragment
fn fs_ao_linear_depth(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let d = textureLoad(u_depth, vec2<i32>(position.xy), 0).r;
  let reversed = u_params.reversed > 0.5;
  // Depth alone cannot tell a fragment exactly on the far plane from a clear.
  if ((reversed && d <= 0.0) || (!reversed && d >= 1.0)) {
    return vec4<f32>(AO_SKY_DEPTH, 0.0, 0.0, 1.0);
  }
  let near_weight = select(1.0 - d, d, reversed);
  let mixed = near_weight * u_params.near_value + (1.0 - near_weight) * u_params.far_value;
  var depth = mixed;
  if (u_params.perspective > 0.5) {
    if (!(mixed > 0.0)) { return vec4<f32>(AO_SKY_DEPTH, 0.0, 0.0, 1.0); }
    depth = 1.0 / mixed;
  }
  return vec4<f32>(depth, 0.0, 0.0, 1.0);
}
`;

export const WEBGPU_AO_MINMAX_HALF_FRAGMENT = /* wgsl */ `@group(0) @binding(2) var u_linear_depth: texture_2d<f32>;

@fragment
fn fs_ao_minmax_half(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(position.xy) * 2;
  let last = vec2<i32>(textureDimensions(u_linear_depth)) - vec2<i32>(1);
  let d00 = textureLoad(u_linear_depth, min(p, last), 0).r;
  let d10 = textureLoad(u_linear_depth, min(p + vec2<i32>(1, 0), last), 0).r;
  let d01 = textureLoad(u_linear_depth, min(p + vec2<i32>(0, 1), last), 0).r;
  let d11 = textureLoad(u_linear_depth, min(p + vec2<i32>(1, 1), last), 0).r;
  return vec4<f32>(min(min(d00, d10), min(d01, d11)), max(max(d00, d10), max(d01, d11)), 0.0, 1.0);
}
`;

export interface WebGPUGtaoCamera {
  /** Column-major projection; only the x/y rows are read, so GL and zero-to-one forms agree. */
  readonly projectionMatrix: ArrayLike<number>;
  readonly projectionMatrixInverse: ArrayLike<number>;
  readonly orthographic: boolean;
}

/** `GtaoParams` (96 bytes): inverse projection, then the scalar block. */
export function packWebGPUGtaoUniforms(camera: WebGPUGtaoCamera, options: NormalizedWebGPUGtao, frameIndex: number): Float32Array {
  const data = new Float32Array(24);
  for (let index = 0; index < 16; index += 1) data[index] = Number(camera.projectionMatrixInverse[index] ?? 0);
  if (!data.subarray(0, 16).every(Number.isFinite)) throw new RangeError("POSTPROCESS_PROJECTION_INVERSE_INVALID");
  data[16] = Math.abs(Number(camera.projectionMatrix[5] ?? 1));
  data[17] = camera.orthographic ? 1 : 0;
  data[18] = options.radius;
  data[19] = options.intensity;
  data[20] = options.falloff;
  data[21] = 1; // distance exponent (v2 S2 binds 1)
  data[22] = 1; // thickness (v2 S2 binds 1)
  data[23] = Number.isSafeInteger(frameIndex) && frameIndex >= 0 ? frameIndex % 16777216 : 0;
  return data;
}

export function webgpuGtaoFragment(directions: 2 | 4, steps: 4 | 6): string {
  return /* wgsl */ `struct GtaoParams {
  inv_proj: mat4x4<f32>,
  proj11: f32,
  ortho: f32,
  radius: f32,
  intensity: f32,
  falloff: f32,
  distance_exponent: f32,
  thickness: f32,
  frame_index: f32,
};

@group(0) @binding(0) var<uniform> u_gtao: GtaoParams;
@group(0) @binding(2) var u_linear_depth_half: texture_2d<f32>;

const GTAO_DIRECTIONS: i32 = ${directions};
const GTAO_STEPS: i32 = ${steps};
const GTAO_PI = 3.141592653589793;

fn gtao_rotation(pixel: vec2<i32>, frame: u32) -> f32 {
  var bits = (u32(pixel.x) * 1103515245u) ^ (u32(pixel.y) * 2654435761u) ^ (frame * 2246822519u);
  bits ^= bits >> 15u;
  bits *= 3266489917u;
  bits ^= bits >> 16u;
  return f32(bits & 0x00ffffffu) / 16777216.0;
}

fn gtao_depth(pixel: vec2<i32>) -> f32 {
  let last = vec2<i32>(textureDimensions(u_linear_depth_half)) - vec2<i32>(1);
  return textureLoad(u_linear_depth_half, clamp(pixel, vec2<i32>(0), last), 0).r;
}

fn gtao_is_ortho() -> bool { return u_gtao.ortho > 0.5; }

fn gtao_invalid(depth: f32) -> bool {
  return depth >= 2.9e38 || (!gtao_is_ortho() && depth <= 0.0);
}

// uv is y-down; NDC is y-up.
fn gtao_view_position(uv: vec2<f32>, depth: f32) -> vec3<f32> {
  let h = u_gtao.inv_proj * vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  if (gtao_is_ortho()) { return vec3<f32>(h.xy / h.w, -depth); }
  return vec3<f32>(h.xy * (depth / max(-h.z, 1e-6)), -depth);
}

fn gtao_depth_normal(pixel: vec2<i32>, texel: vec2<f32>, center: vec3<f32>, depth: f32) -> vec3<f32> {
  var l = gtao_depth(pixel + vec2<i32>(-1, 0));
  var r = gtao_depth(pixel + vec2<i32>(1, 0));
  var b = gtao_depth(pixel + vec2<i32>(0, -1));
  var t = gtao_depth(pixel + vec2<i32>(0, 1));
  if (gtao_invalid(l)) { l = depth; }
  if (gtao_invalid(r)) { r = depth; }
  if (gtao_invalid(b)) { b = depth; }
  if (gtao_invalid(t)) { t = depth; }
  let uv = (vec2<f32>(pixel) + 0.5) * texel;
  var dx: vec3<f32>;
  if (abs(l - depth) < abs(r - depth)) {
    dx = center - gtao_view_position(uv - vec2<f32>(texel.x, 0.0), l);
  } else {
    dx = gtao_view_position(uv + vec2<f32>(texel.x, 0.0), r) - center;
  }
  var dy: vec3<f32>;
  if (abs(b - depth) < abs(t - depth)) {
    dy = center - gtao_view_position(uv - vec2<f32>(0.0, texel.y), b);
  } else {
    dy = gtao_view_position(uv + vec2<f32>(0.0, texel.y), t) - center;
  }
  var n = cross(dx, dy);
  let magnitude = length(n);
  if (magnitude < 1e-12) { return vec3<f32>(0.0, 0.0, 1.0); }
  n = n / magnitude;
  let toward_camera = select(-center, vec3<f32>(0.0, 0.0, 1.0), gtao_is_ortho());
  return select(n, -n, dot(n, toward_camera) < 0.0);
}

fn gtao_occluder(sample_uv: vec2<f32>, size: vec2<f32>, center: vec3<f32>, normal: vec3<f32>) -> f32 {
  if (any(sample_uv < vec2<f32>(0.0)) || any(sample_uv >= vec2<f32>(1.0))) { return 0.0; }
  let sample_pixel = vec2<i32>(sample_uv * size);
  let sample_depth = gtao_depth(sample_pixel);
  if (gtao_invalid(sample_depth)) { return 0.0; }
  let sample_center = (vec2<f32>(sample_pixel) + 0.5) / size;
  let delta = gtao_view_position(sample_center, sample_depth) - center;
  let distance_to_sample = length(delta);
  if (distance_to_sample < 1e-6 || distance_to_sample >= u_gtao.radius || abs(delta.z) > u_gtao.thickness) { return 0.0; }
  let facing = max(dot(normal, delta / distance_to_sample) - 0.02, 0.0);
  let attenuation = pow(clamp(1.0 - distance_to_sample / u_gtao.radius, 0.0, 1.0), max(u_gtao.falloff, 0.0001));
  return facing * attenuation;
}

@fragment
fn fs_gtao(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let size = vec2<f32>(textureDimensions(u_linear_depth_half));
  let texel = 1.0 / size;
  let depth = gtao_depth(pixel);
  if (gtao_invalid(depth) || u_gtao.radius <= 0.0 || u_gtao.intensity <= 0.0) {
    return vec4<f32>(1.0);
  }
  let uv = position.xy * texel;
  let center = gtao_view_position(uv, depth);
  let normal = gtao_depth_normal(pixel, texel, center, depth);
  let projected_radius = u_gtao.radius * u_gtao.proj11 * size.y * 0.5;
  let radius_px = min(projected_radius / select(max(depth, 1e-6), 1.0, gtao_is_ortho()), 96.0);
  let rotation = gtao_rotation(pixel, u32(u_gtao.frame_index));
  var sum = 0.0;
  for (var direction = 0; direction < GTAO_DIRECTIONS; direction += 1) {
    let angle = GTAO_PI * (f32(direction) + rotation) / f32(GTAO_DIRECTIONS);
    let axis = vec2<f32>(cos(angle), sin(angle));
    var positive = 0.0;
    var negative = 0.0;
    for (var step_index = 0; step_index < GTAO_STEPS; step_index += 1) {
      let progress = pow(f32(step_index + 1) / f32(GTAO_STEPS), max(u_gtao.distance_exponent, 0.0001));
      let offset = axis * radius_px * progress * texel;
      positive = max(positive, gtao_occluder(uv + offset, size, center, normal));
      negative = max(negative, gtao_occluder(uv - offset, size, center, normal));
    }
    sum += positive + negative;
  }
  let occlusion = sum / f32(2 * GTAO_DIRECTIONS);
  let visibility = 1.0 - clamp(u_gtao.intensity, 0.0, 1.0) * clamp(occlusion, 0.0, 1.0);
  return vec4<f32>(visibility, 0.0, 0.0, 1.0);
}
`;
}

const AO_BILATERAL_WGSL = /* wgsl */ `
fn ao_weight(dz: f32, z: f32, g: f32) -> f32 {
  return g * exp(-abs(dz) / max(0.05 * z, 1e-4));
}
`;

/** `AoDenoiseParams` (16 bytes): unit pixel step, (1, 0) then (0, 1). */
export function packWebGPUAoDenoiseUniforms(horizontal: boolean): Float32Array {
  return new Float32Array(horizontal ? [1, 0, 0, 0] : [0, 1, 0, 0]);
}

export const WEBGPU_AO_DENOISE_FRAGMENT = /* wgsl */ `struct AoDenoiseParams {
  dir: vec2<f32>,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_denoise: AoDenoiseParams;
@group(0) @binding(2) var u_ao: texture_2d<f32>;
@group(0) @binding(3) var u_depth_half: texture_2d<f32>;
${AO_BILATERAL_WGSL}
@fragment
fn fs_ao_denoise(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  var gauss = array<f32, 5>(0.06136, 0.24477, 0.38774, 0.24477, 0.06136);
  let p = vec2<i32>(position.xy);
  let size = vec2<i32>(textureDimensions(u_ao));
  let center_ao = textureLoad(u_ao, p, 0).r;
  let center_z = textureLoad(u_depth_half, p, 0).r;
  var total = gauss[2];
  var sum = center_ao * gauss[2];
  let dir = vec2<i32>(u_denoise.dir);
  for (var i = -2; i <= 2; i += 1) {
    if (i == 0) { continue; }
    let s = clamp(p + dir * i, vec2<i32>(0), size - vec2<i32>(1));
    let z = textureLoad(u_depth_half, s, 0).r;
    let w = ao_weight(z - center_z, center_z, gauss[i + 2]);
    sum += textureLoad(u_ao, s, 0).r * w;
    total += w;
  }
  return vec4<f32>(sum / total, 0.0, 0.0, 1.0);
}
`;

/** `AoApplyParams` (16 bytes). An infinite far plane uses the sky sentinel. */
export function packWebGPUAoApplyUniforms(far: number, options: NormalizedWebGPUGtao): Float32Array {
  return new Float32Array([Number.isFinite(far) ? far : WEBGPU_AO_SKY_DEPTH, options.fallbackStrength, options.multiBounce ? 1 : 0, 0]);
}

export const WEBGPU_AO_APPLY_FRAGMENT = /* wgsl */ `struct AoApplyParams {
  far: f32,
  fallback_strength: f32,
  multi_bounce: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u_apply: AoApplyParams;
@group(0) @binding(2) var u_hdr: texture_2d<f32>;
@group(0) @binding(3) var u_ao: texture_2d<f32>;
@group(0) @binding(4) var u_depth_full: texture_2d<f32>;
@group(0) @binding(5) var u_depth_half: texture_2d<f32>;
${AO_BILATERAL_WGSL}
fn ao_multi_bounce(ao: f32) -> f32 {
  let a = 2.0404 * 0.5 - 0.3324;
  let b = -4.7951 * 0.5 + 0.6417;
  let c = 2.7552 * 0.5 + 0.6903;
  return max(ao, ((ao * a + b) * ao + c) * ao);
}

fn ao_upsample(uv_half: vec2<f32>, full_z: f32, half_size: vec2<f32>) -> f32 {
  let p = uv_half * half_size - 0.5;
  let p0 = vec2<i32>(floor(p));
  let f = p - vec2<f32>(p0);
  var sum = 0.0;
  var total = 0.0;
  for (var y = 0; y < 2; y += 1) {
    for (var x = 0; x < 2; x += 1) {
      let s = clamp(p0 + vec2<i32>(x, y), vec2<i32>(0), vec2<i32>(half_size) - vec2<i32>(1));
      let z = textureLoad(u_depth_half, s, 0).r;
      let wx = select(f.x, 1.0 - f.x, x == 0);
      let wy = select(f.y, 1.0 - f.y, y == 0);
      let w = ao_weight(z - full_z, full_z, wx * wy);
      sum += textureLoad(u_ao, s, 0).r * w;
      total += w;
    }
  }
  return select(1.0, sum / total, total > 0.0);
}

@fragment
fn fs_ao_apply(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let p = vec2<i32>(position.xy);
  var hdr = textureLoad(u_hdr, p, 0);
  let full_z = textureLoad(u_depth_full, p, 0).r;
  let half_size = vec2<f32>(textureDimensions(u_ao));
  let uv_half = position.xy / vec2<f32>(textureDimensions(u_hdr));
  let ao = ao_upsample(uv_half, full_z, half_size);
  let ao_mb = select(ao, ao_multi_bounce(ao), u_apply.multi_bounce > 0.5);
  let sky = step(u_apply.far * 0.999, full_z);
  var w: f32;
  if (hdr.a >= 1.5) {
    // Tagged generated-program pixel: alpha = 2 + f_ind (prd03.indirectFraction).
    w = clamp(hdr.a - 2.0, 0.0, 1.0);
  } else {
    let luma = dot(hdr.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    w = u_apply.fallback_strength * step(luma, 4.0);
  }
  w = w * (1.0 - sky);
  let rgb = hdr.rgb * mix(1.0, ao_mb, w);
  return vec4<f32>(rgb, min(hdr.a, 1.0));
}
`;
