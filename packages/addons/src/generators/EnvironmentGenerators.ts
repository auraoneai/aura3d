/**
 * Opt-in, bounded procedural environment meshes. Parts are ordinary
 * `AuraCustomGeometrySpec`s and can be passed to `geometry.custom` or
 * `instances.custom`; the caller chooses the material for each named part.
 * The terrain heightfield can alternatively be passed to `world.terrain`.
 * These functions allocate CPU buffers only; ownership transfers to the caller.
 */
import { scatterInArea } from "@aura3d/engine/scatter";
import type { AuraCustomGeometrySpec, AuraTerrainOptions } from "@aura3d/engine";

export type GeneratorVec3 = readonly [number, number, number];

export interface GeneratorBudget {
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxInstances?: number;
}

export interface GeneratedMesh {
  readonly materialSlot: string;
  readonly geometry: AuraCustomGeometrySpec;
}

export interface GeneratedPlacement {
  readonly position: GeneratorVec3;
  readonly yaw: number;
  readonly scale: number;
  readonly kind: string;
}

export interface GeneratedEnvironment {
  /** Geometry is already in world space; supply one material per slot. */
  readonly parts: readonly GeneratedMesh[];
  /** Placement metadata, useful for picking or replacing generated objects with assets. */
  readonly placements: readonly GeneratedPlacement[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bounds: { readonly min: GeneratorVec3; readonly max: GeneratorVec3 } | null;
  readonly disposed: boolean;
  /** Releases references owned by the result. Existing caller-held buffers remain valid. */
  dispose(): void;
}

export interface TerrainGeneratorOptions {
  readonly seed?: number;
  readonly columns?: number;
  readonly rows?: number;
  readonly size?: readonly [number, number];
  readonly origin?: GeneratorVec3;
  readonly height?: number;
  readonly frequency?: number;
  readonly octaves?: number;
  readonly budget?: GeneratorBudget;
}

export interface GeneratedTerrain extends GeneratedEnvironment {
  /** A snapshot of the generated field for the existing `world.terrain` builder. */
  readonly terrainOptions: AuraTerrainOptions;
  /** Bilinear, border-clamped sample in world coordinates; throws after disposal. */
  heightAt(x: number, z: number): number;
}

export interface TreeGeneratorOptions {
  readonly seed?: number;
  readonly height?: number;
  readonly crownRadius?: number;
  readonly trunkRadius?: number;
  readonly branchLevels?: number;
  readonly radialSegments?: number;
  readonly budget?: GeneratorBudget;
}

export interface ForestGeneratorOptions extends TreeGeneratorOptions {
  readonly count?: number;
  readonly min?: readonly [number, number];
  readonly max?: readonly [number, number];
  readonly minDistance?: number;
  readonly ground?: (x: number, z: number) => number;
}

export interface CityGeneratorOptions {
  readonly seed?: number;
  readonly columns?: number;
  readonly rows?: number;
  readonly blockSize?: number;
  readonly roadWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly budget?: GeneratorBudget;
}

export type StreetAssetKind = "lamp" | "bench" | "bollard" | "planter";
export interface StreetAssetGeneratorOptions {
  readonly seed?: number;
  readonly path: readonly GeneratorVec3[];
  readonly spacing?: number;
  readonly offset?: number;
  readonly sides?: "left" | "right" | "both";
  readonly kinds?: readonly StreetAssetKind[];
  readonly budget?: GeneratorBudget;
}

type MutableVec3 = [number, number, number];
type Transform = { readonly position: GeneratorVec3; readonly yaw: number; readonly scale: number };
const IDENTITY: Transform = { position: [0, 0, 0], yaw: 0, scale: 1 };
const LIMIT_VERTICES = 1_000_000;
const LIMIT_TRIANGLES = 2_000_000;
const LIMIT_INSTANCES = 10_000;
const LIMIT_DIMENSION = 100_000;
const TAU = Math.PI * 2;

function numberIn(value: number, name: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be finite and in [${min}, ${max}].`);
  return value;
}
function integerIn(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer in [${min}, ${max}].`);
  return value;
}
function seedValue(seed: number | undefined): number {
  return integerIn(seed ?? 1, "seed", -0x80000000, 0xffffffff) >>> 0;
}
function point3(value: GeneratorVec3, name: string): GeneratorVec3 {
  if (!value || value.length !== 3) throw new RangeError(`${name} must contain three finite coordinates.`);
  return [numberIn(value[0], `${name}.x`, -LIMIT_DIMENSION, LIMIT_DIMENSION), numberIn(value[1], `${name}.y`, -LIMIT_DIMENSION, LIMIT_DIMENSION), numberIn(value[2], `${name}.z`, -LIMIT_DIMENSION, LIMIT_DIMENSION)];
}
function point2(value: readonly [number, number], name: string): readonly [number, number] {
  if (!value || value.length !== 2) throw new RangeError(`${name} must contain two finite coordinates.`);
  return [numberIn(value[0], `${name}.x`, -LIMIT_DIMENSION, LIMIT_DIMENSION), numberIn(value[1], `${name}.z`, -LIMIT_DIMENSION, LIMIT_DIMENSION)];
}

