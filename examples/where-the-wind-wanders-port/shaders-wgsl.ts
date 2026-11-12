/**
 * A3/W6: WGSL twins of every `material.custom` program in shaders.ts, for `?backend=webgpu`. Each stage is the GLSL line for
 * line, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL (default pixels are unchanged). Authored
 * uniform `foo` reads as `aura.u_foo`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` / `a3dPow3` with the same body.
 *   - `atan(y, x)` is `atan2`; GLSL `mod` is `a3dModF` (floored); ternaries are `select`; `mat3(modelMatrix) * n` is the 4x4
 *     product on a w = 0 vector.
 *   - The GLSL `#ifdef` switches the specs set through `defines` (`WIND_SUN_SHADOW`, `WIND_HERO_SHADOW`, `SHORE_REFLECTION`)
 *     are builder arguments here, so each spec gets the twin of the program its defines select.
 *   - `a3d_fog`'s `a3dFogHeight`, `a3d_sky`'s sun / haze / star helpers and `a3d_shadow`'s `a3dSunShadowAuto` are ported
 *     from the engine chunks; the shadow lookup uses the same bindings as the shader-graph WGSL path (`aura.u_shadowMap*`,
 *     `u_shadowMapTextureTexture`, WebGPU's top-left texture origin).
 *   - Custom attributes sit at the geometry's pool locations (`assignCustomAttributeLocations`, names sorted, pool 3, 5, 6,
 *     8): foliage and scenery `kind` 3 / `phase` 5 / `sway` 6 / `tint` 8; the traveller `kind` 3 / `limb` 5 / `tint` 6;
 *     terrain, sea and pollen `tint` 3.
 *   - `gl_FragCoord` is `@builtin(position)`: its y runs top-down on WebGPU, which only mirrors the near-fade dither
 *     pattern (same density, same distances).
 */

import { CLOUD_SCALE, CLOUD_SPEED, GUST_MAX, GUST_MIN, GUST_SPEED, GUST_WANDER, GUST_WAVENUMBER, WIND_DIR } from "./wind";

const MARKER = "/* @aura3d-bindings */";

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
fn a3dMat3Mul(m: mat4x4<f32>, v: vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(v, 0.0)).xyz;
}
`;

const MATH = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
fn a3dPow3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
fn a3dModF(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
`;

/** `WIND_GLSL` in wind.ts, from the same `wind.ts` constants. */
const WIND_CONSTANTS = /* wgsl */ `
const WIND_DIR = vec2<f32>(${f(WIND_DIR[0])}, ${f(WIND_DIR[1])});
fn windGustBand(p: vec2<f32>, t: f32) -> f32 {
  let along = dot(p, WIND_DIR);
  let s = 0.5 + 0.5 * sin(along * ${f(GUST_WAVENUMBER)} - t * ${f(GUST_SPEED)} + ${f(GUST_WANDER)} * sin(t * 0.13));
  return s * s * s;
}
fn windGust(p: vec2<f32>, t: f32) -> f32 { return ${f(GUST_MIN)} + ${f(GUST_MAX - GUST_MIN)} * windGustBand(p, t); }
`;

/** `CLOUD_GLSL` in wind.ts (needs `fbm`). */
const CLOUD = /* wgsl */ `
fn cloudCover(p: vec2<f32>, t: f32) -> f32 {
  let q = (p - WIND_DIR * t * ${f(CLOUD_SPEED)}) * ${f(CLOUD_SCALE)};
  return smoothstep(0.5, 0.72, fbm(q + vec2<f32>(3.7, 1.9)));
}
`;

/** `a3d_fog`'s `a3dFogHeight`. */
const FOG_HEIGHT = /* wgsl */ `
fn a3dFogHeight(color: vec3<f32>, fogColor: vec3<f32>, dist: f32, worldY: f32, density: f32, heightDensity: f32, heightBase: f32, heightFalloff: f32, maxFog: f32) -> vec3<f32> {
  let d = max(dist, 0.0);
  let height = max(0.0, worldY - heightBase);
  let amount = 1.0 - exp(-(density * d + heightDensity * d * exp(-heightFalloff * height)));
  return mix(color, fogColor, clamp(amount, 0.0, clamp(maxFog, 0.0, 1.0)));
}
`;

/** `a3d_shadow`'s `a3dSunShadowAuto`. */
const SUN_SHADOW = /* wgsl */ `
fn a3dSunShadow(worldPosition: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let receiverNormal = normal / max(length(normal), 0.0001);
  let receiverLightDirection = toLight / max(length(toLight), 0.0001);
  let lightPosition = aura.u_shadowMapMatrix * vec4<f32>(worldPosition + receiverNormal * aura.u_shadowMapNormalBias, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let sampleUv = vec2<f32>(uv.x, 1.0 - uv.y);
  let normalDotLight = clamp(abs(dot(receiverNormal, receiverLightDirection)), 0.0, 1.0);
  let slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  let slopeTexelBias = slopeTangent * aura.u_shadowMapSlopeBias * max(aura.u_shadowMapTexelSize.x, aura.u_shadowMapTexelSize.y);
  let projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  var shadowed = 0.0;
  var totalWeight = 0.0;
  let sampleCount = clamp(i32(aura.u_shadowPcfSampleCount), 1, 32);
  for (var i = 0; i < 32; i = i + 1) {
    if (i >= sampleCount) { break; }
    let sampleData = aura.u_shadowPcfSamples[u32(i)];
    let weight = max(sampleData.z, 0.0);
    let offset = sampleData.xy * aura.u_shadowMapTexelSize;
    let storedDepth = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, sampleUv + vec2<f32>(offset.x, -offset.y), 0.0).r;
    let sampleTexelDistance = max(1.0, length(sampleData.xy));
    let receiverDepth = projectedDepth - aura.u_shadowMapBias - slopeTexelBias * sampleTexelDistance;
    shadowed = shadowed + select(0.0, 1.0, receiverDepth > storedDepth) * weight;
    totalWeight = totalWeight + weight;
  }
  let occlusion = select(0.0, shadowed / totalWeight, totalWeight > 0.0);
  return mix(1.0, 1.0 - occlusion, clamp(aura.u_shadowMapStrength, 0.0, 1.0));
}
fn a3dSunShadowAuto(worldPosition: vec3<f32>, normal: vec3<f32>) -> f32 {
  return a3dSunShadow(worldPosition, normal, aura.u_a3dSunDirection);
}
`;

/** `a3d_sky`'s sun, haze and star helpers. */
const SKY_CHUNK = /* wgsl */ `
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

/** `PLAYER_FADE` in shaders.ts (`fc` = gl_FragCoord.xy). */
const PLAYER_FADE = /* wgsl */ `
fn playerFade(world: vec3<f32>, fc: vec2<f32>) -> bool {
  let t = smoothstep(1.7, 3.6, distance(world.xz, aura.u_playerPos.xz));
  let ign = fract(52.9829189 * fract(dot(fc, vec2<f32>(0.06711056, 0.00583715))));
  return t < ign;
}
`;

export interface CommonOptions {
  /** `WIND_SUN_SHADOW`: the engine sun shadow scales the sun term. */
  readonly sunShadow?: boolean;
  /** `WIND_HERO_SHADOW`: the traced traveller shadow and contact pool. */
  readonly heroShadow?: boolean;
}

/** `COMMON` in shaders.ts under the given defines. */
function common(options: CommonOptions = {}): string {
  const { sunShadow = false, heroShadow = false } = options;
  return [MATH, FOG_HEIGHT, sunShadow ? SUN_SHADOW : "", /* wgsl */ `
