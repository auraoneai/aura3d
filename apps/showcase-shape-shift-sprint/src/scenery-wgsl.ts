/**
 * A3/W6 + WP-15: WGSL twins of Shape Shift Sprint's game-local `material.custom` programs (`scenery.ts`),
 * line for line, so WebGPU (`backend: "auto"`) and WebGL2 compute identical lighting, clearcoat specular,
 * 6-world skyway gradients, iridescent Fresnel shield bubble, hydro-glow hover cushion, and 8x4 plasma
 * flipbook bursts. Custom attributes: `tone` alone sits at 3; the drift layer's `anchor`, `drift`, `tone`
 * (sorted) sit at 3, 5, 6.
 */
import { WGSL_CLIP, WGSL_POW, WGSL_SHOULDER, wgslStage } from "../../../examples/shared/runner-kit/index";

const VARYING = (tone: boolean): string => /* wgsl */ `
struct ToyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
${tone ? "  @location(3) vTone: vec3<f32>," : ""}
};`;

/** `VERTEX(tone)`. */
export function toyVertexWgsl(tone: boolean): string {
  return wgslStage([WGSL_CLIP, VARYING(tone)], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${tone ? ", @location(3) tone: vec3<f32>" : ""}) -> ToyVarying {
  var out: ToyVarying;
  out.vUv = a_uv;
${tone ? "  out.vTone = tone;" : ""}
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);
}

