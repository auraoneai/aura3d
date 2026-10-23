/**
 * UI harness: boots the real shell, HUD, menu and loop against a tiny fake match engine and renderer so the UI contract
 * (G4: HUD updates, pause, rebinding persistence, swipe) can be verified before the full simulation is merged. It is loaded
 * by tests/browser/aura-slam-ui.spec.ts only; the shipped page uses examples/aura-slam/main.ts.
 */
import type { SimEvent } from "../contract";
import { bootAuraSlam, type SlamRenderer } from "../shell/boot";
import { createMatchEngine } from "../sim/create";
import { physics } from "../sim/physics";
import { strokes } from "../sim/strokes";
import type { CreateSlamEngine, SlamEngine } from "../ui/types";
import { createInputMapper } from "../input/mapper";

/* eslint-disable @typescript-eslint/no-explicit-any */
const params = new URLSearchParams(location.search);
const swipeOn = params.get("swipe") === "1";
/** `?engine=real` runs the native simulation; the default fake engine scores a point on a timer so UI flow is deterministic. */
const realEngine = params.get("engine") === "real";

function createFakeEngine(onEvent: (e: SimEvent) => void): SlamEngine {
  const blank = (side: "player" | "ai", end: 1 | -1): Record<string, unknown> => ({
    side, end, x: 0, y: end * 1.035, vx: 0, vy: 0, energy: 100, powerDeniedUntil: 0, selectedShot: "neutral", queuedShot: "neutral", queuedAim: 0,
    queuedPower: false, aimRemaining: 0, swing: 0, swingAge: 0, swingCooldown: 0, swingPressAt: null, strokeConnected: false, stroke: "forehand",
    strokeContactAge: 0, strokeContactZ: 0, moveBlend: 0,
    stats: { pointsWon: 0, pointsLost: 0, serve: { aces: 0, doubleFaults: 0, firstIn: 0, firstAttempts: 0, secondIn: 0, secondAttempts: 0, unreturned: 0, pointsWon: 0, pointsPlayed: 0, powerIn: 0, powerAttempts: 0 } }
  });
  const make = (): Record<string, any> => ({
    mode: "menu", paused: false, phase: "menu", difficulty: "beginner", venue: "hard", time: 0, tick: 0, rallyHits: 0, server: "player", serveNumber: 1, serveCourt: "deuce",
    serveAttempt: null, lastServe: null, tiebreak: false, matchWon: false, pointWinner: null, lastCall: "", message: "", messageTimer: 0,
    score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 }, stats: { pointsWon: 0, pointsLost: 0 }, energy: 100, powerDeniedUntil: 0,
    player: blank("player", 1), ai: blank("ai", -1),
    ball: { x: 0, y: 1, z: 0.3, vx: 0, vy: 0, vz: 0, active: false, dead: false, settling: false, rolling: false, lastHit: null, bounceCount: 0, isServe: false, defensiveLob: false, speedKph: 0, netTouched: false, targetX: null, targetY: null },
    retiringBall: null, lastShotSpeed: 0, lastShotType: "", lastStroke: "", lastTiming: "", lastShotPower: false, outFeedback: null, rallyTime: 0
  });
  let state = make();
  let rallyClock = 0;
  const swipe: { effectiveStyle: string; pointEpoch: number; attemptKey: number; intent: unknown; committed: unknown; pendingStyle: null } =
    { effectiveStyle: swipeOn ? "swipe" : "classic", pointEpoch: 0, attemptKey: 0, intent: null, committed: null, pendingStyle: null };

  const swing = (_side: string, _time?: number, force?: boolean): void => {
    if (state.mode !== "playing" || state.paused) return;
    if (state.phase === "serve") {
      state.phase = "serveToss"; rallyClock = 0; state.message = "";
      onEvent({ type: "tone", args: [310, 0.06, "sine", 0.05] } as SimEvent);
    }
    state.player.swing = 0.2; state.lastShotPower = Boolean(force);
  };
  const awardPlayerPoint = (): void => {
    rallyClock = 0; state.ball.active = false;
    const s = state.score;
    s.playerPoints++;
    state.pointWinner = "player"; state.lastCall = "WINNER"; state.phase = "point"; state.message = "YOU WIN THE POINT"; state.messageTimer = 1;
    if (s.playerPoints >= 4) {
      s.playerPoints = 0; s.playerGames++;
      if (s.playerGames >= 3) { state.matchWon = true; state.winner = "player"; onEvent({ type: "complete", winner: "player" } as SimEvent); }
    }
  };

  return {
    get state() { return state; },
    resetMatch(options?: { difficulty?: string; venue?: string; practice?: boolean }) {
      const keep = { difficulty: options?.difficulty ?? "beginner", venue: options?.venue ?? "hard" };
      state = make(); Object.assign(state, keep);
      state.mode = "playing"; state.phase = "serve"; state.message = "YOUR SERVE";
      if (options?.practice) state.practice = { streak: 0, smashes: 0, completed: 0, perfect: 0, bestSpeed: 0, lastResult: "" };
      swipe.intent = null; swipe.committed = null;
    },
    applyInput() { /* the harness only needs swings */ },
    step(dt = 1 / 60) {
      if (state.paused) return;
      state.tick++; state.time += dt;
      state.messageTimer = Math.max(0, state.messageTimer - dt);
      if (state.mode !== "playing") return;
      if (state.phase === "serveToss") {
        rallyClock += dt; state.ball.z = 0.4 + rallyClock;
        if (rallyClock > 0.5) { state.phase = "rally"; rallyClock = 0; state.ball.active = true; state.ball.lastHit = "player"; state.ball.vy = -1.2; state.lastShotSpeed = 110; }
      } else if (state.phase === "rally") {
        rallyClock += dt;
        if (rallyClock > 0.8) awardPlayerPoint();
      } else if (state.phase === "point") {
        rallyClock += dt;
        if (rallyClock > 0.6) { rallyClock = 0; state.phase = "serve"; state.message = "YOUR SERVE"; state.ball.active = false; }
      }
    },
    snapshot: () => JSON.parse(JSON.stringify(state)),
    restore(s: unknown) { state = s as typeof state; },
    selectShot(shot: string) { state.player.selectedShot = shot; onEvent({ type: "selection", side: "player", shot } as SimEvent); },
    setServeAim() { /* unused */ },
    getServeFeedback: () => ({ swingCue: "ready" }),
    getServeGeometry: () => ({ minX: -0.8, maxX: 0.8 }),
    setControlStyle: () => true,
    queueSwipeShot(shot: unknown) {
      swipe.intent = shot; swipe.committed = shot; state.lastShotType = "swipe"; swing("player", state.time, false);
      return true as unknown as void;
    },
    cancelSwipeShot() { swipe.intent = null; },
    getSwipeState: () => swipe,
    requestSwing: swing,
    capabilities: { serveTargeting: 1, intentionalLobAllLevels: true, swipeControls: swipeOn ? 1 : 0 },
    SERVE: { windup: 0.24, doubleTapWindow: 0.22 },
    level: () => ({ humanReach: 0.255 })
  } as unknown as SlamEngine;
}

