import { Texture } from "../Texture";
import { NativeLightingResourceEvents, type NativeLightingResourceChange } from "./NativeLightingResourceEvents";

/** A portable, bounded CPU voxel volume for precomputed/updated indirect light.
 *
 * Values are linear RGB radiance and coverage. Triangles must already carry
 * emitted or direct-lit outgoing radiance; this class does not light geometry
 * on the caller's behalf. Cone tracing uses a box-filtered radiance/coverage
 * pyramid and front-to-back compositing. It is an approximation, not a GPU
 * voxelizer, and exposes that distinction through `execution`.
 */
export type VoxelVector3 = readonly [number, number, number];
export type VoxelLightingQuality = "low" | "medium" | "high";
export type VoxelLightingBackend = "cpu" | "webgl2" | "webgpu";

export interface VoxelLightingOptions {
  readonly bounds: { readonly min: VoxelVector3; readonly max: VoxelVector3 };
  readonly quality?: VoxelLightingQuality;
  /** Number of cells per axis. Defaults to the tier's maximum. */
  readonly resolution?: number | VoxelVector3;
  /** Requested volume-construction backend; volume construction currently runs on the CPU. */
  readonly backend?: VoxelLightingBackend;
}

export interface VoxelSurfaceTriangle {
  readonly vertices: readonly [VoxelVector3, VoxelVector3, VoxelVector3];
  readonly radiance: VoxelVector3;
  readonly opacity?: number;
}

export interface VoxelLightingValue {
  readonly radiance: VoxelVector3;
  readonly opacity: number;
}

export interface VoxelConeTraceOptions {
  readonly origin: VoxelVector3;
  readonly direction: VoxelVector3;
  /** Cone half-angle in radians, from 0 to less than π/2. */
  readonly halfAngle?: number;
  readonly maxDistance?: number;
  /** World-space distance to skip from the origin, useful for surface self-intersection. */
  readonly startDistance?: number;
}

export interface VoxelConeTraceResult {
  readonly radiance: VoxelVector3;
  readonly transmittance: number;
  readonly samples: number;
  /** True when the quality-tier step cap prevents reaching the ray exit. */
  readonly truncated: boolean;
}

export interface VoxelVolumeSnapshot {
  readonly bounds: { readonly min: VoxelVector3; readonly max: VoxelVector3 };
  readonly resolution: VoxelVector3;
  readonly revision: number;
  /** RGBA32F, x-fastest; RGB is premultiplied by opacity. The caller owns this copy. */
  readonly rgba: Float32Array;
}

export interface VoxelRenderLevel {
  readonly dimensions: VoxelVector3;
  /** Number of base-level cells covered by a full cell on each axis. */
  readonly scale: number;
  /** First texel of this level, measured in the flattened texture. */
  readonly offset: number;
}

/**
 * Grid-owned, uploadable texture containing the CPU-filtered volume pyramid.
 * Each level is x-fastest and sequential in a flat RGBA32F 2D texture. For
 * (x,y,z), the texel index is offset + ((z*ny+y)*nx+x), then texture
 * coordinates are (index % width, floor(index / width)). RGB is premultiplied
 * by opacity. Levels use ceil-halving and edge cells are weighted by their
 * actual base-cell footprint, including on odd-sized axes.
 *
 * Use exact integer texel loads and implement spatial/LOD interpolation in the
 * shader: float32 linear filtering is not universally available. Bind a
 * nearest/non-filtering sampler where the renderer requires one. This resource
 * alone does not bind a shader or perform GPU cone tracing. Call `renderData`
 * before a consuming draw after edits; this volume owns and disposes the
 * texture and consumers must not mutate or dispose it.
 */
export interface VoxelIndirectRenderData {
  readonly texture: Texture;
  readonly bounds: { readonly min: VoxelVector3; readonly max: VoxelVector3 };
  readonly resolution: VoxelVector3;
  readonly levels: readonly VoxelRenderLevel[];
  readonly maxConeSteps: number;
  readonly hemisphereCones: number;
  readonly revision: number;
}

