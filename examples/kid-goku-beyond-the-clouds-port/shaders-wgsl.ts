/**
 * A3/W6: WGSL twins of every Cumulus Dash `material.custom` program, for the WebGPU backend. Each body follows its GLSL
 * original in shaders.ts line for line (the adapter's safe `pow` is `a3dPow`, GLSL `mod` is `a3dMod`, `atan(y, x)` is
 * `atan2`); WebGL2 keeps drawing the GLSL, so both backends stay in lockstep.
 *
 * Vertex inputs sit at the locations the geometry streams carry on WebGPU: position 0, normal 1, uv 2, then the author
 * attributes in name order from the custom pool (3, 5, 6): scenery `tone` 3; quad sprites `aAlpha` 3, `aSize` 5, `tone` 6.
 * The storm row's shadowed scenery reads `a3d_shadow`'s sun shadow over the portable shadow bindings (the WebGPU shadow map
 * is sampled with its v axis flipped, as the Ion Circuit twins do) and `a3d_ibl`'s image-based light over the portable
 * environment bindings (the shader-graph twin's lookup). The glow / puff point sprites use `gl_PointSize`, which WebGPU
 * lacks: on a requested WebGPU backend the world draws them as screen-aligned quads instead (`SPRITE_QUAD_*`, both halves).
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
  let ridgeNoise = fbm(p * 1.75 - vec2<f32>(4.2));
  let deepPine = vec3<f32>(0.11, 0.25, 0.13);
  let sunlitMeadow = vec3<f32>(0.35, 0.5, 0.22);
  let sandstoneTalus = vec3<f32>(0.48, 0.37, 0.25);
  var canopy = mix(deepPine, sunlitMeadow, smoothstep(0.28, 0.76, n));
  canopy = mix(canopy, sandstoneTalus, smoothstep(0.62, 0.84, m) * 0.45);
  let riverMeander = abs(fract(p.x * 0.32 + sin(p.y * 1.4) * 0.22 + ridgeNoise * 0.18) - 0.5);
  let riverMask = smoothstep(0.022, 0.006, riverMeander);
  canopy = mix(canopy, mix(vec3<f32>(0.24, 0.48, 0.62), aura.u_hazeColor * 1.08, 0.45), riverMask * 0.78);
  let mist = smoothstep(0.56, 0.82, fbm(p * 0.85 + vec2<f32>(aura.u_cloudPhase * 0.014, -aura.u_cloudPhase * 0.006)));
  let cloudShadow = smoothstep(0.52, 0.74, fbm(p * 0.45 + vec2<f32>(aura.u_cloudPhase * 0.01, 0.0)));
  canopy = canopy * (1.0 - 0.32 * cloudShadow);
  canopy = mix(canopy, mix(aura.u_hazeColor, vec3<f32>(0.9, 0.94, 0.98), 0.35), mist * 0.38);
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  return vec4<f32>(mix(canopy, aura.u_hazeColor, clamp(f, 0.0, 1.0)), 1.0);
}`].join("\n");


const stage = (...parts: string[]): string => [HEADER, ...parts].join("\n");

/** WATER_VERTEX / WATERFALL_VERTEX / PUDDLE_VERTEX (identical): world position and uv. */
export const UV_WORLD_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct UvWorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) w: vec3<f32>,
  @location(1) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> UvWorldVarying {
  var out: UvWorldVarying;
  out.uv = a_uv;
  out.w = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const PUDDLE_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>, @location(1) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vUv * 2.0 - vec2<f32>(1.0);
  let r = length(c);
  let edgeNoise = (vn(vUv * 9.0) - 0.5) * 0.18 + (vn(vUv * 21.0 + vec2<f32>(3.1)) - 0.5) * 0.07;
  let edge = smoothstep(1.0, 0.68, r + edgeNoise);
  let dampRim = smoothstep(1.04, 0.86, r + edgeNoise) * (1.0 - smoothstep(0.84, 0.62, r + edgeNoise));
  let v = normalize(aura.u_cameraPosition - vW);
  let rip1 = vec2<f32>(vn(vW.xz * 3.1 + vec2<f32>(aura.u_tClock * 0.6)), vn(vW.zx * 2.7 - vec2<f32>(aura.u_tClock * 0.5))) - vec2<f32>(0.5);
  let rip2 = vec2<f32>(vn(vW.xz * 7.4 - vec2<f32>(aura.u_tClock * 0.9)), vn(vW.zx * 6.8 + vec2<f32>(aura.u_tClock * 0.75))) - vec2<f32>(0.5);
  let rip = rip1 * 0.72 + rip2 * 0.28;
  let n = normalize(vec3<f32>(rip.x * 0.075, 1.0, rip.y * 0.075));
  let rf = reflect(-v, n);
  let fres = 0.28 + 0.72 * a3dPow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  let cloudMirror = smoothstep(0.54, 0.78, fbm(rf.xz / (max(rf.y, 0.0) + 0.22) * 1.4 + vec2<f32>(aura.u_tClock * 0.01, 0.0)));
  var sky = mix(aura.u_skyHorizon, aura.u_skyTop, smoothstep(0.0, 0.62, rf.y));
  sky = mix(sky, mix(aura.u_skyHorizon, vec3<f32>(0.96, 0.97, 1.0), 0.7), cloudMirror * 0.55);
  var col = sky * 0.92 + vec3<f32>(1.0, 0.92, 0.78) * a3dPow(max(dot(rf, aura.u_sunDir), 0.0), 210.0) * 2.6;
  col = mix(col, vec3<f32>(0.24, 0.17, 0.12), dampRim * 0.42);
  let dist = length(vW - aura.u_cameraPosition);
  col = mix(col, aura.u_hazeColor, clamp(1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0)), 0.0, 1.0));
  return vec4<f32>(col, max(edge * mix(0.48, 0.93, fres), dampRim * 0.32));
}`);

export const WATER_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>, @location(1) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = vW.xz * 0.35;
  let t = aura.u_tClock;
  let r1 = vn(p * 1.6 + vec2<f32>(0.0, t * 0.9));
  let r2 = vn(p * 3.4 - vec2<f32>(t * 0.4, t * 1.3));
  let ripple = r1 * 0.6 + r2 * 0.4;
  let deep = vec3<f32>(0.1, 0.42, 0.55);
  let shallow = vec3<f32>(0.45, 0.82, 0.86);
  var col = mix(deep, shallow, smoothstep(0.25, 0.8, ripple));
  let glint = smoothstep(0.78, 0.9, r2) * 0.8;
  col = col + vec3<f32>(1.0, 0.97, 0.88) * glint;
  let edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  let foam = (1.0 - edge) * 0.8 + smoothstep(0.72, 0.9, r1) * 0.18;
  col = mix(col, vec3<f32>(0.95, 0.99, 1.0), clamp(foam, 0.0, 1.0));
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  col = mix(col, aura.u_hazeColor, clamp(f, 0.0, 1.0));
  return vec4<f32>(col, 0.9 * smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x));
}`);

