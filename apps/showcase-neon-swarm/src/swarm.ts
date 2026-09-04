/**
 * Neon Swarm instanced drone pools.
 *
 * The headline system: hundreds of simultaneous enemies simulated in plain
 * typed arrays (no per-drone scene nodes) and rendered through TWO root-safe
 * instances.custom pools (thorn-moth grunt + crown-hunter elite), so the whole swarm
 * costs two native instanced draw submissions.
 *
 * Pure module: no DOM, no engine import. Transform objects are allocated once
 * and mutated IN PLACE every frame; main.ts hands the same array references to
 * instances.capsule / instances.box, and the production runtime rebuilds
 * instance matrices from those live objects on every rendered frame. That is
 * the documented dynamic update path for root-safe instancing.
 */
import { NEON_ARENA_BOUNDS, playRect, type ArenaObstacle } from "./arena";

export type SwarmArchetype = "grunt" | "elite";

export interface PoolTransform {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
}

export interface SpawnRequest {
  readonly x: number;
  readonly z: number;
  readonly archetype: SwarmArchetype;
  /** Wave speed multiplier from the wave table. */
  readonly speedMultiplier: number;
}

interface DroneRecord {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  speed: number;
  yaw: number;
  wobblePhase: number;
  /** Elite burst cycle timers (seconds); zero for grunts. */
  burstCycle: number;
  telegraphRemaining: number;
  burstRemaining: number;
  /** Brief white flash after being hit (seconds remaining). */
  flashRemaining: number;
  /** Deterministic base hue used when the drone is not flashing or telegraphing. */
  baseColor: string;
}

export interface SwarmStepEvents {
  onDroneKilled?: (drone: Readonly<DroneView>) => void;
  onDroneEscapedPlayerHit?: (drone: Readonly<DroneView>, damage: number) => void;
}

export interface DroneView {
  readonly archetype: SwarmArchetype;
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly slot: number;
}

export interface PulseFireResult {
  readonly hits: number;
  readonly kills: number;
}

export const GRUNT_POOL_CAPACITY = 360;
export const ELITE_POOL_CAPACITY = 96;

const GRUNT_HP = 2;
const ELITE_HP = 6;
const GRUNT_BASE_SPEED = 2.35;
const ELITE_BASE_SPEED = 1.45;
const ELITE_TELEGRAPH_SECONDS = 0.5;
const ELITE_BURST_CYCLE = 5.5;
const ELITE_BURST_SECONDS = 1.15;
const SEPARATION_CELL = 2.6;
/** Contact damage applied per second while a drone touches the courier. */
export const DRONE_CONTACT_DAMAGE_PER_SECOND = 14;

export interface SwarmSimulation {
  readonly gruntTransforms: readonly PoolTransform[];
  readonly eliteTransforms: readonly PoolTransform[];
  readonly gruntColors: string[];
  readonly eliteColors: string[];
  aliveGruntCount(): number;
  aliveEliteCount(): number;
  aliveCount(): number;
  spawn(request: SpawnRequest): boolean;
  step(
    dt: number,
    player: { readonly x: number; readonly z: number },
    obstacles: readonly ArenaObstacle[],
    events?: SwarmStepEvents,
    /** Authored campaign pressure: inset applied to all four arena sides. */
    arenaInset?: number
  ): void;
  /** Overlap-query pulse fire around the player along the aim direction. */
  firePulse(
    origin: { readonly x: number; readonly z: number },
    aimX: number,
    aimZ: number,
    damage: number,
    events?: SwarmStepEvents
  ): PulseFireResult;
  radialBurst(
    origin: { readonly x: number; readonly z: number },
    radius: number,
    damage: number,
    events?: SwarmStepEvents
  ): PulseFireResult;
  countWithin(origin: { readonly x: number; readonly z: number }, minRadius: number, maxRadius: number): number;
  forEachAlive(fn: (drone: Readonly<DroneView>) => void): void;
  /** Elite timer probe for tests/evidence: one row per ACTIVE elite. */
  eliteTimerProbe(): readonly { readonly slot: number; readonly telegraphing: boolean; readonly bursting: boolean }[];
  contactOverlap(player: { readonly x: number; readonly z: number; readonly radius: number }): boolean;
  reset(): void;
}

