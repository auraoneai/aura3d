import { normalizeGeometryAttributes, validateGeometryMetadata } from "../RootGeometry.js";
import type { AuraCustomGeometrySpec } from "../RootGeometry.js";

type Vec3 = [number, number, number];
export interface AuraMeshSurfaceSamplerOptions {
  readonly seed?: number;
  /** Optional non-negative custom scalar density, linearly interpolated over each face. */
  readonly weightAttribute?: string;
  readonly weightComponent?: number;
  /** Limit sampling to the selected material group; drawRange also applies by default. */
  readonly group?: number;
  readonly useDrawRange?: boolean;
}
export interface AuraMeshSurfaceSample {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly uv?: [number, number];
  readonly uv1?: [number, number];
  readonly color?: [number, number, number, number];
  readonly attributes: Readonly<Record<string, readonly number[]>>;
  /** Interpolated deltas; unlike the base normal, directional deltas are not normalized. */
  readonly morphTargets?: readonly { readonly name?: string; readonly position: Vec3; readonly normal?: Vec3; readonly tangent?: Vec3 }[];
  readonly faceIndex: number;
  readonly barycentric: Vec3;
}
interface Triangle {
  readonly vertices: Vec3;
  readonly faceIndex: number;
  readonly cumulativeWeight: number;
  readonly weights?: Vec3;
  readonly faceNormal: Vec3;
}

/**
 * Immutable source snapshot and seeded stream of area-weighted surface samples.
 * With a weight attribute the density varies linearly within each triangle,
 * rather than merely choosing triangles by their average weight.
 */
export class MeshSurfaceSampler {
  private state: number;
  private readonly seed: number;
  private readonly positions: Float32Array;
  private readonly normals?: Float32Array;
  private readonly uvs?: Float32Array;
  private readonly uv1s?: Float32Array;
  private readonly colors?: Float32Array;
  private readonly custom: readonly { name: string; itemSize: number; data: Float32Array }[];
  private readonly morphs: readonly { name?: string; positions: Float32Array; normals?: Float32Array; tangents?: Float32Array }[];
  private readonly triangles: Triangle[] = [];
  private total = 0;

  constructor(source: AuraCustomGeometrySpec, options: AuraMeshSurfaceSamplerOptions = {}) {
    if (source.topology !== undefined && source.topology !== "triangles") throw new Error("Surface sampling requires triangle topology.");
    this.seed = MeshSurfaceSampler.validateSeed(options.seed ?? 1);
    this.state = this.seed;
    const data = normalizeGeometryAttributes(source);
    validateGeometryMetadata(source, data);
    this.positions = data.positions.slice();
    this.normals = data.normals?.slice();
    this.uvs = data.uvs?.slice();
    this.uv1s = data.uv1s?.slice();
    this.colors = data.colors?.slice();
    this.custom = data.custom.map((entry) => ({ name: entry.name, itemSize: entry.itemSize, data: entry.data.slice() }));
    this.morphs = (source.morphTargets ?? []).map((morph, i) => {
      if (morph.positions.length !== data.vertexCount * 3) throw new Error(`Morph target ${i} must match the position count.`);
      return {
        ...(morph.name === undefined ? {} : { name: morph.name }),
        positions: Float32Array.from(morph.positions),
        ...(morph.normals === undefined ? {} : { normals: Float32Array.from(morph.normals) }),
        ...(morph.tangents === undefined ? {} : { tangents: Float32Array.from(morph.tangents) })
      };
    });
    for (const values of [this.positions, this.normals, this.uvs, this.uv1s, this.colors, ...this.custom.map((entry) => entry.data),
      ...this.morphs.flatMap((entry) => [entry.positions, entry.normals, entry.tangents])]) {
      if (values?.some((value) => !Number.isFinite(value))) throw new Error("Surface attributes and positions must be finite.");
    }
    const indices = data.indices ? Array.from(data.indices) : Array.from({ length: data.vertexCount }, (_, i) => i);
    if (indices.length === 0 || indices.length % 3 !== 0) throw new Error("Surface sampling requires complete, nonempty triangles.");
    const validateRange = (start: number, count: number, label: string): void => {
      if (!Number.isInteger(start) || !(Number.isInteger(count) || count === Infinity) || start < 0 || count < 0 || start % 3 !== 0 || (count !== Infinity && count % 3 !== 0)) throw new Error(`${label} must be a non-negative, triangle-aligned range.`);
    };
    if (source.drawRange) validateRange(source.drawRange.start, source.drawRange.count, "Draw range");
    source.groups?.forEach((group, i) => {
      validateRange(group.start, group.count, `Group ${i}`);
      if (!Number.isFinite(group.count) || group.start + group.count > indices.length || (group.materialIndex !== undefined && (!Number.isInteger(group.materialIndex) || group.materialIndex < 0))) throw new Error(`Group ${i} must fit the index buffer and have a non-negative material index.`);
    });
    if (options.group !== undefined && (!Number.isInteger(options.group) || options.group < 0 || !source.groups?.[options.group])) throw new Error("Sampler group must identify an existing geometry group.");
    const weight = options.weightAttribute === undefined ? undefined : this.custom.find((entry) => entry.name === options.weightAttribute);
    if (options.weightAttribute !== undefined && !weight) throw new Error(`Weight attribute '${options.weightAttribute}' was not found.`);
    const component = options.weightComponent ?? 0;
    if (options.weightComponent !== undefined && !weight) throw new Error("weightComponent requires a weightAttribute.");
    if (weight && (!Number.isInteger(component) || component < 0 || component >= weight.itemSize)) throw new Error("weightComponent is outside the weight attribute.");
    if (weight) for (let i = component; i < weight.data.length; i += weight.itemSize) if (weight.data[i]! < 0) throw new Error("Surface weights must be non-negative.");
    for (let offset = 0; offset < indices.length; offset += 3) {
      if (options.useDrawRange !== false && source.drawRange && (offset < source.drawRange.start || offset >= source.drawRange.start + source.drawRange.count)) continue;
      const group = options.group === undefined ? undefined : source.groups![options.group]!;
      if (group && (offset < group.start || offset >= group.start + group.count)) continue;
      const vertices: Vec3 = [indices[offset]!, indices[offset + 1]!, indices[offset + 2]!];
      const read = (i: number): Vec3 => [this.positions[i * 3]!, this.positions[i * 3 + 1]!, this.positions[i * 3 + 2]!];
      const a = read(vertices[0]); const b = read(vertices[1]); const c = read(vertices[2]);
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const twiceArea = Math.hypot(...n);
      if (twiceArea === 0) continue;
      const weights: Vec3 | undefined = weight ? vertices.map((v) => weight.data[v * weight.itemSize + component]!) as Vec3 : undefined;
      const mass = twiceArea * 0.5 * (weights ? (weights[0] + weights[1] + weights[2]) / 3 : 1);
      if (mass <= 0) continue;
      this.total += mass;
      if (!Number.isFinite(this.total)) throw new Error("Surface area or weight exceeds the supported numerical range.");
      this.triangles.push({ vertices, faceIndex: offset / 3, cumulativeWeight: this.total, ...(weights ? { weights } : {}), faceNormal: [n[0] / twiceArea, n[1] / twiceArea, n[2] / twiceArea] });
    }
    if (this.triangles.length === 0) throw new Error("Surface has no non-degenerate triangles with positive sampling weight.");
  }