export const WATERFALL_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vW: vec3<f32>, @location(1) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let y = vUv.y;
  let streak = vn(vec2<f32>(vUv.x * 14.0, y * 0.35 - aura.u_tClock * 2.6));
  let fine = vn(vec2<f32>(vUv.x * 38.0 + 3.0, y * 0.9 - aura.u_tClock * 4.1));
  let foam = clamp(smoothstep(0.45, 0.85, streak) * 0.7 + smoothstep(0.6, 0.95, fine) * 0.5, 0.0, 1.0);
  let body = mix(vec3<f32>(0.46, 0.6, 0.72), vec3<f32>(0.93, 0.96, 0.99), foam);
  let across = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  let tail = 1.0 - smoothstep(aura.u_fallLength * 0.72, aura.u_fallLength, y);
  let dist = length(vW - aura.u_cameraPosition);
  let col = mix(body, aura.u_hazeColor, clamp(1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0)), 0.0, 1.0));
  return vec4<f32>(col, across * tail * mix(0.55, 0.9, foam));
}`);

export const BALL_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct BallVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) l: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) v: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> BallVarying {
  var out: BallVarying;
  out.l = normalize(a_position);
  out.n = normalize((aura.u_modelMatrix * vec4<f32>(a_normal, 0.0)).xyz);
  let w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.v = normalize(aura.u_cameraPosition - w.xyz);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BALL_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
fn starAt(l: vec3<f32>, axis: vec3<f32>, R: f32) -> f32 {
  let b1 = normalize(cross(axis, vec3<f32>(0.0, 1.0, 0.001)));
  let b2 = cross(axis, b1);
  let r = acos(clamp(dot(l, axis), -1.0, 1.0));
  let a = atan2(dot(l, b2), dot(l, b1));
  let k = 0.5 + 0.5 * cos(5.0 * a);
  let rad = R * (0.38 + 0.62 * a3dPow(k, 0.7));
  return smoothstep(rad, rad - 0.035, r);
}
@fragment fn fs_main(@location(0) vL: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vV: vec3<f32>) -> @location(0) vec4<f32> {
  let n = normalize(vN);
  let fres = a3dPow(1.0 - clamp(dot(n, normalize(vV)), 0.0, 1.0), 2.4);
  let lam = 0.55 + 0.45 * max(dot(n, normalize(vec3<f32>(0.4, 0.8, 0.5))), 0.0);
  let base = mix(vec3<f32>(1.0, 0.45, 0.06), vec3<f32>(1.0, 0.72, 0.2), smoothstep(-0.8, 0.9, vL.y));
  var stars = 0.0;
  for (var i = 0; i < 7; i = i + 1) {
    if (f32(i) >= aura.u_ballStars) { break; }
    let fi = f32(i);
    var axis: vec3<f32>;
    if (i == 0) { axis = vec3<f32>(0.0, 0.0, 1.0); }
    else {
      let a = 6.2831853 * (fi - 1.0) / max(aura.u_ballStars - 1.0, 1.0) + 0.4;
      axis = normalize(vec3<f32>(cos(a) * 0.62, sin(a) * 0.62, 0.78));
    }
    if (aura.u_ballStars < 1.5) { axis = vec3<f32>(0.0, 0.0, 1.0); }
    stars = max(stars, starAt(vL, axis, 0.25));
    if (aura.u_ballStars > 4.5) { stars = max(stars, starAt(vL, -axis, 0.25)); }
  }
  var col = base * lam;
  col = mix(col, vec3<f32>(0.78, 0.07, 0.06), stars);
  col = col + vec3<f32>(1.0, 0.82, 0.5) * fres * 0.9;
  col = col + vec3<f32>(1.0, 0.95, 0.8) * a3dPow(max(dot(reflect(-normalize(vV), n), normalize(vec3<f32>(0.4, 0.8, 0.5))), 0.0), 40.0) * 0.8;
  col = col * aura.u_ballGlow;
  let boost = max(aura.u_ballGlow - 1.0, 0.0);
  col = col + vec3<f32>(1.0, 0.7, 0.28) * boost * (0.35 + 0.65 * a3dPow(1.0 - fres, 3.0)) * (1.0 - stars) + vec3<f32>(1.0, 0.85, 0.55) * fres * boost * 0.8;
  return vec4<f32>(col, 1.0);
}`);

