/**
 * PRD-10 §7.1.4 — `world.terrain` builder types + `AuraTerrainHandle`.
 *
 * The PRD signature is `world.terrain(options): AuraNodeBuilder<AuraTerrainNode>
 * & { handle }`. `AuraSceneNode` is a closed union (index.ts) until qr-request
 * #135 lands the world node kinds, so for now this returns a lane-local
 * `AuraWorldNodeBuilder` facade with the same shape (`toJSON()` + fluent
 * transforms + `handle`); `scene().add(node.toJSON() as unknown as
 * AuraSceneNode)` works at runtime because node dispatch is by `kind`.
 */
import type { AuraAssetRef, AuraColor, AuraVec3 } from "../index.js";
import type { AuraTiered, AuraTierValue, AuraWorldNodeBase } from "./types.js";
import {
  terrainHeightBilinear,
  terrainMacroNormal,
  type TerrainHeightGrid
} from "@aura3d/rendering/world";

// ---------------------------------------------------------------- options --

export type AuraHeightSource =
  | { readonly kind: "asset"; readonly asset: AuraAssetRef<"texture">; readonly encoding: "png16" | "r32f" | "exr" }
  | {
      readonly kind: "procedural";
      readonly seed: number;
      readonly octaves?: number;
      readonly baseFrequency?: number;
      readonly ridged?: number;
      readonly terrace?: number;
      readonly flatten?: readonly { readonly shape: AuraWorldShape; readonly height: number; readonly falloff: number }[];
    }
  | { readonly kind: "array"; readonly columns: number; readonly rows: number; readonly heights: Float32Array };

export type AuraWorldShape =
  | { readonly kind: "circle"; readonly center: readonly [number, number]; readonly radius: number }
  | { readonly kind: "polygon"; readonly points: readonly (readonly [number, number])[] }
  | { readonly kind: "spline"; readonly spline: unknown /* AuraSplineHandle — lands with world.spline */; readonly width: number };

export interface AuraTerrainLayerSpec {
  readonly name: string;
  readonly preset?:
    | "grass-meadow" | "grass-dry" | "dirt-path" | "rock-cliff" | "rock-scree"
    | "sand-beach" | "snow" | "forest-floor" | "asphalt" | "gravel";
  readonly albedoHeight?: AuraAssetRef<"texture">;
  readonly normal?: AuraAssetRef<"texture">;
  readonly orm?: AuraAssetRef<"texture">;
  readonly uvScale?: number;
  readonly triplanar?: boolean;
  readonly heightBlend?: number;
  readonly tint?: AuraColor;
  readonly roughnessBias?: number;
}

export type AuraSplatSpec =
  | {
      readonly kind: "texture";
      readonly maps:
        | readonly [AuraAssetRef<"texture">]
        | readonly [AuraAssetRef<"texture">, AuraAssetRef<"texture">];
    }
  | {
      readonly kind: "auto";
      readonly rules: readonly AuraSplatRule[];
      readonly resolution?: AuraTiered<512 | 1024 | 2048>;
    };

export interface AuraSplatRule {
  readonly layer: string;
  readonly slopeDeg?: readonly [number, number];
  readonly height?: readonly [number, number];
  readonly curvature?: readonly [number, number];
  readonly noise?: { readonly scale: number; readonly threshold: number; readonly seed?: number };
  readonly mask?: AuraWorldShape;
  readonly weight?: number;
  readonly falloff?: number;
}

export interface AuraTerrainOptions extends AuraWorldNodeBase {
  /** Stable node id (diagnostics + `app.world.terrain(id)`); auto-assigned when omitted. */
  readonly id?: string;
  readonly height: AuraHeightSource;
  readonly size: readonly [number, number];
  readonly heightScale?: number;
  readonly origin?: AuraVec3;
  readonly layers: readonly AuraTerrainLayerSpec[];
  readonly splat?: AuraSplatSpec;
  readonly holes?: readonly AuraWorldShape[];
  readonly lod?: {
    readonly patchSize?: AuraTiered<32 | 64>;
    readonly levels?: AuraTiered<number>;
    readonly morphRatio?: number;
  };
  readonly collider?: boolean | { readonly friction?: number; readonly restitution?: number };
  readonly castShadow?: boolean;
  readonly macroVariation?: number;
}

export interface AuraTerrainNode extends AuraWorldNodeBase {
  readonly kind: "terrain";
  readonly options: AuraTerrainOptions;
  readonly id: string;
}

