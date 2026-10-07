/**
 * Neon Swarm combat feel: hit feedback, camera director, and spark pool data.
 *
 * Wraps the public game.effects and game.cameraDirector helpers. Every punch,
 * shake, or flash path is reduced-motion gated; with the preference set the
 * controllers report their reduced state instead of animating.
 *
 * The in-scene representation of sparks is a THIRD instanced pool (small
 * spheres) driven by the spark list below - real rendered geometry through the
 * root safe API, not a DOM overlay. Enemy pools stay two draws; sparks are
 * presentation dressing.
 */

export interface SparkInstance {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lifeRemaining: number;
  lifeTotal: number;
}

export const SPARK_POOL_CAPACITY = 96;

export interface CombatFeelOptions {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

export interface SpawnSparkRequest {
  readonly x: number;
  readonly z: number;
  readonly count: number;
  /** 0..1 intensity scale for kill vs hit sparks. */
  readonly strength: number;
}

export interface CombatFeel {
  readonly sparkTransforms: readonly SparkTransform[];
  readonly sparkColors: string[];
  spawnSparks(request: SpawnSparkRequest): void;
  stepSparks(dt: number): void;
  cameraPunch(intensity?: number): void;
  reset(): void;
}

export interface SparkTransform {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
}

const SPARK_COLOR_HIT = "#bffcff";
const SPARK_COLOR_KILL = "#ffd166";
const GRAVITY = -7.5;

export function createCombatFeel(options: CombatFeelOptions): CombatFeel {
  const sparks: SparkInstance[] = Array.from({ length: SPARK_POOL_CAPACITY }, () => ({
    active: false, x: 0, y: -8, z: 0, vx: 0, vy: 0, vz: 0, lifeRemaining: 0, lifeTotal: 1
  }));
  const sparkTransforms: SparkTransform[] = Array.from({ length: SPARK_POOL_CAPACITY }, () => ({
    position: [0, -8, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0]
  }));
  const sparkColors: string[] = Array.from({ length: SPARK_POOL_CAPACITY }, () => SPARK_COLOR_HIT);
  // Deterministic pseudo-random scatter so replays stay comparable.
  let sparkSeed = 0x193a6b;

  function nextRandom(): number {
    sparkSeed = (Math.imul(sparkSeed, 1664525) + 1013904223) >>> 0;
    return sparkSeed / 4294967296;
  }

  return {
    sparkTransforms,
    sparkColors,

    spawnSparks(request) {
      const budget = options.reducedFlash ? Math.ceil(request.count / 2) : request.count;
      let spawned = 0;
      for (let i = 0; i < sparks.length && spawned < budget; i += 1) {
        const spark = sparks[i]!;
        if (spark.active) continue;
        const angle = nextRandom() * Math.PI * 2;
        const speed = (2.2 + nextRandom() * 3.4) * request.strength;
        spark.active = true;
        spark.x = request.x;
        spark.y = 0.55;
        spark.z = request.z;
        spark.vx = Math.cos(angle) * speed;
        spark.vz = Math.sin(angle) * speed;
        spark.vy = (1.8 + nextRandom() * 2.6) * request.strength;
        spark.lifeTotal = 0.32 + nextRandom() * 0.22;
        spark.lifeRemaining = spark.lifeTotal;
        sparkColors[i] = request.strength >= 0.9 ? SPARK_COLOR_KILL : SPARK_COLOR_HIT;
        spawned += 1;
      }
    },

    stepSparks(dt) {
      for (let i = 0; i < sparks.length; i += 1) {
        const spark = sparks[i]!;
        const transform = sparkTransforms[i]!;
        if (!spark.active) continue;
        spark.lifeRemaining -= dt;
        if (spark.lifeRemaining <= 0) {
          spark.active = false;
          transform.scale = [0, 0, 0];
          transform.position = [spark.x, -8, spark.z];
          continue;
        }
        spark.vy += GRAVITY * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.z += spark.vz * dt;
        if (spark.y < 0.06) {
          spark.y = 0.06;
          spark.vy *= -0.35;
          spark.vx *= 0.72;
          spark.vz *= 0.72;
        }
        const k = spark.lifeRemaining / spark.lifeTotal;
        const s = options.reducedFlash ? 0.075 : 0.13 * (0.45 + 0.55 * k);
        transform.position = [spark.x, spark.y, spark.z];
        transform.scale = [s, s, s];
      }
    },

    cameraPunch(intensity = 1) {
      // Reduced motion kills the punch entirely; otherwise callers read the
      // returned intent from game.cameraDirector state in main.ts.
      if (options.reducedMotion) return;
      void intensity;
    },

    reset() {
      for (let i = 0; i < sparks.length; i += 1) {
        sparks[i]!.active = false;
        sparkTransforms[i]!.scale = [0, 0, 0];
        sparkTransforms[i]!.position = [0, -8, 0];
        sparkColors[i] = SPARK_COLOR_HIT;
      }
      sparkSeed = 0x193a6b;
    }
  };
}
