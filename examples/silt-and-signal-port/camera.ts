import { createCameraClearance, type CameraClearance } from "@aura3d/engine/game";
import { pushOut } from "./collide";
import type { Sim } from "./sim";
import type { Column, Placement } from "./terrain";

/** How far the chase eye keeps from a collider (metres). The rider itself flies 1.85 m off the walls (`flightStep` radius), so an eye directly behind it can always keep 1.8 m; more is not always reachable. */
export const CAMERA_MARGIN = 1.8;
/** The eye never settles closer than this to the rider unless the rider itself is hemmed in. */
export const CAMERA_MIN_DISTANCE = 2.5;

type Eye = [number, number, number];

/** Chase framing: distance behind the rider, extra distance per unit of speed (capped) and height above the board. */
export interface ChaseFraming { readonly back: number; readonly perSpeed: number; readonly maxExtra: number; readonly height: number; readonly lookAhead: number; readonly lookLift: number; readonly side: number }
/** Today's chase (the original look). */
export const ORIGINAL_CHASE: ChaseFraming = { back: 13, perSpeed: 0.08, maxExtra: 8, height: 5.2, lookAhead: 14, lookLift: 1.2, side: 0 };
/**
 * GU47 phase 3 (inked look): a closer, lower chase so the rider fills about 12-18% of the frame height instead of a
 * 5% speck (rubric composition and camera; blind panel "the player is tiny"). `side` slides eye and target 1.6 m to the
 * right (over the shoulder) so the beacon column far ahead no longer stands exactly on the rider's head.
 */
export const INKED_CHASE: ChaseFraming = { back: 8.5, perSpeed: 0.06, maxExtra: 6, height: 3.4, lookAhead: 11, lookLift: 1.7, side: 1.6 };

/** The chase eye the camera wants: behind the rider along the heading, above the board, further back at speed. */
export function wantedChaseEye(sim: Pick<Sim, "state" | "flight">, framing: ChaseFraming = ORIGINAL_CHASE): Eye {
  const { state, flight } = sim;
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const back = framing.back + Math.min(framing.maxExtra, Math.abs(flight.speed) * framing.perSpeed);
  // right of the heading: (-fz, fx)
  return [state.x - fx * back - fz * framing.side, state.y + framing.height + Math.abs(flight.vertical) * 0.05, state.z - fz * back + fx * framing.side];
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
export function clearChaseEye(sim: Pick<Sim, "state" | "flight" | "world">, clearance: CameraClearance, dt: number, scenery: readonly Column[] = [], framing: ChaseFraming = ORIGINAL_CHASE): Eye {
  return clearance.update(dt, {
    focus: [sim.state.x, sim.state.y + 2.2, sim.state.z],
    eye: wantedChaseEye(sim, framing),
    minDistance: CAMERA_MIN_DISTANCE,
    blocked: chaseEyeBlocked(sim.world, scenery)
  });
}

/** GU47 DG-C1: length of the per-chapter establishing rail (seconds) and of its blend into the chase pose. */
export const RAIL_SECONDS = 4;
export const RAIL_BLEND_SECONDS = 1;
/** Minimum clearance of a rail point above the ground under it (metres). */
export const RAIL_CLEARANCE = 12;

export interface RailPose { readonly position: Eye; readonly target: Eye }

/**
 * DG-C1: the establishing rail at `t` seconds (0..RAIL_SECONDS) for a rider at the chapter start: it starts high and
 * ahead of the rider looking back down the route, sweeps around and settles behind the board, then blends into `chase`
 * over the last second. Every point is lifted to RAIL_CLEARANCE above the ground and out of colliders, so no rail
 * point is inside scenery. Reads the sim only.
 */
export function railPose(sim: Pick<Sim, "state" | "world">, t: number, chase: RailPose, scenery: readonly Column[] = []): RailPose {
  const { state, world } = sim;
  const u = Math.max(0, Math.min(1, t / RAIL_SECONDS));
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
  const rx = -fz, rz = fx;
  const ease = u * u * (3 - 2 * u);
  const ahead = 70 * (1 - ease) - 18 * ease;
  const side = 42 * Math.sin(Math.PI * ease);
  const height = 34 * (1 - ease) + 8 * ease;
  let x = state.x + fx * ahead + rx * side, z = state.z + fz * ahead + rz * side;
  let y = Math.max(state.y + height, world.floor(x, z, state.y) + RAIL_CLEARANCE);
  const blocked = chaseEyeBlocked(world, scenery);
  for (let i = 0; i < 8 && blocked(x, y, z); i++) y += 6;
  if (blocked(x, y, z)) { x = chase.position[0]; y = chase.position[1]; z = chase.position[2]; }
  const target: Eye = [state.x + fx * 10, state.y + 1.5, state.z + fz * 10];
  const b = Math.max(0, Math.min(1, (t - (RAIL_SECONDS - RAIL_BLEND_SECONDS)) / RAIL_BLEND_SECONDS));
  const mix = (a: Eye, c: Eye): Eye => [a[0] + (c[0] - a[0]) * b, a[1] + (c[1] - a[1]) * b, a[2] + (c[2] - a[2]) * b];
  return { position: mix([x, y, z], chase.position), target: mix(target, chase.target) };
}

/** GU47 DG-C3: the finish orbit's length (seconds), radius, lift (metres) and field of view (deg). */
export const FINISH_ORBIT = { seconds: 3, radius: 21, lift: 4, fov: 30, sweepRad: Math.PI * 0.6 } as const;

/**
 * DG-C3: the finish orbit at `t` seconds: a slow 108 deg sweep around the rider at 21 m with a 30 deg lens (the rider is
 * about 20% of the frame height), lifted out of colliders like the rail. Reads the sim only.
 */
export function finishOrbitPose(sim: Pick<Sim, "state" | "world">, t: number, scenery: readonly Column[] = []): RailPose & { readonly fov: number } {
  const { state, world } = sim;
  const u = Math.max(0, Math.min(1, t / FINISH_ORBIT.seconds));
  const a = state.yaw + Math.PI * 0.75 + FINISH_ORBIT.sweepRad * u * u * (3 - 2 * u);
  const x = state.x + Math.sin(a) * FINISH_ORBIT.radius, z = state.z + Math.cos(a) * FINISH_ORBIT.radius;
  let y = Math.max(state.y + FINISH_ORBIT.lift, world.floor(x, z, state.y) + 3);
  const blocked = chaseEyeBlocked(world, scenery);
  for (let i = 0; i < 8 && blocked(x, y, z); i++) y += 4;
  return { position: [x, y, z], target: [state.x, state.y - 0.6, state.z], fov: FINISH_ORBIT.fov };
}
