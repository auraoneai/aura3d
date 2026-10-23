/**
 * The closed-loop keyboard controller the reference capture used (tools/crayon-capture/silt-and-signal-lib.ts
 * `siltPolicy`), kept here so the port can fly itself (`?autopilot=1`). A unit test pins the two together.
 */
import { IDLE, objectiveOf, targetOf, type Input, type Sim } from "./sim";

export interface PolicyParams {
  steerDeadband: number;
  cruiseAltitude: number;
  liftBand: number;
  boost: boolean;
  brakeDistance: number;
  holdDistance: number;
}

export const DEFAULT_POLICY: PolicyParams = { steerDeadband: 0.06, cruiseAltitude: 9, liftBand: 1.5, boost: false, brakeDistance: 20, holdDistance: 22 };

export function autopilot(sim: Sim, p: PolicyParams = DEFAULT_POLICY): Input {
  const { state, flight } = sim;
  if (state.scene || state.completed) return { ...IDLE };
  const target = targetOf(state);
  const o = objectiveOf(state);
  const desired = Math.atan2(-(target.x - state.x), -(target.z - state.z));
  let err = desired - state.yaw;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  const steer = err > p.steerDeadband ? -1 : err < -p.steerDeadband ? 1 : 0;
  const goal = Math.max(target.y, p.cruiseAltitude);
  const lift = state.y < goal - p.liftBand ? 1 : state.y > goal + p.liftBand ? -1 : 0;
  const last = state.point === o.points.length - 1;
  const distance = Math.hypot(target.x - state.x, target.z - state.z);
  const hold = (o.kind === "care" || o.kind === "resonate" || o.kind === "relay" || o.kind === "tow" || o.kind === "portal") && last;
  const near = hold && distance < p.brakeDistance;
  const interact = hold && distance < p.holdDistance && Math.abs(flight.speed) < 4;
  return { throttle: near ? 0 : 1, steer, lift, brake: near, boost: p.boost && !near, interact };
}
