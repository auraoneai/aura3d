/**
 * A3/W6: WGSL twins of every `material.custom` program in shaders.ts, for `?backend=webgpu`. Each stage is the GLSL line for
 * line, so WebGPU computes the same values; WebGL2 keeps drawing the untouched GLSL (default pixels are unchanged). Authored
 * uniform `foo` reads as `aura.u_foo`, a texture uniform as `u_fooTexture` / `u_fooSampler`.
 *
 * Mapping notes:
 *   - The GLSL adapter wraps `pow` as `pow(max(abs(x), 1e-30), y)`; the twins call `a3dPow` / `a3dPow3` with the same body.
 *   - `atan(y, x)` is `atan2`; `normalMatrix` is `mat3(u_normalMatrix)`; GLSL ternaries are `select`.
 *   - Derivatives (`fwidth`) stay in uniform control flow: every call site is at the top level of `fs_main` or behind a
 *     branch on a uniform value, as in the GLSL.
 *   - The merged batches' `tone` attribute is the geometry's only custom attribute, so it sits at pool location 3.
 *   - `crGateP0/1` and `crGateT0/1` are `mat4` uniforms read by column, the same in both languages.
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
fn a3dPow3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return pow(max(abs(x), vec3<f32>(1e-30)), y); }
`;

/** `SRGB` in shaders.ts. */
const SRGB = /* wgsl */ `
fn srgbToLinear(c: vec3<f32>) -> vec3<f32> {
  return mix(c / 12.92, a3dPow3((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), step(vec3<f32>(0.04045), c));
}
`;

/** `SHOULDER` in shaders.ts. */
const SHOULDER = /* wgsl */ `
fn shoulder(c: vec3<f32>) -> vec3<f32> {
  let k = 0.82;
  let over = max(c - vec3<f32>(k), vec3<f32>(0.0));
  return min(c, vec3<f32>(k)) + (1.0 - k) * (vec3<f32>(1.0) - exp(-over / (1.0 - k)));
}
`;

/** `BAND` in shaders.ts. */
const BAND = /* wgsl */ `
fn band(d: f32, edge: f32) -> f32 {
  let fw = fwidth(d) * 0.5 + 1e-4;
  return smoothstep(edge - fw, edge + fw, d);
}
`;

/** `HAZE` in shaders.ts. */
const HAZE = /* wgsl */ `
fn haze(c: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let d = aura.u_crFogDensity * length(world - aura.u_cameraPosition);
  return mix(c, aura.u_crFogColor, 1.0 - exp(-d * d));
}
`;

function stage(chunks: readonly string[], body: string): string {
  return [MARKER, ...chunks, body].join("\n");
}

/* ------------------------------------------------------------------------------------------------ original look */

/** `TOON_VERTEX` (tone false) or `TOON_TONE_VERTEX` (tone true). */
export function toonVertexWgsl(tone: boolean): string {
  return stage([CLIP], /* wgsl */ `
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

/** `toonFragment(withMap, withTone)`. */
export function toonFragmentWgsl(withMap: boolean, withTone = false): string {
  return stage([POW, SRGB, SHOULDER], /* wgsl */ `
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
  let r1 = ramp(dot(N, L1));
  let r2 = ramp(dot(N, L2));
  let lit = hemi + vec3<f32>(0.65) * r1 + fill * 0.25 * r2;
  return vec4<f32>(shoulder(base * lit) + aura.u_emissive, aura.u_alpha);
}`);
}

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

export const SKY_FRAGMENT_WGSL = stage([POW, SRGB], /* wgsl */ `
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let y = normalize(vWorld - aura.u_cameraPosition).y;
  let t = clamp(0.5 - y * 0.5, 0.0, 1.0);
  let c0 = srgbToLinear(vec3<f32>(0.0902, 0.4510, 0.7529));
  let c1 = srgbToLinear(vec3<f32>(0.2471, 0.6902, 0.9020));
  let c2 = srgbToLinear(vec3<f32>(0.4745, 0.8078, 0.9412));
  let c3 = srgbToLinear(vec3<f32>(0.6627, 0.8784, 0.9686));
  var c = mix(c0, c1, smoothstep(0.0, 0.45, t));
  c = mix(c, c2, smoothstep(0.45, 0.75, t));
  c = mix(c, c3, smoothstep(0.75, 1.0, t));
  return vec4<f32>(c, 1.0);
}`);

export const FLAT_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
}`);

