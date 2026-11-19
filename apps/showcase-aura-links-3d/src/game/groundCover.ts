/**
 * GU47 LINKS-09: instanced ground cover in the rough, one look per course theme. Pure (no engine calls): it returns the
 * transforms and colours main.ts hands to two `instances.*` draws, so tests can count and place them.
 *
 * - layer "tufts": thin cones (grass tufts, marram, fescue; ash spikes at Cinder Rim, regolith pebbles on Mare as
 *   flat irregular rock chips), 3,200 on High and half on Low (PRD: phone <= 50% instances);
 * - layer "accents": the theme's colour note (wildflowers on the dunes, fallen leaves in Maple, embers of heather-like
 *   scorch at Cinder, snow patches on Cloud Terrace, wet litter glints in Neon Bay, half-buried rocks on Mare), 600 High.
 *
 * Instances go only where `terrain.zone` says rough (never fairway, fringe, green, sand, water, tee or out of bounds)
 * and never within TEE_COVER_CLEAR_M of the tee, from their own seeded generator, so the hole's sim and replays never
 * see them. Wind sways the tufts (E-G instance wind) except on Mare (no air) and under reduced motion (PRD §6.3).
 *
 * No cover may read as a spare golf ball (tests/unit/aura-links-3d/no-ball-lookalikes.test.ts): 2026-11-18 owner reports
 * on St Auroras (an off-white 9 cm wildflower sphere) and on Mare ("a ball 1-2 m up the aim line": the old 0.18-0.42 m
 * "bright pebble" domes, #8a8c92 and #9a9ca2 over the #7a7d84 rough, read as balls once the regolith is lit). Mare's
 * rocks are now `rock` layers: each instance gets its own flat, irregular proportions (wider than tall), a random tilt,
 * sinks into the regolith, and is darker than the regolith around it.
 */
import { makeRng } from "./sim";
import type { CourseTheme, HoleTerrain } from "./types";

export type CoverShape = "cone" | "sphere" | "box";

export interface CoverLayer {
  readonly name: "tufts" | "accents";
  readonly shape: CoverShape;
  /** unit primitive size; each instance scales it */
  readonly size: readonly [number, number, number];
  readonly colors: readonly string[];
  readonly roughness: number;
  /** emissive glint (Neon Bay litter under the floodlights), 0 = none */
  readonly emissive: number;
  readonly sways: boolean;
  /**
   * Rock chips instead of a round primitive: per instance, x and z scale independently (0.75-1.35x), y is flattened to
   * ROCK_FLATTEN of the wider side, the chip tilts up to ROCK_TILT_RAD and sinks so only a low cap shows above the ground.
   */
  readonly rock?: boolean;
}

