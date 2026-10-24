/* Engine-neutral rules for the "coin dash" scene-4 game. Identical for both libraries; not counted as scene source. */
export const STEP = 1 / 60;
export const ARENA = 9;
export const COINS = 8;
export const ROUND_SECONDS = 30;

export interface Input { x: number; z: number }
export interface Coin { x: number; z: number; taken: boolean }
export interface State {
  frame: number;
  px: number; pz: number; vx: number; vz: number;
  coins: Coin[];
  score: number;
  timeLeft: number;
  status: "playing" | "won" | "lost";
}

export function createState(rand: () => number): State {
  const coins: Coin[] = [];
  for (let i = 0; i < COINS; i++) coins.push({ x: (rand() * 2 - 1) * (ARENA - 1), z: (rand() * 2 - 1) * (ARENA - 1), taken: false });
  return { frame: 0, px: 0, pz: 0, vx: 0, vz: 0, coins, score: 0, timeLeft: ROUND_SECONDS, status: "playing" };
}

export function step(s: State, input: Input): void {
  if (s.status !== "playing") return;
  s.frame++;
  s.vx += input.x * 40 * STEP; s.vz += input.z * 40 * STEP;
  s.vx *= 0.9; s.vz *= 0.9;
  s.px = Math.max(-ARENA, Math.min(ARENA, s.px + s.vx * STEP * 6));
  s.pz = Math.max(-ARENA, Math.min(ARENA, s.pz + s.vz * STEP * 6));
  for (const c of s.coins) {
    if (!c.taken && Math.hypot(c.x - s.px, c.z - s.pz) < 0.9) { c.taken = true; s.score += 10; }
  }
  s.timeLeft = Math.max(0, ROUND_SECONDS - s.frame * STEP);
  if (s.score === COINS * 10) s.status = "won";
  else if (s.timeLeft <= 0) s.status = "lost";
}

export function scriptedInput(frame: number): Input {
  return { x: Math.sign(Math.sin(frame * 0.021)) * (frame % 7 === 0 ? 0 : 1), z: Math.sign(Math.cos(frame * 0.017)) };
}

export function stateHash(s: State): string {
  let h = 2166136261;
  const mix = (v: number): void => { h = Math.imul(h ^ Math.round(v * 1e6), 16777619) >>> 0; };
  mix(s.frame); mix(s.px); mix(s.pz); mix(s.score); mix(s.timeLeft);
  for (const c of s.coins) { mix(c.x); mix(c.z); mix(c.taken ? 1 : 0); }
  return `${s.status}:${s.score}:${s.frame}:${h.toString(16)}`;
}
