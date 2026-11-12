// Wonder World asset traits & layout metrics (PRD 02 section 6, 04 D01-D13, PRD 5.5.1 §3).
//
// Every stage actor and prop is sculpted natively via `PROCEDURAL_RIGS`
// (`src/scenes/procedural-rigs/index.ts`) with zero external `.glb` files and
// zero crude programmer-art boxes. This module retains the canonical layout,
// footprint, picking, resting-surface, and locomotion traits for all 66
// `StageAssetKey`s plus thin primitive parameter helpers used by diorama worlds.

import { MODEL_INFO, type ModelKey } from "../aura-assets.js";
import type { MoveStyle, PropAssetId } from "../types.js";
import type { Vec3 } from "./motion.js";
import { PROCEDURAL_RIGS } from "./procedural-rigs/index.js";

export type LayoutRole = "actor" | "surface" | "container" | "occluder" | "stackable" | "plain";

/** Every asset the stage can place: the 65 procedural model keys plus the thin-film soap bubble. */
export type StageAssetKey = ModelKey | "bubble";

// ---------------------------------------------------------------- traits

export interface AssetTraits {
  /** Footprint width and depth as fractions of the height (picking boxes, spacing). */
  readonly width: number;
  readonly depth: number;
  readonly layout: LayoutRole;
  /** Surfaces and containers: where things rest, as a fraction of the height. */
  readonly restAt?: number;
  /** Rolls about its centre (radius = height / 2). */
  readonly round?: boolean;
  /** Swings open on a left hinge. */
  readonly door?: boolean;
  /** Opens like a box, basket or building. */
  readonly container?: boolean;
  /** Hovers above the ground (balloons, clouds, Lumi). */
  readonly floats?: boolean;
  /** How a PropPlacement tint is applied to target lobes: multiply or replace. */
  readonly tintMode: "multiply" | "replace";
  /** How far it turns toward its travel direction: fully (vehicles), partly (characters), not at all. */
  readonly turns: "full" | "partial" | "none";
  /** Secondary idle motion (dropped in reduced motion). */
  readonly idle: "none" | "breathe" | "sway" | "float" | "flutter";
  /** Move style when an action names none. */
  readonly defaultStyle: MoveStyle;
}

const trait = (
  width: number,
  depth: number,
  layout: LayoutRole,
  extra: Partial<AssetTraits> = {}
): AssetTraits => ({
  width,
  depth,
  layout,
  tintMode: "multiply",
  turns: "none",
  idle: "none",
  defaultStyle: "slide",
  ...extra
});

const character = (width: number, depth: number, extra: Partial<AssetTraits> = {}): AssetTraits =>
  trait(width, depth, "actor", { turns: "partial", idle: "breathe", defaultStyle: "walk", ...extra });

