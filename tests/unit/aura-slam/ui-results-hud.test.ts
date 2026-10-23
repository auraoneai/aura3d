import { describe, expect, it } from "vitest";
import { ballSpeedKph } from "../../../examples/aura-slam/ui/format";
import { callText, outFeedbackView, powerView, speedometerView } from "../../../examples/aura-slam/ui/hud";
import { summarizeMatch } from "../../../examples/aura-slam/ui/results";
import { serveCardView, serveFaultText, serveInstructionTexts, serveStatsText, withServeFaultTiming } from "../../../examples/aura-slam/ui/serveFeedback";
import type { HudState } from "../../../examples/aura-slam/ui/types";
import { originalControls, originalPhysics, originalResults, memoryStorage, playedEngine } from "./ui-original";

const names = { player: "ALEX", ai: "CPU" };

describe("match results", () => {
  it("matches match-results.js summarize on live original states and edge cases", () => {
    const states: unknown[] = [playedEngine(0).state, playedEngine(400).state, { stats: { pointsWon: 3, pointsLost: 4, longestRally: 1 } },
      { player: { stats: { pointsWon: 2, serve: { aces: 1, doubleFaults: 0, firstIn: 3, firstAttempts: 5, pointsWon: 2, pointsPlayed: 4, fastest: 181, speedCount: 2, speedTotal: 350 } } },
        ai: { stats: { pointsWon: 5, serve: { aces: 0, doubleFaults: 2, firstIn: 1, firstAttempts: 4, pointsWon: 1, pointsPlayed: 5, fastest: 0, speedCount: 0, speedTotal: 0 } } }, stats: { longestRally: 9 } }];
    for (const state of states) expect(summarizeMatch(state as never, names)).toEqual(originalResults.summarize(state, names));
  });
  it("defaults the names", () => {
    expect(summarizeMatch({ stats: {} } as never).names).toEqual({ player: "Player", ai: "Opponent" });
  });
});

describe("speedometer and ball speed", () => {
  it("matches physics.speedKph", () => {
    for (const [vx, vy, vz] of [[0, 0, 0], [0.3, -1.9, 0.4], [-0.9, 2.2, -1.1], [0.01, 0.01, 0.01]]) {
      const ball = { vx, vy, vz };
      expect(ballSpeedKph(ball)).toBe(originalPhysics.speedKph(ball));
    }
  });
  it("shows zero speed for a held ball and clamps the gauge at 250 km/h", () => {
    const held = { phase: "serve", ball: { active: false, settling: false, vx: 0, vy: 0, vz: 0 }, lastShotSpeed: 0 } as unknown as HudState;
    expect(speedometerView(held)).toMatchObject({ speedKph: 0, fraction: 0 });
    const fast = { phase: "rally", ball: { active: true, settling: false, vx: 0, vy: -20, vz: 0 }, lastShotSpeed: 200 } as unknown as HudState;
    expect(speedometerView(fast).fraction).toBe(1);
  });
});

describe("out feedback and power", () => {
  it("pulses twice then stops and honours reduced motion", () => {
    const state = (remaining: number) => ({ mode: "playing", paused: false, outFeedback: { remaining, duration: 1.6 } }) as unknown as HudState;
    expect(outFeedbackView(state(1.6)).visible).toBe(true);
    expect(outFeedbackView(state(1.6)).pulse).toBe(0);
    expect(outFeedbackView(state(1.35)).pulse).toBeGreaterThan(0.5);
    expect(outFeedbackView(state(0.1)).pulse).toBe(0);
    expect(outFeedbackView(state(1.35), true).pulse).toBe(0.35);
    expect(outFeedbackView({ ...state(1), paused: true } as HudState).visible).toBe(false);
  });
  it("labels the power meter", () => {
    const player = (over: Record<string, unknown>) => ({ time: 0, powerDeniedUntil: 0, energy: 100, player: { energy: 100, aimRemaining: 0, queuedShot: "neutral", queuedAim: 0, queuedPower: false, powerDeniedUntil: 0, ...over } }) as unknown as HudState;
    expect(powerView(player({})).label).toBe("POWER");
    expect(powerView(player({ aimRemaining: 0.1, queuedShot: "deep", queuedAim: -0.3 })).label).toBe("AIM ↖");
    expect(powerView(player({ aimRemaining: 0.1, queuedShot: "short", queuedAim: 0.3, queuedPower: true })).label).toBe("POWER ↘");
    expect(powerView({ ...player({}), time: 1, powerDeniedUntil: 2 } as HudState).label).toBe("RECOVERING");
    expect(powerView({ ...player({}), energy: 20 } as HudState)).toMatchObject({ low: true, value: 20, fraction: 0.2 });
  });
});

