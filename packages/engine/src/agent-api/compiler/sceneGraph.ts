/**
 * PRD-01 §15 Phase 1 (C-06) compiler bridge: scene-graph flatten + model matrix
 * under `A3D_QR_CORE` (v2). Lane-01 file per PRD-01 §25 / Q-15-7.
 *
 * Flag off: every entry point returns exactly what the legacy
 * `sceneMath.flattenSceneNodes` / `sceneMath.createModelMatrix` return (the
 * moved bodies run unchanged).
 *
 * Flag on:
 * - Groups compose a real 4×4 world matrix, `world(child) = world(parent) ·
 *   local(child)` with `local = T · R(q) · S` (C-06 `composeWorldMatrix`), so a
 *   rotated or scaled parent moves its children correctly (legacy adds the
 *   Euler angles and positions component-wise).
 * - `rotationOrder` (six orders) and `quaternion` (wins over `rotation`) are
 *   honoured on every node (T1.5; removed from `diagnosticOnly.prd01.ts`).
 * - The world matrix is decomposed back to TRS. When it is not sheared,
 *   `position`/`rotation` ("ZYX" Euler)/`scale`/`quaternion` are overwritten for
 *   legacy consumers (physics, labels, bounds). When it is sheared the TRS
 *   cannot carry it: the matrix is kept in a side table (`worldTransformOf`),
 *   only `position` is overwritten, and `SCENE_GRAPH_SHEAR` is reported.
 * - `lookAt` is applied after composition: the target is a world-space point,
 *   never transformed by the parent (child `lookAt` wins over the parent's).
 * - `createModelMatrixV2` writes `T · R · S(nodeScale ⊙ size ⊙ fit) ·
 *   normalizeOffset` into a caller-supplied output; the size/fit scale is the
 *   innermost factor. Root nodes with the default "ZYX" order and no quaternion
 *   are bit-identical to the legacy matrix.
 * - Per-node dirty cache: a node's world matrix recomposes only when its TRS
 *   fields or its parent's world matrix change; `composed`/`hits` counters.
 */

import type { AuraEffectNode, AuraModelNode, AuraPrimitiveNode, AuraSceneNode, AuraSceneSnapshot, AuraTransformSpec, AuraVec3 } from "../nodes/types.js";
import type { GltfBounds } from "../nodes/types/runtime.js";
import type { AuraEulerOrder, AuraQuat, AuraWorldTransform } from "../../contracts/sceneGraph.js";
import { SCENE_GRAPH_SHEAR, composeTRSInto, decomposeMatrix, eulerToQuaternion, localMatrixOf, multiplyMat4Into, quaternionMultiply } from "../sceneGraph.js";
import { animatedPosition, animatedRotation, flattenSceneNodes as legacyFlattenSceneNodes, createModelMatrix as legacyCreateModelMatrix, lowerLookNode, markLookNodeLowered, primitiveSize, resolveModelFitScale } from "../sceneMath.js";

export { SCENE_GRAPH_SHEAR };

/** Anything with `on(flag)` (QrFlags) or a pre-resolved boolean. */
export type Prd01SceneGraphFlag = boolean | { on(name: "A3D_QR_CORE"): boolean };

export interface Prd01SceneGraphDegradation {
  readonly code: typeof SCENE_GRAPH_SHEAR;
  readonly nodeId?: string;
  readonly message: string;
  readonly ownerPrd: 1;
}

export interface Prd01SceneGraphOptions {
  readonly cache?: Prd01SceneGraphCache;
  readonly onDegradation?: (degradation: Prd01SceneGraphDegradation) => void;
}

export function isPrd01SceneGraphOn(flag: Prd01SceneGraphFlag): boolean {
  return typeof flag === "boolean" ? flag : flag.on("A3D_QR_CORE");
}

/* ------------------------------------------------------------------------ */
/* World transform side table (flattened node -> composed world transform). */