fn hash21(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), f.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(17.3, 9.1); a = a * 0.5; }
  return s / 0.9375;
}
${WIND_CONSTANTS}
${CLOUD}
${heroShadow ? /* wgsl */ `
fn heroShadow(w: vec3<f32>) -> f32 {
  if (aura.u_heroShadowAmt <= 0.0 || aura.u_sunDir.y < 0.05) { return 1.0; }
  let sd = normalize(aura.u_sunDir);
  let s0 = max(0.0, (aura.u_playerPos.y + 0.1 - w.y) / sd.y);
  let s1 = max(0.0, (aura.u_playerPos.y + 2.5 - w.y) / sd.y);
  let a = w.xz + sd.xz * s0;
  let b = w.xz + sd.xz * s1;
  let pa = aura.u_playerPos.xz - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  let r = mix(0.46, 0.3, h);
  let body = (1.0 - smoothstep(r * 0.5, r * 1.4, length(pa - ba * h))) * step(w.y, aura.u_playerPos.y + 2.3);
  let fo = w.xz - aura.u_playerPos.xz;
  let contact = exp(-dot(fo, fo) / 0.45) * 0.6;
  return 1.0 - aura.u_heroShadowAmt * clamp(max(body * 0.45, contact), 0.0, 1.0);
}
fn heroContact(w: vec3<f32>) -> f32 {
  let fo = w.xz - aura.u_playerPos.xz;
  return aura.u_heroShadowAmt * 0.5 * exp(-dot(fo, fo) / 0.8) * step(w.y, aura.u_playerPos.y + 0.9);
}` : ""}
fn sunVisibility(world: vec3<f32>, n: vec3<f32>) -> f32 {
  var clouds = 1.0 - aura.u_cloudShadowAmt * cloudCover(world.xz, aura.u_windTime);
${heroShadow ? "  clouds = clouds * heroShadow(world);" : ""}
  return ${sunShadow ? "clouds * a3dSunShadowAuto(world, n)" : "clouds"};
}
fn lightSurface(albedo: vec3<f32>, n: vec3<f32>, ao: f32, wrap: f32, sss: f32, view: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let ndl = dot(n, aura.u_sunDir);
  let lam = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  let hemi = mix(aura.u_gndCol, aura.u_skyCol, n.y * 0.5 + 0.5) * 0.92;
  let vis = sunVisibility(world, n);
  let sun = aura.u_sunCol * aura.u_sunGain * lam * vis;
  let back = sss * a3dPow(clamp(dot(-view, aura.u_sunDir), 0.0, 1.0), 2.0) * 0.8 * vis;
  return albedo * (hemi * ao + sun * mix(1.0, ao, 0.7) + aura.u_sunCol * back);
}
fn nearFade(world: vec3<f32>, d0: f32, d1: f32, fc: vec2<f32>) -> bool {
  let t = smoothstep(d0, d1, distance(aura.u_cameraPosition, world));
  let ign = fract(52.9829189 * fract(dot(fc, vec2<f32>(0.06711056, 0.00583715))));
  return t < ign;
}
fn applyFog(c0: vec3<f32>, world: vec3<f32>, scale: f32) -> vec3<f32> {
  let d = distance(aura.u_cameraPosition, world);
  let dScaled = d * scale;
  let dFog = max(0.0, dScaled - 96.0);
  let fo = smoothstep(96.0, 360.0, dScaled) * (1.0 - exp(-a3dPow(aura.u_fogDensity * dFog * 1.25, 2.0)));
  let c = mix(c0, aura.u_fogCol, clamp(fo, 0.0, 0.78));
  return a3dFogHeight(c, mix(aura.u_fogCol, aura.u_sunCol, 0.18), max(0.0, d - 96.0), world.y, 0.0, 0.012 * aura.u_fogHeight * scale, -0.55, 0.9, 0.45 * aura.u_fogHeight);
}
`].join("\n");
}

function stage(chunks: readonly string[], body: string): string {
  return [MARKER, ...chunks, body].join("\n");
}

/* ---------------------------------------------------------------- foliage cards */

export const WIND_VERTEX_WGSL = stage([CLIP, WIND_CONSTANTS], /* wgsl */ `
struct WindVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTint: vec3<f32>,
  @location(1) vUv: vec2<f32>,
  @location(2) vWorld: vec3<f32>,
  @location(3) vKind: f32,
  @location(4) vPhase: f32,
  @location(5) vGust: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) kind: f32, @location(5) phase: f32, @location(6) sway: f32, @location(8) tint: vec3<f32>) -> WindVarying {
  var out: WindVarying;
  out.vTint = tint;
  out.vUv = a_uv;
  out.vKind = kind;
  out.vPhase = phase;
  var p = a_position;
  var gust = 0.55 + 0.45 * sin(aura.u_windTime * 0.31 + a_position.x * 0.045 + a_position.z * 0.03);
  let band = windGustBand(a_position.xz, aura.u_windTime);
  out.vGust = band * aura.u_gustAmt;
  gust = mix(gust, gust * (0.55 + 0.45 * windGust(a_position.xz, aura.u_windTime)), aura.u_gustAmt);
  let w = aura.u_windTime * 1.7 + phase + a_position.x * 0.12;
  let bend = a_uv.y * a_uv.y;
  p.x = p.x + (sin(w) * 0.7 + sin(w * 2.3 + phase) * 0.3) * sway * bend * aura.u_windStrength * gust * 1.3;
  p.z = p.z + cos(w * 0.73 + phase) * sway * 0.55 * bend * aura.u_windStrength * gust;
  if (kind < 1.5 && a_uv.y > 0.0) {
    let cd = distance(a_position.xz, aura.u_playerPos.xz);
    let keep = mix(0.2, 1.0, smoothstep(0.45, 1.7, cd));
    p.y = p.y - max(0.0, (p.y - aura.u_playerPos.y) * (1.0 - keep)) * a_uv.y;
  }
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

/** `WIND_FRAGMENT` (receive: `WIND_SUN_SHADOW` + `WIND_HERO_SHADOW`). */
export function windFragmentWgsl(receive: boolean): string {
  return stage([common({ sunShadow: receive, heroShadow: receive }), PLAYER_FADE], /* wgsl */ `
fn seg(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r0: f32, r1: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r0, r1, h);
}
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vTint: vec3<f32>, @location(1) vUv: vec2<f32>, @location(2) vWorld: vec3<f32>, @location(3) vKind: f32, @location(4) vPhase: f32, @location(5) vGust: f32) -> @location(0) vec4<f32> {
  let fc = fragCoord.xy;
  if (nearFade(vWorld, 2.5, 7.0, fc)) { discard; }
  if (vWorld.z > aura.u_playerPos.z - 0.4 && distance(vWorld.xz, aura.u_playerPos.xz) < 3.6 && playerFade(vWorld, fc)) { discard; }
  let k = i32(vKind + 0.5);
  let uv = vUv;
  var cover = 0.0;
  var tone = 0.0;
  var col = vTint;
  let ph = vPhase;
  if (k == 0) {
    for (var i = 0; i < 7; i = i + 1) {
      let fi = f32(i);
      let cx = 0.08 + fi * 0.14 + (hash21(vec2<f32>(ph, fi)) - 0.5) * 0.11;
      let h = 0.60 + 0.40 * hash21(vec2<f32>(fi, ph * 1.7));
      let lean = (hash21(vec2<f32>(ph + 3.0, fi)) - 0.5) * 0.38;
      let x = uv.x - cx - lean * uv.y * uv.y;
      let wdt = 0.088 * (1.0 - uv.y / h);
      let inside = step(uv.y, h) * (1.0 - smoothstep(wdt * 0.52, wdt, abs(x)));
      if (inside > cover) { cover = inside; tone = fi * 0.14 + uv.y / h * 0.64; }
    }
    col = vTint * (0.46 + 0.88 * tone * 0.8 + 0.30 * uv.y);
  } else if (k == 1) {
    var stem = 1.0 - smoothstep(0.016, 0.03, abs(uv.x - 0.5 - 0.04 * sin(uv.y * 3.0 + ph)));
    stem = stem * step(uv.y, 0.64);
    let hc = vec2<f32>(0.5, 0.74);
    let d = uv - hc;
    let ang = atan2(d.y, d.x);
    let petals = 0.2 * (0.78 + 0.22 * cos(5.0 * ang + ph));
    let head = 1.0 - smoothstep(petals * 0.82, petals, length(d));
    let core = 1.0 - smoothstep(0.045, 0.06, length(d));
    let leaf = (1.0 - smoothstep(0.0, 0.05, seg(uv, vec2<f32>(0.5, 0.12), vec2<f32>(0.78, 0.3), 0.045, 0.0))) +
               (1.0 - smoothstep(0.0, 0.05, seg(uv, vec2<f32>(0.5, 0.2), vec2<f32>(0.2, 0.36), 0.045, 0.0)));
    let green = vec3<f32>(0.12, 0.26, 0.06) * (0.8 + 0.5 * uv.y);
    let petal = vTint * (0.78 + 0.35 * length(d) / 0.2);
    col = mix(green, petal, head);
    col = mix(col, vec3<f32>(0.95, 0.62, 0.08), core);
    cover = max(max(stem, clamp(leaf, 0.0, 1.0)), head);
  } else if (k == 2) {
    let rib = uv.x - 0.5 - 0.22 * uv.y * uv.y * sign(sin(ph));
    let env = sin(clamp(uv.y, 0.0, 1.0) * 3.14159) * 0.42 * (1.0 - 0.35 * uv.y);
    let teeth = 0.5 + 0.5 * sin(uv.y * 46.0 + abs(rib) * 14.0);
    let frond = step(abs(rib), env * (0.45 + 0.55 * teeth)) * step(0.06, uv.y);
    let midrib = 1.0 - smoothstep(0.012, 0.022, abs(rib));
    cover = max(frond, midrib);
    col = vTint * (0.55 + 0.7 * uv.y) * (0.82 + 0.3 * teeth);
  } else if (k == 3) {
    let x = uv.x - 0.5 - 0.06 * sin(uv.y * 2.4 + ph);
    let blade = step(uv.y, 0.96) * (1.0 - smoothstep(0.02 * (1.0 - uv.y) + 0.004, 0.035 * (1.0 - uv.y) + 0.012, abs(x)));
    let seed = step(4.0, a3dModF(ph, 6.0));
    let d = vec2<f32>(x, (uv.y - 0.82) * 0.34);
    let head = seed * (1.0 - smoothstep(0.035, 0.05, length(d * vec2<f32>(1.6, 1.0)))) * step(0.7, uv.y) * step(uv.y, 0.94);
    cover = max(blade, head);
    col = mix(vTint * (0.5 + 0.8 * uv.y), vec3<f32>(0.28, 0.16, 0.07), head);
  } else if (k == 5) {
    let d = uv - vec2<f32>(0.5, 0.0);
    var best = 0.0;
    for (var i = 0; i < 5; i = i + 1) {
      let a = -1.35 + f32(i) * 0.675 + (hash21(vec2<f32>(ph, f32(i))) - 0.5) * 0.3;
      let dir = vec2<f32>(sin(a), cos(a));
      let along = dot(d, dir);
      let across = abs(dot(d, vec2<f32>(dir.y, -dir.x)));
      let len = 0.55 + 0.35 * hash21(vec2<f32>(f32(i), ph));
      let wdt = 0.17 * sin(clamp(along / len, 0.0, 1.0) * 3.14159) + 0.012;
      let inside = step(0.0, along) * step(along, len) * (1.0 - smoothstep(wdt * 0.8, wdt, across));
      if (inside > best) { best = inside; tone = along / len; }
    }
    cover = best;
    col = vTint * (0.5 + 0.8 * tone) * (0.85 + 0.3 * vnoise(uv * 18.0 + vec2<f32>(ph)));
    col = mix(col, vec3<f32>(0.1, 0.32, 0.22) * (0.6 + 0.7 * tone), 0.35);
  } else if (k == 6) {
    let x = uv.x - 0.5 - 0.05 * sin(uv.y * 2.5 + ph);
    var stem = 1.0 - smoothstep(0.012, 0.024, abs(x));
    stem = stem * step(uv.y, 0.55);
    let row = floor(uv.y * 22.0);
    let taper = 0.17 * (1.0 - smoothstep(0.52, 0.98, uv.y)) + 0.015;
    let cell = vec2<f32>(floor((x + 0.25) * 16.0), row);
    let floret = select(0.0, 1.0, hash21(cell + vec2<f32>(ph)) > 0.28);
    var within = step(abs(x), taper) * step(0.45, uv.y) * step(uv.y, 0.97) * floret;
    let fr = fract(vec2<f32>((x + 0.25) * 16.0, uv.y * 22.0)) - vec2<f32>(0.5);
    within = within * (1.0 - smoothstep(0.34, 0.46, length(fr)));
    cover = max(stem, within);
    let green = vec3<f32>(0.1, 0.28, 0.07);
    col = mix(green, vTint * (0.8 + 0.5 * hash21(cell)), within);
  } else {
    let root = uv - vec2<f32>(0.5, 0.02);
    var sprig = 0.0;
    var bloomAmt = 0.0;
    for (var i = 0; i < 6; i = i + 1) {
      let fi = f32(i);
      let ang = -0.95 + fi * 0.38 + (hash21(vec2<f32>(ph, fi)) - 0.5) * 0.22;
      let dir = vec2<f32>(sin(ang), cos(ang));
      let along = dot(root, dir);
      let curve = (hash21(vec2<f32>(fi + 4.0, ph)) - 0.5) * 0.18 * along * along;
      let across = abs(dot(root, vec2<f32>(dir.y, -dir.x)) - curve);
      let len = 0.56 + 0.34 * hash21(vec2<f32>(fi, ph * 1.3));
      let u = clamp(along / len, 0.0, 1.0);
      let needles = 0.5 + 0.5 * sin(along * 42.0 + fi * 2.1);
      let wdt = (0.048 * (1.0 - 0.65 * u) + 0.032 * needles * smoothstep(0.18, 0.85, u)) * step(0.0, along) * step(along, len);
      let sMask = 1.0 - smoothstep(wdt * 0.55, wdt, across);
      let panicle = smoothstep(0.46, 0.78, u) * (1.0 - smoothstep(0.92, 1.0, u)) * smoothstep(0.38, 0.72, vnoise(uv * 24.0 + vec2<f32>(ph + fi * 3.1)));
      if (sMask > sprig) {
        sprig = sMask;
        tone = u;
        bloomAmt = panicle;
      }
    }
    cover = sprig;
    let foliageVar = vnoise(uv * 19.0 + vec2<f32>(ph)) * 0.6 + vnoise(uv * 7.0 + vec2<f32>(ph * 1.9)) * 0.4;
    col = vTint * (0.42 + 0.58 * tone + 0.28 * foliageVar);
    let pick = fract(ph * 1.7);
    let blossom = select(select(select(vec3<f32>(0.94, 0.88, 0.66), vec3<f32>(0.86, 0.56, 0.68), pick < 0.86), vec3<f32>(0.92, 0.72, 0.20), pick < 0.68), vec3<f32>(0.66, 0.42, 0.74), pick < 0.38);
    col = mix(col, blossom * (0.82 + 0.32 * foliageVar), clamp(bloomAmt * 1.25, 0.0, 0.92));
  }
  if (cover < 0.5) { discard; }
  let view = normalize(aura.u_cameraPosition - vWorld);
  let n = normalize(vec3<f32>(0.0, 1.0, 0.0) + vec3<f32>((uv.x - 0.5) * 0.5, 0.0, 0.0));
  col = mix(col, col * vec3<f32>(1.18, 1.16, 1.02) + vec3<f32>(0.03, 0.035, 0.015), vGust * uv.y * 0.85);
  var lit = lightSurface(col, n, 0.44 + 0.56 * uv.y, 0.62, 0.66, view, vWorld);
${receive ? "  lit = lit * (1.0 - heroContact(vWorld));" : ""}
  return vec4<f32>(applyFog(lit, vWorld, 1.0), 1.0);
}`);
}

/* ---------------------------------------------------------------- terrain and sea */

export const PAINT_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct PaintVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTint: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(3) tint: vec3<f32>) -> PaintVarying {
  var out: PaintVarying;
  out.vTint = tint;
  out.vNormal = normalize(a3dMat3Mul(aura.u_modelMatrix, a_normal));
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** `PAINT_FRAGMENT` (receive: `WIND_SUN_SHADOW` + `WIND_HERO_SHADOW`). */
export function paintFragmentWgsl(receive: boolean): string {
  return stage([common({ sunShadow: receive, heroShadow: receive })], /* wgsl */ `
@fragment fn fs_main(@location(0) vTint: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vWorld.xz;
  let broad = fbm(p * 0.28);
  let brush = fbm(p * 1.6 + vec2<f32>(3.1));
  let fine = vnoise(p * 7.5) * 0.6 + vnoise(p * 19.0) * 0.4;
  let stroke = vnoise(vec2<f32>(p.x * 11.0, p.y * 2.4 + broad * 5.0));
  var albedo = vTint * (0.7 + 0.5 * broad) * (0.86 + 0.2 * brush + 0.16 * (stroke - 0.5) + 0.1 * (fine - 0.5));
  let grassy = smoothstep(0.0, 0.1, vTint.g - vTint.r * 0.92) * (1.0 - smoothstep(0.55, 0.9, vTint.r));
  let cell = floor(p * 2.1);
  let local = fract(p * 2.1) - vec2<f32>(0.5);
  let h = hash21(cell);
  let dot1 = step(0.9, h) * (1.0 - smoothstep(0.06, 0.1, length(local - (vec2<f32>(hash21(cell + vec2<f32>(4.0)), hash21(cell + vec2<f32>(9.0))) - vec2<f32>(0.5)) * 0.6)));
  let fcol = select(select(vec3<f32>(0.62, 0.7, 0.95), vec3<f32>(0.9, 0.9, 0.85), h > 0.94), vec3<f32>(0.9, 0.82, 0.28), h > 0.97);
  albedo = mix(albedo, fcol * 0.85, dot1 * grassy * 0.85);
  let wq = vec2<f32>(dot(p, WIND_DIR), dot(p, vec2<f32>(-WIND_DIR.y, WIND_DIR.x)));
  let lay = vnoise(vec2<f32>(wq.x * 0.9, wq.y * 7.0) + vec2<f32>(broad * 2.5));
  let bristle = vnoise(vec2<f32>(wq.x * 2.6, wq.y * 31.0));
  albedo = albedo * mix(1.0, 0.82 + 0.3 * lay + 0.12 * (bristle - 0.5), aura.u_paintAmt);
  let pathD = p.y - (3.5 + 1.7 * sin(0.082 * p.x));
  let pathBand = exp(-(pathD * pathD) / 0.55) * step(-52.0, p.x) * step(p.x, 58.0);
  let pathEdge = smoothstep(0.25, 0.75, pathBand + (lay - 0.5) * 0.5);
  albedo = mix(albedo, vec3<f32>(0.6, 0.4, 0.15) * (0.9 + 0.2 * bristle), pathEdge * 0.42 * aura.u_paintAmt);
  let e = 0.12;
  let h0 = vnoise(p * 2.4);
  let n = normalize(vNormal + vec3<f32>((vnoise(p * 2.4 + vec2<f32>(e, 0.0)) - h0), 0.0, (vnoise(p * 2.4 + vec2<f32>(0.0, e)) - h0)) * 0.9);
  let view = normalize(aura.u_cameraPosition - vWorld);
  var lit = lightSurface(albedo, n, 0.9 + 0.1 * brush, 0.35, 0.0, view, vWorld);
${receive ? "  lit = lit * (1.0 - heroContact(vWorld));" : ""}
  return vec4<f32>(applyFog(lit, vWorld, 1.0), 1.0);
}`);
}

const SHORE_REFLECTION = /* wgsl */ `
  if (refl.z < -0.01) {
    let th = (-98.0 - vWorld.z) / refl.z;
    let hx = vWorld.x + refl.x * th;
    let hy = vWorld.y + refl.y * th;
    let crown = abs(sin(hx * 0.62 + 1.7 * vnoise(vec2<f32>(hx * 0.11, 2.0))));
    let pineK = step(0.45, vnoise(vec2<f32>(hx * 0.21, 7.3)));
    let treeTop = -0.55 + 4.2 + 2.6 * vnoise(vec2<f32>(hx * 0.05, 1.3)) + crown * mix(2.2, 4.0, pineK);
    let onShore = (1.0 - smoothstep(treeTop - 0.5, treeTop + 0.5, hy)) * smoothstep(-160.0, -60.0, -th) * step(0.0, th);
    let bank = 1.0 - smoothstep(-0.55 + 1.2, -0.55 + 2.4, hy);
    let crownAlb = mix(vec3<f32>(0.2, 0.38, 0.14), vec3<f32>(0.09, 0.22, 0.12), pineK) * (0.8 + 0.35 * crown);
    let shoreAlb = mix(crownAlb, vec3<f32>(0.3, 0.42, 0.16), bank);
    let shoreLit = shoreAlb * (aura.u_skyCol * 0.85 + aura.u_sunCol * aura.u_sunGain * 0.3);
    col = mix(col, mix(shoreLit, deep * 0.6, 0.2), onShore * 0.72);
  }
`;

/** `SEA_FRAGMENT` (shoreReflection: `SHORE_REFLECTION`). */
export function seaFragmentWgsl(shoreReflection: boolean): string {
  return stage([common()], /* wgsl */ `
fn groundHSea(p: vec2<f32>) -> f32 {
  let dx1 = p.x - 39.0;
  let dz1 = p.y - 3.0;
  let dx2 = p.x + 27.0;
  let dz2 = p.y - 1.0;
  return 0.3
    + 0.58 * sin(0.06 * p.x)
    + 0.32 * cos(0.17 * p.y + 0.04 * p.x)
    + 1.45 * exp(-(dx1 * dx1 / 240.0 + dz1 * dz1 / 160.0))
    + 1.15 * exp(-(dx2 * dx2 / 190.0 + dz2 * dz2 / 120.0));
}

fn terrainShoreY(p: vec2<f32>) -> f32 {
  var h = groundHSea(p);
  let s = smoothstep(8.0, 16.0, p.x);
  let ss = -13.2 - 1.2 * (1.0 - s);
  let sl = 2.6 + 9.0 * (1.0 - s);
  let drop = 1.0 - smoothstep(ss - sl, ss, p.y);
  h = h - drop * (h + 2.15);
  let side = smoothstep(54.0, 84.0, abs(p.x - 2.0));
  let ridge = 7.5 * side * (0.7 + 0.3 * sin(0.23 * p.y + 0.4));
  return h + ridge * (1.0 - drop);
}

@fragment fn fs_main(@location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vWorld.xz;
  let t = aura.u_windTime;
  let bedY = terrainShoreY(p);
  let waterDepth = max(0.0, -0.55 - bedY);
  let ph1 = dot(p, vec2<f32>(0.86, -0.51)) * 0.62 - t * 0.78;
  let ph2 = dot(p, vec2<f32>(-0.44, -0.90)) * 1.18 - t * 1.05;
  let ph3 = dot(p, vec2<f32>(0.68, 0.73)) * 2.15 + t * 1.32;
  let ph4 = dot(p, vec2<f32>(-0.91, 0.41)) * 3.40 - t * 1.68;
  var grad = vec2<f32>(0.86, -0.51) * (0.042 * cos(ph1))
           + vec2<f32>(-0.44, -0.90) * (0.028 * cos(ph2))
           + vec2<f32>(0.68, 0.73) * (0.015 * cos(ph3))
           + vec2<f32>(-0.91, 0.41) * (0.009 * cos(ph4));
  let cap0 = fbm(p * 1.15 + vec2<f32>(t * 0.14, -t * 0.11));
  let capX = fbm(p * 1.15 + vec2<f32>(0.08 + t * 0.14, -t * 0.11));
  let capZ = fbm(p * 1.15 + vec2<f32>(t * 0.14, 0.08 - t * 0.11));
  grad = grad + vec2<f32>(capX - cap0, capZ - cap0) * 0.34;

  var wakeFoam = 0.0;
  if (aura.u_boatWake.w > 0.001) {
    let fwd = vec2<f32>(-sin(aura.u_boatWake.z), -cos(aura.u_boatWake.z));
    let right = vec2<f32>(fwd.y, -fwd.x);
    let rel = p - aura.u_boatWake.xy;
    let behind = -dot(rel, fwd);
    let across = dot(rel, right);
    if (behind > -1.2 && behind < 34.0) {
      let bClamp = max(behind + 1.2, 0.0);
      let armSpread = 0.34 * bClamp + 0.55;
      let armDist = abs(abs(across) - armSpread);
      let env = exp(-bClamp * 0.085) * smoothstep(-1.2, 0.8, behind) * aura.u_boatWake.w;
      let wakeWave = sin(armDist * 4.2 - t * 3.6 + bClamp * 0.55) * exp(-armDist * 1.15) * env;
      grad = grad + right * (sign(across) * wakeWave * 0.09);
      wakeFoam = (exp(-armDist * 1.65) * (0.55 + 0.45 * sin(bClamp * 1.8 - t * 3.2)) + 0.45 * exp(-abs(across) * 1.8) * exp(-bClamp * 0.14)) * env;
    }
  }

  let calmNearShore = smoothstep(0.0, 0.85, waterDepth);
  let n = normalize(vec3<f32>(-grad.x * (0.45 + 0.55 * calmNearShore), 1.0, -grad.y * (0.45 + 0.55 * calmNearShore)));
  let view = normalize(aura.u_cameraPosition - vWorld);
  let depth = smoothstep(0.0, 4.2, waterDepth);
  let amberShoal = vec3<f32>(0.24, 0.66, 0.58);
  let shallow = vec3<f32>(0.11, 0.62, 0.59);
  let deep = vec3<f32>(0.032, 0.38, 0.50);
  var col = mix(amberShoal, shallow, smoothstep(0.0, 0.75, waterDepth));
  col = mix(col, deep, a3dPow(depth, 0.72));
  let fres = 0.035 + 0.965 * a3dPow(1.0 - max(dot(n, view), 0.0), 4.2);
  let refl = reflect(-view, n);
  let skyc = mix(mix(aura.u_skyCol, aura.u_fogCol, 0.35), aura.u_skyCol * vec3<f32>(0.52, 0.72, 1.08), clamp(refl.y * 1.65, 0.0, 1.0));
  col = mix(col, skyc, fres * 0.58);
${shoreReflection ? SHORE_REFLECTION : ""}
  let sunSpec = a3dPow(max(dot(refl, aura.u_sunDir), 0.0), 180.0) * 4.2 + a3dPow(max(dot(refl, aura.u_sunDir), 0.0), 28.0) * 0.16;
  let sparkle = smoothstep(0.80, 0.985, vnoise(p * vec2<f32>(4.6, 8.2) + vec2<f32>(t * 0.55, -t * 0.38)));
  col = col + aura.u_sunCol * (sunSpec + sparkle * 0.16 * (1.0 - depth * 0.45)) * calmNearShore;
  let lap = 0.5 + 0.5 * sin(t * 1.25 - waterDepth * 6.4 + cap0 * 4.2);
  let lace = smoothstep(0.32, 0.72, vnoise(p * 1.85 + vec2<f32>(t * 0.18, -t * 0.12)));
  var shoreFoam = (1.0 - smoothstep(0.02, 0.55, waterDepth)) * (0.42 + 0.58 * lap) * (0.45 + 0.55 * lace);
  shoreFoam = shoreFoam + (1.0 - smoothstep(0.0, 0.16, abs(waterDepth - (0.32 + 0.26 * lap)))) * 0.38 * lace;
  let foam = clamp(shoreFoam + wakeFoam * 0.78, 0.0, 0.88);
  let foamTint = mix(vec3<f32>(0.94, 0.96, 0.92), mix(aura.u_skyCol, aura.u_sunCol, 0.35) + vec3<f32>(0.45), 0.35);
  col = mix(col, foamTint, foam);
  let alpha = smoothstep(0.0, 0.22, waterDepth) * mix(0.74, 0.98, smoothstep(0.0, 2.4, waterDepth));
  return vec4<f32>(applyFog(col, vWorld, 1.0), alpha);
}`);
}

/* ---------------------------------------------------------------- ribbons (stream, haze, shafts) */

export const HAZE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct UvWorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> UvWorldVarying {
  var out: UvWorldVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const STREAM_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let across = abs(vUv.x - 0.5) * 2.0;
  let t = aura.u_windTime;
  let flow = vnoise(vec2<f32>(vUv.y * 0.9 - t * 0.9, vUv.x * 7.0)) * 0.6 + vnoise(vec2<f32>(vUv.y * 2.3 - t * 1.6, vUv.x * 13.0)) * 0.4;
  let deepC = vec3<f32>(0.07, 0.5, 0.52);
  let shallowC = vec3<f32>(0.42, 0.82, 0.7);
  var col = mix(deepC, shallowC, smoothstep(0.1, 1.0, across) * 0.8 + flow * 0.25);
  col = col + vec3<f32>(0.5, 0.65, 0.6) * smoothstep(0.62, 0.9, flow) * 0.5;
  let view = normalize(aura.u_cameraPosition - vWorld);
  let fres = 0.05 + 0.5 * a3dPow(1.0 - max(view.y, 0.0), 3.0);
  col = mix(col, vec3<f32>(0.55, 0.78, 0.9), fres);
  let foam = smoothstep(0.78, 0.97, across) * (0.5 + 0.5 * vnoise(vec2<f32>(vUv.y * 3.0, t * 0.4)));
  col = mix(col, vec3<f32>(0.92, 0.96, 0.9), foam * 0.7);
  let alpha = (1.0 - smoothstep(0.88, 1.0, across)) * 0.94;
  return vec4<f32>(applyFog(col, vWorld, 1.0), alpha);
}`);

export const HAZE_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vec2<f32>(vUv.x * 15.0 - aura.u_windTime * 0.035 + aura.u_hazePhase, vUv.y * 3.0 + aura.u_hazePhase);
  let n = 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.1 + vec2<f32>(aura.u_windTime * 0.013));
  let edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  let height = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.40, 1.0, vUv.y));
  let a = edge * height * (0.3 + n * 0.7) * aura.u_hazeOpacity;
  let col = mix(aura.u_fogCol * 1.35, vec3<f32>(1.0, 0.96, 0.82), 0.35);
  return vec4<f32>(col, a);
}`);

