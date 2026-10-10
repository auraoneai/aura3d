// Run lifecycle — extracted from boot.ts for 14-LOC. Run state lives on `ctx`;
// startRun/endRun/applyShieldHit behave exactly as the inlined versions did.
import type { createPulsePlayer } from "../gameplay/player";
import { PULSE_INVULN_SECONDS } from "../gameplay/player";
import type { createPulseStyleSystem } from "../gameplay/style";
import { createBeatClock } from "../gameplay/beat-clock";
import { createGateSystem } from "../gameplay/gates";
import type { buildPulseChart } from "../gameplay/patterns";
import { PULSE_PLAYER_Z } from "../gameplay/gates";
import type { createTunnelAudio, PulseSfxCue } from "../legacy/tunnel-audio";
import type { wirePulseFx } from "./scene/fx";

export const MAX_SHIELDS = 3;
export type RunState = "ready" | "running" | "summary";

export interface PulseRunCtx {
  runState: RunState;
  shields: number;
  passed: number;
  passedOnBeat: number;
  grazes: number;
  collisions: number;
  finishedReason: string | null;
  lastSection: string;
  lastBeat: number;
  runAnchorSeconds: number;
  pendingStart: boolean;
}

export function createPulseRunCtx(): PulseRunCtx {
  return {
    runState: "ready",
    shields: MAX_SHIELDS,
    passed: 0,
    passedOnBeat: 0,
    grazes: 0,
    collisions: 0,
    finishedReason: null,
    lastSection: "intro",
    lastBeat: -1,
    runAnchorSeconds: 0,
    pendingStart: false,
  };
}

export interface PulseRunDeps {
  player: ReturnType<typeof createPulsePlayer>;
  style: ReturnType<typeof createPulseStyleSystem>;
  gateSystem: ReturnType<typeof createGateSystem>;
  clock: ReturnType<typeof createBeatClock>;
  tunnelAudio: ReturnType<typeof createTunnelAudio>;
  fx: ReturnType<typeof wirePulseFx>;
  pushCue(cue: PulseSfxCue): void;
}

export function wirePulseRunState(ctx: PulseRunCtx, deps: PulseRunDeps) {
  const { player, style, gateSystem, clock, tunnelAudio, fx, pushCue } = deps;

  function startRun(): void {
    if (ctx.runState === "running") return;
    player.reset();
    style.reset();
    gateSystem.reset();
    clock.reset();
    ctx.shields = MAX_SHIELDS;
    ctx.passed = 0;
    ctx.passedOnBeat = 0;
    ctx.grazes = 0;
    ctx.collisions = 0;
    ctx.finishedReason = null;
    ctx.lastSection = "intro";
    ctx.lastBeat = -1;
    ctx.runState = "running";
    ctx.pendingStart = false;
    pushCue("uiConfirm");
    void tunnelAudio.unlock()
      .then(() => tunnelAudio.startRun())
      .then((anchor) => {
        ctx.runAnchorSeconds = anchor ?? 0;
        clock.start(anchor);
      })
      .catch(() => clock.start(null));
  }

  function endRun(reason: string): void {
    ctx.runState = "summary";
    ctx.finishedReason = reason;
    tunnelAudio.stopStems();
    tunnelAudio.duckForSummary();
    pushCue("runOver");
    fx.runOver(reason === "completed");
  }

  function applyShieldHit(): void {
    ctx.shields = Math.max(0, ctx.shields - 1);
    player.applyInvuln(PULSE_INVULN_SECONDS);
    const p = player.snapshot();
    fx.shieldHit(p.x, p.y, PULSE_PLAYER_Z, ctx.shields <= 0);
    pushCue(ctx.shields <= 0 ? "shieldBreak" : "shieldHit");
    if (ctx.shields <= 0) endRun("shields-exhausted");
  }

  return { startRun, endRun, applyShieldHit };
}

export interface PulseSystemDeps {
  chart: ReturnType<typeof buildPulseChart>;
  tunnelAudio: ReturnType<typeof createTunnelAudio>;
  player: ReturnType<typeof createPulsePlayer>;
  style: ReturnType<typeof createPulseStyleSystem>;
  fx: ReturnType<typeof wirePulseFx>;
  pushCue(cue: PulseSfxCue): void;
  onShieldHit(): void;
}

export function createPulseSystems(ctx: PulseRunCtx, deps: PulseSystemDeps) {
  const { chart, tunnelAudio, player, style, fx, pushCue, onShieldHit } = deps;

  const clock = createBeatClock({
    getAudioTime: () => tunnelAudio.nowSeconds(),
    getFrameTime: () => performance.now() / 1000,
    onBeat: (beat) => fx.beat(beat),
    onDriftCheck: () => undefined
  });

  const gateSystem = createGateSystem({
    chart,
    getSchedulerTime: () => clock.time(),
    getAudioElapsed: () => Math.max(0, tunnelAudio.nowSeconds() - ctx.runAnchorSeconds),
    getPlayer: () => player.snapshot(),
    onPass: (event) => {
      if (event.type === "collision") {
        ctx.collisions += 1;
        onShieldHit();
      } else {
        ctx.passed += 1;
        ctx.passedOnBeat += 1;
        if (event.type === "graze") {
          ctx.grazes += 1;
          style.graze();
          fx.graze(player.snapshot().x, player.snapshot().y, PULSE_PLAYER_Z);
          pushCue("graze");
        } else {
          fx.gatePassed(player.snapshot().x, PULSE_PLAYER_Z);
        }
      }
    }
  });

  return { clock, gateSystem };
}
