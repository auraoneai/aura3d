/**
 * A3/W6: WGSL twins of every `material.custom` program in shaders.ts, for `?backend=webgpu`. Each stage is the GLSL line for
 * line, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL (default pixels are unchanged). Authored
 * uniform `foo` reads as `aura.u_foo`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` with the same body.
 *   - `atan(y, x)` is `atan2`; GLSL `mod` is `a3dModF` (floored, not WGSL's truncated `%`); ternaries are `select`.
 *   - `normalMatrix` is `mat3(u_normalMatrix)`; `mat3(modelMatrix) * mat3(instanceMatrix) * n` is the 4x4 product on a
 *     w = 0 vector. Instance columns arrive at locations 8-11 and the instance colour at 12.
 *   - `receiveShadow: true` (solids, road): `a3dSunShadowAuto` is the engine's `a3d_shadow` lookup, the same bindings the
 *     shader-graph WGSL path samples (`aura.u_shadowMap*`, `u_shadowMapTextureTexture`, WebGPU's top-left texture origin).
 *   - The road's `crossProfile` is the geometry's only custom attribute (pool location 3).
 *   - Derivatives stay in uniform control flow: the sky's star `fwidth(sp)` is taken before its branches.
 *   - `gl_FragCoord` is `@builtin(position)`; its y runs top-down on WebGPU, which only reshuffles the sky's dither hash.
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
fn a3dModF(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
`;

/** `NOISE` in shaders.ts. */
const NOISE = /* wgsl */ `
fn hsh(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn n2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2<f32>(1.0, 0.0)), f.x), mix(hsh(i + vec2<f32>(0.0, 1.0)), hsh(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn fbm(p: vec2<f32>) -> f32 {
  return n2(p) * 0.58 + n2(p * 2.17 + vec2<f32>(7.3)) * 0.28 + n2(p * 4.4 + vec2<f32>(19.1)) * 0.14;
}
`;

/** `CLOUD_NOISE` in shaders.ts. */
const CLOUD_NOISE = /* wgsl */ `
fn ch(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
fn cn(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(ch(i), ch(i + vec2<f32>(1.0, 0.0)), f.x), mix(ch(i + vec2<f32>(0.0, 1.0)), ch(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn cfbm3(p: vec2<f32>) -> f32 { return cn(p) * 0.56 + cn(p * 2.03 + vec2<f32>(5.2)) * 0.29 + cn(p * 4.17 + vec2<f32>(11.7)) * 0.15; }
`;

/** `ATMOSPHERE` in shaders.ts. */
const ATMOSPHERE = /* wgsl */ `
const FOG_COL = vec3<f32>(0.80, 0.62, 0.80);
const SUN_DIR = vec3<f32>(-0.2501, 0.3002, -0.9206);
fn fogMix(c: vec3<f32>, d: f32) -> vec3<f32> { return mix(c, FOG_COL, clamp((d - 430.0) / 580.0, 0.0, 1.0)); }
fn fogAmount(d: f32) -> f32 { return clamp((d - 430.0) / 580.0, 0.0, 1.0); }
`;

/** `ATMOSPHERE_LIVE` in shaders.ts (`FOG_COL` / `SUN_DIR` are the look uniforms). */
const ATMOSPHERE_LIVE = /* wgsl */ `
fn fogMix(c: vec3<f32>, d: f32) -> vec3<f32> { return mix(c, aura.u_lookFogColor, clamp((d - aura.u_lookFogNear) / max(1.0, aura.u_lookFogFar - aura.u_lookFogNear), 0.0, 1.0)); }
fn fogAmount(d: f32) -> f32 { return clamp((d - aura.u_lookFogNear) / max(1.0, aura.u_lookFogFar - aura.u_lookFogNear), 0.0, 1.0); }
`;

/** `a3d_shadow`'s `a3dSunShadowAuto` (the engine includes it for `receiveShadow: true`). */
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

/** `TOON` in shaders.ts (needs ATMOSPHERE's SUN_DIR). */
const TOON = /* wgsl */ `
var<private> gToonShadow: f32 = 1.0;
fn toon(albedo: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let L = normalize(vec3<f32>(-0.45, 1.0, 0.6));
  let d = min(dot(N, L) * 0.5 + 0.5, mix(0.30, 1.0, gToonShadow));
  let bandK = select(select(1.0, 0.97, d < 0.67), 0.92, d < 0.34);
  let sky = mix(vec3<f32>(0.62, 0.52, 0.5), vec3<f32>(1.0, 0.93, 0.9), N.y * 0.5 + 0.5);
  return albedo * bandK * sky;
}
fn toonFigure(albedo: vec3<f32>, N: vec3<f32>, V: vec3<f32>) -> vec3<f32> {
  let L = normalize(vec3<f32>(-0.45, 1.0, 0.6));
  let d = min(dot(N, L) * 0.5 + 0.5, mix(0.29, 1.0, gToonShadow));
  let bandK = select(select(select(1.04, 0.96, d < 0.86), 0.84, d < 0.62), 0.66, d < 0.30);
  let sky = mix(vec3<f32>(0.66, 0.5, 0.58), vec3<f32>(1.0, 0.92, 0.9), N.y * 0.5 + 0.5);
  let rim = a3dPow(1.0 - max(dot(N, V), 0.0), 2.6);
  let rimLight = rim * (0.35 + 0.65 * max(dot(N, SUN_DIR) * 0.5 + 0.5, 0.0));
  let spec = a3dPow(max(dot(N, normalize(normalize(L) + V)), 0.0), 36.0);
  return albedo * bandK * sky + vec3<f32>(1.0, 0.72, 0.62) * rimLight * 0.42 + vec3<f32>(1.0, 0.92, 0.85) * spec * 0.16;
}
`;

