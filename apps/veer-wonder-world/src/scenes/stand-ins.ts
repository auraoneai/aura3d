// Wonder World stand-ins and asset traits (PRD 02 section 6, 04 D01-D13).
//
// Every model use falls back to a primitive stand-in of the right size and
// colour when the GLB is missing, still loading past its timeout, or switched
// off with `?models=0`. A movable stand-in is one runtime node with the same id
// the model would have had (plus a few follower parts such as eyes, each its
// own runtime node `<id>~<n>` that the stage moves with it). Static world
// dressing uses the same recipes without runtime ids.
//
// The `bubble` prop has no model at all: it is always this soft translucent
// sphere with a small shine.
//
// Sizes and centres in the recipes are in units of the node height `h`, so one
// recipe serves any fitted size (PropPlacement.size).

import { material, primitives, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import { MODEL_INFO, type ModelKey } from "../aura-assets.js";
import type { MoveStyle, PropAssetId } from "../types.js";
import { composeRotation, rotateZYX, type Vec3 } from "./motion.js";
import type { LayoutRole } from "./spots.js";

/** Every asset the stage can place: the 59 generated model keys plus the procedural bubble. */
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
  /** How a PropPlacement tint is applied to the model: multiply over its texture, or replace the colour. */
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
  // A surface whose rest height is the candle top: the E16 candle flame (a small prop on the cake's spot) sits on it.
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
  bubble: trait(1, 1, "plain", { round: true, floats: true, idle: "float", defaultStyle: "float" })
};

export function assetTraits(key: StageAssetKey): AssetTraits {
  return ASSET_TRAITS[key];
}

/** Default fitted height of an asset in metres (MODEL_INFO for models, 0.5 m for the bubble). */
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

// ---------------------------------------------------------------- recipes

export type StandInShape = "sphere" | "capsule" | "box" | "cylinder" | "torus" | "cone";

export interface StandInPiece {
  readonly shape: StandInShape;
  readonly color: string;
  /**
   * Size in units of h ([w, h, d]). A torus scales the engine's unit torus (in
   * the XY plane, ring radius 0.43, tube `tube`), so its outer diameter is
   * `size[0] * 2 * (0.43 + tube)` and `size[2]` scales the tube depth.
   */
  readonly size: Vec3;
  /** Centre relative to the base point, in units of h. */
  readonly center: Vec3;
  /** Constant local rotation, added to the node rotation. */
  readonly rotation?: Vec3;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly opacity?: number;
  readonly emissive?: { readonly color: string; readonly intensity: number };
  /** Radial segments for cylinders (3 makes the triangle pastry). */
  readonly segments?: number;
  /** Torus tube radius of the unit torus (engine default 0.045, a thin wire). */
  readonly tube?: number;
  /** Casts a shadow (default: main piece yes, parts no). */
  readonly shadow?: boolean;
  /** This piece takes the placement tint (default: only the main piece). */
  readonly tinted?: boolean;
}

export interface StandInRecipe {
  readonly main: StandInPiece;
  readonly parts: readonly StandInPiece[];
}

const INK = "#2B2340";
const WHITE = "#FFFFFF";

const piece = (shape: StandInShape, color: string, size: Vec3, center: Vec3, extra: Partial<StandInPiece> = {}): StandInPiece => ({
  shape,
  color,
  size,
  center,
  ...extra
});

/** Two friendly eyes (white with a dark pupil) at height y, spacing ±x, front depth z (units of h). */
function eyes(x: number, y: number, z: number, white: number, pupil: number): readonly StandInPiece[] {
  return [
    piece("sphere", WHITE, [white, white, white * 0.7], [-x, y, z], { roughness: 0.35 }),
    piece("sphere", WHITE, [white, white, white * 0.7], [x, y, z], { roughness: 0.35 }),
    piece("sphere", INK, [pupil, pupil, pupil * 0.6], [-x, y, z + white * 0.32], { roughness: 0.25 }),
    piece("sphere", INK, [pupil, pupil, pupil * 0.6], [x, y, z + white * 0.32], { roughness: 0.25 })
  ];
}

/** Two small dark dot eyes. */
function dotEyes(x: number, y: number, z: number, size: number): readonly StandInPiece[] {
  return [
    piece("sphere", INK, [size, size, size * 0.6], [-x, y, z], { roughness: 0.25 }),
    piece("sphere", INK, [size, size, size * 0.6], [x, y, z], { roughness: 0.25 })
  ];
}

/** Five soft star points in the XY plane around a centre at height y. */
function starPoints(color: string, y: number): readonly StandInPiece[] {
  const out: StandInPiece[] = [];
  for (let k = 0; k < 5; k += 1) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    out.push(piece("cone", color, [0.24, 0.3, 0.2], [Math.cos(a) * 0.33, y + Math.sin(a) * 0.33, 0], {
      rotation: [0, 0, a - Math.PI / 2],
      emissive: { color: "#FFC83A", intensity: 0.22 }
    }));
  }
  return out;
}

const r = (main: StandInPiece, parts: readonly StandInPiece[] = []): StandInRecipe => ({ main, parts });

