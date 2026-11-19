import { describe, expect, it } from "vitest";
import { createInputMapper } from "../../../examples/aura-slam/input/mapper";
import {
  AUTOPLAY_RESULT_SECONDS,
  AUTOPLAY_TOGGLE_KEY,
  AUTOPLAY_VENUES,
  autoplayRequested,
  createAutoplayLoop,
  nextAutoplayVenue
} from "../../../examples/aura-slam/shell/autoplay";
import { createAdapterController } from "../../../examples/aura-slam/shell/controller";
import { playerFrame } from "../../../examples/aura-slam/shell/inputFrame";
import { applyCharacterIds, matchResetOptions } from "../../../examples/aura-slam/shell/matchSetup";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";
import { controlsHintText } from "../../../examples/aura-slam/ui/controlsHint";

/**
 * Hands-free autoplay loop (owner addendum 2026-11-18): with autoplay on, the real match engine, the shell's Auto player
 * (shell/controller.ts) and the results-card loop (shell/autoplay.ts) are stepped exactly as shell/boot.ts steps them,
 * once per fixed 1/60 s step, with no key presses. The player side must play (hits and points), nothing may stall for 5 s,
 * and each finished match must give way to the next venue after the results card.
 */
const DT = 1 / 60;
const STALL_LIMIT_SECONDS = 5;

interface Run {
  matches: Array<{ venue: string; winner: string | null; playerGames: number; aiGames: number; seconds: number }>;
  playerHits: number;
  longestRally: number;
  aiHits: number;
  playerPoints: number;
  aiPoints: number;
  maxStallSeconds: number;
  venues: string[];
  restartAfterSeconds: number[];
  loopFiredOutsideGameover: boolean;
}

function runAutoplay(seconds: number, difficulty = "beginner"): Run {
  const mapper = createInputMapper();
  const keys: Record<string, boolean> = {};
  let engine!: ReturnType<typeof createMatchEngine>;
  let progressed = false;
  let playerHits = 0, aiHits = 0, playerPoints = 0, aiPoints = 0, hitsThisStep = 0, longestRally = 0;
  engine = createMatchEngine({
    readInput: (side) => (side === "player"
      ? playerFrame(mapper, { keys, stick: { x: 0, y: 0 }, inputBlocked: false, modernServe: Boolean(engine.capabilities?.serveTargeting), strategic: false, state: engine.state as never })
      : undefined),
    onEvent: (event) => {
      const e = event as { type: string; side?: string; winner?: string };
      if (e.type === "hit" || e.type === "bounce" || e.type === "serve" || e.type === "point") progressed = true;
      if (e.type === "hit") hitsThisStep++;
      if (e.type === "point" && e.winner === "player") playerPoints++;
      if (e.type === "point" && e.winner === "ai") aiPoints++;
    }
  } as never);
  const start = (venue: string): void => {
    engine.resetMatch(matchResetOptions({ difficulty: difficulty as never, venue, practice: false, allowSwipe: false, controlStyle: "classic" }));
    applyCharacterIds(engine.state as never, false);
  };
  start("hard");
  const controller = createAdapterController({ engine: () => engine as never, state: () => engine.state as never, autoplay: true });
  const loop = createAutoplayLoop();

  const run: Run = { matches: [], longestRally: 0, playerHits: 0, aiHits: 0, playerPoints: 0, aiPoints: 0, maxStallSeconds: 0, venues: ["hard"], restartAfterSeconds: [], loopFiredOutsideGameover: false };
  // Wall clock of the run; the engine's own clock restarts with each match.
  let clock = 0, sinceProgress = 0, matchStart = 0, gameoverAt = -1;
  for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
    engine.step(DT);
    controller.step(engine.state as never, DT);
    if (hitsThisStep > 0) {
      // The contact sets `ball.lastHit` to the striker; serves are excluded so only groundstrokes and volleys count.
      const b = (engine.state as { ball: { lastHit: string | null; isServe?: boolean } }).ball;
      if (!b.isServe && b.lastHit === "player") playerHits += hitsThisStep;
      if (!b.isServe && b.lastHit === "ai") aiHits += hitsThisStep;
      hitsThisStep = 0;
    }
    longestRally = Math.max(longestRally, (engine.state as { rallyHits?: number }).rallyHits ?? 0);
    const s = engine.state as { mode: string; venue: string; time: number; winner?: string | null; score: { playerGames: number; aiGames: number } };
    if (s.mode === "gameover" && gameoverAt < 0) {
      gameoverAt = clock;
      run.matches.push({ venue: s.venue, winner: s.winner ?? null, playerGames: s.score.playerGames, aiGames: s.score.aiGames, seconds: clock - matchStart });
    }
    const modeBefore = s.mode;
    const next = loop.step(s, DT, controller.enabled);
    clock += DT;
    if (next) {
      if (modeBefore !== "gameover") run.loopFiredOutsideGameover = true;
      run.restartAfterSeconds.push(clock - gameoverAt);
      start(next.venue);
      run.venues.push(next.venue);
      gameoverAt = -1;
      matchStart = clock;
    }
    // Stall: no hit, bounce, serve or point for 5 s (the results card counts too, so it must give way in time).
    sinceProgress = progressed ? 0 : sinceProgress + DT;
    progressed = false;
    run.maxStallSeconds = Math.max(run.maxStallSeconds, sinceProgress);
  }
  return { ...run, playerHits, aiHits, playerPoints, aiPoints, longestRally };
}