interface TierLimits {
  readonly maxResolution: number;
  readonly maxTriangles: number;
  readonly maxCandidateCells: number;
  readonly maxConeSteps: number;
  readonly hemisphereCones: number;
}

/** Fixed limits make both memory and per-call traversal bounded. */
export const VOXEL_LIGHTING_LIMITS: Readonly<Record<VoxelLightingQuality, TierLimits>> = Object.freeze({
  low: Object.freeze({ maxResolution: 16, maxTriangles: 4096, maxCandidateCells: 262144, maxConeSteps: 32, hemisphereCones: 1 }),
  medium: Object.freeze({ maxResolution: 32, maxTriangles: 16384, maxCandidateCells: 1048576, maxConeSteps: 64, hemisphereCones: 5 }),
  high: Object.freeze({ maxResolution: 64, maxTriangles: 65536, maxCandidateCells: 4194304, maxConeSteps: 128, hemisphereCones: 9 })
});

interface Level {
  readonly dimensions: VoxelVector3;
  /** Base-level cells covered per axis by a complete cell at this level. */
  readonly scale: number;
  readonly rgba: Float32Array;
}

interface PreparedTriangle {
  readonly vertices: readonly [VoxelVector3, VoxelVector3, VoxelVector3];
  readonly radiance: VoxelVector3;
  readonly opacity: number;
  readonly first: VoxelVector3;
  readonly last: VoxelVector3;
}

const MAX_RADIANCE = 1e6;
const MAX_COORDINATE = 1e12;

type MutableVector3 = [number, number, number];

function vector(value: VoxelVector3, name: string): MutableVector3 {
  if (!value || value.length !== 3 || !value.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE)) {
    throw new RangeError(`${name} must contain three finite coordinates within ±${MAX_COORDINATE}.`);
  }
  return [value[0], value[1], value[2]];
}

function radiance(value: VoxelVector3): MutableVector3 {
  const result = vector(value, "radiance");
  if (result.some((n) => n < 0 || n > MAX_RADIANCE)) {
    throw new RangeError(`radiance components must be in [0, ${MAX_RADIANCE}].`);
  }
  return result;
}

function opacity(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("opacity must be finite and in [0, 1].");
  }
  return value;
}

function normalized(value: VoxelVector3, name: string): MutableVector3 {
  const v = vector(value, name);
  const length = Math.hypot(...v);
  if (length < 1e-12) throw new RangeError(`${name} must be nonzero.`);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function indexOf(x: number, y: number, z: number, size: VoxelVector3): number {
  return ((z * size[1] + y) * size[0] + x) * 4;
}

function cross(a: VoxelVector3, b: VoxelVector3): MutableVector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: VoxelVector3, b: VoxelVector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Separating-axis test of a triangle against one axis-aligned cell. */
function overlapsCell(vertices: readonly [VoxelVector3, VoxelVector3, VoxelVector3], center: VoxelVector3, half: VoxelVector3): boolean {
  const v = vertices.map((p) => [p[0] - center[0], p[1] - center[1], p[2] - center[2]] as MutableVector3);
  const edges: MutableVector3[] = [
    [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]],
    [v[2][0] - v[1][0], v[2][1] - v[1][1], v[2][2] - v[1][2]],
    [v[0][0] - v[2][0], v[0][1] - v[2][1], v[0][2] - v[2][2]]
  ];
  const axes: VoxelVector3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], cross(edges[0], edges[1])];
  for (const edge of edges) axes.push([0, edge[2], -edge[1]], [-edge[2], 0, edge[0]], [edge[1], -edge[0], 0]);
  for (const axis of axes) {
    const magnitude = Math.hypot(...axis);
    if (magnitude === 0) continue;
    const a = dot(axis, v[0]);
    const b = dot(axis, v[1]);
    const c = dot(axis, v[2]);
    const radius = Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
    // The tolerance is scaled to the projection rather than the world origin.
    const tolerance = 1e-10 * (radius + magnitude);
    if (Math.min(a, b, c) > radius + tolerance || Math.max(a, b, c) < -radius - tolerance) return false;
  }
  return true;
}

