// Bake many static meshes into one geometry (one draw call per material). Unlike `geometry.merge`, each part
// carries its own transform and an optional vertex tint, so a village of houses, lamps and props sharing one
// material becomes a single `AuraCustomGeometrySpec` ready for `primitives.custom` / `geometry.define`.
import { colorToRgba } from "../colorUtils.js";
import { mergeAuraGeometries, normalizeGeometryAttributes, type AuraCustomGeometrySpec } from "../RootGeometry.js";
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
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const x = n.positions[i * 3]! * sc[0], y = n.positions[i * 3 + 1]! * sc[1], z = n.positions[i * 3 + 2]! * sc[2];
    positions[i * 3] = m[0]! * x + m[1]! * y + m[2]! * z + p[0];
    positions[i * 3 + 1] = m[3]! * x + m[4]! * y + m[5]! * z + p[1];
    positions[i * 3 + 2] = m[6]! * x + m[7]! * y + m[8]! * z + p[2];
  }
  let normals: Float32Array | undefined;
  if (n.normals) {
    normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      // Inverse-transpose of R * S is R * S^-1, so non-uniform scale keeps normals perpendicular.
      const x = n.normals[i * 3]! / sc[0], y = n.normals[i * 3 + 1]! / sc[1], z = n.normals[i * 3 + 2]! / sc[2];
      const nx = m[0]! * x + m[1]! * y + m[2]! * z, ny = m[3]! * x + m[4]! * y + m[5]! * z, nz = m[6]! * x + m[7]! * y + m[8]! * z;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len; normals[i * 3 + 1] = ny / len; normals[i * 3 + 2] = nz / len;
    }
  }
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
  const uvs = n.uvs ? Float32Array.from(n.uvs) : undefined;
  if (mirrored) {
    // A mirrored transform flips triangle winding; swap two corners per triangle so faces stay front-facing.
    if (indices) {
      for (let i = 0; i + 2 < indices.length; i += 3) { const t = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = t; }
    } else {
      const swap = (a: Float32Array | undefined, size: number): void => {
        if (!a) return;
        for (let t = 0; t + 2 < count; t += 3) for (let c = 0; c < size; c += 1) {
          const u = a[(t + 1) * size + c]!; a[(t + 1) * size + c] = a[(t + 2) * size + c]!; a[(t + 2) * size + c] = u;
        }
      };
      swap(positions, 3); swap(normals, 3); swap(uvs, 2); swap(colors, 4);
    }
  }
  return {
    kind: "aura-custom-geometry",
    positions,
    ...(normals ? { normals } : {}),
    ...(uvs ? { uvs } : {}),
    ...(colors ? { colors } : {}),
    ...(indices ? { indices } : { indices: [] }),
    ...(part.geometry.attributes ? { attributes: part.geometry.attributes } : {})
  };
}

/**
 * Merge parts into one geometry. Returns `undefined` for an empty list (nothing to draw), so callers can
 * skip the node instead of branching on a throw. If any part has vertex colours or a tint, every part gets
 * colours (missing ones are white) so the merged geometry keeps them; UVs and normals survive only when
 * every part has them (same rule as `geometry.merge`).
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