export const FLAT_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(aura.u_baseColor, aura.u_alpha); }`);

export const FLAT_TONE_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
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

export const FLAT_TONE_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTone: vec3<f32>) -> @location(0) vec4<f32> { return vec4<f32>(aura.u_baseColor * vTone, aura.u_alpha); }`);

export const SHADOW_VERTEX_WGSL = stage([CLIP], /* wgsl */ `
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

export const SHADOW_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let d = length(vUv - vec2<f32>(0.5)) * 2.0;
  let a = aura.u_alpha * (1.0 - smoothstep(0.86, 1.0, d));
  return vec4<f32>(aura.u_baseColor, a);
}`);

export const GATE_SHADOW_FRAGMENT_WGSL = stage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let across = abs(vUv.x - 0.5) * 2.0;
  let fw = fwidth(across) + 1e-3;
  let a = aura.u_alpha * (1.0 - smoothstep(0.8 - fw, 0.8 + fw, across)) * (1.0 - 0.3 * vUv.y);
  return vec4<f32>(aura.u_baseColor, a);
}`);

/* ------------------------------------------------------------------------------------------------ carnival look */

const CARNIVAL_VARYING = /* wgsl */ `
struct CarnivalVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vLocal: vec3<f32>,
  @location(3) vUv: vec2<f32>,
  @location(4) vTone: vec3<f32>,
};`;

/** `CARNIVAL_VERTEX` ("plain"), `CARNIVAL_TONE_VERTEX` ("tone") or `CARNIVAL_GATE_VERTEX` ("gate"). The plain stage writes vTone = 1. */
export function carnivalVertexWgsl(kind: "plain" | "tone" | "gate"): string {
  const toneInput = kind === "plain" ? "" : ", @location(3) tone: vec3<f32>";
  const displace = kind === "gate" ? /* wgsl */ `
  let w = a_uv.y * a_uv.y;
  let s = sin(6.2831853 * (aura.u_crWobble.z * aura.u_crWobble.x + a_uv.x));
  let p = a_position + vec3<f32>(aura.u_crWobble.y * w * s, -aura.u_crWobble.y * w * (0.6 + 0.4 * s), 0.0);` : `
  let p = a_position;`;
  return stage([CLIP, CARNIVAL_VARYING], /* wgsl */ `
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, @location(2) a_uv: vec2<f32>${toneInput}) -> CarnivalVarying {
  var out: CarnivalVarying;
  out.vUv = a_uv;
  out.vTone = ${kind === "plain" ? "vec3<f32>(1.0)" : "tone"};${displace}
  out.vLocal = p;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(p, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(p, 1.0));
  return out;
}`);
}

/** `MIRROR` in shaders.ts: `nearestGate`'s inout pair is returned as vec4(colour, best). */
const MIRROR = /* wgsl */ `
fn gateHit(P: vec3<f32>, R: vec3<f32>, g: vec4<f32>) -> f32 {
  if (g.w < 0.5 || abs(R.z) < 1e-4) { return -1.0; }
  let t = (g.y - P.z) / R.z;
  if (t < 0.02) { return -1.0; }
  let H = P + R * t;
  let hx = H.x - g.x;
  let hy = H.y / max(g.z, 1e-3);
  let post = abs(abs(hx) - 0.85) < 0.15 && hy > 0.0 && hy < 1.6;
  let bar = abs(hy - 1.57) < 0.17 && abs(hx) < 1.16;
  return select(-1.0, t, post || bar);
}
fn nearestGate(P: vec3<f32>, R: vec3<f32>, g: vec4<f32>, tone: vec3<f32>, state: vec4<f32>) -> vec4<f32> {
  let t = gateHit(P, R, g);
  if (t > 0.0 && t < state.w) { return vec4<f32>(tone, t); }
  return state;
}
`;

const MIRROR_APPLY = /* wgsl */ `
  if (N.y > 0.5) {
    let Dv = normalize(vWorld - aura.u_cameraPosition);
    var Rm = vec3<f32>(Dv.x, -Dv.y, Dv.z);
    Rm.x = Rm.x + 0.012 * sin(vLocal.z * 3.1 + vLocal.x * 0.7);
    let P = vec3<f32>(vWorld.x, 0.0, vWorld.z);
    var st = vec4<f32>(0.0, 0.0, 0.0, 1e4);
    st = nearestGate(P, Rm, aura.u_crGateP0[0], aura.u_crGateT0[0].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP0[1], aura.u_crGateT0[1].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP0[2], aura.u_crGateT0[2].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP0[3], aura.u_crGateT0[3].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP1[0], aura.u_crGateT1[0].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP1[1], aura.u_crGateT1[1].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP1[2], aura.u_crGateT1[2].rgb, st);
    st = nearestGate(P, Rm, aura.u_crGateP1[3], aura.u_crGateT1[3].rgb, st);
    let oc = P - aura.u_crBall.xyz;
    let bb = dot(oc, Rm);
    let cc = dot(oc, oc) - aura.u_crBall.w * aura.u_crBall.w;
    let disc = bb * bb - cc;
    if (aura.u_crBall.w > 0.0 && disc > 0.0) {
      let t = -bb - sqrt(disc);
      if (t > 0.0 && t < st.w) { st = vec4<f32>(aura.u_crBallTone, t); }
    }
    let mirrorDome = aura.u_crMirror.y * schlick * 2.5;
    c = mix(c, dome * 1.1, clamp(mirrorDome, 0.0, 0.5));
    if (st.w < 1e3) {
      let h = (P + Rm * st.w).y;
      let refl = st.rgb * (aura.u_crSkyFill * 0.9 + aura.u_crSunColor * 0.75 + aura.u_crBounce * 0.4);
      c = mix(c, refl, aura.u_crMirror.x * (1.0 - 0.35 * smoothstep(0.0, aura.u_crMirror.z, h)));
    }
  }