export class VoxelIndirectLighting {
  readonly quality: VoxelLightingQuality;
  readonly resolution: VoxelVector3;
  readonly bounds: { readonly min: VoxelVector3; readonly max: VoxelVector3 };
  readonly execution: { readonly requestedBackend: VoxelLightingBackend; readonly implementation: "cpu"; readonly fallbackReason: string | null };
  private readonly cellSize: VoxelVector3;
  private readonly limits: TierLimits;
  private readonly diagonal: number;
  private data: Float32Array;
  private levels: Level[] | null = null;
  private disposed = false;
  private version = 0;
  private renderTexture: Texture | null = null;
  private renderLevels: readonly VoxelRenderLevel[] = [];
  private renderVersion = -1;
  private readonly changes = new NativeLightingResourceEvents();

  constructor(options: VoxelLightingOptions) {
    if (!options || !options.bounds) throw new TypeError("voxel bounds are required.");
    const quality = options.quality ?? "medium";
    if (!Object.hasOwn(VOXEL_LIGHTING_LIMITS, quality)) throw new RangeError(`Unknown voxel lighting quality: ${quality}.`);
    const backend = options.backend ?? "cpu";
    if (backend !== "cpu" && backend !== "webgl2" && backend !== "webgpu") throw new RangeError(`Unknown voxel backend: ${backend}.`);
    this.quality = quality;
    this.limits = VOXEL_LIGHTING_LIMITS[quality];
    const min = vector(options.bounds.min, "bounds.min");
    const max = vector(options.bounds.max, "bounds.max");
    if (min.some((n, i) => n >= max[i])) throw new RangeError("Each bounds.max component must exceed bounds.min.");
    const source = options.resolution ?? this.limits.maxResolution;
    const size: MutableVector3 = typeof source === "number" ? [source, source, source] : vector(source, "resolution");
    if (size.some((n) => !Number.isInteger(n) || n < 1 || n > this.limits.maxResolution)) {
      throw new RangeError(`resolution must contain integers between 1 and ${this.limits.maxResolution} for ${quality} quality.`);
    }
    const cells: MutableVector3 = [(max[0] - min[0]) / size[0], (max[1] - min[1]) / size[1], (max[2] - min[2]) / size[2]];
    if (cells.some((n) => !Number.isFinite(n) || n < 1e-9)) throw new RangeError("Each voxel cell must be at least 1e-9 world units wide.");
    this.bounds = Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
    this.resolution = Object.freeze(size);
    this.cellSize = cells;
    this.diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    this.execution = Object.freeze({ requestedBackend: backend, implementation: "cpu", fallbackReason: backend === "cpu" ? null
      : "GPU voxelization is unavailable; using the bounded CPU volume. A compatible renderer may trace that volume on the GPU." });
    this.data = new Float32Array(size[0] * size[1] * size[2] * 4);
  }

  get revision(): number { return this.version; }

  /**
   * Observe committed edits and disposal. The returned function detaches this
   * subscription; it never disposes the volume or its texture. Notifications
   * are ordered even when an observer makes another edit, and observer
   * exceptions do not interrupt other subscribers. A late subscriber receives
   * disposal immediately. A nested edit can advance the resource beyond the
   * revision reported by an earlier event.
   */
  onChange(listener: (change: NativeLightingResourceChange) => void): () => void {
    return this.changes.subscribe(listener);
  }

  /** Replace a single cell; null clears it. Changes invalidate the mip pyramid. */
  updateVoxel(coordinates: VoxelVector3, value: VoxelLightingValue | null): void {
    this.assertLive();
    const pos = vector(coordinates, "voxel index");
    if (pos.some((n, i) => !Number.isInteger(n) || n < 0 || n >= this.resolution[i])) throw new RangeError("voxel index is outside the volume.");
    const color = value ? radiance(value.radiance) : [0, 0, 0] as MutableVector3;
    const alpha = value ? opacity(value.opacity) : 0;
    const i = indexOf(pos[0], pos[1], pos[2], this.resolution);
    this.data.set([color[0] * alpha, color[1] * alpha, color[2] * alpha, alpha], i);
    this.changed();
  }

