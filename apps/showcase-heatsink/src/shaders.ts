/**
 * Thermal Drift custom materials (GU47 WP-13 HS-15): the molten shader of the slag gutters and the lava pool, and the
 * wall chevrons that follow the core heat. Both are `material.custom` programs on instanced nodes (the vertex stage
 * reads `instanceMatrix`, so every instance draws in one call) whose only per-frame input is a uniform written with
 * `handle.setUniform` (`u_time` is the engine's built-in), so no program compiles once a circuit is mounted. Scene fog
 * applies (`fog: true`).
 *
 * The world scrolls past the camera (track.ts), so the patterns are computed in instance-local metres
 * (`mat3(instanceMatrix) * position`): the veins stick to their gutter instead of standing still in view space while the
 * gutter slides through them.
 *
 * Reduced motion: the molten flow, boil and pulse slow to 30% (secondary motion, PRD §6.3) and the chevron scan stops;
 * the chevron heat response is a brightness, not a motion, and stays. Reduced flash: the pulse is a +-12% brightness
 * swing at under 0.5 Hz (no flash). Low tier: the same program (the gutters cover a few percent of the frame).
 */
import { material, type AuraMaterialSpec, type AuraTextureRef } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_ENVIRONMENT_FOG, WGSL_INSTANCE_INPUTS, WGSL_MATH, wgslStage } from "../../showcase-port-shared/wgsl-twins";

/** Chevron brightness gain at full heat response: +25% at 90% core heat (HS-15 acceptance). */
export const CHEVRON_HEAT_GAIN = 0.25;
/** Core heat (0..1) where the chevron response starts and where it reaches its full gain. */
export const CHEVRON_HEAT_RANGE: readonly [number, number] = [0.5, 0.9];
/** Molten flow speed (pattern units per second) and its reduced-motion share. */
export const MOLTEN_FLOW = 0.8;
export const REDUCED_MOTION_FLOW_SHARE = 0.3;
/** `u_time` wraps here before it scales the noise, so the hash never sees large arguments (one seam every 20 minutes). */
export const MOLTEN_TIME_WRAP = 1200;

