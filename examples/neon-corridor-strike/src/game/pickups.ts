import type { AuraPhysicsRuntime } from "@aura3d/engine";
import { MAX_HP, type FpsRunState } from "./state";

/**
 * NC-A2: overlap-sphere pickup collection. The trigger-sensor handler in
 * main.ts stays authoritative first; this sweep is a robustness augmentation
 * for the walk-path collection that historically flaked when a sensor begin
 * event was missed. Both paths dedupe through `state.collected`, and the
 * Playwright pickup assertions stay untouched and authoritative.
 */
export const PICKUP_OVERLAP_RADIUS = 0.95;

export interface PickupCollectionHooks {
  readonly removeBody: (name: string) => void;
  readonly hideNode: (name: string) => void;
  readonly onCollected?: (name: string, kind: "ammo" | "health") => void;
}

export type PickupKind = "ammo" | "health";

function pickupKind(name: string): PickupKind {
  return name.includes("ammo") ? "ammo" : "health";
}

/** Shared by the trigger handler and the overlap sweep so effects cannot drift. */
export function collectPickupByName(
  state: FpsRunState,
  hooks: PickupCollectionHooks,
  name: string
): boolean {
  if (!name.startsWith("pickup-") || state.collected.includes(name)) return false;
  state.collected.push(name);
  state.pickups += 1;
  const kind = pickupKind(name);
  if (kind === "ammo") {
    state.reserve += 8;
    state.objective = "Ammo crate cracked";
  } else {
    state.hp = Math.min(MAX_HP, state.hp + 35);
    state.objective = "Field dressing applied";
  }
  hooks.removeBody(name);
  hooks.hideNode(name);
  hooks.onCollected?.(name, kind);
  return true;
}

/**
 * One overlapSphere sweep around the player capsule. Runs every frame while
 * playing; returns how many pickups were collected by THIS sweep.
 */
export function collectPickupsNearPlayer(
  state: FpsRunState,
  physics: AuraPhysicsRuntime,
  playerAt: readonly [number, number, number],
  hooks: PickupCollectionHooks
): number {
  if (state.status !== "playing" || state.paused) return 0;
  state.overlapPickupChecks += 1;
  // Probe slightly below capsule center: pickups sit at y 0.45, the capsule
  // at WALK_Y 0.9, so an unshifted sphere wastes half its radius on air.
  const probe: readonly [number, number, number] = [playerAt[0], playerAt[1] - 0.35, playerAt[2]];
  const overlapping = physics.queries.overlapSphere(probe, PICKUP_OVERLAP_RADIUS, { layers: ["pickup"] });
  let collected = 0;
  for (const body of overlapping) {
    const name = body.nodeName ?? "";
    // Only real pickups: the exit sensor shares the pickup layer and must
    // keep its own win handling in main.ts.
    if (!name.startsWith("pickup-")) continue;
    if (collectPickupByName(state, hooks, name)) collected += 1;
  }
  return collected;
}