export interface AuraTerrainHandle {
  readonly id: string;
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number): AuraVec3;
  slopeDegAt(x: number, z: number): number;
  layerWeightsAt(x: number, z: number): Readonly<Record<string, number>>;
  raycast(origin: AuraVec3, direction: AuraVec3, maxDistance?: number): { readonly point: AuraVec3; readonly distance: number } | null;
}

// ---------------------------------------------------------- terrain record --

/** Mutable per-node record shared by the builder, the queries providers and the compile handler. */
export interface TerrainRecord {
  readonly node: AuraTerrainNode;
  readonly options: AuraTerrainOptions;
  readonly origin: AuraVec3;
  readonly size: readonly [number, number];
  readonly heightScale: number;
  /** Set when the height source resolves ("array"/"procedural" at build, "asset" at compile). */
  grid: TerrainHeightGrid | null;
  /** Bumped by `world.extrude` conformToTerrain edits so the runtime re-uploads heights. */
  gridVersion?: number;
}

/** module-level registry keyed by node id — the C-36 handler fills `grid` for asset sources. */
const terrainRecords = new Map<string, TerrainRecord>();
export function terrainRecordFor(id: string): TerrainRecord | undefined {
  return terrainRecords.get(id);
}
export function terrainRecordIds(): readonly string[] {
  return [...terrainRecords.keys()];
}

// ------------------------------------------------------------ height fields --

/** Deterministic value-noise (seeded) for the `procedural` height source. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695040888963) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c + (d - c) * sx - a - (b - a) * sx) * sz;
}

/** fbm/ridged/terraced/flatten height generator (§7.1.4 procedural source). */
export function proceduralHeightfield(
  seed: number,
  columns: number,
  rows: number,
  options: { readonly octaves?: number; readonly baseFrequency?: number; readonly ridged?: number; readonly terrace?: number; readonly flatten?: readonly { readonly shape: AuraWorldShape; readonly height: number; readonly falloff: number }[] } = {}
): Float32Array {
  const octaves = options.octaves ?? 5;
  const baseFrequency = options.baseFrequency ?? 4;
  const ridged = options.ridged ?? 0;
  const terrace = options.terrace ?? 0;
  const heights = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const u = c / Math.max(1, columns - 1);
      const v = r / Math.max(1, rows - 1);
      let h = 0;
      let amp = 0.5;
      let freq = baseFrequency;
      let norm = 0;
      for (let o = 0; o < octaves; o += 1) {
        let n = valueNoise(u * freq, v * freq, seed + o * 101);
        if (ridged > 0) {
          n = 1 - Math.abs(2 * n - 1); // ridged multifractal
          n = n * n;
          h += amp * ((1 - ridged) * valueNoise(u * freq, v * freq, seed + o * 101) + ridged * n);
        } else {
          h += amp * n;
        }
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      h /= norm;
      if (terrace > 0) {
        const t = Math.max(1, Math.round(1 / Math.min(1, terrace)));
        h = Math.round(h * t) / t;
      }
      heights[r * columns + c] = h;
    }
  }
  if (options.flatten) {
    for (const { shape, height, falloff } of options.flatten) {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          const u = c / Math.max(1, columns - 1);
          const v = r / Math.max(1, rows - 1);
          const d = shapeDistanceUv(shape, u, v);
          if (d < falloff) {
            const t = falloff <= 0 ? 1 : 1 - d / falloff;
            const s = t * t * (3 - 2 * t);
            const i = r * columns + c;
            heights[i] = heights[i]! * (1 - s) + height * s;
          }
        }
      }
    }
  }
  return heights;
}

/** uv-space distance to a shape (0 inside). */
function shapeDistanceUv(shape: AuraWorldShape, u: number, v: number): number {
  if (shape.kind === "circle") {
    return Math.max(0, Math.hypot(u - shape.center[0], v - shape.center[1]) - shape.radius);
  }
  if (shape.kind === "polygon") {
    // inside test via winding; distance to nearest edge when outside
    let inside = false;
    let minD = Infinity;
    const pts = shape.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
      const ex = xj - xi;
      const ey = yj - yi;
      const t = Math.max(0, Math.min(1, ((u - xi) * ex + (v - yi) * ey) / (ex * ex + ey * ey || 1)));
      minD = Math.min(minD, Math.hypot(u - (xi + t * ex), v - (yi + t * ey)));
    }
    return inside ? 0 : minD;
  }
  return Infinity; // spline shapes resolve in the street/spline phase
}