export const ASSET_TRAITS: Readonly<Record<StageAssetKey, AssetTraits>> = {
  momo: character(0.95, 0.85),
  lulu: character(0.66, 0.62),
  sheru: character(0.72, 1.15),
  gogo: character(0.72, 1.3, { turns: "full", idle: "none", defaultStyle: "drive" }),
  gogoCarriage: trait(0.9, 1.3, "plain", { turns: "full", defaultStyle: "drive" }),
  lumi: character(1.0, 0.4, { floats: true, turns: "none", idle: "float", defaultStyle: "float" }),
  peeko: character(0.95, 0.9, { defaultStyle: "hop" }),
  teddy: character(0.8, 0.7, { idle: "none" }),
  robot: character(0.62, 0.55),
  cow: character(0.62, 1.15),
  sheep: character(0.9, 1.15),
  duck: character(0.9, 1.0, { defaultStyle: "hop" }),
  horse: character(0.5, 1.1),
  bird: character(0.9, 1.0, { defaultStyle: "fly" }),
  butterfly: trait(1.6, 0.35, "plain", { floats: true, idle: "flutter", defaultStyle: "fly" }),
  ball: trait(1, 1, "plain", { round: true, tintMode: "replace", defaultStyle: "roll" }),
  bubbleWand: trait(0.45, 0.15, "plain"),
  cookie: trait(2.3, 2.3, "plain"),
  plate: trait(5, 5, "surface", { restAt: 1, tintMode: "replace" }),
  mirror: trait(1.0, 0.35, "plain"),
  door: trait(0.62, 0.1, "occluder", { door: true, tintMode: "replace" }),
  letterB: trait(0.78, 0.25, "plain", { tintMode: "replace" }),
  letterA: trait(0.8, 0.25, "plain", { tintMode: "replace" }),
  apple: trait(1, 1, "plain"),
  banana: trait(1.2, 0.5, "plain"),
  // A surface whose rest height is the candle top: the E16 candle flame sits directly on the wick tip.
  cake: trait(1.35, 1.35, "surface", { restAt: 1 }),
  drum: trait(1.15, 1.15, "plain"),
  shaker: trait(0.6, 0.6, "plain"),
  toyPiano: trait(1.45, 0.85, "plain"),
  picnicBasket: trait(1.35, 0.95, "container", { restAt: 0.6, container: true }),
  car: trait(1.05, 1.5, "plain", { turns: "full", tintMode: "replace", defaultStyle: "drive" }),
  sponge: trait(2, 1.4, "plain", { tintMode: "replace" }),
  towel: trait(3, 2.2, "plain", { tintMode: "replace" }),
  toyBlock: trait(1, 1, "stackable", { tintMode: "replace" }),
  lift: trait(0.56, 0.4, "container", { restAt: 0.06, container: true }),
  flower: trait(0.45, 0.3, "plain", { idle: "sway" }),
  flowerBud: trait(0.35, 0.3, "plain", { idle: "sway" }),
  tree: trait(0.75, 0.75, "occluder"),
  bush: trait(1.5, 1.25, "occluder"),
  barn: trait(1.15, 0.85, "occluder", { container: true }),
  station: trait(1.55, 0.65, "occluder"),
  tunnel: trait(1.65, 1.05, "occluder", { container: true }),
  house: trait(1.05, 0.65, "occluder", { container: true }),
  bed: trait(1.9, 1.2, "surface", { restAt: 0.62 }),
  sink: trait(0.8, 0.65, "plain"),
  table: trait(1.65, 1.65, "surface", { restAt: 1 }),
  chair: trait(0.65, 0.65, "surface", { restAt: 0.6 }),
  cushion: trait(2.2, 2.2, "surface", { restAt: 0.9, tintMode: "replace" }),
  toyBox: trait(1.3, 0.9, "container", { restAt: 0.2, container: true }),
  bench: trait(2.1, 0.65, "surface", { restAt: 0.7 }),
  colourMachine: trait(0.85, 0.6, "occluder", { container: true }),
  storyBox: trait(1.25, 0.95, "container", { restAt: 0.2, container: true }),
  pastryCircle: trait(3.75, 3.75, "plain", { tintMode: "replace" }),
  pastrySquare: trait(3.75, 3.75, "plain", { tintMode: "replace" }),
  pastryTriangle: trait(4, 3.5, "plain", { tintMode: "replace" }),
  hat: trait(2.2, 2.2, "plain", { tintMode: "replace" }),
  stompStone: trait(5, 5, "surface", { restAt: 1, tintMode: "replace" }),
  cloud: trait(1.6, 0.9, "plain", { floats: true, idle: "float", defaultStyle: "float" }),
  balloon: trait(0.8, 0.8, "plain", { floats: true, idle: "sway", tintMode: "replace", defaultStyle: "float" }),
  letterBLower: trait(0.7, 0.25, "plain", { tintMode: "replace" }),
  letterALower: trait(1.0, 0.25, "plain", { tintMode: "replace" }),
  toothbrush: trait(0.5, 0.4, "plain"),
  sun: trait(1.0, 0.35, "plain", { floats: true, defaultStyle: "float" }),
  candleFlame: trait(0.55, 0.55, "plain"),
  partyHat: trait(0.75, 0.75, "plain", { tintMode: "replace" }),
  bubble: trait(1, 1, "plain", { round: true, floats: true, idle: "float", defaultStyle: "float" })
};

export function assetTraits(key: StageAssetKey): AssetTraits {
  return ASSET_TRAITS[key];
}

/** Default fitted height of an asset in metres (MODEL_INFO for procedural rigs, 0.5 m for the bubble). */
export function defaultHeightM(key: StageAssetKey): number {
  return key === "bubble" ? 0.5 : MODEL_INFO[key].heightM;
}

/** Width, height and depth in metres of an asset fitted to `heightM`. */
export function footprintM(key: StageAssetKey, heightM: number): Vec3 {
  const t = ASSET_TRAITS[key];
  return [t.width * heightM, heightM, t.depth * heightM];
}

export function isStageAssetKey(value: string): value is StageAssetKey {
  return Object.prototype.hasOwnProperty.call(ASSET_TRAITS, value);
}

/** PropAssetId to the stage asset key (identical names; the function documents the mapping). */
export function propAssetKey(asset: PropAssetId): StageAssetKey {
  return asset;
}

// ---------------------------------------------------------------- diorama primitive helpers

export type StandInShape = "sphere" | "capsule" | "box" | "cylinder" | "torus" | "cone";

/**
 * The cone generator follows three.js (radius 1, so the base is twice as wide
 * as the other unit shapes); radius 0.5 makes `size` the real base diameter.
 */
const UNIT_CONE_RADIUS = 0.5;

/** Engine `params` for a diorama primitive piece: unit cones, cylinder segments, torus tube. */
export function primitiveParams(
  shape: StandInShape,
  segments?: number,
  tube?: number
): { radius?: number; radialSegments?: number; tube?: number } | undefined {
  const params: { radius?: number; radialSegments?: number; tube?: number } = {};
  if (shape === "cone") params.radius = UNIT_CONE_RADIUS;
  if (segments !== undefined && (shape === "cylinder" || shape === "cone" || shape === "torus" || shape === "capsule")) {
    params.radialSegments = segments;
  }
  if (shape === "torus" && tube !== undefined) params.tube = tube;
  return Object.keys(params).length > 0 ? params : undefined;
}

/** Number of interactive material lobes a procedural rig mounts (for draw-call budgeting). */
export function standInPieceCount(key: StageAssetKey): number {
  return PROCEDURAL_RIGS[key].parts.reduce((sum, part) => sum + part.lobes.length, 0);
}
