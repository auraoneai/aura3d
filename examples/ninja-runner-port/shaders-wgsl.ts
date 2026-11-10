/**
 * A3/W6: WGSL twins of every `material.custom` program in shaders.ts, for `?backend=webgpu`. Each stage is the GLSL line for
 * line, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL (default pixels are unchanged). Authored
 * uniform `foo` reads as `aura.u_foo`, a texture uniform as `u_fooTexture` / `u_fooSampler`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` with the same body.
 *   - `atan(y, x)` is `atan2`; `modelViewMatrix` is `u_viewMatrix * u_modelMatrix`; `normalMatrix` is `mat3(u_normalMatrix)`.
 *   - Custom vertex attributes arrive at the geometry's pool locations (`assignCustomAttributeLocations`: names sorted,
 *     locations 3, 5, 6, ...): ground `tone` 3; sparks `seed` 3; flames `aAlive` 3 / `aDistance` 5; particles `aAlpha` 3 /
 *     `aSize` 5 / `tone` 6.
 *   - Point sprites (sparks, spirit flames, particles): WebGPU rasterises a point list as one pixel and has no
 *     `gl_PointSize` / `gl_PointCoord`, so those twins draw one-pixel points with the sprite's centre value (the documented
 *     WebGPU difference).
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

const POW = /* wgsl */ `
fn a3dPow(x: f32, y: f32) -> f32 { return pow(max(abs(x), 1e-30), y); }
`;

/** `NOISE` in shaders.ts. */
const NOISE = /* wgsl */ `
fn hash21(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  var f = fract(p);
  f = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), f.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), f.x), f.y);
}
fn fbm(p0: vec2<f32>) -> f32 {
  var a = 0.5; var s = 0.0; var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s = s + a * vnoise(p); p = p * 2.03 + vec2<f32>(17.1); a = a * 0.5; }
  return s;
}
`;

/** `LIGHT_AND_FOG` in shaders.ts. */
const LIGHT_AND_FOG = /* wgsl */ `
fn shade(albedo: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let sunDir = normalize(vec3<f32>(-40.0, 67.0, 31.0));
  let skyC = vec3<f32>(0.651, 0.831, 0.896);
  let groundC = vec3<f32>(0.216, 0.165, 0.105);
  let hemi = mix(groundC, skyC, N.y * 0.5 + 0.5) * 1.2;
  let sun = vec3<f32>(1.0, 0.768, 0.440) * 3.0 * max(dot(N, sunDir), 0.0);
  return albedo * (hemi + sun) * (1.0 / 3.14159265);
}
fn applyFog(color: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let fogC = mix(vec3<f32>(0.462, 0.578, 0.552), vec3<f32>(0.216, 0.323, 0.246), aura.u_fogMix);
  let near = mix(135.0, 75.0, aura.u_fogMix);
  let far = mix(510.0, 320.0, aura.u_fogMix);
  let f = clamp((length(aura.u_cameraPosition - world) - near) / (far - near), 0.0, 1.0);
  return mix(color, fogC, f);
}
`;

function stage(chunks: readonly string[], body: string): string {
  return [MARKER, ...chunks, body].join("\n");
}

export const GROUND_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct GroundVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vTone: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(3) tone: vec3<f32>) -> GroundVarying {
  var out: GroundVarying;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.vTone = tone;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const GROUND_FRAGMENT_WGSL = stage([POW, NOISE, LIGHT_AND_FOG], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  let n = fbm(vWorld.xz * 0.42);
  let speck = vnoise(vWorld.xz * 3.1);
  let moss = smoothstep(0.54, 0.78, fbm(vWorld.xz * 0.19 + vec2<f32>(3.7, -5.1))) * smoothstep(0.65, 0.95, N.y);
  let base = mix(vTone, vTone * vec3<f32>(0.72, 0.88, 0.68), moss * 0.42);
  let albedo = base * (0.78 + 0.34 * n) * (0.94 + 0.12 * speck);
  let wet = a3dPow(1.0 - max(0.0, dot(N, V)), 3.0) * 0.08 * smoothstep(0.4, 0.9, n);
  return vec4<f32>(applyFog(shade(albedo, N) + vec3<f32>(0.72, 0.82, 0.96) * wet, vWorld), 1.0);
}`);

export const SOLID_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct SolidVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
  @location(1) vNormal: vec3<f32>,
  @location(2) vObject: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> SolidVarying {
  var out: SolidVarying;
  out.vObject = a_position;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SOLID_FRAGMENT_WGSL = stage([NOISE, LIGHT_AND_FOG], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>, @location(1) vNormal: vec3<f32>, @location(2) vObject: vec3<f32>) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  if (dot(N, aura.u_cameraPosition - vWorld) < 0.0) { N = -N; }
  let grain = 0.9 + 0.2 * vnoise(vObject.xz * 7.0 + vec2<f32>(vObject.y * 3.0));
  let lit = shade(aura.u_baseColor * grain, N) + aura.u_glowColor * aura.u_glow;
  return vec4<f32>(applyFog(lit, vWorld), aura.u_solidAlpha);
}`);