const renderer: SlamRenderer & { frames: number; venue: string } = {
  frames: 0, venue: "hard",
  async mount(canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#1d6f5a"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  },
  render() { renderer.frames++; },
  setVenue(id) { renderer.venue = id; },
  project: () => ({ x: 0, y: 0, visible: true }),
  projectCourt: (x, y) => ({ x: 640 + x * 400, y: 400 + y * 250, visible: true }),
  resize() { /* fixed canvas */ },
  dispose() { /* nothing to release */ },
  debug: () => ({ type: "ui-harness", frames: renderer.frames })
};

const sounds: string[] = [];
const input = createInputMapper({ storage: window.localStorage });
const controls = input.bindings;
const handle = await bootAuraSlam({
  createEngine: realEngine ? (createMatchEngine as unknown as CreateSlamEngine) : (options?: { onEvent?: (e: SimEvent) => void }) => createFakeEngine((e) => options?.onEvent?.(e)),
  renderer, input,
  audio: { unlock() { sounds.push("unlock"); }, setEnabled(on: boolean) { sounds.push(on ? "on" : "off"); }, handle(e: SimEvent) { sounds.push(e.type); } },
  physics: realEngine ? physics : { sample: (b: any) => ({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz }) as never, solveShot: (b: any) => ({ ...b, flightTime: 0.8 }) as never, timeToGround: () => 0.8 },
  strokes: realEngine ? strokes : { select: () => ({ kind: "forehand", racketSide: 1, reachable: false, reachScale: 1 }) as never },
  swipeEnabled: swipeOn
});
(window as unknown as Record<string, unknown>).__SLAM_UI_HARNESS__ = { handle, renderer, sounds, controls };