describe("call banner", () => {
  const ctx = (over: Record<string, unknown> = {}) => ({ names, key: "SPACE", modernServe: true, feedback: null, smashAvailable: false, ...over });
  const state = (over: Record<string, unknown> = {}) => ({
    phase: "rally", server: "player", serveNumber: 1, message: "", messageTimer: 0, lastCall: "", pointWinner: null, serveAttempt: null, lastServe: null,
    ball: { active: false, lastHit: null, defensiveLob: false, bounceCount: 0, vz: 0 }, player: { swing: 0 }, ...over
  }) as unknown as HudState;
  it("prompts the serve and the toss", () => {
    expect(callText(state({ phase: "serve" }), ctx())).toBe("YOUR SERVE · AIM THEN SPACE TO TOSS");
    expect(callText(state({ phase: "serve", serveNumber: 2 }), ctx({ modernServe: false }))).toBe("SECOND SERVE · SPACE TO TOSS");
    expect(callText(state({ phase: "serveToss" }), ctx())).toBe("PRESS SPACE AS BALL RISES INTO CIRCLE");
    expect(callText(state({ phase: "serveToss" }), ctx({ feedback: { swingCue: "ready" } }))).toBe("START SWING · SPACE AS BALL REACHES CIRCLE");
    expect(callText(state({ phase: "serveToss" }), ctx({ feedback: { swingCue: "late" } }))).toBe("LATE · LET TOSS DROP TO RETRY");
    expect(callText(state({ phase: "serveToss", serveAttempt: { swingAt: 1.2, power: false } }), ctx())).toBe("SWINGING · DOUBLE SPACE FOR POWER");
  });
  it("calls points with the winner's name and aces", () => {
    expect(callText(state({ phase: "point", message: "YOU WIN", messageTimer: 1, pointWinner: "ai", lastCall: "OUT" }), ctx())).toBe("CPU WINS POINT · OUT");
    expect(callText(state({ phase: "point", message: "x", messageTimer: 1, pointWinner: "player", lastCall: "ACE" }), ctx())).toBe("ACE · ALEX");
    expect(callText(state({ message: "RIVAL SERVES", messageTimer: 1 }), ctx())).toBe("CPU SERVES");
  });
  it("warns about a high ball and offers a smash", () => {
    const incoming = { active: true, lastHit: "ai", defensiveLob: true, bounceCount: 0, vz: 0 };
    expect(callText(state({ ball: incoming }), ctx())).toBe("HIGH BALL · GET READY");
    expect(callText(state({ ball: incoming }), ctx({ smashAvailable: true }))).toBe("SMASH · SPACE");
  });
  it("folds fault timing into the banner", () => {
    const attempt = { faultReason: "LONG", result: "fault", timing: "LATE", power: false };
    expect(withServeFaultTiming("FAULT", state({ phase: "serveFault", serveAttempt: attempt }), true)).toBe("LATE · FAULT — LONG • SECOND SERVE");
    const df = { faultReason: "NET", result: "doubleFault", timing: "PERFECT", power: true };
    expect(withServeFaultTiming("DOUBLE FAULT", state({ phase: "point", serveAttempt: df }), true)).toBe("CENTERED · POWER +0.5 m · DOUBLE FAULT — NET");
    expect(serveFaultText(df as never)).toBe("CENTERED · POWER +0.5 m · DOUBLE FAULT — NET");
  });
});

describe("serve card and help copy", () => {
  it("hides the card in the menu, practice and classic serve", () => {
    expect(serveCardView({ mode: "menu" } as HudState, null, names, true).hidden).toBe(true);
    expect(serveCardView({ mode: "playing", practice: {} } as unknown as HudState, null, names, true).hidden).toBe(true);
    expect(serveCardView({ mode: "playing" } as HudState, null, names, false).hidden).toBe(true);
  });
  it("hints the serve target, net risk and locked aim", () => {
    const state = (over: Record<string, unknown>) => ({ mode: "playing", server: "player", phase: "serve", serveAttempt: null, lastServe: null, player: { stats: {} }, ai: { stats: {} }, ...over }) as unknown as HudState;
    expect(serveCardView(state({}), null, names, true).hint).toBe("MOVE TARGET · WIDE / BODY / T");
    expect(serveCardView(state({}), { netRisk: true }, names, true)).toMatchObject({ hint: "NET RISK · MOVE TARGET DEEPER", warning: true });
    expect(serveCardView(state({ serveAttempt: { lockedAim: { x: 0, y: 0 }, power: false, server: "player" } }), null, names, true).hint).toBe("AIM LOCKED · 240 ms swing");
    expect(serveCardView(state({ phase: "point", lastServe: { result: "ace", server: "player", launchSpeedKph: 187 } }), null, names, true))
      .toMatchObject({ hint: "ACE · ALEX", launchSpeed: "187 km/h" });
  });
  it("formats serve statistics", () => {
    const state = { player: { stats: { serve: { aces: 2, doubleFaults: 1, firstIn: 6, firstAttempts: 10, secondIn: 2, secondAttempts: 4, unreturned: 3, pointsWon: 7, pointsPlayed: 9, powerIn: 1, powerAttempts: 2, speedCount: 2, speedTotal: 360, fastest: 190 } } }, ai: { stats: {} } } as unknown as HudState;
    expect(serveStatsText(state, "player", names)).toBe("ALEX · 2 aces · 1 double faults · 1st in 60% · 2nd in 50% · 3 unreturned · serve points 78% · power in 50% · average 180 km/h (1st —, 2nd —) · fastest 190 km/h");
    expect(serveStatsText(state, "ai", names)).toBe("");
  });
  it("substitutes the player's bindings into the instructions", () => {
    const controls = originalControls.create({ storage: memoryStorage() });
    const texts = serveInstructionTexts({ modernServe: true, intentionalLobAllLevels: true, strategic: false, swipeActive: false, controls });
    expect(texts.keyboardHelp).toContain("arrows/WASD");
    expect(texts.keyboardHelp).toContain("Space tosses");
    expect(texts.lobKeyboardHelp).toContain("press R to swing a high, deep lob");
    expect(texts.introHelp).toBe("AIM · TOSS · PRESS AS THE RISING BALL REACHES THE CIRCLE");
    const swipe = serveInstructionTexts({ modernServe: true, intentionalLobAllLevels: true, strategic: false, swipeActive: true, controls });
    expect(swipe.introHelp).toBe("SWIPE TO AIM AND SERVE");
  });
});