`;

/** `carnivalToonFragment(withMap, withTone, mirror)`. */
export function carnivalToonFragmentWgsl(withMap: boolean, withTone = false, mirror = false): string {
  return stage([POW, SRGB, SHOULDER, BAND, HAZE, mirror ? MIRROR : ""], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vLocal: vec3<f32>, @location(3) vUv: vec2<f32>${withTone ? ", @location(4) vTone: vec3<f32>" : ""}) -> @location(0) vec4<f32> {
  var N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  if (dot(N, V) < 0.0) { N = -N; }
  var base = aura.u_baseColor;
${withTone ? "  base = base * vTone;" : ""}
${withMap ? "  base = base * srgbToLinear(textureSample(u_mapTexture, u_mapSampler, vUv).rgb);" : ""}
  let wet = select(1.0, 1.0 - clamp((vWorld.z - aura.u_crDry.x) / max(aura.u_crDry.y * aura.u_crDry.z, 1e-3), 0.0, 1.0), aura.u_crDry.z > 0.0);
  let deckTop = step(0.001, aura.u_crCanvas.x + aura.u_crCanvas.y) * step(0.5, N.y);
  let centerLane = (1.0 - smoothstep(0.16, 0.44, abs(vUv.x - 0.5))) * deckTop;
  if (aura.u_crCanvas.x + aura.u_crCanvas.y > 0.0) {
    let weave = sin(vLocal.x * 34.0) * sin(vLocal.z * 32.0);
    let streak = sin(vLocal.x * 2.3 + sin(vLocal.z * 0.61) * 2.4 + vLocal.z * 0.17);
    base = base * (1.0 + aura.u_crCanvas.x * weave * (1.0 - 0.55 * centerLane) + aura.u_crCanvas.y * streak);
    N = normalize(N + vec3<f32>(cos(vLocal.x * 34.0) * 0.028, 0.0, cos(vLocal.z * 32.0) * 0.028) * deckTop * (1.0 - 0.7 * centerLane));
    let railShade = max(1.0 - band(vUv.x, 0.085), band(vUv.x, 0.972)) * step(0.5, N.y);
    base = base * (1.0 - 0.3 * railShade);
  }
  let splatMask = step(0.001, aura.u_crDry.z);
  N = normalize(mix(N, vec3<f32>(0.0, 1.0, 0.0), splatMask));
  let duv = vUv - vec2<f32>(0.5);
  let splatRad = length(duv) * 2.0;
  let rimDir = duv / max(length(duv), 1e-3);
  let meniscus = exp(-((splatRad - 0.72) * (splatRad - 0.72)) / 0.032) * wet * splatMask * 0.10;
  let Ns = normalize(N + vec3<f32>(rimDir.x * meniscus, 0.0, -rimDir.y * meniscus));
  let ndv = abs(dot(Ns, V));
  let inkFw = max(fwidth(ndv) * 0.85, 0.02);
  let vividSplat = vec3<f32>(a3dPow(max(base.x, 1e-4), 0.90), a3dPow(max(base.y, 1e-4), 0.90), a3dPow(max(base.z, 1e-4), 0.90)) * 1.10;
  base = mix(base, vividSplat, splatMask);
${!withTone ? /* wgsl */ `
  if (aura.u_crGloss > 0.45) {
    let swirl = 0.5 + 0.5 * sin(vLocal.x * 5.8 + sin(vLocal.y * 5.2 - vLocal.z * 4.4) * 1.85);
    let meridian = 1.0 - smoothstep(0.032, 0.13, abs(vLocal.z));
    let deepLacquer = a3dPow3(max(base, vec3<f32>(1e-4)), vec3<f32>(1.16)) * 0.84;
    let pearlLacquer = mix(base * 1.18, vec3<f32>(1.0, 0.97, 0.94), 0.18);
    base = mix(deepLacquer, pearlLacquer, smoothstep(0.18, 0.82, swirl));
    base = mix(base, mix(base * 1.15, vec3<f32>(1.0, 0.98, 0.95), 0.24), meridian * 0.46);
  }` : ""}
  let d = dot(N, aura.u_crSunDir);
  let lit = band(d, 0.04) * 0.8 + band(d, 0.5) * 0.2;
  let effLit = mix(lit, max(lit, 0.82), splatMask);
  let hemi = mix(aura.u_crGround, aura.u_crSkyFill, 0.5 * N.y + 0.5);
  let bounce = aura.u_crBounce * band(dot(N, normalize(aura.u_crBounceDir)), 0.1);
  var c = base * (hemi + aura.u_crSunColor * effLit + bounce) + base * (0.24 * splatMask);
  let fres = 1.0 - max(dot(Ns, V), 0.0);
  let rimSide = clamp(d + 0.6, 0.0, 1.0);
  c = c + aura.u_crRim * band(fres, aura.u_crRimThreshold) * (0.35 + 0.65 * rimSide);
  let H = normalize(aura.u_crSunDir + V);
  let nh = max(dot(Ns, H), 0.0);
  let effGloss = mix(aura.u_crGloss + centerLane * 0.24, 0.44, splatMask);
  let effShine = mix(aura.u_crShininess, 26.0, splatMask);
  let spec = mix(band(a3dPow(nh, effShine), 0.45), a3dPow(nh, effShine), splatMask);
  let coatPin = a3dPow(nh, effShine * 2.4) * step(0.2, effGloss);
  c = c + aura.u_crSunColor * (spec * effGloss * 1.35 + coatPin * effGloss * 0.45) * wet;
  let R = reflect(-V, Ns);
  let skyWin = band(R.y, 0.3) * (1.0 - band(fres, 0.78));
  let horizonLine = (band(R.y, -0.04) - band(R.y, 0.05)) * band(fres, 0.35);
  let skyRefl = mix(mix(aura.u_crFogColor, aura.u_crEnvRose, 0.6) * 0.75, mix(vec3<f32>(0.78, 0.84, 1.0), aura.u_crEnvTop * 1.6, 0.35) * 0.7, band(R.y, 0.5));
  c = c + (skyRefl * skyWin + aura.u_crFogColor * 0.9 * horizonLine) * effGloss * aura.u_crSkyReflect * wet;
  let schlick = 0.035 + 0.965 * a3dPow(fres, 5.0) * (1.0 - 0.65 * splatMask);
  let dome = mix(aura.u_crFogColor, aura.u_crEnvTop, smoothstep(-0.05, 0.5, R.y));
  let irid = (vec3<f32>(0.5) + 0.5 * cos(6.2831853 * (vec3<f32>(fres * 1.15) + vec3<f32>(0.0, 0.33, 0.67)))) * step(0.45, aura.u_crGloss) * (1.0 - splatMask) * 0.14;
  c = c + dome * schlick * (aura.u_crEnv + centerLane * 0.35) + irid * schlick * wet;
${mirror ? MIRROR_APPLY : ""}
  c = c * (1.0 - aura.u_crContact.y * (1.0 - splatMask) * (1.0 - smoothstep(0.0, aura.u_crContact.x, vWorld.y)));
  let inkMask = step(0.001, aura.u_crInk.w) * (1.0 - splatMask) * (1.0 - smoothstep(aura.u_crInk.w - inkFw, aura.u_crInk.w + inkFw, ndv));
  c = mix(c, aura.u_crInk.rgb, inkMask * 0.88);
  return vec4<f32>(haze(shoulder(c), vWorld) + aura.u_emissive, aura.u_alpha);
}`);
}

