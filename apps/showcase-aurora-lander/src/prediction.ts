/**
 * Bounded landing estimate for the player-facing prediction marker.
 *
 * This is deliberately an estimate, not a trajectory or touchdown promise: it
 * projects the current authored controls for at most eight seconds, samples the
 * same terrain field as gameplay, and reports when the bounded horizon expires.
 */
import { stepLander, type Controls, type LanderState } from "./lander";
import type { GustWindow } from "./sites";

export const PREDICTION_HORIZON_SECONDS = 8;
export const PREDICTION_FIXED_DT = 1 / 30;

export interface LandingPrediction {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly seconds: number;
  readonly reachedSurface: boolean;
  readonly bounded: true;
  readonly horizonSeconds: number;
  readonly model: "current-controls-authored-estimate";
}

export function predictLanding(
  state: LanderState,
  controls: Controls,
  terrainHeightAt: (x: number, z: number) => number,
  footDrop: number,
  gust?: GustWindow
): LandingPrediction {
  let projected = state;
  const steps = Math.round(PREDICTION_HORIZON_SECONDS / PREDICTION_FIXED_DT);
  for (let step = 1; step <= steps; step += 1) {
    projected = stepLander(projected, controls, PREDICTION_FIXED_DT, gust);
    const ground = terrainHeightAt(projected.x, projected.z);
    if (projected.y - footDrop <= ground) {
      return {
        x: projected.x,
        y: ground + 0.12,
        z: projected.z,
        seconds: Number((step * PREDICTION_FIXED_DT).toFixed(2)),
        reachedSurface: true,
        bounded: true,
        horizonSeconds: PREDICTION_HORIZON_SECONDS,
        model: "current-controls-authored-estimate"
      };
    }
  }
  const ground = terrainHeightAt(projected.x, projected.z);
  return {
    x: projected.x,
    y: ground + 0.12,
    z: projected.z,
    seconds: PREDICTION_HORIZON_SECONDS,
    reachedSurface: false,
    bounded: true,
    horizonSeconds: PREDICTION_HORIZON_SECONDS,
    model: "current-controls-authored-estimate"
  };
}