export interface CoverInstance {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface CoverPlan {
  readonly layer: CoverLayer;
  readonly transforms: readonly CoverInstance[];
  readonly colors: readonly string[];
}

export const COVER_COUNTS = { high: { tufts: 3200, accents: 600 }, low: { tufts: 1600, accents: 300 } } as const;

/**
 * No cover within this distance (m) of the tee spot (the ball at address). The tee zone is only the 8 x 9 m box around the
 * tee, so rough beside it could carry cover 4 m from the ball; this keeps the tee box plus a ~3 m margin clear.
 */
export const TEE_COVER_CLEAR_M = 8;
/** rock chips: height range as a fraction of the wider horizontal side */
export const ROCK_FLATTEN: readonly [number, number] = [0.3, 0.45];
/** rock chips: max tilt about x and z (rad) */
export const ROCK_TILT_RAD = 0.28;

const tuft = (colors: readonly string[], sways = true): CoverLayer => ({ name: "tufts", shape: "cone", size: [0.16, 0.42, 0.16], colors, roughness: 0.9, emissive: 0, sways });

export const COVER_LAYERS: Record<CourseTheme, readonly [CoverLayer, CoverLayer]> = {
  // wildflowers: saturated only (the #c9a2d6 lilac was a pale near-neutral 9 cm sphere, see no-ball-lookalikes)
  dunes: [tuft(["#9a9a62", "#b2a872", "#7d8a52"]), { name: "accents", shape: "sphere", size: [0.09, 0.07, 0.09], colors: ["#e8d65a", "#d9a441", "#a865c9"], roughness: 0.8, emissive: 0, sways: true }],
  parkland: [tuft(["#4f7a34", "#5f8a3c", "#3f6a2c"]), { name: "accents", shape: "box", size: [0.14, 0.012, 0.1], colors: ["#c8562a", "#e08a2c", "#a83a24"], roughness: 0.85, emissive: 0, sways: false }],
  volcanic: [tuft(["#3a3430", "#4a3e36", "#2e2a26"], false), { name: "accents", shape: "sphere", size: [0.07, 0.05, 0.07], colors: ["#ff6a1a", "#ff8c2a"], roughness: 0.6, emissive: 1.6, sways: false }],
  alpine: [tuft(["#6c8a52", "#7d9a5e", "#5a7646"]), { name: "accents", shape: "box", size: [0.9, 0.03, 0.7], colors: ["#f4f8fc", "#e6eef6"], roughness: 0.55, emissive: 0, sways: false }],
  nightCity: [tuft(["#2f5a3a", "#3a6a44", "#264c32"]), { name: "accents", shape: "box", size: [0.06, 0.01, 0.06], colors: ["#2ae0e0", "#ff3aa8"], roughness: 0.2, emissive: 0.9, sways: false }],
  // Mare: dark flat rock chips and half-buried rocks, all darker than the #7a7d84 regolith rough (they were #8a8c92 and
  // #9a9ca2 "bright pebble" domes)
  lunar: [
    { name: "tufts", shape: "sphere", size: [0.16, 0.06, 0.14], colors: ["#5a5c62", "#62646a", "#4e5056"], roughness: 0.97, emissive: 0, sways: false, rock: true },
    { name: "accents", shape: "sphere", size: [0.3, 0.12, 0.26], colors: ["#66686d", "#6e6f72", "#5e6064"], roughness: 0.95, emissive: 0, sways: false, rock: true }
  ]
};

/** Seeded placement of one layer: rejection-sampled inside the terrain bounds, rough only. */
function place(terrain: HoleTerrain, layer: CoverLayer, count: number, seed: number): CoverPlan {
  const rng = makeRng(seed);
  const { minX, maxX, minZ, maxZ } = terrain.bounds;
  const transforms: CoverInstance[] = [];
  const colors: string[] = [];
  const budget = count * 12;
  const [teeX, , teeZ] = terrain.tee;
  for (let tries = 0; tries < budget && transforms.length < count; tries++) {
    const x = minX + (maxX - minX) * rng();
    const z = minZ + (maxZ - minZ) * rng();
    const s = 0.6 + 0.8 * rng();
    const yaw = rng() * Math.PI * 2;
    const tilt = layer.shape === "cone" ? (rng() - 0.5) * 0.35 : 0;
    const pick = rng();
    // rock chips draw their own proportions and tilt (only rock layers, so every other theme keeps its placement)
    const rock = layer.rock ? [0.75 + 0.6 * rng(), 0.75 + 0.6 * rng(), rng(), (rng() - 0.5) * 2 * ROCK_TILT_RAD, (rng() - 0.5) * 2 * ROCK_TILT_RAD] as const : null;
    if (terrain.zone(x, z) !== "rough") continue;
    if (Math.hypot(x - teeX, z - teeZ) < TEE_COVER_CLEAR_M) continue;
    if (rock) {
      const sx = s * rock[0], sz = s * rock[1];
      const wide = Math.max(layer.size[0] * sx, layer.size[2] * sz);
      const flatten = ROCK_FLATTEN[0] + (ROCK_FLATTEN[1] - ROCK_FLATTEN[0]) * rock[2];
      const sy = (wide * flatten) / layer.size[1];
      const h = layer.size[1] * sy;
      // the centre sits a quarter of the height below the ground: a low, half-buried cap
      transforms.push({ position: [x, terrain.height(x, z) - h * 0.25, z], rotation: [rock[3], yaw, rock[4]], scale: [sx, sy, sz] });
    } else {
      const h = layer.size[1] * s;
      const y = terrain.height(x, z) + (layer.shape === "cone" ? h / 2 - 0.02 : layer.shape === "box" ? 0.01 : h * 0.2);
      transforms.push({ position: [x, y, z], rotation: [tilt, yaw, 0], scale: [s, s, s] });
    }
    colors.push(layer.colors[Math.floor(pick * layer.colors.length) % layer.colors.length]!);
  }
  return { layer, transforms, colors };
}

/** The two ground-cover layers of a hole (High or Low counts). */
export function groundCover(terrain: HoleTerrain, theme: CourseTheme, holeNumber: number, tier: "high" | "low"): readonly [CoverPlan, CoverPlan] {
  const [tufts, accents] = COVER_LAYERS[theme];
  const n = COVER_COUNTS[tier];
  const seed = 0x9c0f + holeNumber * 977 + theme.length * 31;
  return [place(terrain, tufts, n.tufts, seed), place(terrain, accents, n.accents, seed + 1)];
}

/** E-G instance wind for the tuft layer: off on Mare, still under reduced motion. */
export function coverWind(layer: CoverLayer, reducedMotion: boolean, flagFlutter: number): false | { readonly strength: number; readonly gustStrength: number; readonly assetHeight: number } {
  if (!layer.sways || reducedMotion || flagFlutter <= 0) return false;
  return { strength: Math.min(1.2, 0.4 + flagFlutter * 2), gustStrength: 0.3, assetHeight: layer.size[1] };
}
