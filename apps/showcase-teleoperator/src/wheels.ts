import { game, instances, material, type AuraTransformSpec } from "@aura3d/engine";
import { unitWheelGeometrySpec } from "./art/proceduralModels";
import type { IdolWheelLayout } from "./art/idolModels";
import { wheelInstanceTransform, type CarBodyPose } from "./carMotion";

/**
 * Idol wow pass: every Idol body is wheel-less, so the road wheels are one instanced pool (`sf-wheels`, one draw) placed
 * each frame at the hubs measured from the bodies' arches. Wheels roll by distance travelled / radius and the front
 * axle steers with the player's steering. Render only: nothing here feeds the sim, collision or replay.
 */
export const WHEELS_NODE = "sf-wheels";
/** Player (up to 6) + 15 road users x up to 6 hubs. */
export const WHEEL_CAPACITY = 96;
/** Front-wheel steer angle at full steering input (rad). */
export const MAX_WHEEL_STEER = 0.42;

export function wheelPoolNode(pool: (n: number) => AuraTransformSpec[]) {
  return instances
    .custom(unitWheelGeometrySpec(), {
      name: WHEELS_NODE,
      material: material.pbr({ name: "sf-road-wheel", color: "#ffffff", roughness: 0.55, metalness: 0.3, clearcoat: 0, sheen: 0 }),
      castShadow: true,
      receiveShadow: true,
      transforms: pool(WHEEL_CAPACITY)
    })
    .runtime(game.runtimeNode(WHEELS_NODE));
}

/**
 * Highest DRAWN wheel spin (rad/s): above it a 6-spoke rim steps more than ~0.3 rad a 60 Hz frame and strobes (reads as a
 * shaking, stopped or backward wheel; owner QA Nov 18). The drawn rolling distance grows at most this fast; the sim is untouched.
 */
export const WHEEL_SPIN_SHOWN_MAX = 18;

/** Next drawn rolling distance (m) of a radius-`radius` wheel at `speed` m/s over `dt` s, spin capped at WHEEL_SPIN_SHOWN_MAX. */
export function shownWheelDistance(prev: number, speed: number, dt: number, radius: number): number {
  return prev + Math.min(Math.abs(speed), WHEEL_SPIN_SHOWN_MAX * Math.max(0.05, radius)) * Math.max(0, dt);
}

/** Roll angle for a distance travelled (m) on a wheel of radius r: forward is negative about +X for a -Z-facing body. */
export const wheelRoll = (distance: number, radius: number): number => -(distance / Math.max(0.05, radius)) % (Math.PI * 2);

/** Instance transforms of one vehicle's wheels. */
export function vehicleWheels(layout: IdolWheelLayout, pose: CarBodyPose, distance: number, steer: number): AuraTransformSpec[] {
  const spin = wheelRoll(distance, layout.radius);
  return layout.hubs.map((hub, i) => wheelInstanceTransform(pose, hub, layout.radius, layout.width, spin, layout.steer.includes(i) ? steer : 0));
}
