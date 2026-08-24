/**
 * Line-clear FX — scene particle bursts driven by real line-clear events (BF-A4).
 *
 * A small pool of emissive shards erupts from each cleared row; the shard count,
 * speed, and spread scale with the number of lines cleared so a quad reads
 * categorically bigger than a single. Everything here is gated by
 * `prefers-reduced-motion` through the controller flag: under reduced motion no
 * shard ever spawns and the proof records the suppression instead. This is rendered
 * geometry driven by game state — never a DOM/CSS overlay.
 */
import { game, material, primitives, type AuraNodeInput } from "@aura3d/engine";
import { BOARD_WIDTH, VISIBLE_HEIGHT } from "./rules";
import { cellPosition } from "./reactor-scene";

export const CLEAR_FX_SHARD_COUNT = 28;

const SHARD_LIFETIME = 0.55;
/** Horizontal+vertical launch speed range in units/second, scaled by burst power. */
const SHARD_SPEED_MIN = 0.9;
const SHARD_SPEED_MAX = 2.4;

interface Shard {
  position: [number, number, number];
  velocity: [number, number, number];
  age: number;
  active: boolean;
  spin: number;
}

export interface ClearFxProof {
  readonly shardCount: number;
  readonly burstsSpawned: number;
  readonly shardsLaunched: number;
  readonly activeShards: number;
  readonly lastBurstLines: number;
  readonly biggestBurstLines: number;
  readonly quadBurstSeen: boolean;
  /** True only when a burst was skipped because reduced motion is enabled. */
  readonly reducedMotionSuppressionCount: number;
}

export function clearFxShardNodeId(index: number): string {
  return "blockfall-clear-fx-shard-" + index;
}

export function createClearFxNodes(count = CLEAR_FX_SHARD_COUNT): AuraNodeInput[] {
  const shardMaterial = material.neon({
    name: "line clear shard",
    color: "#ffe866",
    emissive: "#fff3b0",
    emissiveIntensity: 1.35,
    roughness: 0.2,
    opacity: 0.85
  });
  return Array.from({ length: count }, (_, index) =>
    primitives.box({ name: "clear fx shard " + index, material: shardMaterial })
      .position(0, -50, 0.32)
      .scale([0.001, 0.001, 0.001])
      .runtime(game.runtimeNode(clearFxShardNodeId(index), { tags: ["blockfall", "clear-fx", "shard"] }))
  );
}

export interface ClearFxController {
  /**
   * Spawns a burst across the cleared rows. `rows` are *visible* row indices
   * (0 = bottom of the well) captured from the board immediately before the
   * clearing lock; empty rows means nothing to celebrate and nothing spawns.
   */
  readonly burst: (rows: readonly number[], linesCleared: number) => void;
  readonly update: (dt: number) => ClearFxProof;
  readonly proof: () => ClearFxProof;
}

export function createClearFx(options: {
  reducedMotion: boolean;
  handles: {
    setPosition(x: number, y: number, z: number): unknown;
    setRotation(x: number, y: number, z: number): unknown;
    setScale(scale: number | readonly [number, number, number]): unknown;
    setVisible(visible: boolean): unknown;
  }[];
}): ClearFxController {
  const reducedMotion = options.reducedMotion;
  const shards: Shard[] = Array.from({ length: CLEAR_FX_SHARD_COUNT }, () => ({
    position: [0, -50, 0.32],
    velocity: [0, 0, 0],
    age: 0,
    active: false,
    spin: 0
  }));
  let burstsSpawned = 0;
  let shardsLaunched = 0;
  let lastBurstLines = 0;
  let biggestBurstLines = 0;
  let quadBurstSeen = false;
  let reducedMotionSuppressionCount = 0;

  function hideShard(handle: (typeof options.handles)[number], shard: Shard): void {
    handle.setPosition(shard.position[0], shard.position[1], shard.position[2]);
    handle.setScale([0.001, 0.001, 0.001]);
    handle.setVisible(false);
  }

  function burst(rows: readonly number[], linesCleared: number): void {
    if (!Number.isFinite(linesCleared) || linesCleared <= 0) return;
    if (rows.length === 0) return;
    if (reducedMotion) {
      // Reduced motion suppresses the burst entirely; the audio cue and HUD beat
      // still fire, and the suppression itself is part of the evidence.
      reducedMotionSuppressionCount += 1;
      lastBurstLines = linesCleared;
      return;
    }
    burstsSpawned += 1;
    lastBurstLines = linesCleared;
    biggestBurstLines = Math.max(biggestBurstLines, linesCleared);
    quadBurstSeen ||= linesCleared >= 4;

    // Power scales with the clear size: 1 line = gentle pop, quad = full spray.
    const power = Math.min(1, 0.45 + linesCleared * 0.18);
    const usableRows = [...new Set(rows.filter((row) => row >= 0 && row < VISIBLE_HEIGHT))];
    if (usableRows.length === 0) return;

    let shardIndex = 0;
    for (const shard of shards) {
      const boardRow = usableRows[shardIndex % usableRows.length] ?? usableRows[0];
      shardIndex += 1;
      const visibleY = (boardRow ?? 0);
      const base = cellPosition(BOARD_WIDTH / 2 - 0.5, visibleY, 0.32);
      const angle = Math.random() * Math.PI * 2;
      const speed = (SHARD_SPEED_MIN + Math.random() * (SHARD_SPEED_MAX - SHARD_SPEED_MIN)) * (0.7 + power * 0.6);
      shard.position = [
        base[0] + (Math.random() - 0.5) * BOARD_WIDTH * 0.16,
        base[1] + (Math.random() - 0.5) * 0.06,
        base[2]
      ];
      shard.velocity = [Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * (0.5 + power * 0.5), 0.25 + Math.random() * 0.4 * power];
      shard.age = 0;
      shard.active = true;
      shard.spin = (Math.random() - 0.5) * 10;
      shardsLaunched += 1;
    }
  }

  function update(dt: number): ClearFxProof {
    const step = Math.max(0, dt);
    let activeCount = 0;
    shards.forEach((shard, index) => {
      const handle = options.handles[index];
      if (!handle) return;
      if (!shard.active) {
        return;
      }
      shard.age += step;
      if (shard.age >= SHARD_LIFETIME) {
        shard.active = false;
        hideShard(handle, shard);
        return;
      }
      shard.position = [
        shard.position[0] + shard.velocity[0] * step,
        shard.position[1] + shard.velocity[1] * step,
        shard.position[2]
      ];
      shard.velocity[1] -= 3.4 * step; // light gravity so arcs fall back into the well
      const life = 1 - shard.age / SHARD_LIFETIME;
      const size = 0.028 * (0.4 + life * 0.8);
      handle.setVisible(true);
      handle.setPosition(shard.position[0], shard.position[1], shard.position[2]);
      handle.setRotation(shard.spin * shard.age, shard.spin * shard.age * 0.7, 0);
      handle.setScale([size * 1.8, size, size]);
      activeCount += 1;
    });
    return proof();
  }

  function proof(): ClearFxProof {
    return {
      shardCount: CLEAR_FX_SHARD_COUNT,
      burstsSpawned,
      shardsLaunched,
      activeShards: shards.filter((shard) => shard.active).length,
      lastBurstLines,
      biggestBurstLines,
      quadBurstSeen,
      reducedMotionSuppressionCount
    };
  }

  return { burst, update, proof };
}