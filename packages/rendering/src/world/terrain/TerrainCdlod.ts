/**
 * PRD-10 T2.2 — CDLOD quadtree (Strugar 2009) over a height grid.
 *
 * Node layout: quadtree depth `levels`; depth 0 is the root covering the whole
 * footprint, leaves sit at depth `levels - 1`. `lod` = `levels - 1 - depth`
 * (0 = finest). Distance ranges `range_l = range_0 · 2^l` with
 * `range_0 = patchWorldSize · 1.5 · lodBias` (§6.1, targets ≤ 1.5 px geometry
 * error); the morph band is the last `morphRatio` of each range.
 */

import type { TerrainHeightGrid } from "./TerrainHeightTexture";

export interface TerrainTierLod {
  readonly patchSize: { readonly low: number; readonly medium: number; readonly high: number; readonly ultra: number };
  readonly levels: { readonly low: number; readonly medium: number; readonly high: number; readonly ultra: number };
  readonly layers: { readonly low: number; readonly medium: number; readonly high: number; readonly ultra: number };
}

/** §17 tier table. */
export const TERRAIN_TIER_LOD: TerrainTierLod = {
  patchSize: { low: 32, medium: 64, high: 64, ultra: 64 },
  levels: { low: 4, medium: 6, high: 6, ultra: 7 },
  layers: { low: 4, medium: 4, high: 8, ultra: 8 }
};

export interface CdlodNode {
  readonly level: number;            // lod index: 0 = finest (leaf), levels-1 = root
  readonly origin: readonly [number, number];  // world-space min corner
  readonly size: number;             // world span (square)
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly children: readonly CdlodNode[];
}

export interface CdlodTree {
  readonly root: CdlodNode;
  readonly levels: number;
  readonly leafSize: number;
  readonly all: readonly CdlodNode[];
}

export interface CdlodRange {
  readonly lod: number;
  readonly morphStart: number;
  readonly morphEnd: number;
}

export interface CdlodSelectionOptions {
  readonly morphRatio?: number;      // default 0.33 of the range is the morph band
  readonly lodBias?: number;         // C-27 scale, default 1
  readonly frustumPlanes?: readonly (readonly [number, number, number, number])[]; // (nx,ny,nz,d)
}

/** Per-LOD morph ranges (§8.1 `u_morph`): {start,end} in metres. */
export function cdlodRanges(
  levels: number,
  patchWorldSize: number,
  lodBias = 1,
  morphRatio = 0.33
): readonly CdlodRange[] {
  const range0 = patchWorldSize * 1.5 * lodBias;
  const out: CdlodRange[] = [];
  for (let lod = 0; lod < levels; lod += 1) {
    const morphEnd = range0 * 2 ** lod;
    out.push({ lod, morphStart: morphEnd * (1 - morphRatio), morphEnd });
  }
  return out;
}

/** Build the quadtree + per-node min/max height (subsampled interior nodes). */
export function buildCdlodTree(
  grid: TerrainHeightGrid,
  worldSize: readonly [number, number],
  worldOrigin: readonly [number, number],
  levels: number
): CdlodTree {
  const size = Math.min(worldSize[0], worldSize[1]);
  const leafSize = size / 2 ** (levels - 1);
  const all: CdlodNode[] = [];

  function heightRange(minU: number, minV: number, uvSpan: number): readonly [number, number] {
    // Sampled min/max over the node's uv span (clamped to grid).
    const c0 = Math.max(0, Math.floor(minU * (grid.columns - 1)));
    const c1 = Math.min(grid.columns - 1, Math.ceil((minU + uvSpan) * (grid.columns - 1)));
    const r0 = Math.max(0, Math.floor(minV * (grid.rows - 1)));
    const r1 = Math.min(grid.rows - 1, Math.ceil((minV + uvSpan) * (grid.rows - 1)));
    let lo = Infinity;
    let hi = -Infinity;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const h = grid.heights[r * grid.columns + c]!;
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 0;
    }
    return [lo, hi];
  }

  function build(origin: readonly [number, number], nodeSize: number, depth: number): CdlodNode {
    const lod = levels - 1 - depth;
    const [minHeight, maxHeight] = heightRange(
      (origin[0] - worldOrigin[0]) / worldSize[0],
      (origin[1] - worldOrigin[1]) / worldSize[1],
      nodeSize / size
    );
    const children: CdlodNode[] = [];
    if (depth < levels - 1) {
      const half = nodeSize / 2;
      children.push(
        build(origin, half, depth + 1),
        build([origin[0] + half, origin[1]], half, depth + 1),
        build([origin[0], origin[1] + half], half, depth + 1),
        build([origin[0] + half, origin[1] + half], half, depth + 1)
      );
    }
    const node: CdlodNode = { level: lod, origin, size: nodeSize, minHeight, maxHeight, children };
    all.push(node);
    return node;
  }

  const root = build(worldOrigin, size, 0);
  return { root, levels, leafSize, all };
}

function aabbDistance(node: CdlodNode, p: readonly [number, number, number]): number {
  const dx = Math.max(node.origin[0] - p[0], 0, p[0] - (node.origin[0] + node.size));
  const dz = Math.max(node.origin[1] - p[2], 0, p[2] - (node.origin[1] + node.size));
  const dy = Math.max(node.minHeight - p[1], 0, p[1] - node.maxHeight);
  return Math.hypot(dx, dy, dz);
}

function aabbInFrustum(node: CdlodNode, planes: readonly (readonly [number, number, number, number])[]): boolean {
  // Positive-vertex AABB test.
  for (const [nx, ny, nz, d] of planes) {
    const x = nx >= 0 ? node.origin[0] + node.size : node.origin[0];
    const z = nz >= 0 ? node.origin[1] + node.size : node.origin[1];
    const y = ny >= 0 ? node.maxHeight : node.minHeight;
    if (nx * x + ny * y + nz * z + d < 0) return false;
  }
  return true;
}

/**
 * Select the CDLOD node set for a camera position: descend while the camera is
 * inside the finer level's range; emit the node otherwise. Returns the drawn
 * nodes (one instanced patch draw per node at its `level`).
 */
export function selectCdlodNodes(
  tree: CdlodTree,
  cameraPosition: readonly [number, number, number],
  ranges: readonly CdlodRange[],
  options: CdlodSelectionOptions = {}
): readonly CdlodNode[] {
  const out: CdlodNode[] = [];
  const visit = (node: CdlodNode) => {
    if (options.frustumPlanes && !aabbInFrustum(node, options.frustumPlanes)) return;
    const dist = aabbDistance(node, cameraPosition);
    const lod = node.level;
    if (lod === 0) {
      out.push(node);
      return;
    }
    // Descend into children when the camera is closer than the finer level's
    // morph end (range_{lod-1}); this node covers the annulus otherwise.
    if (dist <= ranges[lod - 1]!.morphEnd) {
      for (const child of node.children) visit(child);
    } else {
      out.push(node);
    }
  };
  visit(tree.root);
  return out;
}