export const SHAFT_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  var across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.x - 0.5) * 2.0);
  across = across * across;
  let along = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  let flicker = 0.7 + 0.3 * vnoise(vec2<f32>(vUv.x * 6.0 + aura.u_shaftSeed, aura.u_windTime * 0.12 + aura.u_shaftSeed));
  let a = across * along * flicker * aura.u_shaftOpacity;
  return vec4<f32>(aura.u_sunCol * 1.0 + vec3<f32>(0.1), a);
}`);

/* ---------------------------------------------------------------- sky */

export const SKY_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
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

export const SKY_FRAGMENT_WGSL = stage([common(), SKY_CHUNK], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let up = clamp(dir.y, 0.0, 1.0);
  let horizon = aura.u_skyHorizon;
  let mid = aura.u_skyMid;
  let zenith = aura.u_skyZenith;
  var sky = mix(horizon, mid, smoothstep(0.0, 0.3, up));
  sky = mix(sky, zenith, smoothstep(0.22, 0.85, up));
  let sunAmt = max(dot(dir, aura.u_sunDir), 0.0);
  let sunLegacy = aura.u_sunCol * (a3dPow(sunAmt, 6.0) * 0.16 + a3dPow(sunAmt, 90.0) * 0.7 + a3dPow(sunAmt, 2000.0) * 8.0);
  let sunPainted = aura.u_sunCol * (a3dSunGlow(dir, aura.u_sunDir, 9.0) * 0.22 + a3dSunGlow(dir, aura.u_sunDir, 160.0) * 0.6 + a3dSunDisc(dir, aura.u_sunDir, 0.0105) * 6.0)
    + a3dHorizonHaze(dir, mix(horizon, aura.u_sunCol, 0.35) * 0.18, 0.16);
  sky = sky + mix(sunLegacy, sunPainted, aura.u_skyPainted);
  var cp = dir.xz / max(dir.y + 0.09, 0.035) * 0.62 + vec2<f32>(aura.u_windTime * 0.011, aura.u_windTime * 0.004);
  cp = cp + aura.u_skyPainted * WIND_DIR * aura.u_windTime * 0.006;
  let c = fbm(cp * 1.15);
  let cs = fbm((cp + aura.u_sunDir.xz * 0.16) * 1.15);
  var cov = smoothstep(0.6 + 0.07 * aura.u_clearSky, 0.76 + 0.05 * aura.u_clearSky, c + 0.08 * fbm(cp * 4.0));
  cov = cov * smoothstep(0.0, 0.2, dir.y);
  let lit = clamp(0.55 + (c - cs) * 5.5, 0.0, 1.0);
  var cloud = mix(mix(vec3<f32>(0.55, 0.64, 0.78), vec3<f32>(0.8, 0.87, 0.96), 0.55 * aura.u_clearSky), vec3<f32>(1.25, 1.17, 1.02), lit) * aura.u_cloudTint;
  cloud = mix(cloud, horizon * 1.05, smoothstep(0.1, 0.0, dir.y) * 0.8);
  sky = sky + vec3<f32>(0.9, 0.92, 1.0) * a3dStars(dir, 0.012 * aura.u_starAmt) * aura.u_starAmt * 1.6 * (1.0 - cov);
  sky = mix(sky, cloud, cov * 0.92);
  sky = mix(horizon, sky, smoothstep(-0.12, 0.0, dir.y));
  return vec4<f32>(sky, 1.0);
}`);

