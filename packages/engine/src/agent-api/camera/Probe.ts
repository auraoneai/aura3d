/**
 * C-9 (PRD-08 §6.4): camera probe — `sphereCast`/`occluders` backing the C-22
 * `AuraCameraProbe`. Two tiers, per §6.4: a physics sweep via `sphereCastCollider`
 * (Raycast.ts) when colliders are supplied, and an always-available AABB-list
 * sweep over node bounds (runtime handles and static scene nodes). The
 * BVH-backed replacement is request Q-11-2; this module is what it replaces.
 */
import { sphereCastCollider, type Collider, type RigidBody } from "@aura3d/physics";
import type { AuraVec3 } from "../index.js";
import type { AuraCameraProbe } from "../../contracts/camera.js";

export interface ProbeBoundsEntry {
  readonly id: string;
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

export interface ProbePhysicsEntry {
  readonly collider: Collider;
  readonly body: RigidBody;
  /** Optional node id for `occluders` bookkeeping (unused by sphereCast itself). */
  readonly id?: string;
}

export interface AuraCameraProbeDeps {
  /** Live collider list; when it yields ≥1 entry the physics sweep is used. */
  readonly colliders?: () => Iterable<ProbePhysicsEntry>;
  /** Axis-aligned bounds of every potentially occluding node. */
  readonly bounds?: () => Iterable<ProbeBoundsEntry>;
  /** Ids the camera may see through (the subject itself, rigs, helpers). */
  readonly ignore?: (id: string) => boolean;
}

const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: AuraVec3): number => Math.hypot(v[0], v[1], v[2]);

/**
 * Ray-vs-AABB slab test on a segment `from→to` (t ∈ [0,1]) against the box
 * expanded by `expand` on every axis (Minkowski sum with the cast sphere).
 * Returns the entry t or undefined.
 */
function rayHitsExpandedAabb(
  from: AuraVec3,
  delta: AuraVec3,
  min: AuraVec3,
  max: AuraVec3,
  expand: number
): number | undefined {
  let tMin = 0;
  let tMax = 1;
  for (let i = 0; i < 3; i++) {
    const lo = min[i] - expand;
    const hi = max[i] + expand;
    const o = from[i];
    const d = delta[i];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return undefined;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return undefined;
  }
  return tMin;
}

export function createCameraProbe(deps: AuraCameraProbeDeps): AuraCameraProbe {
  const ignore = deps.ignore ?? (() => false);

  return {
    sphereCast(from, to, radius) {
      const delta = sub(to, from);
      const distance = len(delta);
      if (distance <= 1e-9) return { hit: false, distance: Number.POSITIVE_INFINITY };
      const dir = [delta[0] / distance, delta[1] / distance, delta[2] / distance] as AuraVec3;

      // Physics tier: narrow phase through sphereCastCollider.
      const colliders = deps.colliders?.();
      if (colliders) {
        let best: { hit: boolean; distance: number; node?: string } | undefined;
        // physics Vec3 is a mutable tuple — widen the readonly AuraVec3s.
        const mut = (v: AuraVec3): [number, number, number] => [v[0], v[1], v[2]];
        for (const entry of colliders) {
          const hit = sphereCastCollider(mut(from), radius, mut(dir), entry.collider, entry.body, {
            maxDistance: distance
          });
          if (hit && (!best || hit.distance < best.distance)) {
            best = { hit: true, distance: hit.distance, node: entry.id };
          }
        }
        if (best) return best;
        // fall through to AABB list too — a collider list may not cover
        // static scenery nodes that have bounds but no physics body.
      }

      // AABB tier: sweep a sphere-equivalent box-expanded AABB per node.
      let bestT = Number.POSITIVE_INFINITY;
      let bestId: string | undefined;
      for (const b of deps.bounds?.() ?? []) {
        if (ignore(b.id)) continue;
        const t = rayHitsExpandedAabb(from, delta, b.min, b.max, radius);
        if (t !== undefined && t < bestT) {
          bestT = t;
          bestId = b.id;
        }
      }
      if (bestId === undefined) return { hit: false, distance: Number.POSITIVE_INFINITY };
      return { hit: true, distance: bestT * distance, node: bestId };
    },

    occluders(from, to) {
      const delta = sub(to, from);
      const ids: string[] = [];
      // Thin-probe radius so occluders() reports what a near-infinitesimal cast hits.
      for (const b of deps.bounds?.() ?? []) {
        if (ignore(b.id)) continue;
        if (rayHitsExpandedAabb(from, delta, b.min, b.max, 0.02) !== undefined) ids.push(b.id);
      }
      return ids;
    }
  };
}
