import type { material } from "@aura3d/engine";

type CustomSpec = Parameters<typeof material.custom>[0];

/**
 * GU47 AO-E2: the city floor 28 m below the skyway deck (the deck sits at y 0). The camera only sees it past the parapets,
 * so it reads as a haze floor: a dark street grid with lit window specks that fade into the time-of-day haze with distance.
 */
export const HAZE_FLOOR_Y = -28;

const VERTEX = /* glsl */ `
out vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <colorspace_decode>
in vec3 vW;
out vec4 outColor;
void main() {
  float dist = length(vW - cameraPosition);
  // world-anchored city plan: the floor node follows the camera, the plan scrolls with the run (scroll = camera world x/z)
  vec2 p = vec2(vW.x + scroll.x, vW.z + scroll.y);
  vec2 block = floor(p / 36.0);
  vec2 inBlock = fract(p / 36.0);
  float street = step(inBlock.x, 0.16) + step(inBlock.y, 0.12);
  vec2 cell = floor(p / 2.6);
  vec2 f = fract(p / 2.6);
  float h = a3dHash31(vec3(cell, a3dHash31(vec3(block, 7.0)) * 31.0));
  float lit = step(1.0 - (0.08 + 0.3 * windowSpecks), h) * (1.0 - a3dSaturate(street));
  float speck = lit * step(0.3, f.x) * step(f.x, 0.7) * step(0.32, f.y) * step(f.y, 0.68);
  // specks shrink to sub-pixel far away: fade them out before they alias
  speck *= 1.0 - smoothstep(70.0, 240.0, dist);
  vec3 warm = a3dSrgbToLinear(speckWarm);
  vec3 cool = vec3(0.62, 0.72, 0.9);
  vec3 windows = mix(warm, cool, step(0.82, fract(h * 13.7))) * speck * (0.35 + 1.6 * windowSpecks);
  vec3 streetGlow = a3dSrgbToLinear(speckWarm) * a3dSaturate(street) * 0.05 * windowSpecks;
  vec3 col = a3dSrgbToLinear(groundColor) + windows + streetGlow;
  // the haze between the deck and the city: always some, thicker with distance
  float haze = a3dSaturate(0.38 + 0.62 * (1.0 - exp(-dist * groundFogDensity)));
  col = mix(col, a3dSrgbToLinear(groundFogColor), haze);
  outColor = vec4(a3dFinite(col), 1.0);
}`;

/** The haze floor: the city under the skyway, melting into the haze colour with distance (no hard horizon line). */
export function groundSpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      groundColor: { type: "vec3", value: [0.05, 0.05, 0.07] },
      groundFogColor: { type: "vec3", value: [0.44, 0.42, 0.53] },
      groundFogDensity: { type: "f32", value: 0.006 },
      speckWarm: { type: "vec3", value: [1, 0.69, 0.29] },
      windowSpecks: { type: "f32", value: 0.25 },
      scroll: { type: "vec2", value: [0, 0] }
    }
  };
}