class ResourceBudget {
  readonly maxVertices: number;
  readonly maxTriangles: number;
  readonly maxInstances: number;
  vertices = 0;
  triangles = 0;
  constructor(input: GeneratorBudget = {}) {
    this.maxVertices = integerIn(input.maxVertices ?? 200_000, "maxVertices", 0, LIMIT_VERTICES);
    this.maxTriangles = integerIn(input.maxTriangles ?? 300_000, "maxTriangles", 0, LIMIT_TRIANGLES);
    this.maxInstances = integerIn(input.maxInstances ?? 1_000, "maxInstances", 0, LIMIT_INSTANCES);
  }
  claim(vertices: number, triangles: number): void {
    if (this.vertices + vertices > this.maxVertices || this.triangles + triangles > this.maxTriangles) {
      throw new RangeError(`Generator geometry budget exceeded (${this.vertices + vertices} vertices, ${this.triangles + triangles} triangles).`);
    }
    this.vertices += vertices;
    this.triangles += triangles;
  }
  instances(count: number): void {
    if (count > this.maxInstances) throw new RangeError(`Generator instance budget exceeded (${count} > ${this.maxInstances}).`);
  }
}

function add(a: GeneratorVec3, b: GeneratorVec3): MutableVec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a: GeneratorVec3, factor: number): MutableVec3 { return [a[0] * factor, a[1] * factor, a[2] * factor]; }
function cross(a: GeneratorVec3, b: GeneratorVec3): MutableVec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: GeneratorVec3, b: GeneratorVec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function unit(a: GeneratorVec3): MutableVec3 {
  const length = Math.hypot(...a);
  if (!(length > 1e-10)) throw new RangeError("Cannot construct geometry from a zero-length direction.");
  return [a[0] / length, a[1] / length, a[2] / length];
}
function rotate(a: GeneratorVec3, yaw: number): MutableVec3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * a[0] + s * a[2], a[1], -s * a[0] + c * a[2]];
}
function randomStream(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

class MeshWriter {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  constructor(readonly budget: ResourceBudget) {}
  get count(): number { return this.positions.length / 3; }
  vertex(position: GeneratorVec3, normal: GeneratorVec3, u: number, v: number, transform: Transform): number {
    const p = add(transform.position, mul(rotate(position, transform.yaw), transform.scale));
    if (p.some((component) => !Number.isFinite(component) || Math.abs(component) > LIMIT_DIMENSION * 10)) throw new RangeError("Generated position exceeds the supported coordinate range.");
    const n = rotate(normal, transform.yaw);
    const index = this.count;
    this.positions.push(...p);
    this.normals.push(...n);
    this.uvs.push(u, v);
    return index;
  }
  triangle(a: number, b: number, c: number): void { this.indices.push(a, b, c); }
  finish(slot: string): GeneratedMesh | null {
    if (this.count === 0) return null;
    const positions = new Float32Array(this.positions);
    let min: MutableVec3 = [Infinity, Infinity, Infinity], max: MutableVec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[i + axis]!;
        min[axis] = Math.min(min[axis]!, value);
        max[axis] = Math.max(max[axis]!, value);
      }
    }
    return {
      materialSlot: slot,
      geometry: {
        kind: "aura-custom-geometry",
        positions, normals: new Float32Array(this.normals), uvs: new Float32Array(this.uvs),
        indices: this.count <= 65535 ? new Uint16Array(this.indices) : new Uint32Array(this.indices),
        bounds: { min, max }
      }
    };
  }
}

