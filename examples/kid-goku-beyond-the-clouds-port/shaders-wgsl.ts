/**
 * A3/W6: WGSL twins of the Cloud Runner's sky dome (midday and post-storm fragments) and the valley floor under the cloud
 * sea, for the WebGPU backend. Each body follows its GLSL original in shaders.ts line for line (the adapter's safe `pow` is
 * `a3dPow`, GLSL `mod` is `a3dMod`); WebGL2 keeps drawing the GLSL, so the default pixels are unchanged.
 *
 * The other programs (water, waterfall, puddles, pearls, scenery with the sun shadow, warnings, glow/puff point sprites) have
 * no twin yet, so `?backend=webgpu` still falls back to WebGL2 through the engine pre-check (CUSTOM_SHADER_WGSL_MISSING).
 */

const HEADER = /* wgsl */ `/* @aura3d-bindings */`;

const CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}`;

const COMMON = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
fn a3dMod3(x: vec3<f32>, y: f32) -> vec3<f32> { return x - y * floor(x / y); }
fn h21(p0: vec2<f32>) -> f32 {
  var p = fract(p0 * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}
fn vn(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2<f32>(1.0, 0.0)), f.x), mix(h21(i + vec2<f32>(0.0, 1.0)), h21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 5; i = i + 1) { s = s + a * vn(p); p = p * 2.03 + vec2<f32>(17.0); a = a * 0.5; }
  return s;
}
fn ridge(col: vec3<f32>, ang: f32, h: f32, base: f32, amp: f32, freq: f32, seed: f32, tint: vec3<f32>) -> vec3<f32> {
  let r = base + amp * fbm(vec2<f32>(ang * freq + seed, seed * 1.7));
  let m = smoothstep(r + 0.004, r - 0.006, h);
  return mix(col, tint, m);
}`;

export const SKY_VERTEX_WGSL = [HEADER, CLIP, /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) dir: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.dir = normalize(a_position);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`].join("\n");

export const SKY_FRAGMENT_WGSL = [HEADER, COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vDir);
  let h = d.y;
  var col = mix(aura.u_skyHorizon, aura.u_skyMid, smoothstep(0.0, 0.32, h));
  col = mix(col, aura.u_skyTop, smoothstep(0.22, 0.85, h));
  let sd = max(dot(d, aura.u_sunDir), 0.0);
  col = col + aura.u_sunTint * (a3dPow(sd, 5.0) * 0.22 + a3dPow(sd, 40.0) * 0.45) + vec3<f32>(1.0, 0.95, 0.8) * smoothstep(0.9993, 0.9998, sd) * 2.5;
  if (h > -0.02) {
    let uv = d.xz / (max(h, 0.0) + 0.16) * 1.7 + vec2<f32>(aura.u_cloudPhase * 0.012, 0.0);
    let n = fbm(uv * 1.15);
    let n2 = fbm(uv * 1.15 + aura.u_sunDir.xz * 0.16);
    let dens = smoothstep(0.5, 0.74, n);
    let lit = clamp(0.6 + (n - n2) * 5.0, 0.42, 1.15);
    var cc = mix(aura.u_cloudShade, aura.u_cloudLight, lit);
    cc = cc + aura.u_sunTint * a3dPow(sd, 4.0) * 0.25 * dens;
    let fade = smoothstep(0.0, 0.16, h);
    col = mix(col, cc, dens * fade * 0.96);
    let cu = d.xz / (max(h, 0.0) + 0.4) * vec2<f32>(0.7, 3.2) + vec2<f32>(aura.u_cloudPhase * 0.004, 3.0);
    let cirrus = smoothstep(0.56, 0.9, fbm(cu * 2.2));
    col = mix(col, vec3<f32>(1.0, 0.98, 0.95), cirrus * 0.3 * smoothstep(0.18, 0.55, h) * (1.0 - dens));
  }
  let ang = atan2(d.z, d.x);
  col = ridge(col, ang, h, 0.012, 0.06, 2.2, 3.0, mix(aura.u_hazeColor, aura.u_skyHorizon, 0.35));
  col = ridge(col, ang, h, 0.004, 0.045, 3.1, 7.0, mix(aura.u_hazeColor, vec3<f32>(0.42, 0.56, 0.62), 0.5));
  col = ridge(col, ang, h, -0.006, 0.032, 4.6, 11.0, mix(aura.u_hazeColor, vec3<f32>(0.3, 0.46, 0.38), 0.65));
  col = mix(col, aura.u_hazeColor, smoothstep(-0.02, -0.3, h));
  return vec4<f32>(col, 1.0);
}`].join("\n");

