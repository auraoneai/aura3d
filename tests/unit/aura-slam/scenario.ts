import type { OracleEngine } from "./oracle";

export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Deterministic human policy: chases the ball, serves with varied aim/timing, picks shots. Reads only its own engine's state. */
export function humanPolicy(engine: OracleEngine, rng: () => number, tick: number, swipe = false): void {
  const s = engine.state;
  const p = s.player, b = s.ball;
  const input: Record<string, unknown> = { x: 0, y: 0 };
  const serving = s.server === "player" && (s.phase === "serve" || s.phase === "serveToss");
  if (serving) {
    input.serveAimX = Math.sin(tick / 37) * 0.9;
    input.serveAimY = (rng() - 0.3) * 1.2;
    input.power = rng() < 0.35;
    if (tick % 29 === 0 || (s.phase === "serveToss" && rng() < 0.07)) { input.swing = true; input.eventTime = s.time; input.forcePower = rng() < 0.3; }
  } else if (s.phase === "rally" || s.phase === "serve" || s.phase === "serveToss") {
    const heading = b.active && b.vy > 0;
    const targetX = heading ? b.x + b.vx * 0.12 : 0;
    input.x = Math.max(-1, Math.min(1, (targetX - p.x) * 6));
    const targetY = heading ? Math.min(0.95, Math.max(0.35, b.y + b.vy * 0.18)) : 0.77;
    input.y = Math.max(-1, Math.min(1, (p.y - targetY) * 5));
    input.vertical = rng() < 0.2;
    input.power = rng() < 0.3;
    if (rng() < 0.4) input.shot = (["neutral", "short", "deep", "lob"] as const)[Math.floor(rng() * 4)];
    if (heading && Math.hypot(b.x - p.x, b.y - p.y) < 0.34 && b.z < 0.9 && rng() < 0.55) { input.swing = true; input.eventTime = s.time; }
    if (s.mode === "playing" && s.server === "ai" && s.phase === "serve" && rng() < 0.02) input.shot = "deep";
    if (input.aimX === undefined && (s.difficulty === "pro" || s.difficulty === "legend")) input.aimX = Math.sin(tick / 23);
  }
  engine.applyInput("player", input);
  if (swipe && s.swipe && s.phase === "rally" && b.active && b.vy > 0 && tick % 11 === 0) {
    engine.queueSwipeShot({ targetX: (rng() - 0.5) * 1.4, targetDepth: rng(), directionX: rng() - 0.5, directionY: -1, strength: 0.4 + rng() * 0.6 });
  }
}

export function stateDigest(engine: OracleEngine): string {
  return JSON.stringify(engine.snapshot());
}