/* ---------------------------------------------------------------- props and the traveller */

const PROP_VARYING = /* wgsl */ `
struct PropVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vTint: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vWorld: vec3<f32>,
  @location(3) vUv: vec2<f32>,
  @location(4) vKind: f32,
};`;

export const PROP_VERTEX_WGSL = stage([CLIP, PROP_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) kind: f32, @location(5) phase: f32, @location(6) sway: f32, @location(8) tint: vec3<f32>) -> PropVarying {
  var out: PropVarying;
  out.vTint = tint;
  out.vUv = a_uv;
  out.vKind = kind;
  var p = a_position;
  let gust = 0.55 + 0.45 * sin(aura.u_windTime * 0.31 + a_position.x * 0.045 + a_position.z * 0.03);
  let w = aura.u_windTime * 1.35 + phase;
  p.x = p.x + (sin(w + a_position.y * 0.5) * 0.7 + sin(w * 2.1 + phase * 1.7) * 0.3) * sway * gust;
  p.z = p.z + cos(w * 0.8 + a_position.x * 0.2) * sway * 0.5 * gust;
  let wp = aura.u_modelMatrix * vec4<f32>(p, 1.0);
  out.vWorld = wp.xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_modelMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

/** `PROP_FRAGMENT` (receive: `WIND_SUN_SHADOW`; the traveller draws it without). */
export function propFragmentWgsl(receive: boolean): string {
  return stage([common({ sunShadow: receive }), PLAYER_FADE], /* wgsl */ `
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vTint: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>, @location(3) vUv: vec2<f32>, @location(4) vKind: f32) -> @location(0) vec4<f32> {
  let fc = fragCoord.xy;
  if (nearFade(vWorld, 4.5, 11.0, fc)) { discard; }
  let k = i32(vKind + 0.5);
  if (k <= 1 && vWorld.z > aura.u_playerPos.z - 0.4 && distance(vWorld.xz, aura.u_playerPos.xz) < 3.6 && playerFade(vWorld, fc)) { discard; }
  let view = normalize(aura.u_cameraPosition - vWorld);
  var n = normalize(vNormal);
  if (dot(n, view) < 0.0) { n = -n; }
  let uv = vUv;
  let wp = vWorld;
  var albedo = vTint;
  var wrap = 0.25;
  var sss = 0.0;
  var ao = 1.0;
  var spec = 0.0;
  var emissive = 0.0;
  if (k == 0) {
    let clump = vnoise(wp.xz * 0.8 + vec2<f32>(wp.y * 1.3));
    let leaf = vnoise(wp.xy * 5.5 + wp.zz * 2.2) * 0.55 + vnoise(wp.zy * 8.0 + wp.xx * 3.0) * 0.45;
    let dap = smoothstep(0.62, 0.86, vnoise(wp.xz * 2.6 + vec2<f32>(wp.y * 2.2)));
    albedo = vTint * (0.62 + 0.62 * leaf) * (0.82 + 0.34 * clump) + vTint * vec3<f32>(0.55, 0.5, 0.1) * dap * 0.55;
    wrap = 0.6; sss = 0.7;
    ao = 0.55 + 0.45 * clamp(n.y * 0.5 + 0.55, 0.0, 1.0);
  } else if (k == 1) {
    let streak = vnoise(vec2<f32>(uv.x * 7.0, uv.y * 0.9));
    let ring = vnoise(vec2<f32>(uv.x * 22.0, uv.y * 3.0));
    albedo = vTint * (0.62 + 0.55 * streak) * (0.88 + 0.2 * ring);
    wrap = 0.3;
  } else if (k == 2) {
    let row = floor(uv.y / 0.24);
    let fr = fract(uv.y / 0.24);
    let tone = 0.8 + 0.35 * hash21(vec2<f32>(row, 3.0));
    let grain = vnoise(vec2<f32>(uv.x * 1.3 + row * 4.0, uv.y * 24.0));
    let seam = smoothstep(0.0, 0.06, fr) * (1.0 - smoothstep(0.94, 1.0, fr));
    albedo = vTint * tone * (0.82 + 0.3 * grain) * mix(0.55, 1.0, seam);
  } else if (k == 3) {
    let stain = vnoise(uv * 2.2 + vec2<f32>(3.0)) * 0.5 + vnoise(uv * 9.0) * 0.5;
    let trowel = vnoise(vec2<f32>(uv.x * 5.2, uv.y * 1.4));
    albedo = vTint * (0.84 + 0.22 * stain + 0.08 * (trowel - 0.5));
    wrap = 0.32;
  } else if (k == 4) {
    let row = uv.y / 0.5;
    let r = floor(row);
    let colx = uv.x / 0.62 + 0.5 * a3dModF(r, 2.0);
    let cellId = vec2<f32>(floor(colx), r);
    let tone = 0.78 + 0.4 * hash21(cellId);
    let fr = fract(row);
    let edge = smoothstep(0.0, 0.2, fr);
    let side = smoothstep(0.0, 0.05, fract(colx)) * (1.0 - smoothstep(0.95, 1.0, fract(colx)));
    let moss = smoothstep(0.56, 0.84, vnoise(uv * 1.8 + vec2<f32>(5.0)));
    albedo = mix(vTint * tone, vec3<f32>(0.24, 0.37, 0.14), moss * 0.42) * mix(0.55, 1.0, edge) * mix(0.8, 1.0, side);
    wrap = 0.2;
  } else if (k == 5) {
    let b = vnoise(wp.xz * 1.6 + vec2<f32>(wp.y * 1.1)) * 0.6 + vnoise(wp.xz * 6.0 + vec2<f32>(wp.y * 4.0)) * 0.4;
    let crevice = smoothstep(0.28, 0.62, b);
    let mossPatch = smoothstep(0.48, 0.80, vnoise(wp.xz * 2.4 + vec2<f32>(3.7, 8.1))) * clamp(n.y * 0.85 + 0.25, 0.0, 1.0);
    albedo = mix(vTint * (0.62 + 0.52 * b), vec3<f32>(0.22, 0.36, 0.13), mossPatch * 0.46);
    ao = 0.78 + 0.22 * crevice;
    wrap = 0.18;
  } else if (k == 6) {
    let plank = floor(wp.z * 1.85);
    let fr = fract(wp.z * 1.85);
    let tone = 0.78 + 0.38 * hash21(vec2<f32>(plank, 7.0));
    let grain = vnoise(vec2<f32>(wp.x * 6.0 + plank * 5.0, wp.z * 3.0));
    albedo = vTint * tone * (0.8 + 0.3 * grain) * mix(0.45, 1.0, smoothstep(0.0, 0.08, fr) * (1.0 - smoothstep(0.92, 1.0, fr)));
  } else if (k == 7) {
    let refl = reflect(-view, n);
    albedo = mix(vec3<f32>(0.04, 0.09, 0.12), vec3<f32>(0.3, 0.45, 0.55), clamp(refl.y * 0.5 + 0.4, 0.0, 1.0));
    emissive = 0.22 * (0.7 + 0.3 * sin(wp.x * 3.0));
    spec = 0.5;
  } else if (k == 8) {
    let brushRing = 0.88 + 0.12 * sin(wp.y * 68.0 + vnoise(wp.xz * 14.0) * 3.0);
    let patina = smoothstep(0.58, 0.86, vnoise(wp.xz * 5.5 + vec2<f32>(wp.y * 3.2))) * (1.0 - clamp(abs(n.y), 0.0, 0.65));
    albedo = mix(vTint * brushRing, vec3<f32>(0.24, 0.48, 0.41), patina * 0.38);
    spec = mix(1.15, 0.35, patina);
    wrap = 0.12;
  } else if (k == 9) {
    let weave = 0.9 + 0.1 * sin(uv.x * 90.0) * sin(uv.y * 90.0);
    let fold = vnoise(uv * 3.0);
    albedo = vTint * weave * (0.88 + 0.18 * fold);
    wrap = 0.7; sss = 0.8;
  } else if (k == 10) {
    albedo = vTint;
    wrap = 0.5; sss = 0.3;
  }
  if (aura.u_paintAmt > 0.0 && k != 7 && k != 8) {
    var bw = a3dPow3(abs(n), vec3<f32>(4.0));
    bw = bw / (bw.x + bw.y + bw.z + 1e-4);
    let gx = vnoise(vec2<f32>(wp.z * 9.0, wp.y * 2.2));
    let gy = vnoise(vec2<f32>(dot(wp.xz, WIND_DIR) * 2.2, dot(wp.xz, vec2<f32>(-WIND_DIR.y, WIND_DIR.x)) * 9.0));
    let gz = vnoise(vec2<f32>(wp.x * 9.0, wp.y * 2.2));
    let grain = gx * bw.x + gy * bw.y + gz * bw.z;
    albedo = albedo * mix(1.0, 0.88 + 0.24 * grain, aura.u_paintAmt);
  }
  var lit = lightSurface(albedo, n, ao, wrap, sss, view, wp);
  if (spec > 0.0) {
    let h = normalize(aura.u_sunDir + view);
    lit = lit + aura.u_sunCol * a3dPow(max(dot(n, h), 0.0), 36.0) * spec * 0.9;
  }
  lit = lit + albedo * vec3<f32>(1.0, 0.75, 0.4) * emissive;
  let rim = a3dPow(1.0 - max(dot(n, view), 0.0), 3.0);
  lit = lit + aura.u_skyCol * albedo * rim * 0.1;
  return vec4<f32>(applyFog(lit, wp, 1.0), 1.0);
}`);
}

export const TRAVELLER_VERTEX_WGSL = stage([CLIP, PROP_VARYING], /* wgsl */ `
fn rotX(p: vec3<f32>, pivot: vec3<f32>, a: f32) -> vec3<f32> {
  let q = p - pivot;
  let c = cos(a);
  let s = sin(a);
  return pivot + vec3<f32>(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
fn rotXn(n: vec3<f32>, a: f32) -> vec3<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec3<f32>(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) kind: f32, @location(5) limb: f32, @location(6) tint: vec3<f32>) -> PropVarying {
  var out: PropVarying;
  out.vTint = tint;
  out.vUv = a_uv;
  out.vKind = kind;
  var p = a_position;
  var n = a_normal;
  let l = i32(limb + 0.5);
  let sw = sin(aura.u_gait) * 0.8 * aura.u_walkAmt;
  var a = 0.0;
  var pivot = vec3<f32>(0.0);
  if (l == 1) { pivot = vec3<f32>(-0.12, 0.86, 0.0); a = sw * (1.0 - aura.u_hopAmt) - aura.u_hopAmt * 0.7; }
  else if (l == 2) { pivot = vec3<f32>(0.12, 0.86, 0.0); a = -sw * (1.0 - aura.u_hopAmt) - aura.u_hopAmt * 0.25; }
  else if (l == 3) { pivot = vec3<f32>(-0.3, 1.42, 0.0); a = -sw * 0.95 - aura.u_hopAmt * 2.4; }
  else if (l == 4) { pivot = vec3<f32>(0.3, 1.42, 0.0); a = sw * 0.95 - aura.u_hopAmt * 2.4; }
  if (l >= 1 && l <= 4) { p = rotX(p, pivot, a); n = rotXn(n, a); }
  if (l == 5) {
    let flap = (0.05 + 0.14 * aura.u_walkAmt + 0.05 * aura.u_hopAmt) * (1.55 - p.y) * (0.6 + 0.4 * sin(aura.u_windTime * 4.0 + p.y * 3.0 + aura.u_gait));
    p.z = p.z - (flap + 0.04 * aura.u_walkAmt);
  }
  p.y = p.y + abs(sin(aura.u_gait)) * 0.07 * aura.u_walkAmt;
  p.z = p.z + (p.y - 0.9) * 0.07 * aura.u_walkAmt;
  p.y = p.y * (1.0 + aura.u_squash);
  p.x = p.x * (1.0 - aura.u_squash * 0.5);
  p.z = p.z * (1.0 - aura.u_squash * 0.5);
  let wp = aura.u_modelMatrix * vec4<f32>(p, 1.0);
  out.vWorld = wp.xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_modelMatrix, n));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

/* ---------------------------------------------------------------- billboards and the contact shadow */

export const GLOW_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct GlowVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> GlowVarying {
  var out: GlowVarying;
  out.vUv = a_uv;
  let center = (aura.u_modelMatrix * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
  let toCam = normalize(aura.u_cameraPosition - center);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), toCam));
  let up = cross(toCam, right);
  let w = center + right * a_position.x + up * a_position.y;
  out.vWorld = w;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(w, 1.0));
  return out;
}`);

export const GLOW_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let d = vUv - vec2<f32>(0.5);
  let r = length(d) * 2.0;
  let ang = atan2(d.y, d.x);
  let pulse = 0.78 + 0.22 * sin(aura.u_windTime * 2.2 + aura.u_glowSeed);
  let core = exp(-r * r * 5.0);
  let rays = a3dPow(0.5 + 0.5 * cos(ang * 6.0 + aura.u_windTime * 0.35 + aura.u_glowSeed), 3.0) * exp(-r * 3.2) * 0.55;
  let a = (core + rays) * (1.0 - smoothstep(0.85, 1.0, r)) * aura.u_glowAmount * pulse;
  return vec4<f32>(aura.u_glowColor * a, a);
}`);

export const MOTE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct MoteVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vSeed: f32,
  @location(2) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tint: vec3<f32>) -> MoteVarying {
  var out: MoteVarying;
  out.vUv = a_uv;
  out.vSeed = tint.x;
  let t = aura.u_windTime * 0.33 + tint.x * 40.0;
  let c = a_position + vec3<f32>(sin(t * 1.3) * 1.6 + sin(aura.u_windTime * 0.07 + tint.x * 9.0) * 3.0, sin(t * 0.9) * 0.8, cos(t * 1.1) * 1.4);
  let center = (aura.u_modelMatrix * vec4<f32>(c, 1.0)).xyz;
  let toCam = normalize(aura.u_cameraPosition - center);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), toCam));
  let up = cross(toCam, right);
  let q = (a_uv - vec2<f32>(0.5)) * tint.y;
  let w = center + right * q.x + up * q.y;
  out.vWorld = w;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(w, 1.0));
  return out;
}`);