/** Resolve the height grid for array/procedural sources; `asset` stays pending until the C-36 handler resolves it. */
export function resolveTerrainGrid(options: AuraTerrainOptions): TerrainHeightGrid | null {
  const h = options.height;
  if (h.kind === "array") {
    return { columns: h.columns, rows: h.rows, heights: h.heights };
  }
  if (h.kind === "procedural") {
    const columns = 257;
    const rows = 257;
    return { columns, rows, heights: proceduralHeightfield(h.seed, columns, rows, h) };
  }
  return null; // asset — bound by the compile handler (T2.7) via ctx.assets
}

// ------------------------------------------------------------------ handle --

function shapeInsideWorld(shape: AuraWorldShape, x: number, z: number, origin: AuraVec3, size: readonly [number, number]): boolean {
  const u = (x - origin[0]) / size[0];
  const v = (z - origin[2]) / size[1];
  return shapeDistanceUv(shape, u, v) === 0;
}

export function isHoleAt(record: TerrainRecord, x: number, z: number): boolean {
  const holes = record.options.holes;
  if (!holes || holes.length === 0) return false;
  return holes.some((s) => shapeInsideWorld(s, x, z, record.origin, record.size));
}

export function createTerrainHandle(record: TerrainRecord): AuraTerrainHandle {
  const { origin, size, heightScale } = record;
  const gridOf = (): TerrainHeightGrid | null => record.grid;
  const toUv = (x: number, z: number): readonly [number, number] | null => {
    const u = (x - origin[0]) / size[0];
    const v = (z - origin[2]) / size[1];
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return [u, v];
  };
  return {
    id: record.node.id,
    heightAt(x, z) {
      const uv = toUv(x, z);
      const grid = gridOf();
      if (!uv || !grid) return 0;
      return terrainHeightBilinear(grid, uv, heightScale);
    },
    normalAt(x, z) {
      const uv = toUv(x, z);
      const grid = gridOf();
      if (!uv || !grid) return [0, 1, 0];
      const texel = (size[0] / Math.max(1, grid.columns - 1) + size[1] / Math.max(1, grid.rows - 1)) / 2;
      const [nx, ny, nz] = terrainMacroNormal(grid, uv, texel, heightScale);
      return [nx, ny, nz];
    },
    slopeDegAt(x, z) {
      const [, ny] = this.normalAt(x, z);
      return (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
    },
    layerWeightsAt(x, z) {
      return layerWeightsAt(record, x, z);
    },
    raycast(rayOrigin, direction, maxDistance = 10000) {
      const grid = gridOf();
      if (!grid) return null;
      // Ray-march the footprint, then bisect-refine on the sign change.
      const step = Math.min(size[0], size[1]) / Math.max(1, grid.columns - 1);
      let t = 0;
      let prevT = 0;
      let prevDelta = rayOrigin[1] - (grid ? this.heightAt(rayOrigin[0], rayOrigin[2]) : 0);
      const dir = direction;
      while (t <= maxDistance) {
        const px = rayOrigin[0] + dir[0] * t;
        const py = rayOrigin[1] + dir[1] * t;
        const pz = rayOrigin[2] + dir[2] * t;
        const uv = toUv(px, pz);
        if (uv) {
          const delta = py - terrainHeightBilinear(grid, uv, heightScale);
          if (delta <= 0) {
            // bisect between prevT and t
            let lo = prevT;
            let hi = t;
            for (let i = 0; i < 24; i += 1) {
              const mid = (lo + hi) / 2;
              const mx = rayOrigin[0] + dir[0] * mid;
              const my = rayOrigin[1] + dir[1] * mid;
              const mz = rayOrigin[2] + dir[2] * mid;
              const muv = toUv(mx, mz);
              if (muv && my - terrainHeightBilinear(grid, muv, heightScale) <= 0) hi = mid;
              else lo = mid;
            }
            const hx = rayOrigin[0] + dir[0] * hi;
            const hy = rayOrigin[1] + dir[1] * hi;
            const hz = rayOrigin[2] + dir[2] * hi;
            return { point: [hx, hy, hz], distance: hi };
          }
          prevDelta = delta;
        }
        prevT = t;
        t += Math.max(0.5, step);
      }
      void prevDelta;
      return null;
    }
  };
}

/** Resolve `AuraTiered<T>` against the app's quality tier. */
export function resolveTierValue<T>(value: T | AuraTierValue<T>, tier: string): T {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const tiered = value as AuraTierValue<T>;
    return (tiered[tier as keyof AuraTierValue<T>] ?? tiered.high ?? tiered.medium ?? tiered.low ?? tiered.ultra ?? Object.values(tiered)[0]) as T;
  }
  return value as T;
}