  /**
   * Voxelize surface triangles using a triangle/cell separating-axis test.
   * Existing cell values are front-to-back composited unless `replace` clears
   * the volume first. Work is validated before the existing volume is changed.
   */
  collectTriangles(triangles: readonly VoxelSurfaceTriangle[], options: { readonly replace?: boolean } = {}): { readonly triangles: number; readonly voxelWrites: number } {
    this.assertLive();
    if (!options || (options.replace !== undefined && typeof options.replace !== "boolean")) throw new TypeError("replace must be a boolean.");
    if (!Array.isArray(triangles) || triangles.length > this.limits.maxTriangles) throw new RangeError(`At most ${this.limits.maxTriangles} triangles are allowed per collection.`);
    const prepared: PreparedTriangle[] = [];
    let candidateCells = 0;
    for (const triangle of triangles) {
      if (!triangle || !Array.isArray(triangle.vertices) || triangle.vertices.length !== 3) throw new TypeError("Each triangle needs exactly three vertices.");
      const vertices = [vector(triangle.vertices[0], "triangle vertex"), vector(triangle.vertices[1], "triangle vertex"), vector(triangle.vertices[2], "triangle vertex")] as const;
      const color = radiance(triangle.radiance);
      const alpha = opacity(triangle.opacity ?? 1);
      const a: MutableVector3 = [vertices[1][0] - vertices[0][0], vertices[1][1] - vertices[0][1], vertices[1][2] - vertices[0][2]];
      const b: MutableVector3 = [vertices[2][0] - vertices[0][0], vertices[2][1] - vertices[0][1], vertices[2][2] - vertices[0][2]];
      const area = Math.hypot(...cross(a, b));
      if (area <= 1e-18) throw new RangeError("Degenerate triangles cannot be voxelized.");
      const first: MutableVector3 = [0, 0, 0];
      const last: MutableVector3 = [0, 0, 0];
      let overlaps = true;
      for (let axis = 0; axis < 3; axis += 1) {
        const lo = Math.min(vertices[0][axis], vertices[1][axis], vertices[2][axis]);
        const hi = Math.max(vertices[0][axis], vertices[1][axis], vertices[2][axis]);
        if (hi < this.bounds.min[axis] || lo > this.bounds.max[axis]) { overlaps = false; break; }
        first[axis] = Math.max(0, Math.min(this.resolution[axis] - 1, Math.floor((lo - this.bounds.min[axis]) / this.cellSize[axis] - 1e-9)));
        last[axis] = Math.max(0, Math.min(this.resolution[axis] - 1, Math.floor((hi - this.bounds.min[axis]) / this.cellSize[axis] + 1e-9)));
      }
      if (!overlaps || alpha === 0) continue;
      candidateCells += (last[0] - first[0] + 1) * (last[1] - first[1] + 1) * (last[2] - first[2] + 1);
      if (candidateCells > this.limits.maxCandidateCells) throw new RangeError(`Voxel collection exceeds the ${this.limits.maxCandidateCells} candidate-cell limit.`);
      prepared.push({ vertices, radiance: color, opacity: alpha, first, last });
    }
    if (options.replace) this.data.fill(0);
    let writes = 0;
    const half: VoxelVector3 = [this.cellSize[0] / 2, this.cellSize[1] / 2, this.cellSize[2] / 2];
    for (const triangle of prepared) {
      for (let z = triangle.first[2]; z <= triangle.last[2]; z += 1) {
        for (let y = triangle.first[1]; y <= triangle.last[1]; y += 1) {
          for (let x = triangle.first[0]; x <= triangle.last[0]; x += 1) {
            const center: VoxelVector3 = [this.bounds.min[0] + (x + 0.5) * this.cellSize[0], this.bounds.min[1] + (y + 0.5) * this.cellSize[1], this.bounds.min[2] + (z + 0.5) * this.cellSize[2]];
            if (!overlapsCell(triangle.vertices, center, half)) continue;
            const i = indexOf(x, y, z, this.resolution);
            const remaining = 1 - this.data[i + 3];
            for (let channel = 0; channel < 3; channel += 1) this.data[i + channel] += remaining * triangle.opacity * triangle.radiance[channel];
            this.data[i + 3] += remaining * triangle.opacity;
            writes += 1;
          }
        }
      }
    }
    if (options.replace || writes > 0) this.changed();
    return { triangles: prepared.length, voxelWrites: writes };
  }