export const MOTE_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vSeed: f32, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let r = length(vUv - vec2<f32>(0.5)) * 2.0;
  let tw = 0.55 + 0.45 * sin(aura.u_windTime * (1.2 + vSeed * 2.0) + vSeed * 60.0);
  let a = a3dPow(1.0 - clamp(r, 0.0, 1.0), 2.2) * tw * 0.8;
  let fade = 1.0 - clamp(distance(aura.u_cameraPosition, vWorld) / 90.0, 0.0, 1.0);
  return vec4<f32>(vec3<f32>(1.0, 0.93, 0.62) * a * fade, a * fade);
}`);

export const BLOB_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct BlobVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> BlobVarying {
  var out: BlobVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BLOB_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let r = length(vUv - vec2<f32>(0.5)) * 2.0;
  let a = (1.0 - smoothstep(0.15, 1.0, r)) * aura.u_shadowOpacity;
  return vec4<f32>(0.06, 0.1, 0.03, a);
}`);

/* ---------------------------------------------------------------- catenary kite thread */

export const THREAD_VERTEX_WGSL = stage([CLIP, WIND_CONSTANTS], /* wgsl */ `
struct ThreadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ThreadVarying {
  var out: ThreadVarying;
  out.vUv = a_uv;
  let s = a_uv.y;
  let arch = 4.0 * s * (1.0 - s);
  var c = mix(aura.u_threadAnchor, aura.u_threadTip, s);
  c.y = c.y - aura.u_threadSag * arch + a_position.z * 0.0;
  let bow = 0.22 * arch * (0.72 + 0.28 * sin(aura.u_windTime * 2.1 + s * 3.14159));
  let wd = WIND_DIR * bow;
  c.x = c.x + wd.x;
  c.z = c.z + wd.y;
  let tang = normalize(aura.u_threadTip - aura.u_threadAnchor + vec3<f32>(0.0, -aura.u_threadSag * 4.0 * (1.0 - 2.0 * s), 0.0) + vec3<f32>(WIND_DIR.x, 0.0, WIND_DIR.y) * (0.22 * 4.0 * (1.0 - 2.0 * s)));
  let toCam = normalize(aura.u_cameraPosition - c);
  let rawSide = cross(tang, toCam);
  let sideLen = length(rawSide);
  let side = select(vec3<f32>(1.0, 0.0, 0.0), rawSide / max(sideLen, 1e-4), sideLen > 1e-4);
  let w = c + side * ((a_uv.x - 0.5) * 0.017);
  out.vWorld = w;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(w, 1.0));
  return out;
}`);