class EnvironmentWriter {
  private readonly writers = new Map<string, MeshWriter>();
  readonly placements: GeneratedPlacement[] = [];
  constructor(readonly budget: ResourceBudget) {}
  part(slot: string): MeshWriter {
    let writer = this.writers.get(slot);
    if (!writer) { writer = new MeshWriter(this.budget); this.writers.set(slot, writer); }
    return writer;
  }
  result(onDispose?: () => void): GeneratedEnvironment {
    const parts = [...this.writers.entries()].map(([slot, writer]) => writer.finish(slot)).filter((part): part is GeneratedMesh => part !== null);
    let currentParts: readonly GeneratedMesh[] = parts;
    let currentPlacements: readonly GeneratedPlacement[] = [...this.placements];
    let disposed = false;
    let bounds: { min: GeneratorVec3; max: GeneratorVec3 } | null = null;
    for (const part of parts) {
      const b = part.geometry.bounds!;
      bounds = bounds === null ? { min: b.min, max: b.max } : {
        min: [Math.min(bounds.min[0], b.min[0]), Math.min(bounds.min[1], b.min[1]), Math.min(bounds.min[2], b.min[2])],
        max: [Math.max(bounds.max[0], b.max[0]), Math.max(bounds.max[1], b.max[1]), Math.max(bounds.max[2], b.max[2])]
      };
    }
    const vertexCount = this.budget.vertices, triangleCount = this.budget.triangles;
    return {
      get parts() { return currentParts; }, get placements() { return currentPlacements; },
      get vertexCount() { return disposed ? 0 : vertexCount; }, get triangleCount() { return disposed ? 0 : triangleCount; },
      get bounds() { return disposed ? null : bounds; }, get disposed() { return disposed; },
      dispose() { if (!disposed) { disposed = true; currentParts = []; currentPlacements = []; bounds = null; onDispose?.(); } }
    };
  }
}

function box(w: MeshWriter, center: GeneratorVec3, size: GeneratorVec3, transform: Transform): void {
  w.budget.claim(24, 12);
  const [x, y, z] = center, [a, b, c] = mul(size, 0.5);
  const faces: readonly { readonly n: GeneratorVec3; readonly p: readonly GeneratorVec3[] }[] = [
    { n: [1, 0, 0], p: [[x+a,y-b,z-c],[x+a,y+b,z-c],[x+a,y+b,z+c],[x+a,y-b,z+c]] },
    { n: [-1, 0, 0], p: [[x-a,y-b,z+c],[x-a,y+b,z+c],[x-a,y+b,z-c],[x-a,y-b,z-c]] },
    { n: [0, 1, 0], p: [[x-a,y+b,z-c],[x-a,y+b,z+c],[x+a,y+b,z+c],[x+a,y+b,z-c]] },
    { n: [0, -1, 0], p: [[x-a,y-b,z+c],[x-a,y-b,z-c],[x+a,y-b,z-c],[x+a,y-b,z+c]] },
    { n: [0, 0, 1], p: [[x+a,y-b,z+c],[x+a,y+b,z+c],[x-a,y+b,z+c],[x-a,y-b,z+c]] },
    { n: [0, 0, -1], p: [[x-a,y-b,z-c],[x-a,y+b,z-c],[x+a,y+b,z-c],[x+a,y-b,z-c]] }
  ];
  for (const face of faces) {
    const base = w.count;
    face.p.forEach((p, i) => w.vertex(p, face.n, i === 2 || i === 3 ? 1 : 0, i === 1 || i === 2 ? 1 : 0, transform));
    w.triangle(base, base + 1, base + 2); w.triangle(base, base + 2, base + 3);
  }
}