export const SKY_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct SkyVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vDir: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> SkyVarying {
  var out: SkyVarying;
  out.vDir = a_position;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SKY_FRAGMENT_WGSL = stage([POW, NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) vDir: vec3<f32>) -> @location(0) vec4<f32> {
  let d = normalize(vDir);
  let up = max(d.y, 0.0);
  var c = mix(aura.u_skyHorizon, aura.u_skyZenith, a3dPow(up, 0.45));
  let q = d.xz / max(0.08, d.y) * 1.2;
  let cl = vnoise(q) + vnoise(q * 2.1) * 0.5 + vnoise(q * 4.5) * 0.2;
  let cloud = smoothstep(0.87, 1.16, cl) * smoothstep(0.02, 0.16, up);
  c = mix(c, aura.u_skyCloud, cloud * 0.80);
  let sd = max(0.0, dot(d, aura.u_sunDirection));
  let s = a3dPow(sd, 700.0);
  c = c + aura.u_skyGlow * s * 1.5;
  c = c + aura.u_skyGlow * a3dPow(sd, 6.0) * aura.u_skyGlowWide * (1.0 - up);
  let above = smoothstep(0.22, 0.4, d.y);
  let sq = floor(d.xz / max(0.2, d.y) * 260.0);
  let star = step(0.9965, hash21(sq)) * (0.55 + 0.45 * hash21(sq + vec2<f32>(7.3)));
  c = c + vec3<f32>(0.85, 0.9, 1.0) * star * aura.u_skyStars * above * (1.0 - cloud);
  let md = max(0.0, dot(d, aura.u_moonDirection));
  c = c + vec3<f32>(0.92, 0.95, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.6 + a3dPow(md, 90.0) * 0.18) * aura.u_skyMoon;
  return vec4<f32>(c, 1.0);
}`);

export const WATER_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct WaterVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vWorld: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> WaterVarying {
  var out: WaterVarying;
  var p = a_position;
  p.y = p.y + sin(p.z * 1.7 + aura.u_waterTime * 1.4) * 0.025 + sin(p.x * 2.6 + p.z * 0.8 - aura.u_waterTime) * 0.025;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(out.vWorld, 1.0));
  return out;
}`);

export const WATER_FRAGMENT_WGSL = stage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let a = sin(vWorld.z * 0.81 + vWorld.x * 0.47 + aura.u_waterTime * 2.0);
  let b = sin(vWorld.x * 1.4 - vWorld.z * 0.68 - aura.u_waterTime * 1.6);
  let n = normalize(vec3<f32>(a * 0.035, 1.0, b * 0.045));
  let v = normalize(aura.u_cameraPosition - vWorld);
  let fres = a3dPow(1.0 - max(0.0, dot(n, v)), 3.0);
  let sun = normalize(mix(vec3<f32>(-0.5, 0.8, 0.3), aura.u_waterKey, aura.u_waterSky));
  let spec = a3dPow(max(0.0, dot(reflect(-sun, n), v)), 160.0);
  let caustic = a3dPow(max(0.0, sin(vWorld.x * 3.0 + a) * sin(vWorld.z * 2.5 + b)), 9.0);
  var col = mix(vec3<f32>(0.022, 0.095, 0.07), vec3<f32>(0.14, 0.28, 0.31), fres);
  col = mix(col, mix(aura.u_waterZenith * 0.35, aura.u_waterHorizon * 0.9, fres), aura.u_waterSky);
  let rip = 0.5 + 0.5 * sin(vWorld.z * 0.37 + vWorld.x * 0.11 + a * 1.6 + aura.u_waterTime * 0.8);
  var lake = mix(vec3<f32>(0.02, 0.09, 0.105), aura.u_waterHorizon * 0.3, fres * 0.35) * (0.92 + 0.12 * rip);
  lake = lake + aura.u_waterHorizon * a3dPow(rip, 18.0) * 0.08;
  col = mix(col, lake, aura.u_waterLake);
  col = col + vec3<f32>(caustic * 0.025 + spec * 0.4);
  return vec4<f32>(col, 0.94);
}`);

export const FALLS_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct FallsVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> FallsVarying {
  var out: FallsVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const FALLS_FRAGMENT_WGSL = stage([POW, NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let q = vec2<f32>(vUv.x * 52.0, vUv.y * 7.0 + aura.u_fallsTime * 2.7);
  let n = vnoise(q) + vnoise(q * 2.13) * 0.35 + vnoise(q * 5.1) * 0.13;
  let veins = a3dPow(vnoise(vec2<f32>(vUv.x * 140.0, vUv.y * 3.0 + aura.u_fallsTime * 1.5)), 2.0);
  let rag = (vnoise(vec2<f32>(vUv.y * 9.0 + aura.u_fallsTime * 1.2, 3.0)) - 0.5) * 0.08 * aura.u_fallsSoft;
  let ew = mix(0.04, 0.16, aura.u_fallsSoft);
  let edge = smoothstep(0.0, ew, vUv.x + rag) * smoothstep(0.0, ew, 1.0 - vUv.x + rag);
  let foot = mix(1.0, smoothstep(0.0, 0.22, vUv.y), aura.u_fallsSoft);
  let lip = aura.u_fallsSoft * smoothstep(0.93, 0.99, vUv.y);
  var c = mix(vec3<f32>(0.24, 0.48, 0.51), vec3<f32>(0.90, 0.97, 0.96), clamp(n * 0.64 + veins * 0.4, 0.0, 1.0));
  c = mix(c, vec3<f32>(0.96, 0.98, 0.97), lip * 0.7 + aura.u_fallsSoft * (1.0 - foot) * 0.5);
  let top = mix(1.0, 1.0 - smoothstep(0.985, 1.0, vUv.y) * 0.6, aura.u_fallsSoft);
  return vec4<f32>(c, edge * top * mix(1.0, 0.35 + 0.65 * foot, aura.u_fallsSoft) * (0.88 + 0.1 * veins));
}`);