/**
 * SPRITE_QUAD_VERTEX (shaders.ts): one glow / puff point as a screen-aligned quad of the point sprite's pixel size
 * (`min(pointCap, aSize * pixelRatio * pointScale / view depth)`); the corner carries `gl_PointCoord`'s orientation.
 */
export const SPRITE_QUAD_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct SpriteVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) tone: vec3<f32>,
  @location(1) alpha: f32,
  @location(2) corner: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) aAlpha: f32, @location(5) aSize: f32, @location(6) tone: vec3<f32>) -> SpriteVarying {
  var out: SpriteVarying;
  out.tone = tone;
  out.alpha = aAlpha;
  let quad = a_uv * 2.0 - vec2<f32>(1.0);
  out.corner = vec2<f32>(quad.x, -quad.y);
  let mv = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  let size = min(aura.u_pointCap, aSize * aura.u_pixelRatio * aura.u_pointScale / max(1.0, -mv.z));
  var clip = aura.u_projectionMatrix * mv;
  clip = vec4<f32>(clip.xy + quad * size / max(aura.u_resolution, vec2<f32>(1.0)) * clip.w, clip.z, clip.w);
  out.position = a3dRasterPosition(clip);
  return out;
}`);

export const GLOW_QUAD_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vAlpha: f32, @location(2) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vCorner;
  let d = length(c);
  let core = smoothstep(0.34, 0.0, d);
  let halo = a3dPow(max(0.0, 1.0 - d), 2.2);
  let spike = max(smoothstep(0.1, 0.0, abs(c.x)) * smoothstep(1.0, 0.1, abs(c.y)), smoothstep(0.1, 0.0, abs(c.y)) * smoothstep(1.0, 0.1, abs(c.x))) * aura.u_sparkle;
  let a = (core * 0.9 + halo * 0.55 + spike * 0.55) * vAlpha;
  if (a < 0.004) { discard; }
  return vec4<f32>(mix(vTone, vec3<f32>(1.0), core * 0.55), a);
}`);