  private static validateSeed(seed: number): number {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Sampler seed must be a 32-bit unsigned integer.");
    return seed >>> 0;
  }
  private random(): number {
    // A small integer generator with an explicit, portable 32-bit state.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  reset(seed: number = this.seed): void { this.state = MeshSurfaceSampler.validateSeed(seed); }

  sample(): AuraMeshSurfaceSample {
    const target = this.random() * this.total;
    let low = 0; let high = this.triangles.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (target < this.triangles[mid]!.cumulativeWeight) high = mid; else low = mid + 1; }
    const triangle = this.triangles[low]!;
    let barycentric: Vec3;
    if (triangle.weights) {
      // A linearly weighted triangle is a mixture of three Dirichlet(2,1,1)
      // distributions, one per vertex. Gamma variates give exact barycentrics.
      const weights = triangle.weights;
      const choice = this.random() * (weights[0] + weights[1] + weights[2]);
      const selected = choice < weights[0] ? 0 : choice < weights[0] + weights[1] ? 1 : 2;
      const gamma = (): number => -Math.log(1 - this.random());
      const draws: Vec3 = [gamma(), gamma(), gamma()];
      draws[selected] += gamma();
      const sum = draws[0] + draws[1] + draws[2];
      // The all-zero event is possible for the finite PRNG; use the selected vertex.
      barycentric = sum === 0 ? [Number(selected === 0), Number(selected === 1), Number(selected === 2)] : [draws[0] / sum, draws[1] / sum, draws[2] / sum];
    } else {
      const root = Math.sqrt(this.random()); const v = this.random();
      barycentric = [1 - root, root * (1 - v), root * v];
    }
    const interpolate = (array: Float32Array, size: number): number[] => Array.from({ length: size }, (_, component) => triangle.vertices.reduce((sum, vertex, i) => sum + array[vertex * size + component]! * barycentric[i]!, 0));
    const position = interpolate(this.positions, 3) as Vec3;
    const n = this.normals ? interpolate(this.normals, 3) as Vec3 : triangle.faceNormal.slice() as Vec3;
    const length = Math.hypot(...n);
    const normal: Vec3 = length > 0 ? [n[0] / length, n[1] / length, n[2] / length] : triangle.faceNormal.slice() as Vec3;
    const attributes: Record<string, readonly number[]> = {};
    for (const attribute of this.custom) attributes[attribute.name] = interpolate(attribute.data, attribute.itemSize);
    return {
      position, normal,
      ...(this.uvs ? { uv: interpolate(this.uvs, 2) as [number, number] } : {}),
      ...(this.uv1s ? { uv1: interpolate(this.uv1s, 2) as [number, number] } : {}),
      ...(this.colors ? { color: interpolate(this.colors, 4) as [number, number, number, number] } : {}),
      attributes,
      ...(this.morphs.length ? { morphTargets: this.morphs.map((target) => ({
        ...(target.name === undefined ? {} : { name: target.name }),
        position: interpolate(target.positions, 3) as Vec3,
        ...(target.normals ? { normal: interpolate(target.normals, 3) as Vec3 } : {}),
        ...(target.tangents ? { tangent: interpolate(target.tangents, 3) as Vec3 } : {})
      })) } : {}),
      faceIndex: triangle.faceIndex, barycentric
    };
  }

  sampleMany(count: number): AuraMeshSurfaceSample[] {
    if (!Number.isInteger(count) || count < 0 || count > 1000000) throw new Error("Sample count must be an integer between 0 and 1000000.");
    return Array.from({ length: count }, () => this.sample());
  }
}

export function createMeshSurfaceSampler(source: AuraCustomGeometrySpec, options?: AuraMeshSurfaceSamplerOptions): MeshSurfaceSampler {
  return new MeshSurfaceSampler(source, options);
}
