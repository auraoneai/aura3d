import { finishGeometry, normalize3 } from "./finish.js";
import { normalizeGeometryAttributes } from "../RootGeometry.js";
import { assertFinite, newBuffers, type ProceduralColor, type ProceduralGeometry, type ProceduralVec3 } from "./types.js";

export interface ComposePart {
  readonly geometry: ProceduralGeometry;
  readonly position?: ProceduralVec3;
  /** Euler angles in radians, applied in three.js "XYZ" order. */
  readonly rotation?: ProceduralVec3;
  readonly scale?: number | ProceduralVec3;
  /** Flat RGBA written to every vertex of this part. Default: the part's own vertex colours (for example a nested composeGeometry), else white. */
  readonly color?: ProceduralColor;
}

/**
 * Merge several procedural parts into ONE geometry (one draw call) with a transform and a vertex colour per part.
 * Normals use the inverse-transpose, mirrored parts keep outward winding. Pair with a white `material.pbr` so the
 * vertex colours show. The result is a plain custom geometry spec.
 */
export function composeGeometry(parts: readonly ComposePart[]): ProceduralGeometry {
  if (parts.length === 0) throw new RangeError("procedural: composeGeometry needs at least one part");
  const b = newBuffers();
  const colors: number[] = [];
  for (const part of parts) {
    const g = normalizeGeometryAttributes(part.geometry);
    if (!g.normals || !g.uvs || !g.indices) throw new RangeError("procedural: composeGeometry parts need normals, uvs and indices (use the procedural builders)");
    const [px, py, pz] = part.position ?? [0, 0, 0];
    const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
    const s = part.scale === undefined ? [1, 1, 1] : typeof part.scale === "number" ? [part.scale, part.scale, part.scale] : part.scale;
    for (const v of [px, py, pz, rx, ry, rz, ...s]) assertFinite(v, "compose transform");
    // R = Rx * Ry * Rz (three.js XYZ).
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const r = [
      cy * cz, -cy * sz, sy,
      cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
      sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy
    ] as const;
    const det = s[0]! * s[1]! * s[2]!;
    if (det === 0) throw new RangeError("procedural: composeGeometry scale must be non-zero on every axis");
    const base = b.positions.length / 3;
    const count = g.vertexCount;
    for (let i = 0; i < count; i += 1) {
      const x = g.positions[i * 3]! * s[0]!, y = g.positions[i * 3 + 1]! * s[1]!, z = g.positions[i * 3 + 2]! * s[2]!;
      b.positions.push(r[0] * x + r[1] * y + r[2] * z + px, r[3] * x + r[4] * y + r[5] * z + py, r[6] * x + r[7] * y + r[8] * z + pz);
      const nx0 = g.normals[i * 3]! / s[0]!, ny0 = g.normals[i * 3 + 1]! / s[1]!, nz0 = g.normals[i * 3 + 2]! / s[2]!;
      const n = normalize3(r[0] * nx0 + r[1] * ny0 + r[2] * nz0, r[3] * nx0 + r[4] * ny0 + r[5] * nz0, r[6] * nx0 + r[7] * ny0 + r[8] * nz0);
      b.normals.push(n[0], n[1], n[2]);
      b.uvs.push(g.uvs[i * 2]!, g.uvs[i * 2 + 1]!);
      if (part.color) colors.push(...part.color);
      else if (g.colors) colors.push(g.colors[i * (g.colors.length / count)]!, g.colors[i * (g.colors.length / count) + 1]!, g.colors[i * (g.colors.length / count) + 2]!, g.colors.length === count * 4 ? g.colors[i * 4 + 3]! : 1);
      else colors.push(1, 1, 1, 1);
    }
    for (let i = 0; i < g.indices.length; i += 3) {
      const a = base + g.indices[i]!, c = base + g.indices[i + 1]!, d = base + g.indices[i + 2]!;
      if (det < 0) b.indices.push(a, d, c); else b.indices.push(a, c, d);
    }
  }
  return finishGeometry(b, { colors });
}
