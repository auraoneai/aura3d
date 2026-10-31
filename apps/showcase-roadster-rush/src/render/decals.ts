/**
 * GU47 AO-W2: recycled road decals (skid marks, oil stains, painted lane arrows) on the skyway deck. All three are drawn
 * procedurally by one instanced plane node (1 draw, at most 32 live instances), world-anchored per 18 m deck row like the
 * dashes, so they stream back past the camera at the run's speed. The decal kind rides in the instance's y scale (the unit
 * plane is flat in XZ, so y scale is otherwise unused). They fade out by 160 m (no far-plane z-fighting) and take the scene's
 * hemisphere and sun light, so they darken with the time of day. Decoration only: nothing reads them back.
 *
 * Why procedural: no CC0 decal texture set is in the repo and this phase has no network fetch; the CC0 skid/oil/arrow textures
 * (asset need `apex-decals-{skid,oil,arrow}`) can replace the shader masks later through `DECAL_KINDS`.
 */
import type { material } from "@aura3d/engine";
import { LANE_WIDTH, laneX } from "../native/constants";

type CustomSpec = Parameters<typeof material.custom>[0];

export type DecalKind = "skid" | "oil" | "arrow";
export const DECAL_KINDS: readonly DecalKind[] = ["skid", "oil", "arrow"];
/** Instance y scale per kind (decoded in the shader). */
export const DECAL_KIND_CODE: Readonly<Record<DecalKind, number>> = { skid: 1, oil: 2, arrow: 3 };
/** Footprint (x across, z along) in metres per kind. */
export const DECAL_SIZE: Readonly<Record<DecalKind, readonly [number, number]>> = {
  skid: [1.7, 7.5],
  oil: [1.9, 2.6],
  arrow: [1.1, 4.6]
};

export const DECAL_ROW_STRIDE_Z = 18;
/** Rows from one behind the camera to about 270 m ahead. */
export const DECAL_ROWS = 16;
/** Live cap (PRD AO-W2: <= 32 live). */
export const DECAL_CAPACITY = 32;
/** Sits 1 cm over the deck top (y 0); the lane dashes are 2.5 cm tall. */
export const DECAL_Y = 0.01;
export const DECAL_FADE: readonly [number, number] = [90, 160];
/**
 * GU47 phase 3 (rubric "shadows": the hero floated over the sunlit deck). The last slot of the same instanced plane draws a
 * soft contact-occlusion ellipse under the hero (no new node, no new draw; the sun is dead ahead, so its cascade shadow
 * falls behind the car where the chase camera barely sees it). Code 4 in the instance y scale; the fractional part
 * (0..0.45) carries the strength, which fades with the hero's height above the deck.
 */
export const CONTACT_KIND_CODE = 4;
export const CONTACT_SIZE: readonly [number, number] = [2.7, 5.4];
/** Road decals stop one short of the capacity, so the contact slot always fits. */
export const ROAD_DECAL_CAP = DECAL_CAPACITY - 1;
/** Instance y scale for the contact ellipse of a hero `height` metres above the deck (fully gone by 4 m). */
export function contactScaleY(height: number): number {
  const k = Math.min(1, Math.max(0, 1 - Math.max(0, height) / 4));
  return CONTACT_KIND_CODE + 0.45 * k;
}

