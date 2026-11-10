/**
 * Paired GLSL 300 es + WGSL custom shaders for Aura FC 3D (`backend: "auto"` WebGPU + WebGL2 parity).
 *
 * Rules enforced:
 * - Never redeclare `spec.uniforms` in GLSL (Aura3D injects them automatically).
 * - WGSL stages start with `wgslStage(...)` (`/* @aura3d-bindings * /`), access uniforms via `aura.u_<name>`,
 *   sample textures via `u_<name>Texture` + `u_<name>Sampler`, and wrap clip coords in `a3dRasterPosition(...)`.
 */
import type { material } from "@aura3d/engine";
import type { FlipbookAtlasSpec } from "../../../showcase-port-shared/vfx-pack";
import {
  WGSL_CLIP,
  WGSL_COLOR,
  WGSL_ENVIRONMENT_FOG,
  WGSL_INSTANCE_INPUTS,
  WGSL_MATH,
  WGSL_NOISE,
  WGSL_PBR_MICRO,
  wgslStage
} from "../../../showcase-port-shared/wgsl-twins";
import { PITCH_HX } from "./dims";

export type CustomMaterialSpec = Parameters<typeof material.custom>[0];

/** Convert `#rrggbb` sRGB hex string into linear `[r, g, b]` tuple for shader uniforms. */
export function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean;
  const n = parseInt(full, 16);
  const toLin = (v: number): number => {
    const c = ((n >> v) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [toLin(16), toLin(8), toLin(0)];
}

const STANDARD_VERTEX_GLSL = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const STANDARD_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct FcVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> FcVarying {
  var out: FcVarying;
  out.vUv = a_uv;
  out.vWorld = (aura.u_modelMatrix * vec4<f32>(a_position, 1.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_modelViewProjection * vec4<f32>(a_position, 1.0));
  return out;
}`);

export interface PitchTurfShaderOptions {
  readonly pitchHex: string;
  readonly pitchAltHex: string;
  readonly floodHex: string;
  readonly sunDir?: readonly [number, number, number];
  readonly wetness?: number;
}

/**
 * Mowed floodlit grass shader: 10 crisp 6 m mower bands with opposing blade-lean normal anisotropy,
 * subtle organic turf grain, calibrated damp floodlight sheen (zero high-frequency JPEG salt noise),
 * and environment fog integration.
 */
export function pitchTurfShaderSpec(opts: PitchTurfShaderOptions): CustomMaterialSpec {
  const turfA = hexToLinearRgb(opts.pitchHex);
  const turfB = hexToLinearRgb(opts.pitchAltHex);
  const floodCol = hexToLinearRgb(opts.floodHex);
  const sunDir = opts.sunDir ?? [0.56, 0.54, -0.63];
  const wetness = opts.wetness ?? 0.42;
  const stripeWidth = (PITCH_HX * 2) / 10;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float sx = (vWorld.x + ${PITCH_HX.toFixed(1)}) / ${stripeWidth.toFixed(3)};
  float wave = cos(sx * 3.14159265);
  float fw = fwidth(sx) * 1.4 + 0.015;
  float stripe = smoothstep(-fw, fw, wave);

  float macro = vnoise(vWorld.xz * 0.24);
  float blade = vnoise(vWorld.xz * 3.4) * 0.55 + vnoise(vWorld.xz * 7.9 + vec2(4.1, -2.7)) * 0.45;
  float crossMow = smoothstep(-0.35, 0.35, cos((vWorld.z + 18.0) * 0.5235988)) * 0.06;

  float lean = mix(-0.13, 0.13, stripe);
  vec3 N = normalize(vec3(lean + (blade - 0.5) * 0.06, 1.0, (macro - 0.5) * 0.05));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(sunDir);
  vec3 H = normalize(L + V);

  float ndotl = max(dot(N, L), 0.0);
  float ndotv = max(dot(N, V), 0.0);
  float ndoth = max(dot(N, H), 0.0);

  // Damp turf pockets reflect smooth floodlight pools without noisy subpixel sparkles
  float damp = clamp(wetness * (0.62 + 0.38 * smoothstep(0.32, 0.78, macro)), 0.0, 0.85);
  float rough = mix(0.68, 0.31, damp);
  float spec = pow(ndoth, mix(18.0, 68.0, damp)) * mix(0.05, 0.28, damp);
  float sheen = pow(1.0 - ndotv, 3.6) * (0.14 + 0.22 * damp);

  // Subtle stadium corner floodlight vignette across the pitch
  vec2 normPitch = vWorld.xz / vec2(31.0, 19.0);
  float bowlFalloff = 1.0 - 0.14 * clamp(dot(normPitch, normPitch) * 0.45, 0.0, 1.0);

  vec3 base = mix(turfA, turfB, clamp(stripe + crossMow, 0.0, 1.0));
  base *= 0.91 + 0.16 * blade + 0.06 * (macro - 0.5);
  vec3 lit = base * (0.34 + 0.78 * ndotl) * bowlFalloff
           + floodCol * (spec + sheen * 0.48)
           + base * sheen * 0.55;
  outColor = vec4(lit, 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH, WGSL_NOISE, WGSL_PBR_MICRO, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
  @builtin(position) fragCoord: vec4<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _uv = vUv;
  let sx = (vWorld.x + ${PITCH_HX.toFixed(1)}) / ${stripeWidth.toFixed(3)};
  let wave = cos(sx * 3.14159265);
  let fw = fwidth(sx) * 1.4 + 0.015;
  let stripe = smoothstep(-fw, fw, wave);

  let macroNoise = a3dValueNoise2(vWorld.xz * 0.24);
  let blade = a3dValueNoise2(vWorld.xz * 3.4) * 0.55 + a3dValueNoise2(vWorld.xz * 7.9 + vec2<f32>(4.1, -2.7)) * 0.45;
  let crossMow = smoothstep(-0.35, 0.35, cos((vWorld.z + 18.0) * 0.5235988)) * 0.06;

  let lean = mix(-0.13, 0.13, stripe);
  let N = normalize(vec3<f32>(lean + (blade - 0.5) * 0.06, 1.0, (macroNoise - 0.5) * 0.05));
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let L = a3dSafeNormalize3(aura.u_sunDir, vec3<f32>(0.0, 1.0, 0.0));
  let H = a3dSafeNormalize3(L + V, vec3<f32>(0.0, 1.0, 0.0));

  let ndotl = max(dot(N, L), 0.0);
  let ndotv = max(dot(N, V), 0.0);
  let ndoth = max(dot(N, H), 0.0);

  let damp = clamp(aura.u_wetness * (0.62 + 0.38 * smoothstep(0.32, 0.78, macroNoise)), 0.0, 0.85);
  let spec = a3dPow(ndoth, mix(18.0, 68.0, damp)) * mix(0.05, 0.28, damp);
  let sheen = a3dPow(1.0 - ndotv, 3.6) * (0.14 + 0.22 * damp);

  let normPitch = vWorld.xz / vec2<f32>(31.0, 19.0);
  let bowlFalloff = 1.0 - 0.14 * clamp(dot(normPitch, normPitch) * 0.45, 0.0, 1.0);

  var base = mix(aura.u_turfA, aura.u_turfB, clamp(stripe + crossMow, 0.0, 1.0));
  base = base * (0.91 + 0.16 * blade + 0.06 * (macroNoise - 0.5));
  let lit = base * (0.34 + 0.78 * ndotl) * bowlFalloff
          + aura.u_floodCol * (spec + sheen * 0.48)
          + base * sheen * 0.55;
  let fogged = a3dApplyEnvironmentFog(lit, vWorld, fragCoord.xy);
  return vec4<f32>(fogged, 1.0);
}`);

  return {
    glsl: { vertex: STANDARD_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      turfA: { type: "color3", value: turfA },
      turfB: { type: "color3", value: turfB },
      floodCol: { type: "color3", value: floodCol },
      sunDir: { type: "vec3", value: [...sunDir] },
      wetness: { type: "f32", value: wetness }
    },
    fog: true
  };
}

