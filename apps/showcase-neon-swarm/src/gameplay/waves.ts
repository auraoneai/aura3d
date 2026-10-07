/**
 * Neon Swarm seeded wave tables.
 *
 * Pure module: a mulberry32 PRNG drives every spawn decision (edge, slide
 * parameter, archetype) so the same seed replays an identical wave. The unit
 * suite pins exact schedules; the browser spec uses the default seed.
 *
 * The redesign is a finite five-stage run. Counts deliberately escalate to a
 * real 320-drone finale so the 300+ claim is true in ordinary play rather than
 * existing only behind a test hook. Every wave still uses a seeded schedule.
 */

export type DroneArchetype = "grunt" | "elite";

export interface SpawnEvent {
  /** Seconds after the wave started when this drone enters the arena. */
  readonly atSeconds: number;
  readonly edge: "north" | "south" | "east" | "west";
  /** Slide along the edge in [0, 1]; derived from the seeded RNG. */
  readonly t: number;
  readonly archetype: DroneArchetype;
  /** Sequential id inside the wave, stable for evidence checksums. */
  readonly index: number;
}

export interface WaveSpec {
  readonly wave: number;
  readonly droneCount: number;
  readonly eliteCount: number;
  readonly gruntCount: number;
  readonly spawnWindowSeconds: number;
  /** Speed multiplier applied to every drone this wave (4% compounding). */
  readonly speedMultiplier: number;
  readonly intermissionSeconds: number;
}

/** Intermission length between waves (pickup doors window). */
export const INTERMISSION_SECONDS = 10;

/** Elite drones are introduced in wave two and become the wave-four focus. */
export function isEliteWave(wave: number): boolean {
  return wave >= 2;
}

const CAMPAIGN_WAVES = [
  { droneCount: 36, eliteCount: 0, spawnWindowSeconds: 8, speedMultiplier: 1 },
  { droneCount: 84, eliteCount: 8, spawnWindowSeconds: 10, speedMultiplier: 1.05 },
  { droneCount: 168, eliteCount: 18, spawnWindowSeconds: 13, speedMultiplier: 1.1 },
  { droneCount: 248, eliteCount: 40, spawnWindowSeconds: 16, speedMultiplier: 1.16 },
  { droneCount: 320, eliteCount: 48, spawnWindowSeconds: 20, speedMultiplier: 1.22 }
] as const;

/** Deterministic spec for one of the five authored campaign waves. */
export function waveSpec(wave: number): WaveSpec {
  const boundedWave = Math.max(1, Math.min(CAMPAIGN_WAVES.length, Math.floor(wave)));
  const authored = CAMPAIGN_WAVES[boundedWave - 1]!;
  return {
    wave: boundedWave,
    droneCount: authored.droneCount,
    eliteCount: authored.eliteCount,
    gruntCount: authored.droneCount - authored.eliteCount,
    spawnWindowSeconds: authored.spawnWindowSeconds,
    speedMultiplier: authored.speedMultiplier,
    intermissionSeconds: INTERMISSION_SECONDS
  };
}

/**
 * Mulberry32 - tiny deterministic PRNG. Same seed => identical sequence on
 * every platform (pure 32-bit integer math, no Math.random anywhere).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EDGES: readonly ("north" | "south" | "east" | "west")[] = ["north", "south", "east", "west"];

/**
 * Full deterministic spawn schedule for one wave. Spawns are spread evenly
 * across the spawn window; the RNG only picks the edge and the slide position,
 * so pacing is stable while layouts vary per seed.
 */
export function waveSpawnSchedule(spec: WaveSpec, seed: number): readonly SpawnEvent[] {
  const random = createSeededRandom(seed ^ (spec.wave * 0x85ebca6b));
  const events: SpawnEvent[] = [];
  let eliteRemaining = spec.eliteCount;
  for (let index = 0; index < spec.droneCount; index += 1) {
    const atSeconds = spec.spawnWindowSeconds * (index / Math.max(1, spec.droneCount));
    // Elites arrive in the back half of the wave so the escalation reads.
    const forceElite = eliteRemaining > 0 && index >= spec.droneCount - spec.eliteCount;
    const randomElite = eliteRemaining > 0 && random() < 0.18;
    const archetype: DroneArchetype = forceElite || randomElite ? "elite" : "grunt";
    if (archetype === "elite") eliteRemaining -= 1;
    const edge = EDGES[Math.floor(random() * EDGES.length)] ?? "north";
    const t = random();
    events.push({ atSeconds, edge, t, archetype, index });
  }
  // Any elites the RNG skipped land at the end of the schedule.
  let tail = events.length;
  while (eliteRemaining > 0 && tail > 0) {
    tail -= 1;
    const event = events[tail];
    if (event && event.archetype === "grunt") {
      events[tail] = { ...event, archetype: "elite" };
      eliteRemaining -= 1;
    }
  }
  return events;
}

/** Stable per-run checksum input for evidence (FNV-1a over the schedule). */
export function scheduleChecksum(events: readonly SpawnEvent[]): number {
  let hash = 0x811c9dc5;
  for (const event of events) {
    const token = [event.index, event.atSeconds.toFixed(2), event.edge, event.t.toFixed(4), event.archetype].join("|");
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return hash >>> 0;
}
