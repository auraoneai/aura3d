// Pod event fan-out + contract lifecycle — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import { CONTRACTS } from "../gameplay/contracts";
import { skipFlyby, updateFlyby } from "../gameplay/flyby";
import {
  DOCK_SENSOR_RADIUS, evaluateCapture, resetPodForContract, type PodEvent
} from "../gameplay/pod";
import { SHIFT_FAIL_LIMIT, scoreContract } from "../gameplay/scoring";
import { dockPointHash } from "../gameplay/wells";
import type { wireGravityFx } from "./scene/fx";
import type { GravityCtx } from "./state";
import { currentContract } from "./state";

export function wireGravityContracts(ctx: GravityCtx, deps: {
  game: Game;
  pushCue(cue: string): void;
  fx: ReturnType<typeof wireGravityFx>;
  contract(): ReturnType<typeof currentContract>;
  stationWorld(id: string): { readonly x: number; readonly z: number };
  resetPredictionTelemetry: () => void;
  resetKeyboardAim: () => void;
  hidePrediction: () => void;
}) {
  const { pushCue, fx, contract, stationWorld,
          resetPredictionTelemetry, resetKeyboardAim, hidePrediction } = deps;
  function emitPodEvents(events: readonly PodEvent[]): void {
    for (const event of events) {
      if (event.type === "launch") {
        pushCue("launch-whoosh");
        fx.launch(ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]);
      } else if (event.type === "assist") {
        pushCue("assist-chime");
      } else if (event.type === "correction") {
        pushCue("burn-loop");
        fx.correction(ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]);
      } else if (
        event.type === "planet-strike" || event.type === "solar-escape"
          || event.type === "stranded" || event.type === "timeout"
      ) {
        pushCue("ctx.pod-lost");
        fx.podLost(ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]);
      } else if (event.type === "too-fast") {
        pushCue("bounce-off");
        fx.bounce(ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]);
      }
    }
  }
  
  function registerFail(reason: string): void {
    ctx.lastFailReason = reason;
    ctx.failedContracts += 1;
    ctx.lostCooldownSeconds = 1.4;
    if (ctx.failedContracts >= SHIFT_FAIL_LIMIT) ctx.shiftOver = true;
  }
  
  function handleDock(stationId: string): void {
    if (ctx.pod.state !== "coasting") return;
    if (stationId !== contract().destinationStationId) return;
    const outcome = evaluateCapture(ctx.pod, contract(), stationId);
    ctx.dockEventCount += 1;
    const core = stationWorld(contract().destinationStationId);
    if (outcome.docked) {
      ctx.dockEventLog.push({ stationId, kind: "capture" });
      pushCue("dock-lock");
      pushCue("contract-clear");
      fx.dockClamp(core.x, core.z);
      fx.delivery(core.x, core.z);
      ctx.lastDockHash = dockPointHash([core.x, core.z]);
      ctx.lastScoreCard = scoreContract({
        propellant: ctx.pod.propellant,
        distanceToCore: outcome.distanceToCore,
        dockRadius: DOCK_SENSOR_RADIUS,
        assists: ctx.pod.assists,
        bonusBodyHit: contract().bonusBodyId !== null && ctx.pod.flybys.has(contract().bonusBodyId!)
      });
      ctx.score += ctx.lastScoreCard.total;
      ctx.completedContracts += 1;
      ctx.sparkLife = 0.7;
      hidePrediction();
    } else {
      ctx.dockEventLog.push({ stationId, kind: "bounce" });
    }
    if (ctx.dockEventLog.length > 12) ctx.dockEventLog.shift();
  }
  
  function resetCampaign(): void {
    ctx.lastFailReason = null;
    ctx.contractIndex = 0;
    ctx.score = 0;
    ctx.failedContracts = 0;
    ctx.completedContracts = 0;
    ctx.shiftOver = false;
    ctx.campaignComplete = false;
    ctx.lastScoreCard = null;
    ctx.launchedBy = null;
    ctx.flyby.visited.clear();
    ctx.flyby.beatsRun = 0;
    ctx.dockEventLog.length = 0;
    ctx.dockEventCount = 0;
    resetPodForContract(ctx.pod, contract());
    resetPredictionTelemetry();
    resetKeyboardAim();
    hidePrediction();
    pushCue("ui-confirm");
  }
  
  function nextContract(): void {
    if (ctx.pod.state !== "docked") return;
    pushCue("ui-confirm");
    if (ctx.contractIndex >= CONTRACTS.length - 1) {
      ctx.campaignComplete = true;
      return;
    }
    ctx.contractIndex += 1;
    ctx.lastScoreCard = null;
    ctx.launchedBy = null;
    resetPodForContract(ctx.pod, contract());
    resetPredictionTelemetry();
    resetKeyboardAim();
  }
  
  function retryContract(): void {
    if (ctx.shiftOver || ctx.campaignComplete) {
      resetCampaign();
      return;
    }
    if (ctx.flyby.active) {
      skipFlyby(ctx.flyby);
      updateFlyby(ctx.flyby, 0);
    }
    ctx.paused = false;
    ctx.aiming = false;
    ctx.launchedBy = null;
    pushCue("ui-confirm");
    ctx.lastScoreCard = null;
    resetPodForContract(ctx.pod, contract());
    resetPredictionTelemetry();
    resetKeyboardAim();
  }

  return { emitPodEvents, registerFail, handleDock, resetCampaign, nextContract, retryContract };
}
