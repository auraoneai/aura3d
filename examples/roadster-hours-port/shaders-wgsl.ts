/**
 * A3/W6: WGSL twins of every `material.custom` program in shaders.ts and art/spray.ts, for `?backend=webgpu`. Each stage is
 * the GLSL line for line, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL (default pixels are
 * unchanged). Authored uniform `foo` reads as `aura.u_foo`, a texture uniform as `u_fooTexture` / `u_fooSampler`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` with the same body.
 *   - GLSL `mod` is floored (`a3dModF`); `atan(y, x)` is `atan2`; `isnan`/`isinf` test the exponent bits.
 *   - `a3dSunShadowAuto` mirrors the `a3d_shadow` chunk over the same `u_shadowMap*` frame bindings the forward pass fills
 *     (WebGPU textures have a top-left origin, so the shadow-map tap flips v, as the graph compiler's twin does).
 *   - The detail maps load un-mipmapped, so `textureSampleLevel(.., 0)` is the GLSL `texture()` tap exactly.
 *   - Point sprites: WebGPU rasterises a point list as one pixel and has no `gl_PointSize` / `gl_PointCoord`, so the plume
 *     and spray twins draw one-pixel points with the sprite's centre value (the documented WebGPU difference).
 *
 * Vertex stages write clip z through `a3dRasterPosition` (the engine's projection contract: minus-one-to-one projection,
 * remapped to zero-to-one unless the device sets `a3dZeroToOneProjection`).
 */

