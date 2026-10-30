/**
 * Terrain-conformed mesh builders for the course surfaces (rough heightfield, fairway ribbons, green and bunker discs).
 * Pure: no engine, no DOM, so unit tests can read the geometry.
 *
 * GU47 LINKS-05: `uv: "metres"` writes uv0 in world metres so every tiled turf, sand, basalt and regolith texture keeps
 * one texel density across a hole (the texture handle's repeat is 1 / tile metres):
 * - heightfield and discs: uv = (x, z) in world metres;
 * - ribbons: u = metres travelled along the path, v = metres across it (so a mow stripe banded in u crosses the line of
 *   play, the 4.6.2 longitudinal stripes rotated 90 degrees).
 * `uv: "legacy"` (the default, `?look=original`) keeps the 4.6.2 coordinates byte for byte.
 */
import type { HoleTerrain, Vec2 } from "./types";

export type SurfaceUvMode = "legacy" | "metres";

export interface CustomGeometrySpec {
  readonly kind: "aura-custom-geometry";
  readonly positions: [number, number, number][];
  readonly normals: [number, number, number][];
  readonly uvs: [number, number][];
  readonly indices: number[];
}

type TerrainSurface = Pick<HoleTerrain, "bounds" | "height" | "slope">;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function surfaceNormal(terrain: TerrainSurface, x: number, z: number): [number, number, number] {
  const [sx, sz] = terrain.slope(x, z);
  const inv = 1 / Math.hypot(sx, 1, sz);
  return [-sx * inv, inv, -sz * inv];
}

export function terrainToMeshSpec(terrain: TerrainSurface, cols: number, rows: number, lift: number, uv: SurfaceUvMode = "legacy"): CustomGeometrySpec {
  const { minX, maxX, minZ, maxZ } = terrain.bounds;
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + (maxX - minX) * (c / (cols - 1));
      const z = minZ + (maxZ - minZ) * (r / (rows - 1));
      const y = terrain.height(x, z) + lift;
      positions.push([x, y, z]);
      normals.push(surfaceNormal(terrain, x, z));
      uvs.push(uv === "metres" ? [x, z] : [x / 18, z / 18]);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      // CCW winding when viewed from +Y so gl_FrontFacing is true and sun lighting hits the top surface
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices };
}

/** Multi-column ribbon strip conformed to terrain along the hole's intended line. */
export function ribbonAlongPath(
  terrain: TerrainSurface,
  path: readonly Vec2[],
  halfWidth: number,
  lift: number,
  step = 2.5,
  cols = 9,
  uv: SurfaceUvMode = "legacy"
): CustomGeometrySpec {
  // Resample the polyline at fixed spacing with lateral offsets; `s` is the metres travelled along the path
  const pts: { x: number; z: number; dx: number; dz: number; s: number }[] = [];
  let travelled = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const segLen = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(segLen / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      pts.push({ x: lerp(ax, bx, t), z: lerp(az, bz, t), dx: (bx - ax) / segLen, dz: (bz - az) / segLen, s: travelled + segLen * t });
    }
    travelled += segLen;
  }
  const last = path[path.length - 1]!;
  const prev = path[path.length - 2]!;
  const lastLen = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
  pts.push({ x: last[0], z: last[1], dx: (last[0] - prev[0]) / lastLen, dz: (last[1] - prev[1]) / lastLen, s: travelled });

  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  // Subdivide laterally across [-1, 1] so the ribbon follows the +0.15m fairway crown and tee pad without rough poke-through
  pts.forEach((p, i) => {
    const endDist = pts.length - 1 - i;
    const taper = endDist < 4 ? clamp(endDist / 4, 0.78, 1) : 1;
    const hw = halfWidth * taper;
    const px = -p.dz, pz = p.dx; // lateral normal
    for (let c = 0; c < cols; c++) {
      const side = (c / (cols - 1)) * 2 - 1;
      const x = p.x + px * hw * side;
      const z = p.z + pz * hw * side;
      positions.push([x, terrain.height(x, z) + lift, z]);
      normals.push(surfaceNormal(terrain, x, z));
      uvs.push(uv === "metres" ? [p.s, hw * side] : [i * step / 10, side * 0.5 + 0.5]);
    }
    if (i > 0) {
      const row0 = (i - 1) * cols;
      const row1 = i * cols;
      for (let c = 0; c < cols - 1; c++) {
        const a = row0 + c;
        // CCW winding when viewed from +Y
        indices.push(a, row1 + c, a + 1, a + 1, row1 + c, row1 + c + 1);
      }
    }
  });
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices };
}

/** Multi-ring disc conformed to terrain (green, fringe ring, and sand bunkers). */
export function discOnTerrain(
  terrain: TerrainSurface,
  cx: number,
  cz: number,
  radius: number,
  lift: number,
  segs = 32,
  innerRadius = 0,
  uv: SurfaceUvMode = "legacy"
): CustomGeometrySpec {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const rings = innerRadius > 0 ? [innerRadius, radius] : [0, radius * 0.35, radius * 0.7, radius];
  for (const r of rings) {
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      positions.push([x, terrain.height(x, z) + lift, z]);
      normals.push(surfaceNormal(terrain, x, z));
      uvs.push(uv === "metres" ? [x, z] : [0.5 + Math.cos(a) * r / (radius * 2), 0.5 + Math.sin(a) * r / (radius * 2)]);
    }
  }
  const stride = segs + 1;
  for (let ri = 0; ri < rings.length - 1; ri++) {
    const baseA = ri * stride;
    const baseB = (ri + 1) * stride;
    for (let s = 0; s < segs; s++) {
      const a0 = baseA + s, a1 = baseA + s + 1, b0 = baseB + s, b1 = baseB + s + 1;
      // CCW winding when viewed from +Y
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices };
}
