/**
 * Idol wow pass: high-detail image-to-3D GLBs (`speridlabs/idol/max`, `tools/idol/specs/saltwind-highway.json`) that stand in
 * for the sculpted procedural hero body, every traffic and lineup vehicle class (including the semi tractors and car
 * carriers that were box rigs) and the coastal landmarks. Render layer only: the sim, its collision boxes and the replay never
 * read these. Every GLB is grounded at y = 0, centred in x/z and faces +Z (the game's vehicles face -Z, so they turn by pi).
 * A key that is not admitted (or `?idol=0`) falls back to the procedural model.
 */
import type { AuraAssetRef } from "@aura3d/engine";
import { SALTWIND_IDOL_ASSETS } from "../../../apps/showcase-roadster-hours-port/src/idol-assets";

export type IdolModelRef = AuraAssetRef<"model"> & { readonly bounds?: readonly [number, number, number] };

/** The admitted Idol model for `key`, or null when it is not in the route catalogue (apps/showcase-roadster-hours-port/src/idol-assets.ts). */
export function idolAsset(key: string): IdolModelRef | null {
  const ref = (SALTWIND_IDOL_ASSETS as unknown as Record<string, IdolModelRef | undefined>)[key];
  return ref && ref.type === "model" ? ref : null;
}

/**
 * Exact generated sizes `[x, y, z]` in metres (vertex bounds of the shipped GLB, measured with gltf-transform getBounds). The admitted
 * manifest `bounds` overstate x/z for a model normalised with a non-axis yaw (the CLI reports the rotated source box, e.g.
 * swSemiRedP 10.8 m wide for a 5.8 m truck, since retired), so per-axis fits must not use them.
 */
const IDOL_DIMS: Readonly<Record<string, readonly [number, number, number]>> = {
  swBusShuttleP: [5.933, 4.674, 12],
  swDinerB: [13, 4.181, 8.733],
  swHatchMustardP: [1.863, 1.847, 4.12],
  swHatchSeaGlassP: [2.843, 2.125, 4.12],
  swLighthouseB: [16.464, 74, 19.305],
  swPickupRustP: [2.697, 2.199, 5.84],
  swRoadsterBodyB: [2.533, 1.518, 4.44],
  swSedanBlueP: [2.037, 1.767, 4.8],
  swSedanClayP: [2.105, 1.728, 4.8],
  swSedanSandP: [2.156, 1.766, 4.8],
  swSemiRedNW: [4.884, 5.787, 20.8],
  swSuvSlateP: [2.275, 2.442, 4.82],
  swTownhouse: [0.452, 1, 0.78],
  swTownhouseSand: [0.627, 1, 0.545],
  swTractorTealP: [3.218, 4.543, 7.4],
  swViaduct: [34.65, 21.428, 8.072],
  swVilla: [0.958, 1, 0.922],
  swVillaOchre: [1.004, 1, 0.993]
};

/** Native GLB size (x, y, z) in metres: the measured generated size, else the manifest bounds. */
export function idolBounds(ref: IdolModelRef): readonly [number, number, number] {
  const exact = IDOL_DIMS[(ref as { readonly id?: string }).id ?? ""];
  if (exact) return exact;
  const b = ref.bounds;
  return b && b.length === 3 && b.every((v) => v > 0) ? b : [1, 1, 1];
}

/**
 * Colour variants per sim piece: one generation per variant (no runtime recolour of baked paint). The `P` keys come from
 * shallow rear three-quarter references (full side length + rear visible): front three-quarter stills made Idol compress
 * the vehicles' length and smear the rear, which the chase camera sees most.
 */
export const IDOL_VEHICLE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  sedan: ["swSedanBlueP", "swSedanSandP", "swSedanClayP"],
  hatch: ["swHatchMustardP", "swHatchSeaGlassP"],
  suv: ["swSuvSlateP"],
  pickup: ["swPickupRustP"],
  bus: ["swBusShuttleP"],
  semi: ["swSemiRedNW"],
  semi_tractor: ["swTractorTealP"]
  // box_truck, tanker and car_carrier stay procedural: their Idol reconstructions came out folded or skewed (rejected on review)
};

/**
 * The Idol model a vehicle of sim piece `piece` (def index `index`) draws with, or null (procedural fallback). The sim's
 * "sedan" piece alternates saloon and hatchback bodies like the procedural classes did (every third one is a hatch).
 */
export function idolVehicleKey(piece: string, index: number): string | null {
  const body = piece === "sedan" && index % 3 === 0 ? "hatch" : piece;
  const variants = (IDOL_VEHICLE_VARIANTS[body] ?? []).filter((key) => idolAsset(key) !== null);
  if (!variants.length) return null;
  return variants[(index * 7 + piece.length) % variants.length]!;
}

/** Hero roadster body (wheel arches empty: the four procedural wire-spoke wheels keep spinning and steering). */
export const IDOL_HERO_BODY = "swRoadsterBodyB";
/**
 * Placement of the hero body inside the `car-body` group (chassis frame: origin ROADSTER_HALF_H = 0.62 m above the road,
 * front -Z). Fitted on a side silhouette of the GLB: its lowest point sits IDOL_HERO_CLEARANCE above the road, the
 * per-axis scale narrows the flared body a little and lines its arch spacing up with the wheelbase (z -1.36 / +1.34), and
 * the procedural wheels grow by IDOL_HERO_WHEEL_SCALE to fill the generated arches.
 */
export const IDOL_HERO_CLEARANCE = 0.02;
export const IDOL_HERO_BODY_Y = IDOL_HERO_CLEARANCE - 0.62;
export const IDOL_HERO_BODY_Z = -0.046;
export const IDOL_HERO_BODY_SCALE: readonly [number, number, number] = [0.88, 1, 1.04];
export const IDOL_HERO_WHEEL_SCALE = 1.15;

/** Landmarks and the cliff-top town. */
export const IDOL_LIGHTHOUSE = "swLighthouseB";
/** Centre of the (opaque, amber) lantern room as a fraction of the Idol lighthouse's height: the beacon beam starts there. */
export const IDOL_LIGHTHOUSE_LANTERN = 0.79;
export const IDOL_VIADUCT = "swViaduct";
export const IDOL_DINER = "swDinerB";
export const IDOL_VILLAS: readonly string[] = ["swVilla", "swVillaOchre"];
export const IDOL_TOWNHOUSES: readonly string[] = ["swTownhouse", "swTownhouseSand"];

/** `?idol=0` keeps every procedural model (A/B lab switch). */
export function idolEnabled(query: URLSearchParams): boolean {
  return query.get("idol") !== "0";
}
