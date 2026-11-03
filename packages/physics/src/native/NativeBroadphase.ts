import type { Collider } from "../Collider.js";
import type { RigidBody } from "../RigidBody.js";
import type { Bounds } from "../Shape.js";

export interface NativeBroadphaseEntry {
  readonly collider: Collider;
  readonly body: RigidBody;
}

export type NativeBroadphasePair = readonly [NativeBroadphaseEntry, NativeBroadphaseEntry];

export interface NativeBroadphaseResult {
  readonly pairs: readonly NativeBroadphasePair[];
  readonly finiteColliders: number;
  readonly infiniteColliders: number;
  readonly candidateTests: number;
  readonly rejectedByBounds: number;
  readonly activeMax: number;
}

/** Conservative sweep along X; each returned pair has reciprocal layer permission. */
export function collectNativePairs(entries: readonly NativeBroadphaseEntry[]): NativeBroadphaseResult {
  type Bounded = NativeBroadphaseEntry & { readonly bounds: Bounds };
  const bounded: Bounded[] = [];
  const infinite: NativeBroadphaseEntry[] = [];
  const ids = new Set<number>();
  for (const entry of entries) {
    if (entry.collider.bodyId !== entry.body.id) throw new Error("Native broadphase collider does not belong to its body.");
    if (ids.has(entry.collider.id)) throw new Error(`Duplicate native broadphase collider ${entry.collider.id}.`);
    ids.add(entry.collider.id);
    if (entry.collider.shape.kind === "plane") infinite.push(entry);
    else bounded.push({ ...entry, bounds: entry.collider.bounds(entry.body.position, entry.body.rotation) });
  }
  bounded.sort((a, b) => a.bounds.min[0] - b.bounds.min[0] || a.collider.id - b.collider.id);
  infinite.sort((a, b) => a.collider.id - b.collider.id);
  const pairs: NativeBroadphasePair[] = [];
  let candidateTests = 0, rejectedByBounds = 0, activeMax = 0;
  const add = (a: NativeBroadphaseEntry, b: NativeBroadphaseEntry): void => {
    if (a.body.id === b.body.id || !a.collider.canCollideWith(b.collider)) return;
    if (a.body.type !== "dynamic" && b.body.type !== "dynamic" && !a.collider.sensor && !b.collider.sensor) return;
    pairs.push(a.collider.id < b.collider.id ? [a, b] : [b, a]);
  };
  let active: Bounded[] = [];
  for (const entry of bounded) {
    active = active.filter((other) => other.bounds.max[0] >= entry.bounds.min[0]);
    for (const other of active) {
      candidateTests += 1;
      if (overlaps(other.bounds, entry.bounds)) add(other, entry);
      else rejectedByBounds += 1;
    }
    for (const other of infinite) { candidateTests += 1; add(other, entry); }
    active.push(entry);
    activeMax = Math.max(activeMax, active.length);
  }
  for (let first = 0; first < infinite.length; first += 1) {
    for (let second = first + 1; second < infinite.length; second += 1) {
      candidateTests += 1;
      add(infinite[first]!, infinite[second]!);
    }
  }
  pairs.sort((a, b) => a[0].collider.id - b[0].collider.id || a[1].collider.id - b[1].collider.id);
  return { pairs, finiteColliders: bounded.length, infiniteColliders: infinite.length, candidateTests, rejectedByBounds, activeMax };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] &&
    b.min[1] <= a.max[1] && a.min[2] <= b.max[2] && b.min[2] <= a.max[2];
}
