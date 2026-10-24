// Pure, deterministic coin-dash simulation (no rendering, no DOM).

export type Status = "playing" | "paused" | "won" | "lost";

export const FIXED_DT = 1 / 60;
export const ROUND_SECONDS = 30;
export const ROUND_TICKS = ROUND_SECONDS * 60;
export const WIN_SCORE = 15;
export const COIN_COUNT = 10;
export const ARENA_HALF_X = 9;
export const ARENA_HALF_Z = 5;
export const PLAYER_RADIUS = 0.5;
export const COIN_RADIUS = 0.45;
export const PLAYER_SPEED = 7;
const SEED = 20240607;

export interface Vec2 {
  x: number;
  z: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CoinDashSim {
  readonly input: InputState = { left: false, right: false, up: false, down: false };
  readonly player: Vec2 = { x: 0, z: 0 };
  readonly coins: Vec2[] = [];
  score = 0;
  ticks = 0;
  paused = false;
  private outcome: "playing" | "won" | "lost" = "playing";
  private rng: () => number = mulberry32(SEED);

  constructor() {
    this.reset();
  }

  get status(): Status {
    if (this.outcome !== "playing") return this.outcome;
    return this.paused ? "paused" : "playing";
  }

  /** Elapsed simulated seconds. */
  get time(): number {
    return this.ticks * FIXED_DT;
  }

  get remaining(): number {
    return Math.max(0, ROUND_SECONDS - this.time);
  }

  reset(): void {
    this.rng = mulberry32(SEED);
    this.score = 0;
    this.ticks = 0;
    this.paused = false;
    this.outcome = "playing";
    this.player.x = 0;
    this.player.z = 0;
    this.coins.length = 0;
    for (let i = 0; i < COIN_COUNT; i++) this.coins.push(this.randomCoinPosition(i));
  }

  togglePause(): void {
    if (this.outcome !== "playing") return;
    this.paused = !this.paused;
  }

  /** Advance one fixed step. Does nothing while paused or after the round ended. */
  step(): void {
    if (this.outcome !== "playing" || this.paused) return;
    this.ticks++;

    let dx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    let dz = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
    if (dx !== 0 && dz !== 0) {
      dx *= Math.SQRT1_2;
      dz *= Math.SQRT1_2;
    }
    const maxX = ARENA_HALF_X - PLAYER_RADIUS;
    const maxZ = ARENA_HALF_Z - PLAYER_RADIUS;
    this.player.x = Math.min(maxX, Math.max(-maxX, this.player.x + dx * PLAYER_SPEED * FIXED_DT));
    this.player.z = Math.min(maxZ, Math.max(-maxZ, this.player.z + dz * PLAYER_SPEED * FIXED_DT));

    const reach = PLAYER_RADIUS + COIN_RADIUS;
    for (let i = 0; i < this.coins.length; i++) {
      const coin = this.coins[i];
      if (!coin) continue;
      const ddx = coin.x - this.player.x;
      const ddz = coin.z - this.player.z;
      if (ddx * ddx + ddz * ddz <= reach * reach) {
        this.score++;
        this.coins[i] = this.randomCoinPosition(i);
        if (this.score >= WIN_SCORE) {
          this.outcome = "won";
          return;
        }
      }
    }

    if (this.ticks >= ROUND_TICKS) this.outcome = "lost";
  }

  private randomCoinPosition(skipIndex: number): Vec2 {
    const marginX = ARENA_HALF_X - 1;
    const marginZ = ARENA_HALF_Z - 1;
    let candidate: Vec2 = { x: 0, z: 0 };
    for (let attempt = 0; attempt < 60; attempt++) {
      candidate = {
        x: (this.rng() * 2 - 1) * marginX,
        z: (this.rng() * 2 - 1) * marginZ
      };
      const farFromPlayer = Math.hypot(candidate.x - this.player.x, candidate.z - this.player.z) > 2.5;
      const farFromCoins = this.coins.every(
        (other, index) => index === skipIndex || Math.hypot(candidate.x - other.x, candidate.z - other.z) > 1.6
      );
      if (farFromPlayer && farFromCoins) return candidate;
    }
    return candidate;
  }
}
