/**
 * Splat Turf art pass: local program variants layered on the runner-kit specs (the kit stays untouched).
 * - `hazed` wraps a kit toon spec with a warm sunset light rig and distance haze towards the horizon colour.
 * - `sunsetSkyFragment` is the kit gradient plus a low sun disc and halo (the disc goes above 1 so bloom catches it).
 * - `glowSpec` is an unlit per-instance tone times a gain, for the carnival bulbs.
 * Presentation only: no sim state is read here.
 */
import {
  TOON_TONE_VERTEX, TOON_TONE_VERTEX_WGSL, gradientSkyFragment, gradientSkyFragmentWgsl, hexToLinear, skySpec, wgslStage, type CustomSpec,
  type Rgb, type SkyStop
} from "../../../../examples/shared/runner-kit/index";

export interface Haze {
  readonly color: Rgb;
  /** Haze starts at `near` metres from the camera and reaches `max` at `far`. */
  readonly near: number;
  readonly far: number;
  readonly max: number;
}

const KIT_OUT = "outColor = vec4(shoulder(base * lit) + emissive, alpha);";
const KIT_SKY = "vec3 sky = vec3(1.0);";
const KIT_GROUND = "vec3 ground = vec3(0.1845, 0.2462, 0.4020); // #7788aa";
const KIT_KEY = "vec3(0.65) * ramp(dot(N, L1))";

/** The same four lines in the kit's WGSL twin (runner-kit/shaders-wgsl.ts `toonFragmentWgsl`). */
const KIT_OUT_WGSL = "return vec4<f32>(shoulder(base * lit) + aura.u_emissive, aura.u_alpha);";
const KIT_SKY_WGSL = "let sky = vec3<f32>(1.0);";
const KIT_GROUND_WGSL = "let ground = vec3<f32>(0.1845, 0.2462, 0.4020);";
const KIT_KEY_WGSL = "vec3<f32>(0.65) * ramp(dot(N, L1))";

/** `hazed`'s rewrite of the kit toon WGSL twin, the GLSL rewrite line for line. */
function hazedWgsl(src: string): string {
  for (const needle of [KIT_OUT_WGSL, KIT_SKY_WGSL, KIT_GROUND_WGSL, KIT_KEY_WGSL]) {
    if (!src.includes(needle)) throw new Error(`splat-turf haze: kit toon WGSL changed (missing "${needle}")`);
  }
  return src
    .replace(KIT_SKY_WGSL, "let sky = vec3<f32>(1.0, 0.94, 0.9);")
    .replace(KIT_GROUND_WGSL, "let ground = vec3<f32>(0.30, 0.16, 0.36);")
    .replace(KIT_KEY_WGSL, "vec3<f32>(0.70, 0.64, 0.58) * ramp(dot(N, L1))")
    .replace(KIT_OUT_WGSL, [
      "let col = shoulder(base * lit) + aura.u_emissive;",
      "  let hz = smoothstep(aura.u_hazeNear, aura.u_hazeFar, length(vWorld - aura.u_cameraPosition)) * aura.u_hazeMax;",
      "  return vec4<f32>(mix(col, aura.u_hazeColor, hz), aura.u_alpha);"
    ].join("\n"));
}

/** Warm sky light, plum bounce, peach key and haze; the road keeps reading white (key + hemi stay near 1). */
export function hazed(spec: CustomSpec, haze: Haze): CustomSpec {
  const glsl = spec.glsl as { vertex: string; fragment: string };
  const src = glsl.fragment;
  for (const needle of [KIT_OUT, KIT_SKY, KIT_GROUND, KIT_KEY]) {
    if (!src.includes(needle)) throw new Error(`splat-turf haze: kit toon fragment changed (missing "${needle}")`);
  }
  const fragment = src
    .replace(KIT_SKY, "vec3 sky = vec3(1.0, 0.94, 0.9);")
    .replace(KIT_GROUND, "vec3 ground = vec3(0.30, 0.16, 0.36);")
    .replace(KIT_KEY, "vec3(0.70, 0.64, 0.58) * ramp(dot(N, L1))")
    .replace(KIT_OUT, [
      "vec3 col = shoulder(base * lit) + emissive;",
      "  float hz = smoothstep(hazeNear, hazeFar, length(vWorld - cameraPosition)) * hazeMax;",
      "  outColor = vec4(mix(col, hazeColor, hz), alpha);"
    ].join("\n"));
  return {
    ...spec,
    glsl: { vertex: glsl.vertex, fragment },
    ...(spec.wgsl?.vertex && spec.wgsl.fragment ? { wgsl: { vertex: spec.wgsl.vertex, fragment: hazedWgsl(spec.wgsl.fragment) } } : {}),
    uniforms: {
      ...spec.uniforms,
      hazeColor: { type: "color3", value: [...haze.color] },
      hazeNear: { type: "f32", value: haze.near },
      hazeFar: { type: "f32", value: haze.far },
      hazeMax: { type: "f32", value: haze.max }
    }
  };
}