export interface DecalInstance {
  readonly kind: DecalKind;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

function decalHash(row: number, slot: number): number {
  let h = Math.imul(row | 0, 0x5bd1e995) ^ Math.imul((slot | 0) + 0x3c6e, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Decals for a player at world z `pz` (forward is -z): deterministic per world row, never more than `DECAL_CAPACITY`. */
export function decalLayout(pz: number): DecalInstance[] {
  const base = Math.floor(pz / DECAL_ROW_STRIDE_Z) * DECAL_ROW_STRIDE_Z;
  const out: DecalInstance[] = [];
  for (let r = -1; r < DECAL_ROWS - 1 && out.length < ROAD_DECAL_CAP; r++) {
    const rowZ = base - r * DECAL_ROW_STRIDE_Z;
    const row = Math.round(rowZ / DECAL_ROW_STRIDE_Z);
    for (let slot = 0; slot < 2 && out.length < ROAD_DECAL_CAP; slot++) {
      const h0 = decalHash(row, slot);
      if (h0 > 0.62) continue;
      const h1 = decalHash(row, slot + 37);
      const h2 = decalHash(row, slot + 71);
      const kind: DecalKind = h0 < 0.3 ? "skid" : h0 < 0.47 ? "oil" : "arrow";
      const lane = Math.floor(h1 * 5) % 5;
      const offset = kind === "arrow" ? 0 : (h2 - 0.5) * LANE_WIDTH * 0.45;
      out.push({
        kind,
        x: laneX(lane) + offset,
        z: rowZ - 3 + h2 * 12,
        yaw: kind === "skid" ? (h1 - 0.5) * 0.22 : kind === "oil" ? h2 * Math.PI : 0
      });
    }
  }
  return out;
}

const VERTEX = /* glsl */ `
out vec2 vUv;
out float vKind;
out float vAmt;
out vec3 vW;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  float ys = length(instanceMatrix[1].xyz);
  vKind = floor(ys + 0.5);
  vAmt = clamp((ys - 4.0) / 0.45, 0.0, 1.0);
  vec4 w = m * vec4(position.x, 0.0, position.z, 1.0);
  vW = w.xyz;
  vUv = position.xz + 0.5;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_scene>
in vec2 vUv;
in float vKind;
in float vAmt;
in vec3 vW;
out vec4 outColor;
float dHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 albedo = vec3(0.02);
  float a = 0.0;
  if (vKind < 1.5) {
    // skid: two tyre streaks, broken along their length, darkest in the middle
    float streak = max(1.0 - abs(abs(p.x) - 0.6) / 0.22, 0.0);
    float along = 1.0 - p.y * p.y;
    float grain = 0.6 + 0.4 * dHash(floor(vec2(p.x * 9.0, vUv.y * 60.0)));
    a = a3dSaturate(streak * along * grain) * 0.62;
  } else if (vKind < 2.5) {
    // oil: a soft irregular stain with a darker rim
    float r = length(p * vec2(1.0, 1.15)) + 0.12 * sin(atan(p.y, p.x) * 5.0);
    a = a3dSaturate((1.0 - smoothstep(0.55, 0.9, r)) * (0.55 + 0.25 * smoothstep(0.4, 0.8, r))) * 0.7;
    albedo = vec3(0.012, 0.012, 0.016);
  } else if (vKind > 3.5) {
    // contact occlusion under the hero: a soft ellipse, darkest under the floor pan, unlit (it is the missing light)
    float r = length(p);
    a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.78 * vAmt;
    albedo = vec3(0.0);
  } else {
    // painted lane arrow (pointing -z, forward): shaft plus head, worn paint
    // tip at p.y -0.95 (forward), head widens to the base at -0.1, shaft from there back to 0.95
    float shaft = step(abs(p.x), 0.16) * step(-0.1, p.y) * step(p.y, 0.95);
    float head = step(-0.95, p.y) * step(p.y, -0.1) * step(abs(p.x), (p.y + 0.95) * 0.9);
    float paint = max(shaft, head);
    float worn = 0.7 + 0.3 * dHash(floor(vUv * vec2(18.0, 70.0)));
    a = paint * worn * 0.85;
    albedo = vec3(0.78, 0.78, 0.74);
  }
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 light = a3dHemiLight(up) + a3dSunRadiance() * max(dot(up, u_a3dSunDirection), 0.0);
  float dist = length(cameraPosition - vW);
  a *= 1.0 - smoothstep(decalFade.x, decalFade.y, dist);
  vec3 col = albedo * light;
  outColor = vec4(a3dFinite(col), a);
}`;

export function decalSpec(): CustomSpec {
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      decalFade: { type: "vec2", value: [DECAL_FADE[0], DECAL_FADE[1]] }
    },
    transparent: true,
    depthWrite: false,
    side: "double",
    fog: true
  };
}
