import { instances, material } from "@aura3d/engine";

/**
 * NC-A5 instanced greebles: pipes, handrails, and wall vents along the
 * corridor as exactly TWO instanced primitive pools with a two-level distance
 * LOD — density without draw-call cost. Pure set dressing: no physics bodies,
 * so nothing here can block the walk path or a fire lane.
 */

interface GreebleTransform {
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

const WALL_X = 3.26;
const PIPE_Y = 2.06;
/** Segment length along z; segments run from z 8.6 down to -8.4 on both walls. */
const PIPE_SEGMENT = 2.05;
const PIPE_COUNT_PER_WALL = 9;

function pipeTransforms(): GreebleTransform[] {
  const out: GreebleTransform[] = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < PIPE_COUNT_PER_WALL; index += 1) {
      const z = 8.6 - index * PIPE_SEGMENT - PIPE_SEGMENT / 2;
      out.push({
        // Unit cylinder stands on Y; lie it down along Z with a quarter turn.
        position: [side * WALL_X, PIPE_Y + (index % 2) * 0.16, z],
        rotation: [Math.PI / 2, 0, 0],
        scale: [0.09, PIPE_SEGMENT * 0.96, 0.09]
      });
    }
  }
  return out;
}

function boxTransforms(): GreebleTransform[] {
  const out: GreebleTransform[] = [];
  // Low handrails near both walls, clear of the center walk lane.
  for (const side of [-1, 1]) {
    for (const z of [4.2, -1.8]) {
      out.push({
        position: [side * 2.95, 0.86, z],
        scale: [0.045, 0.045, 7.6]
      });
    }
  }
  // Wall vents alternating sides at head height, flush to the panels.
  const vents: readonly [number, number][] = [
    [-1, 6.4], [-1, 1.4], [-1, -3.6], [-1, -7.2],
    [1, 5.0], [1, 0.4], [1, -4.8], [1, -7.6]
  ];
  for (const [side, z] of vents) {
    out.push({
      position: [side * 3.34, 1.72, z],
      scale: [0.08, 0.42, 0.62]
    });
  }
  return out;
}

export const GREEBLE_POOL_COUNT = 2;
export const GREEBLE_PIPE_INSTANCES = pipeTransforms().length;
export const GREEBLE_BOX_INSTANCES = boxTransforms().length;

export function buildGreebleNodes() {
  // Match the corridor's readable steel value ladder. Far LODs remain darker
  // than near details for depth, but no longer collapse into the black shell.
  const pipeNear = material.pbr({ color: "#536975", roughness: 0.5, metalness: 0.58 });
  const pipeFar = material.pbr({ color: "#32434d", roughness: 0.7, metalness: 0.34 });
  const boxNear = material.pbr({ color: "#4b626d", roughness: 0.58, metalness: 0.44 });
  const boxFar = material.pbr({ color: "#2d3e47", roughness: 0.74, metalness: 0.28 });
  return [
    instances.cylinder({
      name: "greeble pipe pool",
      material: pipeNear,
      castShadow: false,
      receiveShadow: true,
      transforms: pipeTransforms(),
      lod: {
        levels: [
          { name: "pipes-near", maxDistance: 14, primitive: "cylinder", material: pipeNear },
          { name: "pipes-far", primitive: "cylinder", material: pipeFar }
        ],
        hysteresis: 1
      }
    }),
    instances.box({
      name: "greeble rail vent pool",
      material: boxNear,
      castShadow: false,
      receiveShadow: true,
      transforms: boxTransforms(),
      lod: {
        levels: [
          { name: "rails-near", maxDistance: 14, primitive: "box", material: boxNear },
          { name: "rails-far", primitive: "box", material: boxFar }
        ],
        hysteresis: 1
      }
    })
  ];
}
