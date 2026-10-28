// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines
// above the Q-15-2 section (flag-gated `createQrPrimitiveMesh`, appended).

import type { GltfBounds } from "../nodes/types/runtime.js";
import type { AuraPrimitiveParams } from "../nodes/types.js";
import type { ProductionPrimitiveMesh } from "./primitives.js";
import { tilingSecondUnwrap } from "./primitives.js";
import { createPrimitiveGeometry, Geometry } from "@aura3d/rendering";
import type { AuraPrimitiveKind, AuraParityPrimitiveParams } from "@aura3d/rendering";

export function createPlaneGeometry(): ProductionPrimitiveMesh {
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const tangents = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  return {
    positions: new Float32Array([
      -0.5, 0, -0.5,
      0.5, 0, -0.5,
      0.5, 0, 0.5,
      -0.5, 0, 0.5
    ]),
    normals: new Float32Array([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0
    ]),
    // Counter-clockwise when viewed from +Y, so the triangle winding agrees with
    // the [0, 1, 0] vertex normals. The previous [0, 1, 2, 0, 2, 3] order wound
    // the opposite way: its geometric normal was [0, -1, 0], so `gl_FrontFacing`
    // was false for a camera above the plane and the two-sided shader flipped the
    // up-normal downward. The plane then faced away from every overhead light and
    // received no direct lighting or visible cast shadows.
    indices: new Uint16Array([0, 2, 1, 0, 3, 2]),
    bounds: { min: [-0.5, 0, -0.5], max: [0.5, 0, 0.5] },
    uvs,
    uv1s: tilingSecondUnwrap(uvs),
    tangents
  };
}

export function createBoxGeometry(): ProductionPrimitiveMesh {
  // One full 0-1 unwrap per face, matching the 4-vertex face order below.
  const faceUvs = [0, 0, 1, 0, 1, 1, 0, 1];
  const uvs = new Float32Array([...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs, ...faceUvs]);
  // Analytic tangents along each face's +u direction (face order +z,-z,+y,-y,+x,-x).
  const faceTangents = [
    [1, 0, 0, 1], [-1, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 1], [0, 0, -1, 1], [0, 0, 1, 1]
  ];
  const tangents = new Float32Array(faceTangents.flatMap((tangent) => [...tangent, ...tangent, ...tangent, ...tangent]));
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5
  ]);
  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0
  ]);
  return {
    positions,
    normals,
    indices: new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 5, 6, 4, 6, 7,
      8, 9, 10, 8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23
    ]),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    uvs,
    uv1s: tilingSecondUnwrap(uvs),
    tangents
  };
}

export function createSphereGeometry(): ProductionPrimitiveMesh {
  const rows = 12;
  const columns = 16;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const tangents: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const theta = v * Math.PI;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x * 0.5, y * 0.5, z * 0.5);
      normals.push(x, y, z);
      uvs.push(u, 1 - v);
      tangents.push(-Math.sin(phi), 0, Math.cos(phi), 1);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      // Counter-clockwise from outside the sphere. The previous order wound
      // inward while the vertex normals pointed outward, so gl_FrontFacing
      // flipped correct normals inward and every NdotV material term collapsed.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const sphereUvs = new Float32Array(uvs);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    uvs: sphereUvs,
    uv1s: tilingSecondUnwrap(sphereUvs),
    tangents: new Float32Array(tangents)
  };
}

export function createCylinderGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const segments = 24;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    positions.push(x, -0.5, z, x, 0.5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const topCenter = positions.length / 3;
  positions.push(0, 0.5, 0);
  normals.push(0, 1, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.5, 0);
  normals.push(0, -1, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const base = segment * 2;
    indices.push(topCenter, base + 1, base + 3);
    indices.push(bottomCenter, base + 2, base);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
  };
}

export function createTorusGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array; readonly bounds: GltfBounds } {
  const radialSegments = 48;
  const tubeSegments = 10;
  const majorRadius = 0.43;
  const tubeRadius = 0.045;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const u = (radial / radialSegments) * Math.PI * 2;
    const centerX = Math.cos(u) * majorRadius;
    const centerY = Math.sin(u) * majorRadius;
    for (let tube = 0; tube <= tubeSegments; tube += 1) {
      const v = (tube / tubeSegments) * Math.PI * 2;
      const nx = Math.cos(u) * Math.cos(v);
      const ny = Math.sin(u) * Math.cos(v);
      const nz = Math.sin(v);
      positions.push(centerX + nx * tubeRadius, centerY + ny * tubeRadius, nz * tubeRadius);
      normals.push(nx, ny, nz);
    }
  }
  const row = tubeSegments + 1;
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const a = radial * row + tube;
      const b = (radial + 1) * row + tube;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    bounds: { min: [-0.5, -0.5, -0.06], max: [0.5, 0.5, 0.06] }
  };
}

