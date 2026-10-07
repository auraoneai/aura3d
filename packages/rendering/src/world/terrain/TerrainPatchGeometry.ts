/**
 * PRD-10 T2.3 — shared CDLOD patch geometry: one `(N+1)²`-vertex grid in
 * patch-local [0,1]² (`a_grid`), drawn once per selected node via
 * instanced-by-attribute `a_node` records. `N` comes from the §17 tier table
 * (`TERRAIN_TIER_LOD.patchSize`).
 */

import { TERRAIN_TIER_LOD, type TerrainTierLod } from "./TerrainCdlod";

export type AuraTerrainTier = keyof TerrainTierLod["patchSize"];

export interface TerrainPatchGeometry {
  /** `(N+1)² × 2` patch-local uv pairs for attribute `a_grid`. */
  readonly vertices: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly n: number;
  readonly vertexCount: number;
}

export function terrainPatchSizeForTier(tier: AuraTerrainTier): number {
  return TERRAIN_TIER_LOD.patchSize[tier];
}

export function createTerrainPatchGeometry(n: number): TerrainPatchGeometry {
  const verts = (n + 1) * (n + 1);
  const vertices = new Float32Array(verts * 2);
  let o = 0;
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) {
      vertices[o++] = i / n;
      vertices[o++] = j / n;
    }
  }
  const quads = n * n * 6;
  const indices = verts <= 65535 ? new Uint16Array(quads) : new Uint32Array(quads);
  let k = 0;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return { vertices, indices, n, vertexCount: verts };
}