const INSTANCED_VERTEX_GLSL = `out vec3 vTdLocal;
out vec3 vTdNormal;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vTdLocal = mat3(modelMatrix) * (mat3(instanceMatrix) * position);
  vTdNormal = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/** Molten slag: a dark crust cracked by flowing, boiling veins (instance-local fbm scrolled along -Z by `u_flow`). */
export const MOLTEN_FRAGMENT_GLSL = `in vec3 vTdLocal;
in vec3 vTdNormal;
out vec4 outColor;
float tdHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float tdNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tdHash(i), tdHash(i + vec2(1.0, 0.0)), u.x), mix(tdHash(i + vec2(0.0, 1.0)), tdHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tdFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * tdNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  float t = mod(u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * u_flow;
  vec2 p = vTdLocal.xz * vec2(0.9, 0.35) + vec2(0.0, t);
  float veins = tdFbm(p + vec2(tdFbm(p * 1.7 - t * 0.3), 0.0));
  veins += 0.08 * (tdNoise(vTdLocal.xz * 4.0 + vec2(t * 5.0, -t * 3.0)) - 0.5);
  float molten = smoothstep(0.42, 0.68, veins);
  float pulse = 0.88 + 0.12 * sin(t * 3.5 + vTdLocal.z * 0.25);
  vec3 color = mix(u_crust, u_hot * u_glow * pulse, molten);
  color += u_hot * 0.06 * max(0.0, vTdNormal.y);
  outColor = vec4(color, 1.0);
}`;

/** Heat chevron: an emissive bar whose brightness follows the core heat uniform, with a soft scan along its length. */
export const CHEVRON_FRAGMENT_GLSL = `in vec3 vTdLocal;
in vec3 vTdNormal;
out vec4 outColor;
void main() {
  float response = smoothstep(${CHEVRON_HEAT_RANGE[0].toFixed(2)}, ${CHEVRON_HEAT_RANGE[1].toFixed(2)}, u_heat);
  float gain = 1.0 + ${CHEVRON_HEAT_GAIN.toFixed(2)} * response;
  float scan = 0.92 + 0.08 * sin(vTdLocal.z * 0.6 - mod(u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * 3.0 * u_motion);
  outColor = vec4(u_color * u_intensity * gain * scan, 1.0);
}`;

/*
 * A3/W6: WGSL twins of the four programs for the WebGPU backend. WebGL2 keeps drawing the GLSL above (same pixels as
 * before); each twin is the GLSL line for line. `fog: true` wraps only the GLSL stage (at the reconstructed world
 * position), so the fogged twins carry the world position as a varying and apply the same scene fog themselves.
 */
const INSTANCED_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct TdVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> TdVarying {
  var out: TdVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0);
  out.local = a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_position));
  out.normal = normalize(a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_normal)));
  out.world = world.xyz;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const MOLTEN_FRAGMENT_WGSL = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
fn tdHash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(41.3, 289.1))) * 43758.5453); }
fn tdNoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
  return mix(mix(tdHash(i), tdHash(i + vec2<f32>(1.0, 0.0)), u.x), mix(tdHash(i + vec2<f32>(0.0, 1.0)), tdHash(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}
fn tdFbm(p0: vec2<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { v = v + a * tdNoise(p); p = p * 2.03 + vec2<f32>(1.7, 9.2); a = a * 0.5; }
  return v;
}
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vTdLocal: vec3<f32>, @location(1) vTdNormal: vec3<f32>, @location(2) vTdWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let t = a3dModF(aura.u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * aura.u_flow;
  let p = vTdLocal.xz * vec2<f32>(0.9, 0.35) + vec2<f32>(0.0, t);
  var veins = tdFbm(p + vec2<f32>(tdFbm(p * 1.7 - vec2<f32>(t * 0.3)), 0.0));
  veins = veins + 0.08 * (tdNoise(vTdLocal.xz * 4.0 + vec2<f32>(t * 5.0, -t * 3.0)) - 0.5);
  let molten = smoothstep(0.42, 0.68, veins);
  let pulse = 0.88 + 0.12 * sin(t * 3.5 + vTdLocal.z * 0.25);
  var color = mix(aura.u_crust, aura.u_hot * aura.u_glow * pulse, vec3<f32>(molten));
  color = color + aura.u_hot * 0.06 * max(0.0, vTdNormal.y);
  return vec4<f32>(a3dApplyEnvironmentFog(color, vTdWorld, fragCoord.xy), 1.0);
}`);

const CHEVRON_FRAGMENT_WGSL = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vTdLocal: vec3<f32>, @location(1) vTdNormal: vec3<f32>, @location(2) vTdWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let response = smoothstep(${CHEVRON_HEAT_RANGE[0].toFixed(2)}, ${CHEVRON_HEAT_RANGE[1].toFixed(2)}, aura.u_heat);
  let gain = 1.0 + ${CHEVRON_HEAT_GAIN.toFixed(2)} * response;
  let scan = 0.92 + 0.08 * sin(vTdLocal.z * 0.6 - a3dModF(aura.u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * 3.0 * aura.u_motion);
  return vec4<f32>(a3dApplyEnvironmentFog(aura.u_color * aura.u_intensity * gain * scan, vTdWorld, fragCoord.xy), 1.0);
}`);

/** Linear RGB of a "#rrggbb" colour. */
export function linearRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** CPU mirror of the chevron gain (unit-tested against the acceptance: +25% at 90% heat). */
export function chevronHeatGain(heat01: number): number {
  const [a, b] = CHEVRON_HEAT_RANGE;
  const x = Math.min(1, Math.max(0, (heat01 - a) / (b - a)));
  return 1 + CHEVRON_HEAT_GAIN * x * x * (3 - 2 * x);
}

/** Molten flow speed: 30% on reduced motion (secondary motion), full otherwise. */
export function moltenFlow(reducedMotion: boolean, base = MOLTEN_FLOW): number {
  return reducedMotion ? base * REDUCED_MOTION_FLOW_SHARE : base;
}

/** Molten material: crust from the oxidised-iron end of the palette, veins in the circuit's hot colour. */
export function moltenMaterial(options: { readonly hot: string; readonly crust: string; readonly glow: number; readonly reducedMotion?: boolean }): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: INSTANCED_VERTEX_GLSL, fragment: MOLTEN_FRAGMENT_GLSL },
    wgsl: { vertex: INSTANCED_VERTEX_WGSL, fragment: MOLTEN_FRAGMENT_WGSL },
    uniforms: {
      u_hot: { type: "vec3", value: linearRgb(options.hot) },
      u_crust: { type: "vec3", value: linearRgb(options.crust) },
      u_glow: { type: "f32", value: options.glow },
      u_flow: { type: "f32", value: moltenFlow(options.reducedMotion === true) }
    },
    fog: true
  });
}

/** The chevron heat uniform (written every frame the quantised core heat changes). */
export const CHEVRON_HEAT_UNIFORM = "u_heat";

/** Wall chevron material: emissive colour times intensity, brightened by `u_heat`; the scan stops on reduced motion. */
export function chevronHeatMaterial(color: string, intensity: number, reducedMotion = false): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: INSTANCED_VERTEX_GLSL, fragment: CHEVRON_FRAGMENT_GLSL },
    wgsl: { vertex: INSTANCED_VERTEX_WGSL, fragment: CHEVRON_FRAGMENT_WGSL },
    uniforms: {
      u_color: { type: "vec3", value: linearRgb(color) },
      u_intensity: { type: "f32", value: intensity },
      [CHEVRON_HEAT_UNIFORM]: { type: "f32", value: 0 },
      u_motion: { type: "f32", value: reducedMotion ? 0 : 1 }
    },
    fog: true
  });
}

/** Quantise the core heat to 1/256 so the uniform is written only when it visibly changes. */
export function quantisedHeat(heat01: number): number {
  return Math.round(Math.min(1, Math.max(0, heat01)) * 256) / 256;
}

/**
 * GU47 phase 3 skyline facades (HS-04 presentation): the blind panel read the flat skyline boxes as featureless black
 * blocks. Each instanced block now draws lit window bays on its sides (a per-block hashed grid in object-space metres, so
 * a block keeps its pattern and blocks of the same size differ), a soot body that darkens upwards, and a warm foundry glow
 * rising from its foot. Unlit (the skyline is far and unshadowed), fogged with the scene, one instanced draw per layer.
 */
const SKYLINE_VERTEX_GLSL = `out vec3 vTdBox;
out vec3 vTdN;
out vec2 vTdSeed;
out vec3 vTdWorld;
void main() {
  vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vTdBox = position * s + vec3(0.0, 0.5 * s.y, 0.0);
  vTdN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vTdSeed = instanceMatrix[3].xz;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vTdWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const SKYLINE_FRAGMENT_GLSL = `in vec3 vTdBox;
in vec3 vTdN;
in vec2 vTdSeed;
in vec3 vTdWorld;
out vec4 outColor;
float tdCellHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 n = normalize(vTdN);
  vec3 V = normalize(cameraPosition - vTdWorld);
  float v = vTdBox.y;
  float hNorm = smoothstep(0.0, 110.0, v);
  vec3 body = u_body * mix(0.85, 1.35, hNorm);
  float fresnel = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 2.6);
  vec3 glassSheen = u_skySheen * fresnel * (0.25 + 0.75 * hNorm);
  vec3 color = body + glassSheen + u_foot * exp(-v / 15.0);
  if (abs(n.y) < 0.5) {
    float u = abs(n.z) > 0.5 ? vTdBox.x : vTdBox.z;
    vec2 cell = vec2(u / u_cell.x, (v - 2.0) / u_cell.y);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float mullion = (1.0 - step(0.08, f.x) * step(f.x, 0.92)) + (1.0 - step(0.12, f.y) * step(f.y, 0.88));
    color *= 1.0 - 0.32 * clamp(mullion, 0.0, 1.0);
    float pane = step(0.14, f.x) * step(f.x, 0.86) * step(0.20, f.y) * step(f.y, 0.82) * step(0.0, cell.y);
    float floorBand = step(0.76, tdCellHash(vec2(id.y * 0.71, vTdSeed.x * 0.19 + vTdSeed.y * 0.13)));
    float pick = tdCellHash(id + vTdSeed * 0.173 + n.xz * 7.1);
    float lit = max(step(1.0 - u_lit, pick), floorBand * step(0.35, pick));
    float tone = tdCellHash(id.yx * 1.7 + vTdSeed * 0.311);
    float interiorGrad = 0.55 + 0.45 * smoothstep(0.2, 0.82, f.y);
    vec3 window = mix(u_window, u_window2, tone) * u_glow * interiorGrad * (0.55 + 0.45 * fract(pick * 13.0));
    color += window * pane * lit;
    float crown = smoothstep(52.0, 96.0, v) * step(0.92, fract(v / 32.0)) * step(0.82, abs(fract(u / 18.0) - 0.5) * 2.0);
    color += vec3(2.6, 0.28, 0.12) * crown;
  } else {
    color *= 0.52;
  }
  outColor = vec4(color, 1.0);
}`;

/** A3/W6: WGSL twin of the skyline facade (see the note above `INSTANCED_VERTEX_WGSL`). */
const SKYLINE_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct SkylineVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) box: vec3<f32>,
  @location(1) n: vec3<f32>,
  @location(2) seed: vec2<f32>,
  @location(3) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> SkylineVarying {
  var out: SkylineVarying;
  let s = vec3<f32>(length(a_instanceMatrix0.xyz), length(a_instanceMatrix1.xyz), length(a_instanceMatrix2.xyz));
  out.box = a_position * s + vec3<f32>(0.0, 0.5 * s.y, 0.0);
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  out.n = normalize(a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_normal)));
  out.seed = a_instanceMatrix3.xz;
  let world = aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0);
  out.world = world.xyz;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const SKYLINE_FRAGMENT_WGSL = wgslStage([WGSL_MATH, WGSL_ENVIRONMENT_FOG], /* wgsl */ `
fn tdCellHash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453); }
@fragment fn fs_main(@builtin(position) fragCoord: vec4<f32>, @location(0) vTdBox: vec3<f32>, @location(1) vTdN: vec3<f32>, @location(2) vTdSeed: vec2<f32>, @location(3) vTdWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let n = normalize(vTdN);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vTdWorld, vec3<f32>(0.0, 0.0, 1.0));
  let v = vTdBox.y;
  let hNorm = smoothstep(0.0, 110.0, v);
  let body = aura.u_body * mix(0.85, 1.35, hNorm);
  let fresnel = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 2.6);
  let glassSheen = aura.u_skySheen * fresnel * (0.25 + 0.75 * hNorm);
  var color = body + glassSheen + aura.u_foot * exp(-v / 15.0);
  if (abs(n.y) < 0.5) {
    let u = select(vTdBox.z, vTdBox.x, abs(n.z) > 0.5);
    let cell = vec2<f32>(u / aura.u_cell.x, (v - 2.0) / aura.u_cell.y);
    let id = floor(cell);
    let f = fract(cell);
    let mullion = (1.0 - step(0.08, f.x) * step(f.x, 0.92)) + (1.0 - step(0.12, f.y) * step(f.y, 0.88));
    color = color * (1.0 - 0.32 * clamp(mullion, 0.0, 1.0));
    let pane = step(0.14, f.x) * step(f.x, 0.86) * step(0.20, f.y) * step(f.y, 0.82) * step(0.0, cell.y);
    let floorBand = step(0.76, tdCellHash(vec2<f32>(id.y * 0.71, vTdSeed.x * 0.19 + vTdSeed.y * 0.13)));
    let pick = tdCellHash(id + vTdSeed * 0.173 + n.xz * 7.1);
    let lit = max(step(1.0 - aura.u_lit, pick), floorBand * step(0.35, pick));
    let tone = tdCellHash(id.yx * 1.7 + vTdSeed * 0.311);
    let interiorGrad = 0.55 + 0.45 * smoothstep(0.2, 0.82, f.y);
    let window = mix(aura.u_window, aura.u_window2, vec3<f32>(tone)) * aura.u_glow * interiorGrad * (0.55 + 0.45 * fract(pick * 13.0));
    color = color + window * pane * lit;
    let crown = smoothstep(52.0, 96.0, v) * step(0.92, fract(v / 32.0)) * step(0.82, abs(fract(u / 18.0) - 0.5) * 2.0);
    color = color + vec3<f32>(2.6, 0.28, 0.12) * crown;
  } else {
    color = color * 0.52;
  }
  return vec4<f32>(a3dApplyEnvironmentFog(color, vTdWorld, fragCoord.xy), 1.0);
}`);

