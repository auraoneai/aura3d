/**
 * WGSL twins of the port's `material.custom` programs (shaders.ts), for the WebGPU backend. Each body follows its GLSL
 * original line for line: the adapter's safe `pow` is `a3dPow`, `a3d_fog`'s height fog is `a3dFogHeight`, and
 * `receiveShadow`'s `a3d_shadow` lookup is `a3dSunShadow` over the same forward-pass shadow bindings (the WebGPU shadow
 * map is sampled with its v axis flipped, as the shader-graph twin does). WebGL2 keeps drawing the GLSL, so the default
 * pixels are unchanged.
 *
 * Vertex inputs sit at the locations the geometry streams carry on WebGPU: position 0, normal 1, uv 2, then the author
 * attributes in name order from the custom pool (3, 5, 6, ...): roadColor 3 / roadUv 5, beaconColor 3, wakeAlpha 3 /
 * wakeColor 5. The point sprites (gl_PointSize) have no WebGPU form; `point-quads.ts` draws them as quads instead.
 */

const HEADER = /* wgsl */ `/* @aura3d-bindings */`;

const CLIP = /* wgsl */ `
override a3dZeroToOneProjection: bool = false;
fn a3dRasterPosition(clip: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
fn a3dNormalToWorld(n: vec3<f32>) -> vec3<f32> {
  return (aura.u_normalMatrix * vec4<f32>(n, 0.0)).xyz;
}`;

const POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }`;

/** shaders.ts COMMON: noise, the height fog, the glow pools and the twilight `lit()` (gSun / gWorld are private globals). */
const COMMON = /* wgsl */ `${POW}
fn a3dFogHeight(color: vec3<f32>, fogColor: vec3<f32>, dist: f32, worldY: f32, density: f32, heightDensity: f32, heightBase: f32, heightFalloff: f32, maxFog: f32) -> vec3<f32> {
  let d = max(dist, 0.0);
  let height = max(0.0, worldY - heightBase);
  let amount = 1.0 - exp(-(density * d + heightDensity * d * exp(-heightFalloff * height)));
  return mix(color, fogColor, clamp(amount, 0.0, clamp(maxFog, 0.0, 1.0)));
}
fn hash21(p0: vec2<f32>) -> f32 {
  var p = fract(p0 * vec2<f32>(123.34, 456.21));
  p = p + vec2<f32>(dot(p, p + vec2<f32>(45.32)));
  return fract(p.x * p.y);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(17.1); a = a * 0.5; }
  return s;
}
fn applyFog(color: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let vd = normalize(world - aura.u_cameraPosition);
  let sunward = a3dPow(max(dot(normalize(vec3<f32>(vd.x, 0.0, vd.z) + vec3<f32>(1e-4, 0.0, 0.0)), normalize(vec3<f32>(aura.u_sunDir.x, 0.0, aura.u_sunDir.z))), 0.0), 3.0);
  return a3dFogHeight(color, aura.u_fogColor + aura.u_hazeSun * sunward, length(world - aura.u_cameraPosition), world.y, 0.0004, 0.0022, 18.0, 0.031, 0.96);
}
var<private> gSun: f32 = 1.0;
var<private> gWorld: vec3<f32> = vec3<f32>(0.0);
fn glowPools(albedo: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  var sum = vec3<f32>(0.0);
  for (var i = 0; i < 4; i = i + 1) {
    let p = aura.u_poolPos[i];
    let c = aura.u_poolCol[i];
    let d = p.xyz - gWorld;
    let f = clamp(1.0 - length(d) / max(p.w, 1e-3), 0.0, 1.0);
    let facing = 0.35 + 0.65 * max(dot(N, normalize(d + vec3<f32>(0.0, 1e-3, 0.0))), 0.0);
    sum = sum + c.rgb * (c.a * f * f * facing);
  }
  return sum * (albedo * 2.0 + vec3<f32>(0.04));
}
fn lit(albedo: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let hemi = mix(aura.u_groundAmbient, aura.u_skyAmbient, N.y * 0.5 + 0.5);
  let ndl = max(dot(N, normalize(aura.u_sunDir)), 0.0);
  let sunFlat = normalize(vec3<f32>(aura.u_sunDir.x, 0.0, aura.u_sunDir.z) + vec3<f32>(1e-4, 0.0, 0.0));
  let bounceW = max(dot(N, sunFlat), 0.0) * (1.0 - abs(N.y)) + 0.25 * max(-N.y, 0.0);
  let topW = max(N.y, 0.0);
  return albedo * (hemi * aura.u_ambientGain + aura.u_sunColor * ndl * gSun * aura.u_sunGain + aura.u_bounceColor * bounceW + aura.u_topFill * topW) * aura.u_litScale + glowPools(albedo, N);
}`;

/** `a3d_shadow`'s `a3dSunShadow` / `a3dSunShadowAuto` (only in the `receiveShadow: true` programs, whose GLSL declares the bindings). */
const SHADOW = /* wgsl */ `
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
}
fn a3dSunShadowAuto(worldPosition: vec3<f32>, normal: vec3<f32>) -> f32 {
  return a3dSunShadow(worldPosition, normal, aura.u_a3dSunDirection);
}`;

const stage = (...parts: string[]): string => [HEADER, ...parts].join("\n");

export const ROAD_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct RoadVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) road: vec3<f32>,
  @location(3) roadUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(3) roadColor: vec3<f32>, @location(5) roadUv: vec2<f32>) -> RoadVarying {
  var out: RoadVarying;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.normal = normalize(a3dNormalToWorld(a_normal));
  out.road = roadColor;
  out.roadUv = roadUv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const ROAD_FRAGMENT_WGSL = stage(COMMON, SHADOW, /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vRoad: vec3<f32>, @location(3) vRoadUv: vec2<f32>) -> @location(0) vec4<f32> {
  let u = vRoadUv.x;
  let s = vRoadUv.y;
  let N = normalize(vNormal);
  let mottle = fbm(vec2<f32>(u * 3.0 + 1.7, s * 0.05));
  let grain = fbm(vec2<f32>(u * 38.0, s * 1.4));
  let asphalt = vec3<f32>(0.20, 0.23, 0.29) * (aura.u_roadAlbedo / 0.23) * (0.62 + 0.55 * mottle) * (0.9 + 0.2 * grain);
  let field = fbm(vec2<f32>(u * 2.4 + 3.0, s * 0.028));
  var vein = 1.0 - smoothstep(0.0, 0.007, abs(field - 0.52));
  vein = vein * (1.0 - smoothstep(0.72, 0.96, abs(u)));
  let field2 = fbm(vec2<f32>(u * 4.1 - 5.0, s * 0.045));
  vein = vein + (1.0 - smoothstep(0.0, 0.005, abs(field2 - 0.47))) * 0.5 * (1.0 - smoothstep(0.6, 0.95, abs(u)));
  let edgeLine = (1.0 - smoothstep(0.0, 0.018, abs(abs(u) - 0.80))) * step(0.22, fract(s / 55.0));
  var dash = step(0.5, fract(s / 14.0)) * (1.0 - smoothstep(0.0, 0.025, abs(u)));
  let dashSoft = smoothstep(0.5, 0.56, fract(s / 14.0)) * (1.0 - smoothstep(0.94, 1.0, fract(s / 14.0))) * (1.0 - smoothstep(0.004, 0.018, abs(u)));
  dash = mix(dash, dashSoft * smoothstep(8.0, 26.0, length(vWorld - aura.u_cameraPosition)), aura.u_glass);
  let curb = smoothstep(0.93, 0.985, abs(u));
  let neon = mix(vRoad, vec3<f32>(0.80, 0.95, 1.0), 0.7);
  gSun = a3dSunShadowAuto(vWorld, N);
  gWorld = vWorld;
  var color = lit(asphalt, N) * 1.55;
  let V = normalize(aura.u_cameraPosition - vWorld);
  let fres = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  let Rv = reflect(-V, N);
  let mirror = mix(vec3<f32>(0.04, 0.12, 0.14), mix(vec3<f32>(0.36, 0.16, 0.30), vec3<f32>(0.12, 0.09, 0.30), smoothstep(0.0, 0.3, Rv.y)), smoothstep(-0.05, 0.08, Rv.y));
  let hx = vec2<f32>(u * 9.0, s * 0.22);
  let hc = abs(fract(vec2<f32>(hx.x + 0.5 * floor(hx.y), hx.y)) - vec2<f32>(0.5));
  let seam = (1.0 - smoothstep(0.0, 0.035, 0.5 - max(hc.x, hc.y))) * (1.0 - smoothstep(0.7, 0.92, abs(u)));
  let pulse = 0.5 + 0.5 * sin(s * 0.09 - aura.u_time * aura.u_ionSpeed * 0.09);
  let glint = a3dPow(max(dot(Rv, normalize(aura.u_sunDir)), 0.0), 18.0);
  color = mix(color, color * 0.32 + mirror * (0.095 + 0.42 * fres) + vec3<f32>(0.9, 0.42, 0.12) * glint * 0.4, aura.u_glass);
  color = color * (1.0 - aura.u_glassShadow * (1.0 - gSun) * aura.u_glass);
  let dc = vWorld - aura.u_contact.xyz;
  let t2 = normalize(aura.u_contactDir.xz + vec2<f32>(1e-4, 0.0));
  let cr = length(vec2<f32>(dot(dc.xz, t2) / 3.6, dot(dc.xz, vec2<f32>(-t2.y, t2.x)) / 2.7));
  color = color * (1.0 - aura.u_contact.w * a3dPow(1.0 - smoothstep(0.0, 1.0, cr), 1.5) * step(abs(dc.y), 3.0));
  let bs = s - (floor((s - 22.0) / 44.0 + 0.5) * 44.0 + 22.0);
  let beaconRefl = exp(-bs * bs / 18.0) * exp(-a3dPow((abs(u) - 0.88) / 0.05, 2.0));
  let curbRefl = exp(-a3dPow((abs(u) - 0.88) / 0.06, 2.0)) * (0.55 + 0.45 * fres);
  color = color + (vRoad * beaconRefl * 0.9 + neon * curbRefl * 0.10) * aura.u_neonReflect;
  color = color + mix(vRoad, vec3<f32>(0.22, 0.5, 0.95), 0.85 * aura.u_glass) * seam * 0.12 * aura.u_seams;
  color = color + mix(vec3<f32>(0.10, 0.85, 0.80), vRoad, 0.25) * clamp(vein, 0.0, 1.0) * aura.u_veinHdr * (0.6 + 0.6 * pulse) * aura.u_glass;
  color = color + vec3<f32>(0.10, 0.85, 0.80) * clamp(vein, 0.0, 1.0) * 0.20;
  color = color + vec3<f32>(0.78, 0.88, 0.95) * edgeLine * 0.55 * (1.0 - aura.u_glass);
  color = color + vec3<f32>(0.75, 0.9, 1.0) * dash * 0.28 * (1.0 - aura.u_glass);
  color = color + neon * curb * (0.16 + 0.06 * sin(aura.u_time * 2.0 + s * 0.05));
  return vec4<f32>(applyFog(color, vWorld), 1.0);
}`);