export const PUFF_QUAD_FRAGMENT_WGSL = stage(/* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>, @location(1) vAlpha: f32, @location(2) vCorner: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vCorner;
  let d = length(c);
  let lump = 0.82 + 0.18 * sin(atan2(c.y, c.x) * 5.0 + vTone.r * 13.0);
  let a = smoothstep(lump, lump * 0.35, d) * vAlpha;
  if (a < 0.004) { discard; }
  return vec4<f32>(vTone, a);
}`);

export const SCENERY_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct SceneryVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) tone: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) w: vec3<f32>,
  @location(3) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tone: vec3<f32>) -> SceneryVarying {
  var out: SceneryVarying;
  out.tone = tone;
  out.n = normalize((aura.u_modelMatrix * vec4<f32>(a_normal, 0.0)).xyz);
  let w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.w = w.xyz;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** The textured albedo both scenery fragments share (the map is sampled in uniform control flow, then mixed by `mapMix`). */
const SCENERY_ALBEDO = /* wgsl */ `
fn sceneryAlbedo(tone: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let tex = textureSample(u_surfaceMapTexture, u_surfaceMapSampler, uv * aura.u_mapScale).rgb;
  var albedo = tone;
  if (aura.u_mapMix > 0.001) { albedo = albedo * mix(vec3<f32>(1.0), tex * 1.9, aura.u_mapMix); }
  return albedo;
}`;

export const SCENERY_FRAGMENT_WGSL = stage(COMMON, SCENERY_ALBEDO, /* wgsl */ `
@fragment fn fs_main(@builtin(front_facing) frontFacing: bool, @location(0) vTone: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vW: vec3<f32>, @location(3) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  var n = normalize(vN);
  if (!frontFacing) { n = -n; }
  let albedo = sceneryAlbedo(vTone, vUv);
  let ndl = dot(n, aura.u_sunDirW);
  let wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  let lit = 0.62 * wrap * wrap + 0.38 * max(ndl, 0.0);
  let hemi = mix(aura.u_groundFill, aura.u_skyFill, n.y * 0.5 + 0.5);
  var col = albedo * (aura.u_sunColor * lit * aura.u_sunStrength + hemi);
  let vdir = normalize(aura.u_cameraPosition - vW);
  let rim = a3dPow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 2.6);
  col = col + aura.u_rimColor * rim * aura.u_rimStrength * (0.4 + 0.6 * max(n.y, 0.0));
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  col = mix(col, aura.u_hazeColor, clamp(f, 0.0, 1.0));
  return vec4<f32>(col, aura.u_opacity);
}`);

/** `a3d_shadow`'s `a3dSunShadow` over the portable shadow bindings (WebGPU shadow map v flipped). */
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
    let sampleData = aura.u_shadowPcfSamples[i];
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
}`;

/** `a3d_ibl`'s `a3dEnvDiffuse` / `a3dEnvSpecular` over the portable environment bindings (SH9 packed as seven vec4s). */
const ENV_LIGHT = /* wgsl */ `
fn a3dEnvShComponent(index: u32) -> f32 { return aura.u_a3dEnvSh[index / 4u][index % 4u]; }
fn a3dEnvShCoefficient(index: u32) -> vec3<f32> {
  let i = index * 3u;
  return vec3<f32>(a3dEnvShComponent(i), a3dEnvShComponent(i + 1u), a3dEnvShComponent(i + 2u));
}
fn a3dEnvShIrradiance(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 1e-4);
  return max(0.886227 * a3dEnvShCoefficient(0u) - 1.023328 * d.y * a3dEnvShCoefficient(1u) + 1.023328 * d.z * a3dEnvShCoefficient(2u)
    - 1.023328 * d.x * a3dEnvShCoefficient(3u) + 0.858086 * d.x * d.y * a3dEnvShCoefficient(4u) + 0.858086 * d.y * d.z * a3dEnvShCoefficient(5u)
    + 0.247708 * (3.0 * d.z * d.z - 1.0) * a3dEnvShCoefficient(6u) + 0.858086 * d.x * d.z * a3dEnvShCoefficient(7u)
    + 0.429043 * (d.x * d.x - d.y * d.y) * a3dEnvShCoefficient(8u), vec3<f32>(0.0));
}
fn a3dEnvProcedural(n: vec3<f32>) -> vec3<f32> {
  let d = n / max(length(n), 1e-4);
  let c = mix(aura.u_a3dEnvGround, aura.u_a3dEnvSky, clamp(d.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(c, aura.u_a3dEnvHorizon, clamp(1.0 - abs(d.y), 0.0, 1.0) * 0.55);
}
fn a3dEnvMapSample(direction: vec3<f32>, lod: f32) -> vec3<f32> {
  let d = direction / max(length(direction), 1e-4);
  let u = atan2(d.z, d.x) * 0.15915494 + 0.5 + aura.u_a3dEnvMapRotation;
  let v = acos(clamp(d.y, -1.0, 1.0)) * 0.31830989;
  let texel = textureSampleLevel(u_a3dEnvMapTexture, u_a3dEnvMapSampler, vec2<f32>(fract(u), clamp(v, 0.0, 1.0)), clamp(lod, 0.0, 8.0) * (aura.u_a3dEnvMapMaxLod / 8.0));
  var rgb = max(texel.rgb, vec3<f32>(0.0));
  if (aura.u_a3dEnvMapEncoding > 0.5 && aura.u_a3dEnvMapEncoding < 1.5) {
    let exponent = texel.a * 255.0;
    rgb = select(vec3<f32>(0.0), max(texel.rgb * exp2(exponent - 128.0) * (255.0 / 256.0), vec3<f32>(0.0)), exponent > 0.0);
  }
  return rgb * aura.u_a3dEnvMapIntensity;
}
fn a3dHemiLight(n: vec3<f32>) -> vec3<f32> {
  let up = clamp(n.y / max(length(n), 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  return mix(aura.u_a3dHemiGround, aura.u_a3dHemiSky, up);
}
fn a3dEnvDiffuse(N: vec3<f32>) -> vec3<f32> {
  let hemiMean = 0.5 * (aura.u_a3dHemiSky + aura.u_a3dHemiGround);
  let ambient = max(aura.u_a3dEnvAmbient - hemiMean, vec3<f32>(0.0)) + a3dHemiLight(N);
  let diffuse = ambient * 0.31830989;
  if (aura.u_a3dEnvMapEnabled > 0.5) { return diffuse + a3dEnvMapSample(N, 8.0); }
  if (aura.u_a3dEnvShEnabled > 0.5) { return diffuse + a3dEnvShIrradiance(N) * 0.31830989; }
  return diffuse + a3dEnvProcedural(N);
}
fn a3dEnvSpecular(R: vec3<f32>, roughness: f32) -> vec3<f32> {
  let rough = clamp(roughness, 0.0, 1.0);
  if (aura.u_a3dEnvMapEnabled > 0.5) { return a3dEnvMapSample(R, rough * 8.0); }
  if (aura.u_a3dEnvShEnabled > 0.5) { return a3dEnvShIrradiance(R) * 0.31830989; }
  let mean = (aura.u_a3dEnvSky + aura.u_a3dEnvHorizon + aura.u_a3dEnvGround) / 3.0;
  return mix(a3dEnvProcedural(R), mean, rough * rough);
}`;

export const SCENERY_SHADOWED_FRAGMENT_WGSL = stage(COMMON, SCENERY_ALBEDO, SUN_SHADOW, ENV_LIGHT, /* wgsl */ `
@fragment fn fs_main(@builtin(front_facing) frontFacing: bool, @location(0) vTone: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vW: vec3<f32>, @location(3) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  var n = normalize(vN);
  if (!frontFacing) { n = -n; }
  let albedo = sceneryAlbedo(vTone, vUv);
  let ndl = dot(n, aura.u_sunDirW);
  let wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  var lit = 0.62 * wrap * wrap + 0.38 * max(ndl, 0.0);
  let sunVis = a3dSunShadow(vW, n, aura.u_sunDirW);
  lit = lit * mix(aura.u_shadowFloor, 1.0, sunVis);
  let hemi = mix(aura.u_groundFill, aura.u_skyFill, n.y * 0.5 + 0.5);
  let celStep = smoothstep(0.18, 0.52, lit);
  let shapedLit = mix(lit, 0.24 + 0.76 * celStep, 0.26);
  var col = albedo * (aura.u_sunColor * shapedLit * aura.u_sunStrength + hemi + a3dEnvDiffuse(n) * aura.u_iblDiffuse);
  let vdir = normalize(aura.u_cameraPosition - vW);
  let ndv = clamp(dot(n, vdir), 0.0, 1.0);
  let fres = 0.04 + 0.96 * a3dPow(1.0 - ndv, 5.0);
  col = col + a3dEnvSpecular(reflect(-vdir, n), aura.u_iblRoughness) * fres * aura.u_iblSpec * mix(0.5, 1.0, sunVis);
  let rim = a3dPow(1.0 - ndv, 2.5);
  let sunBack = 0.65 + 0.65 * clamp(dot(-vdir, aura.u_sunDirW), 0.0, 1.0);
  col = col + aura.u_rimColor * rim * aura.u_rimStrength * (0.42 + 0.58 * max(n.y, 0.0)) * sunBack;
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  col = mix(col, aura.u_hazeColor, clamp(f, 0.0, 1.0));
  return vec4<f32>(col, aura.u_opacity);
}`);

export const CLOUD_SSS_VERTEX_WGSL = stage(CLIP, COMMON, /* wgsl */ `
struct CloudVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) tone: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) w: vec3<f32>,
  @location(3) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) tone: vec3<f32>) -> CloudVarying {
  var out: CloudVarying;
  out.tone = tone;
  out.uv = a_uv;
  let w0 = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  let billow = (vn(w0.xz * 0.045 + vec2<f32>(aura.u_cloudPhase * 0.14, aura.u_cloudPhase * 0.08)) - 0.5) * aura.u_billowAmp;
  let p = a_position + a_normal * billow;
  out.n = normalize((aura.u_modelMatrix * vec4<f32>(a_normal, 0.0)).xyz);
  out.w = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);