export const THREAD_FRAGMENT_WGSL = stage([common()], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let across = abs(vUv.x - 0.5) * 2.0;
  let core = 1.0 - smoothstep(0.18, 1.0, across);
  let ends = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.95, 1.0, vUv.y));
  let view = normalize(aura.u_cameraPosition - vWorld);
  let linen = lightSurface(vec3<f32>(0.95, 0.90, 0.78), vec3<f32>(0.0, 1.0, 0.0), 1.0, 0.75, 0.55, view, vWorld);
  let distFade = 1.0 - smoothstep(18.0, 42.0, distance(aura.u_cameraPosition, vWorld));
  let alpha = core * ends * distFade * 0.55;
  return vec4<f32>(applyFog(linen, vWorld, 1.0), alpha);
}`);

/* ---------------------------------------------------------------- bell harmonic ripple flipbook */

export const RIPPLE_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let idx = floor((max(0.0, aura.u_windTime) * 16.0) % 32.0);
  let colIdx = idx % 8.0;
  let rowIdx = floor(idx / 8.0);
  let cellUv = vec2<f32>((colIdx + clamp(vUv.x, 0.03, 0.97)) / 8.0, (rowIdx + clamp(vUv.y, 0.03, 0.97)) / 4.0);
  let texel = textureSample(u_rippleMapTexture, u_rippleMapSampler, cellUv);
  return vec4<f32>(texel.rgb * 1.15, texel.a * aura.u_rippleAlpha);
}`);