export const SOLID_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct SolidVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> SolidVarying {
  var out: SolidVarying;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.normal = normalize(a3dNormalToWorld(a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SOLID_FRAGMENT_WGSL = stage(COMMON, SHADOW, /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let rim = a3dPow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  let hot = vec3<f32>(1.0, 0.42, 0.08);
  gSun = a3dSunShadowAuto(vWorld, N);
  gWorld = vWorld;
  var color = lit(mix(aura.u_baseColor, hot * 0.8, aura.u_heat * 0.55), N);
  let chaseWave = 0.55 + 0.9 * a3dPow(0.5 + 0.5 * sin(length(vWorld.xz) * 0.35 - aura.u_time * 6.0), 3.0);
  color = color + aura.u_glowColor * aura.u_glow * (0.85 + 0.15 * sin(aura.u_time * 5.0)) * mix(1.0, chaseWave, aura.u_chase);
  color = color + hot * aura.u_heat * (0.35 + rim * 1.4);
  color = color + vec3<f32>(1.0, 0.9, 0.7) * aura.u_flash;
  return vec4<f32>(applyFog(color, vWorld), 1.0);
}`);

export const VEIL_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct VeilVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> VeilVarying {
  var out: VeilVarying;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const VEIL_FRAGMENT_WGSL = stage(/* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = vUv * 2.0 - vec2<f32>(1.0);
  let band = select(
    (1.0 - smoothstep(0.0, 1.0, abs(c.x))) * (0.25 + 0.15 * sin(aura.u_time * 4.0 + c.y * 9.0)),
    (1.0 - smoothstep(0.55, 1.0, max(abs(c.x), abs(c.y)))) * (0.45 + 0.25 * sin(aura.u_time * 6.0 - c.y * 5.0)),
    aura.u_veilMode > 0.5);
  let a = band * (0.5 + aura.u_veilPulse);
  return vec4<f32>(aura.u_veilColor * a, a);
}`);

export const SKY_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) dir: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.dir = normalize(a_position);
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vDir);
  let h = d.y;
  let az = atan2(d.z, d.x);
  let zen = vec3<f32>(0.012, 0.030, 0.090);
  let mid = vec3<f32>(0.022, 0.120, 0.175);
  let hor = vec3<f32>(0.150, 0.420, 0.450);
  var sky = select(mix(hor, vec3<f32>(0.07, 0.20, 0.24), smoothstep(0.0, 0.25, -h)), mix(hor, mix(mid, zen, smoothstep(0.12, 0.8, h)), smoothstep(0.0, 0.34, h)), h > 0.0);
  let sd = normalize(aura.u_sunDir);
  let sunAz = cos(az - atan2(sd.z, sd.x)) * 0.5 + 0.5;
  let bandW = a3dPow(sunAz, 2.2) * (1.0 - smoothstep(0.0, 0.32, h)) * smoothstep(-0.06, 0.02, h);
  let band = mix(aura.u_bandLow, aura.u_bandHigh, smoothstep(0.0, 0.2, h));
  var twSky = mix(vec3<f32>(0.05, 0.16, 0.18), mix(vec3<f32>(0.03, 0.11, 0.15), vec3<f32>(0.01, 0.025, 0.07), smoothstep(0.35, 0.95, h)), smoothstep(0.08, 0.42, h));
  twSky = twSky + band * bandW * 0.95 + vec3<f32>(0.04, 0.06, 0.10) * (1.0 - smoothstep(0.0, 0.22, abs(h)));
  sky = mix(sky, twSky, aura.u_twilight);
  let cl = fbm(vec2<f32>(az * 2.4 + aura.u_time * 0.008, h * 6.0));
  let cmask = smoothstep(0.0, 0.16, h) * (1.0 - smoothstep(0.22, 0.65, h));
  sky = sky + vec3<f32>(0.30, 0.34, 0.44) * a3dPow(smoothstep(0.42, 0.9, cl), 1.4) * cmask * 0.55;
  let c1 = 0.30 + 0.10 * sin(az * 1.6 + 0.8) + 0.04 * sin(az * 5.0);
  let c2 = 0.47 + 0.08 * sin(az * 2.1 + 3.1);
  let r1 = exp(-(((h - c1) / 0.05) * ((h - c1) / 0.05)));
  let r2 = exp(-(((h - c2) / 0.07) * ((h - c2) / 0.07)));
  let tex = 0.40 + 0.60 * fbm(vec2<f32>(az * 7.0, h * 14.0 + aura.u_time * 0.03));
  let aur = (vec3<f32>(0.60, 0.24, 0.85) * r1 * tex * 1.0 + vec3<f32>(0.12, 0.80, 0.68) * r2 * tex * 0.8 + vec3<f32>(0.2, 0.75, 0.65) * r1 * 0.14) * aura.u_auroraGain;
  let pd = normalize(aura.u_planetDir);
  let pr = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), pd));
  let pu = cross(pd, pr);
  let pp = vec2<f32>(dot(d, pr), dot(d, pu)) / (0.17 * aura.u_planetScale);
  let facing = step(0.0, dot(d, pd));
  let disk = (1.0 - smoothstep(0.96, 1.0, length(pp))) * facing;
  let q = mat2x2<f32>(0.94, -0.34, 0.34, 0.94) * pp;
  let ringR = length(vec2<f32>(q.x, q.y * 3.4));
  let ring = (1.0 - smoothstep(0.0, 0.16, abs(ringR - 1.85))) * facing * (1.0 - disk * 0.6);
  let sunP = normalize(vec2<f32>(dot(sd, pr), dot(sd, pu)) + vec2<f32>(1e-4, 0.0));
  let crescent = mix(1.0, 0.25 + 1.4 * smoothstep(-0.2, 0.7, dot(pp, sunP)), aura.u_twilight);
  let ringShadow = mix(1.0, 1.0 - 0.7 * step(q.y, 0.0) * (1.0 - smoothstep(0.7, 1.05, abs(q.x))), aura.u_twilight);
  let pLo = mix(vec3<f32>(0.12, 0.08, 0.22), vec3<f32>(0.14, 0.04, 0.10), aura.u_twilight);
  let pHi = mix(vec3<f32>(0.50, 0.34, 0.52), vec3<f32>(0.62, 0.24, 0.38), aura.u_twilight);
  let ringC = mix(vec3<f32>(0.55, 0.50, 0.62), vec3<f32>(0.78, 0.52, 0.28), aura.u_twilight);
  let planet = mix(pLo, pHi, fbm(pp * 3.0 + vec2<f32>(4.0))) * disk * 0.95 * crescent * (1.0 + 0.45 * aura.u_twilight) + ringC * ring * 0.55 * ringShadow * (1.0 + 0.35 * aura.u_twilight);
  let moonMask = 1.0 - smoothstep(0.022, 0.026, acos(clamp(dot(d, normalize(aura.u_moonDir)), -1.0, 1.0)));
  let sun = a3dPow(max(dot(d, normalize(aura.u_sunDir)), 0.0), 160.0);
  let g = floor(d.xz * 700.0 + vec2<f32>(d.y * 300.0));
  let star = step(0.9988, hash21(g)) * smoothstep(0.1, 0.4, h) * (1.0 - aura.u_twilight * 0.5 * (0.5 + 0.5 * sin(aura.u_time * 3.0 + hash21(g + vec2<f32>(7.0)) * 40.0)));
  let behind = mix(sky + aur, sky * 0.35, disk * aura.u_twilight * 0.85);
  let color = behind + planet + vec3<f32>(1.0, 1.1, 1.5) * moonMask + aura.u_sunColor * sun * 0.3 + vec3<f32>(star) * 0.9 + aura.u_glowColor * 0.08 * (1.0 - abs(h));
  return vec4<f32>(color, 1.0);
}`);

export const TERRAIN_FRAGMENT_WGSL = stage(COMMON, SHADOW, /* wgsl */ `
fn ridged(p0: vec2<f32>) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var p = p0;
  for (var i = 0; i < 3; i = i + 1) { s = s + a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = p * 2.07 + vec2<f32>(11.3); a = a * 0.5; }
  return s * 1.15;
}
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>) -> @location(0) vec4<f32> {
  let N0 = normalize(vNormal);
  let pf = vWorld.xz;
  let flatness = smoothstep(0.35, 0.85, N0.y);
  let pd = mix(vec2<f32>(vWorld.x + vWorld.z, vWorld.y * 1.6), pf, flatness);
  let h0 = ridged(pd * 0.09);
  let dpdx0 = dpdx(vWorld);
  let dpdy0 = dpdy(vWorld);
  let dhx = dpdx(h0);
  let dhy = dpdy(h0);
  let r1 = cross(dpdy0, N0);
  let r2 = cross(N0, dpdx0);
  let det = dot(dpdx0, r1);
  let grad = sign(det) * (dhx * r1 + dhy * r2);
  let bumpK = 5.0 * (1.0 - smoothstep(25.0, 130.0, length(vWorld - aura.u_cameraPosition)));
  let N = normalize(abs(det) * N0 - bumpK * grad);
  let n = fbm(pf * 0.020);
  var rock = mix(vec3<f32>(0.17, 0.21, 0.27), vec3<f32>(0.34, 0.40, 0.47), n) * (0.82 + 0.36 * n);
  rock = rock * (0.72 + 0.56 * h0);
  rock = rock * (0.9 + 0.2 * vnoise(vWorld.xz * 1.9 + vec2<f32>(vWorld.y * 0.7)));
  let snow = smoothstep(0.55, 0.9, N0.y) * smoothstep(aura.u_snowLine, aura.u_snowLine + 90.0, vWorld.y);
  var albedo = mix(rock, vec3<f32>(0.50, 0.56, 0.63), snow * 0.55) * aura.u_terrainTint;
  let strata = 0.5 + 0.5 * sin(vWorld.y * 0.85 + n * 6.0);
  albedo = albedo * (0.9 + 0.1 * strata * (1.0 - N0.y));
  let cavity = smoothstep(0.35, 0.75, h0);
  gSun = a3dSunShadowAuto(vWorld, N);
  gWorld = vWorld;
  var color = lit(albedo, N) * 1.25 * (0.75 + 0.35 * cavity);
  color = color + vec3<f32>(0.04, 0.16, 0.18) * a3dPow(1.0 - clamp(N0.y, 0.0, 1.0), 2.0);
  return vec4<f32>(applyFog(color, vWorld), 1.0);
}`);

/** STREAK_VERTEX and BLOB_VERTEX are the same program (uv through, clip position). */
export const UV_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct UvVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> UvVarying {
  var out: UvVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const STREAK_FRAGMENT_WGSL = stage(POW, /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  let along = a3dPow(sin(3.14159265 * clamp(vUv.y, 0.0, 1.0)), 1.2);
  let a = across * along * aura.u_streakAlpha;
  return vec4<f32>(aura.u_streakColor * a, a);
}`);

