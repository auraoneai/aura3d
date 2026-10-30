/**
 * GU47 WP-32 RH47-11/15: per-route landmark placements (pure, unit tested). Until the WP-36 Meshy landmark set lands
 * (turbine with a separate rotor, sea stack, mesa, arch, hoodoo, uplink mast, arcology, maglev tube, antenna), the world
 * draws these as instanced engine-lit primitives at the same spots, so the asset keys drop in without moving anything.
 * Every landmark stands off the road (outside the guardrails), so nothing here can touch collision or the sim.
 *
 * Kinds per route (RH47-11 acceptance: >= 4): Sunbreak lighthouse, town, wind turbines, sea stacks; Redline mesas,
 * hoodoos, an arch, uplink masts; Halo arcology towers, antenna masts with red beacons, maglev tube rings, the city carpet.
 */

export interface LandmarkPlacement {
  /** Arc position and lateral offset from the road centre (metres; +l right of travel). */
  readonly s: number;
  readonly l: number;
  /** Height above the terrain base the runtime samples (metres). */
  readonly y: number;
  /** Size (x, y, z) in metres and yaw in radians. */
  readonly size: readonly [number, number, number];
  readonly yaw: number;
}

export type LandmarkKind = "turbine" | "sea-stack" | "mesa" | "hoodoo" | "arch" | "uplink-mast" | "antenna" | "tube-ring";

export const LANDMARK_KINDS: Readonly<Record<"sunbreak" | "redline" | "halo", readonly string[]>> = {
  sunbreak: ["lighthouse", "town", "turbine", "sea-stack"],
  redline: ["mesa", "hoodoo", "arch", "uplink-mast"],
  halo: ["towers", "antenna", "tube-ring", "city-carpet"]
};

/** Rotor speed of the turbines (radians per second); reduced motion runs them at 30% (PRD §6.3). */
export const ROTOR_SPEED = 1.1;
export const ROTOR_BLADES = 3;

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Placements of one landmark kind along a route of `length` metres and road half-width `halfWidth`; `seaSide` is the sign
 * of the lateral offset where the sea is. Deterministic in `seed`.
 */
export function landmarkPlacements(kind: LandmarkKind, length: number, halfWidth: number, seaSide: -1 | 1, seed: number): LandmarkPlacement[] {
  const out: LandmarkPlacement[] = [];
  const land = (-seaSide) as -1 | 1;
  const r = (i: number, k: number): number => hash(seed * 31 + i * 7 + k, kind.length * 101 + k);
  switch (kind) {
    case "turbine":
      // a wind farm on the hills inland, 70-130 m off the road, one every ~240 m
      for (let i = 0, s = 180; s < length - 120; i++, s += 220 + r(i, 1) * 60) {
        const h = 46 + r(i, 2) * 10;
        out.push({ s, l: land * (halfWidth + 70 + r(i, 3) * 60), y: 0, size: [2.2, h, 2.2], yaw: 0 });
      }
      break;
    case "sea-stack":
      for (let i = 0, s = 300; s < length - 200; i++, s += 360 + r(i, 1) * 200) {
        const h = 18 + r(i, 2) * 22;
        out.push({ s, l: seaSide * (halfWidth + 70 + r(i, 3) * 90), y: -2, size: [10 + r(i, 4) * 8, h, 10 + r(i, 5) * 8], yaw: r(i, 6) * Math.PI * 2 });
      }
      break;
    case "mesa":
      for (let i = 0, s = 250; s < length; i++, s += 420 + r(i, 1) * 180) {
        const w = 60 + r(i, 2) * 50;
        out.push({ s, l: (i % 2 ? land : seaSide) * (halfWidth + 160 + r(i, 3) * 140), y: 0, size: [w, 40 + r(i, 4) * 30, w * (0.7 + r(i, 5) * 0.5)], yaw: r(i, 6) * Math.PI });
      }
      break;
    case "hoodoo":
      for (let i = 0, s = 140; s < length; i++, s += 150 + r(i, 1) * 90) {
        const h = 9 + r(i, 2) * 10;
        out.push({ s, l: (r(i, 3) > 0.5 ? land : seaSide) * (halfWidth + 28 + r(i, 4) * 45), y: 0, size: [3 + r(i, 5) * 2, h, 3 + r(i, 6) * 2], yaw: 0 });
      }
      break;
    case "arch": {
      const s = Math.min(length - 300, 1100);
      out.push({ s, l: seaSide * (halfWidth + 120), y: 0, size: [70, 70, 14], yaw: Math.PI / 2 });
      break;
    }
    case "uplink-mast":
      for (let i = 0, s = 600; s < length; i++, s += 700) out.push({ s, l: land * (halfWidth + 40 + r(i, 1) * 20), y: 0, size: [0.9, 38 + r(i, 2) * 10, 0.9], yaw: 0 });
      break;
    case "antenna":
      for (let i = 0, s = 200; s < length; i++, s += 260 + r(i, 1) * 120) out.push({ s, l: (i % 2 ? land : seaSide) * (halfWidth + 55 + r(i, 2) * 70), y: -40, size: [1.2, 120 + r(i, 3) * 60, 1.2], yaw: 0 });
      break;
    case "tube-ring":
      // the maglev tube act (Halo s 880-1540): a ring over the road every 36 m
      for (let s = 900; s < Math.min(length, 1520); s += 36) out.push({ s, l: 0, y: 0, size: [2 * halfWidth + 6, 2 * halfWidth + 6, 1.2], yaw: 0 });
      break;
  }
  return out;
}

/** Rotor angle at `time` seconds for turbine `i` (each turbine has its own phase); reduced motion turns at 30%. */
export const rotorAngle = (time: number, i: number, reducedMotion = false): number => time * ROTOR_SPEED * (reducedMotion ? 0.3 : 1) + i * 1.7;
