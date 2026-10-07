/**
 * Patrol Wing drone swarm (PRD PW-07): route-local deterministic pursuit AI,
 * combatWorld actor wiring, and return-fire orbs.
 *
 * This AI is ROUTE-LOCAL (Turbo opponent-AI precedent): no reusable pilot-kit
 * or dogfight-AI claim. Motion is authored (chase-orbit pursuit with per-drone
 * LCG seeds); damage resolution runs through the public `game.combatWorld()`.
 */
import { game, type GameCombatWorld } from "@aura3d/engine";
import type { DroneSpawn } from "./patrol";
import type { Vec3 } from "./flight";

export const DRONE_HEALTH = 100;
export const CANNON_DAMAGE = 34; // three hits kill a fresh drone
export const ORB_DAMAGE = 12;
export const DRONE_FIRE_RANGE = 30;
export const DRONE_FIRE_COOLDOWN = 1.6;

export interface DroneRuntime {
  readonly id: string;
  readonly variant: "A" | "B";
  position: Vec3;
  health: number;
  alive: boolean;
  fireCooldown: number;
  orbitSign: 1 | -1;
  seedState: number;
}

export type DroneEvent =
  | { readonly type: "orb-fired"; readonly from: Vec3; readonly toward: Vec3 }
  | { readonly type: "drone-down"; readonly id: string }
  | { readonly type: "cannon-hit"; readonly targetId: string; readonly damage: number };

export interface DroneSwarmSnapshot {
  readonly liveCount: number;
  readonly downCount: number;
  readonly nearestDistance: number | null;
  readonly positions: readonly { readonly id: string; readonly position: Vec3 }[];
}

function lcgNext(state: number): number {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return next;
}

function lcgUnit(state: number): { state: number; value: number } {
  const next = lcgNext(state);
  return { state: next, value: next / 0xffffffff };
}

/**
 * The swarm owns drone state and pursuit; the combat world owns hit/health
 * resolution. Positions are synced INTO combat actors each frame so hitboxes
 * track the authored motion.
 */
export class DroneSwarm {
  private readonly drones = new Map<string, DroneRuntime>();
  private readonly combat: GameCombatWorld;
  private downCountValue = 0;
  private combatEventCountValue = 0;
  private playerActorId: string;

  constructor(playerActorId: string, combat: GameCombatWorld) {
    this.playerActorId = playerActorId;
    this.combat = combat;
    this.resetCombatPlayer({ position: [0, 0, 0], facing: 1 });
  }

  resetCombatPlayer(player: { position: Vec3; facing: 1 | -1 }): void {
    this.combat.setActor(this.playerActorId, {
      id: this.playerActorId,
      team: "patrol",
      position: [...player.position] as [number, number, number],
      facing: player.facing,
      health: DRONE_HEALTH,
      guard: 0,
      hurtboxes: [{ id: "plane", offset: [0, 0, 0], size: [1.6, 1.2, 1.6] }],
      guarding: false
    });
  }

  get downCount(): number {
    return this.downCountValue;
  }

  get combatEventCount(): number {
    return this.combatEventCountValue;
  }

  get liveCount(): number {
    let live = 0;
    for (const drone of this.drones.values()) if (drone.alive) live += 1;
    return live;
  }

  get allCleared(): boolean {
    return this.drones.size > 0 && this.liveCount === 0;
  }

  get spawnedCount(): number {
    return this.drones.size;
  }

  spawnWave(spawns: readonly DroneSpawn[]): void {
    for (const spawn of spawns) {
      this.drones.set(spawn.id, {
        id: spawn.id,
        variant: spawn.variant,
        position: [...spawn.position] as Vec3,
        health: DRONE_HEALTH,
        alive: true,
        fireCooldown: 1.2,
        orbitSign: spawn.seed % 2 === 0 ? 1 : -1,
        seedState: spawn.seed >>> 0
      });
      this.combat.addActor({
        id: spawn.id,
        team: "drone",
        position: [...spawn.position] as [number, number, number],
        facing: 1,
        health: DRONE_HEALTH,
        guard: 0,
        hurtboxes: [{ id: "body", offset: [0, 0, 0], size: [1.5, 1.5, 1.5] }],
        guarding: false
      });
    }
  }

  /**
   * Player cannon: combat hitbox offsets are ATTACKER-RELATIVE (worldBox adds
   * offset*facing to the actor position), so the caller passes the nose-ahead
   * offset = forward * distance; facing stays 1 so the offset is world-space.
   */
  beginCannonAttack(hitboxOffset: Vec3): void {
    void this.combat.beginAttack(this.playerActorId, {
      id: "cannon-burst",
      damage: CANNON_DAMAGE,
      hitStop: 0,
      hitStun: 0,
      recovery: 0,
      activeFrames: [1, 1],
      durationFrames: 1,
      knockback: [0, 0, 0],
      blockable: false,
      hitboxes: [{ id: "burst", offset: [hitboxOffset[0], hitboxOffset[1], hitboxOffset[2]], size: [24.0, 10.0, 24.0] }]
    });
  }

