/**
 * Splat Turf art pass: local program variants layered on the runner-kit specs (the kit stays untouched).
 * - `hazed` wraps a kit toon spec with a warm sunset light rig and distance haze towards the horizon colour.
 * - `sunsetSkyFragment` is the kit gradient plus a low sun disc and halo (the disc goes above 1 so bloom catches it).
 * - `glowSpec` is an unlit per-instance tone times a gain, for the carnival bulbs.
 * Presentation only: no sim state is read here.
 */
import {
  TOON_TONE_VERTEX, gradientSkyFragment, hexToLinear, skySpec, type CustomSpec, type Rgb, type SkyStop
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
  return { ...skySpec(fragment) };
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

/** Unlit carnival bulb: tone x gain (gain above 1 lifts the bulbs over the bloom threshold). */
export const glowSpec = (gain: number): CustomSpec => ({
  glsl: { vertex: TOON_TONE_VERTEX, fragment: GLOW_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [gain, gain, gain] } },
  side: "double"
});
