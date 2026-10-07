/**
 * PRD-10 §7.1.7 / T5.1 — kits: `defineKit`, `kit.place`, `kit.fill`, and the
 * shipped `world.kits` catalogue.
 *
 * Kit placements resolve to world-space instance matrices on the CPU and emit
 * ONE `scatter` node with explicit `placements` per unique asset (§7.1.5) —
 * never `group()` hierarchies and never `createProductionInstanceTransforms`
 * (the V4 size bug does not apply to this path). Piece lights emit `light`
 * nodes (room/street practicals) alongside the scatter nodes.
 */
import type { AuraAssetRef, AuraLightNode, AuraLightType, AuraSceneNode, AuraVec3 } from "../index.js";
import { defineAuraAssets } from "../index.js";
import type { AuraWorldShape } from "./terrain.js";
import { scatterChecksum, scatterRng } from "./scatter.js";
import type { AuraScatterNode } from "./scatter.js";

// ------------------------------------------------------------- contracts ---

/** Named attach point on a kit piece (piece-local space). */
export interface AuraKitSocket {
  readonly position: AuraVec3;
  /** Local yaw carried by the socket, degrees. */
  readonly rotationYDeg?: number;
}

/** Practical light carried by a kit piece (emitted at a socket). */
export interface AuraKitPieceLight {
  readonly socket: string;
  readonly light: AuraLightType;
  readonly intensity: number;
  readonly color?: string;
  readonly power?: number;
  readonly distance?: number;
  readonly decay?: number;
  readonly shadow?: boolean;
}

export interface AuraKitPieceSpec {
  readonly id: string;
  readonly asset: AuraAssetRef<"model">;
  /** World-space footprint in metres [x, z] at scale 1 — used by fill. */
  readonly footprint: readonly [number, number];
  /** Piece-local origin offset applied before rotation (metres). */
  readonly pivot?: AuraVec3;
  /** Stack height for `level` stacking; defaults to the kit's gridSize. */
  readonly height?: number;
  readonly sockets?: Readonly<Record<string, AuraKitSocket>>;
  readonly lights?: readonly AuraKitPieceLight[];
  /** Relative weight inside `fill` weighting (default 1). */
  readonly weight?: number;
}

export interface AuraKitDefinition {
  readonly id: string;
  readonly name?: string;
  readonly license: string;
  readonly author?: string;
  readonly source?: string;
  /** World grid pitch in metres — `cell` placements multiply it. */
  readonly gridSize: number;
  readonly pieces: readonly AuraKitPieceSpec[];
}

export interface AuraKitPlacement {
  readonly piece: string;
  /** Grid cell [i, j] — position = origin + cell * gridSize. */
  readonly cell?: readonly [number, number];
  /** Absolute position; wins over `cell` when both are set. */
  readonly position?: AuraVec3;
  /** 90° rotation steps around +Y (quarter turns keep kit faces aligned). */
  readonly rotationSteps?: number;
  /** Stack level — y += level * (piece.height ?? options.levelHeight). */
  readonly level?: number;
  /** Snap this piece's socket onto a previously resolved placement's socket. */
  readonly snapTo?: { readonly target: string; readonly socket: string };
}

export interface AuraKitPlaceOptions {
  readonly origin?: AuraVec3;
  /** Base yaw applied around `origin`, degrees. */
  readonly rotationYDeg?: number;
  /** Default metres per `level` when the piece has no height. */
  readonly levelHeight?: number;
}

export interface AuraKitFillOptions {
  readonly density?: number;                 // fraction of grid cells filled, default 0.5
  readonly pieces?: Readonly<Record<string, number>>; // id → weight override
  readonly seed: number;
  /** "random" picks a quarter turn per cell; a number fixes the rotation. */
  readonly rotationSteps?: "random" | number;
  readonly exclude?: readonly AuraWorldShape[];
}

export interface AuraKitResult {
  readonly nodes: readonly AuraSceneNode[];
  readonly instanceCount: number;
  readonly perAsset: Readonly<Record<string, number>>;
  readonly checksum: string;
}

