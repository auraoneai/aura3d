import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

export type ProceduralVec2 = readonly [number, number];
export type ProceduralVec3 = readonly [number, number, number];
export type ProceduralColor = readonly [number, number, number, number];
export type ProceduralGeometry = AuraCustomGeometrySpec;

/** Plain-array buffers every helper fills before they are wrapped into a custom geometry spec. */
export interface GeometryBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export function newBuffers(): GeometryBuffers {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`procedural: ${name} must be a finite number`);
}

export function assertInt(value: number, name: string, min: number): void {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`procedural: ${name} must be an integer >= ${min}`);
}