/**
 * Presentation-only options for the instanced renderer bridge. These values
 * never enter the seeded simulation or terminal outcome hash; they only let a
 * review capture give low-cost grunt silhouettes enough screen area to read
 * between the larger typed elite presentations.
 */
export interface SwarmVisualOptions {
  readonly reviewCapture?: boolean;
}

function makeTransforms(count: number): PoolTransform[] {
  return Array.from({ length: count }, () => ({
    position: [0, -8, 0] as readonly [number, number, number],
    rotation: [0, 0, 0] as readonly [number, number, number],
    scale: [0, 0, 0] as readonly [number, number, number]
  }));
}

/**
 * Spatial hash grid over the XZ plane for O(n) neighbor separation. Buckets
 * are flat number arrays reused across frames to avoid allocation churn.
 */
class SeparationGrid {
  private readonly cells = new Map<number, number[]>();

  clear(): void {
    this.cells.clear();
  }

  insert(index: number, x: number, z: number): void {
    const key = cellKey(x, z);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  neighbors(x: number, z: number, out: number[]): number {
    out.length = 0;
    const cx = Math.floor(x / SEPARATION_CELL);
    const cz = Math.floor(z / SEPARATION_CELL);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = this.cells.get(hashCell(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const index of bucket) out.push(index);
      }
    }
    return out.length;
  }
}

function cellKey(x: number, z: number): number {
  return hashCell(Math.floor(x / SEPARATION_CELL), Math.floor(z / SEPARATION_CELL));
}

function hashCell(cx: number, cz: number): number {
  return ((cx * 0x8da6b343) ^ (cz * 0xd8163841)) >>> 0;
}

// The finale uses 320 live instances. Keep their palette jewel-like but
// slightly desaturated so the courier and hit feedback remain the focal point
// instead of collapsing into one wall of hot pink emissive pixels. The cyan,
// sea-glass, violet, and coral accents still preserve the route's neon identity
// while giving individual threats enough value separation to read in a dense
// top-down frame.
const GRUNT_COLOR_BASE = "#3f7468";
const GRUNT_COLOR_PALETTE = ["#38c7b1", "#59e2c5", "#2e9d91", "#86f4d8"] as const;
const GRUNT_COLOR_FLASH = "#fff0dc";
const ELITE_COLOR_BASE = "#f2d8c2";
const ELITE_COLOR_PALETTE = ["#ff2e63", "#ff5c8a", "#c81d5e", "#ff8b3d"] as const;
const ELITE_COLOR_FLASH = "#ffe8fb";
const ELITE_COLOR_TELEGRAPH = "#ffc857";
const HIDDEN_SCALE = 0;

