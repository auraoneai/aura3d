/**
 * Editable scalar-field isosurfaces. Each cube is decomposed into six
 * tetrahedra around a common diagonal, so adjacent cubes agree at their shared
 * faces without a borrowed case table. Samples >= isoLevel are inside.
 *
 * The returned arrays are independent snapshots in the shape accepted by
 * `geometry.custom` / `handle.setGeometry`; no GPU resources are owned here.
 */
export type IsosurfaceVec3 = readonly [number, number, number];
export type IsosurfaceColor = readonly [number, number, number, number];

export interface MarchingCubesOptions {
  /** Number of grid samples along each axis (at least two). */
  readonly resolution: readonly [number, number, number];
  readonly bounds?: { readonly min: IsosurfaceVec3; readonly max: IsosurfaceVec3 };
  readonly isoLevel?: number;
  /** Maximum emitted triangles; generation throws instead of truncating. */
  readonly maxTriangles?: number;
  /** X-fastest scalar samples. Values and colors are copied. */
  readonly values?: ArrayLike<number>;
  /** Optional X-fastest RGBA values in [0, 1], four per sample. */
  readonly colors?: ArrayLike<number>;
  /** Optional X-fastest material slots, one unsigned 16-bit integer per sample. */
  readonly materialIndices?: ArrayLike<number>;
}

export interface IsosurfaceSample {
  readonly value: number;
  readonly color?: IsosurfaceColor;
  readonly materialIndex?: number;
}

export interface IsosurfaceEdit {
  readonly coordinate: readonly [number, number, number];
  readonly before: IsosurfaceSample;
  readonly after: IsosurfaceSample;
}

export interface IsosurfaceGeometry {
  readonly kind: "aura-custom-geometry";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
  readonly groups?: readonly { readonly start: number; readonly count: number; readonly materialIndex: number }[];
  readonly dynamic: true;
}

const MAX_SAMPLES = 1_000_000;
const MAX_TRIANGLES = 250_000;
const DEFAULT_TRIANGLES = 100_000;
const CORNERS: readonly IsosurfaceVec3[] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
];
// The chosen body diagonal also fixes the same diagonal on both sides of
// every shared cube face, avoiding the cracks caused by inconsistent cases.
const TETRAHEDRA = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
  [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]
] as const;

interface Vertex {
  readonly position: [number, number, number];
  readonly normal: [number, number, number];
  readonly color?: [number, number, number, number];
}

function finiteFloat(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new RangeError(`${label} must be a finite float32 value.`);
  return value;
}

function checkedColor(color: IsosurfaceColor): IsosurfaceColor {
  if (color.length !== 4 || color.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("Isosurface colors must have four finite channels in [0, 1].");
  }
  return [color[0], color[1], color[2], color[3]];
}

function checkedMaterialIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw new RangeError("Material index must be an integer from 0 to 65535.");
  return value;
}

function normalized(v: IsosurfaceVec3): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 && Number.isFinite(length) ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
}

export class MarchingCubes {
  readonly resolution: readonly [number, number, number];
  readonly bounds: { readonly min: IsosurfaceVec3; readonly max: IsosurfaceVec3 };
  readonly isoLevel: number;
  readonly maxTriangles: number;
  private values: Float32Array;
  private colors: Float32Array | undefined;
  private materialIndices: Uint16Array | undefined;
  private disposed = false;

