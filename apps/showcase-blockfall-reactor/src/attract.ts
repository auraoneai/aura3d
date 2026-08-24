/**
 * Attract mode — a recorded expert run plays behind the title card (BF-A6).
 *
 * The run is exported/imported as plain JSON against the route's deterministic
 * `rules.ts` simulation, so the committed fixture doubles as a regression
 * harness: `blockfall-attract.test.ts` replays it and pins the final score and
 * state checksum. Scope note (mirroring the sixty-second replay proof): the
 * fixture is recorded and verified against `rules.ts`; the mounted attract
 * playback drives the public `game.fallingBlocks` kit, whose randomizer differs,
 * so the fixture proves determinism of the rules module — not kit byte-equality.
 */
import {
  DEFAULT_SEED,
  checksumString,
  createOpeningBoard,
  runReplay,
  type BlockfallReplayEvent
} from "./rules";

export const ATTRACT_RUN_KIND = "blockfall-expert-attract-run" as const;

export interface AttractRunFixture {
  readonly kind: typeof ATTRACT_RUN_KIND;
  readonly label: string;
  readonly seed: number;
  readonly frames: number;
  /** True when events were recorded against createOpeningBoard()'s stack. */
  readonly openingBoard: boolean;
  readonly events: readonly BlockfallReplayEvent[];
  readonly expected: {
    readonly finalScore: number;
    readonly finalLines: number;
    readonly stateChecksum: string;
    /** checksumString("score:" + finalScore) — the pinned score hash. */
    readonly scoreHash: string;
  };
}

export interface AttractPlayback {
  /** Actions to apply at the current frame, then advances one frame. */
  readonly advance: () => readonly BlockfallReplayEvent["action"][];
  readonly frame: number;
  readonly finished: boolean;
  readonly loopsCompleted: number;
  /** Restarts from frame 0 and counts another loop. */
  readonly restart: () => void;
}

/** Validates and parses untrusted JSON into an AttractRunFixture. Throws on drift. */
export function parseAttractRun(input: unknown): AttractRunFixture {
  if (typeof input !== "object" || input === null) throw new Error("Attract run fixture must be a JSON object.");
  const candidate = input as Partial<AttractRunFixture>;
  if (candidate.kind !== ATTRACT_RUN_KIND) throw new Error("Attract run fixture has the wrong kind tag.");
  if (!Array.isArray(candidate.events) || candidate.events.length === 0) {
    throw new Error("Attract run fixture must contain a non-empty event list.");
  }
  for (const event of candidate.events) {
    if (typeof event !== "object" || event === null) throw new Error("Attract run event must be an object.");
    const typed = event as Partial<BlockfallReplayEvent>;
    if (typeof typed.frame !== "number" || !Number.isInteger(typed.frame) || typed.frame < 1) {
      throw new Error("Attract run event frames must be positive integers.");
    }
    if (!typed.action || typeof typed.action !== "object") throw new Error("Attract run event needs an action.");
  }
  if (typeof candidate.expected?.finalScore !== "number" || typeof candidate.expected?.stateChecksum !== "string") {
    throw new Error("Attract run fixture must pin expected score and state checksum.");
  }
  return candidate as AttractRunFixture;
}

export function serializeAttractRun(run: AttractRunFixture): string {
  return JSON.stringify(run, null, 2);
}

/** The regression harness half: replay against rules.ts and compare every pin. */
export function verifyAttractRun(run: AttractRunFixture): {
  pass: boolean;
  finalScore: number;
  finalLines: number;
  stateChecksum: string;
  scoreHash: string;
  deterministicSecondRun: boolean;
} {
  // Opening-board runs must replay against the same deterministic stack the route mounts.
  const boardOptions = run.openingBoard ? { board: createOpeningBoard() } : {};
  const first = runReplay(run.events, { seed: run.seed ?? DEFAULT_SEED, frames: run.frames, ...boardOptions });
  const second = runReplay(run.events, { seed: run.seed ?? DEFAULT_SEED, frames: run.frames, ...boardOptions });
  const scoreHash = checksumString("score:" + first.finalSummary.score);
  return {
    pass:
      first.finalSummary.score === run.expected.finalScore &&
      first.finalSummary.lines === run.expected.finalLines &&
      first.finalChecksum === run.expected.stateChecksum &&
      scoreHash === run.expected.scoreHash &&
      first.finalChecksum === second.finalChecksum,
    finalScore: first.finalSummary.score,
    finalLines: first.finalSummary.lines,
    stateChecksum: first.finalChecksum,
    scoreHash,
    deterministicSecondRun: first.finalChecksum === second.finalChecksum
  };
}

/** Frame-stepped playback used by the mounted attract loop; loops until stopped. */
export function createAttractPlayback(events: readonly BlockfallReplayEvent[], totalFrames: number): AttractPlayback {
  let frame = 0;
  let loopsCompleted = 0;
  const byFrame = new Map<number, BlockfallReplayEvent[]>();
  for (const event of events) {
    const list = byFrame.get(event.frame) ?? [];
    list.push(event);
    byFrame.set(event.frame, list);
  }
  return {
    get frame() {
      return frame;
    },
    get finished() {
      return frame >= totalFrames;
    },
    get loopsCompleted() {
      return loopsCompleted;
    },
    advance() {
      frame += 1;
      const actions = (byFrame.get(frame) ?? []).map((event) => event.action);
      if (frame >= totalFrames) {
        frame = 0;
        loopsCompleted += 1;
      }
      return actions;
    },
    restart() {
      frame = 0;
      loopsCompleted += 1;
    }
  };
}