/**
 * GU47 WP-21 BZ-17: the blueprint minimap. A civil-defence floor plan: cyan-white wall outlines on blueprint blue with
 * a faint cell grid, doors in hazard yellow, the exit and the player in the floor's lamp colour. Pure geometry here (the
 * wall edges between solid and open cells); main.ts draws it on the 2D canvas. Reads sim state only (PRD D8).
 */
export const BLUEPRINT = {
  paper: "rgba(10,34,66,0.9)",
  grid: "rgba(150,200,255,0.10)",
  wall: "#d8ecff",
  wallFill: "rgba(150,200,255,0.16)",
  door: "#e8b400",
  key: "#ffb648",
  /** Pixels per cell; the canvas is drawn at this size and scaled by CSS, so lines stay crisp. */
  px: 12
} as const;

export type Segment = readonly [number, number, number, number];

/** Wall cells: the solid set the sim uses for the map ('#', ' ', '%', 'P' read as wall on the plan). */
const isWallCell = (ch: string | undefined): boolean => ch === undefined || ch === "#" || ch === " " || ch === "%" || ch === "P";

/**
 * Grid-unit segments along every edge between a wall cell and an open cell (x0, z0, x1, z1), horizontal runs merged so
 * a long corridor wall is one stroke.
 */
export function blueprintEdges(grid: ArrayLike<string>, w: number, h: number): Segment[] {
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= w || z >= h ? undefined : grid[z * w + x]);
  const out: Segment[] = [];
  // horizontal edges: line z between rows z-1 and z
  for (let z = 0; z <= h; z++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && isWallCell(at(x, z - 1)) !== isWallCell(at(x, z));
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) { out.push([start, z, x, z]); start = -1; }
    }
  }
  // vertical edges: line x between columns x-1 and x
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let z = 0; z <= h; z++) {
      const edge = z < h && isWallCell(at(x - 1, z)) !== isWallCell(at(x, z));
      if (edge && start < 0) start = z;
      if (!edge && start >= 0) { out.push([x, start, x, z]); start = -1; }
    }
  }
  return out;
}