/** Tapered, capped branch with smooth side normals and separately normaled caps. */
function branch(w: MeshWriter, start: GeneratorVec3, end: GeneratorVec3, r0: number, r1: number, segments: number, transform: Transform): void {
  const direction: GeneratorVec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(...direction), axis = unit(direction);
  const right = unit(cross(Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], axis));
  const up = cross(axis, right);
  w.budget.claim((segments + 1) * 2 + (segments + 2) * 2, segments * 4);
  const side = w.count;
  for (let i = 0; i <= segments; i += 1) {
    const theta = i / segments * TAU;
    const radial = add(mul(right, Math.cos(theta)), mul(up, Math.sin(theta)));
    const normal = unit(add(radial, mul(axis, (r0 - r1) / length)));
    w.vertex(add(start, mul(radial, r0)), normal, i / segments, 0, transform);
    w.vertex(add(end, mul(radial, r1)), normal, i / segments, 1, transform);
  }
  for (let i = 0; i < segments; i += 1) {
    const k = side + i * 2;
    w.triangle(k, k + 2, k + 3); w.triangle(k, k + 3, k + 1);
  }
  for (const top of [false, true]) {
    const center = top ? end : start, radius = top ? r1 : r0, normal = mul(axis, top ? 1 : -1), base = w.count;
    w.vertex(center, normal, 0.5, 0.5, transform);
    for (let i = 0; i <= segments; i += 1) {
      const theta = i / segments * TAU, cosine = Math.cos(theta), sine = Math.sin(theta);
      w.vertex(add(center, mul(add(mul(right, cosine), mul(up, sine)), radius)), normal, 0.5 + cosine * 0.5, 0.5 + sine * 0.5, transform);
    }
    for (let i = 0; i < segments; i += 1) {
      if (top) w.triangle(base, base + i + 1, base + i + 2);
      else w.triangle(base, base + i + 2, base + i + 1);
    }
  }
}