const worldTransforms = new WeakMap<object, AuraWorldTransform>();

/** The composed world transform attached by the flag-on flatten (undefined for root or flag-off nodes). */
export function worldTransformOf(node: object | undefined): AuraWorldTransform | undefined {
  return node === undefined ? undefined : worldTransforms.get(node);
}

/* ------------------------------------------------------------------------ */
/* Dirty cache.                                                              */

const ORDER_CODE: Readonly<Record<AuraEulerOrder, number>> = { XYZ: 1, XZY: 2, YXZ: 3, YZX: 4, ZXY: 5, ZYX: 6 };
const FP_LEN = 14;

interface WorldEntry {
  readonly fp: Float64Array;
  readonly parent: Float32Array;
  hasParent: boolean;
  readonly world: Float32Array;
}

export interface Prd01SceneGraphCache {
  /** World matrix of `node` under `parentWorld` (null = root). The returned array is RETAINED — do not mutate. */
  world(node: AuraTransformSpec, parentWorld: Float32Array | null): Float32Array;
  /** World matrices composed since the last beginFrame(). */
  readonly composed: number;
  /** Cache hits since the last beginFrame(). */
  readonly hits: number;
  beginFrame(): void;
  invalidate(node: AuraTransformSpec): void;
}

function fillTransformFingerprint(out: Float64Array, spec: AuraTransformSpec): void {
  const p = spec.position ?? [0, 0, 0];
  const r = spec.rotation ?? [0, 0, 0];
  const s = spec.scale === undefined ? [1, 1, 1] : typeof spec.scale === "number" ? [spec.scale, spec.scale, spec.scale] : spec.scale;
  const q = spec.quaternion;
  out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
  out[3] = r[0]; out[4] = r[1]; out[5] = r[2];
  out[6] = s[0]; out[7] = s[1]; out[8] = s[2];
  out[9] = q ? q[0] : Number.NaN; out[10] = q ? q[1] : 0; out[11] = q ? q[2] : 0; out[12] = q ? q[3] : 0;
  out[13] = ORDER_CODE[spec.rotationOrder ?? "ZYX"];
}

