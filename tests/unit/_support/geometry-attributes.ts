/**
 * Test-only reader for `AuraCustomGeometrySpec` vertex attributes. The type allows flat number arrays, typed arrays or
 * per-vertex tuple lists; the sculpt kernels pack flat typed arrays, so tests read them as flat numbers and a
 * tuple-list attribute fails loudly instead of silently comparing tuples.
 */
import type { AuraCustomGeometrySpec } from "@aura3d/engine";

export type GeometryAttribute =
  | AuraCustomGeometrySpec["positions"]
  | AuraCustomGeometrySpec["normals"]
  | AuraCustomGeometrySpec["uvs"]
  | AuraCustomGeometrySpec["colors"]
  | AuraCustomGeometrySpec["indices"];

export function flatNumbers(attr: GeometryAttribute, label: string): ArrayLike<number> {
  if (attr === undefined) throw new Error(`${label} is missing`);
  if (attr instanceof Float32Array || attr instanceof Uint16Array || attr instanceof Uint32Array) return attr;
  const values: readonly unknown[] = attr;
  if (values.every((v): v is number => typeof v === "number")) return values;
  throw new Error(`${label} must be a flat numeric attribute`);
}
