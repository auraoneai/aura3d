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
out float vTop;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vFacade = position * s;
  // metres below the roof line
  vTop = (0.5 - position.y) * s.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// GU47 phase 3 (rubric environment / materials / atmosphere): the 4.7.0 facade read as a coarse checkerboard of lit and dark
// 2.4 x 3.6 m tiles. Now a ribbon curtain wall: per 3.6 m floor a 2.5 m glass band over a 1.1 m spandrel, thin mullions every
// 1.5 m, each pane slightly tilted (so the reflected dome breaks into panes), a dark roof parapet with a tangerine crown line
// toward dusk, few lit panes by day, and aerial perspective toward the haze colour with distance.
const FRAGMENT = /* glsl */ `
#include <a3d_math>
#include <a3d_noise>
#include <colorspace_decode>
in vec3 vW;
in vec3 vN;
in vec3 vFacade;
in float vTop;
out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float roof = step(0.5, n.y);
  float across = abs(n.x) > 0.5 ? vFacade.z : vFacade.x;
  vec2 grid = vec2(across / 1.5, vFacade.y / 3.6);
  vec2 cell = floor(grid);
  vec2 f = fract(grid);
  float mullionX = 1.0 - smoothstep(0.0, 0.05, f.x) * (1.0 - smoothstep(0.95, 1.0, f.x));
  float spandrel = 1.0 - step(0.3, f.y) * (1.0 - step(0.97, f.y));
  float frame = max(mullionX, spandrel);
  // pane tilt: each pane reflects a slightly different part of the dome
  float h = a3dHash31(vec3(cell, floor(vFacade.y / 40.0) + 7.0));
  vec3 tilt = vec3((h - 0.5) * 0.08, (fract(h * 13.7) - 0.5) * 0.12, 0.0);
  vec3 r = reflect(-v, normalize(n + tilt));
  // most panes see the cobalt upper dome; only the lowest reflections pick up the tangerine band
  vec3 sky = mix(a3dSrgbToLinear(glassHorizon), a3dSrgbToLinear(glassSky), smoothstep(-0.12, 0.18, r.y + (h - 0.5) * 0.2));
  float fres = 0.12 + 0.5 * pow(1.0 - a3dSaturate(dot(n, v)), 5.0);
  vec3 body = a3dSrgbToLinear(glassBody);
  vec3 glass = mix(body, sky, fres);
  float glint = pow(a3dSaturate(dot(r, normalize(sunDirection))), 64.0) * sunGlint;
  glass += a3dSrgbToLinear(sunTint) * glint;
  // lit panes: a few by day, most of the floors toward night
  float win = fract(h * 91.7);
  float litFrac = 0.015 + 0.55 * windowsLit * windowsLit;
  float lit = step(1.0 - litFrac, win) * (1.0 - frame);
  glass += mix(vec3(1.0, 0.7, 0.36), vec3(0.72, 0.8, 1.0), step(0.8, fract(win * 7.3))) * lit * (0.04 + 0.75 * windowsLit);
  // spandrels and mullions: dark anodised metal catching a little of the sky
  vec3 metal = body * 0.32 + sky * 0.04;
  vec3 col = mix(glass, metal, frame * (1.0 - roof));
  // roof: dark parapet top, a 1.6 m parapet band, a tangerine LED crown line that comes up toward dusk
  col = mix(col, body * 0.35, roof);
  float parapet = (1.0 - roof) * (1.0 - step(1.6, vTop));
  col = mix(col, metal * 0.8, parapet);
  float crown = (1.0 - roof) * (1.0 - smoothstep(0.0, 0.35, abs(vTop - 2.0)));
  col += a3dSrgbToLinear(crownColor) * crown * crownGain;
  // the bases sink into the haze below the deck
  vec3 haze = a3dSrgbToLinear(hazeColor);
  float floorHaze = 1.0 - smoothstep(-28.0, -6.0, vW.y);
  col = mix(col, haze, floorHaze * 0.85);
  // aerial perspective: far towers fade toward the haze/horizon mix, so the rows separate in depth
  float dist = length(cameraPosition - vW);
  // cool air: the row's haze leaning to the dome's upper colour (the warm horizon mix browned the dark glass)
  vec3 air = mix(haze, a3dSrgbToLinear(glassSky), 0.4);
  col = mix(col, air, (1.0 - exp(-max(dist - 40.0, 0.0) / 240.0)) * 0.62);
  outColor = vec4(a3dFinite(col), 1.0);
}`;

/** Curtain-wall glass for one variant (body tint differs per variant so the three read as a kit, not clones). */
export function towerGlassSpec(variant: TowerVariant): CustomSpec {
  const body: Record<TowerVariant, [number, number, number]> = {
    slab: [0.24, 0.31, 0.42],
    stepped: [0.29, 0.31, 0.36],
    blade: [0.2, 0.28, 0.42]
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
      hazeColor: { type: "vec3", value: [0.44, 0.42, 0.53] },
      crownColor: { type: "vec3", value: [1, 0.54, 0.24] },
      crownGain: { type: "f32", value: 0.6 }
    },
    // GU47 phase 3: the warm scene fog (sunset #c98a6a from 43 m) turned the 40-150 m towers into brick-brown walls; the
    // facade does its own cooler aerial perspective toward the row's haze colour instead
    fog: false
  };
}