describe("aura-slam autoplay: URL switches, toggle key and hint", () => {
  it("?autoplay=1, the ?autopilot=1 alias and the original ?demo=1 all turn the Auto player on", () => {
    expect(autoplayRequested(new URLSearchParams("?autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?demo=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autoplay=0"))).toBe(false);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
  });

  it("the venue tour cycles through every court and wraps", () => {
    expect(AUTOPLAY_VENUES[0]).toBe("hard");
    const seen = [AUTOPLAY_VENUES[0]!];
    for (let i = 0; i < AUTOPLAY_VENUES.length; i++) seen.push(nextAutoplayVenue(seen[seen.length - 1]));
    expect(new Set(seen).size).toBe(AUTOPLAY_VENUES.length);
    expect(seen[AUTOPLAY_VENUES.length]).toBe("hard");
    expect(nextAutoplayVenue("unknown")).toBe("hard");
  });

  it("the controls hint names the autoplay key while it is free, and drops it once an action is bound to it", () => {
    const mapper = createInputMapper();
    expect(controlsHintText(mapper.bindings as never, { autoplayKey: AUTOPLAY_TOGGLE_KEY })).toContain("AUTOPLAY: O");
    expect(controlsHintText(mapper.bindings as never)).not.toContain("AUTOPLAY");
    const b = mapper.bindings as unknown as { getBindings(d: string): Record<string, readonly [string, string | null]>; applyBindings(d: string, p: unknown): { ok: boolean } };
    expect(b.applyBindings("keyboard", { ...b.getBindings("keyboard"), short: ["KeyO", null] }).ok).toBe(true);
    expect(controlsHintText(mapper.bindings as never, { autoplayKey: AUTOPLAY_TOGGLE_KEY })).not.toContain("AUTOPLAY");
  });

  it("the results-card loop only fires in gameover with autoplay on, after the hold", () => {
    const loop = createAutoplayLoop();
    for (let i = 0; i < 600; i++) expect(loop.step({ mode: "playing", venue: "hard" }, DT, true)).toBeNull();
    for (let i = 0; i < 600; i++) expect(loop.step({ mode: "gameover", venue: "hard" }, DT, false)).toBeNull();
    let fired: unknown = null, steps = 0;
    while (!fired && steps < 1000) { fired = loop.step({ mode: "gameover", venue: "clay" }, DT, true); steps++; }
    expect(fired).toEqual({ venue: "desert" });
    expect(steps * DT).toBeCloseTo(AUTOPLAY_RESULT_SECONDS, 1);
  });
});

describe("aura-slam autoplay: the real sim plays itself, forever", () => {
  it("two full matches with no key press: the player side rallies and scores, nothing stalls 5 s, the next venue follows the results card", () => {
    const run = runAutoplay(60 * 15);
    expect(run.matches.length).toBeGreaterThanOrEqual(2);
    // Competent, not just alive: real groundstroke rallies, and the Auto player wins its share of points.
    expect(run.playerHits).toBeGreaterThan(100);
    expect(run.longestRally).toBeGreaterThanOrEqual(6);
    expect(run.playerPoints).toBeGreaterThan(0);
    expect(run.maxStallSeconds).toBeLessThan(STALL_LIMIT_SECONDS);
    expect(run.loopFiredOutsideGameover).toBe(false);
    for (const after of run.restartAfterSeconds) expect(after).toBeCloseTo(AUTOPLAY_RESULT_SECONDS, 1);
    expect(run.venues.slice(0, 3)).toEqual(["hard", "grass", "clay"]);
  }, 120_000);

  it("against the Ace (pro) CPU the Auto player still rallies and wins points", () => {
    const run = runAutoplay(60 * 10, "pro");
    expect(run.playerHits).toBeGreaterThan(50);
    expect(run.playerPoints).toBeGreaterThan(0);
    expect(run.aiPoints).toBeGreaterThan(0);
    expect(run.maxStallSeconds).toBeLessThan(STALL_LIMIT_SECONDS);
  }, 120_000);
});