export const STAND_INS: Readonly<Record<StageAssetKey, StandInRecipe>> = {
  // ---- the six friends
  momo: r(piece("sphere", "#8E6CD8", [0.88, 1, 0.8], [0, 0.5, 0]), [
    ...eyes(0.17, 0.66, 0.34, 0.22, 0.11),
    piece("sphere", "#7556C2", [0.24, 0.14, 0.3], [-0.2, 0.05, 0.1]),
    piece("sphere", "#7556C2", [0.24, 0.14, 0.3], [0.2, 0.05, 0.1])
  ]),
  lulu: r(piece("capsule", "#7ED6AE", [0.62, 1, 0.58], [0, 0.5, 0]), [
    ...eyes(0.12, 0.78, 0.25, 0.17, 0.085),
    piece("sphere", "#68C49B", [0.24, 0.2, 0.34], [0, 0.22, -0.32]),
    piece("sphere", "#68C49B", [0.28, 0.14, 0.34], [-0.15, 0.05, 0.1]),
    piece("sphere", "#68C49B", [0.28, 0.14, 0.34], [0.15, 0.05, 0.1])
  ]),
  sheru: r(piece("sphere", "#EAD3A8", [0.7, 0.58, 1.05], [0, 0.42, -0.05]), [
    piece("sphere", "#EAD3A8", [0.55, 0.52, 0.5], [0, 0.78, 0.38]),
    piece("sphere", "#A87B4F", [0.13, 0.32, 0.12], [-0.25, 0.86, 0.33]),
    piece("sphere", "#A87B4F", [0.13, 0.32, 0.12], [0.25, 0.86, 0.33]),
    piece("sphere", INK, [0.1, 0.08, 0.08], [0, 0.72, 0.64]),
    ...dotEyes(0.11, 0.86, 0.6, 0.08)
  ]),
  gogo: r(piece("box", "#E2483D", [0.7, 0.55, 1.15], [0, 0.42, 0]), [
    piece("box", "#B83228", [0.7, 0.42, 0.42], [0, 0.82, -0.36]),
    piece("cylinder", "#3C3C46", [0.18, 0.32, 0.18], [0, 0.85, 0.3]),
    piece("cylinder", "#2F3140", [0.32, 0.8, 0.32], [0, 0.16, 0.34], { rotation: [0, 0, Math.PI / 2] }),
    piece("cylinder", "#2F3140", [0.32, 0.8, 0.32], [0, 0.16, -0.34], { rotation: [0, 0, Math.PI / 2] }),
    ...dotEyes(0.15, 0.55, 0.59, 0.11)
  ]),
  gogoCarriage: r(piece("box", "#F5C842", [0.86, 0.5, 1.2], [0, 0.42, 0]), [
    piece("cylinder", "#2F3140", [0.36, 0.95, 0.36], [0, 0.18, 0.36], { rotation: [0, 0, Math.PI / 2] }),
    piece("cylinder", "#2F3140", [0.36, 0.95, 0.36], [0, 0.18, -0.36], { rotation: [0, 0, Math.PI / 2] })
  ]),
  lumi: r(piece("sphere", "#FFD34D", [0.5, 0.5, 0.32], [0, 0.5, 0], { emissive: { color: "#FFC83A", intensity: 0.22 } }), [
    ...starPoints("#FFD34D", 0.5),
    ...dotEyes(0.08, 0.55, 0.15, 0.08)
  ]),
  peeko: r(piece("sphere", "#FFE15A", [0.92, 1, 0.88], [0, 0.5, 0]), [
    piece("cone", "#F59A2E", [0.16, 0.22, 0.16], [0, 0.52, 0.48], { rotation: [Math.PI / 2, 0, 0] }),
    piece("sphere", "#FFD23A", [0.2, 0.22, 0.2], [0, 1.0, 0]),
    piece("sphere", "#FFD23A", [0.2, 0.36, 0.42], [-0.46, 0.45, 0]),
    piece("sphere", "#FFD23A", [0.2, 0.36, 0.42], [0.46, 0.45, 0]),
    ...dotEyes(0.16, 0.66, 0.4, 0.12)
  ]),
  // ---- friends and animals
  teddy: r(piece("sphere", "#A9744F", [0.72, 0.62, 0.62], [0, 0.31, 0]), [
    piece("sphere", "#A9744F", [0.52, 0.48, 0.48], [0, 0.78, 0]),
    piece("sphere", "#8E5E3D", [0.18, 0.18, 0.12], [-0.19, 1.0, 0]),
    piece("sphere", "#8E5E3D", [0.18, 0.18, 0.12], [0.19, 1.0, 0]),
    piece("sphere", "#D8B48C", [0.2, 0.15, 0.14], [0, 0.72, 0.23]),
    ...dotEyes(0.1, 0.84, 0.21, 0.07)
  ]),
  robot: r(piece("box", "#8EC9F0", [0.6, 0.55, 0.5], [0, 0.3, 0]), [
    piece("box", "#F2F6FA", [0.52, 0.36, 0.46], [0, 0.78, 0]),
    piece("cylinder", "#9AA6BC", [0.04, 0.12, 0.04], [0, 1.0, 0]),
    piece("sphere", "#F5A623", [0.1, 0.1, 0.1], [0, 1.07, 0]),
    piece("sphere", "#3F7FD9", [0.12, 0.12, 0.06], [-0.11, 0.8, 0.23], { emissive: { color: "#6FB0FF", intensity: 0.3 } }),
    piece("sphere", "#3F7FD9", [0.12, 0.12, 0.06], [0.11, 0.8, 0.23], { emissive: { color: "#6FB0FF", intensity: 0.3 } })
  ]),
  cow: r(piece("sphere", "#F5F2EC", [0.62, 0.52, 1.0], [0, 0.48, -0.05]), [
    piece("sphere", "#F5F2EC", [0.4, 0.38, 0.4], [0, 0.72, 0.45]),
    piece("sphere", "#3B3B42", [0.24, 0.2, 0.3], [0.18, 0.6, 0.0]),
    piece("sphere", "#3B3B42", [0.22, 0.18, 0.26], [-0.2, 0.52, -0.25]),
    piece("sphere", "#F2A7B5", [0.24, 0.16, 0.14], [0, 0.64, 0.64]),
    ...dotEyes(0.1, 0.8, 0.6, 0.07)
  ]),
  sheep: r(piece("sphere", "#FBF8F2", [0.9, 0.62, 1.05], [0, 0.48, -0.05]), [
    piece("sphere", "#E9DCCB", [0.36, 0.38, 0.36], [0, 0.66, 0.5]),
    ...dotEyes(0.09, 0.72, 0.66, 0.07)
  ]),
  duck: r(piece("sphere", "#FFD84D", [0.78, 0.6, 0.9], [0, 0.3, 0]), [
    piece("sphere", "#FFD84D", [0.46, 0.46, 0.46], [0, 0.74, 0.12]),
    piece("box", "#F59A2E", [0.22, 0.08, 0.22], [0, 0.7, 0.4]),
    ...dotEyes(0.11, 0.82, 0.32, 0.08)
  ]),
  horse: r(piece("sphere", "#C99A6B", [0.48, 0.5, 1.0], [0, 0.55, -0.05]), [
    piece("sphere", "#C99A6B", [0.3, 0.52, 0.36], [0, 0.85, 0.42]),
    piece("box", "#6E4A33", [0.1, 0.42, 0.26], [0, 0.92, 0.3]),
    ...dotEyes(0.09, 0.95, 0.57, 0.06)
  ]),
  bird: r(piece("sphere", "#4FA3E8", [0.82, 0.82, 0.9], [0, 0.45, 0]), [
    piece("cone", "#F59A2E", [0.16, 0.22, 0.16], [0, 0.5, 0.45], { rotation: [Math.PI / 2, 0, 0] }),
    piece("sphere", "#3A8DD4", [0.2, 0.4, 0.5], [-0.4, 0.42, 0]),
    piece("sphere", "#3A8DD4", [0.2, 0.4, 0.5], [0.4, 0.42, 0]),
    ...dotEyes(0.16, 0.62, 0.36, 0.12)
  ]),
  butterfly: r(piece("capsule", "#5A4A6E", [0.12, 0.6, 0.12], [0, 0.55, 0]), [
    piece("sphere", "#F58AB8", [0.75, 0.62, 0.06], [-0.42, 0.62, 0]),
    piece("sphere", "#F58AB8", [0.75, 0.62, 0.06], [0.42, 0.62, 0]),
    piece("sphere", "#F7D64A", [0.2, 0.2, 0.08], [-0.45, 0.66, 0.03]),
    piece("sphere", "#F7D64A", [0.2, 0.2, 0.08], [0.45, 0.66, 0.03])
  ]),
  // ---- toys and props
  ball: r(piece("sphere", "#E4574B", [1, 1, 1], [0, 0.5, 0], { roughness: 0.55 })),
  bubbleWand: r(piece("cylinder", "#9B6BD6", [0.1, 0.62, 0.1], [0, 0.31, 0]), [
    piece("torus", "#B48BE8", [0.42, 0.42, 0.42], [0, 0.79, 0], { tube: 0.06 })
  ]),
  cookie: r(piece("cylinder", "#D9A35F", [2.2, 1, 2.2], [0, 0.5, 0]), [
    piece("sphere", "#5C3A22", [0.32, 0.25, 0.32], [-0.4, 1.0, 0.3]),
    piece("sphere", "#5C3A22", [0.32, 0.25, 0.32], [0.45, 1.0, -0.2]),
    piece("sphere", "#5C3A22", [0.32, 0.25, 0.32], [0.05, 1.0, 0.55])
  ]),
  plate: r(piece("cylinder", "#BFE0F2", [5, 1, 5], [0, 0.5, 0], { roughness: 0.35 })),
  mirror: r(piece("cylinder", "#DDE6EE", [0.6, 0.05, 0.6], [0, 0.62, 0], { rotation: [Math.PI / 2, 0, 0], roughness: 0.08, metallic: 0.6 }), [
    piece("torus", "#F4B6C8", [0.7, 0.7, 0.7], [0, 0.62, 0], { tube: 0.1 }),
    piece("cylinder", "#F4B6C8", [0.08, 0.34, 0.08], [0, 0.17, 0]),
    piece("cylinder", "#F4B6C8", [0.4, 0.05, 0.3], [0, 0.025, 0])
  ]),
  door: r(piece("box", "#49B7B0", [0.62, 1, 0.08], [0, 0.5, 0], { tinted: true }), [
    piece("sphere", "#F2C94C", [0.06, 0.06, 0.06], [0.22, 0.48, 0.06], { roughness: 0.3 }),
    piece("box", "#FFFFFF", [0.5, 0.02, 0.09], [0, 0.85, 0], { tinted: false })
  ]),
  letterB: r(piece("box", "#3F7FD9", [0.22, 1, 0.24], [-0.24, 0.5, 0]), [
    // Chunky bowls (tube 0.2): outer radius 0.63 * size, so the top bowl reaches h and the bottom one the ground.
    piece("torus", "#3F7FD9", [0.4, 0.4, 0.55], [-0.02, 0.75, 0], { tube: 0.2, tinted: true }),
    piece("torus", "#3F7FD9", [0.46, 0.46, 0.55], [0, 0.29, 0], { tube: 0.2, tinted: true })
  ]),
  letterA: r(piece("box", "#E4574B", [0.46, 0.12, 0.24], [0, 0.34, 0]), [
    piece("box", "#E4574B", [0.18, 1.05, 0.24], [-0.19, 0.5, 0], { rotation: [0, 0, -0.36], tinted: true }),
    piece("box", "#E4574B", [0.18, 1.05, 0.24], [0.19, 0.5, 0], { rotation: [0, 0, 0.36], tinted: true })
  ]),
  apple: r(piece("sphere", "#E5484D", [1, 0.92, 1], [0, 0.46, 0], { roughness: 0.4 }), [
    piece("cylinder", "#7A5233", [0.06, 0.2, 0.06], [0, 0.98, 0]),
    piece("sphere", "#6DBE6B", [0.22, 0.08, 0.14], [0.12, 0.98, 0])
  ]),
  banana: r(piece("capsule", "#F7D64A", [0.32, 1, 0.32], [0, 0.5, 0], { rotation: [0, 0, 0.35] }), [
    piece("cylinder", "#7A5233", [0.08, 0.12, 0.08], [0.2, 0.98, 0], { rotation: [0, 0, 0.35] })
  ]),
  cake: r(piece("cylinder", "#F7A8C4", [1.3, 0.6, 1.3], [0, 0.3, 0]), [
    piece("cylinder", "#FFF1E0", [1.36, 0.12, 1.36], [0, 0.62, 0]),
    piece("cylinder", "#7FB8E8", [0.08, 0.3, 0.08], [0, 0.83, 0]),
    piece("sphere", "#FFC34D", [0.08, 0.13, 0.08], [0, 1.02, 0], { emissive: { color: "#FFB23A", intensity: 0.35 } })
  ]),
  drum: r(piece("cylinder", "#E4574B", [1.1, 1, 1.1], [0, 0.5, 0]), [
    piece("cylinder", "#FFF8EE", [1.06, 0.04, 1.06], [0, 1.0, 0]),
    piece("cylinder", "#F2C94C", [1.16, 0.08, 1.16], [0, 0.95, 0]),
    piece("cylinder", "#F2C94C", [1.16, 0.08, 1.16], [0, 0.05, 0])
  ]),
  shaker: r(piece("sphere", "#F59A2E", [0.6, 0.6, 0.6], [0, 0.7, 0]), [
    piece("cylinder", "#6DBE6B", [0.16, 0.5, 0.16], [0, 0.25, 0])
  ]),
  toyPiano: r(piece("box", "#F6B5C9", [1.4, 0.75, 0.8], [0, 0.375, 0]), [
    piece("box", "#FFFFFF", [1.2, 0.08, 0.3], [0, 0.79, 0.24]),
    piece("box", "#3D3A4A", [1.0, 0.06, 0.13], [0, 0.85, 0.17])
  ]),
  picnicBasket: r(piece("box", "#D9A15B", [1.3, 0.62, 0.9], [0, 0.31, 0]), [
    piece("torus", "#B98545", [0.95, 0.95, 0.95], [0, 0.62, 0]),
    piece("box", "#E4574B", [1.12, 0.08, 0.72], [0, 0.64, 0])
  ]),
  car: r(piece("box", "#4A8FE8", [1.0, 0.5, 1.45], [0, 0.42, 0], { tinted: true }), [
    piece("box", "#9CCBF5", [0.8, 0.38, 0.7], [0, 0.85, -0.08]),
    piece("cylinder", "#2F3140", [0.38, 1.1, 0.38], [0, 0.19, 0.46], { rotation: [0, 0, Math.PI / 2] }),
    piece("cylinder", "#2F3140", [0.38, 1.1, 0.38], [0, 0.19, -0.46], { rotation: [0, 0, Math.PI / 2] }),
    piece("sphere", "#FFF6D8", [0.16, 0.16, 0.08], [-0.3, 0.5, 0.73], { emissive: { color: "#FFF1B8", intensity: 0.2 } }),
    piece("sphere", "#FFF6D8", [0.16, 0.16, 0.08], [0.3, 0.5, 0.73], { emissive: { color: "#FFF1B8", intensity: 0.2 } })
  ]),
  sponge: r(piece("box", "#F7E26B", [2, 1, 1.4], [0, 0.5, 0], { roughness: 0.95 })),
  towel: r(piece("box", "#A8DDB5", [3, 1, 2.2], [0, 0.5, 0], { roughness: 0.95 })),
  toyBlock: r(piece("box", "#E2C08D", [1, 1, 1], [0, 0.5, 0])),
  lift: r(piece("box", "#CDBAF0", [0.56, 1, 0.08], [0, 0.5, -0.16]), [
    piece("box", "#FFE7A3", [0.5, 0.04, 0.36], [0, 0.5, 0]),
    piece("box", "#FFE7A3", [0.5, 0.04, 0.36], [0, 0.02, 0]),
    piece("box", "#B7A2E6", [0.6, 0.06, 0.4], [0, 1.0, 0]),
    piece("box", "#B7A2E6", [0.05, 1, 0.36], [-0.27, 0.5, 0]),
    piece("box", "#B7A2E6", [0.05, 1, 0.36], [0.27, 0.5, 0])
  ]),
  flower: r(piece("cylinder", "#6DBE6B", [0.06, 0.75, 0.06], [0, 0.375, 0]), [
    piece("torus", "#F58AB8", [0.42, 0.42, 0.25], [0, 0.76, 0], { tube: 0.16 }),
    piece("sphere", "#FFD54D", [0.24, 0.24, 0.14], [0, 0.76, 0.01]),
    piece("sphere", "#7CCB6A", [0.2, 0.06, 0.12], [-0.1, 0.35, 0]),
    piece("sphere", "#7CCB6A", [0.2, 0.06, 0.12], [0.1, 0.5, 0])
  ]),
  flowerBud: r(piece("cylinder", "#6DBE6B", [0.06, 0.75, 0.06], [0, 0.375, 0]), [
    piece("sphere", "#F58AB8", [0.24, 0.32, 0.24], [0, 0.86, 0]),
    piece("sphere", "#7CCB6A", [0.2, 0.06, 0.12], [-0.1, 0.35, 0]),
    piece("sphere", "#7CCB6A", [0.2, 0.06, 0.12], [0.1, 0.5, 0])
  ]),
  tree: r(piece("cylinder", "#9B6B43", [0.12, 0.48, 0.12], [0, 0.24, 0]), [
    piece("sphere", "#7CCB6A", [0.72, 0.6, 0.72], [0, 0.7, 0], { shadow: true })
  ]),
  bush: r(piece("sphere", "#7CC46E", [1.1, 0.9, 1.0], [0, 0.42, 0]), [
    piece("sphere", "#8BD07C", [0.7, 0.7, 0.7], [-0.45, 0.32, 0.05]),
    piece("sphere", "#6FB862", [0.7, 0.7, 0.7], [0.45, 0.3, -0.05])
  ]),
  barn: r(piece("box", "#D9574A", [1.1, 0.6, 0.8], [0, 0.3, 0]), [
    piece("box", "#F6EFE6", [0.66, 0.06, 0.86], [-0.27, 0.72, 0], { rotation: [0, 0, 0.62], shadow: true }),
    piece("box", "#F6EFE6", [0.66, 0.06, 0.86], [0.27, 0.72, 0], { rotation: [0, 0, -0.62], shadow: true }),
    piece("box", "#B8463B", [0.5, 0.42, 0.02], [0, 0.21, 0.41])
  ]),
  station: r(piece("box", "#F1E4C8", [1.5, 0.12, 0.62], [0, 0.06, 0]), [
    piece("box", "#A9CBEA", [0.9, 0.55, 0.42], [0, 0.39, -0.08]),
    piece("box", "#F6EFE6", [1.0, 0.08, 0.56], [0, 0.7, -0.06]),
    piece("cylinder", "#FFFFFF", [0.2, 0.03, 0.2], [0, 0.55, 0.14], { rotation: [Math.PI / 2, 0, 0] })
  ]),
  tunnel: r(piece("sphere", "#8CCB74", [1.6, 1.1, 1.0], [0, 0.22, 0]), [
    piece("cylinder", "#3D4A3A", [0.62, 0.08, 0.62], [0, 0.3, 0.46], { rotation: [Math.PI / 2, 0, 0] })
  ]),
  house: r(piece("box", "#FBE3A0", [1.0, 0.62, 0.6], [0, 0.31, 0]), [
    piece("box", "#E57B6B", [0.6, 0.06, 0.66], [-0.24, 0.74, 0], { rotation: [0, 0, 0.6], shadow: true }),
    piece("box", "#E57B6B", [0.6, 0.06, 0.66], [0.24, 0.74, 0], { rotation: [0, 0, -0.6], shadow: true }),
    piece("box", "#49B7B0", [0.2, 0.32, 0.02], [0, 0.16, 0.31]),
    piece("box", "#BFE3F7", [0.16, 0.14, 0.02], [-0.3, 0.42, 0.31]),
    piece("box", "#BFE3F7", [0.16, 0.14, 0.02], [0.3, 0.42, 0.31])
  ]),
  bed: r(piece("box", "#E8C99B", [1.85, 0.48, 1.15], [0, 0.24, 0]), [
    piece("box", "#8DB8E8", [1.5, 0.12, 1.12], [0.12, 0.54, 0]),
    piece("sphere", "#FFFFFF", [0.5, 0.2, 0.7], [-0.6, 0.66, 0]),
    piece("box", "#E8C99B", [0.12, 1, 1.15], [-0.92, 0.5, 0])
  ]),
  sink: r(piece("cylinder", "#F4F7F6", [0.34, 0.75, 0.34], [0, 0.375, 0]), [
    piece("cylinder", "#BFEBDD", [0.78, 0.22, 0.62], [0, 0.85, 0]),
    piece("cylinder", "#C9D2D8", [0.06, 0.2, 0.06], [0, 1.0, -0.22], { metallic: 0.5, roughness: 0.3 })
  ]),
  table: r(piece("cylinder", "#E3C391", [1.6, 0.1, 1.6], [0, 0.95, 0]), [
    piece("cylinder", "#D2AD78", [0.12, 0.9, 0.12], [-0.5, 0.45, -0.5]),
    piece("cylinder", "#D2AD78", [0.12, 0.9, 0.12], [0.5, 0.45, -0.5]),
    piece("cylinder", "#D2AD78", [0.12, 0.9, 0.12], [-0.5, 0.45, 0.5]),
    piece("cylinder", "#D2AD78", [0.12, 0.9, 0.12], [0.5, 0.45, 0.5])
  ]),
  chair: r(piece("box", "#F6B27A", [0.62, 0.08, 0.62], [0, 0.56, 0]), [
    piece("box", "#F6B27A", [0.62, 0.5, 0.08], [0, 0.85, -0.27]),
    piece("cylinder", "#E39A5E", [0.08, 0.52, 0.08], [-0.24, 0.26, -0.24]),
    piece("cylinder", "#E39A5E", [0.08, 0.52, 0.08], [0.24, 0.26, -0.24]),
    piece("cylinder", "#E39A5E", [0.08, 0.52, 0.08], [-0.24, 0.26, 0.24]),
    piece("cylinder", "#E39A5E", [0.08, 0.52, 0.08], [0.24, 0.26, 0.24])
  ]),
  cushion: r(piece("sphere", "#B48BE0", [2.2, 1, 2.2], [0, 0.5, 0], { roughness: 0.95 })),
  toyBox: r(piece("box", "#A6DDB3", [1.3, 0.9, 0.9], [0, 0.45, 0]), [
    piece("box", "#8FCFA0", [1.32, 0.08, 0.6], [0, 1.02, -0.62], { rotation: [-1.1, 0, 0] })
  ]),
  bench: r(piece("box", "#E3C391", [2.0, 0.12, 0.6], [0, 0.66, 0]), [
    piece("box", "#D2AD78", [0.12, 0.6, 0.5], [-0.82, 0.3, 0]),
    piece("box", "#D2AD78", [0.12, 0.6, 0.5], [0.82, 0.3, 0])
  ]),
  colourMachine: r(piece("box", "#C7B3F2", [0.8, 0.7, 0.55], [0, 0.35, 0]), [
    piece("cone", "#F7B8D2", [0.5, 0.3, 0.5], [0, 0.86, 0], { rotation: [Math.PI, 0, 0] }),
    piece("box", "#A9D4F2", [0.26, 0.1, 0.26], [0, 0.12, 0.34]),
    piece("sphere", "#E4574B", [0.1, 0.1, 0.06], [-0.2, 0.5, 0.28]),
    piece("sphere", "#F2C94C", [0.1, 0.1, 0.06], [0, 0.5, 0.28]),
    piece("sphere", "#3F7FD9", [0.1, 0.1, 0.06], [0.2, 0.5, 0.28])
  ]),
  storyBox: r(piece("box", "#B79AE6", [1.2, 0.9, 0.9], [0, 0.45, 0]), [
    piece("box", "#A385DA", [1.22, 0.08, 0.6], [0, 1.02, -0.6], { rotation: [-1.1, 0, 0] }),
    piece("sphere", "#F7D64A", [0.14, 0.14, 0.04], [-0.3, 0.55, 0.46], { emissive: { color: "#FFD54D", intensity: 0.2 } }),
    piece("sphere", "#F7D64A", [0.12, 0.12, 0.04], [0.28, 0.35, 0.46], { emissive: { color: "#FFD54D", intensity: 0.2 } })
  ]),
  pastryCircle: r(piece("cylinder", "#E9B872", [3.75, 1, 3.75], [0, 0.5, 0])),
  pastrySquare: r(piece("box", "#E9B872", [3.75, 1, 3.75], [0, 0.5, 0])),
  pastryTriangle: r(piece("cylinder", "#E9B872", [4.2, 1, 4.2], [0, 0.5, 0], { segments: 3 })),
  hat: r(piece("cylinder", "#E4574B", [1.2, 0.72, 1.2], [0, 0.46, 0]), [
    piece("cylinder", "#E4574B", [2.2, 0.12, 2.2], [0, 0.06, 0], { tinted: true })
  ]),
  stompStone: r(piece("cylinder", "#CDB8F2", [5, 1, 5], [0, 0.5, 0], { roughness: 0.9 })),
  cloud: r(piece("sphere", "#FFFFFF", [1.3, 0.75, 0.85], [0, 0.42, 0], { roughness: 0.95 }), [
    piece("sphere", "#F7F5FF", [0.85, 0.6, 0.7], [-0.55, 0.32, 0.02], { roughness: 0.95 }),
    piece("sphere", "#F7F5FF", [0.8, 0.62, 0.7], [0.55, 0.34, -0.02], { roughness: 0.95 }),
    piece("sphere", "#FFFFFF", [0.8, 0.6, 0.66], [0.15, 0.72, 0], { roughness: 0.95 })
  ]),
  balloon: r(piece("sphere", "#E4574B", [0.75, 0.86, 0.75], [0, 0.58, 0], { roughness: 0.3 }), [
    piece("cylinder", "#F5F2EC", [0.015, 0.36, 0.015], [0, 0.18, 0]),
    piece("sphere", "#E4574B", [0.08, 0.08, 0.08], [0, 0.15, 0], { tinted: true })
  ]),
  // Lowercase letters (05 section 1: one clear uppercase and lowercase letter), in their capitals' colours.
  // b: a full-height stem and a round bowl at the bottom right (chunky torus, outer radius 0.63 * size).
  letterBLower: r(piece("box", "#3F7FD9", [0.22, 1, 0.24], [-0.2, 0.5, 0]), [
    piece("torus", "#3F7FD9", [0.476, 0.476, 0.55], [0.05, 0.3, 0], { tube: 0.2, tinted: true })
  ]),
  // a: the single-storey form toddler books use, a round bowl with a stem on its right.
  letterALower: r(piece("box", "#E4574B", [0.2, 0.9, 0.24], [0.29, 0.45, 0]), [
    piece("torus", "#E4574B", [0.714, 0.714, 0.55], [-0.08, 0.45, 0], { tube: 0.2, tinted: true })
  ]),
  // A toddler toothbrush standing on its handle: mint handle, white bristles at the top.
  toothbrush: r(piece("capsule", "#7ED6AE", [0.12, 0.86, 0.12], [0, 0.43, 0], { roughness: 0.45 }), [
    piece("box", "#7ED6AE", [0.14, 0.16, 0.12], [0, 0.9, 0], { roughness: 0.45 }),
    piece("box", "#FFFFFF", [0.1, 0.18, 0.2], [0, 0.9, 0.1], { roughness: 0.8 })
  ]),
  // The cake candle's flame: a warm teardrop with a brighter core. Its glow is steady and never flashes.
  candleFlame: r(piece("sphere", "#FFB347", [0.55, 0.62, 0.55], [0, 0.3, 0], { roughness: 0.4, emissive: { color: "#FFB347", intensity: 0.45 } }), [
    piece("cone", "#FFC864", [0.42, 0.62, 0.42], [0, 0.68, 0], { roughness: 0.4, emissive: { color: "#FFC864", intensity: 0.45 } }),
    piece("sphere", "#FFF1C4", [0.26, 0.3, 0.26], [0, 0.3, 0.12], { roughness: 0.3, emissive: { color: "#FFF1C4", intensity: 0.5 } })
  ]),
  // A warm sun with eight soft rays (no face; the glow is steady and never flashes).
  sun: r(piece("sphere", "#FFC94A", [0.62, 0.62, 0.4], [0, 0.5, 0], { roughness: 0.6, emissive: { color: "#FFD36B", intensity: 0.25 } }), [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const a = (k * Math.PI) / 4;
      return piece("cone", "#FFB938", [0.12, 0.16, 0.1], [Math.cos(a) * 0.44, 0.5 + Math.sin(a) * 0.44, 0], {
        rotation: [0, 0, a - Math.PI / 2],
        emissive: { color: "#FFD36B", intensity: 0.2 }
      });
    })
  ]),
  bubble: r(piece("sphere", "#DDF3FF", [1, 1, 1], [0, 0.5, 0], {
    roughness: 0.08,
    opacity: 0.38,
    emissive: { color: "#CFEFFF", intensity: 0.12 }
  }), [
    piece("sphere", "#FFFFFF", [0.16, 0.12, 0.06], [-0.2, 0.74, 0.36], { emissive: { color: "#FFFFFF", intensity: 0.35 }, opacity: 0.85 })
  ])
};

