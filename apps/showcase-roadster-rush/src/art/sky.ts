import type { material } from "@aura3d/engine";

type CustomSpec = Parameters<typeof material.custom>[0];
type V3 = [number, number, number];

export const SKY_DOME_SIZE = 760;

const VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <a3d_sky>
#include <colorspace_decode>
in vec3 vDir;
out vec4 outColor;
float starField(vec3 d) {
  vec3 cell = floor(d * 520.0);
  float h = a3dHash31(cell);
  float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + h * 40.0);
  return step(0.9965, h) * smoothstep(0.02, 0.3, d.y) * twinkle;
}
void main() {
  vec3 d = a3dSafeNormalize(vDir, vec3(0.0, 0.0, -1.0));
  vec3 horizon = a3dSrgbToLinear(skyHorizon);
  vec3 mid = a3dSrgbToLinear(skyMid);
  vec3 top = a3dSrgbToLinear(skyTop);
  vec3 col = a3dSkyGradient(d, horizon, mix(mid, top, a3dSaturate(d.y * 1.4)), horizon * 0.35);
  col = mix(col, horizon, (1.0 - smoothstep(0.0, 0.22, d.y)) * 0.55);

  // high clouds lit from below by the low sun
  float h = max(d.y, 0.0);
  vec2 uv = d.xz / (h + 0.22) * 1.6 + vec2(uTime * 0.004, 0.0);
  float n = a3dFbm(uv * 1.2, 5);
  float n2 = a3dFbm(uv * 1.2 + sunDirXZ * 0.18, 5);
  vec3 sunTintLin = a3dSrgbToLinear(sunColor);
  vec3 moonTint = vec3(0.12, 0.17, 0.32);
  vec3 lightTint = mix(sunTintLin, moonTint, nightAmount);
  float dens = smoothstep(0.5, 0.76, n) * smoothstep(0.0, 0.14, d.y) * (1.0 - nightAmount * 0.72);
  float lit = a3dSaturate(0.55 + (n - n2) * 5.0);
  vec3 cloud = mix(mid * 0.55, lightTint * 1.25, lit);
  col = mix(col, cloud, dens * 0.82);

  // sun disc, bloom-friendly corona and horizon haze (the sun turns into a dim moon at night)
  float sunPower = 1.0 - nightAmount * 0.82;
  float disc = a3dSunDisc(d, sunDir, 0.052);
  float glow = a3dSunGlow(d, sunDir, 26.0);
  float wide = a3dSunGlow(d, sunDir, 5.5);
  col += lightTint * (disc * 3.2 + glow * 0.95 + wide * 0.22) * sunPower;
  col += a3dHorizonHaze(d, lightTint * 0.38, 0.12) * (1.0 - nightAmount * 0.7);

  // city glow under the horizon and stars by night
  col += a3dSrgbToLinear(cityGlow) * (1.0 - smoothstep(0.0, 0.1, abs(d.y))) * (0.15 + nightAmount * 0.55);
  col += vec3(0.8, 0.88, 1.0) * starField(d) * nightAmount * (1.0 - dens);

  outColor = vec4(a3dFinite(col), 1.0);
}`;

export function skySpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      skyHorizon: { type: "vec3", value: [1, 0.55, 0.38] },
      skyMid: { type: "vec3", value: [0.7, 0.32, 0.42] },
      skyTop: { type: "vec3", value: [0.2, 0.12, 0.3] },
      sunDir: { type: "vec3", value: [0.08, 0.12, -0.99] },
      sunDirXZ: { type: "vec2", value: [0.08, -0.99] },
      sunColor: { type: "vec3", value: [1, 0.62, 0.36] },
      cityGlow: { type: "vec3", value: [1, 0.42, 0.55] },
      nightAmount: { type: "f32", value: 0 }
    },
    side: "back",
    depthWrite: false
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (h: string): V3 => {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const STOPS = [
  { horizon: hex("#ff9a5c"), mid: hex("#b84a6a"), top: hex("#3a2354"), sun: hex("#ffb066"), glow: hex("#ff6a5a") },
  { horizon: hex("#d8527a"), mid: hex("#5c2a62"), top: hex("#1b1538"), sun: hex("#ff5c88"), glow: hex("#ff3f86") },
  { horizon: hex("#2a2f66"), mid: hex("#12183f"), top: hex("#050818"), sun: hex("#5ec8ff"), glow: hex("#4aa8ff") }
];

export interface SkyLook {
  skyHorizon: V3;
  skyMid: V3;
  skyTop: V3;
  sunColor: V3;
  cityGlow: V3;
  sunDir: V3;
  sunDirXZ: [number, number];
  nightAmount: number;
}

/** Time of day 0 (sunset) .. 1 (night) to the dome palette; the sun sinks with the same curve the old sun disc used. */
export function skyLook(todRaw: number): SkyLook {
  const tod = Math.min(1, Math.max(0, todRaw));
  const k = tod <= 0.5 ? tod * 2 : (tod - 0.5) * 2;
  const a = STOPS[tod <= 0.5 ? 0 : 1]!;
  const b = STOPS[tod <= 0.5 ? 1 : 2]!;
  const sunY = lerp(34, 6, tod);
  const dir: V3 = [24, sunY, -290];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const sunDir: V3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  return {
    skyHorizon: mix3(a.horizon, b.horizon, k),
    skyMid: mix3(a.mid, b.mid, k),
    skyTop: mix3(a.top, b.top, k),
    sunColor: mix3(a.sun, b.sun, k),
    cityGlow: mix3(a.glow, b.glow, k),
    sunDir,
    sunDirXZ: [sunDir[0], sunDir[2]],
    nightAmount: Math.min(1, Math.max(0, (tod - 0.45) / 0.55))
  };
}