const MARKER = "/* @aura3d-bindings */";

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
fn a3dNonFinite(x: f32) -> bool { return (bitcast<u32>(x) & 0x7f800000u) == 0x7f800000u; }
`;

/** `a3d_shadow` (`receiveShadow: true`): the key light's shadow map, the same lookup as the GLSL chunk. */
const SHADOW = /* wgsl */ `
fn a3dSunShadow(worldPosition: vec3<f32>, normal: vec3<f32>, toLight: vec3<f32>) -> f32 {
  if (aura.u_shadowMapEnabled < 0.5) { return 1.0; }
  let receiverNormal = normal / max(length(normal), 0.0001);
  let receiverLightDirection = toLight / max(length(toLight), 0.0001);
  let lightPosition = aura.u_shadowMapMatrix * vec4<f32>(worldPosition + receiverNormal * aura.u_shadowMapNormalBias, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
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
    let tapOffset = sampleData.xy * aura.u_shadowMapTexelSize;
    let storedDepth = textureSampleLevel(u_shadowMapTextureTexture, u_shadowMapTextureSampler, vec2<f32>(uv.x + tapOffset.x, 1.0 - uv.y - tapOffset.y), 0.0).r;
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

/** `ATMOS` in shaders.ts. */
const ATMOS = /* wgsl */ `
var<private> gSunShadow: f32 = 1.0;
fn sq(x: f32) -> f32 { return x * x; }
fn rhHash(q: vec2<f32>) -> f32 {
  let v = vec2<u32>(vec2<i32>(floor(q))) * vec2<u32>(1597334673u, 3812015801u);
  var h = (v.x ^ v.y) * 1597334673u;
  h = h ^ (h >> 15u); h = h * 2246822519u; h = h ^ (h >> 13u);
  return f32(h) * (1.0 / 4294967296.0);
}
fn rhNoise(q: vec2<f32>) -> f32 {
  let i = floor(q); var f = fract(q); f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  let a = rhHash(i); let b = rhHash(i + vec2<f32>(1.0, 0.0)); let c = rhHash(i + vec2<f32>(0.0, 1.0)); let d = rhHash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn rhFbm(q0: vec2<f32>) -> f32 {
  var amp = 0.5; var sum = 0.0; var q = q0;
  for (var i = 0; i < 4; i = i + 1) { sum = sum + amp * rhNoise(q); q = q * 2.03 + vec2<f32>(17.1, 9.2); amp = amp * 0.5; }
  return sum;
}
fn hazeAt(v: vec3<f32>) -> vec3<f32> {
  let sa = max(dot(v, aura.u_sunDir), 0.0);
  return aura.u_horizonColor + aura.u_sunColor * (a3dPow(clamp(sa, 0.0, 1.0), 4.0) * 0.07 + a3dPow(clamp(sa, 0.0, 1.0), 24.0) * 0.14) * (1.0 - aura.u_nightAmt);
}
fn skyAt(v: vec3<f32>) -> vec3<f32> {
  let up = clamp(v.y, 0.0, 1.0);
  var col = mix(aura.u_horizonColor, aura.u_zenithColor, a3dPow(clamp(up, 0.0, 1.0), 0.36));
  let sa = max(dot(v, aura.u_sunDir), 0.0);
  col = col + aura.u_sunColor * (a3dPow(clamp(sa, 0.0, 1.0), 4.0) * 0.07 + a3dPow(clamp(sa, 0.0, 1.0), 24.0) * 0.14 + a3dPow(clamp(sa, 0.0, 1.0), 220.0) * 0.9) * (1.0 - aura.u_nightAmt * 0.6);
  col = col + smoothstep(0.99955, 0.99985, sa) * aura.u_sunColor * 3.0;
  col = col + aura.u_horizonColor * exp(-up * 14.0) * 0.45;
  return col;
}
fn fogIt(base: vec3<f32>, wp: vec3<f32>) -> vec3<f32> {
  let dv = wp - aura.u_cameraPosition;
  let d = length(dv);
  let f = clamp((d - aura.u_fogNear) / (aura.u_fogFar - aura.u_fogNear), 0.0, 1.0);
  return mix(base, hazeAt(dv / max(d, 0.001)), f * f);
}
fn finish(c: vec3<f32>) -> vec3<f32> {
  if (a3dNonFinite(c.x) || a3dNonFinite(c.y) || a3dNonFinite(c.z)) { return vec3<f32>(0.0); }
  return min(c, vec3<f32>(48.0));
}
fn ggx(nh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * max(dd * dd, 1e-8));
}
fn lightSurface(albedo: vec3<f32>, N: vec3<f32>, V: vec3<f32>, rough: f32, metal: f32, emis: vec3<f32>) -> vec3<f32> {
  let L = aura.u_sunDir;
  let ndl = max(dot(N, L), 0.0);
  let ndv = max(dot(N, V), 0.001);
  let H = normalize(L + V);
  let a = max(rough * rough, 0.03);
  let F = 0.04 + 0.96 * a3dPow(clamp(1.0 - ndv, 0.0, 1.0), 5.0);
  let f0 = mix(vec3<f32>(0.04), albedo, metal);
  let fres = f0 + (vec3<f32>(1.0) - f0) * a3dPow(clamp(1.0 - dot(H, V), 0.0, 1.0), 5.0);
  let spec = aura.u_sunColor * fres * ggx(max(dot(N, H), 0.0), a) * 0.25 * ndl * gSunShadow;
  let amb = mix(aura.u_ambGround, aura.u_ambSky, N.y * 0.5 + 0.5);
  let bounce = (aura.u_ambSky * 0.5 + aura.u_sunColor * 0.09) * max(dot(N, normalize(vec3<f32>(-aura.u_sunDir.x, 0.15, -aura.u_sunDir.z))), 0.0);
  let diff = albedo * (1.0 - metal) * (amb + bounce + aura.u_sunColor * ndl * gSunShadow);
  let refl = skyAt(reflect(-V, N));
  let rf = F * (1.0 - 0.8 * rough) + metal * 0.5 * (1.0 - rough);
  return diff + spec + refl * rf * mix(vec3<f32>(1.0), albedo, metal) * (0.4 + 0.6 * ndl) + emis;
}
`;

const LINE_MASK = /* wgsl */ `
fn lineMask(x: f32, centre: f32, hw: f32, aa: f32) -> f32 {
  let m = 1.0 - smoothstep(hw - aa, hw + aa, abs(x - centre));
  return m * clamp(hw / max(aa, 1e-5), 0.0, 1.0);
}
`;

const DETAIL = /* wgsl */ `
fn rhDetailTap(tex: texture_2d<f32>, smp: sampler, p: vec2<f32>, tile: f32) -> vec4<f32> {
  let uv = p / tile;
  let texels = length(fwidth(uv)) * 512.0;
  let w = 1.0 - smoothstep(0.75, 2.0, texels);
  return vec4<f32>(textureSampleLevel(tex, smp, fract(uv), 0.0).rgb - vec3<f32>(0.5), w);
}
fn rhDetail(tex: texture_2d<f32>, smp: sampler, p: vec2<f32>, tiles: vec2<f32>) -> vec3<f32> {
  let a = rhDetailTap(tex, smp, p, tiles.x);
  let b = rhDetailTap(tex, smp, p, tiles.y);
  return a.xyz * a.w + b.xyz * (b.w * 0.6);
}
`;

function stage(chunks: readonly string[], body: string): string {
  return [MARKER, ...chunks, body].join("\n");
}

/* ---- vertex stages ---- */

/** ROAD_VERTEX: vUv, vWorld, vNormal. */
export const ROAD_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct RoadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vNormal: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>) -> RoadVarying {
  var out: RoadVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** WATER_VERTEX / SKY_VERTEX: vWorld. */
export const WORLD_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct WorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WorldVarying {
  var out: WorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** TERRAIN_VERTEX / SOLID_VERTEX: vNormal, vWorld. */
export const SURFACE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct SurfaceVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> SurfaceVarying {
  var out: SurfaceVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** BEAM_VERTEX / TOWN_VERTEX: vUv, vNormal, vWorld. */
export const BEAM_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct BeamVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>) -> BeamVarying {
  var out: BeamVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/* ---- fragment stages ---- */

export const ROAD_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS, LINE_MASK, DETAIL], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>, @location(2) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  let lat = vUv.x;
  let arc = vUv.y;
  let aaL = fwidth(lat) * 1.4 + 1e-5;
  let aaS = fwidth(arc) * 1.4 + 1e-4;
  let foot = length(fwidth(vWorld.xz));
  let fade = 1.0 - smoothstep(0.3, 1.4, foot);

  let g1 = rhNoise(vWorld.xz * 16.0);
  let g2 = rhNoise(vWorld.xz * 3.7 + vec2<f32>(7.0));
  let g3 = rhNoise(vWorld.xz * 0.42 + vec2<f32>(3.0));
  let tone = (g1 - 0.5) * 0.4 * fade + (g2 - 0.5) * 0.28 * fade + (g3 - 0.5) * 0.2;
  var albedo = aura.u_asphalt * (1.0 + tone);
  var dt = vec3<f32>(0.0);
  if (aura.u_detailAmt > 0.0) { dt = rhDetail(u_roadDetailTexture, u_roadDetailSampler, vWorld.xz, aura.u_detailTiles) * aura.u_detailAmt; }
  albedo = albedo * (1.0 + dt.x * 0.9);
  let wheel = exp(-sq((abs(lat) - 0.25) / 0.08)) + exp(-sq((abs(lat) - 0.73) / 0.08));
  albedo = albedo * (1.0 - wheel * 0.28);
  var rough = clamp(aura.u_roadGloss + (g2 - 0.5) * 0.2 * fade - wheel * 0.22 + (1.0 - fade) * 0.18 - dt.x * 0.3, 0.28, 0.95);

  let period = 15.0;
  let ph = fract(arc / period);
  let aaP = aaS / period;
  let dashOn = smoothstep(0.0, aaP + 1e-4, ph) * (1.0 - smoothstep(0.52, 0.52 + aaP + 1e-4, ph));
  let lanes = max(lineMask(lat, 0.0, 0.0075, aaL), max(lineMask(lat, 0.48, 0.0075, aaL), lineMask(lat, -0.48, 0.0075, aaL)));
  let paint = clamp(lanes * dashOn, 0.0, 1.0) * (0.75 + 0.25 * g1 * fade + 0.25 * (1.0 - fade));
  albedo = mix(albedo, aura.u_lineColor, paint);
  rough = mix(rough, 0.5, paint);

  let curb = smoothstep(0.952 - aaL, 0.952 + aaL, abs(lat));
  let rumble = step(0.5, fract(arc / 3.0));
  albedo = mix(albedo, mix(vec3<f32>(0.34, 0.33, 0.31), vec3<f32>(0.5, 0.18, 0.14), rumble * 0.6), curb);
  rough = mix(rough, 0.85, curb);
  let neon = max(lineMask(lat, 0.915, 0.021, aaL), lineMask(lat, -0.915, 0.021, aaL));
  albedo = mix(albedo, aura.u_glowColor * aura.u_neonPaint, neon);
  var emis = aura.u_glowColor * neon * aura.u_neonGain;

  let N = normalize(normalize(vNormal) + vec3<f32>(dt.y, 0.0, -dt.z) * 0.55 * (1.0 - paint) * (1.0 - curb));
  let dl = vWorld.xz - aura.u_carPos.xz;
  let along = dot(dl, aura.u_carDir);
  let side = dl.x * aura.u_carDir.y - dl.y * aura.u_carDir.x;
  let beam = smoothstep(0.5, 4.0, along) * exp(-along / 44.0) * exp(-sq(side / (1.5 + along * 0.2))) * aura.u_beamAmt;
  var tailShape = step(along, 0.0) * exp(along / 7.0) * exp(-sq(side / 2.2));
  if (aura.u_tailSoft > 0.5) {
    tailShape = (1.0 - smoothstep(-2.8, -1.6, along)) * exp(min(along + 2.2, 0.0) / 2.4) * exp(-sq(side / 1.15));
  }
  let tail = tailShape * aura.u_beamAmt * aura.u_tailAmt;
  emis = emis + albedo * vec3<f32>(1.0, 0.92, 0.75) * beam * 2.6 + vec3<f32>(1.0, 0.1, 0.05) * tail * 0.5;
  let dLamp = a3dModF(arc - 90.0 + 32.0, 64.0) - 32.0;
  let lampSide = select(-0.85, 0.85, a3dModF(floor((arc - 90.0 + 32.0) / 64.0), 2.0) < 0.5);
  let pool = exp(-sq(dLamp / 13.0)) * exp(-sq((lat - lampSide) / 0.9));
  emis = emis + albedo * vec3<f32>(0.78, 0.88, 1.0) * aura.u_lampPool * (0.35 + 2.2 * pool);

  gSunShadow = a3dSunShadowAuto(vWorld, N);
  var lit = lightSurface(albedo, N, V, rough, 0.0, emis);
  if (aura.u_roadSheen > 0.0) {
    let Nf = normalize(vec3<f32>(N.x * 0.3, 1.0, N.z * 0.3));
    var Rr = reflect(-V, Nf);
    Rr.y = abs(Rr.y) + 0.02;
    let ndvS = clamp(dot(Nf, V), 0.0, 1.0);
    let Fs = 0.04 + 0.96 * a3dPow(1.0 - ndvS, 5.0);
    let gloss = clamp(1.0 - rough, 0.0, 1.0) * (1.0 - 0.7 * curb) * (1.0 - 0.6 * paint);
    let Hs = normalize(aura.u_sunDir + V);
    let glare = ggx(max(dot(Nf, Hs), 0.0), 0.32) * 0.25 * max(dot(Nf, aura.u_sunDir), 0.0);
    let lampStreak = exp(-sq((lat - lampSide) / 0.3)) * exp(-sq(dLamp / 26.0)) * aura.u_lampPool;
    lit = lit + (skyAt(normalize(Rr)) + aura.u_sunColor * glare * gSunShadow * 0.6 + vec3<f32>(0.78, 0.88, 1.0) * lampStreak * 2.4) * Fs * aura.u_roadSheen * gloss;
  }
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

export const WATER_FRAGMENT_WGSL = stage([MATH, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vWorld.xz;
  let dv = aura.u_cameraPosition - vWorld;
  let dist = length(dv);
  let V = dv / max(dist, 0.001);
  let foot = length(fwidth(p)) + 1e-4;
  var g = vec2<f32>(0.0);
  var lost = 0.0;
  var crest = 0.0;
  let pw = p + 7.0 * vec2<f32>(sin(p.y * 0.021 + aura.u_time * 0.05), cos(p.x * 0.017 - aura.u_time * 0.04));
  for (var i = 0; i < 7; i = i + 1) {
    let fi = f32(i);
    let wl = 170.0 / a3dPow(1.8, fi);
    let ang = 0.35 + fi * 2.399;
    let dir = vec2<f32>(cos(ang), sin(ang));
    let k = 6.2831853 / wl;
    let w = sqrt(9.8 * k) * 0.55;
    let steep = (0.018 + 0.0065 * fi) * 6.2831853 * 0.55;
    let vis = clamp(wl / (foot * 5.0) - 0.4, 0.0, 1.0);
    let c = cos(k * dot(dir, pw) + w * aura.u_time + fi * 2.1);
    g = g + dir * (steep * c) * vis;
    lost = lost + (1.0 - vis) * 0.5 * steep * steep;
    crest = crest + c * vis * (1.0 / 7.0);
  }
  let N = normalize(vec3<f32>(-g.x, 1.0, -g.y));
  let ndv = max(dot(N, V), 0.0);
  let F = (0.02 + 0.98 * a3dPow(clamp(1.0 - ndv, 0.0, 1.0), 5.0)) * 0.9;
  var R = reflect(-V, N);
  R.y = abs(R.y) + 0.005;
  R = normalize(R);
  let reflected = skyAt(R);

  let alpha = clamp(sqrt(0.0025 + lost * 2.0 + sq(foot / max(dist, 1.0)) * 3.0), 0.07, 0.6);
  let H = normalize(aura.u_sunDir + V);
  let glitter = ggx(max(dot(N, H), 0.0), alpha) * F * 0.25 * max(aura.u_sunDir.y + 0.15, 0.0);
  var sunSpec = aura.u_sunColor * min(glitter, 30.0);

  let depthMix = clamp(0.5 + crest * 1.4, 0.0, 1.0);
  let shoal = smoothstep(0.45, 0.8, rhFbm(p * 0.0032 + vec2<f32>(3.7))) * min(aura.u_whitecaps * 2.0, 1.0);
  let body = mix(aura.u_deepWater, aura.u_shallowWater, clamp(depthMix * 0.6 + shoal * 0.45, 0.0, 1.0));
  let sss = a3dPow(clamp(dot(-V, aura.u_sunDir), 0.0, 1.0), 3.0) * smoothstep(-0.2, 0.9, crest) * 0.45;
  let lit = body * (aura.u_ambSky * 1.5 + aura.u_sunColor * 0.22 * max(aura.u_sunDir.y, 0.0)) + aura.u_shallowWater * aura.u_sunColor * sss * 0.3;
  let Rg = reflect(-V, N);
  let path = a3dPow(max(dot(Rg, aura.u_sunDir), 0.0), 48.0) * min(aura.u_whitecaps * 1.5, 1.0) * max(aura.u_sunDir.y + 0.1, 0.0);
  sunSpec = sunSpec + aura.u_sunColor * path * 0.6;
  var col = mix(lit, reflected, clamp(F, 0.0, 1.0)) + sunSpec;
  if (aura.u_whitecaps > 0.0) {
    let wdir = normalize(aura.u_windVec + vec2<f32>(1e-4, 0.0));
    let fq = vec2<f32>(dot(p, wdir) * 0.05, dot(p, vec2<f32>(-wdir.y, wdir.x)) * 0.16) + aura.u_windVec * aura.u_time * 0.02;
    var caps = smoothstep(0.62, 0.86, rhFbm(fq) + crest * 0.55);
    caps = caps * clamp(9.0 / (foot * 40.0 + 1.0), 0.15, 1.0);
    let foamLit = vec3<f32>(0.92, 0.93, 0.9) * (aura.u_ambSky * 1.6 + aura.u_sunColor * 0.32 * max(aura.u_sunDir.y, 0.0) + vec3<f32>(0.04));
    col = mix(col, foamLit, caps * aura.u_whitecaps * 0.85);
  }
  return vec4<f32>(finish(fogIt(col, vWorld)), 1.0);
}`);

export const CITY_FRAGMENT_WGSL = stage([MATH, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vWorld.xz;
  let foot = length(fwidth(p)) + 1e-4;
  let cell = p / 64.0;
  let id = floor(cell);
  let f = fract(cell);
  let h = rhHash(id + vec2<f32>(11.0));
  let h2 = rhHash(id + vec2<f32>(37.0));
  let edge = min(f, vec2<f32>(1.0) - f) * 64.0;
  let street = 1.0 - smoothstep(3.5, 4.5 + foot, min(edge.x, edge.y));
  let lamp = (1.0 - smoothstep(0.0, 0.6 + foot, abs(min(edge.x, edge.y) - 0.0))) * street;
  let w = fract(p / 3.0);
  let win = step(0.35, w.x) * step(0.35, w.y) * step(0.45, rhHash(floor(p / 3.0)));
  let fine = clamp(1.0 - foot / 3.0, 0.0, 1.0);
  let lit = mix(0.28, win, fine);
  let mercury = vec3<f32>(0.86, 0.9, 0.92);
  let seaGlass = vec3<f32>(0.55, 0.82, 0.77);
  let roofTone = mix(mercury, seaGlass, step(0.55, h));
  let roof = mix(vec3<f32>(0.03, 0.04, 0.06), roofTone * (0.55 + 0.9 * h2), lit * step(0.18, h));
  var col = mix(roof, vec3<f32>(0.02, 0.025, 0.035), street) + mercury * lamp * 1.6;
  let beacon = step(0.9, h2) * (1.0 - smoothstep(0.0, 1.6 + foot, length((f - vec2<f32>(0.5)) * 64.0)));
  let blink = step(0.5, fract(aura.u_time * 0.5 + h * 7.0));
  col = col + vec3<f32>(0.78, 0.16, 0.1) * beacon * blink * 5.0;
  col = col * aura.u_cityGain;
  return vec4<f32>(finish(fogIt(col, vWorld)), 1.0);
}`);

export const SKY_FRAGMENT_WGSL = stage([MATH, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let v = normalize(vWorld - aura.u_cameraPosition);
  var col = skyAt(v);
  if (aura.u_mountainAmt > 0.0 && v.y > -0.02) {
    let az = atan2(v.x, v.z);
    let ridge = 0.018 + 0.05 * rhFbm(vec2<f32>(az * 1.9, 3.0)) + 0.025 * rhFbm(vec2<f32>(az * 6.0, 9.0));
    let edge = smoothstep(ridge + 0.002, ridge - 0.002, v.y);
    let rock = mix(aura.u_horizonColor, aura.u_zenithColor * 0.7, 0.45) * mix(0.8, 1.15, rhFbm(vec2<f32>(az * 9.0, v.y * 40.0)));
    col = mix(col, rock, edge * aura.u_mountainAmt * (1.0 - smoothstep(0.0, 0.12, v.y - ridge)));
  }
  if (aura.u_bandAmt > 0.0) {
    let side = mix(1.0, smoothstep(-0.35, 0.75, v.x * aura.u_seaSign), aura.u_bandSide);
    let low = exp(-max(v.y, 0.0) * 9.0) * smoothstep(-0.12, 0.0, v.y);
    col = mix(col, aura.u_bandColor, clamp(low * side * aura.u_bandAmt, 0.0, 1.0));
    let sh = normalize(aura.u_sunDir.xz + vec2<f32>(1e-4));
    let az = max(dot(normalize(v.xz + vec2<f32>(1e-4)), sh), 0.0);
    col = col + aura.u_sunColor * a3dPow(az, 6.0) * exp(-max(v.y, 0.0) * 5.0) * 0.05 * aura.u_bandAmt * (1.0 - aura.u_nightAmt);
  }
  if (v.y > 0.01 && aura.u_cloudHigh > 0.0) {
    let wdir = normalize(aura.u_windVec + vec2<f32>(1e-4, 0.0));
    let qh = v.xz / (v.y + 0.3) * 0.9 + aura.u_windVec * aura.u_time * 0.0009;
    let st = vec2<f32>(dot(qh, wdir) * 0.35, dot(qh, vec2<f32>(-wdir.y, wdir.x)) * 2.4);
    let nh = rhFbm(st * 1.6);
    let coverH = smoothstep(0.5, 0.78, nh) * smoothstep(0.02, 0.25, v.y) * aura.u_cloudHigh;
    let sah = max(dot(v, aura.u_sunDir), 0.0);
    let cirrus = mix(aura.u_horizonColor, vec3<f32>(1.0), 0.35) + aura.u_sunColor * 0.12 * a3dPow(sah, 3.0);
    col = mix(col, cirrus * mix(1.0, 0.35, aura.u_nightAmt), coverH * 0.7);
  }
  if (v.y > 0.005 && aura.u_cloudAmt > 0.0) {
    let q = v.xz / (v.y + 0.14) * 1.15 + vec2<f32>(aura.u_time * 0.006, aura.u_time * 0.002) + aura.u_windVec * aura.u_time * 0.0012;
    let n = rhFbm(q * 1.2);
    let cover = smoothstep(0.46, 0.8, n) * smoothstep(0.005, 0.14, v.y) * aura.u_cloudAmt;
    let sa = max(dot(v, aura.u_sunDir), 0.0);
    let edge = smoothstep(0.46, 0.62, n) * (1.0 - smoothstep(0.62, 0.85, n));
    let belly = mix(aura.u_zenithColor * 0.55 + aura.u_horizonColor * 0.55, aura.u_horizonColor * 0.9, 0.4);
    let top = aura.u_horizonColor * 0.9 + aura.u_sunColor * 0.35 * (0.25 + a3dPow(clamp(sa, 0.0, 1.0), 2.0));
    let cloud = mix(belly, top, clamp(0.35 + edge * 0.8 + a3dPow(clamp(sa, 0.0, 1.0), 3.0), 0.0, 1.0));
    col = mix(col, cloud, cover * (1.0 - aura.u_nightAmt));
  }
  if (aura.u_nightAmt > 0.0 && v.y > 0.0) {
    let sqc = vec2<f32>(atan2(v.x, v.z) * 140.0, v.y * 220.0);
    let star = step(0.9965, rhHash(floor(sqc))) * smoothstep(0.02, 0.3, v.y) * (1.0 - smoothstep(0.08, 0.32, length(fract(sqc) - vec2<f32>(0.5))));
    col = col + vec3<f32>(0.8, 0.85, 1.0) * star * aura.u_nightAmt * (0.6 + 0.8 * rhHash(floor(sqc) + vec2<f32>(3.0)));
  }
  return vec4<f32>(finish(col), 1.0);
}`);

export const TERRAIN_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS, DETAIL], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  var dAlb = 0.0;
  if (aura.u_detailAmt > 0.0) {
    var tw = a3dPow3(abs(N), vec3<f32>(4.0)); tw = tw / (tw.x + tw.y + tw.z);
    let dx = rhDetail(u_rockDetailTexture, u_rockDetailSampler, vWorld.zy, aura.u_detailTiles);
    let dy = rhDetail(u_rockDetailTexture, u_rockDetailSampler, vWorld.xz, aura.u_detailTiles);
    let dz = rhDetail(u_rockDetailTexture, u_rockDetailSampler, vWorld.xy, aura.u_detailTiles);
    dAlb = (dx.x * tw.x + dy.x * tw.y + dz.x * tw.z) * aura.u_detailAmt;
    N = normalize(N + (vec3<f32>(0.0, dx.z, dx.y) * tw.x + vec3<f32>(dy.y, 0.0, -dy.z) * tw.y + vec3<f32>(dz.y, dz.z, 0.0) * tw.z) * 1.4 * aura.u_detailAmt);
  }
  let foot = length(fwidth(vWorld)) + 1e-4;
  let fade = 1.0 - smoothstep(0.5, 6.0, foot);
  let blotch = rhFbm(vWorld.xz * 0.03 + vec2<f32>(vWorld.y * 0.02));
  let warp = rhFbm(vec2<f32>(vWorld.x * 0.02 + vWorld.z * 0.017, vWorld.y * 0.05));
  let strata = 0.5 + 0.5 * sin(vWorld.y * 0.42 + warp * 9.0 + blotch * 4.0);
  let bands = smoothstep(0.3, 0.7, strata);
  var rock = mix(aura.u_rockA, aura.u_rockB, clamp(bands * 0.5 + blotch * 0.55 - 0.08, 0.0, 1.0));
  let fine = rhNoise(vWorld.xz * 1.3 + vec2<f32>(vWorld.y * 0.9));
  let fine2 = rhNoise(vec2<f32>(vWorld.x + vWorld.z, vWorld.y) * 2.6);
  rock = rock * (1.0 + ((fine - 0.5) * 0.32 + (fine2 - 0.5) * 0.18) * fade);
  let flatness = smoothstep(0.55, 0.88, N.y);
  let high = smoothstep(3.0, 9.0, vWorld.y);
  let turf = aura.u_grass * (0.75 + 0.5 * blotch);
  var albedo = mix(rock, turf, flatness * high * 0.85);
  albedo = mix(albedo, aura.u_sand, flatness * (1.0 - high) * 0.9);
  albedo = albedo * (1.0 + dAlb * 0.9);
  var foam = 0.0;
  if (aura.u_surfAmt > 0.0) {
    let tt = aura.u_time * aura.u_surfSpeed;
    let surge = 0.35 + 0.3 * sin(tt * 0.9 + vWorld.x * 0.045 + vWorld.z * 0.037) + 0.15 * sin(tt * 1.7 + vWorld.x * 0.11);
    let band = smoothstep(-0.6, -0.05, vWorld.y) * (1.0 - smoothstep(0.1, 0.25 + surge, vWorld.y));
    var froth = rhNoise(vWorld.xz * 0.9 + vec2<f32>(tt * 0.35, -tt * 0.2)) * 0.6 + rhNoise(vWorld.xz * 2.7 - vec2<f32>(tt * 0.5)) * 0.4;
    froth = mix(0.6, smoothstep(0.3, 0.7, froth), 1.0 - smoothstep(0.4, 2.0, foot));
    foam = clamp(band * froth * aura.u_surfAmt, 0.0, 1.0);
  }
  albedo = mix(albedo, vec3<f32>(0.86, 0.9, 0.88), foam);
  let ao = mix(0.62, 1.0, smoothstep(-2.0, 14.0, vWorld.y)) * (0.8 + 0.2 * blotch);
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  let lit = lightSurface(albedo * mix(ao, 1.0, foam), N, V, mix(0.9, 0.6, foam), 0.0, vec3<f32>(0.0));
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

export const SOLID_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  var flicker = aura.u_glowAmount * (0.85 + 0.15 * sin(aura.u_time * 4.0 + vWorld.z * 0.05));
  if (aura.u_gantryPulse > 0.0) { flicker = aura.u_glowAmount * (1.0 + 0.3 * aura.u_gantryPulse * sin(aura.u_time * 1.6)); }
  var base = aura.u_baseColor;
  var rough = aura.u_surfaceRough;
  if (aura.u_spangle > 0.0) {
    let q = vec2<f32>(vWorld.x + vWorld.z, vWorld.y) * 28.0;
    let sfade = (1.0 - smoothstep(0.4, 1.5, length(fwidth(q)))) * aura.u_spangle;
    let cell = rhHash(q) - 0.5;
    let grain = rhNoise(q * 3.1) - 0.5;
    base = base * (1.0 + (cell * 0.22 + grain * 0.08) * sfade);
    rough = clamp(rough + cell * 0.2 * sfade, 0.05, 1.0);
  }
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  let lit = lightSurface(base, N, V, rough, aura.u_surfaceMetal, aura.u_glowColor * flicker);
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

export const TOWER_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let foot = length(fwidth(vWorld)) + 1e-4;
  let fade = 1.0 - smoothstep(0.8, 6.0, foot);
  let uvw = select(vec2<f32>(vWorld.x, vWorld.y), vec2<f32>(vWorld.z, vWorld.y), abs(N.x) > abs(N.z));
  let cellSize = vec2<f32>(3.2, 3.6);
  let cell = floor(uvw / cellSize);
  let f = fract(uvw / cellSize);
  let lightOn = step(0.62, rhHash(cell + vec2<f32>(3.0))) * (0.55 + 0.45 * rhHash(cell + vec2<f32>(11.0)));
  let win = step(0.16, f.x) * step(f.x, 0.84) * step(0.2, f.y) * step(f.y, 0.8);
  let warm = mix(vec3<f32>(1.0, 0.72, 0.38), vec3<f32>(0.55, 0.78, 1.0), rhHash(cell + vec2<f32>(7.0)));
  let facade = step(abs(N.y), 0.5);
  let sharp = warm * win * lightOn * 1.25 * facade;
  let avg = warm * 0.5 * 0.38 * 0.6 * 1.25 * facade;
  var emis = mix(avg, sharp, fade);
  var body = vec3<f32>(0.035, 0.042, 0.07);
  var bodyRough = 0.6;
  if (aura.u_towerStyle > 0.5) {
    let floorY = uvw.y / 3.6;
    let fy = fract(floorY);
    let run = floor(uvw.x / 14.0);
    let litRun = step(0.45, rhHash(vec2<f32>(run, floor(floorY)) + vec2<f32>(5.0))) * (0.6 + 0.4 * rhHash(vec2<f32>(run, floor(floorY)) + vec2<f32>(9.0)));
    let ribbon = smoothstep(0.22, 0.3, fy) * (1.0 - smoothstep(0.78, 0.86, fy));
    let tone = mix(vec3<f32>(0.78, 0.9, 0.95), vec3<f32>(0.55, 0.85, 0.8), rhHash(vec2<f32>(run, 2.0)));
    let sharpG = tone * ribbon * litRun * 1.1 * facade;
    let avgG = tone * 0.6 * 0.5 * 1.1 * facade;
    emis = mix(avgG, sharpG, fade);
    body = mix(vec3<f32>(0.16, 0.2, 0.22), vec3<f32>(0.06, 0.12, 0.13), ribbon);
    bodyRough = mix(0.5, 0.15, ribbon);
  }
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  let lit = lightSurface(body, N, V, bodyRough, 0.25, emis);
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

export const BEAM_FRAGMENT_WGSL = stage([MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  let facing = a3dPow(clamp(abs(dot(normalize(vNormal), V)), 0.0, 1.0), 1.5);
  let along = a3dPow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.35) * smoothstep(0.0, 0.04, vUv.y);
  let a = facing * along * aura.u_beamGain;
  return vec4<f32>(aura.u_beamColor * a, a);
}`);

export const BLOB_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let q = (vUv - vec2<f32>(0.5)) * 2.0;
  let r = length(q * vec2<f32>(1.0, 0.62));
  let a = (1.0 - smoothstep(0.35, 1.0, r)) * aura.u_blobFade * aura.u_blobStrength;
  return vec4<f32>(0.0, 0.0, 0.0, clamp(a, 0.0, 0.9));
}`);

export const RAMP_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>, @location(2) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let aa = fwidth(vUv.y) * 0.6 + 1e-4;
  let phase = vUv.y / 2.4 + abs(vUv.x) * 1.15;
  let band = smoothstep(0.46 - aa, 0.46 + aa, fract(phase)) - smoothstep(0.96 - aa, 0.96 + aa, fract(phase));
  let fadeBand = 1.0 - smoothstep(0.4, 1.6, length(fwidth(vWorld.xz)));
  let steel = vec3<f32>(0.07, 0.075, 0.085) * (0.9 + 0.2 * rhNoise(vWorld.xz * 6.0));
  let yellow = vec3<f32>(0.85, 0.55, 0.06);
  let edge = smoothstep(0.9, 0.97, abs(vUv.x));
  var albedo = mix(steel, yellow, band * mix(0.35, 1.0, fadeBand));
  albedo = mix(albedo, vec3<f32>(0.9, 0.9, 0.85), edge);
  let emis = yellow * band * 0.1 + aura.u_glowColor * edge * 0.2;
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  let lit = lightSurface(albedo, N, V, 0.5, 0.15, emis);
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

export const TOWN_FRAGMENT_WGSL = stage([MATH, SHADOW, ATMOS], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vNormal: vec3<f32>, @location(2) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let V = normalize(aura.u_cameraPosition - vWorld);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let id = floor(vUv.x);
  var plaster = mix(vec3<f32>(0.74, 0.7, 0.62), vec3<f32>(0.9, 0.88, 0.82), rhHash(vec2<f32>(id, 1.0)));
  plaster = mix(plaster, vec3<f32>(0.64, 0.4, 0.3), step(0.82, rhHash(vec2<f32>(id, 2.0))) * 0.85);
  let facade = step(abs(N.y), 0.5);
  let foot = length(fwidth(vWorld)) + 1e-4;
  let fade = 1.0 - smoothstep(0.8, 6.0, foot);
  let uvw = select(vec2<f32>(vWorld.x, vWorld.y), vec2<f32>(vWorld.z, vWorld.y), abs(N.x) > abs(N.z));
  let f = fract(uvw / vec2<f32>(3.0, 3.2));
  let win = step(0.22, f.x) * step(f.x, 0.6) * step(0.3, f.y) * step(f.y, 0.76) * facade;
  let shutter = step(0.6, f.x) * step(f.x, 0.74) * step(0.3, f.y) * step(f.y, 0.76) * facade;
  var albedo = plaster;
  albedo = mix(albedo, vec3<f32>(0.05, 0.08, 0.11), win * fade);
  albedo = mix(albedo, vec3<f32>(0.2, 0.34, 0.4), shutter * fade * 0.7);
  albedo = mix(albedo, vec3<f32>(0.52, 0.31, 0.24), (1.0 - facade) * 0.75);
  let emis = vec3<f32>(1.0, 0.75, 0.4) * win * fade * aura.u_nightAmt * 1.2;
  gSunShadow = a3dSunShadowAuto(vWorld, N);
  let lit = lightSurface(albedo, N, V, 0.82, 0.0, emis);
  return vec4<f32>(finish(fogIt(lit, vWorld)), 1.0);
}`);

/** PLUME_VERTEX (point sprites; one-pixel points on WebGPU, see the header). */
export const PLUME_VERTEX_WGSL = stage([CLIP, MATH], /* wgsl */ `
struct PlumeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vAlpha: f32,
  @location(1) vHeat: f32,
};
fn ph1(x: f32) -> f32 { return fract(sin(x * 91.3458) * 47453.5453); }
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> PlumeVarying {
  var out: PlumeVarying;
  let sd = a_position / 20000.0 + vec3<f32>(0.5);
  let life = mix(aura.u_ptLife.x, aura.u_ptLife.y, sd.x);
  let rate = (0.75 + 0.5 * sd.y) / life;
  let cyc = floor(aura.u_time * rate + sd.z * 7.0);
  let ph = fract(aura.u_time * rate + sd.z * 7.0);
  let age = ph * life;
  let r = vec3<f32>(ph1(sd.x * 13.0 + cyc * 1.31), ph1(sd.y * 17.0 + cyc * 2.17), ph1(sd.z * 19.0 + cyc * 3.07));
  let side = vec3<f32>(aura.u_ptBack.z, 0.0, -aura.u_ptBack.x);
  let wp = aura.u_ptPos
    + aura.u_ptBack * (aura.u_ptSpeed * age * aura.u_ptTrail + (r.y - 0.2) * 1.2)
    + side * ((r.x - 0.5) * (aura.u_ptWidth + age * aura.u_ptSpread * 2.0))
    + vec3<f32>(0.0, age * aura.u_ptLift + r.z * 0.35, 0.0)
    + vec3<f32>(ph1(r.x * 5.0) - 0.5, 0.0, ph1(r.z * 7.0) - 0.5) * age * aura.u_ptSpread;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(wp, 1.0));
  out.vAlpha = aura.u_ptAmount * a3dPow(clamp(1.0 - ph, 0.0, 1.0), 1.4) * smoothstep(0.0, 0.06, ph);
  out.vHeat = 1.0 - ph;
  return out;
}`);

export const PLUME_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vAlpha: f32, @location(1) vHeat: f32) -> @location(0) vec4<f32> {
  // gl_PointCoord is the sprite centre for a one-pixel point: c = 0, d = 0, soft = 1.
  let col = aura.u_ptColor * (0.8 + 0.5 * vHeat * aura.u_ptGlow);
  return vec4<f32>(col, vAlpha);
}`);

/** SPRAY_VERTEX (art/spray.ts; one-pixel points on WebGPU). */
export const SPRAY_VERTEX_WGSL = stage([CLIP, MATH], /* wgsl */ `
struct SprayVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vAlpha: f32,
  @location(1) vLift: f32,
};
fn sph(x: f32) -> f32 { return fract(sin(x * 78.233) * 43758.5453); }
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SprayVarying {
  var out: SprayVarying;
  let sd = a_position / 20000.0 + vec3<f32>(0.5);
  let along = mix(aura.u_spWindow.x, aura.u_spWindow.y, sd.x);
  let span = 2.0 * aura.u_spHalfWidth + 24.0;
  let rate = aura.u_spWind / span * (0.75 + 0.5 * sd.y);
  let ph = fract(aura.u_time * rate + sd.z * 13.0);
  let cyc = floor(aura.u_time * rate + sd.z * 13.0);
  let jitter = sph(sd.x * 31.0 + cyc * 1.7);
  let lat = aura.u_spSeaSign * (aura.u_spHalfWidth + 12.0) - aura.u_spSeaSign * ph * span;
  let h = mix(aura.u_spHeight.x, aura.u_spHeight.y, a3dPow(sph(sd.y * 17.0 + cyc * 2.3), 1.6)) + sin(aura.u_time * 1.3 + sd.x * 40.0) * 0.4;
  let wp = aura.u_spOrigin + aura.u_spAlong * (along + (jitter - 0.5) * 6.0) + aura.u_spAcross * lat + vec3<f32>(0.0, h + ph * 1.2, 0.0);
  let clip = aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(wp, 1.0);
  out.position = a3dRasterPosition(clip);
  let alive = step(sd.y, aura.u_spAmount);
  out.vAlpha = alive * aura.u_spAlpha * smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.7, 1.0, ph)) * smoothstep(aura.u_spWindow.y, aura.u_spWindow.y - 40.0, along)
    * smoothstep(10.0, 22.0, clip.w);
  out.vLift = ph;
  return out;
}`);

export const SPRAY_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vAlpha: f32, @location(1) vLift: f32) -> @location(0) vec4<f32> {
  // sprite centre (c = 0): soft = 1
  return vec4<f32>(aura.u_spColor * (0.85 + 0.25 * vLift), vAlpha);
}`);
