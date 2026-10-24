import { createCountedRng } from "@aura3d/engine";

export const FIXED_DT = 1 / 60;
export const ARENA_HALF_WIDTH = 6;

export interface DashInput {
  readonly left: boolean;
  readonly right: boolean;
}

export interface DashState {
  readonly frame: number;
  readonly playerX: number;
  readonly coinX: number;
  readonly score: number;
  readonly timeLeft: number;
  readonly over: boolean;
}

export type DashEvent = "coin" | "timeout";

export interface Dash {
  state(): DashState;
  step(input: DashInput): readonly DashEvent[];
  reset(seed?: number): void;
}

export function createDash(seed: number): Dash {
  const rng = createCountedRng(seed);
  let frame = 0;
  let playerX = 0;
  let score = 0;
  let timeLeft = 30;
  let over = false;
  let coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);

  return {
    state: () => ({ frame, playerX, coinX, score, timeLeft, over }),
    step(input) {
      const events: DashEvent[] = [];
      if (over) return events;
      frame++;
      playerX = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, playerX + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 6 * FIXED_DT));
      if (Math.abs(playerX - coinX) < 0.6) {
        score++;
        coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
        events.push("coin");
      }
      timeLeft = Math.max(0, timeLeft - FIXED_DT);
      if (timeLeft === 0) {
        over = true;
        events.push("timeout");
      }
      return events;
    },
    reset(nextSeed) {
      rng.reset(nextSeed);
      frame = 0;
      playerX = 0;
      score = 0;
      timeLeft = 30;
      over = false;
      coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
    }
  };
}
