// Bake many static meshes into one geometry (one draw call per material). Unlike `geometry.merge`, each part
// carries its own transform and an optional vertex tint, so a village of houses, lamps and props sharing one
// material becomes a single `AuraCustomGeometrySpec` ready for `primitives.custom` / `geometry.define`.
import { colorToRgba } from "../colorUtils.js";
import { applyAuraGeometryMatrix4, mergeAuraGeometries, normalizeGeometryAttributes, type AuraCustomGeometrySpec } from "../RootGeometry.js";
import type { AuraColor, AuraVec3 } from "./types.js";

export interface AuraStaticPart {
  readonly geometry: AuraCustomGeometrySpec;
  readonly position?: AuraVec3;
  /** Euler XYZ radians, composed like instance transforms (R = Rz * Ry * Rx, applied after scale). */
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  /** Vertex tint. `multiply` (default) scales existing vertex colours; `replace` overwrites them. */
  readonly color?: AuraColor | readonly [number, number, number, number?];
}

export interface AuraMergeStaticOptions {
  readonly colorMode?: "multiply" | "replace";
}

const rgbaOf = (color: NonNullable<AuraStaticPart["color"]>): readonly [number, number, number, number] =>
  typeof color === "string" ? colorToRgba(color) : [color[0], color[1], color[2], color[3] ?? 1];

function rotationMatrix(rotation: AuraVec3): readonly number[] {
  const cx = Math.cos(rotation[0]), sx = Math.sin(rotation[0]);
  const cy = Math.cos(rotation[1]), sy = Math.sin(rotation[1]);
  const cz = Math.cos(rotation[2]), sz = Math.sin(rotation[2]);
  // Same R = Rz * Ry * Rx as the packed instance matrices, so a merged part lands where an instance would.
  return [
    cy * cz, -cy * sz, sy,
    cz * sx * sy + cx * sz, cx * cz - sx * sy * sz, -cy * sx,
    sx * sz - cx * cz * sy, cx * sy * sz + cz * sx, cx * cy
  ];
}

function transformPart(part: AuraStaticPart, forceColors: boolean, mode: "multiply" | "replace"): AuraCustomGeometrySpec {
  const n = normalizeGeometryAttributes(part.geometry);
  const p = part.position ?? [0, 0, 0];
  const sc: AuraVec3 = part.scale === undefined ? [1, 1, 1] : typeof part.scale === "number" ? [part.scale, part.scale, part.scale] : part.scale;
  if (sc.some((v) => !Number.isFinite(v) || v === 0)) throw new Error("Aura3D mergeStatic scale components must be finite and non-zero.");
  const m = rotationMatrix(part.rotation ?? [0, 0, 0]);
  const count = n.vertexCount;
  // The shared affine operation preserves UVs, custom streams, groups and draw
  // metadata, applies the inverse transpose to normals, and transforms morph
  // deltas without translating them. Unsupported morph channels fail closed.
  const transformed = applyAuraGeometryMatrix4(part.geometry, [
    m[0]! * sc[0], m[3]! * sc[0], m[6]! * sc[0], 0,
    m[1]! * sc[1], m[4]! * sc[1], m[7]! * sc[1], 0,
    m[2]! * sc[2], m[5]! * sc[2], m[8]! * sc[2], 0,
    p[0], p[1], p[2], 1
  ]);
  let colors: Float32Array | undefined = n.colors ? Float32Array.from(n.colors) : undefined;
  if (part.color !== undefined || (forceColors && !colors)) {
    colors ??= new Float32Array(count * 4).fill(1);
    if (part.color !== undefined) {
      const tint = rgbaOf(part.color);
      for (let i = 0; i < count; i += 1) for (let c = 0; c < 4; c += 1) colors[i * 4 + c] = mode === "replace" ? tint[c]! : colors[i * 4 + c]! * tint[c]!;
    }
  }
  let indices: Uint16Array | Uint32Array | undefined = n.indices ? (n.indices instanceof Uint16Array ? Uint16Array.from(n.indices) : Uint32Array.from(n.indices)) : undefined;
  const mirrored = sc[0] * sc[1] * sc[2] < 0;
  if (mirrored && (part.geometry.topology ?? "triangles") === "triangles") {
    // Ranges beginning in the middle of a triangle have a different local
    // winding; one globally swapped index stream cannot preserve both views.
    const ranges = [...(part.geometry.groups ?? []), ...(part.geometry.drawRange ? [part.geometry.drawRange] : [])];
    if (ranges.some(({ start, count: rangeCount }) => start % 3 !== 0 || (rangeCount !== Infinity && rangeCount % 3 !== 0))) {
      throw new Error("AURA_GEOMETRY_INCOMPATIBLE: mirrored merge requires triangle-aligned groups and draw ranges.");
    }
    // A mirrored transform flips triangle winding; swap two corners per triangle so faces stay front-facing.
    // Indexing a previously non-indexed mesh preserves *every* per-vertex
    // stream (including custom, UV1 and morph data) in its original order.
    if (!indices) {
      indices = count > 65536 ? new Uint32Array(count) : new Uint16Array(count);
      for (let i = 0; i < count; i += 1) indices[i] = i;
    }
    for (let i = 0; i + 2 < indices.length; i += 3) { const t = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = t; }
  }
  return {
    ...transformed,
    ...(colors ? { colors } : {}),
    indices: indices ?? []
  };
}

/**
 * Merge parts into one geometry. Returns `undefined` for an empty list (nothing to draw), so callers can
 * skip the node instead of branching on a throw. If any part has vertex colours or a tint, every part gets
 * colours (missing ones are white) so the merged geometry keeps them. Other streams,
 * morphs and topology must be compatible across parts, or the merge rejects them.
 */
export function mergeStatic(parts: readonly AuraStaticPart[], options: AuraMergeStaticOptions = {}): AuraCustomGeometrySpec | undefined {
  if (parts.length === 0) return undefined;
  const mode = options.colorMode ?? "multiply";
  const forceColors = parts.some((part) => part.color !== undefined || part.geometry.colors !== undefined);
  return mergeAuraGeometries(parts.map((part) => transformPart(part, forceColors, mode)));
}

/** Group parts by a key (usually the material name) and merge each group: one geometry, hence one draw, per key. */
export function mergeStaticByKey<K extends string | number>(parts: ReadonlyArray<AuraStaticPart & { readonly key: K }>, options: AuraMergeStaticOptions = {}): Map<K, AuraCustomGeometrySpec> {
  const groups = new Map<K, AuraStaticPart[]>();
  for (const part of parts) {
    const bucket = groups.get(part.key);
    if (bucket) bucket.push(part); else groups.set(part.key, [part]);
  }
  const out = new Map<K, AuraCustomGeometrySpec>();
  for (const [key, group] of groups) {
    const merged = mergeStatic(group, options);
    if (merged) out.set(key, merged);
  }
  return out;
}