export function standInRecipe(key: StageAssetKey): StandInRecipe {
  return STAND_INS[key];
}

// ---------------------------------------------------------------- builders

/** One drawn piece of a stand-in, in metres, for the stage to move. */
export interface StandInPieceInstance {
  /** Runtime id (movable stand-ins) or node name (static dressing). */
  readonly id: string;
  /** Centre relative to the node base, in metres (unscaled). */
  readonly center: Vec3;
  readonly rotation: Vec3;
  /** Index in the recipe (0 = main piece); see `standInPieceMaterial`. */
  readonly index: number;
  /** Takes the placement tint (and a later "tint" action). */
  readonly tinted: boolean;
}

export interface BuiltStandIn {
  readonly nodes: readonly AuraNodeBuilder<AuraSceneNode>[];
  /** Main piece first, then the follower parts. */
  readonly pieces: readonly StandInPieceInstance[];
}

export interface StandInOptions {
  /** Runtime id of the node (movable) or a name prefix (static dressing). */
  readonly id: string;
  readonly heightM: number;
  /** Placement tint; replaces the colour of the tinted pieces. */
  readonly tint?: string;
  /** Base point the node stands on. */
  readonly base?: Vec3;
  readonly yaw?: number;
  /** Movable nodes get `.runtime({ id, mutable: true })` on every piece. */
  readonly movable: boolean;
  /** Tags carried on the runtime node (for QA). */
  readonly tags?: readonly string[];
  readonly castShadow?: boolean;
}