export const CLOUD_SSS_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@builtin(front_facing) frontFacing: bool, @location(0) vTone: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vW: vec3<f32>, @location(3) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  var n0 = normalize(vN);
  if (!frontFacing) { n0 = -n0; }
  let fluff = fbm(vW.xz * 0.065 + vUv * 1.4 + vec2<f32>(aura.u_cloudPhase * 0.04, -aura.u_cloudPhase * 0.02));
  let n = normalize(n0 + vec3<f32>((fluff - 0.5) * 0.28, (fluff - 0.45) * 0.16, (0.5 - fluff) * 0.24));
  let vdir = normalize(aura.u_cameraPosition - vW);
  let ndv = clamp(dot(n, vdir), 0.0, 1.0);
  let ndl = dot(n, aura.u_sunDirW);
  let wrap = clamp(ndl * 0.58 + 0.42, 0.0, 1.0);
  let powder = 1.0 - exp(-max(0.08, 1.0 - ndv) * 3.4);
  let cosTheta = clamp(dot(-vdir, aura.u_sunDirW), -1.0, 1.0);
  let g = 0.62;
  let hg = (1.0 - g * g) / (4.0 * 3.14159265 * a3dPow(1.0 + g * g - 2.0 * g * cosTheta, 1.5));
  let forwardScatter = min(hg * 1.45, 2.1) * (0.3 + 0.7 * a3dPow(1.0 - ndv, 1.7));
  let trough = smoothstep(-0.45, 0.55, n.y) * (0.78 + 0.22 * fluff);
  let baseShade = mix(aura.u_cloudShade * 0.76, aura.u_cloudLight, clamp(wrap * 0.72 + trough * 0.36, 0.0, 1.0));
  var col = baseShade * mix(vec3<f32>(0.92, 0.95, 1.0), vTone, 0.45);
  col = col + aura.u_sunColor * (max(ndl, 0.0) * 0.36 + forwardScatter * powder * 0.58);
  col = col + aura.u_rimColor * a3dPow(1.0 - ndv, 2.5) * 0.34 * (0.35 + 0.65 * max(n.y, 0.0));
  let dist = length(vW - aura.u_cameraPosition);
  let f = 1.0 - exp(-a3dPow(dist * aura.u_fogDensity, 2.0));
  col = mix(col, aura.u_hazeColor, clamp(f, 0.0, 1.0));
  return vec4<f32>(col, 1.0);
}`);

/** WARN_VERTEX (warning decals and the soft contact shadows). */
export const WARN_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct WarnVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> WarnVarying {
  var out: WarnVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const WARN_FRAGMENT_WGSL = stage(/* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vUv * 2.0 - vec2<f32>(1.0);
  let shape = select(1.0 - max(abs(c.x), abs(c.y)), 1.0 - length(c), aura.u_warnRound > 0.5);
  let edge = smoothstep(0.0, 0.18, shape);
  let rim = smoothstep(0.38, 0.0, shape);
  let stripes = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 38.0 - aura.u_tClock * 5.0);
  let pulse = 0.78 + 0.22 * sin(aura.u_tClock * 9.0);
  let base = mix(vec3<f32>(0.95, 0.2, 0.12), vec3<f32>(1.0, 0.82, 0.25), aura.u_warnGold);
  let col = base * (0.55 + 0.45 * stripes) + vec3<f32>(1.0, 0.9, 0.7) * rim * 0.5;
  let a = aura.u_warnAlpha * edge * (0.45 + 0.4 * rim) * pulse;
  if (a < 0.004) { discard; }
  return vec4<f32>(col, a);
}`);

export const SHADOW_FRAGMENT_WGSL = stage(/* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vUv * 2.0 - vec2<f32>(1.0);
  let a = smoothstep(1.0, 0.1, length(c)) * aura.u_shadowAlpha;
  if (a < 0.004) { discard; }
  return vec4<f32>(0.05, 0.08, 0.04, a);
}`);