export interface SkylineFacadeOptions {
  readonly body: string;
  readonly foot: string;
  readonly window: string;
  readonly window2: string;
  /** Window bay size in metres [width, storey height]. */
  readonly cell: readonly [number, number];
  /** Share of bays lit (0..1). */
  readonly lit: number;
  /** HDR window brightness. */
  readonly glow: number;
  /** Optional night-sky curtain-wall reflection tint. */
  readonly skySheen?: string;
}

export function skylineFacadeMaterial(o: SkylineFacadeOptions): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: SKYLINE_VERTEX_GLSL, fragment: SKYLINE_FRAGMENT_GLSL },
    wgsl: { vertex: SKYLINE_VERTEX_WGSL, fragment: SKYLINE_FRAGMENT_WGSL },
    uniforms: {
      u_body: { type: "vec3", value: linearRgb(o.body) },
      u_foot: { type: "vec3", value: linearRgb(o.foot) },
      u_window: { type: "vec3", value: linearRgb(o.window) },
      u_window2: { type: "vec3", value: linearRgb(o.window2) },
      u_skySheen: { type: "vec3", value: linearRgb(o.skySheen ?? "#2c4268") },
      u_cell: { type: "vec2", value: [o.cell[0], o.cell[1]] },
      u_lit: { type: "f32", value: o.lit },
      u_glow: { type: "f32", value: o.glow }
    },
    fog: true
  });
}

