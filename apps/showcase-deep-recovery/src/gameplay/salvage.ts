/**
 * Salvage crates, grapple / tether mechanics, banking, and contract progression.
 */
import { getDepthZone, type Vec3 } from "./reef";

export interface SalvageCrate {
  readonly id: string;
  readonly kind: "crate-standard" | "crate-heavy";
  readonly baseValue: number;
  readonly mass: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  tethered: boolean;
  banked: boolean;
}

export interface ContractSpec {
  readonly id: 1 | 2 | 3;
  readonly title: string;
  readonly quotaValue: number;
  readonly description: string;
}

export const CONTRACTS: readonly ContractSpec[] = [
  {
    id: 1,
    title: "Surface Survey",
    quotaValue: 1200,
    description: "Recover shallow reef and mid-trench cargo containers to secure operational funding."
  },
  {
    id: 2,
    title: "Deep Trench Salvage",
    quotaValue: 2800,
    description: "Dive past 20m depth to extract high-yield titanium salvage from the ironclad wreck."
  },
  {
    id: 3,
    title: "Abyssal Extraction",
    quotaValue: 5500,
    description: "Descend into the abyssal chasm (depth > 40m) to recover heavy black-box containers."
  }
];

export const GRAPPLE_RANGE = 3.2;
export const TETHER_REST_LENGTH = 2.4;
export const TETHER_MAX_LENGTH = 5.0;
export const TETHER_STIFFNESS = 18.0;
export const TETHER_DAMPING = 4.5;

export function initialCrateSpawns(): SalvageCrate[] {
  return [
    // Shallow Reef crates (Immediate sightline)
    { id: "crate-s1", kind: "crate-standard", baseValue: 400, mass: 120, x: 2.8, y: -7.5, z: -7.5, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    { id: "crate-s2", kind: "crate-standard", baseValue: 400, mass: 120, x: -8.0, y: -14.0, z: 24.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    { id: "crate-s3", kind: "crate-standard", baseValue: 400, mass: 120, x: 9.0, y: -18.0, z: 31.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    // Mid-Trench Shipwreck crates
    { id: "crate-h1", kind: "crate-heavy", baseValue: 900, mass: 280, x: -6.0, y: -26.0, z: -16.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    { id: "crate-h2", kind: "crate-heavy", baseValue: 900, mass: 280, x: 14.0, y: -32.0, z: 8.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    // Abyssal Chasm Black Box crates
    { id: "crate-h3", kind: "crate-heavy", baseValue: 1400, mass: 360, x: 0.0, y: -46.0, z: -22.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    { id: "crate-h4", kind: "crate-heavy", baseValue: 1800, mass: 420, x: -18.0, y: -55.0, z: 10.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false },
    { id: "crate-h5", kind: "crate-heavy", baseValue: 2000, mass: 450, x: 16.0, y: -58.0, z: -14.0, vx: 0, vy: 0, vz: 0, tethered: false, banked: false }
  ];
}

export function tryGrappleCrates(subPos: Vec3, crates: SalvageCrate[]): { latchedCrate: SalvageCrate | null; count: number } {
  // Find nearest unbanked, untethered crate
  let nearest: SalvageCrate | null = null;
  let minDist = GRAPPLE_RANGE;

  for (const crate of crates) {
    if (crate.banked || crate.tethered) continue;
    const dist = Math.hypot(crate.x - subPos.x, crate.y - subPos.y, crate.z - subPos.z);
    if (dist < minDist) {
      minDist = dist;
      nearest = crate;
    }
  }

  if (nearest) {
    nearest.tethered = true;
    return {
      latchedCrate: nearest,
      count: crates.filter((c) => c.tethered).length
    };
  }

  return { latchedCrate: null, count: crates.filter((c) => c.tethered).length };
}

export function releaseTethers(crates: SalvageCrate[]): number {
  let released = 0;
  for (const crate of crates) {
    if (crate.tethered) {
      crate.tethered = false;
      released += 1;
    }
  }
  return released;
}

export function updateTetherPhysics(
  subPos: Vec3,
  crates: SalvageCrate[],
  dt: number
): { towDragForce: number } {
  let towDragForce = 0;

  for (const crate of crates) {
    if (crate.banked) continue;

    if (crate.tethered) {
      // Mass is the gameplay authority for handling cost. A 120 kg standard
      // pod is deliberately easier to turn and accelerate with than the
      // 280-450 kg heavy family.
      towDragForce += crate.mass / 1_000;
      const dx = subPos.x - crate.x;
      const dy = subPos.y - crate.y;
      const dz = subPos.z - crate.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist > TETHER_REST_LENGTH) {
        const stretch = dist - TETHER_REST_LENGTH;
        const forceMag = stretch * TETHER_STIFFNESS;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;

        crate.vx += (nx * forceMag - crate.vx * TETHER_DAMPING) * dt;
        crate.vy += (ny * forceMag - crate.vy * TETHER_DAMPING) * dt;
        crate.vz += (nz * forceMag - crate.vz * TETHER_DAMPING) * dt;
      }
    } else {
      // Free water drag + near-neutral slow settling. Objectives must remain
      // navigable during a normal dive rather than racing to the seabed.
      crate.vx *= Math.max(0, 1 - 2.5 * dt);
      crate.vy = Math.max(-0.12, crate.vy - 0.08 * dt);
      crate.vz *= Math.max(0, 1 - 2.5 * dt);
    }

    crate.x += crate.vx * dt;
    crate.y += crate.vy * dt;
    crate.z += crate.vz * dt;

    // Seabed clamp
    if (crate.y < -61.0) {
      crate.y = -61.0;
      crate.vy = 0;
    }
  }

  return { towDragForce };
}

export function bankSecuredCrates(
  subPos: Vec3,
  crates: SalvageCrate[],
  buoyRadius: number
): { bankedValue: number; bankedCount: number; bankedIds: readonly string[]; bankedKinds: readonly SalvageCrate["kind"][] } {
  const atBuoy = Math.hypot(subPos.x, subPos.z) <= buoyRadius && subPos.y >= -4.0;
  if (!atBuoy) return { bankedValue: 0, bankedCount: 0, bankedIds: [], bankedKinds: [] };

  let totalValue = 0;
  let count = 0;
  const bankedIds: string[] = [];
  const bankedKinds: SalvageCrate["kind"][] = [];

  for (const crate of crates) {
    const crateInsideBuoy = Math.hypot(crate.x, crate.z) <= buoyRadius && crate.y >= -4;
    if (crate.tethered && !crate.banked && crateInsideBuoy) {
      const zone = getDepthZone(crate.y);
      const earned = Math.round(crate.baseValue * zone.valueMultiplier);
      crate.banked = true;
      crate.tethered = false;
      crate.y = 1.0; // on buoy deck
      totalValue += earned;
      count += 1;
      bankedIds.push(crate.id);
      bankedKinds.push(crate.kind);
    }
  }

  return { bankedValue: totalValue, bankedCount: count, bankedIds, bankedKinds };
}