export interface AuraKit {
  readonly id: string;
  readonly definition: AuraKitDefinition;
  piece(id: string): AuraKitPieceSpec;
  place(placements: readonly AuraKitPlacement[], options?: AuraKitPlaceOptions): AuraKitResult;
  fill(region: { readonly shape: AuraWorldShape }, options: AuraKitFillOptions): AuraKitResult;
}

// ------------------------------------------------------------- internals ---

interface ResolvedPlacement {
  readonly piece: AuraKitPieceSpec;
  readonly position: AuraVec3;
  readonly yawDeg: number;
}

const rotY = (v: AuraVec3, deg: number): AuraVec3 => {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

const shapeContains = (shape: AuraWorldShape, x: number, z: number): boolean => {
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
      return false; // spline shapes are driven by world.spline placements, not kit fills
  }
};

const shapeBounds = (shape: AuraWorldShape): { minX: number; maxX: number; minZ: number; maxZ: number } => {
  switch (shape.kind) {
    case "circle":
      return { minX: shape.center[0] - shape.radius, maxX: shape.center[0] + shape.radius, minZ: shape.center[1] - shape.radius, maxZ: shape.center[1] + shape.radius };
    case "polygon": {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of shape.points) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      return { minX, maxX, minZ, maxZ };
    }
    default:
      return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
};

/** mat3x4 row-major from yaw + scale + translation (same layout as scatter). */
const placementMatrix = (position: AuraVec3, yawDeg: number, scl: number, pivot?: AuraVec3): number[] => {
  const c = Math.cos((yawDeg * Math.PI) / 180) * scl;
  const s = Math.sin((yawDeg * Math.PI) / 180) * scl;
  // pivot: instance rotates around its pivot — translate(p - R·pivot)
  const px = pivot ? pivot[0] : 0, py = pivot ? pivot[1] : 0, pz = pivot ? pivot[2] : 0;
  const rx = pivot ? (px * Math.cos((yawDeg * Math.PI) / 180) + pz * Math.sin((yawDeg * Math.PI) / 180)) * scl : 0;
  const rz = pivot ? (-px * Math.sin((yawDeg * Math.PI) / 180) + pz * Math.cos((yawDeg * Math.PI) / 180)) * scl : 0;
  const ry = pivot ? py * scl : 0;
  return [
    c, 0, s, position[0] - rx,
    0, scl, 0, position[1] - ry,
    -s, 0, c, position[2] - rz
  ];
};

let kitSeq = 0;