/**
 * Dual additive Fresnel Mach-cone plasma thruster plumes (WP-07): shifts dynamically from cool ion cyan (`#38bdf8`)
 * at nominal heat -> overdrive amber (`#fb923c`) -> critical white-hot (`#fff7ed`) near core meltdown, with standing
 * shock-diamond rings along the jet axis. Drawn for all drones in 1 instanced draw call.
 */
export const THRUSTER_HEAT_UNIFORM = "u_heat";
export const THRUSTER_BOOST_UNIFORM = "u_boost";

const THRUSTER_VERTEX_GLSL = `out vec3 vPlumePos;
out vec3 vPlumeNormal;
out vec3 vPlumeWorld;
void main() {
  vPlumePos = position;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vPlumeWorld = world.xyz;
  vPlumeNormal = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const THRUSTER_FRAGMENT_GLSL = `in vec3 vPlumePos;
in vec3 vPlumeNormal;
in vec3 vPlumeWorld;
out vec4 outColor;
void main() {
  vec3 N = normalize(vPlumeNormal);
  vec3 V = normalize(cameraPosition - vPlumeWorld);
  float facing = pow(clamp(abs(dot(N, V)), 0.0, 1.0), 1.35);
  float along = clamp((vPlumePos.y + u_halfLen) / max(u_halfLen * 2.0, 1e-4), 0.0, 1.0);
  float t = mod(u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * u_motion;
  float diamonds = 0.62 + 0.38 * cos(along * 20.0 - t * 28.0);
  float env = (1.0 - smoothstep(0.12, 1.0, along)) * smoothstep(0.0, 0.08, along);
  float heatMix = clamp(u_heat + u_boost * 0.28, 0.0, 1.0);
  vec3 nominal = vec3(0.04, 0.52, 0.95);
  vec3 hot = vec3(0.96, 0.30, 0.05);
  vec3 crit = vec3(1.0, 0.92, 0.80);
  vec3 base = mix(nominal, hot, smoothstep(0.18, 0.68, heatMix));
  vec3 tint = mix(base, crit, smoothstep(0.72, 0.98, heatMix));
  float gain = (3.4 + 3.2 * u_boost + 2.4 * u_heat) * diamonds;
  float alpha = clamp(facing * env * (0.78 + 0.22 * u_boost), 0.0, 1.0);
  outColor = vec4(tint * gain * alpha, alpha);
}`;

const THRUSTER_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct PlumeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) pos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) world: vec3<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(1) a_normal: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> PlumeVarying {
  var out: PlumeVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let world = aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0);
  out.pos = a_position;
  out.world = world.xyz;
  out.normal = normalize(a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_normal)));
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * world);
  return out;
}`);

