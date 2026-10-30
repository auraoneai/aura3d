/**
 * GU47 AO-A1: the glass tower skyline that replaces the borrowed `showcaseModernBuildingOne` (75 meshes, 75 draws, a cartoon
 * townhouse row). Three tower variants (slab, stepped, twin-blade) rise from the haze floor 28 m below the deck to tops 20-95 m
 * above it, on world-anchored rows both sides of the skyway. Each variant is one instanced box node with a curtain-wall
 * shader (mullion grid in metres, sky reflection, sun-side glint, lit windows toward night), so the whole skyline is 3 draws.
 * The Meshy glass tower kit (WP-36, with its far LOD and impostor beyond 220 m) drops in per variant through `TOWER_VARIANTS`.
 */
import type { material } from "@aura3d/engine";
import { HAZE_FLOOR_Y } from "../art/ground";

type CustomSpec = Parameters<typeof material.custom>[0];

export type TowerVariant = "slab" | "stepped" | "blade";
export const TOWER_VARIANTS: readonly TowerVariant[] = ["slab", "stepped", "blade"];

export const TOWER_ROW_STRIDE_Z = 70;
/** Rows from one behind the camera to about 560 m ahead (the camera far plane is 550 m). */
export const TOWER_ROWS = 9;
/** Towers per row and side: one near (40-70 m off the road) and one far (95-150 m). */
export const TOWERS_PER_ROW_SIDE = 2;
export const TOWER_CAPACITY_PER_VARIANT = TOWER_ROWS * 2 * TOWERS_PER_ROW_SIDE;

export interface TowerInstance {
  readonly variant: TowerVariant;
  readonly x: number;
  /** Centre height (world y) of the box. */
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly yaw: number;
}

/** Deterministic hash in [0, 1) of an integer pair (world row, slot). */
export function towerHash(row: number, slot: number): number {
  let h = Math.imul(row | 0, 0x27d4eb2d) ^ Math.imul((slot | 0) + 0x9e37, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Towers for a player at world z `pz` (forward is -z), world-anchored per 70 m row. */
export function towerLayout(pz: number): TowerInstance[] {
  const base = Math.floor(pz / TOWER_ROW_STRIDE_Z) * TOWER_ROW_STRIDE_Z;
  const out: TowerInstance[] = [];
  for (let r = -1; r < TOWER_ROWS - 1; r++) {
    const rowZ = base - r * TOWER_ROW_STRIDE_Z;
    const row = Math.round(rowZ / TOWER_ROW_STRIDE_Z);
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < TOWERS_PER_ROW_SIDE; k++) {
        const slot = (side < 0 ? 0 : 10) + k;
        const h0 = towerHash(row, slot);
        const h1 = towerHash(row, slot + 101);
        const h2 = towerHash(row, slot + 211);
        const variant = TOWER_VARIANTS[Math.floor(h0 * TOWER_VARIANTS.length) % TOWER_VARIANTS.length]!;
        const near = k === 0;
        const lateral = near ? 40 + h1 * 30 : 95 + h1 * 55;
        const top = (near ? 20 : 35) + h2 * (near ? 55 : 60);
        const footprint = variant === "blade" ? [11 + h1 * 5, 22 + h2 * 8] : variant === "slab" ? [18 + h2 * 8, 18 + h1 * 6] : [16 + h1 * 6, 16 + h1 * 6];
        const height = top - HAZE_FLOOR_Y;
        out.push({
          variant,
          x: side * lateral,
          y: HAZE_FLOOR_Y + height / 2,
          z: rowZ - 20 + h2 * 40,
          width: footprint[0]!,
          height,
          depth: footprint[1]!,
          yaw: (h0 - 0.5) * 0.5
        });
      }
    }
  }
  return out;
}

const VERTEX = /* glsl */ `
out vec3 vW;
out vec3 vN;
out vec3 vFacade;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vFacade = position * s;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <colorspace_decode>
in vec3 vW;
in vec3 vN;
in vec3 vFacade;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  // facade coordinates in metres: across the face and up (mullions every 2.4 m, floors every 3.6 m)
  float across = abs(n.x) > 0.5 ? vFacade.z : vFacade.x;
  vec2 grid = vec2(across / 2.4, vFacade.y / 3.6);
  vec2 f = fract(grid);
  float inX = smoothstep(0.0, 0.06, f.x) * (1.0 - smoothstep(0.94, 1.0, f.x));
  float inY = smoothstep(0.0, 0.1, f.y) * (1.0 - smoothstep(0.9, 1.0, f.y));
  float mullion = 1.0 - inX * inY;
  // glass: reflects the dome (horizon low, zenith high), a fresnel lift, and the low sun grazing the faces turned toward it
  vec3 r = reflect(-v, n);
  vec3 sky = mix(a3dSrgbToLinear(glassHorizon), a3dSrgbToLinear(glassSky), smoothstep(-0.05, 0.6, r.y));
  float fres = 0.18 + 0.82 * pow(1.0 - a3dSaturate(dot(n, v)), 4.0);
  vec3 body = a3dSrgbToLinear(glassBody);
  vec3 col = mix(body, sky, fres);
  float glint = pow(a3dSaturate(dot(r, normalize(sunDirection))), 48.0) * sunGlint;
  col += a3dSrgbToLinear(sunTint) * glint;
  // lit floors toward night (hash per window, warm and cool), never on mullions
  float win = a3dHash31(vec3(floor(grid), floor(vFacade.y / 40.0) + 3.0));
  float lit = step(1.0 - (0.1 + 0.45 * windowsLit), win) * (1.0 - mullion);
  col += mix(vec3(1.0, 0.72, 0.38), vec3(0.7, 0.8, 1.0), step(0.75, fract(win * 7.3))) * lit * (0.08 + 0.9 * windowsLit);
  col = mix(col, body * 0.6, mullion * 0.85);
  // the bases sink into the haze below the deck
  float haze = 1.0 - smoothstep(-28.0, -6.0, vW.y);
  col = mix(col, a3dSrgbToLinear(hazeColor), haze * 0.85);
  outColor = vec4(a3dFinite(col), 1.0);
}`;

/** Curtain-wall glass for one variant (body tint differs per variant so the three read as a kit, not clones). */
export function towerGlassSpec(variant: TowerVariant): CustomSpec {
  const body: Record<TowerVariant, [number, number, number]> = {
    slab: [0.13, 0.15, 0.2],
    stepped: [0.16, 0.15, 0.17],
    blade: [0.1, 0.13, 0.2]
  };
  return {
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      glassBody: { type: "vec3", value: body[variant] },
      glassSky: { type: "vec3", value: [0.12, 0.25, 0.66] },
      glassHorizon: { type: "vec3", value: [1, 0.54, 0.24] },
      sunDirection: { type: "vec3", value: [0.087, 0.122, -0.989] },
      sunTint: { type: "vec3", value: [1, 0.6, 0.31] },
      sunGlint: { type: "f32", value: 1.2 },
      windowsLit: { type: "f32", value: 0.25 },
      hazeColor: { type: "vec3", value: [0.44, 0.42, 0.53] }
    },
    fog: true
  };
}
