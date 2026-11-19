/**
 * Solid scenery for the zero-G flight phase: gate pillars and lintels, the rim
 * boulders and spires, and the lander and observatory. Pure and deterministic
 * (no engine imports). `world.ts` places the meshes from `dressingPlan()` and the
 * simulation collides against `staticColliders()`, so the two cannot drift apart.
 */
import type { ImpactCollider } from "@aura3d/engine/game";
import { COURSE_LENGTH, GATES } from "./course";
import { activeCourse, mainFrame } from "./track";
import { Vec3 } from "./vec3";

/** Deterministic Lehmer generator (same constants the original uses for its star field). */
export function lehmer(seed: number): () => number {
  let s = seed;
  return () => { s = s * 16807 % 2147483647; return s / 2147483647; };
}

export type DressKind = "boulder" | "spire" | "lander" | "observatory";

export interface Dress {
  readonly name: string;
  readonly kind: DressKind;
  readonly s: number;
  readonly lateral: number;
  readonly drop: number;
  readonly size: number;
  readonly spin: number;
  readonly tilt: number;
}

/** Half extents (x, z), height and largest dimension of each procedural prop's collision bounds. */
const BOUNDS: Record<DressKind, { readonly x: number; readonly z: number; readonly h: number; readonly max: number; readonly label: string }> = {
  boulder: { x: 0.95, z: 0.94, h: 1.48, max: 1.9, label: "moon boulder" },
  spire: { x: 0.43, z: 0.41, h: 1.9, max: 1.9, label: "rock spire" },
  lander: { x: 0.88, z: 0.83, h: 1.9, max: 1.9, label: "lander" },
  observatory: { x: 0.76, z: 0.72, h: 1.9, max: 1.9, label: "observatory" }
};

/** Boulders along the rim plus the lander and two observatories; same random sequence the meshes always used. */
export function dressingPlan(): readonly Dress[] {
  const rand = lehmer(48271);
  const out: Dress[] = [];
  for (let k = 0; k < 14; k++) {
    const s = 40 + k * (COURSE_LENGTH - 80) / 14 + rand() * 40;
    const side = k % 2 === 0 ? 1 : -1;
    const lateral = side * (13.5 + rand() * 9);
    if (k % 3 === 1) {
      const size = 6 + rand() * 4;
      const spin = rand() * 6.28;
      out.push({ name: `dress-spire-${k}`, kind: "spire", s, lateral, drop: -0.5, size, spin, tilt: (rand() - 0.5) * 0.5 });
    } else {
      const size = 2.6 + rand() * 2.4;
      const spin = rand() * 6.28;
      out.push({ name: `dress-boulder-${k}`, kind: "boulder", s, lateral, drop: -0.3, size, spin, tilt: (rand() - 0.5) * 0.5 });
    }
  }
  out.push({ name: "dress-lander", kind: "lander", s: 330, lateral: 14.5, drop: -0.2, size: 6.5, spin: 2.2, tilt: 0 });
  out.push({ name: "dress-observatory", kind: "observatory", s: 790, lateral: -16, drop: -0.2, size: 12, spin: 0.6, tilt: 0 });
  out.push({ name: "dress-observatory-far", kind: "observatory", s: 1260, lateral: 17, drop: -0.2, size: 14, spin: 3.9, tilt: 0 });
  return out;
}

/** Lunar colony outposts beside the course (course distance, lateral offset, drop along the frame's up, yaw, scale). */
export const COLONY_STATIONS: readonly {
  readonly name: string;
  readonly kind: "habitat" | "dish" | "solar" | "trailer" | "fuel";
  readonly s: number;
  readonly lateral: number;
  readonly drop: number;
  readonly yaw: number;
  readonly scale: number;
}[] = [
  { name: "colony-habitat-grid", kind: "habitat", s: 30, lateral: 23.5, drop: -0.6, yaw: Math.PI * 0.64, scale: 1.05 },
  { name: "colony-trailer-grid", kind: "trailer", s: 41, lateral: 18.2, drop: -0.35, yaw: 0.18, scale: 1 },
  { name: "colony-dish-grid", kind: "dish", s: 47, lateral: -21.5, drop: -0.5, yaw: 0.65, scale: 1.05 },
  { name: "colony-fuel-grid", kind: "fuel", s: 53, lateral: -19.2, drop: -0.45, yaw: -0.25, scale: 1 },
  { name: "colony-solar-grid", kind: "solar", s: 59, lateral: 22.0, drop: -0.45, yaw: 0.4, scale: 1.08 },
  { name: "colony-habitat-violet", kind: "habitat", s: 368, lateral: -24.5, drop: -0.7, yaw: -Math.PI * 0.62, scale: 1.15 },
  { name: "colony-dish-ridge", kind: "dish", s: 642, lateral: 25.0, drop: -0.6, yaw: -0.5, scale: 1.18 },
  { name: "colony-solar-ridge", kind: "solar", s: 824, lateral: -23.0, drop: -0.5, yaw: -0.35, scale: 1.15 },
  { name: "colony-fuel-jade", kind: "fuel", s: 1108, lateral: 22.0, drop: -0.5, yaw: 0.52, scale: 1.1 },
  { name: "colony-trailer-opal", kind: "trailer", s: 1286, lateral: -20.5, drop: -0.4, yaw: -0.28, scale: 1.08 }
];