const THRUSTER_FRAGMENT_WGSL = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vPlumePos: vec3<f32>, @location(1) vPlumeNormal: vec3<f32>, @location(2) vPlumeWorld: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vPlumeNormal);
  let V = a3dSafeNormalize3(aura.u_cameraPosition - vPlumeWorld, vec3<f32>(0.0, 0.0, 1.0));
  let facing = pow(clamp(abs(dot(N, V)), 0.0, 1.0), 1.35);
  let along = clamp((vPlumePos.y + aura.u_halfLen) / max(aura.u_halfLen * 2.0, 1e-4), 0.0, 1.0);
  let t = a3dModF(aura.u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * aura.u_motion;
  let diamonds = 0.62 + 0.38 * cos(along * 20.0 - t * 28.0);
  let env = (1.0 - smoothstep(0.12, 1.0, along)) * smoothstep(0.0, 0.08, along);
  let heatMix = clamp(aura.u_heat + aura.u_boost * 0.28, 0.0, 1.0);
  let nominal = vec3<f32>(0.04, 0.52, 0.95);
  let hot = vec3<f32>(0.96, 0.30, 0.05);
  let crit = vec3<f32>(1.0, 0.92, 0.80);
  let base = mix(nominal, hot, vec3<f32>(smoothstep(0.18, 0.68, heatMix)));
  let tint = mix(base, crit, vec3<f32>(smoothstep(0.72, 0.98, heatMix)));
  let gain = (3.4 + 3.2 * aura.u_boost + 2.4 * aura.u_heat) * diamonds;
  let alpha = clamp(facing * env * (0.78 + 0.22 * aura.u_boost), 0.0, 1.0);
  return vec4<f32>(tint * gain * alpha, alpha);
}`);

export function thrusterPlumeMaterial(halfLength: number, reducedMotion = false): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: THRUSTER_VERTEX_GLSL, fragment: THRUSTER_FRAGMENT_GLSL },
    wgsl: { vertex: THRUSTER_VERTEX_WGSL, fragment: THRUSTER_FRAGMENT_WGSL },
    uniforms: {
      u_halfLen: { type: "f32", value: halfLength },
      [THRUSTER_HEAT_UNIFORM]: { type: "f32", value: 0.25 },
      [THRUSTER_BOOST_UNIFORM]: { type: "f32", value: 0 },
      u_motion: { type: "f32", value: reducedMotion ? 0 : 1 }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  });
}

/**
 * Translucent RPM-driven quadcopter rotor-blur disc (WP-07): concentric shroud ring + 3-blade motion sweep on flat
 * instanced boxes, giving hovering drones visible lift and kinetic rotor spin in 1 instanced draw call.
 */
const ROTOR_VERTEX_GLSL = `out vec2 vRotorDisc;
void main() {
  vRotorDisc = position.xz / max(u_radius, 1e-4);
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix * vec4(position, 1.0));
}`;

export const ROTOR_FRAGMENT_GLSL = `in vec2 vRotorDisc;
out vec4 outColor;
void main() {
  float r = length(vRotorDisc);
  if (r > 1.0) discard;
  float ang = atan(vRotorDisc.y, vRotorDisc.x);
  float spin = mod(u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * 34.0 * u_motion;
  float blades = 0.38 + 0.62 * pow(0.5 + 0.5 * cos(ang * 3.0 + spin), 2.0);
  float ring = smoothstep(0.80, 0.92, r) * (1.0 - smoothstep(0.94, 1.0, r));
  float hub = 1.0 - smoothstep(0.0, 0.22, r);
  float body = smoothstep(0.18, 0.34, r) * (1.0 - smoothstep(0.76, 0.96, r)) * blades;
  vec3 tint = mix(vec3(0.22, 0.78, 0.98), vec3(1.0, 0.48, 0.16), clamp(u_heat, 0.0, 1.0));
  float alpha = clamp(body * 0.24 + ring * 0.55 + hub * 0.35, 0.0, 0.72);
  outColor = vec4(tint * (1.2 + ring * 1.4), alpha);
}`;

const ROTOR_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct RotorVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) disc: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> RotorVarying {
  var out: RotorVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  out.disc = a_position.xz / max(aura.u_radius, 1e-4);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * (aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0)));
  return out;
}`);