export function createSwarmSimulation(options: SwarmVisualOptions = {}): SwarmSimulation {
  const gruntCapacity = GRUNT_POOL_CAPACITY;
  const eliteCapacity = ELITE_POOL_CAPACITY;
  const grunts: DroneRecord[] = Array.from({ length: gruntCapacity }, () => blankDrone());
  const elites: DroneRecord[] = Array.from({ length: eliteCapacity }, () => blankDrone());
  const gruntTransforms = makeTransforms(gruntCapacity);
  const eliteTransforms = makeTransforms(eliteCapacity);
  const gruntColors: string[] = Array.from({ length: gruntCapacity }, () => GRUNT_COLOR_BASE);
  const eliteColors: string[] = Array.from({ length: eliteCapacity }, () => ELITE_COLOR_BASE);
  const grid = new SeparationGrid();
  const neighborScratch: number[] = [];

  function blankDrone(): DroneRecord {
    return {
      active: false, x: 0, z: 0, vx: 0, vz: 0, hp: 0, maxHp: 0, speed: 0,
      yaw: 0, wobblePhase: 0, burstCycle: 0, telegraphRemaining: 0, burstRemaining: 0, flashRemaining: 0,
      baseColor: GRUNT_COLOR_BASE
    };
  }

  function countAlive(pool: readonly DroneRecord[]): number {
    let total = 0;
    for (const drone of pool) if (drone.active) total += 1;
    return total;
  }

  function firstFreeSlot(pool: readonly DroneRecord[]): number {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i]!.active) return i;
    return -1;
  }

  function viewOf(pool: readonly DroneRecord[], slot: number): DroneView {
    const drone = pool[slot]!;
    return {
      archetype: pool === grunts ? "grunt" : "elite",
      x: drone.x, z: drone.z, hp: drone.hp, maxHp: drone.maxHp, slot
    };
  }

  function spawn(request: SpawnRequest): boolean {
    const elite = request.archetype === "elite";
    const pool = elite ? elites : grunts;
    const transforms = elite ? eliteTransforms : gruntTransforms;
    const slot = firstFreeSlot(pool);
    if (slot < 0) return false;
    const drone = pool[slot]!;
    drone.active = true;
    drone.x = request.x;
    drone.z = request.z;
    drone.vx = 0;
    drone.vz = 0;
    drone.maxHp = elite ? ELITE_HP : GRUNT_HP;
    drone.hp = drone.maxHp;
    drone.speed = (elite ? ELITE_BASE_SPEED : GRUNT_BASE_SPEED) * request.speedMultiplier;
    drone.yaw = 0;
    drone.wobblePhase = (request.x * 12.9898 + request.z * 78.233) % (Math.PI * 2);
    // Palette assignment is deterministic by pool slot, so dense waves gain separation
    // without changing simulation state, spawn order, or the outcome hash.
    drone.baseColor = elite
      ? ELITE_COLOR_PALETTE[slot % ELITE_COLOR_PALETTE.length]!
      : GRUNT_COLOR_PALETTE[slot % GRUNT_COLOR_PALETTE.length]!;
    (elite ? eliteColors : gruntColors)[slot] = drone.baseColor;
    drone.burstCycle = elite ? ELITE_BURST_CYCLE * 0.55 : 0;
    drone.telegraphRemaining = 0;
    drone.burstRemaining = 0;
    drone.flashRemaining = 0;
    const transform = transforms[slot]!;
    transform.position = [request.x, 0, request.z];
    transform.scale = [1, 1, 1];
    return true;
  }

  function killDrone(pool: DroneRecord[], transforms: PoolTransform[], slot: number, events: SwarmStepEvents | undefined): void {
    const drone = pool[slot]!;
    drone.active = false;
    const transform = transforms[slot]!;
    transform.scale = [HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE];
    transform.position = [drone.x, -8, drone.z];
    events?.onDroneKilled?.(viewOf(pool, slot));
  }

  function steer(
    pool: readonly DroneRecord[],
    dt: number,
    player: { readonly x: number; readonly z: number },
    obstacles: readonly ArenaObstacle[],
    arenaInset: number
  ): void {
    const baseRect = playRect(NEON_ARENA_BOUNDS);
    const inset = Math.max(0, Math.min(7, arenaInset));
    const rect = {
      minX: baseRect.minX + inset,
      maxX: baseRect.maxX - inset,
      minZ: baseRect.minZ + inset,
      maxZ: baseRect.maxZ - inset
    };
    // Build separation buckets from BOTH pools so mixed clusters still spread.
    grid.clear();
    let globalIndex = 0;
    for (const drone of grunts) {
      if (drone.active) grid.insert(globalIndex, drone.x, drone.z);
      globalIndex += 1;
    }
    for (const drone of elites) {
      if (drone.active) grid.insert(globalIndex, drone.x, drone.z);
      globalIndex += 1;
    }

    const isGruntPool = pool === grunts;
    for (let poolIndex = 0; poolIndex < pool.length; poolIndex += 1) {
      const drone = pool[poolIndex]!;
      if (!drone.active) continue;
      const selfIndex = isGruntPool ? poolIndex : gruntCapacity + poolIndex;

      let ax = 0;
      let az = 0;
      // Authored roles share the same pool without becoming one-node-per-drone:
      // most grunts seek, every third grunt orbits, recently hit drones flee,
      // and elites orbit while telegraphing before their distinct seek burst.
      const toPlayerX = player.x - drone.x;
      const toPlayerZ = player.z - drone.z;
      const playerDist = Math.hypot(toPlayerX, toPlayerZ) || 1;
      const seekX = toPlayerX / playerDist;
      const seekZ = toPlayerZ / playerDist;
      const hitFlee = drone.flashRemaining > 0;
      const orbiting = !hitFlee && ((isGruntPool && poolIndex % 3 === 0) || (!isGruntPool && drone.burstRemaining <= 0));
      if (hitFlee) {
        ax -= seekX * 3.8;
        az -= seekZ * 3.8;
      } else if (orbiting) {
        const orbitSign = poolIndex % 2 === 0 ? 1 : -1;
        ax += seekX * (playerDist > 6 ? 1.4 : playerDist < 3.5 ? -1.1 : 0.25) - seekZ * 1.75 * orbitSign;
        az += seekZ * (playerDist > 6 ? 1.4 : playerDist < 3.5 ? -1.1 : 0.25) + seekX * 1.75 * orbitSign;
      } else {
        ax += seekX * 2.1;
        az += seekZ * 2.1;
      }

      // Separation from nearby drones through the shared grid.
      grid.neighbors(drone.x, drone.z, neighborScratch);
      for (const otherIndex of neighborScratch) {
        if (otherIndex === selfIndex) continue;
        const other = otherIndex < gruntCapacity ? grunts[otherIndex] : elites[otherIndex - gruntCapacity];
        if (!other || !other.active) continue;
        const dx = drone.x - other.x;
        const dz = drone.z - other.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > SEPARATION_CELL * SEPARATION_CELL || distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const push = (SEPARATION_CELL - dist) / SEPARATION_CELL;
        ax += (dx / dist) * push * 3.4;
        az += (dz / dist) * push * 3.4;
      }

      // Slide around barricades and lamps instead of hugging them.
      for (const obstacle of obstacles) {
        const dx = drone.x - obstacle.x;
        const dz = drone.z - obstacle.z;
        const minDist = obstacle.radius + 0.62;
        const distSq = dx * dx + dz * dz;
        if (distSq > minDist * minDist || distSq === 0) continue;
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist) / minDist;
        ax += (dx / dist) * push * 5.2;
        az += (dz / dist) * push * 5.2;
      }

      // Arena bounds steering.
      const margin = 1.2;
      if (drone.x < rect.minX + margin) ax += (rect.minX + margin - drone.x) * 3.4;
      if (drone.x > rect.maxX - margin) ax -= (drone.x - rect.maxX + margin) * 3.4;
      if (drone.z < rect.minZ + margin) az += (rect.minZ + margin - drone.z) * 3.4;
      if (drone.z > rect.maxZ - margin) az -= (drone.z - rect.maxZ + margin) * 3.4;

      drone.vx += ax * dt * 6.4;
      drone.vz += az * dt * 6.4;

      // Clamp to cruise speed (elite burst multiplies it temporarily).
      const burstFactor = drone.burstRemaining > 0 ? 2.25 : 1;
      const maxSpeed = drone.speed * burstFactor;
      const speedSq = drone.vx * drone.vx + drone.vz * drone.vz;
      if (speedSq > maxSpeed * maxSpeed) {
        const s = maxSpeed / Math.sqrt(speedSq);
        drone.vx *= s;
        drone.vz *= s;
      }
      // Mild damping keeps clusters calm after collisions.
      const damp = Math.pow(0.86, dt * 60);
      drone.vx *= damp;
      drone.vz *= damp;

      drone.x += drone.vx * dt;
      drone.z += drone.vz * dt;
      drone.x = Math.min(rect.maxX, Math.max(rect.minX, drone.x));
      drone.z = Math.min(rect.maxZ, Math.max(rect.minZ, drone.z));

      if (Math.abs(drone.vx) + Math.abs(drone.vz) > 0.05) drone.yaw = Math.atan2(drone.vx, drone.vz);
    }
  }

  function updateElites(pool: DroneRecord[], dt: number): void {
    for (const drone of pool) {
      if (!drone.active) continue;
      drone.burstCycle -= dt;
      if (drone.telegraphRemaining > 0) {
        drone.telegraphRemaining -= dt;
        if (drone.telegraphRemaining <= 0) drone.burstRemaining = ELITE_BURST_SECONDS;
      } else if (drone.burstRemaining > 0) {
        drone.burstRemaining -= dt;
        if (drone.burstRemaining <= 0) drone.burstCycle = ELITE_BURST_CYCLE;
      } else if (drone.burstCycle <= 0) {
        drone.telegraphRemaining = ELITE_TELEGRAPH_SECONDS;
      }
    }
  }

  function syncVisuals(pool: DroneRecord[], transforms: PoolTransform[], colors: string[], time: number): void {
    const isElite = pool === elites;
    for (let i = 0; i < pool.length; i += 1) {
      const drone = pool[i]!;
      const transform = transforms[i]!;
      if (!drone.active) continue;
      const bob = Math.sin(time * 3.1 + drone.wobblePhase) * 0.09;
      transform.position = [drone.x, 0.58 + bob, drone.z];
      // Deterministic silhouette variation keeps a dense finale readable as
      // individual threats instead of one repeated pink texture. The pool
      // remains instanced and the simulation/hash are unchanged.
      // Keep the 320-drone finale dense but legible: the instanced silhouettes
      // should frame the courier, not form a solid wall over it.
      // Smaller, varied silhouettes preserve the exact 320-instance fixture
      // while opening negative space around the courier and making the arena
      // dressing visible. Elites remain intentionally larger for threat
      // hierarchy and telegraph readability.
      // The original 0.16 grunt scale read as a field of detached bars in the
      // desktop probe. These silhouettes are still comfortably below the
      // courier's 2.95u body, but now have enough screen area to read as
      // distinct swarm roles instead of placeholder pixels.
      // Review captures use a larger grunt silhouette so the 272 non-elite
      // slots remain individually findable between the 48 typed elite cards.
      // The route's normal play view keeps the original compact scale and all
      // gameplay transforms, pool capacities, and hashes remain unchanged.
      let scale = isElite
        ? 0.52
        : (options.reviewCapture ? 0.42 + (i % 5) * 0.02 : 0.32 + (i % 5) * 0.016);
      if (drone.flashRemaining > 0) scale *= 1.18;
      if (isElite && drone.burstRemaining > 0) scale *= 1.12;
      const profile = i % 6;
      const width = 1.02 + (profile % 3) * 0.08;
      const depth = 0.92 + ((profile + 1) % 3) * 0.06;
      const tall = 0.9 + (profile % 2) * 0.08;
      transform.scale = isElite
        ? [scale * (1.04 + (profile % 3) * 0.08), scale * 0.82, scale * (0.98 + (profile % 2) * 0.1)]
        : [scale * width, scale * tall, scale * depth];
      transform.rotation = [
        isElite ? (profile % 2 === 0 ? 0.08 : -0.08) : (profile - 2) * 0.025,
        drone.yaw,
        isElite ? (profile % 2 === 0 ? 0.08 : -0.08) : (profile % 3 === 0 ? 0.04 : -0.02)
      ];

      let color: string;
      if (drone.flashRemaining > 0) color = isElite ? ELITE_COLOR_FLASH : GRUNT_COLOR_FLASH;
      else if (isElite && drone.telegraphRemaining > 0) color = ELITE_COLOR_TELEGRAPH;
      else color = drone.baseColor;
      if (colors[i] !== color) colors[i] = color;
    }
  }

  function applyDamage(
    pool: DroneRecord[],
    transforms: PoolTransform[],
    slot: number,
    damage: number,
    time: number,
    events: SwarmStepEvents | undefined
  ): boolean {
    const drone = pool[slot]!;
    if (!drone.active) return false;
    drone.hp -= damage;
    drone.flashRemaining = 0.08;
    void time;
    if (drone.hp <= 0) {
      killDrone(pool, transforms, slot, events);
      return true;
    }
    return false;
  }

  return {
    gruntTransforms,
    eliteTransforms,
    gruntColors,
    eliteColors,
    aliveGruntCount: () => countAlive(grunts),
    aliveEliteCount: () => countAlive(elites),
    aliveCount: () => countAlive(grunts) + countAlive(elites),

    spawn,

    step(dt, player, obstacles, events, arenaInset = 0) {
      const time = performance.now() / 1000;
      for (const pool of [grunts, elites]) {
        for (const drone of pool) {
          if (!drone.active) continue;
          if (drone.flashRemaining > 0) drone.flashRemaining = Math.max(0, drone.flashRemaining - dt);
        }
      }
      updateElites(elites, dt);
      steer(grunts, dt, player, obstacles, arenaInset);
      steer(elites, dt, player, obstacles, arenaInset);
      syncVisuals(grunts, gruntTransforms, gruntColors, time);
      syncVisuals(elites, eliteTransforms, eliteColors, time);
      void events;
    },

    firePulse(origin, aimX, aimZ, damage, events) {
      const reach = 3.6;
      const halfAngleCos = Math.cos(0.72); // about +/-41 degrees
      const aimLen = Math.hypot(aimX, aimZ) || 1;
      const nx = aimX / aimLen;
      const nz = aimZ / aimLen;
      let hits = 0;
      let kills = 0;
      const pools: readonly [DroneRecord[], PoolTransform[]][] = [[grunts, gruntTransforms], [elites, eliteTransforms]];
      const time = performance.now() / 1000;
      for (const [pool, transforms] of pools) {
        for (let slot = 0; slot < pool.length; slot += 1) {
          const drone = pool[slot]!;
          if (!drone.active) continue;
          const dx = drone.x - origin.x;
          const dz = drone.z - origin.z;
          const dist = Math.hypot(dx, dz);
          if (dist > reach) continue;
          if (dist > 0.0001) {
            const dot = (dx / dist) * nx + (dz / dist) * nz;
            if (dot < halfAngleCos) continue;
          }
          hits += 1;
          if (applyDamage(pool, transforms, slot, damage, time, events)) kills += 1;
        }
      }
      return { hits, kills };
    },

    radialBurst(origin, radius, damage, events) {
      const radiusSq = Math.max(0, radius) ** 2;
      let hits = 0;
      let kills = 0;
      for (const [pool, transforms] of [[grunts, gruntTransforms], [elites, eliteTransforms]] as const) {
        for (let slot = 0; slot < pool.length; slot += 1) {
          const drone = pool[slot]!;
          if (!drone.active) continue;
          const dx = drone.x - origin.x;
          const dz = drone.z - origin.z;
          if (dx * dx + dz * dz > radiusSq) continue;
          hits += 1;
          if (applyDamage(pool as DroneRecord[], transforms as PoolTransform[], slot, damage, performance.now() / 1000, events)) {
            kills += 1;
          }
        }
      }
      return { hits, kills };
    },

    countWithin(origin, minRadius, maxRadius) {
      const minSq = Math.max(0, minRadius) ** 2;
      const maxSq = Math.max(minRadius, maxRadius) ** 2;
      let count = 0;
      for (const pool of [grunts, elites]) for (const drone of pool) {
        if (!drone.active) continue;
        const dx = drone.x - origin.x;
        const dz = drone.z - origin.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= minSq && distanceSq <= maxSq) count += 1;
      }
      return count;
    },

    forEachAlive(fn) {
      for (let slot = 0; slot < grunts.length; slot += 1) {
        if (grunts[slot]!.active) fn(viewOf(grunts, slot));
      }
      for (let slot = 0; slot < elites.length; slot += 1) {
        if (elites[slot]!.active) fn(viewOf(elites, slot));
      }
    },

    eliteTimerProbe() {
      const rows: { slot: number; telegraphing: boolean; bursting: boolean }[] = [];
      for (let slot = 0; slot < elites.length; slot += 1) {
        const drone = elites[slot]!;
        if (!drone.active) continue;
        rows.push({ slot, telegraphing: drone.telegraphRemaining > 0, bursting: drone.burstRemaining > 0 });
      }
      return rows;
    },

    contactOverlap(player) {
      const touchRadius = player.radius + 0.42;
      for (const pool of [grunts, elites]) {
        for (const drone of pool) {
          if (!drone.active) continue;
          const dx = drone.x - player.x;
          const dz = drone.z - player.z;
          if (dx * dx + dz * dz <= touchRadius * touchRadius) return true;
        }
      }
      return false;
    },

    reset() {
      for (const pool of [grunts, elites]) for (const drone of pool) {
        drone.active = false;
        drone.hp = 0;
        drone.flashRemaining = 0;
        drone.telegraphRemaining = 0;
        drone.burstRemaining = 0;
      }
      for (const transforms of [gruntTransforms, eliteTransforms]) {
        for (const transform of transforms) {
          transform.position = [0, -8, 0];
          transform.rotation = [0, 0, 0];
          transform.scale = [HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE];
        }
      }
      gruntColors.fill(GRUNT_COLOR_BASE);
      eliteColors.fill(ELITE_COLOR_BASE);
    }
  };
}
