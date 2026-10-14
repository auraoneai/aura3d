/**
 * Patrol Wing arena physics — Rapier ring/pad/orb sensor layer.
 *
 * Extracted from legacy sky at 6f3085b3dfa13a4fc50eb67385cf3ef42c68fa0f,
 * values verbatim (src/legacy/sky.ts:646-877). The tribunal scoped this
 * port as data-only; scoping proved 4 of 17 flight-test cases drive this
 * sensor layer, so it travels as its own module. It imports only the
 * public `physics` facade and the extracted course data; nothing here
 * simulates the flight — the authored FlightModel owns the trajectory.
 */
import { physics } from "@aura3d/engine";
import {
  PAD_CENTER,
  PAD_RADIUS,
  PAD_Y,
  RING_COUNT,
  RING_GATES,
  terrainSurface
} from "./course-data";

// ---- arena physics: sensors + player proxy + orb pool -------------------------

export type ArenaPhysicsSensorKind = "ring" | "pad" | "orb-hit";

export interface ArenaSensorEvent {
  readonly kind: ArenaPhysicsSensorKind;
  readonly id: string;
  /** The other participant name (e.g. "player" for an orb hit). */
  readonly other: string;
}

export interface OrbState {
  readonly id: string;
  readonly active: boolean;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly age: number;
}

const ORB_POOL_SIZE = 8;
const ORB_SPEED = 16;
const ORB_LIFETIME = 4.5;
const ORB_SENSOR_RADIUS = 0.4;
export const PLAYER_SENSOR_RADIUS = 0.6;

export interface ArenaPhysics {
  readonly backend: string;
  readonly orbIds: readonly string[];
  setPlayerPosition(position: readonly [number, number, number]): void;
  spawnOrb(from: readonly [number, number, number], toward: readonly [number, number, number]): boolean;
  step(dt: number): readonly ArenaSensorEvent[];
  orbStates(): readonly OrbState[];
  orbActiveCount(): number;
  clearOrbs(): void;
  sensorEventCount(): number;
  bodyCount(): number;
}

/**
 * The arena's Rapier layer: a kinematic sensor-proxy sphere for the player
 * (r = 0.6, positioned per frame), six ring sensors, the pad sensor, and a
 * pooled set of kinematic return-fire orb sensors. Nothing here simulates the
 * flight — the authored FlightModel owns the trajectory.
 */