/** A faceted, ellipsoidal leaf cluster with independent flat normals. */
function foliage(w: MeshWriter, center: GeneratorVec3, size: GeneratorVec3, transform: Transform): void {
  const p: GeneratorVec3[] = [
    [center[0], center[1] + size[1], center[2]], [center[0], center[1] - size[1], center[2]],
    [center[0] + size[0], center[1], center[2]], [center[0], center[1], center[2] + size[2]],
    [center[0] - size[0], center[1], center[2]], [center[0], center[1], center[2] - size[2]]
  ];
  w.budget.claim(24, 8);
  for (let i = 0; i < 4; i += 1) for (const apex of [0, 1]) {
    const a = p[apex]!, b = p[2 + i]!, c = p[2 + ((i + 1) % 4)]!;
    let normal = unit(cross([b[0]-a[0], b[1]-a[1], b[2]-a[2]], [c[0]-a[0], c[1]-a[1], c[2]-a[2]]));
    const centroid: GeneratorVec3 = [(a[0]+b[0]+c[0])/3-center[0], (a[1]+b[1]+c[1])/3-center[1], (a[2]+b[2]+c[2])/3-center[2]];
    const flip = dot(normal, centroid) < 0;
    if (flip) normal = mul(normal, -1);
    const base = w.count;
    w.vertex(a, normal, 0.5, 1, transform); w.vertex(b, normal, 0, 0, transform); w.vertex(c, normal, 1, 0, transform);
    if (flip) w.triangle(base, base + 2, base + 1); else w.triangle(base, base + 1, base + 2);
  }
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Generate a grid mesh and the same height array accepted by `world.terrain`. */
export function generateTerrain(options: TerrainGeneratorOptions = {}): GeneratedTerrain {
  const seed = seedValue(options.seed);
  const columns = integerIn(options.columns ?? 48, "columns", 2, 1024), rows = integerIn(options.rows ?? 48, "rows", 2, 1024);
  const size = point2(options.size ?? [40, 40], "size");
  numberIn(size[0], "size.x", 0.001, LIMIT_DIMENSION); numberIn(size[1], "size.z", 0.001, LIMIT_DIMENSION);
  const origin = point3(options.origin ?? [-size[0] / 2, 0, -size[1] / 2], "origin");
  const amplitude = numberIn(options.height ?? 6, "height", 0, LIMIT_DIMENSION);
  const frequency = numberIn(options.frequency ?? 3, "frequency", 0.001, 128);
  const octaves = integerIn(options.octaves ?? 4, "octaves", 1, 8);
  const budget = new ResourceBudget(options.budget), writer = new EnvironmentWriter(budget), mesh = writer.part("terrain");
  budget.claim(columns * rows, (columns - 1) * (rows - 1) * 2);
  let heights: Float32Array | null = new Float32Array(columns * rows);
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < columns; x += 1) {
    let weight = 1, totalWeight = 0, sum = 0, scale = frequency;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += noise(x / (columns - 1) * scale, z / (rows - 1) * scale, (seed + Math.imul(octave, 0x9e3779b9)) >>> 0) * weight;
      totalWeight += weight; weight *= 0.5; scale *= 2;
    }
    heights[z * columns + x] = (sum / totalWeight - 0.5) * amplitude;
  }
  const grid = heights;
  const sx = size[0] / (columns - 1), sz = size[1] / (rows - 1);
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < columns; x += 1) {
    const left = Math.max(0, x - 1), right = Math.min(columns - 1, x + 1), down = Math.max(0, z - 1), up = Math.min(rows - 1, z + 1);
    const dx = (grid[z * columns + right]! - grid[z * columns + left]!) / ((right - left) * sx);
    const dz = (grid[up * columns + x]! - grid[down * columns + x]!) / ((up - down) * sz);
    mesh.vertex([origin[0] + x * sx, origin[1] + grid[z * columns + x]!, origin[2] + z * sz], unit([-dx, 1, -dz]), x / (columns - 1), z / (rows - 1), IDENTITY);
  }
  for (let z = 0; z < rows - 1; z += 1) for (let x = 0; x < columns - 1; x += 1) {
    const a = z * columns + x, b = a + 1, c = a + columns, d = c + 1;
    mesh.triangle(a, c, b); mesh.triangle(b, c, d);
  }
  const result = writer.result(() => { heights = null; });
  function getGrid(): Float32Array {
    if (!heights) throw new Error("Generated terrain is disposed.");
    return heights;
  }
  return {
    get parts() { return result.parts; }, get placements() { return result.placements; },
    get vertexCount() { return result.vertexCount; }, get triangleCount() { return result.triangleCount; },
    get bounds() { return result.bounds; }, get disposed() { return result.disposed; },
    get terrainOptions(): AuraTerrainOptions {
      return { height: { kind: "array", columns, rows, heights: new Float32Array(getGrid()) }, size, origin, layers: [{ name: "terrain" }] };
    },
    heightAt(x: number, z: number): number {
      numberIn(x, "x", -LIMIT_DIMENSION * 10, LIMIT_DIMENSION * 10); numberIn(z, "z", -LIMIT_DIMENSION * 10, LIMIT_DIMENSION * 10);
      const values = getGrid(), px = Math.max(0, Math.min(columns - 1, (x - origin[0]) / size[0] * (columns - 1))), pz = Math.max(0, Math.min(rows - 1, (z - origin[2]) / size[1] * (rows - 1)));
      const x0 = Math.floor(px), z0 = Math.floor(pz), x1 = Math.min(columns - 1, x0 + 1), z1 = Math.min(rows - 1, z0 + 1), fx = px - x0, fz = pz - z0;
      const h00 = values[z0 * columns + x0]!, h10 = values[z0 * columns + x1]!, h01 = values[z1 * columns + x0]!, h11 = values[z1 * columns + x1]!;
      return origin[1] + (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    },
    dispose() { result.dispose(); }
  };
}

