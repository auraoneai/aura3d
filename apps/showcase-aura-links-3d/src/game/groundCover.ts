/**
 * GU47 LINKS-09: instanced ground cover in the rough, one look per course theme. Pure (no engine calls): it returns the
 * transforms and colours main.ts hands to two `instances.*` draws, so tests can count and place them.
 *
 * - layer "tufts": thin cones (grass tufts, marram, fescue; ash spikes at Cinder Rim, regolith pebbles on Mare as
 *   squat spheres), 3,200 on High and half on Low (PRD: phone <= 50% instances);
 * - layer "accents": the theme's colour note (wildflowers on the dunes, fallen leaves in Maple, embers of heather-like
 *   scorch at Cinder, snow patches on Cloud Terrace, wet litter glints in Neon Bay, bright pebbles on Mare), 600 High.
 *
 * Instances go only where `terrain.zone` says rough (never fairway, fringe, green, sand, water, tee or out of bounds),
 * from their own seeded generator, so the hole's sim and replays never see them. Wind sways the tufts (E-G instance
 * wind) except on Mare (no air) and under reduced motion (PRD §6.3).
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

const tuft = (colors: readonly string[], sways = true): CoverLayer => ({ name: "tufts", shape: "cone", size: [0.16, 0.42, 0.16], colors, roughness: 0.9, emissive: 0, sways });

export const COVER_LAYERS: Record<CourseTheme, readonly [CoverLayer, CoverLayer]> = {
  dunes: [tuft(["#9a9a62", "#b2a872", "#7d8a52"]), { name: "accents", shape: "sphere", size: [0.09, 0.07, 0.09], colors: ["#e8d65a", "#f2efe2", "#c9a2d6"], roughness: 0.8, emissive: 0, sways: true }],
  parkland: [tuft(["#4f7a34", "#5f8a3c", "#3f6a2c"]), { name: "accents", shape: "box", size: [0.14, 0.012, 0.1], colors: ["#c8562a", "#e08a2c", "#a83a24"], roughness: 0.85, emissive: 0, sways: false }],
  volcanic: [tuft(["#3a3430", "#4a3e36", "#2e2a26"], false), { name: "accents", shape: "sphere", size: [0.07, 0.05, 0.07], colors: ["#ff6a1a", "#ff8c2a"], roughness: 0.6, emissive: 1.6, sways: false }],
  alpine: [tuft(["#6c8a52", "#7d9a5e", "#5a7646"]), { name: "accents", shape: "box", size: [0.9, 0.03, 0.7], colors: ["#f4f8fc", "#e6eef6"], roughness: 0.55, emissive: 0, sways: false }],
  nightCity: [tuft(["#2f5a3a", "#3a6a44", "#264c32"]), { name: "accents", shape: "box", size: [0.06, 0.01, 0.06], colors: ["#2ae0e0", "#ff3aa8"], roughness: 0.2, emissive: 0.9, sways: false }],
  lunar: [{ name: "tufts", shape: "sphere", size: [0.16, 0.08, 0.14], colors: ["#5a5c62", "#6a6c72", "#4a4c52"], roughness: 0.97, emissive: 0, sways: false }, { name: "accents", shape: "sphere", size: [0.3, 0.16, 0.26], colors: ["#8a8c92", "#9a9ca2"], roughness: 0.95, emissive: 0, sways: false }]
};

/** Seeded placement of one layer: rejection-sampled inside the terrain bounds, rough only. */
function place(terrain: HoleTerrain, layer: CoverLayer, count: number, seed: number): CoverPlan {
  const rng = makeRng(seed);
  const { minX, maxX, minZ, maxZ } = terrain.bounds;
  const transforms: CoverInstance[] = [];
  const colors: string[] = [];
  const budget = count * 12;
  for (let tries = 0; tries < budget && transforms.length < count; tries++) {
    const x = minX + (maxX - minX) * rng();
    const z = minZ + (maxZ - minZ) * rng();
    const s = 0.6 + 0.8 * rng();
    const yaw = rng() * Math.PI * 2;
    const tilt = layer.shape === "cone" ? (rng() - 0.5) * 0.35 : 0;
    const pick = rng();
    if (terrain.zone(x, z) !== "rough") continue;
    const h = layer.size[1] * s;
    const y = terrain.height(x, z) + (layer.shape === "cone" ? h / 2 - 0.02 : layer.shape === "box" ? 0.01 : h * 0.2);
    transforms.push({ position: [x, y, z], rotation: [tilt, yaw, 0], scale: [s, s, s] });
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