export function createCapsuleApproxGeometry(): { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint16Array | Uint32Array; readonly bounds: GltfBounds } {
  return createSphereGeometry();
}

/* ------------------------------------------------------------------------ */
/* Q-15-2 (C-07, PRD-01 §15 Phase 1): under A3D_QR_CORE the engine primitives  */
/* come from @aura3d/rendering `createPrimitiveGeometry`: three.js-class        */
/* tessellation (sphere 64×32, cylinder 48 with split cap normals, torus        */
/* 64×16), a real capsule with hemispherical caps instead of the sphere stand-in, */
/* and C-27 tier halving. Flag off: the generators above, unchanged.            */

/** Resolved per mount from the QR flags + C-27 quality tier. */
export interface QrPrimitiveGeometryOptions {
  /** `A3D_QR_CORE` on. */
  readonly core: boolean;
  /** C-27 `primitiveSegments` ("half" on low tiers). Defaults to "full". */
  readonly primitiveSegments?: "half" | "full";
  /** Q-15-2 / #545: per-mount pool so identical primitives share one vertex + index upload. */
  readonly pool?: QrPrimitiveGeometryPool;
  /** Scales the default segment counts of one node's primitive (see `instancedDefaultSegmentScale`); explicit `params` win. Default 1. */
  readonly defaultSegmentScale?: number;
}

/** Triangles one instanced primitive node may submit per pass before its default tessellation is reduced. */
export const INSTANCED_NODE_TRIANGLE_BUDGET = 262_144;
/** Below this instance count a node keeps the single-object defaults whatever its triangle count. */
const INSTANCED_FULL_DETAIL_MAX_INSTANCES = 64;
const INSTANCED_MIN_SEGMENT_SCALE = 0.25;

/**
 * Default-tessellation scale for an instanced primitive node. A node that stamps hundreds of copies shows each copy at a
 * handful of pixels, so the single-object defaults (sphere 64x32 = 3,968 triangles, cylinder 48, cone 32) multiply into
 * millions of sub-pixel triangles per pass, and again per shadow cascade: a 10,000-instance forest drew 10.2 M triangles
 * in the main pass alone. When `instanceCount x fullTrianglesPerInstance` exceeds `INSTANCED_NODE_TRIANGLE_BUDGET` the
 * default segment counts halve (x0.5, then x0.25; never below x0.25, so a sphere keeps at least 16x8) until the budget
 * fits or the floor is hit. Authored `params.*Segments` always win, and a node of up to 64 instances is never touched.
 */
export function instancedDefaultSegmentScale(
  instanceCount: number | undefined,
  fullTrianglesPerInstance: number,
  limits: { readonly budget: number; readonly minScale: number } = { budget: INSTANCED_NODE_TRIANGLE_BUDGET, minScale: INSTANCED_MIN_SEGMENT_SCALE }
): number {
  if (instanceCount === undefined || instanceCount <= INSTANCED_FULL_DETAIL_MAX_INSTANCES || !(fullTrianglesPerInstance > 0)) return 1;
  const demand = instanceCount * fullTrianglesPerInstance;
  if (demand <= limits.budget) return 1;
  const raw = Math.sqrt(limits.budget / demand);
  let scale = 1;
  while (scale > limits.minScale && scale > raw) scale /= 2;
  return Math.max(limits.minScale, scale);
}

/** Triangles one instanced node may put into each shadow depth pass (the camera pass keeps `INSTANCED_NODE_TRIANGLE_BUDGET`). */
export const INSTANCED_SHADOW_TRIANGLE_BUDGET = 65_536;
/**
 * Shadow-proxy tessellation floors. A shadow silhouette is judged at the shadow-map texel, not at the camera's pixel, so round and thin
 * bodies (sphere, capsule, torus, cylinder: a trunk is a handful of texels wide) may go to an eighth of their default segments; the rest
 * (cone, ...) keep a quarter so a canopy still casts a round-ish shadow.
 */
export function instancedShadowSegmentScale(instanceCount: number | undefined, fullTrianglesPerInstance: number, primitive: string): number {
  const round = primitive === "sphere" || primitive === "capsule" || primitive === "torus" || primitive === "cylinder";
  return instancedDefaultSegmentScale(instanceCount, fullTrianglesPerInstance, {
    budget: INSTANCED_SHADOW_TRIANGLE_BUDGET,
    minScale: round ? 0.125 : INSTANCED_MIN_SEGMENT_SCALE
  });
}