// ---------------------------------------------------------- splat weights --

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rangeWeight(value: number, range: readonly [number, number] | undefined, falloff = 0.1): number {
  if (!range) return 1;
  const [lo, hi] = range;
  if (value < lo || value > hi) return 0;
  const edge = Math.max(1e-6, (hi - lo) * falloff);
  return Math.min(smooth01((value - lo) / edge), smooth01((hi - value) / edge));
}
function smooth01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/**
 * CPU splat eval — mirrors the SplatBake GPU pass (T2.5) 1:1 so
 * `layerWeightsAt` and the baked splat texture agree (±1/255).
 */
export function evalSplatRules(
  rules: readonly AuraSplatRule[],
  layers: readonly AuraTerrainLayerSpec[],
  sample: { readonly slopeDeg: number; readonly heightNorm: number; readonly u: number; readonly v: number }
): Readonly<Record<string, number>> {
  const weights = new Map<string, number>();
  const layerNames = layers.map((l) => l.name);
  for (const rule of rules) {
    const i = layerNames.indexOf(rule.layer);
    if (i < 0) continue;
    const base = rule.weight ?? 1;
    let w = base * rangeWeight(sample.slopeDeg, rule.slopeDeg, rule.falloff ?? 0.1) * rangeWeight(sample.heightNorm, rule.height, rule.falloff ?? 0.1);
    if (rule.curvature) w *= 1; // curvature eval lands with the GPU bake (kept for parity)
    if (rule.noise) {
      const n = valueNoise(sample.u * rule.noise.scale, sample.v * rule.noise.scale, rule.noise.seed ?? 0);
      w *= n >= rule.noise.threshold ? 1 : 0;
    }
    if (w > 0) weights.set(rule.layer, (weights.get(rule.layer) ?? 0) + w);
  }
  // unassigned remainder goes to the first layer (matches RULES_DEFAULT rest = grass/dirt)
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const remainder = Math.max(0, 1 - total);
  weights.set(layerNames[0]!, (weights.get(layerNames[0]!) ?? 0) + remainder);
  const sum = [...weights.values()].reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [name, w] of weights) out[name] = w / sum;
  return out;
}

/**
 * Default auto-splat (§7.1.4 `splat` default): slope→rock, height→snow,
 * remainder grass/dirt noise — the formula `resolveTerrainSlopeBlend` uses,
 * expressed as AuraSplatRule equivalents for ≥4-layer terrains.
 */
export function defaultSplatRules(layers: readonly AuraTerrainLayerSpec[]): readonly AuraSplatRule[] {
  const names = new Set(layers.map((l) => l.name));
  const rules: AuraSplatRule[] = [];
  if (names.has("rock") || names.has("rock-cliff") || names.has("rock-scree")) {
    rules.push({ layer: layers.find((l) => /rock/.test(l.name))!.name, slopeDeg: [25, 90], weight: 1, falloff: 0.1 });
  }
  if (names.has("snow")) {
    rules.push({ layer: "snow", height: [0.7, 1], weight: 1, falloff: 0.1 });
  }
  if (names.has("sand") || names.has("sand-beach")) {
    rules.push({ layer: layers.find((l) => /sand/.test(l.name))!.name, height: [0, 0.08], weight: 1, falloff: 0.1 });
  }
  return rules;
}

export function layerWeightsAt(record: TerrainRecord, x: number, z: number): Readonly<Record<string, number>> {
  const grid = record.grid;
  if (!grid) return {};
  const { layers, splat } = record.options;
  const u = (x - record.origin[0]) / record.size[0];
  const v = (z - record.origin[2]) / record.size[1];
  const hNorm = terrainHeightBilinear(grid, [clamp01(u), clamp01(v)], 1);
  const texel = (record.size[0] / Math.max(1, grid.columns - 1) + record.size[1] / Math.max(1, grid.rows - 1)) / 2;
  const [, ny] = terrainMacroNormal(grid, [clamp01(u), clamp01(v)], texel, record.heightScale);
  const slopeDeg = (Math.acos(Math.min(1, Math.max(-1, ny))) * 180) / Math.PI;
  const rules = splat?.kind === "auto" ? splat.rules : defaultSplatRules(layers);
  if (splat?.kind === "texture") {
    // texture splats resolve at compile; fall back to uniform first-layer weights
    const out: Record<string, number> = {};
    for (const l of layers) out[l.name] = l === layers[0] ? 1 : 0;
    return out;
  }
  return evalSplatRules(rules, layers, { slopeDeg, heightNorm: hNorm, u, v });
}

