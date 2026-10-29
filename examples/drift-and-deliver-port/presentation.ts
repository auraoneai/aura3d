import { lerpAngle } from "@aura3d/engine/game";

/** What the renderer shows of one simulation step: the car pose and every traffic car (x, z, yaw triplets). */
export interface Presented {
  car: { x: number; z: number; heading: number; lean: number; steer: number; speed: number };
  traffic: Float64Array;
}

/** Teleports and wrapped traffic jump further than one step can travel: show the new state, never a smear. */
export const SNAP_DISTANCE = 12;

/** An empty presented state with room for `cars` traffic cars (preallocated buffers for the per-step ring). */
export function createPresented(cars: number): Presented {
  return { car: { x: 0, z: 0, heading: 0, lean: 0, steer: 0, speed: 0 }, traffic: new Float64Array(cars * 3) };
}

/** `blendPresented` written into `out` (no allocation per frame). `out` must not be `a` or `b`. */
export function blendPresentedInto(out: Presented, a: Presented, b: Presented, t: number): Presented {
  const tr = out.traffic.length === b.traffic.length ? out.traffic : (out.traffic = new Float64Array(b.traffic.length));
  for (let i = 0; i < tr.length; i += 3) {
    const jump = Math.hypot(b.traffic[i]! - a.traffic[i]!, b.traffic[i + 1]! - a.traffic[i + 1]!) > SNAP_DISTANCE;
    const k = jump ? 1 : t;
    tr[i] = a.traffic[i]! + (b.traffic[i]! - a.traffic[i]!) * k;
    tr[i + 1] = a.traffic[i + 1]! + (b.traffic[i + 1]! - a.traffic[i + 1]!) * k;
    tr[i + 2] = lerpAngle(a.traffic[i + 2]!, b.traffic[i + 2]!, k);
  }
  const jump = Math.hypot(b.car.x - a.car.x, b.car.z - a.car.z) > SNAP_DISTANCE;
  const k = jump ? 1 : t;
  const mix = (x: number, y: number): number => x + (y - x) * k;
  const c = out.car;
  c.x = mix(a.car.x, b.car.x);
  c.z = mix(a.car.z, b.car.z);
  c.heading = lerpAngle(a.car.heading, b.car.heading, k);
  c.lean = mix(a.car.lean, b.car.lean);
  c.steer = mix(a.car.steer, b.car.steer);
  c.speed = mix(a.car.speed, b.car.speed);
  return out;
}

export function blendPresented(a: Presented, b: Presented, t: number): Presented {
  return blendPresentedInto(createPresented(b.traffic.length / 3), a, b, t);
}
