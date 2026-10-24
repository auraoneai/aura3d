import { lerpAngle } from "@aura3d/engine/game";

/** What the renderer shows of one simulation step: the car pose and every traffic car (x, z, yaw triplets). */
export interface Presented {
  car: { x: number; z: number; heading: number; lean: number; steer: number; speed: number };
  traffic: Float64Array;
}

/** Teleports and wrapped traffic jump further than one step can travel: show the new state, never a smear. */
export const SNAP_DISTANCE = 12;

export function blendPresented(a: Presented, b: Presented, t: number): Presented {
  const tr = new Float64Array(b.traffic.length);
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
  return {
    car: {
      x: mix(a.car.x, b.car.x),
      z: mix(a.car.z, b.car.z),
      heading: lerpAngle(a.car.heading, b.car.heading, k),
      lean: mix(a.car.lean, b.car.lean),
      steer: mix(a.car.steer, b.car.steer),
      speed: mix(a.car.speed, b.car.speed)
    },
    traffic: tr
  };
}
