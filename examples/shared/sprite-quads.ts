/**
 * Point sprites as quads for a requested lab backend (`?backend=webgpu|auto`): WebGPU has no point size (a point list
 * rasterises one pixel), so ports that draw `gl_PointSize` sprites can draw each point as four corners sharing its position
 * with `uv` as the corner. The corner/array helpers are Ion Circuit's (heatsink-port/point-quads.ts).
 */
import { expandToCorners, pointQuadArrays, quadUpdater } from "../heatsink-port/point-quads";

export { quadUpdater };

export type SpriteAttribute = { itemSize: 1 | 2 | 3 | 4; data: Float32Array };

/** `geometry.dynamic` arrays for `positions` drawn as quads: corner positions and uvs, two triangles each, attributes per corner. */
export function quadGeometryInput(positions: Float32Array, attributes: Readonly<Record<string, SpriteAttribute>>): {
  positions: Float32Array; uvs: Float32Array; indices: Uint32Array; attributes: Record<string, SpriteAttribute>;
} {
  const n = Math.floor(positions.length / 3);
  const q = pointQuadArrays(n);
  expandToCorners(positions, 3, q.positions);
  const corners: Record<string, SpriteAttribute> = {};
  for (const [name, a] of Object.entries(attributes)) corners[name] = { itemSize: a.itemSize, data: expandToCorners(a.data, a.itemSize, new Float32Array(a.data.length * 4)) };
  return { positions: q.positions, uvs: q.uvs, indices: q.indices, attributes: corners };
}
