/**
 * Scene-level CPU picking for points and instances, hover/click events, and a pick-driven annotation record.
 *
 * `createSpatialPicker` adapts mounted runtime handles (preferred: they carry live positions, instance matrices and
 * world matrices) or declarative scene nodes onto the pure indices in `spatialIndex.ts`. It keeps one lazily built
 * index per node and rebuilds it only when the node's buffer identity, length or strided fingerprint changes, or
 * when the caller invalidates it. It does not touch the renderer: a GPU id-buffer pass (K-04) is a separate,
 * later piece of work.
 *
 * Worker-render mode: nothing here reads the DOM or the renderer, but `bindSpatialPicking` needs a canvas element in
 * the calling realm; where the canvas lives in a worker the caller feeds `picker.pick` with its own ray instead.
 */

import type { AuraRuntimeNodeHandle, AuraSceneNode, AuraVec3 } from "./nodes/types.js";
import { localMatrixOf, multiplyMat4Into, identityMat4Into } from "./sceneGraph.js";
import { worldTransformOf } from "./compiler/sceneGraph.js";
import { normalizeGeometryAttributes } from "./RootGeometry.js";
import { runtimeNodeQueryState } from "./app/runtimeNodes.js";
import { rayFromCameraNdc, type SceneRaycastCamera, type SceneRaycastInput } from "./SceneQueries.js";
import { InstanceIndex, PointCloudIndex, inverseLinear3, pixelTolerance, type InstancePickHit, type PickRay, type PointPickHit, type Vec3 } from "./spatialIndex.js";

export interface SpatialPickViewport {
  readonly width: number;
  readonly height: number;
}

export interface SpatialPickOptions {
  /** Which target kinds to test. Default both. */
  readonly kinds?: "points" | "instances" | "all";
  /**
   * Screen tolerance in CSS pixels for points. Needs `viewport` and a camera + NDC input; ignored for a bare world
   * ray (use `worldRadius`/`radiusSlope`). Default 8 when a viewport is given, else 0.
   */
  readonly pixelRadius?: number;
  readonly viewport?: SpatialPickViewport;
  /** World-space tolerance at the ray origin (added to the pixel tolerance). */
  readonly worldRadius?: number;
  /** World-space tolerance added per unit distance along the ray. */
  readonly radiusSlope?: number;
  readonly near?: number;
  readonly far?: number;
  /** Point ranking: closest to the cursor (`"ray"`, default) or nearest to the viewer (`"depth"`). */
  readonly rank?: "ray" | "depth";
  /** Restrict to a node name or runtime id. */
  readonly node?: string;
  /** Instance hit shape. Default `"box"`. */
  readonly instanceShape?: "box" | "sphere";
}

export interface SpatialPointHit extends PointPickHit {
  readonly kind: "point";
  readonly nodeId: string | undefined;
  readonly nodeName: string | undefined;
}

export interface SpatialInstanceHit extends InstancePickHit {
  readonly kind: "instance";
  readonly nodeId: string | undefined;
  readonly nodeName: string | undefined;
}

export type SpatialPickHit = SpatialPointHit | SpatialInstanceHit;

export interface SpatialPickerSources {
  /** Mounted handles (`app.nodes.all()`). Preferred. */
  readonly handles?: readonly AuraRuntimeNodeHandle[];
  /** Declarative nodes (`app.scene.nodes`), used when no handle list is given. Groups are descended. */
  readonly nodes?: readonly AuraSceneNode[];
}

interface Source {
  readonly key: object;
  readonly kind: "points" | "instances";
  readonly nodeId: string | undefined;
  readonly nodeName: string | undefined;
  readonly world: Float32Array;
  /** Flat xyz positions (points) or column-major matrices (instances). */
  readonly data: Float32Array;
  readonly count: number;
  readonly boundsMin?: Vec3;
  readonly boundsMax?: Vec3;
}

interface CacheEntry {
  readonly index: PointCloudIndex | InstanceIndex;
  data: Float32Array;
  length: number;
  fingerprint: number;
  forced: number;
}

export interface SpatialPicker {
  /** Nearest hit across the selected kinds, or `undefined`. */
  pick(input: SceneRaycastInput, options?: SpatialPickOptions): SpatialPickHit | undefined;
  /** Nearest hit per kind (point and instance), e.g. for a hover tooltip that wants both. */
  pickAll(input: SceneRaycastInput, options?: SpatialPickOptions): readonly SpatialPickHit[];
  /** Force a rebuild of one node's index (by name or id), or of every index. */
  invalidate(node?: string): void;
  /** Number of grid builds performed so far (benchmark and test counter). */
  readonly buildCount: number;
  dispose(): void;
}

