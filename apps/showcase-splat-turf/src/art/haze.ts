/**
 * Splat Turf art pass: local program variants layered on the runner-kit specs (the kit stays untouched).
 * - `hazed` wraps a kit toon spec with a warm sunset light rig and distance haze towards the horizon colour.
 * - `sunsetSkyOptions` is the kit gradient plus a low sun disc and halo on the engine `sky.gradient` (the disc goes above 1 so
 *   bloom catches it).
 * - `glowSpec` is an unlit per-instance tone times a gain, for the carnival bulbs.
 * Presentation only: no sim state is read here.
 */
import type { AuraSkyGradientOptions } from "@aura3d/engine";
import {
  TOON_TONE_VERTEX, TOON_TONE_VERTEX_WGSL, gradientSkyOptions, hexToLinear, sunAngles, wgslStage, type CustomSpec,
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

/**
 * The kit gradient plus a low sun: crisp disc (HDR, blooms) and a wide warm halo along the horizon, on the engine's
 * `sky.gradient` (5.7.0 stylised profile). Same colours as the 5.6 custom dome within 1/255
 * (tests/unit/sky/game-sky-migration-parity.test.ts): the disc is `smoothstep(0.9990, 0.9994, cos)` added at 3x the
 * sun colour, the halo `pow(cos, 64) * 0.6 + pow(cos, 8) * 0.25`.
 */
export function sunsetSkyOptions(stops: readonly SkyStop[], sunDir: readonly [number, number, number], sunHex: string): AuraSkyGradientOptions {
  const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
  // The 5.6 program baked the unit direction at 4 decimals; keep that exact direction.
  const d = sunDir.map((v) => Number((v / len).toFixed(4))) as unknown as readonly [number, number, number];
  const outer = Math.acos(0.999);
  return {
    ...gradientSkyOptions(stops),
    name: "sky",
    sun: {
      ...sunAngles(d),
      color: sunHex,
      discSize: 2 * outer,
      discSoftness: 1 - Math.acos(0.9994) / outer,
      discIntensity: 3,
      discBlend: "add",
      glow: [{ exponent: 64, intensity: 0.6 }, { exponent: 8, intensity: 0.25 }]
    }
  };
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
