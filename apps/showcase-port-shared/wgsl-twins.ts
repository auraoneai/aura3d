/**
 * A3/W6: shared WGSL helper chunks for the hand-written WebGPU twins of the showcase games' `material.custom` GLSL programs
 * (the same bodies as Roadster Rush's `art/wgsl.ts`: the adapter's clip remap, `a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`,
 * `colorspace_decode` and `environment_fog_common`, line for line). WebGL2 never reads these: it keeps drawing the untouched GLSL, so its pixels
 * are unchanged. A material with a GLSL program and no WGSL twin makes `?backend=webgpu` fall back to WebGL2
 * (`CUSTOM_SHADER_WGSL_MISSING`).
 *
 * Vertex stages write clip z through `a3dRasterPosition`, the engine's projection contract: programs receive a
 * minus-one-to-one projection and remap to WebGPU's zero-to-one depth, unless the device sets `a3dZeroToOneProjection`.
 * Geometry streams sit at their VertexFormat locations (position 0, normal 1, uv 2); `material.custom` instance columns
 * at 8-11 and the instance colour at 12.
 */

export const WGSL_CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
fn a3dMat3Mul(m: mat4x4<f32>, v: vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(v, 0.0)).xyz;
}
`;

export const WGSL_MATH = /* wgsl */ `
fn a3dSaturate(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn a3dSafeNormalize3(v: vec3<f32>, fallback: vec3<f32>) -> vec3<f32> {
  let l2 = dot(v, v);
  if (l2 > 1e-20) { return v * inverseSqrt(l2); }
  return fallback;
}
fn a3dFinite1(x: f32) -> f32 {
  // isnan/isinf have no WGSL builtin (and a compiler may assume finite math): test the exponent bits.
  if ((bitcast<u32>(x) & 0x7f800000u) == 0x7f800000u) { return 0.0; }
  return x;
}
fn a3dFinite3(v: vec3<f32>) -> vec3<f32> { return vec3<f32>(a3dFinite1(v.x), a3dFinite1(v.y), a3dFinite1(v.z)); }
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
fn a3dModF(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
`;

export const WGSL_COLOR = /* wgsl */ `
fn a3dSrgbToLinear(srgb: vec3<f32>) -> vec3<f32> {
  let c = max(srgb, vec3<f32>(0.0));
  return mix(c / 12.92, pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), step(vec3<f32>(0.04045), c));
}
`;

/** `a3d_noise` (2D hashes, value noise, fbm). */
export const WGSL_NOISE = /* wgsl */ `
fn a3dHash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
fn a3dHash31(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 = p3 + dot(p3, p3.zyx + vec3<f32>(31.32));
  return fract((p3.x + p3.y) * p3.z);
}
fn a3dValueNoise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(a3dHash21(i), a3dHash21(i + vec2<f32>(1.0, 0.0)), u.x),
             mix(a3dHash21(i + vec2<f32>(0.0, 1.0)), a3dHash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn a3dFbm2(p0: vec2<f32>, octaves: i32) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= octaves) { break; }
    s = s + a * a3dValueNoise2(p);
    p = p * 2.03 + vec2<f32>(17.1);
    a = a * 0.5;
  }
  return s;
}
`;

/** `a3d_sky` (sun disc and glow, horizon haze, stars). */
export const WGSL_SKY = /* wgsl */ `
fn a3dSunDisc(dir: vec3<f32>, sunDir: vec3<f32>, angularRadius: f32) -> f32 {
  let ang = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  let r = max(angularRadius, 1e-4);
  return 1.0 - smoothstep(r * 0.9, r * 1.05, ang);
}
fn a3dSunGlow(dir: vec3<f32>, sunDir: vec3<f32>, falloff: f32) -> f32 {
  let c = clamp(dot(dir, sunDir), -1.0, 1.0);
  return exp((c - 1.0) * max(falloff, 1e-3));
}
fn a3dHorizonHaze(dir: vec3<f32>, color: vec3<f32>, thickness: f32) -> vec3<f32> {
  let t = max(thickness, 1e-3);
  return color * (1.0 - smoothstep(0.0, t, abs(dir.y)));
}
fn a3dStars(dir: vec3<f32>, density: f32) -> f32 {
  let cell = floor(dir * 180.0);
  let h = fract(sin(dot(cell, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453);
  return step(1.0 - clamp(density, 0.0, 1.0), h) * smoothstep(0.0, 0.3, dir.y);
}
`;

/** `a3d_fog`: the author fog helpers (`a3dFogExp2`). */
export const WGSL_FOG = /* wgsl */ `
fn a3dFogExp2(color: vec3<f32>, fogColor: vec3<f32>, dist: f32, density: f32) -> vec3<f32> {
  let x = max(density, 0.0) * max(dist, 0.0);
  return mix(color, fogColor, vec3<f32>(1.0 - exp(-x * x)));
}
`;

/** `environment_fog_common` (`fog: true`), applied to the fragment's world position like the GLSL wrapper. */
export const WGSL_ENVIRONMENT_FOG = /* wgsl */ `
fn a3dEnvironmentFogFactor(worldPosition: vec3<f32>) -> f32 {
  if (aura.u_environmentFogEnabled < 0.5) { return 0.0; }
  let distanceToCamera = length(aura.u_cameraPosition - worldPosition);
  var factor = 0.0;
  if (aura.u_environmentFogMode < 1.5) {
    factor = (distanceToCamera - aura.u_environmentFogNear) / max(aura.u_environmentFogFar - aura.u_environmentFogNear, 0.000001);
  } else if (aura.u_environmentFogMode < 2.5) {
    factor = 1.0 - exp(-max(aura.u_environmentFogDensity, 0.0) * distanceToCamera);
  } else {
    let scaledDensity = max(aura.u_environmentFogDensity, 0.0) * distanceToCamera;
    factor = 1.0 - exp(-(scaledDensity * scaledDensity));
  }
  var heightMultiplier = 1.0;
  if (aura.u_environmentFogHeightFalloff > 0.0) {
    heightMultiplier = exp(-max(0.0, worldPosition.y - aura.u_environmentFogHeightReference) * aura.u_environmentFogHeightFalloff);
  }
  return clamp(factor * heightMultiplier, 0.0, 1.0) * clamp(aura.u_environmentFogMaxOpacity, 0.0, 1.0);
}
fn a3dApplyEnvironmentFog(linearColor: vec3<f32>, worldPosition: vec3<f32>, fragCoord: vec2<f32>) -> vec3<f32> {
  let fogFactor = a3dEnvironmentFogFactor(worldPosition);
  var fogged = mix(linearColor, aura.u_environmentFogColor, fogFactor);
  if (aura.u_volumetricIntensity > 0.0) {
    let viewDistance = max(length(aura.u_cameraPosition - worldPosition), 0.000001);
    let viewDirection = (aura.u_cameraPosition - worldPosition) / viewDistance;
    let forwardLobe = pow(max(dot(viewDirection, aura.u_volumetricLightDirection), 0.0), 6.0);
    var heightGate = 1.0;
    if (aura.u_environmentFogHeightFalloff > 0.0) {
      heightGate = exp(-max(0.0, worldPosition.y - aura.u_environmentFogHeightReference) * aura.u_environmentFogHeightFalloff);
    }
    let inscatter = aura.u_volumetricIntensity * heightGate * forwardLobe * aura.u_volumetricLightColor * (0.15 + 0.85 * fogFactor);
    let dither = fract(sin(dot(fragCoord, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5;
    fogged = fogged + inscatter + vec3<f32>(dither * (1.0 / 255.0));
  }
  return fogged;
}
`;

/** The four `material.custom` instance-matrix columns (locations 8-11) as vertex-entry parameters. */
export const WGSL_INSTANCE_INPUTS = "@location(8) a_instanceMatrix0: vec4<f32>, @location(9) a_instanceMatrix1: vec4<f32>, " +
  "@location(10) a_instanceMatrix2: vec4<f32>, @location(11) a_instanceMatrix3: vec4<f32>";

/** One WGSL stage: the engine binding marker, then the helper chunks, then the stage body. */
export function wgslStage(chunks: readonly string[], body: string): string {
  return ["/* @aura3d-bindings */", ...chunks, body].join("\n");
}
