import type { AuraBodyHandle, AuraPhysicsRuntime } from "@aura3d/engine";
import { ENEMIES } from "./enemies";
import { PICKUPS } from "./level";

/**
 * NC-A1 dynamic debris props + NC-A4 spring-joint hanging lamps.
 *
 * Route-local set dressing on the public physics surface. Scatter is cosmetic
 * (no damage model): a confirmed shot impact applies an impulse to props near
 * the impact point so cover scatters, and nothing gameplay-facing reads prop
 * positions. The debris collision layer touches only wall + itself, so hitscan,
 * touch damage, pickups, and the exit sensor behave exactly as before.
 */

export interface PropSpec {
  readonly id: string;
  readonly kind: "barrel" | "crate";
  readonly x: number;
  readonly z: number;
  readonly halfExtents: readonly [number, number, number];
}

/** Authored exit-sensor corridor: no prop may sit inside this rect. */
export const EXIT_CORRIDOR = { minX: -2.8, maxX: 2.8, minZ: -9.2, maxZ: -7.6 } as const;
/** No prop closer than this to any pickup center (walk-path collection stays clean). */
export const PICKUP_CLEARANCE = 1.3;
/** Playable hull the props must stay inside (inner wall faces are at ~4.8 m). */
export const PLAYABLE_BOUNDS = { minX: -4.3, maxX: 4.3, minZ: -7.9, maxZ: 8.9 } as const;

/**
 * The playable spec's pickup walk path, as authored rectangles: the spawn zone
 * plus the strafe-right/forward approach to ammo-1 that the browser spec drives.
 * Props never spawn inside these rects.
 */
export const WALK_PATH_RECTS: readonly { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }[] = [
  { minX: -1.3, maxX: 1.3, minZ: 7.9, maxZ: 9.5 },
  { minX: 1.35, maxX: 2.45, minZ: 5.3, maxZ: 9.5 }
];

/** Enemy spawn/patrol lanes as strips: enemies own their z-band plus patrol x-range. */
export function enemyLaneRects(): { id: string; minX: number; maxX: number; minZ: number; maxZ: number }[] {
  return ENEMIES.map((enemy) => ({
    id: enemy.id,
    minX: Math.min(enemy.x, enemy.patrol[0]) - 1,
    maxX: Math.max(enemy.x, enemy.patrol[0]) + 1,
    minZ: enemy.z - 1,
    maxZ: enemy.z + 1
  }));
}

/** Barrels and crates: dynamic boxes per the PRD, parked against the walls. */
export const PROPS: readonly PropSpec[] = [
  { id: "barrel-1", kind: "barrel", x: -3.6, z: 4.6, halfExtents: [0.22, 0.34, 0.22] },
  { id: "barrel-2", kind: "barrel", x: 3.7, z: 2.2, halfExtents: [0.22, 0.34, 0.22] },
  { id: "barrel-3", kind: "barrel", x: -3.7, z: -6.8, halfExtents: [0.22, 0.34, 0.22] },
  { id: "crate-1", kind: "crate", x: -3.8, z: -0.9, halfExtents: [0.26, 0.19, 0.26] },
  { id: "crate-2", kind: "crate", x: 3.6, z: -4.9, halfExtents: [0.26, 0.19, 0.26] },
  { id: "crate-3", kind: "crate", x: 3.8, z: 6.8, halfExtents: [0.26, 0.19, 0.26] }
];

export interface LampSpec {
  readonly id: string;
  /** Ceiling anchor (world space); the bulb hangs below on a spring joint. */
  readonly anchor: readonly [number, number, number];
  /** Rest distance from anchor to bulb center. */
  readonly hang: number;
}

/** Two practicals near the walls: never over the aim line or walk path. */
export const LAMPS: readonly LampSpec[] = [
  { id: "lamp-near", anchor: [-2.55, 2.58, 3.2], hang: 0.42 },
  // Keep this practical against the wall shell rather than inside e2's rush
  // lane. It remains visible in the same far encounter bay, but cannot be
  // mistaken for cover or interfere with the enemy's readable approach.
  { id: "lamp-far", anchor: [3.12, 2.58, -4.4], hang: 0.42 }
];