/**
 * Derivative-antialiased hexagonal woven goal-net shader with elastic `goalRipple` (`vec4(hitY, hitZ, amp, phase)`).
 * Replaces opaque solid white drywall net panels with see-through floodlit nylon cordage.
 */
export function goalNetShaderSpec(accentHex = "#d8ff3e"): CustomMaterialSpec {
  const accent = hexToLinearRgb(accentHex);

  const vertexGlsl = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  float amp = goalRipple.z;
  if (amp > 0.001) {
    float dy = w.y - goalRipple.x;
    float dz = w.z - goalRipple.y;
    float d = sqrt(dy * dy + dz * dz);
    float wave = sin(d * 5.2 - goalRipple.w * 18.0) * exp(-d * 0.42) * amp;
    w.x += sign(w.x) * wave * 0.28;
    w.z += wave * 0.08;
  }
  vWorld = w.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

  const vertexWgsl = wgslStage([WGSL_CLIP], /* wgsl */ `
struct NetVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>
) -> NetVarying {
  var out: NetVarying;
  out.vUv = a_uv;
  var w = aura.u_modelMatrix * vec4<f32>(a_position, 1.0);
  let amp = aura.u_goalRipple.z;
  if (amp > 0.001) {
    let dy = w.y - aura.u_goalRipple.x;
    let dz = w.z - aura.u_goalRipple.y;
    let d = sqrt(dy * dy + dz * dz);
    let wave = sin(d * 5.2 - aura.u_goalRipple.w * 18.0) * exp(-d * 0.42) * amp;
    w.x = w.x + sign(w.x) * wave * 0.28;
    w.z = w.z + wave * 0.08;
  }
  out.vWorld = w.xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, a_normal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * w);
  return out;
}`);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
float hexDist(vec2 p) {
  vec2 q = abs(p);
  return max(dot(q, vec2(0.8660254, 0.5)), q.y);
}
void main() {
  vec3 an = abs(normalize(vNormal));
  vec2 planeUv = an.x > 0.6 ? vWorld.zy : (an.y > 0.6 ? vWorld.xz : vWorld.xy);
  vec2 p = planeUv * 8.5;
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  float edge = 0.5 - hexDist(gv);
  float fw = clamp(fwidth(p.x) * 1.15, 0.04, 0.34);
  // Distance fade prevents moire while keeping close-up cords crisp
  float cord = 1.0 - smoothstep(0.055, 0.055 + fw, edge);
  float farBlend = clamp((fw - 0.14) / 0.2, 0.0, 1.0);
  float netMask = mix(cord, 0.22, farBlend * 0.75);

  // Reinforced border tape at frame edges
  float border = 1.0 - smoothstep(0.0, 0.045, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  float mask = max(netMask, border * 0.78);

  vec3 V = normalize(cameraPosition - vWorld);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormal), V)), 2.2);
  float rippleGlow = clamp(goalRipple.z, 0.0, 1.0) * 0.55;
  vec3 cordCol = mix(vec3(0.86, 0.9, 0.95), accentColor, rippleGlow * 0.45) * (0.78 + fresnel * 0.55);
  float alpha = clamp(mask * (0.62 + fresnel * 0.26 + rippleGlow * 0.18), 0.02, 0.88);
  outColor = vec4(cordCol, alpha);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
