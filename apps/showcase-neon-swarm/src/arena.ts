/**
 * Neon Swarm arena layout - street grid bounds, typed-prop obstacle placement,
 * and spawn edges.
 *
 * This module is intentionally pure data + math (no DOM, no engine import) so
 * the steering and determinism unit tests can import it directly. The route
 * renders these numbers with typed catalog assets (neonBarricadeProp,
 * neonStreetLampProp) plus root-safe instanced lane strips.
 */

export interface ArenaBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ArenaObstacle {
  readonly x: number;
  readonly z: number;
  /** Collision radius used by route-local steering (not a physics claim). */
  readonly radius: number;
  readonly kind: "barricade" | "lamp";
  readonly rotationY: number;
}

export type SpawnEdgeId = "north" | "south" | "east" | "west";

export interface SpawnEdge {
  /** Edge id, stable for evidence and tests. */
  readonly id: SpawnEdgeId;
}

export interface ArenaLayout {
  readonly bounds: ArenaBounds;
  readonly obstacles: readonly ArenaObstacle[];
  readonly lamps: readonly ArenaObstacle[];
  readonly spawnEdges: readonly SpawnEdge[];
}

export const NEON_ARENA_BOUNDS: ArenaBounds = {
  minX: -26,
  maxX: 26,
  minZ: -17,
  maxZ: 17
};

/** Playfield inset keeps actors off the visual curb line. */
export const ARENA_PLAY_INSET = 1.4;

/**
 * Deterministic obstacle layout: barricade clusters breaking sightlines plus
 * four corner lamps. Positions are hand-authored so seeded replays and
 * screenshots stay comparable run to run.
 */
const BARRICADE_PLACEMENTS: readonly ArenaObstacle[] = [
  { x: -11, z: -6, radius: 1.35, kind: "barricade", rotationY: 0 },
  { x: -9.2, z: -6.4, radius: 1.35, kind: "barricade", rotationY: Math.PI / 14 },
  { x: 10.5, z: 5.8, radius: 1.35, kind: "barricade", rotationY: Math.PI / 10 },
  { x: 12.3, z: 6.2, radius: 1.35, kind: "barricade", rotationY: -Math.PI / 12 },
  { x: -12, z: 7.5, radius: 1.35, kind: "barricade", rotationY: Math.PI / 6 },
  { x: 11, z: -7.5, radius: 1.35, kind: "barricade", rotationY: Math.PI / 5 },
  { x: 0, z: -11.5, radius: 1.35, kind: "barricade", rotationY: Math.PI / 2 },
  { x: 0.4, z: 11.5, radius: 1.35, kind: "barricade", rotationY: Math.PI / 2 }
];

const LAMP_PLACEMENTS: readonly ArenaObstacle[] = [
  { x: -22, z: -13, radius: 0.55, kind: "lamp", rotationY: Math.PI / 4 },
  { x: 22, z: -13, radius: 0.55, kind: "lamp", rotationY: -Math.PI / 4 },
  { x: -22, z: 13, radius: 0.55, kind: "lamp", rotationY: -Math.PI * 0.75 },
  { x: 22, z: 13, radius: 0.55, kind: "lamp", rotationY: Math.PI * 0.75 }
];

export function createArenaLayout(): ArenaLayout {
  return {
    bounds: NEON_ARENA_BOUNDS,
    obstacles: [...BARRICADE_PLACEMENTS],
    lamps: [...LAMP_PLACEMENTS],
    spawnEdges: [
      { id: "north" },
      { id: "south" },
      { id: "east" },
      { id: "west" }
    ]
  };
}

/** Clamped play rectangle actors steer inside. */
export function playRect(bounds: ArenaBounds): ArenaBounds {
  return {
    minX: bounds.minX + ARENA_PLAY_INSET,
    maxX: bounds.maxX - ARENA_PLAY_INSET,
    minZ: bounds.minZ + ARENA_PLAY_INSET,
    maxZ: bounds.maxZ - ARENA_PLAY_INSET
  };
}

/**
 * Deterministic spawn point on a named edge. Parameter t in [0, 1] slides along
 * the edge; the wave scheduler derives t from the seeded RNG so replays match.
 */
export function spawnPointOnEdge(edge: SpawnEdgeId, t: number): { readonly x: number; readonly z: number } {
  const rect = playRect(NEON_ARENA_BOUNDS);
  const clamped = Math.min(1, Math.max(0, t));
  switch (edge) {
    case "north":
      return { x: rect.minX + (rect.maxX - rect.minX) * clamped, z: rect.minZ };
    case "south":
      return { x: rect.minX + (rect.maxX - rect.minX) * clamped, z: rect.maxZ };
    case "west":
      return { x: rect.minX, z: rect.minZ + (rect.maxZ - rect.minZ) * clamped };
    case "east":
      return { x: rect.maxX, z: rect.minZ + (rect.maxZ - rect.minZ) * clamped };
  }
}