const flatCache = new WeakMap<object, Float32Array>();

function flatPositions(positions: readonly AuraVec3[] | readonly number[] | Float32Array): Float32Array {
  if (positions instanceof Float32Array) return positions;
  const hit = flatCache.get(positions as object);
  if (hit && hit.length === (positions.length > 0 && typeof positions[0] !== "number" ? positions.length * 3 : positions.length)) return hit;
  let out: Float32Array;
  if (positions.length > 0 && typeof positions[0] !== "number") {
    const list = positions as readonly AuraVec3[];
    out = new Float32Array(list.length * 3);
    for (let i = 0; i < list.length; i += 1) { out[i * 3] = list[i]![0]; out[i * 3 + 1] = list[i]![1]; out[i * 3 + 2] = list[i]![2]; }
  } else {
    out = Float32Array.from(positions as readonly number[]);
  }
  flatCache.set(positions as object, out);
  return out;
}

const instanceMatrixCache = new WeakMap<object, Float32Array>();

function instanceMatrices(instances: readonly import("./nodes/types.js").AuraTransformSpec[]): Float32Array {
  const hit = instanceMatrixCache.get(instances);
  if (hit && hit.length === instances.length * 16) return hit;
  const out = new Float32Array(instances.length * 16);
  const tmp = new Float32Array(16);
  for (let i = 0; i < instances.length; i += 1) out.set(localMatrixOf(instances[i]!, tmp), i * 16);
  instanceMatrixCache.set(instances, out);
  return out;
}

function sizeOf(node: { readonly size?: number | AuraVec3 }): AuraVec3 {
  const s = node.size ?? 1;
  return typeof s === "number" ? [s, s, s] : s;
}

function sourceFor(node: AuraSceneNode, world: Float32Array, handle: AuraRuntimeNodeHandle | undefined, liveMatrices: Float32Array | undefined): Source | undefined {
  const nodeId = handle?.id ?? ("runtime" in node ? node.runtime?.id : undefined);
  if ("visible" in node && node.visible === false) return undefined;
  if (node.kind === "points") {
    const data = flatPositions(node.positions);
    return { key: node, kind: "points", nodeId, nodeName: node.name, world, data, count: Math.floor(data.length / 3) };
  }
  if (node.kind === "primitive" && (liveMatrices !== undefined || node.instances !== undefined)) {
    const data = liveMatrices ?? instanceMatrices(node.instances!);
    const size = sizeOf(node);
    let min: AuraVec3 = [-0.5, -0.5, -0.5], max: AuraVec3 = [0.5, 0.5, 0.5];
    if (node.geometry) {
      const p = normalizeGeometryAttributes(node.geometry).positions;
      const lo: [number, number, number] = [Infinity, Infinity, Infinity], hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i + 2 < p.length; i += 3) for (let a = 0; a < 3; a += 1) { lo[a] = Math.min(lo[a]!, p[i + a]!); hi[a] = Math.max(hi[a]!, p[i + a]!); }
      if (lo[0]! <= hi[0]!) { min = lo; max = hi; }
    }
    return {
      key: liveMatrices ?? node, kind: "instances", nodeId, nodeName: node.name, world, data, count: Math.floor(data.length / 16),
      boundsMin: [min[0] * size[0], min[1] * size[1], min[2] * size[2]], boundsMax: [max[0] * size[0], max[1] * size[1], max[2] * size[2]]
    };
  }
  return undefined;
}

function collect(sources: SpatialPickerSources): Source[] {
  const out: Source[] = [];
  if (sources.handles !== undefined && sources.handles.length > 0) {
    for (const handle of sources.handles) {
      const state = runtimeNodeQueryState(handle);
      if (!state) continue;
      const s = sourceFor(state.node as AuraSceneNode, state.worldMatrix, handle, state.instanceMatrices);
      if (s) out.push(s);
    }
    return out;
  }
  const visit = (node: AuraSceneNode, parent: Float32Array): void => {
    if ("visible" in node && node.visible === false) return;
    const local = worldTransformOf(node)?.matrix ?? localMatrixOf(node as import("./nodes/types.js").AuraTransformSpec, new Float32Array(16));
    const world = new Float32Array(16);
    multiplyMat4Into(world, parent, local);
    if (node.kind === "group") { for (const child of node.children) visit(child, world); return; }
    const s = sourceFor(node, world, undefined, undefined);
    if (s) out.push(s);
  };
  for (const node of sources.nodes ?? []) visit(node, identityMat4Into(new Float32Array(16)));
  return out;
}