  clear(): void {
    this.assertLive();
    this.data.fill(0);
    this.changed();
  }

  /** Return a caller-owned immutable-by-convention copy for upload or inspection. */
  snapshot(): VoxelVolumeSnapshot {
    this.assertLive();
    return { bounds: this.bounds, resolution: this.resolution, revision: this.version, rgba: this.data.slice() };
  }

  /** Synchronize the complete filtered pyramid for an explicit renderer consumer. */
  renderData(): VoxelIndirectRenderData {
    this.assertLive();
    if (!this.renderTexture || this.renderTexture.disposed || this.renderVersion !== this.version) {
      const levels = this.getLevels();
      const metadata: VoxelRenderLevel[] = [];
      let texels = 0;
      for (const level of levels) {
        metadata.push(Object.freeze({ dimensions: Object.freeze([...level.dimensions]) as VoxelVector3, scale: level.scale, offset: texels }));
        texels += level.rgba.length / 4;
      }
      const width = Math.min(1024, this.data.length / 4);
      const height = Math.ceil(texels / width);
      const packed = new Float32Array(width * height * 4);
      for (let level = 0; level < levels.length; level += 1) packed.set(levels[level].rgba, metadata[level].offset * 4);
      if (!this.renderTexture || this.renderTexture.disposed) {
        this.renderTexture = new Texture({ width, height, format: "rgba32f", colorSpace: "linear", data: packed, dynamic: true,
          generateMipmaps: false, label: "voxel-indirect-lighting" });
      } else {
        this.renderTexture.updateMip(0, packed);
      }
      this.renderLevels = Object.freeze(metadata);
      this.renderVersion = this.version;
    }
    return { texture: this.renderTexture, bounds: this.bounds, resolution: this.resolution, levels: this.renderLevels,
      maxConeSteps: this.limits.maxConeSteps, hemisphereCones: this.limits.hemisphereCones, revision: this.renderVersion };
  }

  /** Trilinearly sample the unfiltered base volume at a world-space location. */
  sampleVoxel(position: VoxelVector3): VoxelLightingValue {
    this.assertLive();
    const rgba = this.sampleLevel({ dimensions: this.resolution, scale: 1, rgba: this.data }, vector(position, "position"));
    const alpha = rgba[3];
    return { radiance: alpha > 0 ? [rgba[0] / alpha, rgba[1] / alpha, rgba[2] / alpha] : [0, 0, 0], opacity: alpha };
  }