export const CARNIVAL_CLOUD_FRAGMENT_WGSL = stage([SHOULDER, BAND, HAZE], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let d = dot(N, aura.u_crSunDir) * 0.7 + N.y * 0.3;
  let c = mix(aura.u_crCloudShadow, aura.u_crCloudTop, band(d, 0.08) * 0.75 + band(d, 0.55) * 0.25) * vTone;
  return vec4<f32>(haze(shoulder(c), vWorld), aura.u_alpha);
}`);

export const CARNIVAL_SKY_FRAGMENT_WGSL = stage([], /* wgsl */ `
fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}
@fragment fn fs_main(@location(0) vWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let dir = normalize(vWorld - aura.u_cameraPosition);
  let u = (dir.y - aura.u_crHorizonY) / (1.0 - aura.u_crHorizonY);
  var c: vec3<f32>;
  if (u < 0.0) {
    c = mix(aura.u_crHorizon, aura.u_crSea, smoothstep(0.0, 0.12, -u));
  } else {
    c = mix(aura.u_crHorizon, aura.u_crRose, smoothstep(0.0, 0.08, u));
    c = mix(c, aura.u_crUpper, smoothstep(0.08, 0.26, u));
    c = mix(c, aura.u_crZenith, smoothstep(0.26, 0.7, u));
  }
  let az = atan2(dir.x, -dir.z);
  let wave = sin(az * 9.0 + sin(az * 3.0) * 1.4) * sin(u * 46.0 + az * 4.0);
  let cirrus = smoothstep(0.62, 0.95, wave) * smoothstep(0.02, 0.1, u) * (1.0 - smoothstep(0.3, 0.55, u)) * aura.u_crCirrus;
  c = mix(c, mix(aura.u_crRose, aura.u_crHorizon, 0.55) * 1.12, cirrus);
  let cell = vec2<f32>(az * 40.0, u * 40.0);
  let id = floor(cell);
  let h = hash12(id);
  let jitter = vec2<f32>(hash12(id + vec2<f32>(17.0)), hash12(id + vec2<f32>(31.0))) * 0.6 + vec2<f32>(0.2);
  let star = step(0.986, h) * (1.0 - smoothstep(0.05, 0.11, length(fract(cell) - jitter))) * smoothstep(0.15, 0.3, u);
  c = c + vec3<f32>(1.0, 0.94, 0.86) * star * aura.u_crStars;
  let ang = degrees(acos(clamp(dot(dir, aura.u_crSunDisc), -1.0, 1.0)));
  c = c + aura.u_crSunColor * 0.55 * exp(-2.5 * ang / aura.u_crSunSize.y);
  let disc = 1.0 - smoothstep(aura.u_crSunSize.x * 0.82, aura.u_crSunSize.x, ang);
  c = mix(c, aura.u_crSunColor * 1.5 + vec3<f32>(0.25), disc);
  return vec4<f32>(c, 1.0);
}`);

export const CARNIVAL_SEA_FRAGMENT_WGSL = stage([HAZE], /* wgsl */ `
fn puff(p: vec2<f32>) -> f32 {
  return 0.5 + 0.25 * sin(p.x) * sin(p.y) + 0.25 * sin(p.x * 2.3 + p.y * 1.7) * sin(p.y * 2.1 - p.x * 0.6);
}
@fragment fn fs_main(@location(1) vWorld: vec3<f32>, @location(2) vLocal: vec3<f32>) -> @location(0) vec4<f32> {
  let p = vLocal.xz * 0.045 + vec2<f32>(0.0, aura.u_crScroll);
  let m = puff(p * 3.0) * 0.65 + puff(p * 7.0 + vec2<f32>(3.1)) * 0.35;
  let c = aura.u_crSea * (0.86 + 0.24 * smoothstep(0.35, 0.75, m));
  return vec4<f32>(haze(c, vWorld), 1.0);
}`);

export const CARNIVAL_CURTAIN_FRAGMENT_WGSL = stage([HAZE], /* wgsl */ `
@fragment fn fs_main(@location(1) vWorld: vec3<f32>, @location(3) vUv: vec2<f32>, @location(4) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let p = (vUv - vec2<f32>(0.5, 0.52)) * vec2<f32>(2.1, 2.0);
  let ripple = 0.5 + 0.5 * sin(vUv.x * 22.0 + sin(vUv.y * 8.0 + aura.u_crTime * 2.8) * 1.4);
  let dripMeniscus = smoothstep(0.58, 1.0, vUv.y) * (0.65 + 0.35 * sin(vUv.x * 18.84955));
  let postRim = smoothstep(0.32, 0.5, abs(vUv.x - 0.5));
  let dCircle = abs(length(p) - 0.44) - 0.055;
  let tp = vec2<f32>(abs(p.x), p.y + 0.14);
  let dTri = abs(max(tp.x * 0.866025 + tp.y * 0.5, -tp.y) - 0.34) - 0.05;
  let sp = abs(p);
  let dSq = abs(max(sp.x, sp.y) - 0.38) - 0.052;
  let dCross = abs(min(max(sp.x - 0.12, sp.y - 0.42), max(sp.x - 0.42, sp.y - 0.12))) - 0.04;
  let lowBlue = step(vTone.b, 0.2);
  let warmGreen = step(0.2, vTone.g);
  let coolCyan = step(vTone.r, vTone.g);
  let dWarm = mix(dCircle, dTri, warmGreen);
  let dCool = mix(dCross, dSq, coolCyan);
  let dMark = mix(dCool, dWarm, lowBlue);
  let mFw = max(fwidth(dMark) * 0.85, 0.012);
  let mark = 1.0 - smoothstep(-mFw, mFw, dMark);
  let scallop = 1.0 - smoothstep(0.93, 0.995, vUv.y + 0.028 * abs(sin(vUv.x * 15.70796)));
  let sheen = mix(vTone, vec3<f32>(1.0), 0.30 * (dripMeniscus + postRim * 0.65) + 0.54 * mark);
  var a = aura.u_alpha * clamp(0.05 + 0.05 * ripple + 0.24 * dripMeniscus + 0.24 * postRim + 0.35 * mark, 0.0, 0.56);
  a = a * smoothstep(0.0, 0.08, vUv.y) * (0.72 + 0.28 * scallop);
  return vec4<f32>(haze(sheen, vWorld), a);
}`);

export const CARNIVAL_INK_FRAGMENT_WGSL = stage([POW, SRGB], /* wgsl */ `
@fragment fn fs_main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
  let f = clamp(floor(aura.u_crFrame), 0.0, 31.0);
  let row = floor(f / 8.0);
  let col = f - row * 8.0;
  let suv = vec2<f32>((col + clamp(vUv.x, 0.02, 0.98)) / 8.0, (row + clamp(1.0 - vUv.y, 0.02, 0.98)) / 4.0);
  let tex = textureSample(u_mapTexture, u_mapSampler, suv);
  let ink = aura.u_baseColor * (1.12 + 0.42 * srgbToLinear(tex.rgb).r);
  return vec4<f32>(ink, tex.a * aura.u_alpha);
}`);