/** BALL_VERTEX (shared by the Spiralorb ball and the form aura). */
export const BALL_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct BallVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vP: vec3<f32>,
  @location(1) vN: vec3<f32>,
  @location(2) vV: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>) -> BallVarying {
  var out: BallVarying;
  out.vP = a_position;
  out.vN = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  let mv = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.vV = normalize(-mv.xyz);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * mv);
  return out;
}`);

export const BALL_FRAGMENT_WGSL = stage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vP: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vV: vec3<f32>) -> @location(0) vec4<f32> {
  let bands = sin(atan2(vP.z, vP.x) * 7.0 + vP.y * 37.0 - aura.u_ballTime * 24.0);
  let swirl = a3dPow(0.5 + 0.5 * bands, 5.0);
  let rim = a3dPow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
  let col = mix(vec3<f32>(0.015, 0.23, 1.0), vec3<f32>(0.65, 1.0, 1.0), swirl * 0.85 + rim * 0.4);
  return vec4<f32>(col * (1.2 + swirl), (0.48 + swirl * 0.4 + rim * 0.12) * aura.u_ballOpacity);
}`);

export const AURA_FRAGMENT_WGSL = stage([POW], /* wgsl */ `
@fragment fn fs_main(@location(0) vP: vec3<f32>, @location(1) vN: vec3<f32>, @location(2) vV: vec3<f32>) -> @location(0) vec4<f32> {
  let rim = a3dPow(1.0 - abs(dot(normalize(vN), vV)), 2.4);
  let flame = 0.5 + 0.5 * sin(vP.y * 9.0 - aura.u_auraTime * 7.0 + sin(atan2(vP.z, vP.x) * 5.0 + aura.u_auraTime * 2.0) * 1.7);
  let k = (0.25 + 0.75 * rim) * (0.55 + 0.45 * flame) * aura.u_auraStrength;
  return vec4<f32>(aura.u_auraColor * (0.7 + 0.6 * flame), clamp(k * rim * 1.5 + k * 0.08, 0.0, 1.0));
}`);

/** SPARKS_VERTEX (one-pixel points on WebGPU, see the header). */
export const SPARKS_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
// @aura3d-point-list: one-pixel WebGPU points (no gl_PointSize)
struct SparkVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vAlpha: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) seed: vec3<f32>) -> SparkVarying {
  var out: SparkVarying;
  let a = seed.x * 6.283 + aura.u_sparkTime * 9.0;
  let r = 0.1 + seed.y * 0.24;
  let p = vec3<f32>(cos(a) * r, (seed.z - 0.5) * 0.35, sin(a) * r) + a_position;
  out.vAlpha = (1.0 - seed.y) * aura.u_sparkStrength;
  let mv = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(p, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * mv);
  return out;
}`);

export const SPARKS_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vAlpha: f32) -> @location(0) vec4<f32> {
  // sprite centre: d = 0
  return vec4<f32>(0.3, 0.8, 1.0, vAlpha);
}`);