export const BLOB_FRAGMENT_WGSL = stage(POW, /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let r = length(vUv * 2.0 - vec2<f32>(1.0));
  let a = mix(1.0 - smoothstep(0.2, 1.0, r), a3dPow(1.0 - smoothstep(0.0, 1.0, r), 1.4), aura.u_blobCore) * aura.u_blobAlpha;
  return vec4<f32>(0.0, 0.0, 0.0, a);
}`);

export const WAKE_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct WakeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
  @location(3) cam: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) wakeAlpha: f32, @location(5) wakeColor: vec3<f32>) -> WakeVarying {
  var out: WakeVarying;
  out.uv = a_uv;
  out.cam = length((aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz - aura.u_cameraPosition);
  out.color = wakeColor;
  out.alpha = wakeAlpha;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const WAKE_FRAGMENT_WGSL = stage(POW, /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>, @location(1) vColor: vec3<f32>, @location(2) vAlpha: f32, @location(3) vCam: f32) -> @location(0) vec4<f32> {
  let across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  let core = a3dPow(across, 0.6) + 1.4 * a3dPow(across, 6.0);
  let a = clamp(core * vAlpha * aura.u_wakeGain, 0.0, 4.0) * smoothstep(3.0, 10.0, vCam);
  return vec4<f32>(vColor * a, min(a, 1.0));
}`);

export const BEACON_VERTEX_WGSL = stage(CLIP, /* wgsl */ `
struct BeaconVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) beacon: vec3<f32>,
  @location(3) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>, @location(3) beaconColor: vec3<f32>) -> BeaconVarying {
  var out: BeaconVarying;
  out.world = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.normal = normalize(a3dNormalToWorld(a_normal));
  out.beacon = beaconColor;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const BEACON_FRAGMENT_WGSL = stage(COMMON, /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vBeacon: vec3<f32>, @location(3) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  gSun = 1.0;
  gWorld = vWorld;
  var color = lit(vec3<f32>(0.08, 0.09, 0.12), N);
  let band = smoothstep(0.62, 0.7, vUv.y);
  color = color + vBeacon * band * aura.u_beaconGlow * (0.8 + 0.2 * sin(aura.u_time * 3.0 + vWorld.x * 0.05));
  return vec4<f32>(applyFog(color, vWorld), 1.0);
}`);