type PieceMaterial = ReturnType<typeof material.pbr>;

function pieceMaterial(p: StandInPiece, color: string): PieceMaterial {
  return material.pbr({
    color,
    roughness: p.roughness ?? 0.72,
    metallic: p.metallic ?? 0,
    ...(p.opacity !== undefined && p.opacity < 1 ? { opacity: p.opacity } : {}),
    ...(p.emissive ? { emissive: p.emissive.color, emissiveIntensity: p.emissive.intensity } : {})
  });
}

/**
 * The cone generator follows three.js (radius 1, so the base is twice as wide
 * as the other unit shapes); radius 0.5 makes `size` the real base diameter.
 */
const UNIT_CONE_RADIUS = 0.5;

/** Engine `params` for a primitive piece: unit cones, cylinder segments, torus tube. */
export function primitiveParams(shape: StandInShape, segments?: number, tube?: number): { radius?: number; radialSegments?: number; tube?: number } | undefined {
  const params: { radius?: number; radialSegments?: number; tube?: number } = {};
  if (shape === "cone") params.radius = UNIT_CONE_RADIUS;
  if (segments !== undefined && (shape === "cylinder" || shape === "cone" || shape === "torus" || shape === "capsule")) params.radialSegments = segments;
  if (shape === "torus" && tube !== undefined) params.tube = tube;
  return Object.keys(params).length > 0 ? params : undefined;
}