export function createArenaPhysics(ringHalfExtent = 3.0): ArenaPhysics {
  const world = physics.world({
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 4,
    enableSleeping: false
  });

  const colliderName = new Map<number, string>();
  const sensorColliders = new Set<number>();
  const armedPairs = new Set<string>();
  let pendingSensors: ArenaSensorEvent[] = [];
  let sensorEventCountValue = 0;

  const registerSensor = (colliderId: number, name: string): void => {
    colliderName.set(colliderId, name);
    sensorColliders.add(colliderId);
  };

  // Player dynamic sensor proxy (zero gravity, positioned per frame).
  const playerBody = world.createBody({
    type: "dynamic",
    position: [PAD_CENTER[0], PAD_Y + 0.45, PAD_CENTER[2]],
    mass: 100
  });
  const playerCollider = world.createCollider(playerBody, {
    shape: physics.sphere(PLAYER_SENSOR_RADIUS)
  });
  colliderName.set(playerCollider.id, "player");

  // Ordered ring sensors.
  for (const gate of RING_GATES) {
    const body = world.createBody({
      type: "static",
      position: [gate.position[0], gate.position[1], gate.position[2]]
    });
    const collider = world.createCollider(body, {
      shape: physics.box(ringHalfExtent, ringHalfExtent, ringHalfExtent * 0.9),
      sensor: true
    });
    registerSensor(collider.id, `ring:${gate.index}`);
  }

  // Landing pad sensor (thin disc above the pad slab).
  {
    const body = world.createBody({
      type: "static",
      position: [PAD_CENTER[0], PAD_Y + 0.6, PAD_CENTER[2]]
    });
    const collider = world.createCollider(body, {
      shape: physics.box(PAD_RADIUS + 0.6, 0.7, PAD_RADIUS + 0.6),
      sensor: true
    });
    registerSensor(collider.id, "pad:pad");
  }

  // Return-fire orb pool: dynamic bodies parked below the sea floor.
  const orbs: { id: string; body: ReturnType<typeof world.createBody>; active: boolean; direction: [number, number, number]; age: number }[] = [];
  const orbIds: string[] = [];
  for (let index = 0; index < ORB_POOL_SIZE; index += 1) {
    const id = `orb-${index}`;
    const body = world.createBody({ type: "dynamic", position: [0, -40 - index, 0], mass: 1 });
    const collider = world.createCollider(body, {
      shape: physics.sphere(ORB_SENSOR_RADIUS),
      sensor: true
    });
    registerSensor(collider.id, id);
    orbs.push({ id, body, active: false, direction: [0, 1, 0], age: 0 });
    orbIds.push(id);
  }

  let playerPosition: [number, number, number] = [PAD_CENTER[0], PAD_Y + 0.45, PAD_CENTER[2]];

  const step = (dt: number): readonly ArenaSensorEvent[] => {
    // March orbs before stepping so contacts reflect this frame's positions.
    for (const orb of orbs) {
      if (!orb.active) continue;
      orb.age += dt;
      const p = orb.body.position;
      const next: [number, number, number] = [
        p[0] + orb.direction[0] * ORB_SPEED * dt,
        p[1] + orb.direction[1] * ORB_SPEED * dt,
        p[2] + orb.direction[2] * ORB_SPEED * dt
      ];
      orb.body.setPosition(next);
      if (orb.age >= ORB_LIFETIME || Math.abs(next[0]) > 90 || Math.abs(next[2]) > 90 || next[1] < terrainSurface(next[0], next[2])) {
        orb.active = false;
        orb.body.setPosition([0, -40 - Number(orb.id.slice(4)), 0]);
      }
    }

    const events = world.step(dt);
    for (const event of events) {
      const contact = event.contact;
      if (!contact || !contact.sensor) continue;
      const aName = colliderName.get(contact.colliderA);
      const bName = colliderName.get(contact.colliderB);
      if (!aName || !bName) continue;
      if (event.type !== "begin") continue;
      const pairKey = [aName, bName].sort().join("::");
      if (armedPairs.has(pairKey)) continue;
      armedPairs.add(pairKey);
      sensorEventCountValue += 1;
      const ringA = aName.startsWith("ring:");
      const ringB = bName.startsWith("ring:");
      if (ringA || ringB) {
        pendingSensors.push({ kind: "ring", id: ringA ? aName : bName, other: ringA ? bName : aName });
      } else if (aName.startsWith("pad:") || bName.startsWith("pad:")) {
        pendingSensors.push({
          kind: "pad",
          id: aName.startsWith("pad:") ? aName : bName,
          other: aName.startsWith("pad:") ? bName : aName
        });
      } else if (aName.startsWith("orb-") || bName.startsWith("orb-")) {
        pendingSensors.push({
          kind: "orb-hit",
          id: aName.startsWith("orb-") ? aName : bName,
          other: aName.startsWith("orb-") ? bName : aName
        });
      }
    }
    // Release armed pairs that no longer overlap is handled implicitly: pair
    // keys are cleared when a matching "end" event arrives.
    for (const event of events) {
      if (event.type !== "end") continue;
      const contact = event.contact;
      const aName = contact ? colliderName.get(contact.colliderA) : undefined;
      const bName = contact ? colliderName.get(contact.colliderB) : undefined;
      if (!aName || !bName) continue;
      armedPairs.delete([aName, bName].sort().join("::"));
    }
    const out = pendingSensors;
    pendingSensors = [];
    return out;
  };

  let orbSequence = 0;
  return {
    get backend(): string {
      return world.snapshot().backend.active;
    },
    orbIds,
    setPlayerPosition(position): void {
      playerPosition = [...position] as [number, number, number];
      playerBody.setPosition(playerPosition);
    },
    spawnOrb(from, toward): boolean {
      const orb = orbs.find((candidate) => !candidate.active);
      if (!orb) return false;
      const dx = toward[0] - from[0];
      const dy = toward[1] - from[1];
      const dz = toward[2] - from[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      orb.direction = [dx / length, dy / length, dz / length];
      orb.age = 0;
      orb.active = true;
      orbSequence += 1;
      orb.body.setPosition([from[0], from[1], from[2]]);
      void orbSequence;
      return true;
    },
    step,
    orbStates(): readonly OrbState[] {
      return orbs.map((orb) => ({
        id: orb.id,
        active: orb.active,
        position: [...orb.body.position] as [number, number, number],
        direction: orb.direction,
        age: orb.age
      }));
    },
    orbActiveCount(): number {
      return orbs.filter((orb) => orb.active).length;
    },
    clearOrbs(): void {
      for (const orb of orbs) {
        orb.active = false;
        orb.body.setPosition([0, -40 - Number(orb.id.slice(4)), 0]);
      }
    },
    sensorEventCount(): number {
      return sensorEventCountValue;
    },
    bodyCount(): number {
      return 1 + RING_COUNT + 1 + ORB_POOL_SIZE;
    }
  };
}
