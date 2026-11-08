/**
 * A3/W6: WGSL twins of the runner-kit `material.custom` programs (shaders.ts), for `?backend=webgpu` and the games that
 * default to WebGPU. Each stage is the GLSL line for line, so WebGPU computes the same values; WebGL2 keeps drawing the
 * untouched GLSL (its pixels are unchanged). Authored uniform `foo` reads as `aura.u_foo`, a texture uniform as
 * `u_fooTexture` / `u_fooSampler`.
 *
 * Mapping notes (shared by the five runner-kit games' own twins, which import these chunks):
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` / `a3dPow3` with that body.
 *   - `atan(y, x)` is `atan2`; `mod(x, y)` is `x - y * floor(x / y)`; `normalMatrix` is `mat3(u_normalMatrix)`
 *     (`a3dMat3Mul`); `dFdx` / `dFdy` are `dpdx` / `dpdy`; `uTime` is `aura.u_time`.
 *   - Derivatives (`fwidth`) stay in uniform control flow, at the same call sites as the GLSL.
 *   - Custom vertex attributes sit at the geometry's pool locations (`assignCustomAttributeLocations`: names sorted,
 *     locations 3, 5, 6, ...); the merged batches' `tone` is the only one, so it sits at 3.
 */
import { hexSrgb } from "./look-utils";
import type { SkyStop } from "./shaders";

export const WGSL_MARKER = "/* @aura3d-bindings */";

export const WGSL_CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
fn a3dMat3Mul(m: mat4x4<f32>, v: vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(v, 0.0)).xyz;
}
`;

export const WGSL_POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
fn a3dPow3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
`;

/** `SRGB` in shaders.ts (needs WGSL_POW). */
export const WGSL_SRGB = /* wgsl */ `
fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return mix(c / 12.92, a3dPow3((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), step(vec3<f32>(0.04045), c));
}
`;

/** `SHOULDER` in shaders.ts. */
export const WGSL_SHOULDER = /* wgsl */ `
fn shoulder(c: vec3<f32>) -> vec3<f32> {
  let k = 0.82;
  let over = max(c - vec3<f32>(k), vec3<f32>(0.0));
  return min(c, vec3<f32>(k)) + (1.0 - k) * (vec3<f32>(1.0) - exp(-over / (1.0 - k)));
}
`;

export function wgslStage(chunks: readonly string[], body: string): string {
  return [WGSL_MARKER, ...chunks, body].join("\n");
}

/** `TOON_VERTEX` (tone false) or `TOON_TONE_VERTEX` (tone true). */
export function toonVertexWgsl(tone: boolean): string {
  return wgslStage([WGSL_CLIP], /* wgsl */ `
struct ToonVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
${tone ? "  @location(3) vTone: vec3<f32>," : ""}
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${tone ? ", @location(3) tone: vec3<f32>" : ""}) -> ToonVarying {
  var out: ToonVarying;
  out.vUv = a_uv;
${tone ? "  out.vTone = tone;" : ""}
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);
}

export const TOON_VERTEX_WGSL = toonVertexWgsl(false);
export const TOON_TONE_VERTEX_WGSL = toonVertexWgsl(true);

/**
 * `toonFragment(withMap, withTone)`. The light-rig lines are kept one statement each (`let sky = ...`, `let ground = ...`,
 * the key term and the final `return`) so game art passes can rewrite them exactly as they rewrite the GLSL.
 */
export function toonFragmentWgsl(withMap: boolean, withTone = false): string {
  return wgslStage([WGSL_POW, WGSL_SRGB, WGSL_SHOULDER], /* wgsl */ `
fn ramp(d: f32) -> f32 {
  let c = d * 0.5 + 0.5;
  let fw = fwidth(c) * 0.5;
  return mix(0.7, 1.0, smoothstep(0.7 - fw, 0.7 + fw, c));
}
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>${withTone ? ", @location(3) vTone: vec3<f32>" : ""}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  if (dot(N, aura.u_cameraPosition - vWorld) < 0.0) { N = -N; }
  var base = aura.u_baseColor;
${withTone ? "  base = base * vTone;" : ""}
${withMap ? "  base = base * srgbToLinear(textureSample(u_mapTexture, u_mapSampler, vUv).rgb);" : ""}
  let sky = vec3<f32>(1.0);
  let ground = vec3<f32>(0.1845, 0.2462, 0.4020);
  let hemi = mix(ground, sky, 0.5 * N.y + 0.5) * 0.55;
  let L1 = normalize(vec3<f32>(6.0, 12.0, 6.0));
  let L2 = normalize(vec3<f32>(-6.0, 8.0, -6.0));
  let fill = vec3<f32>(0.3185, 0.4969, 1.0);
  let lit = hemi + vec3<f32>(0.65) * ramp(dot(N, L1)) + fill * 0.25 * ramp(dot(N, L2));
  return vec4<f32>(shoulder(base * lit) + aura.u_emissive, aura.u_alpha);
}`);
}

export const SKY_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** `gradientSkyFragment(stops)`: the same stop list, sorted the same way, with the same constants. The closing statement is one line. */
export function gradientSkyFragmentWgsl(stops: readonly SkyStop[]): string {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const col = (i: number): string => {
    const [r, g, b] = hexSrgb(sorted[i]!.hex);
    return `srgbToLinear(vec3<f32>(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}))`;
  };
  const lines = [`var c = ${col(0)};`];
  for (let i = 1; i < sorted.length; i++) {
    const t0 = sorted[i - 1]!.t, t1 = sorted[i]!.t;
    lines.push(`c = mix(c, ${col(i)}, smoothstep(${t0.toFixed(4)}, ${t1.toFixed(4)}, t));`);
  }
  return wgslStage([WGSL_POW, WGSL_SRGB], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let y = normalize(vWorld - aura.u_cameraPosition).y;
  let t = clamp(0.5 - y * 0.5, 0.0, 1.0);
  ${lines.join("\n  ")}
  return vec4<f32>(c, 1.0);
}`);
}

export const FLAT_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
}`);

export const FLAT_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_baseColor, aura.u_alpha); }`);

export const FLAT_TONE_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct FlatToneVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTone: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) tone: vec3<f32>) -> FlatToneVarying {
  var out: FlatToneVarying;
  out.vTone = tone;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const FLAT_TONE_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>) -> @location(0) vec4<f32> { return vec4<f32>(aura.u_baseColor * vTone, aura.u_alpha); }`);

/** `SHADOW_VERTEX` (uv only). */
export const SHADOW_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ShadowVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ShadowVarying {
  var out: ShadowVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SHADOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let d = length(vUv - vec2<f32>(0.5)) * 2.0;
  let a = aura.u_alpha * (1.0 - smoothstep(0.86, 1.0, d));
  return vec4<f32>(aura.u_baseColor, a);
}`);

export const STRIP_SHADOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let across = abs(vUv.x - 0.5) * 2.0;
  let fw = fwidth(across) + 1e-3;
  let a = aura.u_alpha * (1.0 - smoothstep(0.8 - fw, 0.8 + fw, across)) * (1.0 - 0.3 * vUv.y);
  return vec4<f32>(aura.u_baseColor, a);
}`);
