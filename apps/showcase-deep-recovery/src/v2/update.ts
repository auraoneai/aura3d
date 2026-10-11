// Per-frame gameplay update — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import type { GameInputController } from "@aura3d/engine";
import { BUOY_STATION } from "../gameplay/reef";
import { DEFAULT_SUB_CONFIG, updateSubmarine } from "../gameplay/sub";
import { applyCollisionImpact, refuelAtSurface, updateOxygen } from "../gameplay/oxygen";
import { updateSonar } from "../gameplay/sonar";
import { bankSecuredCrates, updateTetherPhysics } from "../gameplay/salvage";
import type { DeepAudioController, DeepAudioCue } from "../legacy/deep-audio";
import type { wireDeepFx } from "./scene/fx";
import type { DeepCtx } from "./state";

export function wireDeepUpdate(ctx: DeepCtx, deps: {
  game: Game;
  input: GameInputController;
  touchInputs(): { throttle: number; turn: number; heave: number };
  autopilotControls(): { throttle: number; heave: number; turn: number; pitch: number; sprint: boolean };
  audio: DeepAudioController;
  pushCue(cue: DeepAudioCue, volume?: number): void;
  fx: ReturnType<typeof wireDeepFx>;
  syncVisualNodes: (dt: number) => void;
  syncHud: () => void;
}) {
  const { game, input, touchInputs, autopilotControls, audio, pushCue, fx,
          syncVisualNodes, syncHud } = deps;
  function updateGameplay(dt: number): void {
    ctx.frame += 1;
    if (ctx.phase !== "playing" || game.session.paused) {
      syncVisualNodes(dt);
      syncHud();
      return;
    }
    ctx.missionTime += dt;
  
    const touch = touchInputs();
    const controls = ctx.autopilotEnabled
      ? autopilotControls()
      : {
          throttle: (input.held("thrust") ? 1 : 0) - (input.held("reverse") ? 1 : 0) + touch.throttle,
          heave: (input.held("surface") ? 1 : 0) - (input.held("dive") ? 1 : 0) + touch.heave,
          turn: (input.held("turnRight") ? 1 : 0) - (input.held("turnLeft") ? 1 : 0) + touch.turn,
          pitch: 0,
          sprint: input.held("sprint")
        };
    controls.pitch = controls.throttle * 0.2 + controls.heave * 0.3;
  
    const tetherResult = updateTetherPhysics(
      { x: ctx.subState.x, y: ctx.subState.y, z: ctx.subState.z },
      ctx.crates,
      dt
    );
    ctx.lastTowDrag = tetherResult.towDragForce;
  
    ctx.subState = updateSubmarine(
      ctx.subState,
      {
        throttle: Math.max(-1, Math.min(1, controls.throttle)),
        heave: Math.max(-1, Math.min(1, controls.heave)),
        turn: Math.max(-1, Math.min(1, controls.turn)),
        pitch: controls.pitch,
        sprint: controls.sprint
      },
      ctx.lastTowDrag,
      dt,
      DEFAULT_SUB_CONFIG
    );
  
    // Collision impact → hull damage + possible breach.
    if (ctx.subState.impactSpeedLastFrame > 3.5) {
      const impact = applyCollisionImpact(ctx.oxygenState, ctx.subState.impactSpeedLastFrame);
      ctx.oxygenState = impact.nextState;
      ctx.sensorEventCount += 1;
      fx.siltKick(ctx.subState.x, ctx.subState.y, ctx.subState.z);
      if (impact.breachedJustNow) {
        ctx.breachCount += 1;
        pushCue("breach-alarm", 0.9);
        pushCue("hull-creak", 0.8);
        fx.breachStrobe(ctx.subState.x, ctx.subState.y, ctx.subState.z);
      }
    }
  
    // Oxygen/hull.
    const tetheredCount = ctx.crates.filter((c) => c.tethered).length;
    ctx.oxygenState = updateOxygen(ctx.oxygenState, ctx.subState.y, controls.sprint, tetheredCount, dt);
    if (ctx.oxygenState.warningActive && !ctx.oxygenWarningCuePlayed) {
      ctx.oxygenWarningCuePlayed = true;
      pushCue("oxygen-warn", 0.9);
    }
    if (ctx.oxygenState.blackout && ctx.phase === "playing") {
      ctx.phase = "blackout";
      pushCue("blackout", 1.0);
      audio.stopAmbience();
      void game.hud.banner("SUBMARINE BLACKOUT — LIFE SUPPORT DEPLETED — R TO RESET", { holdMs: 4000 });
    }
    if (ctx.subState.y >= -1.0 && ctx.oxygenState.oxygen < 99) {
      ctx.oxygenState = refuelAtSurface(ctx.oxygenState);
      if (!ctx.surfaceCuePlayed) {
        ctx.surfaceCuePlayed = true;
        pushCue("surface-break", 0.7);
        fx.surfaceBreak(ctx.subState.x, ctx.subState.y, ctx.subState.z);
      }
    }
  
    // Thrust bubbles while driving.
    ctx.thrustBubbleClock += dt;
    if (Math.abs(controls.throttle) > 0.3 && ctx.thrustBubbleClock > 0.24) {
      ctx.thrustBubbleClock = 0;
      fx.thrustBubbles(ctx.subState.x, ctx.subState.y, ctx.subState.z);
    }
  
    ctx.sonarState = updateSonar(ctx.sonarState, dt);
  
    // Bank secured crates at the buoy.
    const bankRes = bankSecuredCrates(
      { x: ctx.subState.x, y: ctx.subState.y, z: ctx.subState.z },
      ctx.crates,
      BUOY_STATION.dockRadius
    );
    if (bankRes.bankedCount > 0) {
      ctx.bankedTotal += bankRes.bankedValue;
      ctx.bankedCountTotal += bankRes.bankedCount;
      ctx.sensorEventCount += 1;
      ctx.standardBanked ||= bankRes.bankedKinds.includes("crate-standard");
      ctx.heavyBanked ||= bankRes.bankedKinds.includes("crate-heavy");
      pushCue("crate-bank", 0.9);
      fx.crateBank(ctx.subState.x, ctx.subState.y, ctx.subState.z);
    }
  
    if (
      ctx.standardBanked && ctx.heavyBanked && ctx.breachCount > 0 && ctx.repairCount > 0
        && !ctx.oxygenState.breached && ctx.subState.y >= -1 && ctx.phase === "playing"
    ) {
      ctx.phase = "won";
      pushCue("surface-break", 1);
      audio.stopAmbience();
      void game.hud.banner(`RECOVERY COMPLETE — ${ctx.bankedTotal} CR SECURED`, { holdMs: 5000 });
    }
  
    syncVisualNodes(dt);
    syncHud();
  }

  return { updateGameplay };
}
