/**
 * Aura Diamond 3D horizon per park (GU47 DIA-W1). Pure data (no engine, no DOM): one instanced band of far shapes per
 * park, placed on a seeded ring well behind the stands so every park gets its own skyline at one draw each.
 *
 * - Harbor: open water (scene.ts swaps the flat plane for `world.water`), a low headland across the bay.
 * - Midtown: a ring of far office blocks wearing the lit window grid (src/windowTexture.ts).
 * - Canyon: flat-topped mesas that the dust and height fog swallow.
 * - Ivy: rowhouse blocks over the outfield wall.
 * - Lunar: a low crater rim on the black horizon, the Earth above it (scene.ts).
 * - Dome: indoors, no horizon.
 *
 * Boats, the lighthouse, hoodoos, water towers and the rowhouse roofs are WP-36 set pieces; until they are admitted the
 * bands below carry each park's silhouette. Nothing here touches the simulation or its RNG (own seeded generator).
 */
import type { ParkId } from "../src/rules";

export type Vec3 = [number, number, number];

export interface HorizonInstance {
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
}

export interface HorizonBand {
  /** Node name (one instanced draw). */
  readonly name: string;
  readonly shape: "box" | "cylinder";
  /** Base colour; `colors` tints each instance when set. */
  readonly color: string;
  readonly colors?: readonly string[];
  readonly roughness: number;
  /** Midtown: the lit window grid as the emissive map. */
  readonly windows?: { readonly emissive: string; readonly intensity: number };
  readonly instances: readonly HorizonInstance[];
}

/** Draws each park's horizon adds (one band each, Dome none). */
export const HORIZON_DRAWS: Readonly<Record<ParkId, number>> = { sandlot: 1, skyline: 1, canyon: 1, ivy: 1, dome: 0, lunar: 1 };

/** Instances on Low tier keep every other piece (the silhouette stays; half the vertices). */
export function horizonForTier(band: HorizonBand, low: boolean): HorizonBand {
  if (!low) return band;
  const keep = band.instances.filter((_, i) => i % 2 === 0);
  return { ...band, instances: keep, ...(band.colors ? { colors: band.colors.filter((_, i) => i % 2 === 0) } : {}) };
}

/** Deterministic LCG for the horizon only (never the sim RNG). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Points on an arc of radius `r` (metres) from `fromDeg` to `toDeg` (field angle: 0 = centre field, + = right field).
 * Each piece faces home plate.
 */
function arc(count: number, r: number, fromDeg: number, toDeg: number, seed: number, size: (k: () => number, i: number) => Vec3, jitterR = 0.08): HorizonInstance[] {
  const k = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const deg = fromDeg + (toDeg - fromDeg) * t + (k() - 0.5) * ((toDeg - fromDeg) / Math.max(count, 1)) * 0.6;
    const rad = (deg * Math.PI) / 180;
    const rr = r * (1 + (k() - 0.5) * 2 * jitterR);
    const s = size(k, i);
    return {
      position: [Math.sin(rad) * rr, s[1] / 2, -Math.cos(rad) * rr] as Vec3,
      rotation: [0, -rad, 0] as Vec3,
      scale: s
    };
  });
}

/** The park's horizon band, or null (the Dome). */
export function horizonBand(park: ParkId): HorizonBand | null {
  switch (park) {
    case "sandlot":
      // A low wooded headland across the bay, right of centre where the water is (rules.ts HARBOR_WATER).
      return {
        name: "harbor-headland",
        shape: "cylinder",
        color: "#3b4a3f",
        colors: ["#3b4a3f", "#435243", "#36443c", "#4a5646"],
        roughness: 0.95,
        instances: arc(8, 300, 18, 70, 0xd1a01, (k) => [34 + k() * 30, 7 + k() * 9, 22 + k() * 14])
      };
    case "skyline":
      return {
        name: "midtown-far-blocks",
        shape: "box",
        color: "#121a26",
        roughness: 0.55,
        windows: { emissive: "#f3c77a", intensity: 0.85 },
        instances: arc(14, 230, -78, 78, 0xd1a02, (k) => [16 + k() * 14, 34 + k() * 46, 16 + k() * 10])
      };
    case "canyon":
      return {
        name: "canyon-mesas",
        shape: "cylinder",
        color: "#9a5a3c",
        colors: ["#9a5a3c", "#a8674a", "#8d5236", "#b07253"],
        roughness: 0.97,
        instances: arc(7, 320, -70, 70, 0xd1a03, (k) => [60 + k() * 50, 26 + k() * 22, 40 + k() * 26], 0.12)
      };
    case "ivy":
      return {
        name: "ivy-rowhouses",
        shape: "box",
        color: "#7e4434",
        colors: ["#7e4434", "#8b5a46", "#6f3d30", "#9a6a52", "#5f4a44"],
        roughness: 0.9,
        instances: arc(12, 150, -52, 52, 0xd1a04, (k) => [12 + k() * 6, 11 + k() * 7, 10 + k() * 4], 0.04)
      };
    case "lunar":
      return {
        name: "lunar-crater-rim",
        shape: "cylinder",
        color: "#4f4e4b",
        colors: ["#4f4e4b", "#5a5955", "#46453f", "#605e58"],
        roughness: 1,
        instances: arc(16, 340, -150, 150, 0xd1a05, (k) => [70 + k() * 40, 8 + k() * 10, 40 + k() * 20], 0.06)
      };
    case "dome":
      return null;
  }
}