/**
 * Footprint of each colony set piece, from its admitted Idol model (manifest bounds, metres at scale 1): half the larger
 * horizontal side and the height. Pass-through QA (Nov 18): a rider knocked into zero-G flight off the rim flew straight
 * through the habitats, dishes and tanks (scenery only); they now collide like the boulders and observatories.
 */
export const COLONY_FOOTPRINT: Readonly<Record<(typeof COLONY_STATIONS)[number]["kind"], { readonly half: number; readonly h: number; readonly label: string }>> = {
  habitat: { half: 11.1 / 2, h: 7.822, label: "colony habitat" },
  dish: { half: 7.993 / 2, h: 9.2, label: "colony dish" },
  solar: { half: 5.768 / 2, h: 4.8, label: "solar array" },
  trailer: { half: 2.865 / 2, h: 2.4, label: "colony trailer" },
  fuel: { half: 4.1 / 2, h: 3.518, label: "fuel tank" }
};

/** A solid capsule (a sphere when `a` equals `b`). */
export interface Collider {
  readonly id: string;
  readonly label: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
  /** Unit direction a rider flies to hit this solid head-on from outside the track (QA and tests). */
  readonly approach: Vec3;
}

/** Gate pillars are the 13 m procedural lattice pylon (1.9 tall, 0.34 wide unit scaled to 13 m); lintel is the 0.9 x 0.7 x 23.2 span. */
const PILLAR = { lateral: 11.1, height: 13, radius: 1.1 };
const LINTEL = { height: 13.1, halfLength: 11.6, radius: 0.55 };

let cache: { readonly id: string; readonly colliders: readonly Collider[] } | undefined;

/** Solid colliders for the active course (cached per course). */
export function staticColliders(): readonly Collider[] {
  const id = activeCourse().id;
  if (cache && cache.id === id) return cache.colliders;
  const out: Collider[] = [];
  GATES.forEach((gate, i) => {
    const f = mainFrame(gate.s);
    for (const side of [-1, 1]) {
      const base = f.p.clone().addScaledVector(f.side, side * PILLAR.lateral).addScaledVector(f.up, -0.1);
      out.push({
        id: `gate-${i}-pillar-${side}`,
        label: "gate pillar",
        a: base.clone().addScaledVector(f.up, PILLAR.radius),
        b: base.clone().addScaledVector(f.up, PILLAR.height - PILLAR.radius),
        radius: PILLAR.radius,
        approach: f.side.clone().multiplyScalar(-side)
      });
    }
    const top = f.p.clone().addScaledVector(f.up, LINTEL.height);
    out.push({
      id: `gate-${i}-lintel`,
      label: "gate lintel",
      a: top.clone().addScaledVector(f.side, -LINTEL.halfLength),
      b: top.clone().addScaledVector(f.side, LINTEL.halfLength),
      radius: LINTEL.radius,
      approach: f.up.clone().negate()
    });
  });
  for (const d of dressingPlan()) {
    const f = mainFrame(d.s);
    const bounds = BOUNDS[d.kind];
    const scale = d.size / bounds.max;
    const radius = 0.9 * Math.max(bounds.x, bounds.z) * scale;
    const height = bounds.h * scale;
    const base = f.p.clone().addScaledVector(f.side, d.lateral).addScaledVector(f.up, d.drop);
    out.push({
      id: d.name,
      label: bounds.label,
      a: base.clone().addScaledVector(f.up, Math.min(radius, height / 2)),
      b: base.clone().addScaledVector(f.up, Math.max(height - radius, height / 2)),
      radius,
      approach: f.side.clone().multiplyScalar(-Math.sign(d.lateral))
    });
  }
  for (const c of COLONY_STATIONS) {
    const f = mainFrame(c.s);
    const fp = COLONY_FOOTPRINT[c.kind];
    const radius = 0.9 * fp.half * c.scale;
    const height = fp.h * c.scale;
    const base = f.p.clone().addScaledVector(f.side, c.lateral).addScaledVector(f.up, c.drop);
    out.push({
      id: c.name,
      label: fp.label,
      a: base.clone().addScaledVector(f.up, Math.min(radius, height / 2)),
      b: base.clone().addScaledVector(f.up, Math.max(height - radius, height / 2)),
      radius,
      approach: f.side.clone().multiplyScalar(-Math.sign(c.lateral))
    });
  }
  cache = { id, colliders: out };
  return out;
}

/**
 * The capsules as chains of overlapping spheres for the library's `createImpactWorld`
 * (which collides spheres and boxes; the gate frames are tilted, so boxes would not fit).
 * Spacing is 0.4 radii, so a chain's surface dips under 0.021 radius between spheres.
 */
export function impactColliders(): readonly ImpactCollider[] {
  const out: ImpactCollider[] = [];
  for (const c of staticColliders()) {
    const length = c.a.distanceTo(c.b);
    const count = Math.max(1, Math.ceil(length / (c.radius * 0.4))) + 1;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      out.push({
        kind: "sphere",
        id: `${c.id}#${i}`,
        tag: c.label,
        center: [c.a.x + (c.b.x - c.a.x) * t, c.a.y + (c.b.y - c.a.y) * t, c.a.z + (c.b.z - c.a.z) * t],
        radius: c.radius
      });
    }
  }
  return out;
}