  constructor(options: MarchingCubesOptions) {
    const resolution = options.resolution;
    if (!resolution || resolution.length !== 3 || resolution.some((n) => !Number.isInteger(n) || n < 2)) {
      throw new RangeError("MarchingCubes resolution must contain three integers >= 2.");
    }
    const samples = resolution[0] * resolution[1] * resolution[2];
    if (!Number.isSafeInteger(samples) || samples > MAX_SAMPLES) throw new RangeError(`MarchingCubes supports at most ${MAX_SAMPLES} samples.`);
    const bounds = options.bounds ?? { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
    if (bounds.min.length !== 3 || bounds.max.length !== 3) throw new RangeError("MarchingCubes bounds must contain two vec3s.");
    for (let i = 0; i < 3; i += 1) {
      finiteFloat(bounds.min[i]!, "Bounds minimum");
      finiteFloat(bounds.max[i]!, "Bounds maximum");
      if (Math.fround(bounds.min[i]!) >= Math.fround(bounds.max[i]!)) throw new RangeError("MarchingCubes bounds must have positive float32 extent on each axis.");
    }
    const maxTriangles = options.maxTriangles ?? DEFAULT_TRIANGLES;
    if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > MAX_TRIANGLES) {
      throw new RangeError(`maxTriangles must be an integer from 1 to ${MAX_TRIANGLES}.`);
    }
    this.resolution = [resolution[0], resolution[1], resolution[2]];
    this.bounds = { min: [bounds.min[0], bounds.min[1], bounds.min[2]], max: [bounds.max[0], bounds.max[1], bounds.max[2]] };
    this.isoLevel = finiteFloat(options.isoLevel ?? 0, "isoLevel");
    this.maxTriangles = maxTriangles;
    this.values = new Float32Array(samples);
    if (options.values !== undefined) {
      if (options.values.length !== samples) throw new RangeError(`values must contain exactly ${samples} samples.`);
      for (let i = 0; i < samples; i += 1) this.values[i] = finiteFloat(options.values[i]!, `Sample ${i}`);
    }
    if (options.colors !== undefined) {
      if (options.colors.length !== samples * 4) throw new RangeError(`colors must contain exactly ${samples * 4} channels.`);
      this.colors = new Float32Array(samples * 4);
      for (let i = 0; i < samples; i += 1) {
        const color = checkedColor([options.colors[i * 4]!, options.colors[i * 4 + 1]!, options.colors[i * 4 + 2]!, options.colors[i * 4 + 3]!]);
        this.colors.set(color, i * 4);
      }
    }
    if (options.materialIndices !== undefined) {
      if (options.materialIndices.length !== samples) throw new RangeError(`materialIndices must contain exactly ${samples} entries.`);
      this.materialIndices = new Uint16Array(samples);
      for (let i = 0; i < samples; i += 1) this.materialIndices[i] = checkedMaterialIndex(options.materialIndices[i]!);
    }
  }

  getSample(x: number, y: number, z: number): IsosurfaceSample {
    this.assertLive();
    const index = this.index(x, y, z);
    return this.readSample(index);
  }

  /** Returns an independent edit record that can be replayed or undone. */
  setSample(x: number, y: number, z: number, value: number, color?: IsosurfaceColor, materialIndex?: number): IsosurfaceEdit {
    this.assertLive();
    const index = this.index(x, y, z);
    const next = finiteFloat(value, "Sample value");
    const nextColor = color === undefined ? undefined : checkedColor(color);
    const nextMaterialIndex = materialIndex === undefined ? undefined : checkedMaterialIndex(materialIndex);
    const before = this.readSample(index);
    if (nextColor && !this.colors) this.colors = new Float32Array(this.values.length * 4).fill(1);
    if (nextMaterialIndex !== undefined && !this.materialIndices) this.materialIndices = new Uint16Array(this.values.length);
    this.values[index] = next;
    if (nextColor) this.colors!.set(nextColor, index * 4);
    if (nextMaterialIndex !== undefined) this.materialIndices![index] = nextMaterialIndex;
    return { coordinate: [x, y, z], before, after: this.readSample(index) };
  }

  /** Apply an edit in either direction. Colorless samples restore white if a color grid exists. */
  applyEdit(edit: IsosurfaceEdit, direction: "undo" | "redo" = "redo"): void {
    if (direction !== "undo" && direction !== "redo") throw new RangeError("Edit direction must be undo or redo.");
    this.assertLive();
    const target = direction === "undo" ? edit.before : edit.after;
    this.setSample(...edit.coordinate, target.value, target.color ?? (this.colors ? [1, 1, 1, 1] : undefined), target.materialIndex ?? (this.materialIndices ? 0 : undefined));
  }

