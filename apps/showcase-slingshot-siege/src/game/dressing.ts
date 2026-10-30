/**
 * Slingshot Siege — seeded beach dressing (GU47 WP-22 SS47-W1): sea-grass tufts on the turf, shells, driftwood,
 * rope posts and lobster pots on the beach ring. One instanced draw per kind (5 draws, budget <= 12), placed by a
 * seeded rejection sampler so every build and every chapter gets the same layout, and kept at least 1.2 m clear of
 * the flight lane (sling to fort along z = 0) and of the authored props. Presentation only: nothing collides.
 *
 * The kinds are instanced primitives as stand-ins until lane WP-36 delivers the dressing GLBs (asset need
 * `gullsiegeBeachDressingMeshy`, see the lane report); the transforms are what those models will reuse.
 */

export type DressingKind = "grass" | "shell" | "driftwood" | "ropePost" | "lobsterPot";

export interface DressingInstance {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly scale: [number, number, number];
}

/** Half-width of the keep-out band around the flight lane (z = 0), metres, before an item's own radius. */
export const LANE_CLEARANCE = 1.2;
/** The flight lane runs from behind the sling to beyond the fort along x. */
export const LANE_X: readonly [number, number] = [-9.5, 11];

/** Authored props and set pieces the dressing keeps off: [x, z, radius]. */
export const DRESSING_KEEP_OUT: readonly (readonly [number, number, number])[] = [
  [-7.4, 0, 2.2], [7.2, 0, 3.6], [-12.4, 4.2, 1.6], [9.8, -2.4, 1.8], [4.2, -3.2, 1.4], [0.2, -2.4, 1.6], [5.2, 2.1, 1.0],
  [-6.0, -5.4, 2.6], [9.4, -4.8, 2.8], [-11.6, -3.0, 1.6], [8.1, 2.9, 1.4],
  [-10.2, -2.8, 0.8], [-5.0, -3.6, 0.8], [3.8, -3.8, 0.8], [10.8, -2.6, 0.8], [11.6, 2.2, 0.8]
];

/** Mulberry32: the same seed gives the same layout on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalised radius on the island turf ellipse (centre 1.5, 0; semi-axes 9 x 7). */
const turfR = (x: number, z: number): number => Math.hypot((x - 1.5) / 9, z / 7);
/** Normalised radius on the beach ring ellipse (centre 1.6, -0.4; semi-axes 9.8 x 7.6). */
const beachR = (x: number, z: number): number => Math.hypot((x - 1.6) / 9.8, (z + 0.4) / 7.6);

/** True when (x, z) with radius r stays clear of the flight lane and every keep-out circle. */
export function clearOfLane(x: number, z: number, r: number): boolean {
  if (x > LANE_X[0] - r && x < LANE_X[1] + r && Math.abs(z) < LANE_CLEARANCE + r) return false;
  for (const [kx, kz, kr] of DRESSING_KEEP_OUT) if (Math.hypot(x - kx, z - kz) < kr + r) return false;
  return true;
}

interface KindRule {
  readonly count: number;
  readonly radius: number;
  readonly where: "turf" | "beach";
  readonly y: number;
  readonly scale: (u: number) => [number, number, number];
  readonly tilt: number;
}

const RULES: Readonly<Record<DressingKind, KindRule>> = {
  grass: { count: 40, radius: 0.18, where: "turf", y: 0.12, scale: (u) => [0.12 + u * 0.06, 0.28 + u * 0.22, 0.12 + u * 0.06], tilt: 0.12 },
  shell: { count: 18, radius: 0.08, where: "beach", y: -0.08, scale: (u) => [0.09 + u * 0.05, 0.035, 0.07 + u * 0.04], tilt: 0 },
  driftwood: { count: 7, radius: 0.5, where: "beach", y: -0.06, scale: (u) => [0.07, 0.7 + u * 0.6, 0.07], tilt: Math.PI / 2 },
  ropePost: { count: 8, radius: 0.12, where: "beach", y: 0.12, scale: () => [0.08, 0.5, 0.08], tilt: 0.05 },
  lobsterPot: { count: 4, radius: 0.35, where: "beach", y: 0.02, scale: (u) => [0.42 + u * 0.08, 0.3, 0.32], tilt: 0 }
};

/** Seeded layout per kind; deterministic for a seed (default the game's stage seed). */
export function beachDressing(seed = 0x51e9e): Readonly<Record<DressingKind, readonly DressingInstance[]>> {
  const out = {} as Record<DressingKind, DressingInstance[]>;
  const placed: [number, number, number][] = [];
  let k = 0;
  for (const kind of Object.keys(RULES) as DressingKind[]) {
    const rule = RULES[kind];
    const next = rng(seed + 0x9e37 * ++k);
    const list: DressingInstance[] = [];
    for (let attempt = 0; attempt < rule.count * 60 && list.length < rule.count; attempt += 1) {
      const a = next() * Math.PI * 2;
      const rad = rule.where === "turf" ? 0.25 + Math.sqrt(next()) * 0.7 : 1.005 + next() * 0.035;
      const x = rule.where === "turf" ? 1.5 + Math.cos(a) * 9 * rad : 1.6 + Math.cos(a) * 9.8 * rad;
      const z = rule.where === "turf" ? Math.sin(a) * 7 * rad : -0.4 + Math.sin(a) * 7.6 * rad;
      if (rule.where === "turf" ? turfR(x, z) > 0.95 : beachR(x, z) < 0.99 || beachR(x, z) > 1.05) continue;
      if (!clearOfLane(x, z, rule.radius)) continue;
      if (placed.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + rule.radius)) continue;
      placed.push([x, z, rule.radius]);
      const u = next();
      const yaw = next() * Math.PI * 2;
      const r = (v: number): number => Math.round(v * 1000) / 1000;
      list.push({
        position: [r(x), rule.y, r(z)],
        rotation: [r(rule.tilt * (kind === "driftwood" ? 1 : u - 0.5)), r(yaw), 0],
        scale: rule.scale(u).map(r) as [number, number, number]
      });
    }
    out[kind] = list;
  }
  return out;
}
