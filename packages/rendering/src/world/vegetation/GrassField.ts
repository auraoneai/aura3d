/**
 * PRD-10 T3.7 §8.5 — `GrassField`: the camera-following ring of 8 m grass
 * chunks. Blades are generated entirely in the vertex stage (§8.5
 * `a3d_prd10_grass` — stratified jitter hash per `gl_InstanceID`, quadratic
 * Bézier blade, density falloff); this module only computes which chunk
 * origins + seeds draw this frame, and the shared blade index/vertex data.
 *
 * Tier rules (§7.1.5 grass options + §17):
 * - Medium+ draws 7-vertex blades; Low draws 2-triangle cards with the same
 *   placement hash.
 * - The chunk ring extends to `radius`; chunks whose centre is farther than
 *   `radius` from the camera are dropped before upload.
 */
export const GRASS_CHUNK_SIZE = 8;
export const GRASS_BLADE_VERTS = 7;   // quadratic Bézier strips: root L/R, mid L/R, tip L/R + tip
export const GRASS_CARD_VERTS = 4;

export interface GrassChunkDraw {
  /** world XZ of the chunk's min corner */
  readonly originX: number;
  readonly originZ: number;
  readonly size: number;
  readonly seed: number;
  readonly bladeCount: number;
}

/**
 * The chunk ring centred on `cameraXZ`: all GRASS_CHUNK_SIZE cells whose
 * centre falls within `radius`. Deterministic order (sorted by key) so draw
 * order and seeds are stable across frames.
 */
export function grassChunkRing(cameraXZ: readonly [number, number], radius: number, cellSize = GRASS_CHUNK_SIZE): readonly GrassChunkDraw[] {
  if (radius <= 0) return [];
  const cx0 = Math.floor((cameraXZ[0] - radius) / cellSize);
  const cx1 = Math.floor((cameraXZ[0] + radius) / cellSize);
  const cz0 = Math.floor((cameraXZ[1] - radius) / cellSize);
  const cz1 = Math.floor((cameraXZ[1] + radius) / cellSize);
  const out: GrassChunkDraw[] = [];
  for (let cz = cz0; cz <= cz1; cz += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const ox = cx * cellSize;
      const oz = cz * cellSize;
      const d = Math.hypot(ox + cellSize / 2 - cameraXZ[0], oz + cellSize / 2 - cameraXZ[1]);
      if (d > radius) continue;
      out.push({
        originX: ox,
        originZ: oz,
        size: cellSize,
        seed: (((cx * 73856093) ^ (cz * 19349663)) >>> 0) % 4096,
        bladeCount: Math.min(1024, Math.round(cellSize * cellSize)) // density applied by the caller via bladeCount scale
      });
    }
  }
  out.sort((a, b) => a.originZ - b.originZ || a.originX - b.originX);
  return out;
}

/**
 * Shared blade vertex buffer for the blades path (7 verts per blade, drawn
 * `TRIANGLE_STRIP` per instance — the VS maps `gl_VertexID` inside a blade):
 * per vertex: [t, side] pairs (t 0..1 root→tip; side −1/+1; final tip vertex
 * has side 0). Per-instance data comes from the chunk uniform + instance id,
 * not vertex attributes.
 */
export function grassBladeVertices(): Float32Array {
  // 7 verts: [t, side] = (0,-1),(0,1),(0.5,-1),(0.5,1),(0.8,-1),(0.8,1),(1,0 tip)
  return Float32Array.from([0, -1, 0, 1, 0.5, -1, 0.5, 1, 0.8, -1, 0.8, 1, 1, 0]);
}

/** Strip → triangles (device topologies are triangles/lines/points only). */
export function grassBladeIndices(): Uint16Array {
  return Uint16Array.from([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
}

/** 2-triangle card for Low tier (quad in [-1,1] x [0,1]). */
export function grassCardVertices(): Float32Array {
  return Float32Array.from([-1, 0, 1, 0, -1, 1, 1, 1]);
}