export function defineKit(definition: AuraKitDefinition): AuraKit {
  if (!definition.id) throw new Error("defineKit: id is required");
  if (!definition.license) throw new Error(`defineKit "${definition.id}": license is required (content rules)`);
  if (!(definition.gridSize > 0)) throw new Error(`defineKit "${definition.id}": gridSize must be > 0`);
  if (definition.pieces.length === 0) throw new Error(`defineKit "${definition.id}": at least one piece is required`);
  const pieceMap = new Map<string, AuraKitPieceSpec>();
  for (const piece of definition.pieces) {
    if (pieceMap.has(piece.id)) throw new Error(`defineKit "${definition.id}": duplicate piece id "${piece.id}"`);
    if (!(piece.footprint[0] > 0) || !(piece.footprint[1] > 0)) throw new Error(`defineKit "${definition.id}" piece "${piece.id}": footprint must be positive`);
    for (const light of piece.lights ?? []) {
      if (!piece.sockets?.[light.socket]) {
        throw new Error(`defineKit "${definition.id}" piece "${piece.id}": light references unknown socket "${light.socket}"`);
      }
    }
    pieceMap.set(piece.id, piece);
  }

  const piece = (id: string): AuraKitPieceSpec => {
    const found = pieceMap.get(id);
    if (!found) throw new Error(`kit "${definition.id}": no piece "${id}" (have: ${[...pieceMap.keys()].join(", ")})`);
    return found;
  };

  /** Resolve every placement to a world transform, honoring `snapTo` sockets. */
  const resolve = (placements: readonly AuraKitPlacement[], options: AuraKitPlaceOptions): ResolvedPlacement[] => {
    const origin = options.origin ?? [0, 0, 0];
    const baseYaw = options.rotationYDeg ?? 0;
    const resolved: ResolvedPlacement[] = [];
    const bySocketKey = new Map<string, { position: AuraVec3; yawDeg: number }>();
    for (const p of placements) {
      const spec = piece(p.piece);
      const yaw = baseYaw + (p.rotationSteps ?? 0) * 90;
      let position: AuraVec3;
      if (p.snapTo) {
        const host = bySocketKey.get(`${p.snapTo.target}#${p.snapTo.socket}`);
        if (!host) throw new Error(`kit "${definition.id}" place: snapTo target "${p.snapTo.target}#${p.snapTo.socket}" did not resolve — order placements so the host comes first`);
        const mySocket = spec.sockets?.[p.snapTo.socket];
        const offset = mySocket ? rotY(mySocket.position, yaw) : [0, 0, 0];
        position = [host.position[0] - offset[0], host.position[1] - offset[1], host.position[2] - offset[2]];
      } else if (p.position) {
        position = [...p.position] as AuraVec3;
      } else if (p.cell) {
        const local: AuraVec3 = [p.cell[0] * definition.gridSize, 0, p.cell[1] * definition.gridSize];
        const rotated = rotY(local, baseYaw);
        position = [origin[0] + rotated[0], origin[1] + rotated[1], origin[2] + rotated[2]];
      } else {
        position = [...origin] as AuraVec3;
      }
      const level = p.level ?? 0;
      if (level !== 0) {
        const h = spec.height ?? options.levelHeight ?? definition.gridSize;
        position = [position[0], position[1] + level * h, position[2]];
      }
      const out = { piece: spec, position, yawDeg: yaw };
      resolved.push(out);
      for (const [socketName, socket] of Object.entries(spec.sockets ?? {})) {
        const off = rotY(socket.position, yaw);
        bySocketKey.set(`${spec.id}#${socketName}`, {
          position: [position[0] + off[0], position[1] + off[1], position[2] + off[2]],
          yawDeg: yaw + (socket.rotationYDeg ?? 0)
        });
      }
    }
    return resolved;
  };

  const emit = (resolved: readonly ResolvedPlacement[]): AuraKitResult => {
    const byAsset = new Map<string, { asset: AuraAssetRef<"model">; rows: number[] }>();
    const lights: AuraSceneNode[] = [];
    for (const r of resolved) {
      // key by stable identity — raw defs may lack `id`, fall back to url
      const assetKey = r.piece.asset.id ?? r.piece.asset.url ?? r.piece.id;
      let bucket = byAsset.get(assetKey);
      if (!bucket) {
        bucket = { asset: r.piece.asset, rows: [] };
        byAsset.set(assetKey, bucket);
      }
      bucket.rows.push(...placementMatrix(r.position, r.yawDeg, 1, r.piece.pivot));
      for (const light of r.piece.lights ?? []) {
        const socket = r.piece.sockets![light.socket]!;
        const off = rotY(socket.position, r.yawDeg);
        const node: AuraLightNode = {
          kind: "light",
          light: light.light,
          name: `${r.piece.id}-light`,
          position: [r.position[0] + off[0], r.position[1] + off[1], r.position[2] + off[2]],
          intensity: light.intensity
        };
        lights.push({
          ...node,
          ...(light.color ? { color: light.color } : {}),
          ...(light.power ? { power: light.power } : {}),
          ...(light.distance ? { distance: light.distance } : {}),
          ...(light.decay ? { decay: light.decay } : {}),
          ...(light.shadow ? { shadow: light.shadow } : {})
        });
      }
    }
    const nodes: AuraSceneNode[] = [];
    const perAsset: Record<string, number> = {};
    const all = new Float32Array(resolved.length * 12);
    let cursor = 0;
    for (const [assetId, bucket] of byAsset) {
      const matrices = new Float32Array(bucket.rows);
      perAsset[assetId] = bucket.rows.length / 12;
      const node: AuraScatterNode = {
        kind: "scatter",
        id: `kit-${definition.id}-${assetId}-${++kitSeq}`,
        name: `kit ${definition.id} ×${perAsset[assetId]} ${assetId}`,
        placements: { asset: bucket.asset, matrices }
      };
      nodes.push(node as unknown as AuraSceneNode);
      all.set(matrices.slice(0, Math.min(matrices.length, all.length - cursor)), cursor);
      cursor += matrices.length;
    }
    return { nodes: [...nodes, ...lights], instanceCount: resolved.length, perAsset, checksum: scatterChecksum(all.subarray(0, cursor)) };
  };

  return {
    id: definition.id,
    definition,
    piece,
    place: (placements, options = {}) => emit(resolve(placements, options)),
    fill: (region, options) => {
      const density = Math.min(1, Math.max(0, options.density ?? 0.5));
      const bounds = shapeBounds(region.shape);
      const rng = scatterRng(options.seed);
      const placements: AuraKitPlacement[] = [];
      const pieces = [...pieceMap.values()];
      const weights = pieces.map((p) => (options.pieces?.[p.id] ?? p.weight ?? 1));
      const totalW = weights.reduce((a, b) => a + b, 0);
      const nx = Math.ceil((bounds.maxX - bounds.minX) / definition.gridSize);
      const nz = Math.ceil((bounds.maxZ - bounds.minZ) / definition.gridSize);
      for (let j = 0; j < nz; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const x = bounds.minX + (i + 0.5) * definition.gridSize;
          const z = bounds.minZ + (j + 0.5) * definition.gridSize;
          if (!shapeContains(region.shape, x, z)) continue;
          if (options.exclude?.some((shape) => shapeContains(shape, x, z))) continue;
          if (rng() >= density) continue;
          let pick = rng() * totalW;
          let idx = 0;
          while (idx < weights.length - 1 && pick > weights[idx]!) pick -= weights[idx++]!;
          const steps = options.rotationSteps === "random" || options.rotationSteps === undefined
            ? Math.floor(rng() * 4)
            : (options.rotationSteps ?? 0);
          placements.push({ piece: pieces[idx]!.id, position: [x, 0, z], rotationSteps: steps });
        }
      }
      return emit(resolve(placements, { origin: [0, 0, 0] }));
    }
  };
}

