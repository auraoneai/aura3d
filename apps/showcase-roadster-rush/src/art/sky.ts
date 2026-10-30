import type { material } from "@aura3d/engine";
import { apexLookAt, hexToUnit } from "./look";

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
  // GU47 AO-E1 blue hour: violet mid sky into a cobalt zenith over a thin tangerine band (about 6 deg: sin 6 deg = 0.105),
  // brightest toward the sun's azimuth; below the horizon the city haze (the haze floor shader draws the ground itself).
  float up = max(d.y, 0.0);
  vec3 col = mix(mid, top, smoothstep(0.06, 0.62, up));
  float sunSide = 0.55 + 0.45 * a3dSaturate(dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(sunDirXZ + 1e-5)));
  float band = (1.0 - smoothstep(0.0, 0.105, up)) * sunSide;
  col = mix(col, horizon, band);
  col = mix(col, horizon * 0.35, 1.0 - smoothstep(-0.08, 0.0, d.y));

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

  // sun disc, a bloom-sized corona (the racer bloom's 0.85 threshold catches the inner glow only) and horizon haze
  // (the sun turns into a dim moon at night)
  float sunPower = 1.0 - nightAmount * 0.82;
  float disc = a3dSunDisc(d, sunDir, 0.04);
  float glow = a3dSunGlow(d, sunDir, 34.0);
  float wide = a3dSunGlow(d, sunDir, 6.0);
  col += lightTint * (disc * 2.6 + glow * 0.8 + wide * 0.2) * sunPower;
  col += a3dHorizonHaze(d, lightTint * 0.3, 0.09) * (1.0 - nightAmount * 0.7);

  // sodium city glow rising from under the horizon (strongest at night) and stars by night
  col += a3dSrgbToLinear(cityGlow) * (1.0 - smoothstep(0.0, 0.08, abs(d.y))) * (0.1 + nightAmount * 0.6);
  col += vec3(0.8, 0.88, 1.0) * starField(d) * nightAmount * (1.0 - dens);

  outColor = vec4(a3dFinite(col), 1.0);
}`;

export function skySpec(): CustomSpec {
  const boot = skyLook(0);
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      skyHorizon: { type: "vec3", value: boot.skyHorizon },
      skyMid: { type: "vec3", value: boot.skyMid },
      skyTop: { type: "vec3", value: boot.skyTop },
      sunDir: { type: "vec3", value: boot.sunDir },
      sunDirXZ: { type: "vec2", value: boot.sunDirXZ },
      sunColor: { type: "vec3", value: boot.sunColor },
      cityGlow: { type: "vec3", value: boot.cityGlow },
      nightAmount: { type: "f32", value: 0 }
    },
    side: "back",
    depthWrite: false
  };
}

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

/**
 * Time of day 0 (sunset) .. 1 (night) to the dome palette, from the look table (src/art/look.ts) so the dome, the key light
 * and the fog read the same row. The disc sits on the key's direction (GU47 AO-L1: key, disc and shadows agree).
 */
export function skyLook(todRaw: number): SkyLook {
  const frame = apexLookAt(todRaw);
  const tod = frame.tod;
  const sunDir = frame.sunDir;
  return {
    skyHorizon: hexToUnit(frame.dome.horizon),
    skyMid: hexToUnit(frame.dome.mid),
    skyTop: hexToUnit(frame.dome.top),
    sunColor: hexToUnit(frame.dome.sun),
    cityGlow: hexToUnit(frame.dome.glow),
    sunDir,
    sunDirXZ: [sunDir[0], sunDir[2]],
    nightAmount: Math.min(1, Math.max(0, (tod - 0.45) / 0.55))
  };
}
