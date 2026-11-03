/** Editable triangle geometry with bounded, reversible local-space brush strokes. */
export type SculptVec3 = readonly [number, number, number];
export interface SculptMeshInput {
  readonly positions: Float32Array | readonly number[];
  /** Empty or omitted indices mean a triangle list. */
  readonly indices?: Uint16Array | Uint32Array | readonly number[];
  /** Accepted for validation; normals are regenerated after every edit. */
  readonly normals?: Float32Array | readonly number[];
  readonly uvs?: Float32Array | readonly number[];
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
  readonly topology?: "triangles" | "lines" | "points";
  /** Explicitly rejected until these streams can be preserved through an edit. */
  readonly colors?: unknown;
  readonly attributes?: unknown;
  readonly morphTargets?: unknown;
  readonly drawRange?: unknown;
}
export interface SculptorOptions {
  /** Maximum distance a vertex can move from its initial position. */
  readonly maxDisplacement?: number;
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
}
export interface SculptBrush {
  readonly center: SculptVec3;
  readonly radius: number;
  /** Distance along the direction for a vertex at the brush center. Can be negative. */
  readonly strength: number;
  /** If omitted, each vertex moves along its current normal. */
  readonly direction?: SculptVec3;
  readonly falloff?: "linear" | "smooth";
}
/** Plain typed-array patch: save it in the caller's undo stack; `before`/`after` are local positions. */
export interface SculptEdit {
  readonly vertexCount: number;
  readonly indices: Uint32Array;
  readonly before: Float32Array;
  readonly after: Float32Array;
}
export interface SculptGeometry {
  readonly kind: "aura-custom-geometry";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly uvs?: Float32Array;
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex?: number }[];
  readonly bounds: { readonly min: SculptVec3; readonly max: SculptVec3 };
  readonly dynamic: true;
}

const HARD_MAX_VERTICES = 250_000;
const HARD_MAX_TRIANGLES = 500_000;
const COORDINATE_LIMIT = 1e12;

/**
 * Owns CPU copies, never the caller's buffers. `geometry()` returns a fresh
 * custom-geometry snapshot for `geometry.custom(...)` or `handle.setGeometry(...)`.
 * The caller owns any GPU resources compiled from a snapshot. Disposal releases
 * this editor's buffers and does not invalidate previously returned snapshots.
 */
export class Sculptor {
  private positions: Float32Array;
  private original: Float32Array;
  private normals: Float32Array;
  private indices: Uint32Array;
  private uvs?: Float32Array;
  private groups?: SculptMeshInput["groups"];
  private readonly maxDisplacement: number;
  private disposed = false;

