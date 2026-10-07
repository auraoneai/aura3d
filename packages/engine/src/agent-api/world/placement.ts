/**
 * PRD-10 §7.1.7 / T5.4 — `world.placeAlong`, `world.placeGrid`,
 * `world.placePoisson`: matrix-composed placement helpers.
 *
 * All three emit ONE `scatter` node with explicit `placements` per unique
 * asset (§7.1.5) — the same contract kits honour. Node-producing items
 * (`() => AuraSceneNode`) emit one positioned node per instance instead.
 */
import type { AuraAssetRef, AuraLightNode, AuraSceneNode, AuraVec3 } from "../index.js";
import type { AuraWorldShape } from "./terrain.js";
import { terrainRecordFor, type AuraTerrainHandle, type TerrainRecord } from "./terrain.js";
import { scatterChecksum, scatterRng, SCATTER_CELL_SIZE, type AuraScatterNode, type AuraScatterPlacement } from "./scatter.js";
import type { AuraKitPieceSpec } from "./kits.js";
import type { AuraSplineHandle } from "./spline.js";

type V3 = [number, number, number];

export type AuraPlaceItem = AuraAssetRef<"model"> | AuraKitPieceSpec | (() => AuraSceneNode);

interface EmitContext {
  readonly nodes: AuraSceneNode[];
  readonly byAsset: Map<string, { asset: AuraAssetRef<"model">; rows: number[] }>;
}

const itemAsset = (item: AuraPlaceItem): AuraAssetRef<"model"> | null => {
  if (typeof item === "function") return null;
  if ("asset" in item) return item.asset;          // AuraKitPieceSpec
  return item;                                      // AuraAssetRef<"model">
};

/** mat3x4 row-major: full 3×3 basis (columns right/up/forward) + translate. */
const pushBasisMatrix = (rows: number[], right: V3, up: V3, forward: V3, position: V3, scl: number): void => {
  rows.push(
    right[0] * scl, right[1] * scl, right[2] * scl, position[0],
    up[0] * scl, up[1] * scl, up[2] * scl, position[1],
    forward[0] * scl, forward[1] * scl, forward[2] * scl, position[2]
  );
};

const pushYawMatrix = (rows: number[], position: V3, yawDeg: number, scl: number): void => {
  const c = Math.cos((yawDeg * Math.PI) / 180) * scl;
  const s = Math.sin((yawDeg * Math.PI) / 180) * scl;
  rows.push(c, 0, s, position[0], 0, scl, 0, position[1], -s, 0, c, position[2]);
};

const groundY = (ground: AuraTerrainHandle | string | true | undefined, x: number, z: number): number => {
  if (!ground || ground === true) return 0;
  const id = typeof ground === "string" ? ground : ground.id;
  const record = terrainRecordFor(id);
  return record?.grid ? terrainHeight(record as TerrainRecord & { grid: NonNullable<TerrainRecord["grid"]> }, x, z) : 0;
};

const terrainHeight = (record: TerrainRecord & { grid: NonNullable<TerrainRecord["grid"]> }, x: number, z: number): number => {
  const g = record.grid;
  const u = (x - record.origin[0]) / Math.max(1e-6, record.size[0]);
  const v = (z - record.origin[2]) / Math.max(1e-6, record.size[1]);
  const gx = Math.min(g.columns - 1, Math.max(0, Math.round(u * (g.columns - 1))));
  const gz = Math.min(g.rows - 1, Math.max(0, Math.round(v * (g.rows - 1))));
  return g.heights[gz * g.columns + gx]! * record.heightScale;
};

const emitInstance = (
  ctx: EmitContext,
  item: AuraPlaceItem,
  basis: { right: V3; up: V3; forward: V3 } | null,
  position: V3,
  yawDeg: number,
  scale: number
): void => {
  if (typeof item === "function") {
    const node = item();
    ctx.nodes.push({ ...node, position } as AuraSceneNode);
    return;
  }
  const asset = itemAsset(item)!;
  const assetKey = asset.id ?? asset.url;
  let bucket = ctx.byAsset.get(assetKey);
  if (!bucket) {
    bucket = { asset, rows: [] };
    ctx.byAsset.set(assetKey, bucket);
  }
  if (basis) pushBasisMatrix(bucket.rows, basis.right, basis.up, basis.forward, position, scale);
  else pushYawMatrix(bucket.rows, position, yawDeg, scale);
  // kit pieces can carry practical lights — emit them at socket offsets so
  // placeAlong(spline, kit.piece("street-lamp")) produces real light nodes.
  if ("sockets" in item && item.lights?.length) {
    const effYaw = basis ? (Math.atan2(basis.forward[0], basis.forward[2]) * 180) / Math.PI : yawDeg;
    const c = Math.cos((effYaw * Math.PI) / 180), s = Math.sin((effYaw * Math.PI) / 180);
    for (const light of item.lights) {
      const socket = item.sockets![light.socket];
      if (!socket) continue;
      const [sx, sy, sz] = socket.position;
      const node: AuraLightNode = {
        kind: "light",
        light: light.light,
        name: `${item.id}-light`,
        position: [position[0] + sx * c + sz * s, position[1] + sy, position[2] - sx * s + sz * c],
        intensity: light.intensity
      };
      ctx.nodes.push({
        ...node,
        ...(light.color ? { color: light.color } : {}),
        ...(light.power ? { power: light.power } : {}),
        ...(light.distance ? { distance: light.distance } : {}),
        ...(light.decay ? { decay: light.decay } : {}),
        ...(light.shadow ? { shadow: light.shadow } : {})
      });
    }
  }
};