const ROTOR_FRAGMENT_WGSL = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vRotorDisc: vec2<f32>) -> @location(0) vec4<f32> {
  let r = length(vRotorDisc);
  if (r > 1.0) { discard; }
  let ang = atan2(vRotorDisc.y, vRotorDisc.x);
  let spin = a3dModF(aura.u_time, ${MOLTEN_TIME_WRAP.toFixed(1)}) * 34.0 * aura.u_motion;
  let blades = 0.38 + 0.62 * pow(0.5 + 0.5 * cos(ang * 3.0 + spin), 2.0);
  let ring = smoothstep(0.80, 0.92, r) * (1.0 - smoothstep(0.94, 1.0, r));
  let hub = 1.0 - smoothstep(0.0, 0.22, r);
  let body = smoothstep(0.18, 0.34, r) * (1.0 - smoothstep(0.76, 0.96, r)) * blades;
  let tint = mix(vec3<f32>(0.22, 0.78, 0.98), vec3<f32>(1.0, 0.48, 0.16), vec3<f32>(clamp(aura.u_heat, 0.0, 1.0)));
  let alpha = clamp(body * 0.24 + ring * 0.55 + hub * 0.35, 0.0, 0.72);
  return vec4<f32>(tint * (1.2 + ring * 1.4), alpha);
}`);

export function rotorBlurMaterial(radius: number, reducedMotion = false): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: ROTOR_VERTEX_GLSL, fragment: ROTOR_FRAGMENT_GLSL },
    wgsl: { vertex: ROTOR_VERTEX_WGSL, fragment: ROTOR_FRAGMENT_WGSL },
    uniforms: {
      u_radius: { type: "f32", value: radius },
      [THRUSTER_HEAT_UNIFORM]: { type: "f32", value: 0.2 },
      u_motion: { type: "f32", value: reducedMotion ? 0 : 1 }
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  });
}

/** GU47 phase 3 contact shadow: a dark disc with a soft radial falloff on a flat instanced box (one draw for all drones). */
const CONTACT_SHADOW_VERTEX_GLSL = `out vec2 vTdDisc;
void main() {
  // Instance-local metres (the box size rides in the instance scale, as for the molten veins); round 4 drew squares
  // from the raw unit-box position.
  vTdDisc = (mat3(modelMatrix) * (mat3(instanceMatrix) * position)).xz / u_radius;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix * vec4(position, 1.0));
}`;

export const CONTACT_SHADOW_FRAGMENT_GLSL = `in vec2 vTdDisc;
out vec4 outColor;
void main() {
  float r = length(vTdDisc);
  float a = u_opacity * (1.0 - smoothstep(0.15, 1.0, r));
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** A3/W6: WGSL twin of the contact shadow (not fogged, like the GLSL). */
const CONTACT_SHADOW_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct DiscVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) disc: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> DiscVarying {
  var out: DiscVarying;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  out.disc = a3dMat3Mul(aura.u_modelMatrix, a3dMat3Mul(instanceMatrix, a_position)).xz / aura.u_radius;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * (aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0)));
  return out;
}`);

const CONTACT_SHADOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vTdDisc: vec2<f32>) -> @location(0) vec4<f32> {
  let r = length(vTdDisc);
  let a = aura.u_opacity * (1.0 - smoothstep(0.15, 1.0, r));
  return vec4<f32>(0.0, 0.0, 0.0, a);
}`);