fn fcHexDist(p: vec2<f32>) -> f32 {
  let q = abs(p);
  return max(dot(q, vec2<f32>(0.8660254, 0.5)), q.y);
}
fn fcMod2(x: vec2<f32>, y: vec2<f32>) -> vec2<f32> {
  return x - y * floor(x / y);
}
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let an = abs(normalize(vNormal));
  var planeUv = vWorld.xy;
  if (an.x > 0.6) {
    planeUv = vWorld.zy;
  } else if (an.y > 0.6) {
    planeUv = vWorld.xz;
  }
  let p = planeUv * 8.5;
  let r = vec2<f32>(1.0, 1.7320508);
  let h = r * 0.5;
  let a = fcMod2(p, r) - h;
  let b = fcMod2(p - h, r) - h;
  let gv = select(b, a, dot(a, a) < dot(b, b));
  let edge = 0.5 - fcHexDist(gv);
  let fw = clamp(fwidth(p.x) * 1.15, 0.04, 0.34);
  let cord = 1.0 - smoothstep(0.055, 0.055 + fw, edge);
  let farBlend = clamp((fw - 0.14) / 0.2, 0.0, 1.0);
  let netMask = mix(cord, 0.22, farBlend * 0.75);

  let border = 1.0 - smoothstep(0.0, 0.045, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  let mask = max(netMask, border * 0.78);

  let V = a3dSafeNormalize3(aura.u_cameraPosition - vWorld, vec3<f32>(0.0, 1.0, 0.0));
  let fresnel = a3dPow(1.0 - abs(dot(normalize(vNormal), V)), 2.2);
  let rippleGlow = clamp(aura.u_goalRipple.z, 0.0, 1.0) * 0.55;
  let cordCol = mix(vec3<f32>(0.86, 0.9, 0.95), aura.u_accentColor, rippleGlow * 0.45) * (0.78 + fresnel * 0.55);
  let alpha = clamp(mask * (0.62 + fresnel * 0.26 + rippleGlow * 0.18), 0.02, 0.88);
  return vec4<f32>(cordCol, alpha);
}`);

  return {
    glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
    wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl },
    uniforms: {
      accentColor: { type: "color3", value: accent },
      goalRipple: { type: "vec4", value: [1.4, 0, 0, 0] }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  };
}

/**
 * Instanced LED perimeter hoarding ribbon shader (`instances.box` compatible: 4 perimeter boards in 1 draw call).
 * Renders dark top/bottom bezel caps, anti-aliased LED dot-matrix grid, scrolling broadcast chevrons, and goal surge.
 */
export function hoardingLedShaderSpec(hoardingHex: string, accentHex: string): CustomMaterialSpec {
  const baseCol = hexToLinearRgb(hoardingHex);
  const accentCol = hexToLinearRgb(accentHex);

  const vertexGlsl = /* glsl */ `
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

  const vertexWgsl = wgslStage([WGSL_CLIP], /* wgsl */ `
struct LedVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_uv: vec2<f32>,
  ${WGSL_INSTANCE_INPUTS}
) -> LedVarying {
  var out: LedVarying;
  out.vUv = a_uv;
  let inst = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let w = aura.u_modelMatrix * inst * vec4<f32>(a_position, 1.0);
  out.vWorld = w.xyz;
  let instNormal = (inst * vec4<f32>(a_normal, 0.0)).xyz;
  out.vNormal = normalize(a3dMat3Mul(aura.u_normalMatrix, instNormal));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * w);
  return out;
}`);

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  // Top & back faces of the hoarding cabinet stay dark brushed aluminium housing
  float isSide = 1.0 - step(0.65, abs(N.y));
  float bezel = smoothstep(0.08, 0.14, vUv.y) * smoothstep(0.92, 0.86, vUv.y) * isSide;

  float along = vWorld.x + vWorld.z;
  float scroll = along * 0.42 - uTime * (1.35 + goalFlash * 4.5);
  float chevron = abs(fract(scroll * 0.25 + (vUv.y - 0.5) * 0.55) - 0.5) * 2.0;
  float ribbonA = smoothstep(0.68, 0.92, chevron);
  float ribbonB = smoothstep(0.78, 0.96, 0.5 + 0.5 * sin(along * 0.28 + uTime * 2.2));
  float segDivider = smoothstep(0.03, 0.08, abs(fract(along * 0.25) - 0.5));

  // LED SMD dot matrix, derivative-clamped so distant boards never alias
  vec2 ledCoord = vec2(along * 26.0, vUv.y * 20.0);
  float ledFw = max(fwidth(ledCoord.x), fwidth(ledCoord.y));
  vec2 cell = fract(ledCoord) - 0.5;
  float dotMask = mix(1.0 - smoothstep(0.28, 0.46, length(cell)), 0.88, clamp(ledFw * 0.85, 0.0, 1.0));

  float goalWave = goalFlash * (0.55 + 0.45 * sin(along * 0.8 - uTime * 16.0));
  float energy = clamp((ribbonA * 0.72 + ribbonB * 0.34 + goalWave) * segDivider, 0.0, 1.4);
  vec3 panel = mix(baseColor * 0.55, accentColor * (1.25 + goalFlash * 0.9), clamp(energy, 0.0, 1.0)) * dotMask;
  vec3 housing = vec3(0.03, 0.045, 0.06);
  outColor = vec4(mix(housing, panel, bezel), 1.0);
}`;

  const fragmentWgsl = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let isSide = 1.0 - step(0.65, abs(N.y));
  let bezel = smoothstep(0.08, 0.14, vUv.y) * smoothstep(0.92, 0.86, vUv.y) * isSide;

  let along = vWorld.x + vWorld.z;
  let scroll = along * 0.42 - aura.u_time * (1.35 + aura.u_goalFlash * 4.5);
  let chevron = abs(fract(scroll * 0.25 + (vUv.y - 0.5) * 0.55) - 0.5) * 2.0;
  let ribbonA = smoothstep(0.68, 0.92, chevron);
  let ribbonB = smoothstep(0.78, 0.96, 0.5 + 0.5 * sin(along * 0.28 + aura.u_time * 2.2));
  let segDivider = smoothstep(0.03, 0.08, abs(fract(along * 0.25) - 0.5));

  let ledCoord = vec2<f32>(along * 26.0, vUv.y * 20.0);
  let ledFw = max(fwidth(ledCoord.x), fwidth(ledCoord.y));
  let cell = fract(ledCoord) - vec2<f32>(0.5);
  let dotMask = mix(1.0 - smoothstep(0.28, 0.46, length(cell)), 0.88, clamp(ledFw * 0.85, 0.0, 1.0));

  let goalWave = aura.u_goalFlash * (0.55 + 0.45 * sin(along * 0.8 - aura.u_time * 16.0));
  let energy = clamp((ribbonA * 0.72 + ribbonB * 0.34 + goalWave) * segDivider, 0.0, 1.4);
  let panel = mix(aura.u_baseColor * 0.55, aura.u_accentColor * (1.25 + aura.u_goalFlash * 0.9), clamp(energy, 0.0, 1.0)) * dotMask;
  let housing = vec3<f32>(0.03, 0.045, 0.06);
  return vec4<f32>(mix(housing, panel, bezel), 1.0);
}`);

  return {
    glsl: { vertex: vertexGlsl, fragment: fragmentGlsl },
    wgsl: { vertex: vertexWgsl, fragment: fragmentWgsl },
    uniforms: {
      baseColor: { type: "color3", value: baseCol },
      accentColor: { type: "color3", value: accentCol },
      goalFlash: { type: "f32", value: 0 }
    }
  };
}