// ------------------------------------------------- shipped kit catalogue ---
// T5.1 + T5.7: pieces reference GLBs under packages/engine/assets/world/kits/
// baked deterministically by tools/world-content-bake (self-authored, CC0-1.0).
// Real third-party packs (Kenney City Kit, KayKit interiors, etc.) are admitted
// on top of this catalogue when their C-17 admission lands.

const kitAssets = defineAuraAssets({
  cityBlockTower: { type: "model", format: "glb", url: "world/kits/city/tower-8x8.glb", bounds: [8, 24, 8], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/tower-8x8" } },
  cityWallSlab: { type: "model", format: "glb", url: "world/kits/city/wall-slab-4x3.glb", bounds: [4, 3, 0.3], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/wall-slab-4x3" } },
  cityStreetLamp: { type: "model", format: "glb", url: "world/kits/city/street-lamp.glb", bounds: [0.4, 5, 0.4], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/street-lamp" } },
  cityPlanter: { type: "model", format: "glb", url: "world/kits/city/planter-2x1.glb", bounds: [2, 0.8, 1], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/planter-2x1" } },
  cityRoofUnit: { type: "model", format: "glb", url: "world/kits/city/roof-unit-2x2.glb", bounds: [2, 1.5, 2], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/roof-unit-2x2" } },
  cityBarrier: { type: "model", format: "glb", url: "world/kits/city/barrier-2x1.glb", bounds: [2, 1, 0.5], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/city/barrier-2x1" } },

  interiorWallSeg: { type: "model", format: "glb", url: "world/kits/interior/wall-seg-4x3.glb", bounds: [4, 3, 0.2], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/wall-seg-4x3" } },
  interiorFloorTile: { type: "model", format: "glb", url: "world/kits/interior/floor-tile-4x4.glb", bounds: [4, 0.1, 4], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/floor-tile-4x4" } },
  interiorDoor: { type: "model", format: "glb", url: "world/kits/interior/door-1x2.glb", bounds: [1, 2.1, 0.15], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/door-1x2" } },
  interiorCeilingLamp: { type: "model", format: "glb", url: "world/kits/interior/ceiling-lamp.glb", bounds: [0.6, 0.3, 0.6], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/ceiling-lamp" } },
  interiorCrate: { type: "model", format: "glb", url: "world/kits/interior/crate-1x1.glb", bounds: [1, 1, 1], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/crate-1x1" } },
  interiorTable: { type: "model", format: "glb", url: "world/kits/interior/table-2x1.glb", bounds: [2, 0.8, 1], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/interior/table-2x1" } },

  trackBarrier: { type: "model", format: "glb", url: "world/kits/trackside/barrier-4x1.glb", bounds: [4, 1, 0.5], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/barrier-4x1" } },
  trackFence: { type: "model", format: "glb", url: "world/kits/trackside/fence-seg-4x2.glb", bounds: [4, 2, 0.1], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/fence-seg-4x2" } },
  trackGantry: { type: "model", format: "glb", url: "world/kits/trackside/gantry-16x6.glb", bounds: [16, 6, 1.2], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/gantry-16x6" } },
  trackMarshalPost: { type: "model", format: "glb", url: "world/kits/trackside/marshal-post-2x3.glb", bounds: [2, 3, 2], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/marshal-post-2x3" } },
  trackCone: { type: "model", format: "glb", url: "world/kits/trackside/cone.glb", bounds: [0.5, 0.75, 0.5], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/cone" } },
  trackSign: { type: "model", format: "glb", url: "world/kits/trackside/sign-3x2.glb", bounds: [3, 2, 0.2], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/trackside/sign-3x2" } },

  spaceModuleHub: { type: "model", format: "glb", url: "world/kits/space/module-hub.glb", bounds: [4, 4, 4], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/module-hub" } },
  spaceModuleTube: { type: "model", format: "glb", url: "world/kits/space/module-tube-6.glb", bounds: [6, 2.5, 2.5], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/module-tube-6" } },
  spacePanel: { type: "model", format: "glb", url: "world/kits/space/panel-8x3.glb", bounds: [8, 3, 0.3], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/panel-8x3" } },
  spaceAntenna: { type: "model", format: "glb", url: "world/kits/space/antenna.glb", bounds: [0.3, 4, 0.3], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/antenna" } },
  spaceTruss: { type: "model", format: "glb", url: "world/kits/space/truss-6.glb", bounds: [6, 1, 1], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/truss-6" } },
  spaceAirlock: { type: "model", format: "glb", url: "world/kits/space/airlock-2x2.glb", bounds: [2, 2.5, 0.5], metadata: { license: "CC0-1.0", author: "Aura3D content bake", sourcePath: "tools/world-content-bake/kits/space/airlock-2x2" } }
});

const BAKE_LICENSE = "CC0-1.0";
const BAKE_SOURCE = "procedural — tools/world-content-bake (self-authored)";

const cityKitDefinition: AuraKitDefinition = {
  id: "city",
  name: "PRD-10 city kit",
  license: BAKE_LICENSE,
  author: "Aura3D content bake",
  source: BAKE_SOURCE,
  gridSize: 4,
  pieces: [
    { id: "tower", asset: kitAssets.cityBlockTower, footprint: [8, 8], height: 24, weight: 3 },
    { id: "wall-slab", asset: kitAssets.cityWallSlab, footprint: [4, 0.3], height: 3, weight: 2, sockets: { end: { position: [4, 0, 0] }, start: { position: [0, 0, 0] } } },
    { id: "street-lamp", asset: kitAssets.cityStreetLamp, footprint: [0.4, 0.4], weight: 1, sockets: { head: { position: [0, 4.8, 0] } }, lights: [{ socket: "head", light: "point", intensity: 0.9, color: "#ffd9a0", distance: 18 }] },
    { id: "planter", asset: kitAssets.cityPlanter, footprint: [2, 1], weight: 1 },
    { id: "roof-unit", asset: kitAssets.cityRoofUnit, footprint: [2, 2], weight: 1 },
    { id: "barrier", asset: kitAssets.cityBarrier, footprint: [2, 0.5], weight: 1 }
  ]
};

const interiorKitDefinition: AuraKitDefinition = {
  id: "interior",
  name: "PRD-10 interior kit",
  license: BAKE_LICENSE,
  author: "Aura3D content bake",
  source: BAKE_SOURCE,
  gridSize: 4,
  pieces: [
    { id: "wall-seg", asset: kitAssets.interiorWallSeg, footprint: [4, 0.2], height: 3, sockets: { start: { position: [0, 0, 0] }, end: { position: [4, 0, 0] } } },
    { id: "floor-tile", asset: kitAssets.interiorFloorTile, footprint: [4, 4] },
    { id: "door", asset: kitAssets.interiorDoor, footprint: [1, 0.15], sockets: { frame: { position: [0.5, 0, 0] } } },
    { id: "ceiling-lamp", asset: kitAssets.interiorCeilingLamp, footprint: [0.6, 0.6], lights: [{ socket: "mount", light: "point", intensity: 0.7, color: "#ffe8c0", distance: 8 }], sockets: { mount: { position: [0, 0.15, 0] } } },
    { id: "crate", asset: kitAssets.interiorCrate, footprint: [1, 1], weight: 2 },
    { id: "table", asset: kitAssets.interiorTable, footprint: [2, 1], weight: 1 }
  ]
};

const tracksideKitDefinition: AuraKitDefinition = {
  id: "trackside",
  name: "PRD-10 trackside kit",
  license: BAKE_LICENSE,
  author: "Aura3D content bake",
  source: BAKE_SOURCE,
  gridSize: 4,
  pieces: [
    { id: "barrier", asset: kitAssets.trackBarrier, footprint: [4, 0.5], weight: 4, sockets: { start: { position: [0, 0, 0] }, end: { position: [4, 0, 0] } } },
    { id: "fence-seg", asset: kitAssets.trackFence, footprint: [4, 0.1], weight: 3, sockets: { start: { position: [0, 0, 0] }, end: { position: [4, 0, 0] } } },
    { id: "gantry", asset: kitAssets.trackGantry, footprint: [16, 1.2], weight: 0.2 },
    { id: "marshal-post", asset: kitAssets.trackMarshalPost, footprint: [2, 2], weight: 0.4 },
    { id: "cone", asset: kitAssets.trackCone, footprint: [0.5, 0.5], weight: 2 },
    { id: "sign", asset: kitAssets.trackSign, footprint: [3, 0.2], weight: 1 }
  ]
};

const spaceKitDefinition: AuraKitDefinition = {
  id: "space",
  name: "PRD-10 space kit",
  license: BAKE_LICENSE,
  author: "Aura3D content bake",
  source: BAKE_SOURCE,
  gridSize: 6,
  pieces: [
    { id: "module-hub", asset: kitAssets.spaceModuleHub, footprint: [4, 4], weight: 0.3, sockets: { port0: { position: [0, 2, 0] }, port1: { position: [4, 2, 0] }, port2: { position: [2, 2, 4] } } },
    { id: "module-tube", asset: kitAssets.spaceModuleTube, footprint: [6, 2.5], weight: 1, sockets: { a: { position: [0, 1.25, 0] }, b: { position: [6, 1.25, 0] } } },
    { id: "panel", asset: kitAssets.spacePanel, footprint: [8, 0.3], weight: 1 },
    { id: "antenna", asset: kitAssets.spaceAntenna, footprint: [0.3, 0.3], weight: 0.5 },
    { id: "truss", asset: kitAssets.spaceTruss, footprint: [6, 1], weight: 1, sockets: { a: { position: [0, 0.5, 0] }, b: { position: [6, 0.5, 0] } } },
    { id: "airlock", asset: kitAssets.spaceAirlock, footprint: [2, 0.5], weight: 0.5 }
  ]
};

/** §7.1.7 `world.kits` — the four shipped kits (§6.6). */
export const worldKits = {
  city: defineKit(cityKitDefinition),
  interior: defineKit(interiorKitDefinition),
  trackside: defineKit(tracksideKitDefinition),
  space: defineKit(spaceKitDefinition)
} as const;
