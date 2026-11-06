export const FIXED_DT = 1 / 60;
export const ROUND_FRAMES = 30 * 60;
export const ROUND_SECONDS = 30;
export const WIN_SCORE = 15;
export const COIN_COUNT = 10;
export const ARENA_HALF = 8;
export const PLAYER_RADIUS = 0.5;
export const COIN_RADIUS = 0.4;
export const PLAYER_SPEED = 7;
const SEED = 20240607;

export type Status = "playing" | "paused" | "won" | "lost";

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface Coin {
  x: number;
  z: number;
}

export interface PublicState {
  score: number;
  status: Status;
  time: number;
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

export function createSim() {
  let rand = mulberry32(SEED);
  let frames = 0;
  let score = 0;
  let paused = false;
  let ended: "won" | "lost" | null = null;
  const player = { x: 0, z: 0 };
  const coins: Coin[] = [];
  const input: Input = { left: false, right: false, up: false, down: false };

  function spawnCoin(index: number): void {
    const limit = ARENA_HALF - 0.8;
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      x = (rand() * 2 - 1) * limit;
      z = (rand() * 2 - 1) * limit;
      const dp = Math.hypot(x - player.x, z - player.z);
      let clear = dp > 2.5;
      for (let i = 0; clear && i < coins.length; i += 1) {
        const other = coins[i];
        if (i !== index && other && Math.hypot(x - other.x, z - other.z) < 1.5) clear = false;
      }
      if (clear) break;
    }
    coins[index] = { x, z };
  }

  function reset(): void {
    rand = mulberry32(SEED);
    frames = 0;
    score = 0;
    paused = false;
    ended = null;
    player.x = 0;
    player.z = 0;
    coins.length = 0;
    for (let i = 0; i < COIN_COUNT; i += 1) spawnCoin(i);
  }

  function stepOne(): void {
    if (paused || ended) return;
    frames += 1;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
      const limit = ARENA_HALF - PLAYER_RADIUS;
      player.x = Math.max(-limit, Math.min(limit, player.x + dx * PLAYER_SPEED * FIXED_DT));
      player.z = Math.max(-limit, Math.min(limit, player.z + dz * PLAYER_SPEED * FIXED_DT));
    }
    const reach = PLAYER_RADIUS + COIN_RADIUS;
    for (let i = 0; i < coins.length; i += 1) {
      const c = coins[i];
      if (c && Math.hypot(c.x - player.x, c.z - player.z) <= reach) {
        score += 1;
        spawnCoin(i);
        if (score >= WIN_SCORE) {
          ended = "won";
          return;
        }
      }
    }
    if (frames >= ROUND_FRAMES) ended = "lost";
  }

  reset();

  return {
    input,
    player,
    coins,
    reset,
    step(n: number): void {
      const count = Math.max(0, Math.floor(n));
      for (let i = 0; i < count; i += 1) stepOne();
    },
    togglePause(): void {
      if (ended) return;
      paused = !paused;
    },
    isRunning(): boolean {
      return !paused && !ended;
    },
    state(): PublicState {
      const status: Status = ended ?? (paused ? "paused" : "playing");
      return { score, status, time: frames / 60 };
    }
  };
}
