/**
 * C-9 (PRD-08 §6.4): camera probe — `sphereCast`/`occluders` backing the C-22
 * `AuraCameraProbe`. Two tiers, per §6.4: a physics sweep via `sphereCastCollider`
 * (Raycast.ts) when colliders are supplied, and an always-available AABB-list
 * sweep over node bounds (runtime handles and static scene nodes). The
 * BVH-backed replacement is request Q-11-2; this module is what it replaces.
 */
import { sphereCastCollider, type Collider, type RigidBody } from "@aura3d/physics/solverless";
import type { AuraVec3 } from "../index.js";
import type { AuraCameraProbe } from "../../contracts/camera.js";
import { CAMERA_SUBJECT_PROBE, type CameraSubjectRef, type SubjectAwareCameraProbe } from "./rigs/rigUtils.js";

export interface ProbeBoundsEntry {
  readonly id: string;
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

export interface ProbePhysicsEntry {
  readonly collider: Collider;
  readonly body: RigidBody;
  /** Optional node id; an unidentified collider is never presumed to be the subject. */
  readonly id?: string;
  /** Exact node identity, when available; takes precedence over the id. */
  readonly owner?: object;
}

/** Entries known to belong to one particular subject, not every referenced node. */
export interface CameraProbeTargetFilter {
  readonly bounds?: (entry: ProbeBoundsEntry) => boolean;
  readonly colliders?: (entry: ProbePhysicsEntry) => boolean;
}

export type AuraCameraProbeTier = "low" | "medium" | "high" | "ultra";

/**
 * Per-presented-frame probe budget (PRD-08 §17 / §19): `sphereCasts` is the
 * camera's sphere-cast cap; `occluderQueries` are dedicated occluder queries
 * on top of it (Ultra only); `fade` false gates the occluder-fade query off
 * entirely (Low: "fade feature off"). With fade on and no dedicated query
 * left, `occluders()` spends one sphere-cast slot.
 */
export interface AuraCameraProbeBudget {
  readonly sphereCasts: number;
  readonly occluderQueries: number;
  readonly fade: boolean;
}

/** §17 tier → probe budget (C-27 `QUALITY_TIERS` names). */
export const CAMERA_PROBE_TIER_BUDGETS: Readonly<Record<AuraCameraProbeTier, AuraCameraProbeBudget>> = Object.freeze({
  low: Object.freeze({ sphereCasts: 1, occluderQueries: 0, fade: false }),
  medium: Object.freeze({ sphereCasts: 2, occluderQueries: 0, fade: true }),
  high: Object.freeze({ sphereCasts: 3, occluderQueries: 0, fade: true }),
  ultra: Object.freeze({ sphereCasts: 3, occluderQueries: 1, fade: true })
});

/** Budget for a C-27 tier name; anything else (missing controller) → high. */
export function cameraProbeBudgetForTier(tier: unknown): AuraCameraProbeBudget {
  return CAMERA_PROBE_TIER_BUDGETS[
    tier === "low" || tier === "medium" || tier === "high" || tier === "ultra" ? tier : "high"
  ];
}

/** Per-frame probe counters since the last `beginFrame()`. */
export interface AuraCameraProbeFrameStats {
  readonly sphereCasts: number;
  readonly occluderQueries: number;
  /** Casts/queries refused by the budget this frame. */
  readonly deniedCasts: number;
  readonly deniedOccluderQueries: number;
}

export interface AuraBudgetedCameraProbe extends AuraCameraProbe {
  /** Reset the per-frame budget; the camera calls this once per presented frame. */
  beginFrame(): void;
  stats(): AuraCameraProbeFrameStats;
}

export interface AuraCameraProbeDeps {
  /**
   * Live per-frame budget (read at `beginFrame`). Absent → unlimited, the
   * pre-§17 behaviour for standalone probes.
   */
  readonly budget?: () => AuraCameraProbeBudget | undefined;
  /** Live collider list; when it yields ≥1 entry the physics sweep is used. */
  readonly colliders?: () => Iterable<ProbePhysicsEntry>;
  /** Axis-aligned bounds of every potentially occluding node. */
  readonly bounds?: () => Iterable<ProbeBoundsEntry>;
  /** Ids the camera may see through (the subject itself, rigs, helpers). */
  readonly ignore?: (id: string) => boolean;
  /**
   * Resolve a rig's target to exact probe entries on each query. An unresolved
   * target is an error, rather than a reason to ignore unrelated geometry.
   */
  readonly targetFilter?: (target: CameraSubjectRef) => CameraProbeTargetFilter | undefined;
  /**
   * Preserve the legacy unscoped standalone probe's origin-containing-box
   * heuristic by default. Target-aware probes default it off and exclude by
   * identity instead, so a wall containing the look point remains a real hit.
   */
  readonly ignoreOriginBounds?: boolean;
}

const sub = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v: AuraVec3): number => Math.hypot(v[0], v[1], v[2]);
const contains = (b: ProbeBoundsEntry, p: AuraVec3): boolean =>
  p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];

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