/** `TOON_LIVE` in shaders.ts. */
const TOON_LIVE = /* wgsl */ `
var<private> gToonShadow: f32 = 1.0;
fn toon(albedo: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let L0 = normalize(vec3<f32>(-0.45, 1.0, 0.6));
  let L = normalize(mix(L0, normalize(aura.u_lookSunDir + vec3<f32>(0.0, 0.35, 0.0)), aura.u_lookMode));
  let d = min(dot(N, L) * 0.5 + 0.5, mix(0.30, 1.0, gToonShadow));
  var bandK = select(select(1.0, 0.97, d < 0.67), 0.92, d < 0.34);
  bandK = mix(bandK, mix(0.62, 1.0, smoothstep(0.2, 0.75, d)), aura.u_lookMode);
  let sky0 = mix(vec3<f32>(0.62, 0.52, 0.5), vec3<f32>(1.0, 0.93, 0.9), N.y * 0.5 + 0.5);
  let sky1 = mix(aura.u_lookHemiGround, aura.u_lookHemiSky, N.y * 0.5 + 0.5) * 1.35;
  return albedo * bandK * mix(sky0, sky1, aura.u_lookMode);
}
`;

function stage(chunks: readonly string[], body: string): string {
  return [MARKER, ...chunks, body].join("\n");
}

/** SOLID_VERTEX / GLOW_VERTEX: world position and normal. */
const NORMAL_WORLD_VERTEX = stage([CLIP], /* wgsl */ `
struct NormalWorldVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> NormalWorldVarying {
  var out: NormalWorldVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SOLID_VERTEX_WGSL = NORMAL_WORLD_VERTEX;

export const SOLID_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE, SUN_SHADOW, TOON], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  gToonShadow = a3dSunShadowAuto(vWorld, N);
  let col = toonFigure(aura.u_baseColor, N, V) + aura.u_glowColor * aura.u_glow;
  return vec4<f32>(fogMix(col, length(aura.u_cameraPosition - vWorld)), 1.0);
}`);

export const GLOW_VERTEX_WGSL = NORMAL_WORLD_VERTEX;

export const GLOW_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let facing = abs(dot(N, V));
  let rim = a3dPow(1.0 - facing, 1.6);
  let core = a3dPow(facing, 3.0);
  let col = mix(aura.u_glowShell * 0.9, aura.u_glowCore, core) + aura.u_glowShell * rim * 0.5;
  let a = (mix(0.5 + 0.25 * core, 0.12, aura.u_glowHollow) + 0.45 * rim) * aura.u_glowAlpha * (1.0 - fogAmount(length(aura.u_cameraPosition - vWorld)));
  return vec4<f32>(col, a);
}`);

const INSTANCE_INPUTS = "@location(8) a_instanceMatrix0: vec4<f32>, @location(9) a_instanceMatrix1: vec4<f32>, " +
  "@location(10) a_instanceMatrix2: vec4<f32>, @location(11) a_instanceMatrix3: vec4<f32>, @location(12) a_instanceColor: vec4<f32>";

const INSTANCED_VARYING = /* wgsl */ `
struct InstancedVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vTint: vec3<f32>,
};`;

/** GLOW_INSTANCED_VERTEX / FLAG_INSTANCED_VERTEX / ISLAND_INSTANCED_VERTEX. */
function instancedVertex(kind: "glow" | "flag" | "island"): string {
  const deform = kind === "flag"
    ? `  let along = clamp(p.x + 0.5, 0.0, 1.0);
  let isCloth = step(length(a_instanceMatrix2.xyz), 0.08);
  let seed = a_instanceMatrix3.x * 0.37 + a_instanceMatrix3.z * 0.19;
  let wave = sin(aura.u_flagTime * 6.2 + along * 5.2 + seed) * 0.13 + sin(aura.u_flagTime * 11.4 - along * 9.5 + seed * 1.7) * 0.045;
  p.z = p.z + wave * along * isCloth;
  p.y = p.y + cos(aura.u_flagTime * 5.4 + along * 4.1 + seed) * 0.03 * along * isCloth;`
    : kind === "island"
      ? `  let seed = a_instanceMatrix3.x * 0.031 + a_instanceMatrix3.z * 0.023;
  let puff = sin(p.x * 3.1 + aura.u_cloudTime * 0.42 + seed) * 0.13 + cos(p.y * 2.7 - p.z * 2.9 + seed * 1.7) * 0.11 + sin((p.x + p.z) * 4.8 - aura.u_cloudTime * 0.28) * 0.05;
  p = p + a_normal * puff * aura.u_cloudMode;`
      : "";
  const nrmExpr = kind === "island" ? "normalize(a_normal + p * 0.25 * aura.u_cloudMode)" : "a_normal";
  return stage([CLIP, INSTANCED_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, ${INSTANCE_INPUTS}) -> InstancedVarying {
  var out: InstancedVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  var p = a_position;
${deform}
  let wp = aura.u_modelMatrix * instanceMatrix * vec4<f32>(p, 1.0);
  out.vWorld = wp.xyz;
  out.vNormal = normalize((aura.u_modelMatrix * (instanceMatrix * vec4<f32>(${nrmExpr}, 0.0))).xyz);
  out.vTint = a_instanceColor.rgb;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * wp);
  return out;
}`);
}

export const GLOW_INSTANCED_VERTEX_WGSL = instancedVertex("glow");

