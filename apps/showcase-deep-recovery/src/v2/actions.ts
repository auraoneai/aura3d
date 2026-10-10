// Player actions + autopilot — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import { BUOY_STATION, WRECK_OBSTACLES } from "../gameplay/reef";
import {
  GRAPPLE_RANGE, bankSecuredCrates, initialCrateSpawns, releaseTethers,
  tryGrappleCrates, CONTRACTS
} from "../gameplay/salvage";
import { triggerPing, type SonarTarget } from "../gameplay/sonar";
import { patchBreach, initialOxygenState } from "../gameplay/oxygen";
import { initialSonarState } from "../gameplay/sonar";
import { initialSubmarineState } from "../gameplay/sub";
import type { DeepAudioController, DeepAudioCue } from "../legacy/deep-audio";
import type { wireDeepFx } from "./scene/fx";
import type { SalvageCrate } from "../gameplay/salvage";
import type { DeepCtx } from "./state";

export function wireDeepActions(ctx: DeepCtx, deps: {
  game: Game;
  audio: DeepAudioController;
  pushCue(cue: DeepAudioCue, volume?: number): void;
  syncHud: () => void;
  syncVisualNodes: (dt: number) => void;
  fx: ReturnType<typeof wireDeepFx>;
  touchInputs(): { throttle: number; turn: number; heave: number };
}) {
  const { game, audio, pushCue, syncHud, syncVisualNodes, fx, touchInputs } = deps;
  const GRAPPLE_LATCH_RANGE = GRAPPLE_RANGE * 0.94;
  function sonarTargets(): SonarTarget[] {
    return [
      { id: "buoy", kind: "buoy", position: { x: BUOY_STATION.x, y: BUOY_STATION.y, z: BUOY_STATION.z }, value: 0 },
      ...WRECK_OBSTACLES.map((w: (typeof WRECK_OBSTACLES)[number]) => ({ id: w.id, kind: "wreck" as const, position: { x: w.x, y: w.y, z: w.z }, value: 0 })),
      ...ctx.crates.filter((c: SalvageCrate) => !c.banked).map((c: SalvageCrate) => ({ id: c.id, kind: c.kind, position: { x: c.x, y: c.y, z: c.z }, value: c.baseValue }))
    ];
  }
  
  function handlePing(): void {
    if (ctx.phase !== "playing" || game.session.paused) return;
    const result = triggerPing(
      ctx.sonarState,
      { x: ctx.subState.x, y: ctx.subState.y, z: ctx.subState.z },
      sonarTargets(),
      ctx.missionTime,
      WRECK_OBSTACLES.map((w: (typeof WRECK_OBSTACLES)[number]) => ({ id: w.id, position: w, radius: w.radius }))
    );
    if (result.nextState.pingCount > ctx.sonarState.pingCount) {
      ctx.sonarState = result.nextState;
      pushCue("sonar-ping", 0.9);
      fx.sonarPing(ctx.subState.x, ctx.subState.y, ctx.subState.z);
      if (result.newContacts.length > 0) {
        setTimeout(() => pushCue("sonar-return", 0.75), 250);
      }
    }
  }
  
  function handleGrappleToggle(): void {
    if (ctx.phase !== "playing" || game.session.paused) return;
    const tetheredCount = ctx.crates.filter((c) => c.tethered).length;
    if (tetheredCount > 0) {
      releaseTethers(ctx.crates);
      return;
    }
    const res = tryGrappleCrates({ x: ctx.subState.x, y: ctx.subState.y, z: ctx.subState.z }, ctx.crates);
    if (res.latchedCrate) {
      ctx.grappleLatchCount += 1;
      ctx.sensorEventCount += 1;
      pushCue("grapple-latch", 0.85);
      fx.grappleLatch(res.latchedCrate.x, res.latchedCrate.y, res.latchedCrate.z);
    }
  }
  
  function atBuoyServiceZone(): boolean {
    return Math.hypot(ctx.subState.x - BUOY_STATION.x, ctx.subState.z - BUOY_STATION.z) <= BUOY_STATION.dockRadius
      && ctx.subState.y >= -4;
  }
  
  function handleRepair(): boolean {
    if (ctx.phase !== "playing" || game.session.paused || !ctx.oxygenState.breached || !atBuoyServiceZone()) return false;
    ctx.oxygenState = patchBreach(ctx.oxygenState);
    ctx.repairCount += 1;
    ctx.sensorEventCount += 1;
    pushCue("patch-seal", 0.85);
    return true;
  }
  
  function togglePause(): void {
    if (ctx.phase === "blackout" || ctx.phase === "won") return;
    if (ctx.phase === "playing") {
      ctx.phase = "paused";
      audio.stopAmbience();
      game.session.pause("user");
    } else {
      ctx.phase = "playing";
      game.session.resume();
      audio.startAmbience();
    }
  }
  
  function resetGame(): void {
    ctx.subState = initialSubmarineState();
    ctx.oxygenState = initialOxygenState();
    ctx.sonarState = initialSonarState();
    ctx.crates = initialCrateSpawns();
    ctx.bankedTotal = 0;
    ctx.bankedCountTotal = 0;
    ctx.grappleLatchCount = 0;
    ctx.sensorEventCount = 0;
    ctx.standardBanked = false;
    ctx.heavyBanked = false;
    ctx.breachCount = 0;
    ctx.repairCount = 0;
    ctx.lastTowDrag = 0;
    ctx.surfaceCuePlayed = false;
    ctx.oxygenWarningCuePlayed = false;
    ctx.missionTime = 0;
    ctx.phase = "playing";
    game.session.resume();
    syncVisualNodes(0);
  }
  
  // ------------------------------------------------------- autopilot -----------
  // ?autorun=1 runs a scripted salvage leg: steer to crate-s1, latch it, then
  // hold. Deterministic — the §7.2.1 salvage.grappled>=1 condition rides on it.
  const AUTO_TARGET_CRATE = "crate-s1";
  
  function autopilotControls(): { throttle: number; heave: number; turn: number; pitch: number; sprint: boolean } {
    const crate = ctx.crates.find((c) => c.id === AUTO_TARGET_CRATE)!;
    const dx = crate.x - ctx.subState.x;
    const dy = crate.y - ctx.subState.y;
    const dz = crate.z - ctx.subState.z;
    const dist = Math.hypot(dx, dy, dz);
    const bearing = Math.atan2(dx, dz);
    let err = bearing - ctx.subState.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    if (dist < GRAPPLE_LATCH_RANGE) {
      if (!ctx.autopilotGrappleTried) {
        ctx.autopilotGrappleTried = true;
        handleGrappleToggle();
      }
      return { throttle: 0, heave: 0, turn: 0, pitch: 0, sprint: false };
    }
    return {
      throttle: Math.abs(err) < 0.5 ? 0.9 : 0.25,
      heave: Math.max(-1, Math.min(1, dy * 0.5)),
      turn: Math.max(-1, Math.min(1, err * 2.2)),
      pitch: Math.max(-0.4, Math.min(0.4, dy * 0.08)),
      sprint: false
    };
  }

  return { sonarTargets, handlePing, handleGrappleToggle, atBuoyServiceZone, handleRepair, togglePause, resetGame, autopilotControls };
}
