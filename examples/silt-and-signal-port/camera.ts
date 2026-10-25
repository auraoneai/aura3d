import { createCameraClearance, type CameraClearance } from "@aura3d/engine/game";
import { pushOut } from "./collide";
import type { Sim } from "./sim";
import type { Column, Placement } from "./terrain";

/** How far the chase eye keeps from a collider (metres). The rider itself flies 1.85 m off the walls (`flightStep` radius), so an eye directly behind it can always keep 1.8 m; more is not always reachable. */
export const CAMERA_MARGIN = 1.8;
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

/** Native sizes of the tree model (0.927 x 1.684 x 0.883) and the rock models (about 1 unit) scaled by the placement. */
const TREE_RADIUS = 0.46, TREE_HEIGHT = 1.684, ROCK_RADIUS = 0.5, ROCK_HEIGHT = 1;

/** Trees, rocks and piers have no sim collider, but a camera inside a crown or boulder fills the view with it: model them as columns. */
export function sceneryColumns(props: { readonly trees: readonly Placement[]; readonly rocks: readonly Placement[]; readonly stone: readonly Column[]; readonly brass: readonly Column[] }): Column[] {
  return [
    ...props.trees.map((t) => ({ x: t.x, z: t.z, r: TREE_RADIUS * t.scale, bottom: t.y, top: t.y + TREE_HEIGHT * t.scale })),
    ...props.rocks.map((r) => ({ x: r.x, z: r.z, r: ROCK_RADIUS * r.scale, bottom: r.y, top: r.y + ROCK_HEIGHT * r.scale })),
    ...props.stone,
    ...props.brass
  ];
}

/** True when a point is inside scenery (a chapter collider or a scenery column, with margin) or under the terrain. */
export function chaseEyeBlocked(world: Pick<Sim["world"], "colliders" | "floor">, scenery: readonly Column[] = []): (x: number, y: number, z: number) => boolean {
  const { colliders, floor } = world;
  return (x, y, z) => {
    if (y < floor(x, z, y) + 1) return true;
    if (colliders !== undefined && colliders.some((c) => pushOut({ x, y, z }, c, CAMERA_MARGIN, 0.6) !== null)) return true;
    for (const c of scenery) {
      if (y < c.bottom - 0.6 || y > c.top + 0.6) continue;
      const dx = x - c.x, dz = z - c.z, reach = c.r + CAMERA_MARGIN;
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  };
}

export function createChaseClearance(): CameraClearance {
  return createCameraClearance({ pullRate: 18, releaseRate: 1.6 });
}

/** The eye the camera should use this frame: the wanted chase eye, pulled in toward the rider before it reaches scenery. */
export function clearChaseEye(sim: Pick<Sim, "state" | "flight" | "world">, clearance: CameraClearance, dt: number, scenery: readonly Column[] = []): Eye {
  return clearance.update(dt, {
    focus: [sim.state.x, sim.state.y + 2.2, sim.state.z],
    eye: wantedChaseEye(sim),
    minDistance: CAMERA_MIN_DISTANCE,
    blocked: chaseEyeBlocked(sim.world, scenery)
  });
}