/**
 * Q-15-2 / #545 ("685 boxes → 1 upload"). Identical builtin primitives
 * (same kind, tier segments, and for capsules the folded size) share one
 * `VertexBuffer` + `IndexBuffer`, so the device uploads them once instead of
 * once per node (685 boxes used to create 1,370+ GPU buffers).
 *
 * Each resource still gets its own `Geometry` handle (renderer identity,
 * batching and per-resource disposal are unchanged). The handle's `dispose()`
 * releases a reference, and the shared buffers are disposed with the last one.
 * The pool is per mount (one device), never global: `VertexBuffer.upload`
 * caches one device buffer.
 */
export class QrPrimitiveGeometryPool {
  private readonly entries = new Map<string, { readonly geometry: Geometry; refs: number }>();

  /** Distinct shared geometries alive (= vertex/index buffer pairs). */
  get size(): number {
    return this.entries.size;
  }

  refCount(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  acquire(key: string, create: () => Geometry): Geometry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { geometry: create(), refs: 0 };
      this.entries.set(key, entry);
    }
    entry.refs += 1;
    const shared = entry;
    return new QrSharedPrimitiveGeometry(shared.geometry, () => {
      shared.refs -= 1;
      if (shared.refs === 0) {
        this.entries.delete(key);
        shared.geometry.dispose();
      }
    });
  }
}

/** Per-resource handle over pooled buffers; `dispose()` releases one reference (idempotent). */
class QrSharedPrimitiveGeometry extends Geometry {
  private released = false;

  constructor(base: Geometry, private readonly release: () => void) {
    super(base.vertexBuffer, base.indexBuffer, base.topology, base.bounds);
  }

  override dispose(): void {
    if (this.released) return;
    this.released = true;
    this.release();
  }
}

/** Pool key: kind + tier segments, plus the folded size for capsules (other kinds are unit-sized). */
export function qrPrimitiveGeometryKey(
  primitive: string,
  size: readonly [number, number, number],
  options: QrPrimitiveGeometryOptions,
  params?: AuraPrimitiveParams
): string {
  const segments = options.primitiveSegments ?? "full";
  const scale = options.defaultSegmentScale ?? 1;
  const segmentsKey = scale === 1 ? segments : `${segments}x${scale}`;
  const paramsKey = params === undefined ? "" : `|${stableParamsKey(params)}`;
  return primitive === "capsule"
    ? `capsule|${segmentsKey}${paramsKey}|${size.map((v) => Math.abs(v)).join(",")}`
    : `${primitive}|${segmentsKey}${paramsKey}`;
}

/**
 * threejs-parity L2: JSON-serializable params may pool their geometry (two
 * `primitives.cone({ params: { radius: 2 } })` nodes share an upload). Params
 * carrying opaque payloads — `path`/`shape`/`extrudePath` curves and `points`
 * arrays — opt out: they may embed live Curve objects that must never key a
 * shared cache entry.
 */
export function qrPrimitiveParamsPoolable(params: AuraPrimitiveParams | undefined): boolean {
  if (params === undefined) return true;
  return params.path === undefined && params.shape === undefined && params.extrudePath === undefined && params.points === undefined;
}

function stableParamsKey(params: AuraPrimitiveParams): string {
  const keys = Object.keys(params).sort() as readonly (keyof AuraPrimitiveParams)[];
  const entries = keys.map((key) => `${String(key)}:${JSON.stringify(params[key])}`);
  return entries.join(",");
}

const scopedOptions = new WeakMap<object, QrPrimitiveGeometryOptions>();

export function qrPrimitiveGeometryOptions(
  flags: { on(name: "A3D_QR_CORE"): boolean } | undefined,
  /** C-27 tier settings (the compile ctx types it loosely); only `primitiveSegments` is read. */
  quality?: unknown,
  /** Mount scope (canvas / compile ctx): one geometry pool per scope. Omitted = no sharing. */
  scope?: object
): QrPrimitiveGeometryOptions | undefined {
  if (!flags?.on("A3D_QR_CORE")) return undefined;
  const segments = (quality as { readonly primitiveSegments?: unknown } | undefined)?.primitiveSegments;
  const primitiveSegments = segments === "half" ? "half" : "full";
  if (scope === undefined) return { core: true, primitiveSegments };
  const existing = scopedOptions.get(scope);
  if (existing && existing.primitiveSegments === primitiveSegments) return existing;
  const options: QrPrimitiveGeometryOptions = { core: true, primitiveSegments, pool: existing?.pool ?? new QrPrimitiveGeometryPool() };
  scopedOptions.set(scope, options);
  return options;
}

