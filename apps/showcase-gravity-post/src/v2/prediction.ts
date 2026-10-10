// Prediction-line + flown-path telemetry — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { WELL_BODIES } from "../gameplay/contracts";
import { launch } from "../gameplay/pod";
import {
  PREDICTION_MAX_STEPS, buildPredictionBeads
} from "../gameplay/prediction";
import { PLAY_PLANE_Y } from "../gameplay/stations";
import { FIXED_DT, integratePath } from "../gameplay/wells";
import { ACTUAL_PATH_BEADS, PREDICTION_BEADS } from "./scene/world";
import type { LaunchedBy } from "./evidence";
import type { GravityCtx } from "./state";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_SPEED } from "./input";
import { currentContract } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | undefined;

export function wireGravityPrediction(ctx: GravityCtx, deps: {
  handle(name: string): NodeHandle;
  contract(): ReturnType<typeof currentContract>;
  emitPodEvents(events: readonly import("../gameplay/pod").PodEvent[]): void;
  currentAimVector(): { dirX: number; dirZ: number; power: number } | null;
}) {
  const { handle, contract, emitPodEvents, currentAimVector } = deps;
  function resetPredictionTelemetry(): void {
    ctx.launchPrediction = [];
    ctx.predictionComparedSamples = 0;
    ctx.predictionMaxDivergence = 0;
    ctx.actualPath.length = 0;
    syncActualPath();
  }
  
  function launchWithPrediction(direction2: readonly [number, number], speed: number, by: LaunchedBy): void {
    const result = launch(ctx.pod, direction2, speed);
    if (result.length === 0) return;
    ctx.launchedBy = by;
    ctx.launchPrediction = integratePath({
      bodies: WELL_BODIES,
      tuning: contract().tuning,
      start: ctx.pod.kinematic.position,
      velocity: ctx.pod.kinematic.velocity,
      steps: PREDICTION_MAX_STEPS
    }).samples;
    syncLaunchPredictionPath();
    ctx.predictionComparedSamples = 0;
    ctx.predictionMaxDivergence = 0;
    ctx.actualPath.length = 0;
    ctx.actualPath.push([ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]]);
    syncActualPath();
    emitPodEvents(result);
  }
  
  function recordActualPath(): void {
    const last = ctx.actualPath[ctx.actualPath.length - 1];
    if (last && Math.hypot(last[0] - ctx.pod.kinematic.position[0], last[1] - ctx.pod.kinematic.position[1]) < 0.12) return;
    ctx.actualPath.push([ctx.pod.kinematic.position[0], ctx.pod.kinematic.position[1]]);
    if (ctx.actualPath.length > ACTUAL_PATH_BEADS) ctx.actualPath.shift();
    syncActualPath();
  }
  
  function syncActualPath(): void {
    for (let index = 0; index < ACTUAL_PATH_BEADS; index += 1) {
      const node = handle("actual-path-bead-" + index);
      const point = ctx.actualPath[index];
      if (!node || !point) {
        node?.setVisible(false);
        continue;
      }
      node.setPosition(point[0], PLAY_PLANE_Y + 0.025, point[1]).setVisible(true);
    }
  }
  
  function samplePredictionDivergence(): void {
    if (ctx.pod.correctionsUsed > 0 || ctx.launchPrediction.length === 0) return;
    const sampleIndex = Math.max(0, Math.round(ctx.pod.simulationSeconds / FIXED_DT) - 1);
    if (sampleIndex >= ctx.launchPrediction.length) return;
    if (sampleIndex < ctx.predictionComparedSamples) return;
    const expected = ctx.launchPrediction[sampleIndex]!.position;
    const error = Math.hypot(expected[0] - ctx.pod.kinematic.position[0], expected[1] - ctx.pod.kinematic.position[1]);
    ctx.predictionComparedSamples = sampleIndex + 1;
    ctx.predictionMaxDivergence = Math.max(ctx.predictionMaxDivergence, error);
  }
  
  function updatePrediction(): void {
    const vector = ctx.aiming ? currentAimVector() : null;
    if (!vector || ctx.pod.state !== "ready") {
      // During coast the launch prediction stays as cyan route markers so the
      // player can compare it with the cream flown path.
      if (!ctx.aiming && ctx.pod.state !== "coasting") hidePrediction();
      return;
    }
    const speed = MIN_LAUNCH_POWER + vector.power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_POWER);
    const path = integratePath({
      bodies: WELL_BODIES,
      tuning: contract().tuning,
      start: ctx.pod.kinematic.position,
      velocity: [vector.dirX * speed, vector.dirZ * speed],
      steps: PREDICTION_MAX_STEPS
    });
    ctx.predictionSteps = path.samples.length;
    const beads = buildPredictionBeads({ samples: path.samples, maxBeads: PREDICTION_BEADS });
    for (let index = 0; index < PREDICTION_BEADS; index += 1) {
      const node = handle("pred-bead-" + index);
      const bead = beads[index];
      if (!node || !bead) {
        node?.setVisible(false);
        continue;
      }
      node.setVisible(true);
      node.setPosition(bead.x, PLAY_PLANE_Y + 0.03, bead.z);
    }
  }
  
  function syncLaunchPredictionPath(): void {
    const beads = buildPredictionBeads({ samples: ctx.launchPrediction, maxBeads: PREDICTION_BEADS });
    for (let index = 0; index < PREDICTION_BEADS; index += 1) {
      const node = handle("pred-bead-" + index);
      const bead = beads[index];
      if (!node || !bead) {
        node?.setVisible(false);
        continue;
      }
      node.setPosition(bead.x, PLAY_PLANE_Y - 0.045, bead.z).setScale(0.052).setVisible(true);
    }
  }
  
  function hidePrediction(): void {
    ctx.predictionSteps = 0;
    for (let index = 0; index < PREDICTION_BEADS; index += 1) {
      handle("pred-bead-" + index)?.setVisible(false);
    }
  }

  return { resetPredictionTelemetry, launchWithPrediction, recordActualPath, syncActualPath,
           samplePredictionDivergence, updatePrediction, syncLaunchPredictionPath, hidePrediction };
}