  /** Trace one bounded cone using filtered premultiplied radiance and coverage. */
  traceCone(options: VoxelConeTraceOptions): VoxelConeTraceResult {
    this.assertLive();
    if (!options) throw new TypeError("cone options are required.");
    const origin = vector(options.origin, "cone origin");
    const direction = normalized(options.direction, "cone direction");
    const halfAngle = options.halfAngle ?? Math.PI / 6;
    if (!Number.isFinite(halfAngle) || halfAngle < 0 || halfAngle >= Math.PI / 2) throw new RangeError("halfAngle must be in [0, π/2).");
    const maximum = options.maxDistance ?? this.diagonal;
    const start = options.startDistance ?? Math.min(maximum, Math.min(...this.cellSize) * 0.5);
    if (!Number.isFinite(maximum) || maximum <= 0 || maximum > this.diagonal * 4) throw new RangeError("maxDistance must be positive and no more than four volume diagonals.");
    if (!Number.isFinite(start) || start < 0 || start > maximum) throw new RangeError("startDistance must be between zero and maxDistance.");
    let enter = start;
    let exit = maximum;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(direction[axis]) < 1e-12) {
        if (origin[axis] < this.bounds.min[axis] || origin[axis] > this.bounds.max[axis]) return { radiance: [0, 0, 0], transmittance: 1, samples: 0, truncated: false };
        continue;
      }
      const d0 = (this.bounds.min[axis] - origin[axis]) / direction[axis];
      const d1 = (this.bounds.max[axis] - origin[axis]) / direction[axis];
      enter = Math.max(enter, Math.min(d0, d1));
      exit = Math.min(exit, Math.max(d0, d1));
    }
    if (enter > exit) return { radiance: [0, 0, 0], transmittance: 1, samples: 0, truncated: false };
    const levels = this.getLevels();
    // A world-space step must advance at most one cell along the ray even
    // when the grid has different cell sizes along its axes.
    const base = 1 / Math.hypot(direction[0] / this.cellSize[0], direction[1] / this.cellSize[1], direction[2] / this.cellSize[2]);
    let distance = enter;
    let transmittance = 1;
    let count = 0;
    const result: MutableVector3 = [0, 0, 0];
    while (distance <= exit && count < this.limits.maxConeSteps && transmittance > 1e-4) {
      const diameter = Math.max(base, 2 * distance * Math.tan(halfAngle));
      const lod = Math.min(levels.length - 1, Math.max(0, Math.log2(diameter / base)));
      const low = Math.floor(lod);
      const high = Math.min(levels.length - 1, low + 1);
      const fraction = lod - low;
      const point: VoxelVector3 = [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance];
      const a = this.sampleLevel(levels[low], point);
      const b = high === low ? a : this.sampleLevel(levels[high], point);
      const alpha = a[3] + (b[3] - a[3]) * fraction;
      for (let channel = 0; channel < 3; channel += 1) result[channel] += transmittance * (a[channel] + (b[channel] - a[channel]) * fraction);
      transmittance *= 1 - alpha;
      count += 1;
      distance += Math.max(base, diameter * 0.5);
    }
    return { radiance: result, transmittance, samples: count, truncated: distance <= exit && transmittance > 1e-4 };
  }

  /** Approximate Lambertian outgoing radiance for unit albedo by hemisphere cones. */
  sampleIndirect(position: VoxelVector3, normal: VoxelVector3, maxDistance?: number): VoxelVector3 {
    this.assertLive();
    const n = normalized(normal, "surface normal");
    const tangent = normalized(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n), "tangent");
    const bitangent = cross(n, tangent);
    const count = this.limits.hemisphereCones;
    const result: MutableVector3 = [0, 0, 0];
    let weightSum = 0;
    for (let i = 0; i < count; i += 1) {
      const ring = i === 0 ? 0 : Math.SQRT1_2;
      const weight = i === 0 ? 1 : Math.SQRT1_2;
      const azimuth = 2 * Math.PI * (i - 1) / Math.max(1, count - 1);
      const u = Math.cos(azimuth) * ring;
      const v = Math.sin(azimuth) * ring;
      const direction: VoxelVector3 = [n[0] * weight + tangent[0] * u + bitangent[0] * v, n[1] * weight + tangent[1] * u + bitangent[1] * v, n[2] * weight + tangent[2] * u + bitangent[2] * v];
      const sampled = this.traceCone({ origin: position, direction, maxDistance, halfAngle: count === 1 ? Math.PI / 4 : Math.PI / 6 });
      for (let channel = 0; channel < 3; channel += 1) result[channel] += sampled.radiance[channel] * weight;
      weightSum += weight;
    }
    return [result[0] / weightSum, result[1] / weightSum, result[2] / weightSum];
  }

  /** Frees this volume's owned storage; snapshots already returned remain valid. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderTexture?.dispose();
    this.renderTexture = null;
    this.renderLevels = [];
    this.data = new Float32Array(0);
    this.levels = null;
    this.changes.emit(this.version, true);
  }

  private assertLive(): void { if (this.disposed) throw new Error("Voxel indirect lighting volume has been disposed."); }
  private changed(): void { this.version += 1; this.levels = null; this.changes.emit(this.version); }

  private getLevels(): Level[] {
    if (this.levels) return this.levels;
    const levels: Level[] = [{ dimensions: this.resolution, scale: 1, rgba: this.data }];
    let previous = levels[0];
    while (previous.dimensions.some((n) => n > 1)) {
      const dims: VoxelVector3 = [Math.ceil(previous.dimensions[0] / 2), Math.ceil(previous.dimensions[1] / 2), Math.ceil(previous.dimensions[2] / 2)];
      const data = new Float32Array(dims[0] * dims[1] * dims[2] * 4);
      for (let z = 0; z < dims[2]; z += 1) for (let y = 0; y < dims[1]; y += 1) for (let x = 0; x < dims[0]; x += 1) {
        const dest = indexOf(x, y, z, dims);
        let cells = 0;
        for (let dz = 0; dz < 2; dz += 1) for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
          const sx = x * 2 + dx; const sy = y * 2 + dy; const sz = z * 2 + dz;
          if (sx >= previous.dimensions[0] || sy >= previous.dimensions[1] || sz >= previous.dimensions[2]) continue;
          const source = indexOf(sx, sy, sz, previous.dimensions);
          // An odd-sized edge cell covers fewer base cells. Weighting by its
          // actual footprint preserves the volume average at every level.
          const weight = Math.min(previous.scale, this.resolution[0] - sx * previous.scale)
            * Math.min(previous.scale, this.resolution[1] - sy * previous.scale)
            * Math.min(previous.scale, this.resolution[2] - sz * previous.scale);
          for (let channel = 0; channel < 4; channel += 1) data[dest + channel] += previous.rgba[source + channel] * weight;
          cells += weight;
        }
        for (let channel = 0; channel < 4; channel += 1) data[dest + channel] /= cells;
      }
      previous = { dimensions: dims, scale: previous.scale * 2, rgba: data };
      levels.push(previous);
    }
    this.levels = levels;
    return levels;
  }

  private sampleLevel(level: Level, position: VoxelVector3): [number, number, number, number] {
    if (position.some((n, axis) => n < this.bounds.min[axis] || n > this.bounds.max[axis])) return [0, 0, 0, 0];
    const lower: MutableVector3 = [0, 0, 0];
    const upper: MutableVector3 = [0, 0, 0];
    const fraction: MutableVector3 = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const p = (position[axis] - this.bounds.min[axis]) / (this.bounds.max[axis] - this.bounds.min[axis]) * this.resolution[axis];
      const last = level.dimensions[axis] - 1;
      const center = (i: number): number => (i * level.scale + Math.min((i + 1) * level.scale, this.resolution[axis])) / 2;
      if (last === 0 || p <= center(0)) {
        lower[axis] = upper[axis] = 0;
        fraction[axis] = 0;
      } else if (p >= center(last)) {
        lower[axis] = upper[axis] = last;
        fraction[axis] = 0;
      } else {
        const raw = Math.min(last - 1, Math.max(0, Math.floor(p / level.scale - 0.5)));
        lower[axis] = raw;
        upper[axis] = raw + 1;
        fraction[axis] = (p - center(raw)) / (center(raw + 1) - center(raw));
      }
    }
    const out: [number, number, number, number] = [0, 0, 0, 0];
    for (let z = 0; z < 2; z += 1) for (let y = 0; y < 2; y += 1) for (let x = 0; x < 2; x += 1) {
      const weight = (x ? fraction[0] : 1 - fraction[0]) * (y ? fraction[1] : 1 - fraction[1]) * (z ? fraction[2] : 1 - fraction[2]);
      const i = indexOf(x ? upper[0] : lower[0], y ? upper[1] : lower[1], z ? upper[2] : lower[2], level.dimensions);
      for (let channel = 0; channel < 4; channel += 1) out[channel] += level.rgba[i + channel] * weight;
    }
    return out;
  }
}

export function createVoxelIndirectLighting(options: VoxelLightingOptions): VoxelIndirectLighting {
  return new VoxelIndirectLighting(options);
}
