import type { InputFrame } from "./input";
import type { Difficulty, Side } from "./sim";
import type { LoggedEvent } from "./events";

/**
 * Deterministic reference capture of the ORIGINAL engine, written to evidence/aura-slam/reference.json by the capture
 * agent (schema family a3d-crayon-capture/1). The native sim must replay `script` and match `checkpoints` within `tolerance`.
 * The original is already deterministic (no DOM/clock/network; draws come from `seeded(index)`), so the capture drives
 * TennisEngine.create(...).step(1/60) directly and ALSO records one in-browser run through window.advanceTime for parity.
 */
export interface ReferenceCapture {
  schema: "a3d-crayon-capture/1";
  game: "aura-slam";
  source: { file: string; sha256: string; capturedAt: string };
  options: { difficulty: Difficulty; venue: string; firstServer: Side; online: false };
  dt: number;
  /** Input frames keyed by tick; an absent tick means "no input change". */
  script: Array<{ tick: number; side: Side; input: InputFrame }>;
  steps: number;
  checkpoints: Array<{
    tick: number;
    ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number; bounceCount: number; active: boolean };
    player: { x: number; y: number; swing: number; stroke: string };
    ai: { x: number; y: number; swing: number; stroke: string };
    phase: string; server: Side;
    score: { playerPoints: number; aiPoints: number; playerGames: number; aiGames: number };
    rallyHits: number;
  }>;
  events: LoggedEvent[];
  /** Per-field absolute tolerance derived from >= 2 independent capture sessions (expected ~1e-9: the engine is deterministic). */
  tolerance: { position: number; velocity: number; time: number };
  sessions: number;
}
