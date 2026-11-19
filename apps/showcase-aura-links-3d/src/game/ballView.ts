/**
 * Aura Links 3D: where the ball node is drawn. In flight on live displays the fixed-step presenter interpolates between sim
 * steps; otherwise the drawn ball is the sim ball record while it exists (rolling / at rest), else the staged lie
 * (round.ballPos), which beginAddress makes the only source once the next shot is staged: golfer, solve, club, aim line and
 * the drawn ball then share one point. Pure: unit tested with the sim.
 */
import type { Vec3 } from "./types";

export function presentedBallPos(o: {
  readonly phase: string;
  readonly interpolate: boolean;
  readonly ball: Vec3 | null;
  readonly staged: Vec3;
  readonly present: () => Vec3;
}): Vec3 {
  if (o.interpolate && o.phase === "flight" && o.ball) return o.present();
  if (o.phase === "address" || o.phase === "swing") return o.staged;
  return o.ball ?? o.staged;
}