/** The material a stand-in piece is built with, re-coloured (same roughness, opacity and glow). */
export function standInPieceMaterial(key: StageAssetKey, index: number, color: string): PieceMaterial {
  const recipe = STAND_INS[key];
  const p = index === 0 ? recipe.main : recipe.parts[index - 1];
  return p ? pieceMaterial(p, color) : material.pbr({ color, roughness: 0.72, metallic: 0 });
}

function primitiveFor(p: StandInPiece, h: number, color: string, name: string, castShadow: boolean) {
  const size: Vec3 = [p.size[0] * h, p.size[1] * h, p.size[2] * h];
  const params = primitiveParams(p.shape, p.segments, p.tube);
  const options = {
    name,
    size,
    material: pieceMaterial(p, color),
    castShadow,
    receiveShadow: true,
    ...(params ? { params } : {})
  };
  switch (p.shape) {
    case "sphere":
      return primitives.sphere(options);
    case "capsule":
      return primitives.capsule(options);
    case "box":
      return primitives.box(options);
    case "cylinder":
      return primitives.cylinder(options);
    case "torus":
      return primitives.torus(options);
    case "cone":
      return primitives.cone(options);
  }
}

/**
 * Builds the primitive nodes for a stand-in. The nodes are placed at their rest
 * pose (base + rotated centre); the stage re-poses movable ones every frame.
 */
