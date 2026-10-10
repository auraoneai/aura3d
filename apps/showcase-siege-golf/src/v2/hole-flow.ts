// Hole-flow subsystem — extracted from boot.ts for 14-LOC. State lives on a
// plain object boot reads/writes as `flowState.*`; behavior and evaluation
// order are unchanged.
import { HoleFlow, type SiegeGameEvent } from "../gameplay/hole-flow";
import type { ShotController } from "../gameplay/shot";
import { SIEGE_GOLF_HOLES } from "../gameplay/course";
import { SIEGE_GOLF_CANONICAL_SOLUTIONS } from "../gameplay/solutions";
import { completeHole } from "../gameplay/score";
import type { GolfAudioCue } from "../legacy/golf-audio";
import type { wireSiegeFx } from "./scene/fx";

const AUTOPLAY_DELAY_SECONDS = 0.9;

export interface SiegeFlowState {
  holeIndex: number;
  flow: HoleFlow;
  lastStrikePower: number;
  toppledAtStrike: number;
  toppledThisShot: number;
  autoplayWait: number;
  pendingAdvance: "next-hole" | "retry-hole" | "new-round" | null;
  currentVisualNames: Set<string>;
}

export function createSiegeFlowState(): SiegeFlowState {
  const flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
  return {
    holeIndex: 0,
    flow,
    lastStrikePower: 0,
    toppledAtStrike: 0,
    toppledThisShot: 0,
    autoplayWait: AUTOPLAY_DELAY_SECONDS,
    pendingAdvance: null,
    currentVisualNames: new Set(flow.sim.visuals.map((v) => v.name)),
  };
}

export interface SiegeHoleFlowDeps {
  world: { readonly visualNames: readonly string[] };
  handle(name: string): { setVisible(v: boolean): any; setPosition(x: number, y: number, z: number): any; setRotation(x: number, y: number, z: number): any } | undefined;
  shot: ShotController;
  fx: ReturnType<typeof wireSiegeFx>;
  pushCue(cue: GolfAudioCue): void;
}

export function wireSiegeHoleFlow(state: SiegeFlowState, deps: SiegeHoleFlowDeps) {
  const { world, handle, shot, fx, pushCue } = deps;

  /** Pose + show the active hole's visuals; hide union names it doesn't own. */
  function layoutHole(): void {
    const specs = new Map(state.flow.sim.visuals.map((v) => [v.name, v]));
    state.currentVisualNames = new Set(specs.keys());
    for (const name of world.visualNames) {
      const h = handle(name);
      if (!h) continue;
      const spec = specs.get(name);
      if (!spec) {
        h.setVisible(false);
        continue;
      }
      h.setVisible(true)
        .setPosition(spec.position[0], spec.position[1], spec.position[2])
        .setRotation(spec.rotation.x, spec.rotation.y, spec.rotation.z);
    }
  }

  function loadHole(index: number): void {
    state.holeIndex = index;
    state.flow = new HoleFlow(SIEGE_GOLF_HOLES[index]!);
    shot.loadHole(state.flow.hole.aim);
    state.lastStrikePower = 0;
    state.toppledAtStrike = 0;
    state.toppledThisShot = 0;
    state.pendingAdvance = null;
    state.autoplayWait = AUTOPLAY_DELAY_SECONDS;
    layoutHole();
  }

  function applyStrikeResult(result: NonNullable<ReturnType<ShotController["strike"]>>): void {
    const applied = state.flow.strike(result.input.vector, result.input.power);
    if (!applied) {
      shot.armNextShot();
      return;
    }
    state.toppledAtStrike = state.flow.snapshot().targetsDown;
    state.lastStrikePower = result.input.power;
    const p = state.flow.sim.ball.position;
    fx.strike(p[0], p[2], result.input.power);
    pushCue("drive-hit");
  }

  function consumeEvents(events: readonly SiegeGameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "strike":
          break;
        case "impact-wood": {
          const p = state.flow.sim.ball.position;
          pushCue("wood-crack");
          fx.impactWood(p[0], p[1], p[2]);
          break;
        }
        case "impact-metal": {
          const p = state.flow.sim.ball.position;
          pushCue("metal-clang");
          fx.impactMetal(p[0], p[1], p[2]);
          break;
        }
        case "cup-flash": {
          const p = state.flow.sim.ball.position;
          fx.cupFlash(p[0], p[2]);
          break;
        }
        case "pin-down": {
          const body = state.flow.sim.pinBodies.get(event.pinId);
          const p = body?.position ?? [0, 0.4, 0];
          pushCue("target-down");
          fx.pinDown(p[0], p[1], p[2]);
          break;
        }
        case "pin-sunk": {
          const cup = state.flow.hole.cups[0];
          pushCue("cup-sink");
          if (cup) fx.pinSunk(cup.x, cup.z);
          break;
        }
        case "out-of-bounds":
          break;
        case "settled":
          state.toppledThisShot = state.flow.snapshot().targetsDown - state.toppledAtStrike;
          break;
        case "complete": {
          const entry = completeHole(state.flow.scoreEntry());
          const cup = state.flow.hole.cups[0];
          pushCue(entry.stars >= 2 ? "par-chime" : "cup-sink");
          if (cup) fx.complete(cup.x, cup.z);
          state.pendingAdvance = state.holeIndex >= SIEGE_GOLF_HOLES.length - 1 ? "new-round" : "next-hole";
          break;
        }
        case "failed":
          pushCue("bogey-sting");
          fx.failed();
          state.pendingAdvance = "retry-hole";
          break;
        case "reset":
          break;
        default:
          break;
      }
    }
  }

  function autoplayStroke(): void {
    const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS.find((s) => s.holeId === state.flow.hole.id);
    if (!solution || state.flow.phase !== "aiming") return;
    const stroke = solution.strokes[Math.min(state.flow.strokes, solution.strokes.length - 1)]!;
    shot.aimTo(stroke.angle);
    const result = shot.strikeAtPower(stroke.power);
    if (result) applyStrikeResult(result);
  }

  return { layoutHole, loadHole, applyStrikeResult, consumeEvents, autoplayStroke };
}