/**
 * threejs-parity L2: the full builtin union minus `"custom"` (custom geometry
 * resolves through `createProductionGeometryFromCustomSpec`, not a generator).
 * Mirrors `AuraBuiltinPrimitive`/`AuraPrimitiveKind`; kept structural so the
 * compiler file does not depend on the nodes-types import order.
 */
export type QrBuiltinPrimitive = AuraPrimitiveKind;

function hasSemantic(geometry: Geometry, semantic: string): boolean {
  return geometry.vertexBuffer.format.attributes.some((attribute) => attribute.semantic === semantic);
}

/**
 * Copies the CPU data of the shared (cached, never uploaded or disposed here)
 * rendering geometry into an engine primitive mesh, so every resource still
 * owns and disposes its own `Geometry` exactly like the legacy path.
 *
 * Capsule (§6.3): the rendering factory folds `size` into the geometry so the
 * caps stay hemispherical. The engine model matrix still applies `S(size)`, so
 * the mesh is pre-divided by `size`: positions / D, normals ∝ n ⊙ D (the
 * renderer's inverse-transpose normal matrix divides by D again, restoring n),
 * tangents ∝ t / D (tangents transform with the model matrix).
 */
export function createQrPrimitiveMesh(
  primitive: QrBuiltinPrimitive,
  size: readonly [number, number, number],
  options: QrPrimitiveGeometryOptions,
  params?: AuraPrimitiveParams
): ProductionPrimitiveMesh {
  const dims = [Math.max(1e-6, Math.abs(size[0])), Math.max(1e-6, Math.abs(size[1])), Math.max(1e-6, Math.abs(size[2]))] as const;
  const fold = primitive === "capsule";
  const source = createPrimitiveGeometry(
    primitive,
    params as AuraParityPrimitiveParams | undefined,
    { primitiveSegments: options.primitiveSegments ?? "full", defaultSegmentScale: options.defaultSegmentScale ?? 1 },
    fold ? dims : undefined
  );
  const vertexBuffer = source.vertexBuffer;
  const count = vertexBuffer.vertexCount;
  const textured = hasSemantic(source, "uv") && hasSemantic(source, "tangent");
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = textured ? new Float32Array(count * 2) : undefined;
  const tangents = textured ? new Float32Array(count * 4) : undefined;
  const sx = fold ? dims[0] : 1;
  const sy = fold ? dims[1] : 1;
  const sz = fold ? dims[2] : 1;
  for (let index = 0; index < count; index += 1) {
    const p = vertexBuffer.getAttribute(index, "position");
    positions[index * 3] = p[0]! / sx;
    positions[index * 3 + 1] = p[1]! / sy;
    positions[index * 3 + 2] = p[2]! / sz;
    const n = vertexBuffer.getAttribute(index, "normal");
    const nx = n[0]! * sx;
    const ny = n[1]! * sy;
    const nz = n[2]! * sz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    normals[index * 3] = nx / nl;
    normals[index * 3 + 1] = ny / nl;
    normals[index * 3 + 2] = nz / nl;
    if (uvs && tangents) {
      const uv = vertexBuffer.getAttribute(index, "uv");
      uvs[index * 2] = uv[0]!;
      uvs[index * 2 + 1] = uv[1]!;
      const t = vertexBuffer.getAttribute(index, "tangent");
      const tx = t[0]! / sx;
      const ty = t[1]! / sy;
      const tz = t[2]! / sz;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tangents[index * 4] = tx / tl;
      tangents[index * 4 + 1] = ty / tl;
      tangents[index * 4 + 2] = tz / tl;
      tangents[index * 4 + 3] = t[3]!;
    }
  }
  const indexData = source.indexBuffer?.data;
  const indices: Uint16Array | Uint32Array = indexData instanceof Uint32Array
    ? Uint32Array.from(indexData)
    : indexData !== undefined
      ? Uint16Array.from(indexData)
      : count > 0xffff
        ? Uint32Array.from({ length: count }, (_, index) => index)
        : Uint16Array.from({ length: count }, (_, index) => index);
  const bounds: GltfBounds = {
    min: [source.bounds.min[0] / sx, source.bounds.min[1] / sy, source.bounds.min[2] / sz],
    max: [source.bounds.max[0] / sx, source.bounds.max[1] / sy, source.bounds.max[2] / sz]
  };
  return {
    positions,
    normals,
    indices,
    bounds,
    topology: source.topology === "lines" || source.topology === "points" ? source.topology : "triangles",
    ...(source.groups ? { groups: [...source.groups] } : {}),
    ...(source.drawRange ? { drawRange: { ...source.drawRange } } : {}),
    ...(uvs && tangents ? { uvs, uv1s: tilingSecondUnwrap(uvs), tangents } : {})
  };
}
