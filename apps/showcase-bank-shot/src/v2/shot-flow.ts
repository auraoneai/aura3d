// Shot-flow subsystem — extracted from boot.ts for 14-LOC. Mutable shot state
// lives on `state`; behavior and evaluation order are unchanged.
import type { CueController } from "../gameplay/cue";
import { strikeSpeedFor } from "../gameplay/cue";
import type { RulesEngine, ShotOutcome } from "../gameplay/rules";
import { createTableSimulation, CUE_SPOT } from "../gameplay/table";
import type { createBilliardsAudio } from "../legacy/billiards-audio";
import type { Game } from "@aura3d/game";
import { wireBankShotFx } from "./scene/fx";
import { strikeAudioMap, type StrikeAudioParams } from "./audio-map";
import { BALL_SURFACE_Y } from "./scene/world";

type PushCue = (cue: Parameters<ReturnType<typeof createBilliardsAudio>["cue"]>[0]) => void;

export interface BankShotFlowState {
  shotInFlight: boolean;
  stalledFrames: number;
  shootingFrames: number;
  pottedThisShot: number[];
  firstRack: boolean;
  lastStrikeAudio: StrikeAudioParams | null;
  ghost: { x: number; z: number };
  strokeAnim: { t0: number; pullback: number } | null;
  sinkingBalls: Map<number, number>;
}

export interface BankShotFlowDeps {
  sim: ReturnType<typeof createTableSimulation>;
  rules: RulesEngine;
  cueController: CueController;
  game: Game;
  pushCue: PushCue;
}

export function createBankShotFlow(deps: BankShotFlowDeps) {
  const { sim, rules, cueController, game, pushCue } = deps;

  const state: BankShotFlowState = {
    shotInFlight: false,
    stalledFrames: 0,
    shootingFrames: 0,
    pottedThisShot: [],
    firstRack: true,
    lastStrikeAudio: null,
    ghost: { x: CUE_SPOT[0], z: CUE_SPOT[1] },
    strokeAnim: null,
    sinkingBalls: new Map<number, number>(),
  };

  const fx = wireBankShotFx(game, () => {
    const cue = sim.ballInfos().find((b) => b.number === 0);
    return cue ? [cue.x, BALL_SURFACE_Y, cue.z] : [CUE_SPOT[0], BALL_SURFACE_Y, CUE_SPOT[1]];
  });

  function doStrike(): void {
    const command = cueController.strike();
    if (!command || rules.phase !== "aiming") return;
    if (!rules.beginShot()) return;
    if (!sim.strike(command.power, command.angle, command.spin)) {
      rules.finishResolution();
      return;
    }
    state.shotInFlight = true;
    state.stalledFrames = 0;
    state.shootingFrames = 0;
    state.pottedThisShot = [];
    if (state.firstRack) fx.onBreak(); else fx.onStrike();
    const strikeParams = strikeAudioMap(strikeSpeedFor(command.power));
    state.lastStrikeAudio = strikeParams;
    // §14.4: cue travels its full pull-back → ball contact over 80 ms.
    state.strokeAnim = { t0: performance.now(), pullback: 0.04 + command.power * 0.28 };
    pushCue(strikeParams.cue);
  }

  function applyOutcome(outcome: ShotOutcome): void {
    if (outcome.rackWon) {
      pushCue("eight-win");
      void game.hud.banner(rules.sessionComplete ? "SESSION CLEAR" : "RACK CLEAR", { holdMs: 2600 });
    } else if (outcome.rackLost) {
      pushCue("rack-fail");
      void game.hud.banner("RACK LOST", { holdMs: 2200 });
    } else if (outcome.foul) {
      pushCue("foul-whistle");
      void game.hud.toast("SCRATCH — BALL IN HAND", { ms: 1800 });
      let freeX = CUE_SPOT[0], freeZ = CUE_SPOT[1];
      if (!sim.canPlaceCue(freeX, freeZ)) {
        for (let r = 0.05; r <= 0.8 && !sim.canPlaceCue(freeX, freeZ); r += 0.05) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const tx = CUE_SPOT[0] + Math.cos(a) * r;
            const tz = CUE_SPOT[1] + Math.sin(a) * r;
            if (sim.canPlaceCue(tx, tz)) { freeX = tx; freeZ = tz; }
          }
        }
      }
      state.ghost.x = freeX; state.ghost.z = freeZ;
    } else if (outcome.pottedLegal.length > 0) {
      pushCue("combo-chime");
    }
  }

  function resolveShotNow(): void {
    if (!state.shotInFlight) return;
    const facts = sim.shotFacts();
    const outcome = rules.resolveShot({
      firstContact: facts.firstContact,
      cushionAfterContact: facts.cushionAfterContact,
      potted: state.pottedThisShot
    });
    rules.finishResolution();
    state.shotInFlight = false;
    state.pottedThisShot = [];
    state.stalledFrames = 0;
    applyOutcome(outcome);
  }

  function advanceRack(): void {
    rules.advanceRack();
    sim.resetRack();
    state.firstRack = false;
  }

  function resetSession(): void {
    rules.rerack();
    sim.resetRack();
    cueController.cancelCharge();
    state.shotInFlight = false;
    state.pottedThisShot = [];
    state.firstRack = true;
    state.ghost.x = CUE_SPOT[0];
    state.ghost.z = CUE_SPOT[1];
  }

  function consumeShotEvents(): void {
    for (const fact of sim.consumeShotFactEvents()) {
      if (fact.type === "cue-first-contact") pushCue("ball-hit");
      else if (fact.type === "cushion-touch") pushCue("cushion-hit");
    }
    for (const impact of sim.consumeImpacts()) {
      if (impact.kind === "ball-ball" && impact.speed > 0.6) pushCue("ball-hit");
    }
    for (const pot of sim.consumePotEvents()) {
      state.pottedThisShot.push(pot.ball);
      state.sinkingBalls.set(pot.ball, performance.now());
      pushCue("pocket-drop");
      fx.onPotted(pot.ball);
      void game.hud.toast(pot.ball === 0 ? "SCRATCH" : `BALL ${pot.ball} DOWN`, { ms: 1600 });
    }
  }

  return { state, fx, doStrike, applyOutcome, resolveShotNow, advanceRack, resetSession, consumeShotEvents };
}