/** `FRAGMENT(tone, stripes)` with dual-lobe clearcoat highlight + milestone world sunTint. */
export function toyFragmentWgsl(tone: boolean, stripes = false): string {
  return wgslStage([WGSL_POW, WGSL_SHOULDER], /* wgsl */ `
fn ramp(d: f32) -> f32 {
  let c = d * 0.5 + 0.5;
  let fw = fwidth(c) * 0.5;
  return mix(0.54, 1.0, smoothstep(0.64 - fw, 0.64 + fw, c));
}
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>${tone ? ", @location(3) vTone: vec3<f32>" : ""}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let toCam = aura.u_cameraPosition - vWorld;
  if (dot(N, toCam) < 0.0) { N = -N; }
  let V = normalize(toCam);
  let uvGrain = 1.0 + (sin(vUv.x * 37.699) * cos(vUv.y * 25.132)) * 0.014 * aura.u_clearcoat;
  var base = aura.u_baseColor${tone ? " * vTone" : ""} * uvGrain;
${stripes ? "  base = mix(aura.u_stripeA, aura.u_stripeB, step(0.5, fract(vWorld.z / aura.u_stripePeriod)));" : ""}
  let skyC = vec3<f32>(0.88, 0.94, 1.0);
  let groundC = vec3<f32>(0.38, 0.32, 0.48);
  let hemi = mix(groundC, skyC, 0.5 * N.y + 0.5) * 0.38;
  let L1 = normalize(vec3<f32>(5.0, 11.0, 7.5));
  let L2 = normalize(vec3<f32>(-7.0, 6.0, -6.0));
  let keyLight = vec3<f32>(0.68, 0.60, 0.48) * aura.u_sunTint;
  let lit = hemi + keyLight * ramp(dot(N, L1)) + vec3<f32>(0.14, 0.19, 0.33) * ramp(dot(N, L2));
  var c = shoulder(base * lit);
  let H = normalize(L1 + V);
  let ndh = max(dot(N, H), 0.0);
  let coatSpec = (a3dPow(ndh, 68.0) * 0.44 + a3dPow(ndh, 16.0) * 0.12) * aura.u_clearcoat;
  c = c + aura.u_sunTint * coatSpec;
  let rim = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  c = c + mix(vec3<f32>(1.0, 0.88, 0.76), aura.u_sunTint, 0.45) * rim * aura.u_rimStrength;
  c = c + aura.u_emissive;
  let d = length(toCam);
  var f = 1.0 - exp(-max(d - aura.u_fogStart, 0.0) * aura.u_fogDensity);
  let low = clamp((-vWorld.y - 6.0) / 26.0, 0.0, 1.0);
  let fc = mix(aura.u_fogColor, aura.u_fogLow, low);
  f = clamp(max(f, low * 0.32), 0.0, 1.0);
  return vec4<f32>(mix(c, fc, f), aura.u_alpha);
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

export const SKY_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), u.x), mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(1.7, 9.2); a = a * 0.5; }
  return s;
}
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let y = dir.y;
  let horizon = aura.u_fogColor;
  var c = mix(horizon, aura.u_lowColor, smoothstep(0.0, 0.10, y));
  c = mix(c, aura.u_midColor, smoothstep(0.08, 0.34, y));
  c = mix(c, aura.u_zenithColor, smoothstep(0.30, 0.86, y));
  let sun = normalize(vec3<f32>(-0.55, 0.16, -0.82));
  let s = max(dot(dir, sun), 0.0);
  c = c + aura.u_sunTint * vec3<f32>(1.0, 0.66, 0.40) * (a3dPow(s, 6.0) * 0.28 + a3dPow(s, 48.0) * 0.45) + aura.u_sunTint * a3dPow(s, 900.0) * 2.6;
  let az = atan2(dir.x, -dir.z);
  let t = aura.u_time * 0.004;
  let q = vec2<f32>(az * 3.2 + t, y * 13.0);
  let band = smoothstep(0.015, 0.09, y) * (1.0 - smoothstep(0.20, 0.42, y));
  let cl = smoothstep(0.50, 0.78, fbm(q) * 0.85 + fbm(q * 2.7 + vec2<f32>(3.1)) * 0.3) * band;
  let hi = (1.0 - smoothstep(0.55, 0.9, y)) * smoothstep(0.32, 0.5, y);
  let cl2 = smoothstep(0.58, 0.8, fbm(vec2<f32>(az * 2.0 - t * 1.6, y * 5.0) + vec2<f32>(11.0))) * hi * 0.7;
  let cloudLit = mix(vec3<f32>(0.93, 0.89, 0.97), aura.u_sunTint, smoothstep(0.0, 0.3, y));
  c = mix(c, cloudLit + vec3<f32>(1.0, 0.7, 0.45) * a3dPow(s, 4.0) * 0.35, cl * 0.92);
  c = mix(c, vec3<f32>(0.97, 0.97, 1.0), cl2);
  c = mix(c, aura.u_fogLow, smoothstep(0.0, -0.18, y));
  return vec4<f32>(c, 1.0);
}`);

/** `CONTACT_VERTEX` (uv only; shared by contact strips, rings, hydro-glow, and plasma flipbook quad). */
export const CONTACT_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ContactVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ContactVarying {
  var out: ContactVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const CONTACT_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let ends = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
  let a = aura.u_alpha * a3dPow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.2) * ends;
  return vec4<f32>(aura.u_baseColor, a);
}`);

export const RING_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let d = length(vUv - vec2<f32>(0.5)) * 2.0;
  let band = smoothstep(0.62, 0.78, d) * (1.0 - smoothstep(0.86, 1.0, d));
  let inner = (1.0 - smoothstep(0.0, 0.8, d)) * 0.25;
  return vec4<f32>(aura.u_baseColor, aura.u_alpha * (band + inner));
}`);