/** FLAME_VERTEX (one-pixel points on WebGPU). */
export const FLAME_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
// @aura3d-point-list: one-pixel WebGPU points (no gl_PointSize)
struct FlameVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vFade: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) aAlive: f32, @location(5) aDistance: f32) -> FlameVarying {
  var out: FlameVarying;
  let d = aDistance - aura.u_runnerS;
  out.vFade = aAlive * smoothstep(-3.0, 0.0, d) * (1.0 - smoothstep(90.0, 120.0, d));
  var p = a_position;
  p.y = p.y + sin(aura.u_flameTime * 3.0 + aDistance) * 0.12;
  let mv = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(p, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * mv);
  return out;
}`);

export const FLAME_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vFade: f32) -> @location(0) vec4<f32> {
  // sprite centre: gl_PointCoord = (0.5, 0.5)
  let tex = textureSampleLevel(u_flameMapTexture, u_flameMapSampler, vec2<f32>(0.5, 0.5), 0.0);
  let a = tex.a * vFade;
  if (a < 0.02) { discard; }
  return vec4<f32>(tex.rgb, a);
}`);

/** PARTICLE_VERTEX (one-pixel points on WebGPU). */
export const PARTICLE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
// @aura3d-point-list: one-pixel WebGPU points (no gl_PointSize)
struct ParticleVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vColor: vec3<f32>,
  @location(1) vAlpha: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(3) aAlpha: f32, @location(5) aSize: f32, @location(6) tone: vec3<f32>) -> ParticleVarying {
  var out: ParticleVarying;
  out.vColor = tone;
  out.vAlpha = aAlpha;
  let mv = aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * mv);
  return out;
}`);

export const PARTICLE_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vColor: vec3<f32>, @location(1) vAlpha: f32) -> @location(0) vec4<f32> {
  // sprite centre: d = 0
  let a = vAlpha;
  if (a < 0.005) { discard; }
  return vec4<f32>(vColor, a);
}`);

export const SLASH_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct SlashVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> SlashVarying {
  var out: SlashVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const SLASH_FRAGMENT_WGSL = stage([NOISE], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let head = clamp(aura.u_slashProgress * 1.35, 0.0, 1.25);
  let sweep = smoothstep(head - 0.78, head - 0.06, vUv.x) * (1.0 - smoothstep(head - 0.04, head + 0.06, vUv.x));
  let streak = 0.65 + 0.35 * vnoise(vec2<f32>(vUv.x * 14.0 - aura.u_slashTime * 16.0, vUv.y * 5.0));
  let blade = smoothstep(0.24, 0.90, vUv.y) * (1.0 - smoothstep(0.93, 1.0, vUv.y));
  let glint = smoothstep(0.72, 0.94, vUv.y);
  let col = mix(aura.u_slashInk, aura.u_slashEdge * 1.65, glint * 0.85 + 0.15 * streak);
  let alpha = clamp(sweep * blade * streak * (1.15 - aura.u_slashProgress * 0.55), 0.0, 1.0);
  if (alpha < 0.01) { discard; }
  return vec4<f32>(col, alpha);
}`);

export const THREAT_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
struct ThreatVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vUv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> ThreatVarying {
  var out: ThreatVarying;
  out.vUv = a_uv;
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export const THREAT_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let p = (vUv - vec2<f32>(0.5)) * 2.0;
  let r = length(p);
  let ang = atan2(p.y, p.x);
  let brush = 0.78 + 0.22 * sin(ang * 4.0 + aura.u_ringTime * 3.2) * cos(ang * 3.0 - aura.u_ringTime * 1.8);
  let outer = smoothstep(0.68, 0.78, r) * (1.0 - smoothstep(0.88, 0.97, r));
  let inner = smoothstep(0.36, 0.42, r) * (1.0 - smoothstep(0.46, 0.52, r));
  let ticks = step(0.65, cos(ang * 4.0 - aura.u_ringTime * 2.2)) * smoothstep(0.52, 0.58, r) * (1.0 - smoothstep(0.68, 0.74, r));
  let mask = clamp(outer * brush + inner * 0.65 + ticks * 0.75, 0.0, 1.0);
  if (mask < 0.04) { discard; }
  let col = mix(aura.u_inkColor, aura.u_ringColor * (1.05 + 0.55 * aura.u_glow), clamp(outer + ticks * 0.8, 0.0, 1.0));
  return vec4<f32>(col, clamp(mask * (0.68 + 0.28 * aura.u_glow), 0.0, 1.0));
}`);