/** `radius` is half the box footprint in metres. */
export function contactShadowMaterial(opacity: number, radius: number): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: CONTACT_SHADOW_VERTEX_GLSL, fragment: CONTACT_SHADOW_FRAGMENT_GLSL },
    wgsl: { vertex: CONTACT_SHADOW_VERTEX_WGSL, fragment: CONTACT_SHADOW_FRAGMENT_WGSL },
    uniforms: { u_opacity: { type: "f32", value: opacity }, u_radius: { type: "f32", value: radius } },
    transparent: true,
    depthWrite: false
  });
}

/**
 * 8x4 sprite-sheet flipbook burst card material (WP-07): samples procedural `createFlipbookAtlas("plasma" | "sparks")`
 * RGBA8 textures on camera-aligned or drone-anchored burst quads (`u_burst = [frameIndex, opacity, hdrGain, 0]`).
 */
export const FLIPBOOK_BURST_UNIFORM = "u_burst";

const FLIPBOOK_VERTEX_GLSL = `out vec2 vBurstUv;
void main() {
  vBurstUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

export const FLIPBOOK_FRAGMENT_GLSL = `in vec2 vBurstUv;
out vec4 outColor;
void main() {
  float idx = floor(clamp(u_burst.x, 0.0, 31.0));
  float col = mod(idx, 8.0);
  float row = floor(idx / 8.0);
  vec2 cellUv = vec2((col + clamp(vBurstUv.x, 0.02, 0.98)) / 8.0, (row + clamp(1.0 - vBurstUv.y, 0.02, 0.98)) / 4.0);
  vec4 tex = texture(flipbookMap, cellUv);
  float alpha = clamp(tex.a * u_burst.y, 0.0, 1.0);
  outColor = vec4(tex.rgb * u_burst.z * alpha, alpha);
}`;

const FLIPBOOK_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct BurstVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, @location(2) a_uv: vec2<f32>) -> BurstVarying {
  var out: BurstVarying;
  out.uv = a_uv;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * aura.u_modelMatrix * vec4<f32>(a_position, 1.0));
  return out;
}`);