/** Thin-film iridescent Fresnel shield bubble vertex + fragment WGSL twins. */
export const SHIELD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ShieldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> ShieldVarying {
  var out: ShieldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SHIELD_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  let fresnel = a3dPow(1.0 - ndv, 3.4);
  let phase = (1.0 - ndv) * 7.5 + aura.u_time * 1.8 + N.y * 2.2;
  let film = vec3<f32>(
    0.5 + 0.5 * sin(phase),
    0.5 + 0.5 * sin(phase + 2.094),
    0.5 + 0.5 * sin(phase + 4.188)
  );
  let L = normalize(vec3<f32>(5.0, 11.0, 7.5));
  let H = normalize(L + V);
  let glint = a3dPow(max(dot(N, H), 0.0), 56.0);
  let col = mix(aura.u_baseColor, film, 0.42 * fresnel) + vec3<f32>(1.0, 0.98, 0.94) * glint * 0.9;
  let outAlpha = clamp(aura.u_alpha * (0.04 + 1.45 * fresnel) + glint * 0.55, 0.0, 0.9);
  return vec4<f32>(col, outAlpha);
}`);

/** Hovercraft / glider hydro-glow ground cushion fragment WGSL twin. */
export const HYDRO_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = (vUv - vec2<f32>(0.5)) * 2.0;
  let d = length(p);
  let pulse = 0.5 + 0.5 * sin(aura.u_time * 7.0 - d * 6.5);
  let outerRing = smoothstep(0.58, 0.76, d) * (1.0 - smoothstep(0.84, 1.0, d));
  let innerCore = a3dPow(clamp(1.0 - d, 0.0, 1.0), 2.1) * (0.34 + 0.16 * pulse);
  let wake = clamp(p.y * 0.5 + 0.5, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.95, d)) * 0.22;
  let col = mix(aura.u_baseColor, aura.u_accentColor, outerRing * 0.65 + pulse * 0.2);
  let a = clamp(aura.u_alpha * (outerRing * 0.95 + innerCore + wake), 0.0, 0.92);
  return vec4<f32>(col, a);
}`);

/** 8x4 `createFlipbookAtlas("plasma")` morph burst fragment WGSL twin. */
export const PLASMA_FRAGMENT_WGSL = wgslStage([WGSL_POW], /* wgsl */ `
fn srgbToLin3(c: vec3<f32>) -> vec3<f32> {
  let lo = c / 12.92;
  let hi = vec3<f32>(
    a3dPow((c.x + 0.055) / 1.055, 2.4),
    a3dPow((c.y + 0.055) / 1.055, 2.4),
    a3dPow((c.z + 0.055) / 1.055, 2.4)
  );
  return select(lo, hi, c >= vec3<f32>(0.04045));
}
fn samplePlasmaCell(idx: f32, uv: vec2<f32>) -> vec4<f32> {
  let col = idx - floor(idx / 8.0) * 8.0;
  let row = floor(idx / 8.0);
  let cellUv = (vec2<f32>(col, row) + clamp(uv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(8.0, 4.0);
  return textureSample(u_plasmaAtlasTexture, u_plasmaAtlasSampler, cellUv);
}
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = clamp(aura.u_progress, 0.0, 0.999);
  let f = p * 31.0;
  let f0 = floor(f);
  let f1 = min(31.0, f0 + 1.0);
  let s0 = samplePlasmaCell(f0, vUv);
  let s1 = samplePlasmaCell(f1, vUv);
  let texel = mix(s0, s1, fract(f));
  let fade = 1.0 - smoothstep(0.76, 1.0, p);
  let col = srgbToLin3(texel.rgb) * aura.u_tintColor * aura.u_gain;
  return vec4<f32>(col, texel.a * fade);
}`);

/** `DRIFT_VERTEX`: wraps each piece along z on uTime, bobs it and grows it in; outputs match `toyFragmentWgsl(true)`. */
export const DRIFT_VERTEX_WGSL = wgslStage([WGSL_CLIP, VARYING(true)], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) anchor: vec4<f32>, @location(5) drift: vec4<f32>, @location(6) tone: vec3<f32>) -> ToyVarying {
  var out: ToyVarying;
  out.vUv = a_uv;
  out.vTone = tone;
  let zx = drift.x + aura.u_time * drift.y;
  let z = zx - drift.z * floor(zx / drift.z) + drift.w;
  let grow = smoothstep(drift.w, drift.w + 24.0, z);
  let lp = a_position - vec3<f32>(anchor.xy, 0.0);
  var p = vec3<f32>(anchor.xy, 0.0) + lp * max(grow, 0.001);
  p.z = p.z + z;
  p.y = p.y + sin(aura.u_time * 0.7 + anchor.z) * anchor.w;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(out.vWorld, 1.0));
  return out;
}`);
