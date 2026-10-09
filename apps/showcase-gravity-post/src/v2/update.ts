// Per-frame gameplay update — extracted from boot.ts for 14-LOC.
import { game as engineGame, type GameInputController } from "@aura3d/engine";
import { WELL_BODIES } from "../gameplay/contracts";
import { requestFlyby, updateFlyby } from "../gameplay/flyby";
import { applyCorrection, resetPodForContract, updateCoast } from "../gameplay/pod";
import { PLAY_PLANE_Y } from "../gameplay/stations";
import type { Game } from "@aura3d/game";
import type { wireGravityAim } from "./input";
import type { wireGravityContracts } from "./contracts";
import type { wireGravityPrediction } from "./prediction";
import type { wireGravitySync } from "./sync";
import type { wireGravityHud } from "./hud";
import type { GravityCtx } from "./state";
import { currentContract } from "./state";

type CollisionWorld = { step(dt: number): void; drainSensorEvents(): Iterable<{ sensorId: string; otherId: string; kind: string }> };

export function wireGravityUpdate(ctx: GravityCtx, deps: {
  game: Game;
  input: GameInputController;
  pushCue(cue: string): void;
  contract(): ReturnType<typeof currentContract>;
  collisionWorld: ReturnType<typeof engineGame.collisionWorld>;
  dockSensorIds: ReadonlySet<string>;
  reducedMotion: boolean;
  rigState: { podX: number; podZ: number; inFlight: boolean };
  contracts: ReturnType<typeof wireGravityContracts>;
  prediction: ReturnType<typeof wireGravityPrediction>;
  sync: ReturnType<typeof wireGravitySync>;
  aim: ReturnType<typeof wireGravityAim>;
  hud: ReturnType<typeof wireGravityHud>;
}) {
  const { input, pushCue, contract, collisionWorld, dockSensorIds, reducedMotion, rigState } = deps;
  const { emitPodEvents, registerFail, handleDock, nextContract, retryContract } = deps.contracts;
  const { recordActualPath, samplePredictionDivergence, updatePrediction, hidePrediction } = deps.prediction;
  const { syncPodVisual, syncStationPulses, syncSparks, syncFlybyDrones } = deps.sync;
  const { steerKeyboardAim, launchActiveAim } = deps.aim;
  const { syncHud } = deps.hud;
  function updateGameplay(dt: number): void {
    ctx.frame += 1;
    input.update(dt);
  
    if (input.pressed("pause")) ctx.paused = !ctx.paused;
    if (input.pressed("retry")) retryContract();
    if (input.pressed("next")) nextContract();
    if (ctx.paused) {
      ctx.warpActive = false;
      syncHud();
      return;
    }
  
    // Autopilot: one keyboard-path launch on the seeded origin→destination
    // bearing — the same code Enter runs, so launchedBy stays honest.
    if (ctx.autopilotEnabled && ctx.pod.state === "ready" && ctx.autopilotFiredAt < 0) {
      ctx.autopilotFiredAt = ctx.frame;
    }
    if (ctx.autopilotEnabled && ctx.pod.state === "ready" && ctx.autopilotFiredAt >= 0 && ctx.frame - ctx.autopilotFiredAt > 45) {
      launchActiveAim("keyboard");
    }
  
    // Skippable flyby beat: gameplay frozen while the drone sweep runs.
    const beatProgress = updateFlyby(ctx.flyby, dt);
    if (ctx.flyby.active) {
      syncFlybyDrones(reducedMotion ? null : beatProgress);
      syncHud();
      return;
    }
    syncFlybyDrones(null);
  
    if (ctx.lostCooldownSeconds > 0) {
      ctx.lostCooldownSeconds = Math.max(0, ctx.lostCooldownSeconds - dt);
      if (ctx.lostCooldownSeconds === 0 && ctx.pod.state === "lost") {
        resetPodForContract(ctx.pod, contract());
        ctx.launchedBy = null;
        hidePrediction();
      }
    }
  
    if (ctx.pod.state === "coasting" && input.pressed("burnPrograde")) emitPodEvents(applyCorrection(ctx.pod, 1));
    if (ctx.pod.state === "coasting" && input.pressed("burnRetro")) emitPodEvents(applyCorrection(ctx.pod, -1));
    ctx.warpActive = (input.held("warp") || ctx.touchWarp) && ctx.pod.state === "coasting";
    if (ctx.warpActive) pushCue("warp-hum");
  
    if (ctx.pod.state === "ready") {
      steerKeyboardAim(dt);
      if (input.pressed("launch")) launchActiveAim("keyboard");
      updatePrediction();
    } else if (ctx.pod.state === "coasting") {
      const events = updateCoast({ pod: ctx.pod, contract: contract(), bodies: WELL_BODIES, dt, warpActive: ctx.warpActive });
      samplePredictionDivergence();
      recordActualPath();
      for (const flybyId of ctx.pod.flybys) {
        if (requestFlyby(ctx.flyby, flybyId, { reducedMotion })) {
          pushCue("ui-confirm");
          break;
        }
      }
      emitPodEvents(events);
      for (const event of events) {
        if (event.type === "planet-strike") { registerFail("planet-strike:" + (event.bodyId ?? "")); break; }
        if (event.type === "solar-escape") { registerFail("solar-escape"); break; }
        if (event.type === "stranded") { registerFail("stranded"); break; }
        if (event.type === "timeout") { registerFail("timeout"); break; }
      }
      updatePrediction();
    }
  
    // Drive the pod proxy from the authored pose so Rapier witnesses real
    // sensor overlaps; drain dock triggers after the step.
    const proxyBody = collisionWorld.require(ctx.podProxyId);
    proxyBody.setPosition([ctx.pod.kinematic.position[0], PLAY_PLANE_Y, ctx.pod.kinematic.position[1]]);
    proxyBody.setVelocity([ctx.pod.kinematic.velocity[0], 0, ctx.pod.kinematic.velocity[1]]);
    const contactEvents = collisionWorld.step(dt);
    for (const eventItem of contactEvents) {
      if (eventItem.type !== "begin") continue;
      const involvesPod = eventItem.a.id === ctx.podProxyId || eventItem.b.id === ctx.podProxyId;
      if (!involvesPod) continue;
      const other = eventItem.a.id === ctx.podProxyId ? eventItem.b : eventItem.a;
      if (!other.sensor && !dockSensorIds.has(other.id)) continue;
      ctx.pendingDocks.push(other.id.slice("dock-sensor-".length));
    }
    while (ctx.pendingDocks.length > 0) {
      handleDock(ctx.pendingDocks.shift()!);
    }
  
    rigState.podX = ctx.pod.kinematic.position[0];
    rigState.podZ = ctx.pod.kinematic.position[1];
    rigState.inFlight = ctx.pod.state === "coasting";
  
    syncPodVisual();
    syncStationPulses();
    syncSparks(dt);
    syncHud();
  }

  return { updateGameplay };
}
