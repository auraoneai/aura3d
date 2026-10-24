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

/** Half extents (x, z), height and largest dimension of each Meshy model's bounds (read from the GLBs). */
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

/** Gate pillars are the 13 m Meshy pylon (1.9 tall, 0.34 wide model scaled to 13 m); lintel is the 0.9 x 0.7 x 23.2 box. */
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