export const GLOW_INSTANCED_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vTint: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let facing = abs(dot(N, V));
  let rim = a3dPow(1.0 - facing, 1.6);
  let core = a3dPow(facing, 3.0);
  let shell = mix(aura.u_glowShell, vTint, aura.u_glowTint);
  let hot = mix(aura.u_glowCore, mix(vTint, vec3<f32>(1.0), 0.75), aura.u_glowTint) * aura.u_glowHdr;
  let col = mix(shell * 0.9, hot, core) + shell * rim * 0.7;
  let a = (mix(0.5 + 0.25 * core, 0.12, aura.u_glowHollow) + 0.45 * rim) * aura.u_glowAlpha * (1.0 - fogAmount(length(aura.u_cameraPosition - vWorld)));
  return vec4<f32>(col, a);
}`);

export const FLAG_INSTANCED_VERTEX_WGSL = instancedVertex("flag");

export const FLAG_INSTANCED_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vTint: vec3<f32>) -> @location(0) vec4<f32> {
  let toCam = aura.u_cameraPosition - vWorld;
  let camDist = length(toCam);
  let nearClear = smoothstep(1.6, 4.8, camDist);
  let dither = fract(52.9829189 * fract(dot(floor(fragCoord.xy), vec2<f32>(0.06711056, 0.00583715))));
  if (nearClear < dither) { discard; }
  let V = toCam / max(camDist, 1e-4);
  var N = normalize(vNormal);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = normalize(aura.u_flagSunDir);
  let back = a3dPow(max(dot(-V, L), 0.0), 2.0);
  let sheen = a3dPow(max(dot(N, normalize(L + V)), 0.0), 28.0);
  let col = vTint * (0.46 + 0.38 * max(N.y, 0.0) + 0.22 * max(dot(N, L), 0.0)) + vTint * aura.u_flagSunColor * back * 1.45 + aura.u_flagSunColor * sheen * 0.22;
  return vec4<f32>(mix(col, aura.u_flagFogColor, fogAmount(camDist)), 1.0);
}`);

export const ISLAND_INSTANCED_VERTEX_WGSL = instancedVertex("island");