let placementSeq = 0;

const finish = (ctx: EmitContext, label: string): { nodes: readonly AuraSceneNode[]; checksum: string; instanceCount: number } => {
  let total = 0;
  const all: number[] = [];
  for (const [assetId, bucket] of ctx.byAsset) {
    const matrices = new Float32Array(bucket.rows);
    const node: AuraScatterNode = {
      kind: "scatter",
      id: `place-${label}-${assetId}-${++placementSeq}`,
      name: `place ${label} ×${matrices.length / 12} ${assetId}`,
      placements: { asset: bucket.asset, matrices, chunkSize: SCATTER_CELL_SIZE }
    };
    ctx.nodes.push(node as unknown as AuraSceneNode);
    total += matrices.length / 12;
    all.push(...matrices);
  }
  return { nodes: ctx.nodes, checksum: scatterChecksum(new Float32Array(all)), instanceCount: total };
};

// ------------------------------------------------------------- placeAlong --

export interface AuraPlaceAlongOptions {
  readonly spacing: number;
  /** Right-offset in metres, added on top of `side`. */
  readonly offset?: number;
  /** "left" (-right) or "right" (+right); default right. */
  readonly side?: "left" | "right";
  readonly alignToTangent?: boolean;
  /** Jitter amplitudes [along, lateral, yaw-degrees]; default 0. */
  readonly jitter?: readonly [number, number, number];
  readonly seed?: number;
  /** t range on the spline; default [0, 1]. */
  readonly start?: number;
  readonly end?: number;
  readonly ground?: AuraTerrainHandle | string | true;
  readonly scale?: number | readonly [number, number];
}

export function worldPlaceAlong(spline: AuraSplineHandle, item: AuraPlaceItem, options: AuraPlaceAlongOptions): { nodes: readonly AuraSceneNode[]; checksum: string; instanceCount: number } {
  if (options.spacing <= 0) throw new Error("world.placeAlong: spacing must be > 0");
  const rng = scatterRng(options.seed ?? 0);
  const t0 = Math.max(0, Math.min(1, options.start ?? 0));
  const t1 = Math.max(t0, Math.min(1, options.end ?? 1));
  const ctx: EmitContext = { nodes: [], byAsset: new Map() };
  const sideSign = options.side === "left" ? -1 : 1;
  const lateral = (options.offset ?? 0) * sideSign;
  const align = options.alignToTangent === true;
  const [jAlong, jLat, jYaw] = options.jitter ?? [0, 0, 0];
  const scaleRange = Array.isArray(options.scale) ? options.scale : [options.scale ?? 1, options.scale ?? 1];
  const arcStart = t0 * spline.length;
  const arcEnd = t1 * spline.length;
  for (let s = arcStart; s <= arcEnd + 1e-6; s += options.spacing) {
    const sJ = s + (rng() - 0.5) * 2 * jAlong;
    const t = Math.max(0, Math.min(1, sJ / spline.length));
    const center = spline.pointAt(t);
    const frame = spline.frameAt(t);
    const lat = lateral + (rng() - 0.5) * 2 * jLat;
    const pos: V3 = [
      center[0] + frame.right[0] * lat,
      center[1] + frame.right[1] * lat,
      center[2] + frame.right[2] * lat
    ];
    pos[1] += groundY(options.ground, pos[0], pos[2]);
    const yawJ = (rng() - 0.5) * 2 * jYaw;
    const scl = scaleRange[0]! + rng() * (scaleRange[1]! - scaleRange[0]!);
    emitInstance(ctx, item, align ? frame : null, pos, yawJ, scl);
    if (options.spacing <= 0) break;
    if (s === arcEnd) break;
  }
  return finish(ctx, "along");
}

// -------------------------------------------------------------- placeGrid --

export interface AuraPlaceGridOptions {
  readonly origin?: AuraVec3;
  readonly count: readonly [number, number];
  readonly spacing: readonly [number, number];
  readonly jitter?: number;                  // metres, applied per axis
  readonly seed?: number;
  readonly ground?: AuraTerrainHandle | string | true;
  readonly rotationY?: "random" | number;
}