const NO_HIT = Object.freeze({ hit: false, distance: Number.POSITIVE_INFINITY });

export function createCameraProbe(deps: AuraCameraProbeDeps): AuraBudgetedCameraProbe {
  const ignore = deps.ignore ?? (() => false);
  const ignoreOriginBounds = deps.ignoreOriginBounds ?? !deps.targetFilter;
  let budget = deps.budget?.();
  let casts = 0;
  let queries = 0;
  let deniedCasts = 0;
  let deniedQueries = 0;
  const castAllowed = () => !budget || casts < budget.sphereCasts;
  const stringTargets = new Map<string, AuraCameraProbe>();
  const objectTargets = new WeakMap<object, AuraCameraProbe>();

  function targetFilter(target: CameraSubjectRef | undefined): CameraProbeTargetFilter | undefined {
    if (target === undefined) return undefined;
    const filter = deps.targetFilter?.(target);
    if (!filter) throw new Error("Camera collision target could not be mapped to this probe.");
    return filter;
  }

  function sphereCast(from: AuraVec3, to: AuraVec3, radius: number, target?: CameraSubjectRef) {
    // Over the tier cap: no hit (the damper eases back out on its slow
    // push-out spring) — never an unbudgeted cast.
    if (!castAllowed()) {
      deniedCasts += 1;
      return NO_HIT;
    }
    casts += 1;
    const delta = sub(to, from);
    const distance = len(delta);
    if (distance <= 1e-9) return { hit: false, distance: Number.POSITIVE_INFINITY };
    const dir = [delta[0] / distance, delta[1] / distance, delta[2] / distance] as AuraVec3;
    const filter = targetFilter(target);

    // Physics tier: narrow phase through sphereCastCollider.
    let best: { hit: boolean; distance: number; node?: string } | undefined;
    const colliders = deps.colliders?.();
    if (colliders) {
      // physics Vec3 is a mutable tuple — widen the readonly AuraVec3s.
      const mut = (v: AuraVec3): [number, number, number] => [v[0], v[1], v[2]];
      for (const entry of colliders) {
        if (filter?.colliders?.(entry)) continue;
        const hit = sphereCastCollider(mut(from), radius, mut(dir), entry.collider, entry.body, {
          maxDistance: distance
        });
        if (hit && (!best || hit.distance < best.distance)) {
          best = { hit: true, distance: hit.distance, node: entry.id };
        }
      }
    }

    // AABB tier: sweep a sphere-equivalent box-expanded AABB per node.
    // Compare both tiers: a physics hit must not hide a nearer static wall.
    for (const b of deps.bounds?.() ?? []) {
      if (ignore(b.id) || filter?.bounds?.(b) || (ignoreOriginBounds && contains(b, from))) continue;
      const t = rayHitsExpandedAabb(from, delta, b.min, b.max, radius);
      if (t !== undefined && (!best || t * distance < best.distance)) {
        best = { hit: true, distance: t * distance, node: b.id };
      }
    }
    return best ?? NO_HIT;
  }

  function occluders(from: AuraVec3, to: AuraVec3, target?: CameraSubjectRef): readonly string[] {
    if (budget) {
      if (!budget.fade) {
        deniedQueries += 1;
        return [];
      }
      if (queries < budget.occluderQueries) queries += 1;
      else if (castAllowed()) casts += 1;
      else {
        deniedQueries += 1;
        return [];
      }
    } else {
      queries += 1;
    }
    const delta = sub(to, from);
    const ids: string[] = [];
    const filter = targetFilter(target);
    // Thin-probe radius so occluders() reports what a near-infinitesimal cast hits.
    for (const b of deps.bounds?.() ?? []) {
      if (ignore(b.id) || filter?.bounds?.(b) || (ignoreOriginBounds && contains(b, from))) continue;
      if (rayHitsExpandedAabb(from, delta, b.min, b.max, 0.02) !== undefined) ids.push(b.id);
    }
    return ids;
  }

  const probe: AuraBudgetedCameraProbe & SubjectAwareCameraProbe = {
    beginFrame() {
      budget = deps.budget?.();
      casts = 0;
      queries = 0;
      deniedCasts = 0;
      deniedQueries = 0;
    },
    stats() {
      return { sphereCasts: casts, occluderQueries: queries, deniedCasts, deniedOccluderQueries: deniedQueries };
    },
    sphereCast: (from, to, radius) => sphereCast(from, to, radius),
    occluders: (from, to) => occluders(from, to),
    ...(deps.targetFilter ? {
      [CAMERA_SUBJECT_PROBE](target: CameraSubjectRef): AuraCameraProbe {
        const existing = typeof target === "string" ? stringTargets.get(target) : objectTargets.get(target);
        if (existing) return existing;
        const scoped: AuraCameraProbe = {
          sphereCast: (from, to, radius) => sphereCast(from, to, radius, target),
          occluders: (from, to) => occluders(from, to, target)
        };
        if (typeof target === "string") stringTargets.set(target, scoped);
        else objectTargets.set(target, scoped);
        return scoped;
      }
    } : {})
  };
  return probe;
}