export function buildStandIn(key: StageAssetKey, options: StandInOptions): BuiltStandIn {
  const recipe = STAND_INS[key];
  const h = Math.max(0.02, options.heightM);
  const base = options.base ?? [0, 0, 0];
  const yaw = options.yaw ?? 0;
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const pieces: StandInPieceInstance[] = [];
  const all = [recipe.main, ...recipe.parts];
  all.forEach((p, index) => {
    const id = index === 0 ? options.id : `${options.id}~${index}`;
    const isMain = index === 0;
    const tinted = p.tinted ?? isMain;
    const color = tinted && options.tint ? options.tint : p.color;
    const castShadow = (options.castShadow ?? true) && (p.shadow ?? isMain);
    const center: Vec3 = [p.center[0] * h, p.center[1] * h, p.center[2] * h];
    const rotation: Vec3 = p.rotation ?? [0, 0, 0];
    const offset = rotateZYX([0, yaw, 0], center);
    const world: Vec3 = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
    const placed = composeRotation([0, yaw, 0], rotation);
    let node = primitiveFor(p, h, color, id, castShadow)
      .position(world)
      .rotate(placed[0], placed[1], placed[2]);
    if (options.movable) {
      node = node.runtime({ id, tags: [...(options.tags ?? []), isMain ? "stand-in" : "stand-in-part"], mutable: true });
    }
    nodes.push(node);
    pieces.push({ id, center, rotation, index, tinted });
  });
  return { nodes, pieces };
}

/** Number of drawn pieces a stand-in uses (draw-call budgeting). */
export function standInPieceCount(key: StageAssetKey): number {
  return 1 + STAND_INS[key].parts.length;
}
