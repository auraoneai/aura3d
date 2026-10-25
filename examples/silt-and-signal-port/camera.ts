import { createCameraClearance, type CameraClearance } from "@aura3d/engine/game";
import { pushOut } from "./collide";
import type { Sim } from "./sim";

/** How far the chase eye keeps from a collider (metres): the near plane is 0.3, so 1.2 leaves the lens clear of the wall. */
export const CAMERA_MARGIN = 1.2;
/** The eye never settles closer than this to the rider unless the rider itself is hemmed in. */
export const CAMERA_MIN_DISTANCE = 2.5;

type Eye = [number, number, number];

/** The chase eye the camera wants: behind the rider along the heading, above the board, further back at speed. */
export function wantedChaseEye(sim: Pick<Sim, "state" | "flight">): Eye {
  const { state, flight } = sim;
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const back = 13 + Math.min(8, Math.abs(flight.speed) * 0.08);
  return [state.x - fx * back, state.y + 5.2 + Math.abs(flight.vertical) * 0.05, state.z - fz * back];
}

/** True when a point is inside scenery (a chapter collider with margin) or under the terrain. */
export function chaseEyeBlocked(world: Pick<Sim["world"], "colliders" | "floor">): (x: number, y: number, z: number) => boolean {
  const { colliders, floor } = world;
  return (x, y, z) => y < floor(x, z, y) + 1 || (colliders !== undefined && colliders.some((c) => pushOut({ x, y, z }, c, CAMERA_MARGIN, 0.6) !== null));
}

export function createChaseClearance(): CameraClearance {
  return createCameraClearance({ pullRate: 18, releaseRate: 1.6 });
}

/** The eye the camera should use this frame: the wanted chase eye, pulled in toward the rider before it reaches scenery. */
export function clearChaseEye(sim: Pick<Sim, "state" | "flight" | "world">, clearance: CameraClearance, dt: number): Eye {
  return clearance.update(dt, {
    focus: [sim.state.x, sim.state.y + 2.2, sim.state.z],
    eye: wantedChaseEye(sim),
    minDistance: CAMERA_MIN_DISTANCE,
    blocked: chaseEyeBlocked(sim.world)
  });
}