function sameFingerprint(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < FP_LEN; i += 1) {
    // NaN marks "no quaternion"; Object.is treats NaN === NaN.
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function sameParent(entry: WorldEntry, parentWorld: Float32Array | null): boolean {
  if (parentWorld === null) return !entry.hasParent;
  if (!entry.hasParent) return false;
  for (let i = 0; i < 16; i += 1) {
    if (!Object.is(entry.parent[i], parentWorld[i])) return false;
  }
  return true;
}

export function createPrd01SceneGraphCache(): Prd01SceneGraphCache {
  const entries = new WeakMap<AuraTransformSpec, WorldEntry>();
  const scratchFp = new Float64Array(FP_LEN);
  const scratchLocal = new Float32Array(16);
  let composed = 0;
  let hits = 0;
  return {
    get composed() {
      return composed;
    },
    get hits() {
      return hits;
    },
    beginFrame() {
      composed = 0;
      hits = 0;
    },
    invalidate(node) {
      entries.delete(node);
    },
    world(node, parentWorld) {
      fillTransformFingerprint(scratchFp, node);
      let entry = entries.get(node);
      if (entry !== undefined && sameFingerprint(entry.fp, scratchFp) && sameParent(entry, parentWorld)) {
        hits += 1;
        return entry.world;
      }
      if (entry === undefined) {
        entry = { fp: new Float64Array(FP_LEN), parent: new Float32Array(16), hasParent: false, world: new Float32Array(16) };
        entries.set(node, entry);
      }
      entry.fp.set(scratchFp);
      localMatrixOf(node, scratchLocal);
      if (parentWorld === null) {
        entry.hasParent = false;
        entry.world.set(scratchLocal);
      } else {
        entry.hasParent = true;
        entry.parent.set(parentWorld);
        multiplyMat4Into(entry.world, parentWorld, scratchLocal);
      }
      composed += 1;
      return entry.world;
    }
  };
}

/* ------------------------------------------------------------------------ */
/* Quaternion -> "ZYX" Euler (three.js `Euler.setFromRotationMatrix` "ZYX").  */

const SCRATCH_ROT = new Float32Array(16);

export function quaternionToEulerZYX(q: AuraQuat): AuraVec3 {
  const m = composeTRSInto(SCRATCH_ROT, [0, 0, 0], q, [1, 1, 1]);
  const m11 = m[0]!, m12 = m[4]!, m21 = m[1]!, m22 = m[5]!, m31 = m[2]!, m32 = m[6]!, m33 = m[10]!;
  const y = Math.asin(-Math.min(1, Math.max(-1, m31)));
  if (Math.abs(m31) < 0.9999999) {
    return [Math.atan2(m32, m33), y, Math.atan2(m21, m11)];
  }
  return [0, y, Math.atan2(-m12, m22)];
}

/* ------------------------------------------------------------------------ */
/* Flatten.                                                                  */

type PassThroughKind = "effect" | "environment" | "interaction";

function isPassThrough(node: AuraSceneNode): node is Extract<AuraSceneNode, { readonly kind: PassThroughKind }> {
  return node.kind === "effect" || node.kind === "environment" || node.kind === "interaction";
}

function hasTransform(spec: AuraTransformSpec): boolean {
  return Boolean(spec.position || spec.rotation || spec.scale || spec.quaternion || spec.lookAt);
}

function nodeIdOf(node: AuraSceneNode): string | undefined {
  const named = node as { readonly id?: unknown; readonly name?: unknown };
  if (typeof named.id === "string") return named.id;
  return typeof named.name === "string" ? named.name : undefined;
}

function applyParentWorld(
  node: AuraSceneNode,
  parentWorld: Float32Array | null,
  parentLookAt: AuraVec3 | undefined,
  cache: Prd01SceneGraphCache,
  options: Prd01SceneGraphOptions
): AuraSceneNode {
  if (isPassThrough(node)) return node;
  if (parentWorld === null) {
    // Root (or transform-free ancestors): unchanged, except an inherited world-space lookAt target.
    if (parentLookAt === undefined || node.lookAt !== undefined) return node;
    return { ...node, lookAt: parentLookAt } as AuraSceneNode;
  }
  const world = Float32Array.from(cache.world(node, parentWorld));
  const decomposed = decomposeMatrix(world);
  // lookAt after composition: the target is world space; the child's own wins.
  const lookAt = node.lookAt ?? parentLookAt;
  let result: AuraSceneNode;
  if (decomposed.sheared) {
    result = { ...node, position: decomposed.position, ...(lookAt ? { lookAt } : {}) } as AuraSceneNode;
    const nodeId = nodeIdOf(node);
    options.onDegradation?.({
      code: SCENE_GRAPH_SHEAR,
      ...(nodeId !== undefined ? { nodeId } : {}),
      message: "Group composition produced a sheared world matrix; TRS fields keep the position only and the model matrix uses the full world matrix.",
      ownerPrd: 1
    });
  } else {
    result = {
      ...node,
      position: decomposed.position,
      rotation: quaternionToEulerZYX(decomposed.quaternion),
      rotationOrder: "ZYX",
      quaternion: decomposed.quaternion,
      scale: decomposed.scale,
      ...(lookAt ? { lookAt } : {})
    } as AuraSceneNode;
  }
  worldTransforms.set(result, decomposed);
  return result;
}

function flattenInto(
  nodes: readonly AuraSceneNode[],
  parentWorld: Float32Array | null,
  parentLookAt: AuraVec3 | undefined,
  cache: Prd01SceneGraphCache,
  options: Prd01SceneGraphOptions,
  out: AuraSceneNode[]
): void {
  for (const node of nodes) {
    // A3D_QR_LOOKS: v1 look node keeps its slot; its lowered children follow.
    const lowered = lowerLookNode(node);
    if (lowered !== undefined) {
      out.push(markLookNodeLowered(node));
      flattenInto(lowered, parentWorld, parentLookAt, cache, options, out);
      continue;
    }
    if (node.kind === "group") {
      const groupWorld = hasTransform(node) ? cache.world(node, parentWorld) : parentWorld;
      flattenInto(node.children, groupWorld, node.lookAt ?? parentLookAt, cache, options, out);
      continue;
    }
    out.push(applyParentWorld(node, parentWorld, parentLookAt, cache, options));
  }
}

/** C-06 flag-on flatten (true hierarchical composition). */
export function flattenSceneNodesV2(nodes: readonly AuraSceneNode[], options: Prd01SceneGraphOptions = {}): AuraSceneNode[] {
  const out: AuraSceneNode[] = [];
  flattenInto(nodes, null, undefined, options.cache ?? createPrd01SceneGraphCache(), options, out);
  return out;
}

/** Flag-gated flatten: flag off = legacy `sceneMath.flattenSceneNodes`, verbatim. */
export function flattenAuraSceneNodes(
  nodes: readonly AuraSceneNode[],
  flag: Prd01SceneGraphFlag,
  options: Prd01SceneGraphOptions = {}
): AuraSceneNode[] {
  return isPrd01SceneGraphOn(flag) ? flattenSceneNodesV2(nodes, options) : legacyFlattenSceneNodes(nodes);
}

/** Flag-gated snapshot flatten: flag off = legacy `sceneMath.flattenSceneSnapshot`. */
export function flattenAuraSceneSnapshot(
  snapshot: AuraSceneSnapshot,
  flag: Prd01SceneGraphFlag,
  options: Prd01SceneGraphOptions = {}
): AuraSceneSnapshot {
  return { ...snapshot, nodes: flattenAuraSceneNodes(snapshot.nodes, flag, options) };
}

/* ------------------------------------------------------------------------ */
/* Model matrix.                                                             */

type MatrixNode = AuraModelNode | AuraPrimitiveNode | AuraEffectNode;

const M_T = new Float32Array(16);
const M_R = new Float32Array(16);
const M_S = new Float32Array(16);
const M_O = new Float32Array(16);
const M_A = new Float32Array(16);
const M_B = new Float32Array(16);
const M_RX = new Float32Array(16);
const M_RY = new Float32Array(16);
const M_RZ = new Float32Array(16);

function setIdentity(out: Float32Array): Float32Array {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

function setTranslation(out: Float32Array, x: number, y: number, z: number): Float32Array {
  setIdentity(out);
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

function setScaling(out: Float32Array, x: number, y: number, z: number): Float32Array {
  out.fill(0);
  out[0] = x; out[5] = y; out[10] = z; out[15] = 1;
  return out;
}

/** Legacy `rotationXYZ` (Rz·Ry·Rx, three.js "ZYX"), same arithmetic, no allocation. */
function setRotationZYX(out: Float32Array, rotation: AuraVec3): Float32Array {
  const [x, y, z] = rotation;
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  M_RX.set([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  M_RY.set([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  M_RZ.set([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  multiplyMat4Into(M_A, M_RY, M_RX);
  multiplyMat4Into(out, M_RZ, M_A);
  return out;
}

function rotationDelta(node: MatrixNode | undefined, time: number): AuraVec3 | undefined {
  if (!node?.animation) return undefined;
  const base = node.rotation ?? [0, 0, 0];
  const animated = animatedRotation(node, time);
  if (animated[0] === base[0] && animated[1] === base[1] && animated[2] === base[2]) return undefined;
  return [animated[0] - base[0], animated[1] - base[1], animated[2] - base[2]];
}

/**
 * C-06 flag-on model matrix: `T · R · S(nodeScale ⊙ size ⊙ fit) · normalizeOffset`
 * written into `out`. R honours `quaternion` (animation spins compose as a local
 * "ZYX" delta) and `rotationOrder`; a sheared group world matrix (attached by
 * `flattenSceneNodesV2`) replaces T·R·S(nodeScale).
 */
export function createModelMatrixV2(
  node: MatrixNode | undefined,
  bounds: GltfBounds,
  normalizeToUnit: boolean,
  time = 0,
  out: Float32Array = new Float32Array(16)
): Float32Array {
  const extent = [
    Math.max(0.001, bounds.max[0] - bounds.min[0]),
    Math.max(0.001, bounds.max[1] - bounds.min[1]),
    Math.max(0.001, bounds.max[2] - bounds.min[2])
  ] as const;
  const fitScale = resolveModelFitScale(node, extent, normalizeToUnit);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const baseSize = node?.kind === "primitive" ? primitiveSize(node) : [1, 1, 1] as const;
  if (normalizeToUnit) setTranslation(M_O, -centerX, -bounds.min[1], -centerZ);
  else setIdentity(M_O);
  const position = animatedPosition(node, time);
  const world = worldTransformOf(node);
  if (world?.sheared) {
    // W already carries T·R·S(nodeScale) of the whole chain; size ⊙ fit stays innermost.
    setScaling(M_S, baseSize[0] * fitScale, baseSize[1] * fitScale, baseSize[2] * fitScale);
    multiplyMat4Into(M_B, M_S, M_O);
    const delta = rotationDelta(node, time);
    if (delta) {
      setRotationZYX(M_R, delta);
      multiplyMat4Into(M_B, M_R, M_B);
    }
    multiplyMat4Into(out, world.matrix, M_B);
    const base = node?.position ?? [0, 0, 0];
    out[12] = out[12]! + (position[0] - base[0]);
    out[13] = out[13]! + (position[1] - base[1]);
    out[14] = out[14]! + (position[2] - base[2]);
    return out;
  }
  const nodeScale = typeof node?.scale === "number" ? [node.scale, node.scale, node.scale] as const : node?.scale ?? [1, 1, 1] as const;
  if (node?.quaternion) {
    const delta = rotationDelta(node, time);
    const q = delta ? quaternionMultiply(node.quaternion, eulerToQuaternion(delta, "ZYX")) : node.quaternion;
    composeTRSInto(M_R, [0, 0, 0], q, [1, 1, 1]);
  } else {
    const rotation = animatedRotation(node, time);
    const order = node?.rotationOrder ?? "ZYX";
    if (order === "ZYX") setRotationZYX(M_R, rotation);
    else composeTRSInto(M_R, [0, 0, 0], eulerToQuaternion(rotation, order), [1, 1, 1]);
  }
  setScaling(M_S, nodeScale[0] * baseSize[0] * fitScale, nodeScale[1] * baseSize[1] * fitScale, nodeScale[2] * baseSize[2] * fitScale);
  setTranslation(M_T, position[0], position[1], position[2]);
  multiplyMat4Into(M_B, M_S, M_O);
  multiplyMat4Into(M_A, M_R, M_B);
  multiplyMat4Into(out, M_T, M_A);
  return out;
}

export type Prd01ModelMatrixFn = (node: MatrixNode | undefined, bounds: GltfBounds, normalizeToUnit: boolean, time?: number) => Float32Array;

/** Flag-gated model matrix: flag off = legacy `sceneMath.createModelMatrix`, verbatim. */
export function modelMatrixFor(flag: Prd01SceneGraphFlag): Prd01ModelMatrixFn {
  if (!isPrd01SceneGraphOn(flag)) return legacyCreateModelMatrix;
  return (node, bounds, normalizeToUnit, time = 0) => createModelMatrixV2(node, bounds, normalizeToUnit, time, new Float32Array(16));
}