// ---------------------------------------------------------------- collider --

/**
 * Row-major heightfield spec for the physics collider (T2.6). Matches
 * `RowMajorHeightfield` in `physics-rapier/src/HeightfieldLayout.ts` — feed
 * `heights` through `toRapierHeightfieldHeights` before handing it to Rapier,
 * or `Shape.heightfield(rows2d, cellSize)` for the solverless runtime.
 */
export function terrainColliderSpec(
  record: TerrainRecord
): { readonly rows: number; readonly columns: number; readonly heights: Float32Array; readonly cellSize: number; readonly friction: number; readonly restitution: number } | null {
  const grid = record.grid;
  if (!grid || record.options.collider === false) return null; // collider defaults on (§7.1.4)
  const opts = typeof record.options.collider === "object" ? record.options.collider : {};
  const cellSize = (record.size[0] / Math.max(1, grid.columns - 1) + record.size[1] / Math.max(1, grid.rows - 1)) / 2;
  const heights = new Float32Array(grid.heights.length);
  for (let i = 0; i < grid.heights.length; i += 1) heights[i] = grid.heights[i]! * record.heightScale + record.origin[1];
  return {
    rows: grid.rows,
    columns: grid.columns,
    heights,
    cellSize,
    friction: opts.friction ?? 0.8,
    restitution: opts.restitution ?? 0
  };
}

// ----------------------------------------------------------------- builder --

let terrainSeq = 0;

/**
 * Interim builder (qr-request #135): same fluent surface as `AuraNodeBuilder`
 * for the fields world nodes use. Swaps to `AuraNodeBuilder<AuraTerrainNode>`
 * when the union carve lands.
 */
export class AuraWorldNodeBuilder<TNode extends { readonly kind: string }> {
  protected node: Record<string, unknown>;
  constructor(node: Record<string, unknown>) {
    this.node = node;
  }
  position(x: number, y: number, z: number): this {
    this.node = { ...this.node, position: [x, y, z] };
    return this;
  }
  rotate(x: number, y: number, z: number): this {
    this.node = { ...this.node, rotation: [x, y, z] };
    return this;
  }
  scale(value: number | AuraVec3): this {
    this.node = { ...this.node, scale: value };
    return this;
  }
  name(value: string): this {
    this.node = { ...this.node, name: value };
    return this;
  }
  toJSON(): TNode {
    return this.node as TNode;
  }
  get nodeKind(): string {
    return (this.node as { kind: string }).kind;
  }
}

export type AuraTerrainBuilder = AuraWorldNodeBuilder<AuraTerrainNode> & { readonly handle: AuraTerrainHandle };

/** §7.1.4 `world.terrain(options)`. */
export function worldTerrain(options: AuraTerrainOptions): AuraTerrainBuilder {
  if (!options.size || options.size[0] <= 0 || options.size[1] <= 0) {
    throw new Error("world.terrain: size must be positive metres [x, z]");
  }
  if (!options.layers || options.layers.length < 1 || options.layers.length > 8) {
    throw new Error("world.terrain: 1..8 layers required");
  }
  const id = options.id ?? `terrain-${++terrainSeq}`;
  const node: AuraTerrainNode = {
    kind: "terrain",
    id,
    name: options.name ?? id,
    options
  };
  const record: TerrainRecord = {
    node,
    options,
    origin: options.origin ?? [0, 0, 0],
    size: options.size,
    heightScale: options.heightScale ?? 1,
    grid: resolveTerrainGrid(options)
  };
  terrainRecords.set(id, record);
  const handle = createTerrainHandle(record);
  const builder = new AuraWorldNodeBuilder<AuraTerrainNode>({ ...node }) as AuraTerrainBuilder;
  Object.defineProperty(builder, "handle", { value: handle, enumerable: true });
  return builder;
}