/** Gradient dome plus a low sun: crisp disc (HDR, blooms) and a wide warm halo along the horizon. */
export function sunsetSkySpec(stops: readonly SkyStop[], sunDir: readonly [number, number, number], sunHex: string): CustomSpec {
  const base = gradientSkyFragment(stops);
  const close = "outColor = vec4(c, 1.0);";
  if (!base.includes(close)) throw new Error("splat-turf haze: kit sky fragment changed");
  const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  const d = sunDir.map((v) => (v / len).toFixed(4)).join(", ");
  const [r, g, b] = hexToLinear(sunHex).map((v) => v.toFixed(4));
  const fragment = base.replace(close, [
    `vec3 sd = normalize(vec3(${d}));`,
    "  vec3 vd = normalize(vWorld - cameraPosition);",
    "  float s = max(dot(vd, sd), 0.0);",
    `  vec3 sun = vec3(${r}, ${g}, ${b});`,
    "  c += sun * (smoothstep(0.9990, 0.9994, s) * 3.0 + pow(s, 64.0) * 0.6 + pow(s, 8.0) * 0.25);",
    "  outColor = vec4(c, 1.0);"
  ].join("\n"));
  const baseWgsl = gradientSkyFragmentWgsl(stops);
  const closeWgsl = "return vec4<f32>(c, 1.0);";
  if (!baseWgsl.includes(closeWgsl)) throw new Error("splat-turf haze: kit sky WGSL changed");
  const fragmentWgsl = baseWgsl.replace(closeWgsl, [
    `let sd = normalize(vec3<f32>(${d}));`,
    "  let vd = normalize(vWorld - aura.u_cameraPosition);",
    "  let s = max(dot(vd, sd), 0.0);",
    `  let sun = vec3<f32>(${r}, ${g}, ${b});`,
    "  c = c + sun * (smoothstep(0.9990, 0.9994, s) * 3.0 + a3dPow(s, 64.0) * 0.6 + a3dPow(s, 8.0) * 0.25);",
    "  return vec4<f32>(c, 1.0);"
  ].join("\n"));
  return { ...skySpec(fragment, fragmentWgsl) };
}

const GLOW_FRAGMENT = /* glsl */ `
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
in vec3 vTone;
out vec4 outColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float core = 0.75 + 0.25 * abs(dot(N, V));
  outColor = vec4(vTone * baseColor * core, 1.0);
}`;

const GLOW_FRAGMENT_WGSL = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vNormal: vec3<f32>, @location(1) vWorld: vec3<f32>, @location(2) vUv: vec2<f32>, @location(3) vTone: vec3<f32>) -> @location(0) vec4<f32> {
  let N = normalize(vNormal);
  let V = normalize(aura.u_cameraPosition - vWorld);
  let core = 0.75 + 0.25 * abs(dot(N, V));
  return vec4<f32>(vTone * aura.u_baseColor * core, 1.0);
}`);

/** Unlit carnival bulb: tone x gain (gain above 1 lifts the bulbs over the bloom threshold). */
export const glowSpec = (gain: number): CustomSpec => ({
  glsl: { vertex: TOON_TONE_VERTEX, fragment: GLOW_FRAGMENT },
  wgsl: { vertex: TOON_TONE_VERTEX_WGSL, fragment: GLOW_FRAGMENT_WGSL },
  uniforms: { baseColor: { type: "color3", value: [gain, gain, gain] } },
  side: "double"
});