  /**
   * Advance pursuit + return fire + combat resolution. Returns drone events.
   * `combat` hitboxes are world-space offsets from the ATTACKER position, so
   * the caller passes the plane position; the hitbox center is absolute.
   */
  update(dt: number, playerPosition: Vec3, speed: number): readonly DroneEvent[] {
    const events: DroneEvent[] = [];

    // Authored chase-orbit pursuit.
    for (const drone of this.drones.values()) {
      if (!drone.alive) continue;
      const dx = playerPosition[0] - drone.position[0];
      const dy = playerPosition[1] - drone.position[1];
      const dz = playerPosition[2] - drone.position[2];
      const distance = Math.hypot(dx, dy, dz) || 1;
      const nx = dx / distance;
      const ny = dy / distance;
      const nz = dz / distance;
      // Orbit tangent (XZ perpendicular), seeded sign for variety.
      const tx = -nz * drone.orbitSign;
      const tz = nx * drone.orbitSign;
      const jitter = lcgUnit(drone.seedState);
      drone.seedState = jitter.state;
      const wobble = (jitter.value - 0.5) * 0.4;
      let vx = nx * 0.82 + tx * (0.5 + wobble);
      let vy = ny * 0.55;
      let vz = nz * 0.82 + tz * (0.5 + wobble);
      // Stand-off: never ram; hold a 6 m orbit ring when close.
      if (distance < 7) {
        const back = (7 - distance) / 7;
        vx -= nx * back * 1.6;
        vy -= ny * back * 1.6;
        vz -= nz * back * 1.6;
      }
      const vlen = Math.hypot(vx, vy, vz) || 1;
      vx /= vlen; vy /= vlen; vz /= vlen;
      drone.position = [
        drone.position[0] + vx * speed * dt,
        drone.position[1] + vy * speed * dt,
        drone.position[2] + vz * speed * dt
      ];

      // Return fire: cooldown-gated orbs aimed at the player's position.
      drone.fireCooldown -= dt;
      if (drone.fireCooldown <= 0 && distance < DRONE_FIRE_RANGE) {
        const cooldownJitter = lcgUnit(drone.seedState);
        drone.seedState = cooldownJitter.state;
        drone.fireCooldown = DRONE_FIRE_COOLDOWN + cooldownJitter.value * 0.9;
        events.push({
          type: "orb-fired",
          from: [...drone.position] as Vec3,
          toward: [...playerPosition] as Vec3
        });
      }

      this.combat.setActor(drone.id, {
        position: [drone.position[0], drone.position[1], drone.position[2]],
        facing: 1
      });
    }
    this.combat.setActor(this.playerActorId, {
      position: [playerPosition[0], playerPosition[1], playerPosition[2]],
      facing: 1
    });

    this.combat.update(dt);
    for (const event of this.combat.consumeEvents()) {
      this.combatEventCountValue += 1;
      const targetId = event.targetId;
      if (event.type === "hit" && targetId && targetId !== this.playerActorId) {
        const damage = event.damage ?? CANNON_DAMAGE;
        const drone = this.drones.get(targetId);
        if (drone) drone.health = Math.max(0, drone.health - damage);
        events.push({ type: "cannon-hit", targetId, damage });
      }
      if (event.type === "knockout" && targetId && targetId !== this.playerActorId) {
        // combatWorld locks the round on a knockout (1v1 fighting semantic);
        // rebuild the world with the survivors' current health so waves keep
        // resolving. Public API only: reset(nextActors) + setActor.
        const drone = this.drones.get(targetId);
        if (drone) {
          drone.alive = false;
          drone.health = 0;
          this.downCountValue += 1;
          events.push({ type: "drone-down", id: drone.id });
        }
        this.rebuildAfterKnockout();
      }
    }
    return events;
  }

  private rebuildAfterKnockout(): void {
    const survivors: Parameters<GameCombatWorld["addActor"]>[0][] = [];
    for (const drone of this.drones.values()) {
      if (drone.alive) {
        survivors.push({
          id: drone.id,
          team: "drone",
          position: [drone.position[0], drone.position[1], drone.position[2]],
          facing: 1,
          health: drone.health,
          guard: 0,
          hurtboxes: [{ id: "body", offset: [0, 0, 0], size: [1.5, 1.5, 1.5] }],
          guarding: false
        });
      }
    }
    this.combat.reset(survivors);
    // reset() replaces the actor list; the player actor must come back too.
    this.resetCombatPlayer({ position: [0, 0, 0], facing: 1 });
    // The caller re-syncs real positions next frame via setActor.
  }

  nearestDistance(playerPosition: Vec3): number | null {
    let nearest: number | null = null;
    for (const drone of this.drones.values()) {
      if (!drone.alive) continue;
      const d = Math.hypot(
        drone.position[0] - playerPosition[0],
        drone.position[1] - playerPosition[1],
        drone.position[2] - playerPosition[2]
      );
      if (nearest === null || d < nearest) nearest = d;
    }
    return nearest;
  }

  liveDrones(): readonly DroneRuntime[] {
    return [...this.drones.values()].filter((drone) => drone.alive);
  }

  reset(): void {
    this.drones.clear();
    this.downCountValue = 0;
    this.combatEventCountValue = 0;
    this.combat.reset();
    this.resetCombatPlayer({ position: [0, 0, 0], facing: 1 });
  }

  snapshot(): DroneSwarmSnapshot {
    return {
      liveCount: this.liveCount,
      downCount: this.downCountValue,
      nearestDistance: this.nearestDistance([0, 0, 0]),
      positions: this.liveDrones().map((drone) => ({ id: drone.id, position: drone.position }))
    };
  }
}

/** Convenience factory so main.ts and the unit tests share one wiring. */
export function createDroneSwarm(playerActorId = "player"): { swarm: DroneSwarm; combat: GameCombatWorld } {
  const combat = game.combatWorld({
    stageBounds: { minX: -70, maxX: 70, minY: -10, maxY: 90, minZ: -70, maxZ: 70 }
  });
  return { swarm: new DroneSwarm(playerActorId, combat), combat };
}