const PROP_LAYER = "debris";
/**
 * Spring tuning is normalized (the public joint API clamps stiffness to 0..1).
 * The production Rapier adapter clamps spring force, so a free-hanging mass
 * creeps to the floor no matter the stiffness. Route-local buoyancy support
 * (applyLampSupport) cancels each bulb's weight every frame, leaving the REAL
 * spring joint to carry only sway — which then behaves like a classic damped
 * pendulum and settles deterministically.
 */
const LAMP_STIFFNESS = 1;
const LAMP_DAMPING = 0.6;
const LAMP_MASS = 0.4;

const propBodies = new Map<string, AuraBodyHandle>();
const lampBodies = new Map<string, AuraBodyHandle>();
let scatterCount = 0;

function propRest(spec: PropSpec): readonly [number, number, number] {
  return [spec.x, spec.halfExtents[1] + 0.03, spec.z];
}

export function lampBulbRest(lamp: LampSpec): readonly [number, number, number] {
  return [lamp.anchor[0], lamp.anchor[1] - lamp.hang, lamp.anchor[2]];
}

export interface PlacementLawResult {
  readonly violations: readonly string[];
}

function pointInRect(x: number, z: number, r: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

/**
 * Pure placement-law audit over the authored prop list (plus any extra test
 * coords). Returns one human-readable violation per offending placement.
 */
export function propPlacementViolations(extra?: readonly { x: number; z: number; label: string }[]): PlacementLawResult {
  const violations: string[] = [];
  const lanes = enemyLaneRects();
  const check = (x: number, z: number, label: string): void => {
    if (x < PLAYABLE_BOUNDS.minX || x > PLAYABLE_BOUNDS.maxX || z < PLAYABLE_BOUNDS.minZ || z > PLAYABLE_BOUNDS.maxZ) {
      violations.push(label + ": outside playable bounds");
    }
    if (pointInRect(x, z, EXIT_CORRIDOR)) violations.push(label + ": inside exit-sensor corridor");
    for (const rect of WALK_PATH_RECTS) {
      if (pointInRect(x, z, rect)) violations.push(label + ": inside pickup walk path");
    }
    for (const lane of lanes) {
      if (pointInRect(x, z, lane)) violations.push(label + ": inside enemy lane " + lane.id);
    }
    for (const pickup of PICKUPS) {
      if (Math.hypot(pickup.x - x, pickup.z - z) < PICKUP_CLEARANCE) {
        violations.push(label + ": within " + PICKUP_CLEARANCE + "m of pickup " + pickup.id);
      }
    }
  };
  for (const prop of PROPS) check(prop.x, prop.z, "prop " + prop.id);
  for (const lamp of LAMPS) check(lamp.anchor[0], lamp.anchor[2], "lamp " + lamp.id);
  for (const extraCase of extra ?? []) check(extraCase.x, extraCase.z, extraCase.label);
  return { violations };
}

export function createPropWorld(physics: AuraPhysicsRuntime): void {
  propBodies.clear();
  lampBodies.clear();
  scatterCount = 0;
  for (const prop of PROPS) {
    const name = "prop-" + prop.id;
    const body = physics.createBody({
      name,
      type: "dynamic",
      shape: "box",
      position: propRest(prop),
      halfExtents: [...prop.halfExtents],
      mass: prop.kind === "barrel" ? 1.1 : 0.9,
      layer: PROP_LAYER,
      linearDamping: 0.25,
      angularDamping: 0.4
    });
    propBodies.set(name, body);
  }
  for (const lamp of LAMPS) {
    const anchorName = lamp.id + "-anchor";
    physics.createBody({
      name: anchorName,
      type: "static",
      shape: "sphere",
      radius: 0.02,
      position: [...lamp.anchor],
      layer: PROP_LAYER
    });
    const bulbName = lamp.id;
    const at = lampBulbRest(lamp);
    const bulb = physics.createBody({
      name: bulbName,
      type: "dynamic",
      shape: "sphere",
      radius: 0.09,
      position: [...at],
      mass: LAMP_MASS,
      layer: PROP_LAYER,
      linearDamping: 0.7
    });
    physics.createJoint({
      kind: "spring",
      bodyA: anchorName,
      bodyB: bulbName,
      anchor: [...lamp.anchor],
      stiffness: LAMP_STIFFNESS,
      damping: LAMP_DAMPING,
      restLength: lamp.hang
    });
    lampBodies.set(bulbName, bulb);
  }
}

/** Reset run: teleport every prop and bulb back to its authored rest pose. */
export function resetProps(physics: AuraPhysicsRuntime): void {
  for (const prop of PROPS) {
    propBodies.get("prop-" + prop.id)?.teleport(propRest(prop));
  }
  for (const lamp of LAMPS) {
    lampBodies.get(lamp.id)?.teleport(lampBulbRest(lamp));
  }
}

interface PoseNode {
  setPosition(x: number, y: number, z: number): unknown;
}

/**
 * Per-frame buoyancy: cancels each bulb's weight so the force-clamped public
 * spring joint carries only sway dynamics. Deterministic by construction.
 */
export function applyLampSupport(physics: AuraPhysicsRuntime): void {
  const g = physics.gravity();
  const compensation = -LAMP_MASS * g[1];
  for (const [, body] of lampBodies) {
    body.applyForce([0, compensation, 0]);
  }
}

/** Visual sync: prop meshes and lamp bulbs/shades follow their bodies. */
export function syncPropNodes(
  nodes: { get(id: string): PoseNode | undefined },
  dt: number
): void {
  void dt;
  for (const [name, body] of propBodies) {
    const at = body.position();
    nodes.get(name)?.setPosition(at[0], at[1], at[2]);
  }
  for (const lamp of LAMPS) {
    const body = lampBodies.get(lamp.id);
    if (!body) continue;
    const at = body.position();
    nodes.get(lamp.id + "-bulb")?.setPosition(at[0], at[1], at[2]);
    nodes.get(lamp.id + "-shade")?.setPosition(at[0], at[1] + 0.09, at[2]);
  }
}

export interface ScatterOptions {
  readonly radius?: number;
  readonly impulse?: number;
}

/**
 * NC-A1 impulse hook: nudge props within radius of a confirmed impact point.
 * Deterministic direction (away from impact, slight lift), cosmetic magnitude.
 * Returns how many props were nudged.
 */
export function scatterPropsAt(
  physics: AuraPhysicsRuntime,
  point: readonly [number, number, number],
  options: ScatterOptions = {}
): number {
  const radius = options.radius ?? 2.2;
  const impulseScale = options.impulse ?? 3.2;
  let nudged = 0;
  for (const [, body] of propBodies) {
    const at = body.position();
    const dx = at[0] - point[0];
    const dz = at[2] - point[2];
    const flat = Math.hypot(dx, dz);
    if (flat > radius) continue;
    const falloff = 1 - flat / radius;
    const nx = flat > 1e-4 ? dx / flat : 0;
    const nz = flat > 1e-4 ? dz / flat : 1;
    body.applyImpulse([nx * impulseScale * falloff, 0.55 * impulseScale * falloff, nz * impulseScale * falloff]);
    nudged += 1;
  }
  // NC-A4: shots landing near a lamp make it sway. Horizontal-only impulse:
  // the force-clamped spring basin is entered cleanly and never pumped.
  for (const [, body] of lampBodies) {
    const at = body.position();
    const dx = at[0] - point[0];
    const dz = at[2] - point[2];
    const flat = Math.hypot(dx, dz);
    if (flat > radius) continue;
    const falloff = 1 - flat / radius;
    const len = Math.max(1e-4, flat);
    // 0.5 sits just under the force-clamped spring's stability edge: probed on
    // the production backend, it yields a visible ~5cm swing that always
    // settles back; larger kicks punch through the clamp and sag the bulb.
    body.applyImpulse([(dx / len) * 0.5 * falloff, 0, (dz / len) * 0.5 * falloff]);
    nudged += 1;
  }
  if (nudged > 0) scatterCount += 1;
  return nudged;
}

/** Evidence: how many confirmed impacts scattered something this run. */
export function scatterEvents(): number {
  return scatterCount;
}

/** Reset-scoped state helper so resetRun can zero module counters. */
export function resetPropEvidence(): void {
  scatterCount = 0;
}