  constructor(input: SculptMeshInput, options: SculptorOptions = {}) {
    const maxVertices = budget(options.maxVertices ?? HARD_MAX_VERTICES, HARD_MAX_VERTICES, "maxVertices");
    const maxTriangles = budget(options.maxTriangles ?? HARD_MAX_TRIANGLES, HARD_MAX_TRIANGLES, "maxTriangles");
    this.maxDisplacement = positive(options.maxDisplacement ?? 1, "maxDisplacement");
    if (this.maxDisplacement > COORDINATE_LIMIT) throw new RangeError("maxDisplacement exceeds the supported coordinate limit");
    if (!input || !input.positions || input.positions.length < 9 || input.positions.length % 3 !== 0) throw new Error("Sculptor positions must contain at least one complete triangle");
    if (input.topology !== undefined && input.topology !== "triangles") throw new Error("Sculptor supports triangle topology only");
    for (const key of ["colors", "attributes", "morphTargets", "drawRange"] as const) {
      if (input[key] !== undefined) throw new Error(`Sculptor does not support ${key}; remove it explicitly before editing`);
    }
    const count = input.positions.length / 3;
    if (count > maxVertices) throw new RangeError("Sculptor vertex budget exceeded");
    this.positions = finiteArray(input.positions, "positions");
    if (input.normals !== undefined) {
      if (input.normals.length !== this.positions.length) throw new Error("Sculptor normals must contain one vec3 per vertex");
      finiteArray(input.normals, "normals");
    }
    this.original = this.positions.slice();
    const indexCount = input.indices?.length || count;
    if (indexCount % 3 !== 0 || indexCount / 3 > maxTriangles) throw new RangeError("Sculptor requires complete triangles within the triangle budget");
    const rawIndices = input.indices?.length ? Array.from(input.indices) : Array.from({ length: count }, (_, i) => i);
    if (rawIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= count)) throw new RangeError("Sculptor index is outside the vertex array");
    this.indices = Uint32Array.from(rawIndices);
    if (input.uvs !== undefined) {
      if (input.uvs.length !== count * 2) throw new Error("Sculptor UVs must contain one pair per vertex");
      this.uvs = finiteArray(input.uvs, "uvs");
    }
    this.groups = input.groups?.map((group) => {
      if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count < 0 || group.start + group.count > this.indices.length || group.start % 3 !== 0 || group.count % 3 !== 0 || (group.materialIndex !== undefined && (!Number.isInteger(group.materialIndex) || group.materialIndex < 0))) {
        throw new RangeError("Sculptor groups must describe complete triangles within the index array");
      }
      return { ...group };
    });
    this.normals = calculateNormals(this.positions, this.indices);
  }

  geometry(): SculptGeometry {
    this.assertAlive();
    return {
      kind: "aura-custom-geometry", positions: this.positions.slice(), normals: this.normals.slice(), indices: this.indices.slice(),
      ...(this.uvs ? { uvs: this.uvs.slice() } : {}), ...(this.groups ? { groups: this.groups.map((group) => ({ ...group })) } : {}),
      bounds: bounds(this.positions), dynamic: true
    };
  }

  applyBrush(brush: SculptBrush): SculptEdit {
    this.assertAlive();
    vector(brush.center, "brush center");
    positive(brush.radius, "brush radius");
    if (!Number.isFinite(brush.strength) || Math.abs(brush.strength) > COORDINATE_LIMIT) throw new RangeError("brush strength must be finite and within the coordinate limit");
    if (brush.falloff !== undefined && brush.falloff !== "linear" && brush.falloff !== "smooth") throw new Error("Unsupported brush falloff");
    const direction = brush.direction === undefined ? undefined : normalized(brush.direction, "brush direction");
    const changed: number[] = [], before: number[] = [], after: number[] = [];
    for (let i = 0; i < this.positions.length; i += 3) {
      const x = this.positions[i]!, y = this.positions[i + 1]!, z = this.positions[i + 2]!;
      const distance = Math.hypot(x - brush.center[0], y - brush.center[1], z - brush.center[2]);
      if (distance >= brush.radius) continue;
      const t = 1 - distance / brush.radius;
      const weight = brush.falloff === "linear" ? t : t * t * (3 - 2 * t);
      const d = direction ?? [this.normals[i]!, this.normals[i + 1]!, this.normals[i + 2]!] as const;
      const p = [x + d[0] * brush.strength * weight, y + d[1] * brush.strength * weight, z + d[2] * brush.strength * weight];
      const delta = [p[0]! - this.original[i]!, p[1]! - this.original[i + 1]!, p[2]! - this.original[i + 2]!];
      const length = Math.hypot(...delta);
      const scale = length > this.maxDisplacement ? this.maxDisplacement / length : 1;
      const next = [this.original[i]! + delta[0]! * scale, this.original[i + 1]! + delta[1]! * scale, this.original[i + 2]! + delta[2]! * scale].map(Math.fround);
      if (next.some((value) => !Number.isFinite(value) || Math.abs(value) > COORDINATE_LIMIT)) throw new RangeError("Sculpt stroke exceeds the supported coordinate limit");
      if (next[0] === x && next[1] === y && next[2] === z) continue;
      changed.push(i / 3); before.push(x, y, z); after.push(...next);
    }
    const edit = { vertexCount: this.positions.length / 3, indices: Uint32Array.from(changed), before: Float32Array.from(before), after: Float32Array.from(after) };
    this.applyEdit(edit, "redo");
    return edit;
  }

  /** Apply an earlier patch in either direction; malformed patches fail before any mutation. */
  applyEdit(edit: SculptEdit, direction: "undo" | "redo"): void {
    this.assertAlive();
    if (direction !== "undo" && direction !== "redo") throw new Error("Sculpt edit direction must be undo or redo");
    if (edit.vertexCount !== this.positions.length / 3 || edit.before.length !== edit.indices.length * 3 || edit.after.length !== edit.indices.length * 3) throw new Error("Sculpt edit does not match this geometry");
    const seen = new Set<number>();
    const expected = direction === "undo" ? edit.after : edit.before;
    for (let k = 0; k < edit.indices.length; k += 1) {
      const index = edit.indices[k]!;
      if (index >= edit.vertexCount || seen.has(index)) throw new RangeError("Sculpt edit contains an invalid or duplicate vertex");
      seen.add(index);
      for (let axis = 0; axis < 3; axis += 1) {
        const before = edit.before[k * 3 + axis]!, after = edit.after[k * 3 + axis]!;
        if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(before) > COORDINATE_LIMIT || Math.abs(after) > COORDINATE_LIMIT) throw new RangeError("Sculpt edit contains an invalid coordinate");
        if (this.positions[index * 3 + axis] !== expected[k * 3 + axis]) throw new Error("Sculpt edit conflicts with the current geometry; apply edits in undo/redo order");
      }
      for (const values of [edit.before, edit.after]) {
        if (Math.hypot(values[k * 3]! - this.original[index * 3]!, values[k * 3 + 1]! - this.original[index * 3 + 1]!, values[k * 3 + 2]! - this.original[index * 3 + 2]!) > this.maxDisplacement + 1e-5 * Math.max(1, this.maxDisplacement)) throw new RangeError("Sculpt edit exceeds maxDisplacement");
      }
    }
    const values = direction === "undo" ? edit.before : edit.after;
    for (let k = 0; k < edit.indices.length; k += 1) this.positions.set(values.subarray(k * 3, k * 3 + 3), edit.indices[k]! * 3);
    if (edit.indices.length) this.normals = calculateNormals(this.positions, this.indices);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Previously returned snapshots and edits are independently owned by the caller.
    this.positions = new Float32Array(0);
    this.original = new Float32Array(0);
    this.normals = new Float32Array(0);
    this.indices = new Uint32Array(0);
    this.uvs = undefined;
    this.groups = undefined;
  }
  private assertAlive(): void { if (this.disposed) throw new Error("Sculptor is disposed"); }
}

function calculateNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  // Accumulate in double precision so tiny, representable float32 triangles
  // do not lose their face area before normalization.
  const sums = new Float64Array(positions.length);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const x1 = positions[b]! - positions[a]!, y1 = positions[b + 1]! - positions[a + 1]!, z1 = positions[b + 2]! - positions[a + 2]!;
    const x2 = positions[c]! - positions[a]!, y2 = positions[c + 1]! - positions[a + 1]!, z2 = positions[c + 2]! - positions[a + 2]!;
    const nx = y1 * z2 - z1 * y2, ny = z1 * x2 - x1 * z2, nz = x1 * y2 - y1 * x2;
    for (const at of [a, b, c]) { sums[at] += nx; sums[at + 1] += ny; sums[at + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(sums[i]!, sums[i + 1]!, sums[i + 2]!);
    if (length > 0 && Number.isFinite(length)) { normals[i] = sums[i]! / length; normals[i + 1] = sums[i + 1]! / length; normals[i + 2] = sums[i + 2]! / length; }
    else { normals[i] = 0; normals[i + 1] = 1; normals[i + 2] = 0; }
  }
  return normals;
}
function bounds(data: Float32Array): { min: SculptVec3; max: SculptVec3 } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) for (let axis = 0; axis < 3; axis += 1) { min[axis] = Math.min(min[axis]!, data[i + axis]!); max[axis] = Math.max(max[axis]!, data[i + axis]!); }
  return { min, max };
}
function finiteArray(values: ArrayLike<number>, label: string): Float32Array {
  const result = Float32Array.from(values);
  if (result.some((v) => !Number.isFinite(v) || Math.abs(v) > COORDINATE_LIMIT)) throw new RangeError(`${label} must contain finite values within the coordinate limit`);
  return result;
}
function budget(value: number, max: number, name: string): number { if (!Number.isInteger(value) || value < 1 || value > max) throw new RangeError(`${name} must be an integer from 1 to ${max}`); return value; }
function positive(value: number, name: string): number { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`); return value; }
function vector(value: SculptVec3, name: string): void { if (!value || value.length !== 3 || value.some((v) => !Number.isFinite(v) || Math.abs(v) > COORDINATE_LIMIT)) throw new RangeError(`${name} must be a finite vec3 within the coordinate limit`); }
function normalized(value: SculptVec3, name: string): SculptVec3 { vector(value, name); const length = Math.hypot(...value); if (length < 1e-12) throw new RangeError(`${name} must be non-zero`); return [value[0] / length, value[1] / length, value[2] / length]; }