interface TreeSettings { readonly height: number; readonly crownRadius: number; readonly trunkRadius: number; readonly branchLevels: number; readonly radialSegments: number; }
function treeSettings(options: TreeGeneratorOptions): TreeSettings {
  return {
    height: numberIn(options.height ?? 6, "height", 0.01, 10_000),
    crownRadius: numberIn(options.crownRadius ?? 1.7, "crownRadius", 0.001, 10_000),
    trunkRadius: numberIn(options.trunkRadius ?? 0.22, "trunkRadius", 0.001, 1_000),
    branchLevels: integerIn(options.branchLevels ?? 3, "branchLevels", 1, 8),
    radialSegments: integerIn(options.radialSegments ?? 6, "radialSegments", 3, 24)
  };
}
function emitTree(writer: EnvironmentWriter, settings: TreeSettings, seed: number, transform: Transform): void {
  const { height, crownRadius, trunkRadius, branchLevels, radialSegments } = settings;
  const wood = writer.part("wood"), leaves = writer.part("foliage"), random = randomStream(seed);
  branch(wood, [0, 0, 0], [0, height * 0.86, 0], trunkRadius, trunkRadius * 0.25, radialSegments, transform);
  for (let level = 0; level < branchLevels; level += 1) {
    const fraction = (level + 1) / (branchLevels + 1), y = height * (0.34 + fraction * 0.46), spread = crownRadius * (1 - fraction * 0.35);
    const phase = random() * TAU;
    for (let i = 0; i < 3; i += 1) {
      const angle = phase + i * TAU / 3 + (random() - 0.5) * 0.25;
      const tip: GeneratorVec3 = [Math.cos(angle) * spread, y + height * (0.10 + random() * 0.04), Math.sin(angle) * spread];
      branch(wood, [0, y, 0], tip, trunkRadius * (0.4 - fraction * 0.15), trunkRadius * 0.08, radialSegments, transform);
      const r = crownRadius * (0.42 + random() * 0.12);
      foliage(leaves, tip, [r, r * 0.75, r], transform);
    }
  }
  foliage(leaves, [0, height * 0.88, 0], [crownRadius * 0.55, crownRadius * 0.65, crownRadius * 0.55], transform);
}

/** Generate a branching tree with independently materialable wood and foliage. */
export function generateTree(options: TreeGeneratorOptions = {}): GeneratedEnvironment {
  const seed = seedValue(options.seed), settings = treeSettings(options), budget = new ResourceBudget(options.budget);
  budget.instances(1);
  const writer = new EnvironmentWriter(budget);
  emitTree(writer, settings, seed, IDENTITY);
  writer.placements.push({ position: [0, 0, 0], yaw: 0, scale: 1, kind: "tree" });
  return writer.result();
}