const FLIPBOOK_FRAGMENT_WGSL = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vBurstUv: vec2<f32>) -> @location(0) vec4<f32> {
  let idx = floor(clamp(aura.u_burst.x, 0.0, 31.0));
  let col = a3dModF(idx, 8.0);
  let row = floor(idx / 8.0);
  let cellUv = vec2<f32>((col + clamp(vBurstUv.x, 0.02, 0.98)) / 8.0, (row + clamp(1.0 - vBurstUv.y, 0.02, 0.98)) / 4.0);
  let tex = textureSample(u_flipbookMapTexture, u_flipbookMapSampler, cellUv);
  let alpha = clamp(tex.a * aura.u_burst.y, 0.0, 1.0);
  return vec4<f32>(tex.rgb * aura.u_burst.z * alpha, alpha);
}`);

export function flipbookBurstMaterial(flipbookTexture: AuraTextureRef): AuraMaterialSpec {
  return material.custom({
    glsl: { vertex: FLIPBOOK_VERTEX_GLSL, fragment: FLIPBOOK_FRAGMENT_GLSL },
    wgsl: { vertex: FLIPBOOK_VERTEX_WGSL, fragment: FLIPBOOK_FRAGMENT_WGSL },
    uniforms: {
      flipbookMap: { type: "texture2d", value: flipbookTexture },
      [FLIPBOOK_BURST_UNIFORM]: { type: "vec4", value: [0, 0, 2.4, 0] }
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double"
  });
}