  /** Fill is transactional: an invalid callback result leaves the old field unchanged. */
  fill(sample: (position: IsosurfaceVec3, coordinate: readonly [number, number, number]) => number | IsosurfaceSample): void {
    this.assertLive();
    const values = new Float32Array(this.values.length);
    let colors: Float32Array | undefined = this.colors ? new Float32Array(this.colors) : undefined;
    let materials: Uint16Array | undefined = this.materialIndices ? new Uint16Array(this.materialIndices) : undefined;
    const [nx, ny, nz] = this.resolution;
    for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
      const index = this.index(x, y, z);
      const result = sample(this.position(x, y, z), [x, y, z]);
      const value = typeof result === "number" ? result : result.value;
      values[index] = finiteFloat(value, `Sample ${index}`);
      if (typeof result !== "number" && result.color !== undefined) {
        const color = checkedColor(result.color);
        if (!colors) colors = new Float32Array(this.values.length * 4).fill(1);
        colors.set(color, index * 4);
      }
      if (typeof result !== "number" && result.materialIndex !== undefined) {
        const materialIndex = checkedMaterialIndex(result.materialIndex);
        if (!materials) materials = new Uint16Array(this.values.length);
        materials[index] = materialIndex;
      }
    }
    this.values = values;
    this.colors = colors;
    this.materialIndices = materials;
  }

  /** Null denotes an empty surface, which cannot be passed to geometry.custom. */
  generate(isoLevel = this.isoLevel): IsosurfaceGeometry | null {
    this.assertLive();
    finiteFloat(isoLevel, "isoLevel");
    const [nx, ny, nz] = this.resolution;
    const gradients = new Float32Array(this.values.length * 3);
    const spacing = [0, 1, 2].map((axis) => (this.bounds.max[axis]! - this.bounds.min[axis]!) / (this.resolution[axis]! - 1));
    for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
      const coords = [x, y, z];
      const at = this.index(x, y, z) * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const lo = [...coords]; const hi = [...coords];
        lo[axis] = Math.max(0, coords[axis]! - 1);
        hi[axis] = Math.min(this.resolution[axis]! - 1, coords[axis]! + 1);
        const a = this.values[this.index(lo[0]!, lo[1]!, lo[2]!)]!;
        const b = this.values[this.index(hi[0]!, hi[1]!, hi[2]!)]!;
        // The negative gradient points from the inside to the outside.
        const gradient = -(b - a) / ((hi[axis]! - lo[axis]!) * spacing[axis]!);
        // Normalize later; store a bounded value so float32 cannot overflow.
        gradients[at + axis] = Math.max(-3.4e38, Math.min(3.4e38, gradient));
      }
    }
    const positions: number[] = []; const normals: number[] = []; const colors: number[] = [];
    const groups: { start: number; count: number; materialIndex: number }[] = [];
    const emit = (a: Vertex, b: Vertex, c: Vertex, outward: IsosurfaceVec3, materialIndex: number): void => {
      const ab = [b.position[0] - a.position[0], b.position[1] - a.position[1], b.position[2] - a.position[2]];
      const ac = [c.position[0] - a.position[0], c.position[1] - a.position[1], c.position[2] - a.position[2]];
      const face = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!] as const;
      const faceLength = Math.hypot(...face);
      if (!(faceLength > 0)) return;
      if (positions.length / 9 >= this.maxTriangles) throw new RangeError(`MarchingCubes exceeded maxTriangles (${this.maxTriangles}).`);
      if (this.materialIndices) {
        const last = groups[groups.length - 1];
        if (last?.materialIndex === materialIndex) last.count += 3;
        else groups.push({ start: positions.length / 3, count: 3, materialIndex });
      }
      const desired = normalized([a.normal[0] + b.normal[0] + c.normal[0], a.normal[1] + b.normal[1] + c.normal[1], a.normal[2] + b.normal[2] + c.normal[2]]);
      const direction = Math.hypot(...desired) > 0 ? desired : outward;
      const reverse = face[0] * direction[0] + face[1] * direction[1] + face[2] * direction[2] < 0;
      const faceNormal = normalized(reverse ? [-face[0], -face[1], -face[2]] : face);
      for (const v of reverse ? [a, c, b] : [a, b, c]) {
        positions.push(...v.position);
        const n = normalized(v.normal);
        normals.push(...(Math.hypot(...n) > 0 ? n : faceNormal));
        if (this.colors) colors.push(...v.color!);
      }
    };
    for (let z = 0; z < nz - 1; z += 1) for (let y = 0; y < ny - 1; y += 1) for (let x = 0; x < nx - 1; x += 1) {
      const ids = CORNERS.map(([dx, dy, dz]) => this.index(x + dx, y + dy, z + dz));
      const edge = (a: number, b: number): Vertex => {
        const ia = ids[a]!; const ib = ids[b]!;
        const t = Math.max(0, Math.min(1, (isoLevel - this.values[ia]!) / (this.values[ib]! - this.values[ia]!)));
        const ca = CORNERS[a]!; const cb = CORNERS[b]!;
        const pa = this.position(x + ca[0], y + ca[1], z + ca[2]);
        const pb = this.position(x + cb[0], y + cb[1], z + cb[2]);
        const mix = (u: number, v: number) => u + (v - u) * t;
        const vertex: Vertex = {
          position: [mix(pa[0], pb[0]), mix(pa[1], pb[1]), mix(pa[2], pb[2])],
          normal: [0, 1, 2].map((axis) => mix(gradients[ia * 3 + axis]!, gradients[ib * 3 + axis]!)) as [number, number, number],
          ...(this.colors ? { color: [0, 1, 2, 3].map((axis) => mix(this.colors![ia * 4 + axis]!, this.colors![ib * 4 + axis]!)) as [number, number, number, number] } : {})
        };
        return vertex;
      };
      for (const tetra of TETRAHEDRA) {
        const inside = tetra.filter((corner) => this.values[ids[corner]!]! >= isoLevel);
        const outside = tetra.filter((corner) => this.values[ids[corner]!]! < isoLevel);
        if (!inside.length || !outside.length) continue;
        const center = (corners: readonly number[]): IsosurfaceVec3 => [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + CORNERS[corner]![axis]!, 0) / corners.length * spacing[axis]!) as unknown as IsosurfaceVec3;
        const ci = center(inside); const co = center(outside);
        const outward = normalized([co[0] - ci[0], co[1] - ci[1], co[2] - ci[2]]);
        // Choose the nearest interior sample; ties follow stable tetrahedron order.
        const materialCorner = inside.reduce((best, corner) => this.values[ids[corner]!]! < this.values[ids[best]!]! ? corner : best);
        const materialIndex = this.materialIndices?.[ids[materialCorner]!] ?? 0;
        if (inside.length === 1) {
          emit(edge(inside[0]!, outside[0]!), edge(inside[0]!, outside[1]!), edge(inside[0]!, outside[2]!), outward, materialIndex);
        } else if (outside.length === 1) {
          emit(edge(outside[0]!, inside[0]!), edge(outside[0]!, inside[1]!), edge(outside[0]!, inside[2]!), outward, materialIndex);
        } else {
          const a = edge(inside[0]!, outside[0]!); const b = edge(inside[0]!, outside[1]!);
          const c = edge(inside[1]!, outside[1]!); const d = edge(inside[1]!, outside[0]!);
          emit(a, b, c, outward, materialIndex); emit(a, c, d, outward, materialIndex);
        }
      }
    }
    if (!positions.length) return null;
    const indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    return { kind: "aura-custom-geometry", positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices, ...(this.colors ? { colors: Float32Array.from(colors) } : {}), ...(this.materialIndices ? { groups } : {}), dynamic: true };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.values = new Float32Array(0);
    this.colors = undefined;
    this.materialIndices = undefined;
  }

  private assertLive(): void { if (this.disposed) throw new Error("MarchingCubes has been disposed."); }
  private index(x: number, y: number, z: number): number {
    const [nx, ny, nz] = this.resolution;
    if (![x, y, z].every(Number.isInteger) || x < 0 || x >= nx || y < 0 || y >= ny || z < 0 || z >= nz) throw new RangeError("Sample coordinate is outside the scalar field.");
    return x + nx * (y + ny * z);
  }
  private position(x: number, y: number, z: number): IsosurfaceVec3 {
    return [x, y, z].map((coordinate, axis) => this.bounds.min[axis]! + (this.bounds.max[axis]! - this.bounds.min[axis]!) * coordinate / (this.resolution[axis]! - 1)) as unknown as IsosurfaceVec3;
  }
  private readSample(index: number): IsosurfaceSample {
    return { value: this.values[index]!, ...(this.colors ? { color: [this.colors[index * 4]!, this.colors[index * 4 + 1]!, this.colors[index * 4 + 2]!, this.colors[index * 4 + 3]!] as IsosurfaceColor } : {}), ...(this.materialIndices ? { materialIndex: this.materialIndices[index]! } : {}) };
  }
}

export function createMarchingCubes(options: MarchingCubesOptions): MarchingCubes { return new MarchingCubes(options); }