/**
 * Dual-backend 8x4 sprite-sheet flipbook card shader driven by `createFlipbookAtlas("dust" | "sparks")`.
 * `burstState` = `[frameIndex (0..31), opacity (0..1), intensityBoost, 0]`.
 */
export function flipbookCardShaderSpec(atlas: FlipbookAtlasSpec, additive = false): CustomMaterialSpec {
  const cols = atlas.columns;
  const rows = atlas.rows;

  const fragmentGlsl = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
out vec4 outColor;
vec3 srgbToLin(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  float fi = clamp(floor(burstState.x), 0.0, ${(cols * rows - 1).toFixed(1)});
  float col = mod(fi, ${cols.toFixed(1)});
  float row = floor(fi / ${cols.toFixed(1)});
  vec2 cellUv = (vec2(col, row) + clamp(vUv, 0.02, 0.98)) / vec2(${cols.toFixed(1)}, ${rows.toFixed(1)});
  vec4 tex = texture(sheet, cellUv);
  float a = tex.a * clamp(burstState.y, 0.0, 1.0);
  vec3 rgb = srgbToLin(tex.rgb) * max(burstState.z, 0.5);
  outColor = vec4(rgb, a);
}`;

  const fragmentWgsl = wgslStage([WGSL_COLOR], /* wgsl */ `
@fragment fn fs_main(
  @location(0) vNormal: vec3<f32>,
  @location(1) vWorld: vec3<f32>,
  @location(2) vUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let _n = vNormal;
  let _w = vWorld;
  let fi = clamp(floor(aura.u_burstState.x), 0.0, ${(cols * rows - 1).toFixed(1)});
  let col = fi - ${cols.toFixed(1)} * floor(fi / ${cols.toFixed(1)});
  let row = floor(fi / ${cols.toFixed(1)});
  let cellUv = (vec2<f32>(col, row) + clamp(vUv, vec2<f32>(0.02), vec2<f32>(0.98))) / vec2<f32>(${cols.toFixed(1)}, ${rows.toFixed(1)});
  let tex = textureSample(u_sheetTexture, u_sheetSampler, cellUv);
  let a = tex.a * clamp(aura.u_burstState.y, 0.0, 1.0);
  let rgb = a3dSrgbToLinear(tex.rgb) * max(aura.u_burstState.z, 0.5);
  return vec4<f32>(rgb, a);
}`);

  return {
    glsl: { vertex: STANDARD_VERTEX_GLSL, fragment: fragmentGlsl },
    wgsl: { vertex: STANDARD_VERTEX_WGSL, fragment: fragmentWgsl },
    uniforms: {
      sheet: { type: "texture2d", value: atlas.texture },
      burstState: { type: "vec4", value: [0, 0, 1.2, 0] }
    },
    transparent: true,
    depthWrite: false,
    blending: additive ? "additive" : "normal",
    side: "double"
  };
}