/** Seeded placement uses Aura3D's scatter planner; dense spacing can admit fewer than `count`. */
export function generateForest(options: ForestGeneratorOptions = {}): GeneratedEnvironment {
  const seed = seedValue(options.seed), settings = treeSettings(options), budget = new ResourceBudget(options.budget);
  const count = integerIn(options.count ?? 20, "count", 0, LIMIT_INSTANCES);
  budget.instances(count);
  const min = point2(options.min ?? [-20, -20], "min"), max = point2(options.max ?? [20, 20], "max");
  if (min[0] >= max[0] || min[1] >= max[1]) throw new RangeError("Forest bounds must have strictly increasing coordinates.");
  const minDistance = numberIn(options.minDistance ?? 0, "minDistance", 0, LIMIT_DIMENSION);
  if (options.ground !== undefined && typeof options.ground !== "function") throw new TypeError("ground must be a function.");
  const ground = options.ground === undefined ? undefined : (x: number, z: number) => numberIn(options.ground!(x, z), "ground height", -LIMIT_DIMENSION, LIMIT_DIMENSION);
  const points = scatterInArea({ area: { kind: "rect", min, max }, count, seed, minDistance, scale: [0.8, 1.2], ...(ground ? { ground } : {}) });
  const writer = new EnvironmentWriter(budget);
  points.forEach((point, index) => {
    const position = point3(point.position, "forest placement");
    emitTree(writer, settings, (seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0, { position, yaw: point.yaw, scale: point.scale });
    writer.placements.push({ position, yaw: point.yaw, scale: point.scale, kind: "tree" });
  });
  return writer.result();
}

/** Construct a gridded street network with seeded building footprints and heights. */
export function generateCity(options: CityGeneratorOptions = {}): GeneratedEnvironment {
  const seed = seedValue(options.seed), columns = integerIn(options.columns ?? 4, "columns", 1, 100), rows = integerIn(options.rows ?? 4, "rows", 1, 100);
  const block = numberIn(options.blockSize ?? 20, "blockSize", 0.1, 10_000), road = numberIn(options.roadWidth ?? 6, "roadWidth", 0.1, 10_000);
  const minHeight = numberIn(options.minHeight ?? 5, "minHeight", 0.1, 10_000), maxHeight = numberIn(options.maxHeight ?? 30, "maxHeight", minHeight, 10_000);
  const width = columns * block + (columns + 1) * road, depth = rows * block + (rows + 1) * road;
  numberIn(width, "city width", 0.1, LIMIT_DIMENSION); numberIn(depth, "city depth", 0.1, LIMIT_DIMENSION);
  const budget = new ResourceBudget(options.budget); budget.instances(columns * rows);
  const writer = new EnvironmentWriter(budget), random = randomStream(seed);
  box(writer.part("road"), [0, -0.08, 0], [width, 0.16, depth], IDENTITY);
  for (let z = 0; z < rows; z += 1) for (let x = 0; x < columns; x += 1) {
    const cx = -width / 2 + road + block / 2 + x * (block + road), cz = -depth / 2 + road + block / 2 + z * (block + road);
    const height = minHeight + (maxHeight - minHeight) * random();
    const sx = block * (0.55 + random() * 0.2), sz = block * (0.55 + random() * 0.2);
    const bx = cx + (random() - 0.5) * (block - sx) * 0.5, bz = cz + (random() - 0.5) * (block - sz) * 0.5;
    box(writer.part("pavement"), [cx, 0.07, cz], [block, 0.14, block], IDENTITY);
    box(writer.part("building"), [bx, 0.14 + height / 2, bz], [sx, height, sz], IDENTITY);
    writer.placements.push({ position: [bx, 0.14, bz], yaw: 0, scale: 1, kind: "building" });
  }
  return writer.result();
}

function emitStreetAsset(writer: EnvironmentWriter, kind: StreetAssetKind, transform: Transform): void {
  const metal = writer.part("metal");
  switch (kind) {
    case "lamp":
      branch(metal, [0, 0, 0], [0, 3.4, 0], 0.10, 0.07, 8, transform);
      branch(metal, [0, 3.4, 0], [0.55, 3.4, 0], 0.07, 0.06, 8, transform);
      box(writer.part("lamp"), [0.55, 3.35, 0], [0.45, 0.16, 0.3], transform);
      break;
    case "bench":
      box(metal, [-0.55, 0.25, 0], [0.12, 0.5, 0.5], transform);
      box(metal, [0.55, 0.25, 0], [0.12, 0.5, 0.5], transform);
      box(writer.part("wood"), [0, 0.52, 0], [1.45, 0.12, 0.58], transform);
      box(writer.part("wood"), [0, 0.91, -0.25], [1.45, 0.66, 0.1], transform);
      break;
    case "bollard":
      branch(metal, [0, 0, 0], [0, 0.9, 0], 0.12, 0.10, 8, transform);
      break;
    case "planter":
      box(writer.part("planter"), [0, 0.30, 0], [0.75, 0.6, 0.75], transform);
      foliage(writer.part("foliage"), [0, 0.78, 0], [0.42, 0.46, 0.42], transform);
      break;
  }
}

/**
 * Generate seeded street furniture on one or both sides of a world-space
 * polyline. Spacing is measured along the polyline; zero-horizontal-length
 * segments are rejected because their left/right direction is undefined.
 */
export function generateStreetAssets(options: StreetAssetGeneratorOptions): GeneratedEnvironment {
  if (!options || !Array.isArray(options.path) || options.path.length < 2 || options.path.length > LIMIT_INSTANCES + 1) {
    throw new RangeError(`path must contain 2..${LIMIT_INSTANCES + 1} points.`);
  }
  const seed = seedValue(options.seed), spacing = numberIn(options.spacing ?? 12, "spacing", 0.01, LIMIT_DIMENSION);
  const offset = numberIn(options.offset ?? 3, "offset", 0, LIMIT_DIMENSION);
  const sides = options.sides ?? "both";
  if (sides !== "left" && sides !== "right" && sides !== "both") throw new RangeError("sides must be left, right or both.");
  const kinds = options.kinds ?? ["lamp", "bench", "bollard", "planter"];
  if (!Array.isArray(kinds) || kinds.length < 1 || kinds.length > 128 || kinds.some((kind) => kind !== "lamp" && kind !== "bench" && kind !== "bollard" && kind !== "planter")) {
    throw new RangeError("kinds must contain one or more supported street asset kinds.");
  }
  const path = options.path.map((point, i) => point3(point, `path[${i}]`));
  const lengths: number[] = [], cumulative = [0];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!, b = path[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    if (Math.hypot(dx, dz) < 1e-8) throw new RangeError(`path segment ${i} has no horizontal direction.`);
    const length = Math.hypot(dx, dy, dz);
    lengths.push(length); cumulative.push(cumulative[i]! + length);
  }
  const total = cumulative[cumulative.length - 1]!, rowCount = Math.max(0, Math.ceil(total / spacing - 0.5));
  const sideSigns = sides === "both" ? [-1, 1] : [sides === "left" ? -1 : 1];
  const budget = new ResourceBudget(options.budget); budget.instances(rowCount * sideSigns.length);
  const writer = new EnvironmentWriter(budget), random = randomStream(seed);
  let segment = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const distance = (row + 0.5) * spacing;
    while (segment < lengths.length - 1 && distance > cumulative[segment + 1]!) segment += 1;
    const a = path[segment]!, b = path[segment + 1]!, t = (distance - cumulative[segment]!) / lengths[segment]!;
    const dx = b[0] - a[0], dz = b[2] - a[2], horizontal = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    for (const sign of sideSigns) {
      const position: GeneratorVec3 = [a[0] + (b[0] - a[0]) * t + sign * dz / horizontal * offset, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sign * dx / horizontal * offset];
      const kind = kinds[Math.floor(random() * kinds.length)]!;
      const transform = { position, yaw: yaw + (sign < 0 ? Math.PI : 0), scale: 1 };
      emitStreetAsset(writer, kind, transform);
      writer.placements.push({ ...transform, kind });
    }
  }
  return writer.result();
}