export const STORM_SKY_FRAGMENT_WGSL = [HEADER, COMMON, /* wgsl */ `
fn hue(h: f32) -> vec3<f32> { return clamp(abs(a3dMod3(h * 6.0 + vec3<f32>(0.0, 4.0, 2.0), 6.0) - vec3<f32>(3.0)) - vec3<f32>(1.0), vec3<f32>(0.0), vec3<f32>(1.0)); }
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  var towerC = array<f32, 8>(-0.62, 0.06, 0.66, 1.45, 2.15, 2.85, -1.6, -2.4);
  var towerW = array<f32, 8>(0.2, 0.3, 0.2, 0.17, 0.22, 0.16, 0.2, 0.18);
  var towerTop = array<f32, 8>(0.3, 0.42, 0.3, 0.24, 0.3, 0.2, 0.27, 0.22);
  let d = normalize(vDir);
  let h = d.y;
  var col = mix(aura.u_skyHorizon, aura.u_skyMid, smoothstep(0.0, 0.3, h));
  col = mix(col, aura.u_skyTop, smoothstep(0.2, 0.8, h));
  let sd = max(dot(d, aura.u_sunDir), 0.0);
  col = col + aura.u_sunTint * (a3dPow(sd, 6.0) * 0.2 + a3dPow(sd, 48.0) * 0.4) + vec3<f32>(1.0, 0.95, 0.82) * smoothstep(0.9993, 0.9998, sd) * 2.5;
  if (h > -0.02) {
    let uv = d.xz / (max(h, 0.0) + 0.16) * 1.7 + vec2<f32>(aura.u_cloudPhase * 0.012, 0.0);
    let n = fbm(uv * 1.15);
    let n2 = fbm(uv * 1.15 + aura.u_sunDir.xz * 0.16);
    let dens = smoothstep(0.56, 0.78, n);
    let lit = clamp(0.6 + (n - n2) * 5.0, 0.42, 1.15);
    let cc = mix(aura.u_cloudShade, aura.u_cloudLight, lit) + aura.u_sunTint * a3dPow(sd, 4.0) * 0.25 * dens;
    col = mix(col, cc, dens * smoothstep(0.0, 0.16, h) * 0.9);
  }
  let anti = -aura.u_sunDir;
  let ah = normalize(anti.xz + vec2<f32>(1e-5, 0.0));
  let dh = d.xz / max(length(d.xz), 1e-4);
  let rel = atan2(dh.x * ah.y - dh.y * ah.x, dot(dh, ah));
  var dark = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let c = towerC[i];
    let w = towerW[i];
    let top = towerTop[i];
    let bottom = 0.05;
    let x = (rel - c) / w;
    let y = clamp((h - bottom) / (top - bottom), 0.0, 1.2);
    let n = fbm(vec2<f32>(rel * 9.0 + fi * 5.3, h * 14.0 + aura.u_cloudPhase * 0.02));
    let prof = mix(0.55, 1.0, smoothstep(0.0, 0.35, y)) + smoothstep(0.76, 0.95, y) * 0.55;
    let shape = prof * (0.75 + 0.5 * n) - abs(x);
    let cap = top * (0.92 + 0.16 * n) - h;
    let m = smoothstep(0.0, 0.08, shape) * smoothstep(0.0, 0.025, cap) * smoothstep(bottom - 0.04, bottom, h) * aura.u_towerStrength;
    var body = mix(aura.u_cloudShade * 0.42, aura.u_cloudLight, smoothstep(0.08, 0.85, y) * (0.7 + 0.3 * n));
    let edge = (smoothstep(0.0, 0.05, shape) - smoothstep(0.05, 0.16, shape)) * smoothstep(0.0, 0.025, cap) + (smoothstep(0.0, 0.012, cap) - smoothstep(0.012, 0.04, cap)) * step(0.0, shape);
    body = body + vec3<f32>(0.9, 0.93, 0.97) * clamp(edge, 0.0, 1.0) * 0.6 * smoothstep(0.25, 0.7, y + 0.3);
    col = mix(col, body, m);
    if (i < 3) { dark = max(dark, m * (1.0 - smoothstep(0.2, 0.7, y))); }
    let r = fbm(vec2<f32>(rel * 46.0 + h * 6.0 + aura.u_cloudPhase * 0.04, h * 2.4 - aura.u_cloudPhase * 0.18 + fi * 3.0));
    let curtain = (1.0 - smoothstep(0.45, 0.95, abs(x))) * smoothstep(bottom + 0.03, bottom - 0.01, h) * smoothstep(-0.05, 0.0, h) * aura.u_rainStrength * select(0.0, 1.0, i < 3);
    let streak = curtain * (0.45 + 0.55 * smoothstep(0.4, 0.75, r));
    col = mix(col, mix(aura.u_cloudShade * 0.5, aura.u_skyHorizon * 0.8, 0.35), streak * 0.75);
    dark = max(dark, curtain);
  }
  let theta = degrees(acos(clamp(dot(d, anti), -1.0, 1.0)));
  let vis = smoothstep(-0.01, 0.03, h) * (0.45 + 0.55 * dark) * aura.u_rainbowStrength;
  let t = (theta - 40.0) / 2.0;
  let band = smoothstep(-0.2, 0.15, t) * (1.0 - smoothstep(0.85, 1.2, t));
  col = col + hue(0.78 * (1.0 - clamp(t, 0.0, 1.0))) * band * vis * 0.42;
  col = col + vec3<f32>(0.05, 0.055, 0.06) * smoothstep(40.0, 28.0, theta) * vis;
  let t2 = (theta - 50.0) / 3.0;
  let band2 = smoothstep(-0.2, 0.15, t2) * (1.0 - smoothstep(0.85, 1.2, t2));
  col = col + hue(0.78 * clamp(t2, 0.0, 1.0)) * band2 * vis * 0.14;
  let ang = atan2(d.z, d.x);
  col = ridge(col, ang, h, 0.012, 0.06, 2.2, 3.0, mix(aura.u_hazeColor, aura.u_skyHorizon, 0.35));
  col = ridge(col, ang, h, 0.004, 0.045, 3.1, 7.0, mix(aura.u_hazeColor, vec3<f32>(0.42, 0.5, 0.6), 0.5));
  col = ridge(col, ang, h, -0.006, 0.032, 4.6, 11.0, mix(aura.u_hazeColor, vec3<f32>(0.36, 0.3, 0.24), 0.6));
  col = mix(col, aura.u_hazeColor, smoothstep(-0.02, -0.3, h));
  return vec4<f32>(col, 1.0);
}`].join("\n");

export const VALLEY_VERTEX_WGSL = [HEADER, CLIP, /* wgsl */ `
struct ValleyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) w: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> ValleyVarying {
  var out: ValleyVarying;
  out.w = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`].join("\n");

export const VALLEY_FRAGMENT_WGSL = [HEADER, COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vW.xz * 0.012;
  let n = fbm(p);
  let m = fbm(p * 3.1 + vec2<f32>(7.0));
  var canopy = mix(vec3<f32>(0.16, 0.34, 0.14), vec3<f32>(0.34, 0.5, 0.2), n);
  canopy = mix(canopy, vec3<f32>(0.5, 0.52, 0.3), smoothstep(0.6, 0.8, m) * 0.5);
  let cloudShadow = smoothstep(0.55, 0.75, fbm(p * 0.45 + vec2<f32>(aura.u_cloudPhase * 0.01, 0.0)));
  canopy = canopy * (1.0 - 0.28 * cloudShadow);
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  return vec4<f32>(mix(canopy, aura.u_hazeColor, clamp(f, 0.0, 1.0)), 1.0);
}`].join("\n");