/** Strided content fingerprint: a best-effort guard for in-place writes, not a proof. */
function fingerprint(data: ArrayLike<number>): number {
  const n = data.length;
  if (n === 0) return 0;
  const step = Math.max(1, Math.floor(n / 61));
  let h = n;
  for (let i = 0; i < n; i += step) h = (h * 31 + Math.fround(data[i]!) * 1000003) % 2147483647;
  return h + (data[n - 1] as number);
}

/** Inverse of an affine column-major matrix; undefined when singular. */
function invertAffine(m: Float32Array): Float32Array | undefined {
  const r = inverseLinear3(m);
  if (!r) return undefined;
  const out = new Float32Array(16);
  out[0] = r[0]!; out[1] = r[3]!; out[2] = r[6]!;
  out[4] = r[1]!; out[5] = r[4]!; out[6] = r[7]!;
  out[8] = r[2]!; out[9] = r[5]!; out[10] = r[8]!;
  const tx = m[12]!, ty = m[13]!, tz = m[14]!;
  out[12] = -(r[0]! * tx + r[1]! * ty + r[2]! * tz);
  out[13] = -(r[3]! * tx + r[4]! * ty + r[5]! * tz);
  out[14] = -(r[6]! * tx + r[7]! * ty + r[8]! * tz);
  out[15] = 1;
  return out;
}

const isIdentity = (m: Float32Array): boolean => {
  for (let k = 0; k < 16; k += 1) if (m[k] !== ((k % 5 === 0) ? 1 : 0)) return false;
  return true;
};

const apply = (m: Float32Array, p: Vec3): Vec3 => [
  m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
  m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
  m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!
];
const applyDir = (m: Float32Array, p: Vec3): Vec3 => [
  m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2],
  m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2],
  m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2]
];