export const ISLAND_INSTANCED_FRAGMENT_WGSL = stage([MATH, CLOUD_NOISE, ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vTint: vec3<f32>) -> @location(0) vec4<f32> {
  let toCam = aura.u_cameraPosition - vWorld;
  let dist = length(toCam);
  let V = toCam / max(dist, 1e-4);
  let N = normalize(vNormal);
  let L = normalize(aura.u_islandSunDir);
  if (aura.u_cloudMode < 0.5) {
    let lit = smoothstep(-0.35, 0.65, N.y) * (0.55 + 0.45 * max(dot(N, L), 0.0));
    let rock = mix(aura.u_islandDark, mix(aura.u_islandLit, aura.u_cloudMid, 0.02), lit);
    let rim = a3dPow(1.0 - abs(dot(N, V)), 3.0) * a3dPow(max(dot(-V, L), 0.0), 2.0);
    let col = rock + aura.u_islandSunColor * rim * 1.6;
    let fog = max(fogAmount(dist), vTint.r);
    return vec4<f32>(mix(col, aura.u_islandFogColor, fog), 1.0);
  }
  let nearClear = smoothstep(5.0, 16.0, dist);
  let dither = fract(52.9829189 * fract(dot(floor(fragCoord.xy), vec2<f32>(0.06711056, 0.00583715))));
  if (nearClear < dither) { discard; }
  let tuft = cfbm3(vWorld.xz * 0.042 + vec2<f32>(aura.u_cloudTime * 0.018, -aura.u_cloudTime * 0.009));
  let Ns = normalize(N + vec3<f32>(tuft - 0.5, 0.18 * tuft, 0.5 - tuft) * 0.38);
  let facing = clamp(abs(dot(Ns, V)), 0.0, 1.0);
  let optDepth = mix(0.32, 1.85, facing) * (0.76 + 0.34 * tuft);
  let beer = exp(-optDepth * 0.82);
  let powder = 1.0 - exp(-optDepth * 2.15);
  let beerPowder = 2.0 * beer * powder;
  let cosTheta = clamp(dot(-V, L), -1.0, 1.0);
  let g = 0.62;
  let hg = (1.0 - g * g) / (4.0 * 3.14159265 * a3dPow(max(1.0 + g * g - 2.0 * g * cosTheta, 0.04), 1.5));
  let crown = smoothstep(-0.52, 0.72, Ns.y + (tuft - 0.5) * 0.35);
  let sunWrap = clamp(dot(Ns, L) * 0.5 + 0.5, 0.0, 1.0);
  let lit = clamp(crown * (0.38 + 0.62 * sunWrap) * (0.78 + 0.36 * tuft), 0.0, 1.0);
  var body = mix(aura.u_islandDark * 0.88, aura.u_cloudMid, smoothstep(0.06, 0.64, lit));
  body = mix(body, aura.u_islandLit, smoothstep(0.45, 0.96, lit));
  let rim = a3dPow(1.0 - facing, 2.1);
  let silver = aura.u_islandSunColor * (min(hg, 2.6) * 0.34 + beerPowder * rim * 0.62) * (0.35 + 0.65 * sunWrap);
  let bounce = mix(aura.u_islandFogColor, aura.u_islandSunColor, 0.32) * smoothstep(0.25, -0.75, Ns.y) * 0.24;
  let col = body + silver + bounce;
  let fog = clamp(max(fogAmount(dist * 0.88), vTint.r * 0.65), 0.0, 0.94);
  return vec4<f32>(mix(col, aura.u_islandFogColor, fog), 1.0);
}`);

/** FLAT_VERTEX / SKY_VERTEX: world position only. */
const WORLD_VERTEX = stage([CLIP], /* wgsl */ `
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

export const FLAT_VERTEX_WGSL = WORLD_VERTEX;

export const FLAT_FRAGMENT_WGSL = stage([ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(aura.u_flatColor, aura.u_flatAlpha * (1.0 - fogAmount(length(aura.u_cameraPosition - vWorld))));
}`);

export const BLOB_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct BlobVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vCenter: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> BlobVarying {
  var out: BlobVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vCenter = (aura.u_modelMatrix * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BLOB_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vCenter: vec3<f32>) -> @location(0) vec4<f32> {
  let v = vWorld - vCenter;
  let d = length(v) / aura.u_blobRadius;
  var a = (1.0 - smoothstep(0.1, 1.0, d)) * aura.u_blobAlpha;
  if (aura.u_blobCast > 0.0) {
    let t = clamp(dot(v, aura.u_blobDir), 0.0, aura.u_blobCast);
    let r = length(v - aura.u_blobDir * t) / (aura.u_blobRadius * mix(0.42, 0.62, t / aura.u_blobCast));
    let k = t / aura.u_blobCast;
    let castA = (1.0 - smoothstep(0.55, 1.0, r)) * mix(1.0, 0.45, k * k);
    let feet = 1.0 - smoothstep(0.0, 0.55, length(v) / aura.u_blobRadius);
    let core = 1.0 - smoothstep(0.0, 0.2, length(v) / aura.u_blobRadius);
    a = min(1.0, max(castA, feet) * aura.u_blobAlpha + core * 0.35);
  }
  if (a < 0.01) { discard; }
  return vec4<f32>(aura.u_blobShade, a);
}`);

export const ROAD_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct RoadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @location(3) vCross: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) crossProfile: vec2<f32>) -> RoadVarying {
  var out: RoadVarying;
  out.vUv = a_uv;
  out.vCross = crossProfile;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const ROAD_FRAGMENT_WGSL = stage([MATH, NOISE, ATMOSPHERE_LIVE, SUN_SHADOW, TOON_LIVE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>, @location(3) vCross: vec2<f32>) -> @location(0) vec4<f32> {
  let SUN_DIR = aura.u_lookSunDir;
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let dist = length(aura.u_cameraPosition - vWorld);
  let s = vUv.y * 10.0;
  var top = 1.0 - smoothstep(3.7, 4.5, abs(vCross.x));
  top = top * (1.0 - smoothstep(0.9, 1.5, -vCross.y));

  let cell = mix(vec2<f32>(vUv.x * 40.0, s / 2.2), vec2<f32>(vCross.x / 0.8, s / 1.6), top);
  let row = floor(cell.y);
  let g = vec2<f32>(cell.x + a3dModF(row, 2.0) * 0.5, cell.y);
  let f = fract(g);
  let e = min(f, vec2<f32>(1.0) - f);
  let fw = fwidth(cell);
  let fwm = max(fw.x, fw.y);
  let detail = 1.0 - smoothstep(mix(0.16, 0.07, aura.u_lookMode), mix(0.5, 0.28, aura.u_lookMode), fwm);
  let bevel = mix(0.92, smoothstep(0.0, max(0.16, fwm * 1.5), min(e.x, e.y * 0.8)), detail);
  let joint = mix(0.9, smoothstep(0.0, max(0.05, fwm * 1.4), min(e.x, e.y)), detail);
  let tint = mix(0.5, fbm(floor(g) * 0.7 + vec2<f32>(3.1)), detail);
  let depth = clamp(-vCross.y / 16.0, 0.0, 1.0);
  let streak = n2(vec2<f32>(vCross.x * 1.9 + vCross.y * 0.7, s * 0.16));
  let fres = a3dPow(1.0 - max(dot(N, V), 0.0), 2.0);

  var rough = 0.52;
  var albedo: vec3<f32>;
  if (aura.u_lookMode < 0.5) {
    var plate = mix(aura.u_roadDark, aura.u_roadTop, 0.5 + 0.5 * tint);
    plate = plate * mix(0.80, 1.04, bevel);
    var body = mix(aura.u_scaleColor * vec3<f32>(0.92, 0.86, 1.0), vec3<f32>(0.34, 0.24, 0.52), smoothstep(0.0, 0.9, depth));
    body = body * (0.80 + 0.32 * streak) * mix(0.9, 1.0, bevel);
    albedo = mix(body, plate, top);
    albedo = mix(aura.u_jointColor * 0.9, albedo, joint);
    let film = vec3<f32>(0.5) + 0.5 * cos(6.2831853 * (vec3<f32>(0.0, 0.33, 0.67) + fres * 0.9 + tint * 0.6));
    albedo = mix(albedo, albedo * film * 1.08, 0.07 * top * detail);
  } else {
    let bevelSlope = vec2<f32>(smoothstep(0.18, 0.0, f.x) - smoothstep(0.82, 1.0, f.x), smoothstep(0.18, 0.0, f.y) - smoothstep(0.82, 1.0, f.y)) * detail * mix(0.35, 1.0, top);
    N = normalize(N + vec3<f32>(bevelSlope.x * 0.22, 0.0, bevelSlope.y * 0.22));
    rough = mix(0.42, 0.88, clamp((1.0 - joint) * 0.72 + tint * 0.32, 0.0, 1.0));
    let overlap = mix(1.0, 0.70 + 0.30 * smoothstep(0.0, 0.85, 1.0 - f.y), detail);
    var plate = mix(aura.u_roadPearl * 0.84, aura.u_roadPearl * 1.03, 0.5 + 0.5 * tint) * mix(0.80, 1.06, bevel) * overlap;
    let kerbMoss = smoothstep(2.85, 4.15, abs(vCross.x)) * (1.0 - 0.55 * joint) * top * detail;
    plate = mix(plate, aura.u_roadJade * 0.86, kerbMoss * 0.55);
    let bolster = smoothstep(3.82, 4.32, abs(vCross.x)) * (1.0 - smoothstep(4.55, 5.05, abs(vCross.x))) * (1.0 - smoothstep(0.45, 1.25, -vCross.y));
    let flank = smoothstep(0.0, 0.9, depth);
    var body = mix(aura.u_roadJade, aura.u_roadBelly, flank);
    let belly = smoothstep(0.55, 0.9, depth);
    let bellyRow = fract(s / 1.1);
    body = body * mix(1.0, mix(0.72, 1.0, smoothstep(0.0, max(0.08, fwm * 2.0), min(bellyRow, 1.0 - bellyRow))), belly * detail);
    body = body * (0.85 + 0.26 * streak) * mix(0.88, 1.0, bevel) * overlap;
    albedo = mix(body, plate, top);
    albedo = mix(albedo, mix(aura.u_roadSpine, aura.u_roadJade * 1.35, 0.35), bolster * 0.42 * detail);
    albedo = mix(aura.u_roadJade * 0.48, albedo, joint);
    let film = vec3<f32>(0.5) + 0.5 * cos(6.2831853 * (vec3<f32>(0.0, 0.33, 0.67) + fres * 1.2 + tint * 0.8));
    albedo = mix(albedo, albedo * film * 1.16, (0.14 + 0.32 * fres) * mix(0.5, 1.0, top) * detail);
  }

  gToonShadow = a3dSunShadowAuto(vWorld, N);
  var gateShade = 0.0;
  if (aura.u_gateSun.z > 0.005 && aura.u_gateSun.x < -0.15 && aura.u_lookMode > 0.5 && top + (1.0 - depth) > 0.2) {
    let te = aura.u_gateSun.z;
    var gate = 0.0;
    let k0 = ceil(s / aura.u_gateSpacing);
    for (var i = 0; i < 5; i = i + 1) {
      let s0 = (k0 + f32(i)) * aura.u_gateSpacing;
      if (min(abs(s0 - aura.u_gateSkip.x), abs(s0 - aura.u_gateSkip.y)) < 30.0) { continue; }
      let u = (s - s0) / aura.u_gateSun.x;
      let h = u * te;
      if (h > 10.2) { break; }
      let pen = 0.12 + u * 0.012;
      let xr = vCross.x - u * aura.u_gateSun.y;
      var post = (1.0 - smoothstep(0.4, 0.4 + pen, abs(xr - aura.u_gatePost))) + (1.0 - smoothstep(0.4, 0.4 + pen, abs(xr + aura.u_gatePost)));
      post = post * (1.0 - smoothstep(9.3, 9.6, h));
      let hb = pen * te;
      let tie = (smoothstep(7.72 - hb, 7.72, h) - smoothstep(8.07, 8.07 + hb, h)) * (1.0 - smoothstep(aura.u_gatePost + 0.1, aura.u_gatePost + 0.1 + pen, abs(xr)));
      let lintel = (smoothstep(9.15 - hb, 9.15, h) - smoothstep(10.01, 10.01 + hb, h)) * (1.0 - smoothstep(aura.u_gatePost + 1.5, aura.u_gatePost + 1.8 + pen, abs(xr)));
      gate = max(gate, clamp(max(post, max(tie, lintel)), 0.0, 1.0));
    }
    gateShade = gate;
  }
  var col = toon(albedo, N);
  col = col + mix(vec3<f32>(1.0, 0.82, 0.9), aura.u_lookSunColor, aura.u_lookMode) * a3dPow(max(dot(N, SUN_DIR), 0.0), 3.0) * mix(0.07, 0.18, aura.u_lookMode) * top;
  let Rv = reflect(-V, N);
  let rs = max(dot(Rv, SUN_DIR), 0.0);
  let gloss = clamp(1.0 - (rough - 0.42) / 0.46, 0.0, 1.0);
  let skyRefl = mix(aura.u_lookFogColor, aura.u_lookSunColor, a3dPow(rs, 4.0));
  let plateMask = top * mix(0.25, 1.0, joint) * aura.u_lookMode;
  col = mix(col, skyRefl, (0.08 + 0.36 * fres) * (0.55 + 0.45 * gloss) * plateMask);
  col = col + aura.u_lookSunColor * (a3dPow(rs, mix(18.0, 56.0, gloss)) * (0.32 + 0.44 * gloss) + a3dPow(rs, 8.0) * 0.12) * plateMask;
  let bodyMask = (1.0 - top) * (1.0 - smoothstep(0.45, 0.85, depth)) * aura.u_lookMode;
  let bodyRefl = mix(mix(aura.u_lookHemiSky, aura.u_lookFogColor, 0.5), aura.u_lookSunColor, a3dPow(rs, 3.0)) * mix(vec3<f32>(1.0), aura.u_roadJade * 1.8, 0.45);
  col = mix(col, bodyRefl, (0.03 + 0.18 * fres) * bodyMask);
  col = col + aura.u_lookSunColor * (a3dPow(rs, 24.0) * 0.55 + a3dPow(rs, 6.0) * 0.1) * bodyMask * mix(0.25, 1.0, gToonShadow);
  let underBounce = smoothstep(0.20, 0.88, depth) * aura.u_lookMode;
  let cloudGlow = mix(aura.u_lookFogColor, aura.u_lookSunColor, 0.38) * (0.34 + 0.20 * streak) + albedo * 0.48;
  col = mix(col, max(col, cloudGlow), underBounce * 0.76);
  let shadeTint = mix(aura.u_lookHemiSky * 0.55, vec3<f32>(0.30, 0.26, 0.46), 0.5);
  col = mix(col, col * shadeTint, gateShade * 0.7 * aura.u_lookMode);

  let spineW = 0.22 + fwm * 0.4;
  let spine = (1.0 - smoothstep(spineW * 0.5, spineW, abs(vCross.x))) * top * aura.u_lookMode;
  let wave = 0.55 + 0.45 * sin(s * 0.18 - aura.u_roadTime * 5.0);
  col = mix(col, aura.u_roadSpine * (1.2 + 0.9 * wave), spine * 0.9);

  let cracked = step(0.58, fbm(floor(g) * 0.37 + vec2<f32>(7.3))) * top * detail * aura.u_roadCrack * aura.u_lookMode;
  let vein = 1.0 - smoothstep(0.0, 0.05 + fwm * 1.5, abs(n2(g * 2.3 + vec2<f32>(1.7)) - 0.5));
  col = col + mix(vec3<f32>(1.0, 0.48, 0.42), aura.u_roadSpine, 0.5) * vein * cracked * (1.1 + 0.5 * wave);

  let ahead = aura.u_gapAt - s;
  let edge = smoothstep(2.6, 3.5, abs(vCross.x)) * top;
  let warn = aura.u_gapWarn * edge * step(0.0, ahead) * (1.0 - smoothstep(0.0, 30.0, ahead));
  col = mix(col, vec3<f32>(1.0, 0.52, 0.32), clamp(warn, 0.0, 1.0) * 0.85);

  return vec4<f32>(fogMix(col, dist), 1.0);
}`);

export const AURA_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct AuraVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vNV: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>) -> AuraVarying {
  var out: AuraVarying;
  out.vUv = a_uv;
  out.vNV = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

/** `bladeTier`'s `out float acrossOut` is returned as `.y`. */
export const AURA_FRAGMENT_WGSL = stage([MATH, NOISE], /* wgsl */ `
fn bladeTier(up: f32, s: f32, e: f32, kSeed: f32, ux: f32) -> vec2<f32> {
  let lh = (up - s) / (e - s);
  if (lh < 0.0 || lh > 1.0) { return vec2<f32>(0.0); }
  let colx = ux * 13.0 + kSeed * 7.31;
  let idx = floor(colx);
  let within = fract(colx);
  let r1 = hsh(vec2<f32>(idx, 3.7 + kSeed));
  let r2 = hsh(vec2<f32>(idx, 9.1 + kSeed));
  let r3 = hsh(vec2<f32>(idx, 17.3 + kSeed));
  var reach = 0.50 + r1 * 0.48;
  reach = reach * (0.84 + 0.26 * sin(aura.u_auraTime * (2.0 + r2 * 4.0) + idx * 1.7 + kSeed * 5.0));
  let along = 1.0 - lh / max(reach, 0.05);
  if (along <= 0.0) { return vec2<f32>(0.0); }
  let halfW = mix(0.72, 0.26, 1.0 - along);
  let across = 1.0 - clamp(abs(within - 0.5) / halfW, 0.0, 1.0);
  if (across <= 0.0) { return vec2<f32>(0.0); }
  let alive = step(0.10, r3);
  let envelope = smoothstep(0.0, 0.32, lh) * (0.66 + 0.34 * lh);
  return vec2<f32>(a3dPow(along, 0.8) * a3dPow(across, 0.45) * alive * envelope, across);
}
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vNV: vec3<f32>) -> @location(0) vec4<f32> {
  let up = clamp(vUv.y, 0.0, 1.0);
  let t0 = bladeTier(up, 0.00, 0.40, 0.0, vUv.x);
  let t1 = bladeTier(up, 0.32, 0.70, 1.0, vUv.x);
  let t2 = bladeTier(up, 0.56, 1.00, 2.0, vUv.x);
  let a0 = t0.x;
  let a1 = t1.x * 1.22;
  let a2 = t2.x * 1.48;
  let aB = max(a0, max(a1, a2));
  if (aB <= 0.0) { discard; }
  let across = select(select(t2.y, t1.y, a1 >= a2), t0.y, a0 >= a1 && a0 >= a2);
  let side = abs(sin(vUv.x * 6.2831853));
  let sideW = mix(1.0, 0.22 + 0.95 * a3dPow(side, 1.5), aura.u_auraFlank);
  let rim = a3dPow(1.0 - abs(vNV.z), 1.25);
  var dens = 1.0;
  if (aura.u_auraSheath > 0.5) {
    let t = clamp(vUv.y, 0.0, 1.0);
    dens = smoothstep(0.00, 0.30, t) * (1.0 - smoothstep(0.38, 1.0, t) * 0.94);
    dens = dens * 1.85;
  }
  var a = aB * sideW * dens * (0.88 + 0.72 * rim) * aura.u_auraIntensity;
  a = a * aura.u_auraSolid;
  a = a * mix(1.0, 0.62, up);
  a = a * smoothstep(0.985, 0.86, up);
  if (a < 0.015) { discard; }
  let coreShimmer = 0.88 + 0.24 * sin(aura.u_auraTime * 9.0 + up * 11.0);
  var col = mix(aura.u_auraEdge, aura.u_auraMid, smoothstep(0.10, 0.55, across));
  col = mix(col, aura.u_auraHot * coreShimmer, smoothstep(0.62, 0.95, across) * aB);
  return vec4<f32>(col, min(a, 0.82));
}`);

export const SKY_VERTEX_WGSL = WORLD_VERTEX;

export const SKY_FRAGMENT_WGSL = stage([MATH, CLOUD_NOISE, ATMOSPHERE_LIVE], /* wgsl */ `
const CLOUD_H = 55.0;
fn deckTop(xz: vec2<f32>) -> f32 {
  let q = xz * 0.0026 + vec2<f32>(aura.u_skyTime * 0.004, aura.u_skyTime * 0.0013);
  let base = cfbm3(q);
  let lobes = cn(q * 4.7 + vec2<f32>(3.1)) * 0.65 + cn(q * 9.9 + vec2<f32>(8.3)) * 0.35;
  let h = base * 0.78 + lobes * 0.22;
  return smoothstep(0.30, 0.74, h) * CLOUD_H * (0.7 + 0.3 * lobes);
}
fn skyAt(dy: f32) -> vec3<f32> {
  let t = clamp(dy / 0.80, 0.0, 1.0);
  let banded = floor(t * 10.0) / 10.0 + fract(t * 10.0) * 0.10;
  let b = mix(t, banded, 0.3);
  if (b < 0.46) { return mix(aura.u_skyLo, aura.u_skyMid, smoothstep(0.02, 0.48, b)); }
  return mix(aura.u_skyMid, aura.u_skyHi, smoothstep(0.46, 0.94, b));
}
fn scriptSky(dir: vec3<f32>, sd: f32) -> vec3<f32> {
  let dy = max(dir.y, 0.0);
  var col = mix(aura.u_skyLo, aura.u_skyMid, smoothstep(0.0, 0.28, dy));
  col = mix(col, aura.u_skyHi, smoothstep(0.18, 0.85, dy));
  let bandW = exp(-dy * 9.0);
  col = mix(col, aura.u_skyBand, bandW * (0.35 + 0.65 * a3dPow(sd, 3.0)));
  let disc = smoothstep(0.99955, 0.99975, sd);
  let corona = a3dPow(sd, 90.0) * 0.9 + a3dPow(sd, 12.0) * 0.25;
  let maria = 0.82 + 0.18 * cn(dir.xy * 900.0);
  let sunCol = mix(aura.u_skySunDisc * 3.0, aura.u_skySunDisc * 1.6 * maria, aura.u_skyMoon);
  col = col + aura.u_skySunDisc * corona * aura.u_skyCorona * (1.0 - 0.7 * aura.u_skyMoon);
  col = col + aura.u_skySunDisc * a3dPow(sd, 400.0) * 0.6 * aura.u_skyMoon;
  col = mix(col, sunCol, disc);
  return col;
}
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let FOG_COL = aura.u_lookFogColor;
  let SUN_DIR = aura.u_lookSunDir;
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let sd = max(dot(dir, SUN_DIR), 0.0);
  // star grid and its screen derivative, taken in uniform control flow (WGSL requires it; the GLSL reads them in a branch)
  let sp = vec2<f32>(atan2(dir.z, dir.x) * 57.2958, dir.y * 180.0);
  let spFw = fwidth(sp);
  var col: vec3<f32>;
  if (dir.y >= 0.0) {
    col = select(scriptSky(dir, sd), skyAt(dir.y), aura.u_lookMode < 0.5);
    let cell = floor(sp);
    if (ch(cell + vec2<f32>(17.0)) > 0.982) {
      let centre = cell + vec2<f32>(0.5) + (vec2<f32>(ch(cell + vec2<f32>(3.1)), ch(cell + vec2<f32>(9.7))) - vec2<f32>(0.5)) * 0.5;
      let px = (sp - centre) / max(spFw, vec2<f32>(1e-4));
      var star = (1.0 - smoothstep(0.7, 1.5, max(abs(px.x), abs(px.y)))) * smoothstep(0.03, 0.2, dir.y);
      star = star * mix(1.0, aura.u_skyStars * smoothstep(0.08, 0.45, dir.y) * (0.6 + 0.4 * ch(cell + vec2<f32>(41.0))), aura.u_lookMode);
      col = mix(col, vec3<f32>(1.0), star * 0.9);
    }
    col = mix(FOG_COL, col, smoothstep(0.0, mix(0.2, 0.08, aura.u_lookMode), dir.y));
  } else {
    let ro = aura.u_cameraPosition;
    let topY = aura.u_deckBase + CLOUD_H;
    let tB = min((aura.u_deckBase - 8.0 - ro.y) / dir.y, 3400.0);
    var tA = select(0.0, (topY - ro.y) / dir.y, ro.y > topY);
    let under = mix(aura.u_cloudDark * vec3<f32>(0.66, 0.58, 0.32), aura.u_cloudDark * 0.8, aura.u_lookMode);
    if (tB <= 0.0) {
      col = mix(aura.u_cloudDark * vec3<f32>(0.62, 0.52, 0.80), FOG_COL, 0.5);
    } else {
      tA = min(tA, tB);
      let dt = (tB - tA) / 22.0;
      var t = tA + dt * (0.15 + 0.85 * ch(dir.xz * 1371.7 + vec2<f32>(dir.y * 91.3)));
      var acc = vec3<f32>(0.0);
      var trans = 1.0;
      var tFirst = tB;
      for (var i = 0; i < 22; i = i + 1) {
        let p = ro + dir * t;
        let hgt = p.y - aura.u_deckBase;
        let top = deckTop(p.xz);
        let dens = select(clamp((top - hgt) / 16.0, 0.0, 1.0), 1.0, hgt < 0.0);
        if (dens > 0.01) {
          let a = 1.0 - exp(-dens * dt * 0.055);
          let depth01 = clamp((top - hgt) / CLOUD_H, 0.0, 1.0);
          let spos = p + SUN_DIR * 30.0;
          let occl = clamp((deckTop(spos.xz) - (spos.y - aura.u_deckBase)) / 16.0, 0.0, 1.0);
          var lit = (1.0 - occl) * (0.35 + 0.65 * smoothstep(0.0, 0.8, 1.0 - depth01));
          let fine = cn(p.xz * 0.05) * 0.6 + cn(p.xz * 0.15) * 0.4;
          lit = lit * (0.7 + 0.6 * fine);
          lit = lit * (1.0 + aura.u_lookMode * 0.6 * a3dPow(sd, 6.0));
          var sc = mix(under, aura.u_cloudMid, 0.1 + 0.9 * clamp(lit, 0.0, 1.0));
          sc = mix(sc, aura.u_cloudLit, clamp(lit, 0.0, 1.0) * clamp(lit, 0.0, 1.0) * mix(0.55, 0.8, aura.u_lookMode));
          acc = acc + trans * a * sc;
          if (trans > 0.5 && trans * (1.0 - a) <= 0.5) { tFirst = t; }
          trans = trans * (1.0 - a);
          if (trans < 0.03) { break; }
        }
        t = t + dt;
      }
      let floorCol = mix(aura.u_cloudDark * vec3<f32>(0.5, 0.4, 0.22), aura.u_cloudDark * 0.45, aura.u_lookMode);
      col = acc + trans * floorCol;
      col = col * (0.93 + 0.14 * ch(fragCoord.xy));
      col = mix(col, FOG_COL, smoothstep(600.0, 3400.0, tFirst) * 0.9);
      col = mix(col, FOG_COL, 0.6 * exp(dir.y * 18.0));
    }
  }
  return vec4<f32>(col, 1.0);
}`);

export const BOOST_GATE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct BoostGateVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>) -> BoostGateVarying {
  var out: BoostGateVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BOOST_GATE_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let toCam = aura.u_cameraPosition - vWorld;
  let dist = length(toCam);
  let nearClear = smoothstep(1.2, 3.6, dist);
  let V = toCam / max(dist, 1e-4);
  let N = normalize(vNormal);
  let fresnel = a3dPow(1.0 - abs(dot(N, V)), 2.1);
  let waveA = 0.5 + 0.5 * sin(vUv.x * 37.69911 - aura.u_gateTime * 4.2 + vUv.y * 6.2831853);
  let waveB = 0.5 + 0.5 * cos(vUv.y * 25.13274 + aura.u_gateTime * 2.8);
  let lattice = smoothstep(0.32, 0.94, waveA * 0.65 + waveB * 0.35);
  let col = mix(aura.u_gateCore, aura.u_gateEdge, clamp(fresnel * 0.78 + lattice * 0.42, 0.0, 1.0)) * (1.25 + aura.u_gatePulse * 0.9 + fresnel * 1.35);
  let alpha = clamp((0.20 + fresnel * 0.68 + lattice * 0.24) * (0.65 + 0.35 * aura.u_gatePulse), 0.0, 0.92) * nearClear * (1.0 - fogAmount(dist));
  if (alpha < 0.01) { discard; }
  return vec4<f32>(col, alpha);
}`);