export function worldPlaceGrid(item: AuraPlaceItem, options: AuraPlaceGridOptions): { nodes: readonly AuraSceneNode[]; checksum: string; instanceCount: number } {
  const [nx, nz] = options.count;
  if (!(nx > 0) || !(nz > 0)) throw new Error("world.placeGrid: count must be positive");
  const rng = scatterRng(options.seed ?? 0);
  const origin = options.origin ?? [0, 0, 0];
  const jitter = options.jitter ?? 0;
  const ctx: EmitContext = { nodes: [], byAsset: new Map() };
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = origin[0] + i * options.spacing[0] + (rng() - 0.5) * 2 * jitter;
      const z = origin[2] + j * options.spacing[1] + (rng() - 0.5) * 2 * jitter;
      const y = origin[1] + groundY(options.ground, x, z);
      const yaw = options.rotationY === "random" || options.rotationY === undefined ? rng() * 360 : options.rotationY;
      emitInstance(ctx, item, null, [x, y, z], yaw, 1);
    }
  }
  return finish(ctx, "grid");
}

// ------------------------------------------------------------ placePoisson -

export interface AuraPlacePoissonOptions {
  readonly shape: AuraWorldShape;
  readonly minDistance: number;
  readonly seed: number;
  readonly ground?: AuraTerrainHandle | string | true;
  readonly exclude?: readonly AuraWorldShape[];
  /** Relative weights per item (default 1). */
  readonly weights?: readonly number[];
}

const shapeHas = (shape: AuraWorldShape, x: number, z: number): boolean => {
  switch (shape.kind) {
    case "circle": {
      const dx = x - shape.center[0], dz = z - shape.center[1];
      return dx * dx + dz * dz <= shape.radius * shape.radius;
    }
    case "polygon": {
      const pts = shape.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, zi] = pts[i]!, [xj, zj] = pts[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    }
    default:
      return false;
  }
};

/** Bridson Poisson-disc over an arbitrary shape (grid-accelerated). */
export function worldPlacePoisson(items: readonly AuraPlaceItem[], options: AuraPlacePoissonOptions): { nodes: readonly AuraSceneNode[]; checksum: string; instanceCount: number } {
  if (items.length === 0) throw new Error("world.placePoisson: at least one item is required");
  if (options.minDistance <= 0) throw new Error("world.placePoisson: minDistance must be > 0");
  const rng = scatterRng(options.seed);
  const r = options.minDistance;
  const cell = r / Math.SQRT2;
  const bounds = (() => {
    const s = options.shape;
    if (s.kind === "circle") return { minX: s.center[0] - s.radius, maxX: s.center[0] + s.radius, minZ: s.center[1] - s.radius, maxZ: s.center[1] + s.radius };
    if (s.kind === "polygon") {
      const xs = s.points.map((p) => p[0]), zs = s.points.map((p) => p[1]);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    }
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  })();
  const gw = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const gh = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const grid = new Int32Array(gw * gh).fill(-1);
  const accepted: V3[] = [];
  const active: V3[] = [];
  const gridIndex = (x: number, z: number): number => {
    const gx = Math.min(gw - 1, Math.max(0, Math.floor((x - bounds.minX) / cell)));
    const gz = Math.min(gh - 1, Math.max(0, Math.floor((z - bounds.minZ) / cell)));
    return gz * gw + gx;
  };
  const fits = (x: number, z: number): boolean => {
    const gx = Math.floor((x - bounds.minX) / cell);
    const gz = Math.floor((z - bounds.minZ) / cell);
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= gw || nz >= gh) continue;
        const idx = grid[nz * gw + nx]!;
        if (idx < 0) continue;
        const p = accepted[idx]!;
        if ((p[0] - x) ** 2 + (p[2] - z) ** 2 < r * r) return false;
      }
    }
    return true;
  };
  // first dart anywhere inside the shape
  for (let attempt = 0; attempt < 200 && accepted.length === 0; attempt += 1) {
    const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    if (shapeHas(options.shape, x, z) && !options.exclude?.some((e) => shapeHas(e, x, z))) {
      accepted.push([x, 0, z]);
      active.push([x, 0, z]);
      grid[gridIndex(x, z)] = 0;
    }
  }
  const K = 30;
  while (active.length > 0) {
    const ai = Math.floor(rng() * active.length);
    const anchor = active[ai]!;
    let placed = false;
    for (let k = 0; k < K; k += 1) {
      const ang = rng() * Math.PI * 2;
      const d = r * (1 + rng());
      const x = anchor[0] + Math.cos(ang) * d;
      const z = anchor[2] + Math.sin(ang) * d;
      if (!shapeHas(options.shape, x, z)) continue;
      if (options.exclude?.some((e) => shapeHas(e, x, z))) continue;
      if (!fits(x, z)) continue;
      accepted.push([x, 0, z]);
      active.push([x, 0, z]);
      grid[gridIndex(x, z)] = accepted.length - 1;
      placed = true;
      break;
    }
    if (!placed) active.splice(ai, 1);
  }
  const ctx: EmitContext = { nodes: [], byAsset: new Map() };
  const weights = options.weights ?? items.map(() => 1);
  const totalW = weights.reduce((a, b) => a + b, 0);
  for (const p of accepted) {
    let pick = rng() * totalW;
    let idx = 0;
    while (idx < items.length - 1 && pick > weights[idx]!) pick -= weights[idx++]!;
    const y = groundY(options.ground, p[0], p[2]);
    emitInstance(ctx, items[idx]!, null, [p[0], y, p[2]], rng() * 360, 1);
  }
  return finish(ctx, "poisson");
}