/** Create a picker over mounted handles or declarative nodes. Sources are re-read on every call. */
export function createSpatialPicker(sourcesOf: SpatialPickerSources | (() => SpatialPickerSources)): SpatialPicker {
  const cache = new Map<object, CacheEntry>();
  const forceAll = { n: 0 };
  const forcedNodes = new Map<string, number>();

  const indexFor = (s: Source): PointCloudIndex | InstanceIndex => {
    const forced = forceAll.n + (forcedNodes.get(s.nodeName ?? "") ?? 0) + (forcedNodes.get(s.nodeId ?? "") ?? 0);
    const fp = fingerprint(s.data);
    let entry = cache.get(s.key);
    if (entry && entry.data === s.data && entry.length === s.data.length && entry.fingerprint === fp && entry.forced === forced) return entry.index;
    if (entry && entry.data === s.data) {
      entry.index.update(s.data, s.count);
    } else {
      const index = s.kind === "points"
        ? new PointCloudIndex(s.data, s.count)
        : new InstanceIndex(s.data, s.count, s.boundsMin && s.boundsMax ? { min: s.boundsMin, max: s.boundsMax } : {});
      entry = { index, data: s.data, length: s.data.length, fingerprint: fp, forced };
      cache.set(s.key, entry);
    }
    entry.length = s.data.length; entry.fingerprint = fp; entry.forced = forced; entry.data = s.data;
    return entry.index;
  };

  const run = (input: SceneRaycastInput, options: SpatialPickOptions, all: boolean): SpatialPickHit[] => {
    const camera: SceneRaycastCamera | undefined = "camera" in input ? input.camera : undefined;
    const ray: PickRay | undefined = "ndc" in input ? rayFromCameraNdc(input.camera, input.ndc) : input;
    if (!ray) return [];
    let radius = options.worldRadius ?? 0, slope = options.radiusSlope ?? 0;
    if (camera && "ndc" in input && options.viewport && options.viewport.height > 0) {
      const px = options.pixelRadius ?? 8;
      const next = rayFromCameraNdc(camera, [input.ndc[0], input.ndc[1] + 2 / options.viewport.height]);
      if (next && px > 0) {
        const t = pixelTolerance(ray, next, px);
        radius += t.radius; slope += t.slope;
      }
    }
    const wantPoints = options.kinds !== "instances", wantInstances = options.kinds !== "points";
    const results: SpatialPickHit[] = [];
    let bestPoint: SpatialPointHit | undefined, bestInstance: SpatialInstanceHit | undefined;
    const ow = ray.origin;
    const dl = Math.hypot(ray.direction[0], ray.direction[1], ray.direction[2]);
    if (!(dl > 0)) return [];
    const dw: Vec3 = [ray.direction[0] / dl, ray.direction[1] / dl, ray.direction[2] / dl];
    const src = typeof sourcesOf === "function" ? sourcesOf() : sourcesOf;
    const collected = collect(src);
    for (const key of cache.keys()) if (!collected.some((c) => c.key === key)) cache.delete(key);
    for (const s of collected) {
      if (options.node !== undefined && s.nodeName !== options.node && s.nodeId !== options.node) continue;
      if (s.kind === "points" ? !wantPoints : !wantInstances) continue;
      if (s.count === 0) continue;
      const index = indexFor(s);
      // World ray -> node-local ray. Uniform scale only: the local direction length rescales distances.
      let o: Vec3 = ow, d: Vec3 = dw, k = 1;
      const id = isIdentity(s.world);
      if (!id) {
        const inv = invertAffine(s.world);
        if (!inv) continue;
        o = apply(inv, ow);
        const dd = applyDir(inv, dw);
        k = Math.hypot(dd[0], dd[1], dd[2]);
        if (!(k > 0)) continue;
        d = [dd[0] / k, dd[1] / k, dd[2] / k];
      }
      const localRay: PickRay = { origin: o, direction: d };
      if (s.kind === "points") {
        const hit = (index as PointCloudIndex).pick(localRay, {
          radius: radius * k, slope, ...(options.near !== undefined ? { near: options.near * k } : {}),
          ...(options.far !== undefined ? { far: options.far * k } : {}), ...(options.rank ? { rank: options.rank } : {})
        });
        if (!hit) continue;
        const point = id ? hit.point : apply(s.world, hit.point);
        const distance = id ? hit.distance : (point[0] - ow[0]) * dw[0] + (point[1] - ow[1]) * dw[1] + (point[2] - ow[2]) * dw[2];
        const candidate: SpatialPointHit = { kind: "point", nodeId: s.nodeId, nodeName: s.nodeName, index: hit.index, point, distance, rayDistance: hit.rayDistance / k };
        if (all) { if (!bestPoint || candidate.distance < bestPoint.distance) bestPoint = candidate; }
        else results.push(candidate);
      } else {
        const hit = (index as InstanceIndex).pick(localRay, {
          ...(options.near !== undefined ? { near: options.near * k } : {}), ...(options.far !== undefined ? { far: options.far * k } : {}),
          shape: options.instanceShape ?? "box"
        });
        if (!hit) continue;
        const point = id ? hit.point : apply(s.world, hit.point);
        const normal = id ? hit.normal : (() => {
          const n = applyDir(s.world, hit.normal); const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l] as Vec3;
        })();
        const candidate: SpatialInstanceHit = { kind: "instance", nodeId: s.nodeId, nodeName: s.nodeName, instanceId: hit.instanceId, point, normal, distance: id ? hit.distance : hit.distance / k };
        if (all) { if (!bestInstance || candidate.distance < bestInstance.distance) bestInstance = candidate; }
        else results.push(candidate);
      }
    }
    if (all) { if (bestPoint) results.push(bestPoint); if (bestInstance) results.push(bestInstance); }
    return results;
  };

  return {
    pick(input, options = {}) {
      const hits = run(input, options, false);
      let best: SpatialPickHit | undefined;
      for (const h of hits) {
        // Points are tolerance hits; an instance surface hit in front of (or at) a point wins, otherwise the nearer.
        if (!best || h.distance < best.distance) best = h;
      }
      return best;
    },
    pickAll: (input, options = {}) => run(input, options, true),
    invalidate(node) {
      if (node === undefined) forceAll.n += 1;
      else forcedNodes.set(node, (forcedNodes.get(node) ?? 0) + 1);
    },
    get buildCount() { let n = 0; for (const e of cache.values()) n += e.index.buildCount; return n; },
    dispose() { forcedNodes.clear(); cache.clear(); }
  };
}