export const FLIPBOOK_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct FlipbookVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
  @location(1) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> FlipbookVarying {
  var out: FlipbookVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const FLIPBOOK_FRAGMENT_WGSL = stage([MATH, ATMOSPHERE], /* wgsl */ `
fn sampleStripLut16(lin: vec3<f32>) -> vec3<f32> {
  let c = clamp(lin / (vec3<f32>(1.0) + lin), vec3<f32>(0.0), vec3<f32>(1.0));
  let bSlice = c.b * 15.0;
  let b0 = floor(bSlice);
  let b1 = min(15.0, b0 + 1.0);
  let bf = bSlice - b0;
  let uBase = (c.r * 15.0 + 0.5) / 256.0;
  let vCoord = (c.g * 15.0 + 0.5) / 16.0;
  let s0 = textureSample(u_gradeLutTexture, u_gradeLutSampler, vec2<f32>(uBase + b0 / 16.0, vCoord)).rgb;
  let s1 = textureSample(u_gradeLutTexture, u_gradeLutSampler, vec2<f32>(uBase + b1 / 16.0, vCoord)).rgb;
  return mix(s0, s1, bf);
}
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let idx = floor(clamp(aura.u_flipFrame, 0.0, aura.u_flipCols * aura.u_flipRows - 1.0));
  let colIdx = a3dModF(idx, aura.u_flipCols);
  let rowIdx = floor(idx / aura.u_flipCols);
  let cellUv = vec2<f32>((colIdx + clamp(vUv.x, 0.02, 0.98)) / aura.u_flipCols, (rowIdx + clamp(1.0 - vUv.y, 0.02, 0.98)) / aura.u_flipRows);
  let texel = textureSample(u_flipMapTexture, u_flipMapSampler, cellUv);
  let base = texel.rgb * aura.u_flipTint;
  let graded = mix(base, sampleStripLut16(base) * 1.45, aura.u_lutMix);
  let dist = length(aura.u_cameraPosition - vWorld);
  let a = texel.a * aura.u_flipAlpha * (1.0 - fogAmount(dist));
  if (a < 0.008) { discard; }
  return vec4<f32>(graded, a);
}`);
