/**
 * C-06 real implementation (PRD-01, A3D_QR_CORE=v2). Column-major math written
 * into caller-supplied outputs; no `@aura3d/math` import (PRD §2.2 — the engine
 * has no dependency edge there and `Euler` only supports "XYZ").
 *
 * Semantics (PRD §6.1): order "ABC" composes `R = Ra · Rb · Rc` for column
 * vectors — the matrix three.js produces for Euler order "ABC". The default
 * "ZYX" is `Rz·Ry·Rx`, exactly today's `rotationXYZ` (`index.ts`), so every
 * existing single-node rotation renders identically. `quaternion` on the
 * transform wins over `rotation` when set.
 *
 * Delivery note: CONTRACTS C-06 names a `sceneGraphSlot.provide`, but the PR 0a
 * contract (`contracts/sceneGraph.ts`, owner 15) ships free functions, not a
 * slot — tracked as QR-OWN/Q-15 wiring; lane-15's `compiler/sceneGraph.ts`
 * bridge selects these bodies behind `A3D_QR_CORE`.
 */

import type { AuraEffectNode, AuraModelNode, AuraPrimitiveNode, AuraVec3, AuraTransformSpec } from "./index";
import { createModelMatrix } from "./index.js";
import type { AuraEulerOrder, AuraQuat, AuraWorldTransform } from "../contracts/sceneGraph";

export type { AuraEulerOrder, AuraQuat, AuraWorldTransform };

/** Degradation flag consumers raise when `decomposeMatrix` reports `sheared`. */
export const SCENE_GRAPH_SHEAR = "SCENE_GRAPH_SHEAR";

/** Euler -> quaternion. `order` defaults to "ZYX" (engine/three.js "ZYX" = Rz·Ry·Rx). */
export function eulerToQuaternion(euler: AuraVec3, order: AuraEulerOrder = "ZYX"): AuraQuat {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  switch (order) {
    case "XYZ":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "YXZ":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
    case "ZXY":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "ZYX":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
    case "YZX":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "XZY":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
  }
}

export function quaternionMultiply(a: AuraQuat, b: AuraQuat): AuraQuat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function quaternionConjugate(q: AuraQuat): AuraQuat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** T·R·S column-major into `out` (16 floats). */
export function composeTRSInto(out: Float32Array, position: AuraVec3, q: AuraQuat, scale: AuraVec3): Float32Array {
  const [qx, qy, qz, qw] = q;
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  const [sx, sy, sz] = scale;
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = position[0];
  out[13] = position[1];
  out[14] = position[2];
  out[15] = 1;
  return out;
}

/** out = a · b (column-major). Safe for out === a or out === b. */
export function multiplyMat4Into(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const a6 = a[6];
  const a7 = a[7];
  const a8 = a[8];
  const a9 = a[9];
  const a10 = a[10];
  const a11 = a[11];
  const a12 = a[12];
  const a13 = a[13];
  const a14 = a[14];
  const a15 = a[15];
  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];
  const b6 = b[6];
  const b7 = b[7];
  const b8 = b[8];
  const b9 = b[9];
  const b10 = b[10];
  const b11 = b[11];
  const b12 = b[12];
  const b13 = b[13];
  const b14 = b[14];
  const b15 = b[15];
  out[0] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3;
  out[1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3;
  out[2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3;
  out[3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3;
  out[4] = a0 * b4 + a4 * b5 + a8 * b6 + a12 * b7;
  out[5] = a1 * b4 + a5 * b5 + a9 * b6 + a13 * b7;
  out[6] = a2 * b4 + a6 * b5 + a10 * b6 + a14 * b7;
  out[7] = a3 * b4 + a7 * b5 + a11 * b6 + a15 * b7;
  out[8] = a0 * b8 + a4 * b9 + a8 * b10 + a12 * b11;
  out[9] = a1 * b8 + a5 * b9 + a9 * b10 + a13 * b11;
  out[10] = a2 * b8 + a6 * b9 + a10 * b10 + a14 * b11;
  out[11] = a3 * b8 + a7 * b9 + a11 * b10 + a15 * b11;
  out[12] = a0 * b12 + a4 * b13 + a8 * b14 + a12 * b15;
  out[13] = a1 * b12 + a5 * b13 + a9 * b14 + a13 * b15;
  out[14] = a2 * b12 + a6 * b13 + a10 * b14 + a14 * b15;
  out[15] = a3 * b12 + a7 * b13 + a11 * b14 + a15 * b15;
}

export function identityMat4Into(out: Float32Array): Float32Array {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function localMatrixOf(local: AuraTransformSpec, out: Float32Array): Float32Array {
  const position = local.position ?? [0, 0, 0];
  const scale = local.scale === undefined
    ? ([1, 1, 1] as const)
    : typeof local.scale === "number"
      ? ([local.scale, local.scale, local.scale] as const)
      : local.scale;
  const quaternion = local.quaternion ?? eulerToQuaternion(local.rotation ?? [0, 0, 0], local.rotationOrder ?? "ZYX");
  return composeTRSInto(out, position, quaternion, scale);
}

/**
 * C-06 `composeWorldMatrix`: out = parent · local(TRS). `parent` is the world
 * matrix (identity for a root node). Column-major, caller-supplied output.
 */
export function composeWorldMatrix(parent: Float32Array | null, local: AuraTransformSpec, out: Float32Array): Float32Array {
  const localM = localMatrixOf(local, SCRATCH_A);
  if (parent === null) {
    out.set(localM);
    return out;
  }
  multiplyMat4Into(out, parent, localM);
  return out;
}

/**
 * C-06 `decomposeMatrix`: extracts position/quaternion/scale and flags shear.
 * Rotation basis orthogonality error > 1e-4 -> `sheared: true`; consumers raise
 * `SCENE_GRAPH_SHEAR` when they cannot carry shear.
 */
export function decomposeMatrix(m: Float32Array): AuraWorldTransform {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const det =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  const sign = det < 0 ? -1 : 1;
  const r00 = m[0] / (sign * sx);
  const r01 = m[4] / sy;
  const r02 = m[8] / sz;
  const r10 = m[1] / (sign * sx);
  const r11 = m[5] / sy;
  const r12 = m[9] / sz;
  const r20 = m[2] / (sign * sx);
  const r21 = m[6] / sy;
  const r22 = m[10] / sz;
  const trace = r00 + r11 + r22;
  let q: [number, number, number, number];
  if (trace > 0) {
    const t = Math.sqrt(trace + 1) * 2;
    q = [(r21 - r12) / t, (r02 - r20) / t, (r10 - r01) / t, t / 4];
  } else if (r00 > r11 && r00 > r22) {
    const t = Math.sqrt(1 + r00 - r11 - r22) * 2;
    q = [t / 4, (r01 + r10) / t, (r02 + r20) / t, (r21 - r12) / t];
  } else if (r11 > r22) {
    const t = Math.sqrt(1 + r11 - r00 - r22) * 2;
    q = [(r01 + r10) / t, t / 4, (r12 + r21) / t, (r02 - r20) / t];
  } else {
    const t = Math.sqrt(1 + r22 - r00 - r11) * 2;
    q = [(r02 + r20) / t, (r12 + r21) / t, t / 4, (r10 - r01) / t];
  }
  const orth =
    Math.abs(r00 * r01 + r10 * r11 + r20 * r21) +
    Math.abs(r00 * r02 + r10 * r12 + r20 * r22) +
    Math.abs(r01 * r02 + r11 * r12 + r21 * r22);
  return {
    matrix: m,
    position: [m[12], m[13], m[14]],
    quaternion: q,
    scale: [sx * sign, sy, sz],
    sheared: orth > 1e-4
  };
}

/**
 * Look-at orientation: world-space quaternion looking from `eye` to `target`
 * with forward -Z (camera/three.js convention) and `up` [0,1,0].
 */
export function lookAtWorldQuaternion(eye: AuraVec3, target: AuraVec3, up: AuraVec3 = [0, 1, 0]): AuraQuat {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  const znx = zx / zl;
  const zny = zy / zl;
  const znz = zz / zl;
  let xx = up[1] * znz - up[2] * zny;
  let xy = up[2] * znx - up[0] * znz;
  let xz = up[0] * zny - up[1] * znx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zny * xz - znz * xy;
  const yy = znz * xx - znx * xz;
  const yz = znx * xy - zny * xx;
  // Column-major rotation: column 0 = x basis, column 1 = y, column 2 = z.
  const m = SCRATCH_A;
  m[0] = xx; m[1] = xy; m[2] = xz; m[3] = 0;
  m[4] = yx; m[5] = yy; m[6] = yz; m[7] = 0;
  m[8] = znx; m[9] = zny; m[10] = znz; m[11] = 0;
  m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  return decomposeMatrix(m).quaternion;
}

/**
 * Compose a world matrix honoring `local.lookAt`: the node is placed at its
 * world position (parent · localPosition) and oriented to face `lookAt` in
 * world space. Parent rotation is factored out of the orientation so the
 * resulting matrix is still parent · local.
 */
export function composeWorldMatrixWithLookAt(
  parent: Float32Array | null,
  local: AuraTransformSpec,
  out: Float32Array
): Float32Array {
  if (!local.lookAt) return composeWorldMatrix(parent, local, out);
  const position = local.position ?? [0, 0, 0];
  const eye = SCRATCH_B;
  if (parent === null) {
    eye[0] = position[0];
    eye[1] = position[1];
    eye[2] = position[2];
  } else {
    eye[0] = parent[0] * position[0] + parent[4] * position[1] + parent[8] * position[2] + parent[12];
    eye[1] = parent[1] * position[0] + parent[5] * position[1] + parent[9] * position[2] + parent[13];
    eye[2] = parent[2] * position[0] + parent[6] * position[1] + parent[10] * position[2] + parent[14];
  }
  const worldRot = lookAtWorldQuaternion([eye[0], eye[1], eye[2]], local.lookAt);
  let localRot = worldRot;
  if (parent !== null) {
    const parentRot = decomposeMatrix(parent).quaternion;
    localRot = quaternionMultiply(quaternionConjugate(parentRot), worldRot);
  }
  const localM = composeTRSInto(
    SCRATCH_A,
    position,
    localRot,
    local.scale === undefined ? [1, 1, 1] : typeof local.scale === "number" ? [local.scale, local.scale, local.scale] : local.scale
  );
  if (parent === null) {
    out.set(localM);
    return out;
  }
  multiplyMat4Into(out, parent, localM);
  return out;
}

/**
 * Per-node version/dirty world-matrix cache (PRD §15 Phase-1). Nodes are plain
 * `AuraTransformSpec`s; the fingerprint compares transform fields (cheap) and
 * recomposes only when they change or the parent matrix changed. A static
 * 1,000-node scene composes 1,000 matrices on frame 1 and 0 on frame 2; the
 * `composed` counter feeds the `prd01.frameAllocations` C-31 section.
 */
export interface AuraWorldMatrixCache {
  /** local(node) — fingerprinted, no compose when unchanged. */
  local(node: AuraTransformSpec, out: Float32Array): Float32Array;
  /** world(node, parentWorld) — recomposes only on dirty local or parent. */
  world(node: AuraTransformSpec, parentWorld: Float32Array | null, out: Float32Array): Float32Array;
  /** matrices composed since the last beginFrame(). */
  readonly composed: number;
  beginFrame(): void;
  invalidate(node: AuraTransformSpec): void;
  clear(): void;
}

interface CacheEntry {
  fingerprint: string;
  local: Float32Array;
  world: Float32Array;
  parentSignature: number;
  worldDirty: boolean;
}

const SCRATCH_A = new Float32Array(16);
const SCRATCH_B = new Float32Array(16);

function fingerprintOf(spec: AuraTransformSpec): string {
  const p = spec.position ?? [0, 0, 0];
  const r = spec.rotation ?? [0, 0, 0];
  const s = spec.scale === undefined ? [1, 1, 1] : typeof spec.scale === "number" ? [spec.scale, spec.scale, spec.scale] : spec.scale;
  const q = spec.quaternion ?? [0, 0, 0, 1];
  const l = spec.lookAt ?? [0, 0, 0];
  return `${p[0]},${p[1]},${p[2]}|${r[0]},${r[1]},${r[2]}|${s[0]},${s[1]},${s[2]}|${q[0]},${q[1]},${q[2]},${q[3]}|${spec.rotationOrder ?? ""}|${l[0]},${l[1]},${l[2]}`;
}

function parentSignature(m: Float32Array | null): number {
  if (m === null) return -1;
  // Cheap identity hash: sum of elements * position weight. Parent matrix
  // writes must bump `markParentsChanged`; signature catches in-place writes.
  let h = 0;
  for (let i = 0; i < 16; i += 1) h += m[i] * (i + 1);
  return h;
}

/** `createModelMatrix`'s bounds parameter (the index.ts `GltfBounds` interface is not exported). */
export interface AuraModelBounds {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

/**
 * PRD §15 Phase-6: retained-output memo over `createModelMatrix` for STATIC
 * nodes (`node.animation === undefined`). Keyed on node object identity; the
 * fingerprint covers position/rotation/scale, bounds, normalizeToUnit and the
 * model fit targets, so field mutations recompose. Animated nodes bypass the
 * cache — `createModelMatrix` already resolves their time-varying TRS.
 *
 * Fields not in the fingerprint (size spec, materials) are mount-frozen:
 * `createProductionRuntimePrimitiveEntries` builds geometry/materials once at
 * mount, so a size change would not re-render upstream either. The hot path
 * allocates nothing — the fingerprint compares into a module scratch.
 *
 * `composed`/`hits` feed `prd01.frameAllocations` (C-31).
 */
export interface AuraStaticModelMatrixCache {
  /** Same numbers as `createModelMatrix(...)`; the returned array is RETAINED — do not mutate. */
  modelMatrix(node: AuraModelNode | AuraPrimitiveNode | AuraEffectNode | undefined, bounds: AuraModelBounds, normalizeToUnit: boolean, time?: number): Float32Array;
  /** matrices composed since the last beginFrame(). */
  readonly composed: number;
  /** cache hits since the last beginFrame(). */
  readonly hits: number;
  beginFrame(): void;
}

type MatrixNode = AuraModelNode | AuraPrimitiveNode | AuraEffectNode;

const MODEL_FP_LEN = 19;

function fillModelFingerprint(out: Float64Array, node: MatrixNode, bounds: AuraModelBounds, normalizeToUnit: boolean): void {
  const position = node.position ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0];
  const scale = node.scale === undefined ? [1, 1, 1] : typeof node.scale === "number" ? [node.scale, node.scale, node.scale] : node.scale;
  out[0] = position[0];
  out[1] = position[1];
  out[2] = position[2];
  out[3] = rotation[0];
  out[4] = rotation[1];
  out[5] = rotation[2];
  out[6] = scale[0];
  out[7] = scale[1];
  out[8] = scale[2];
  out[9] = bounds.min[0];
  out[10] = bounds.min[1];
  out[11] = bounds.min[2];
  out[12] = bounds.max[0];
  out[13] = bounds.max[1];
  out[14] = bounds.max[2];
  out[15] = normalizeToUnit ? 1 : 0;
  const model = node.kind === "model" ? node : undefined;
  out[16] = model?.targetHeight ?? 0;
  out[17] = model?.targetLength ?? 0;
  out[18] = model?.targetMaxDimension ?? 0;
}

interface ModelMatrixEntry {
  readonly fp: Float64Array;
  readonly refs: readonly unknown[];
  readonly matrix: Float32Array;
}

export function createModelMatrixCache(): AuraStaticModelMatrixCache {
  const entries = new WeakMap<MatrixNode, ModelMatrixEntry>();
  const scratch = new Float64Array(MODEL_FP_LEN);
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
    modelMatrix(node, bounds, normalizeToUnit, time = 0) {
      if (node === undefined || node.animation !== undefined) {
        return createModelMatrix(node, bounds, normalizeToUnit, time);
      }
      fillModelFingerprint(scratch, node, bounds, normalizeToUnit);
      const entry = entries.get(node);
      if (entry !== undefined) {
        let same = true;
        for (let i = 0; i < MODEL_FP_LEN; i += 1) {
          if (entry.fp[i] !== scratch[i]) {
            same = false;
            break;
          }
        }
        if (same
          && entry.refs[0] === node.kind
          && entry.refs[1] === (node.kind === "primitive" ? node.primitive : undefined)
          && entry.refs[2] === (node.kind === "model" ? node.scaleMode : undefined)) {
          hits += 1;
          return entry.matrix;
        }
      }
      const matrix = createModelMatrix(node, bounds, normalizeToUnit, time);
      entries.set(node, {
        fp: Float64Array.from(scratch),
        refs: [node.kind, node.kind === "primitive" ? node.primitive : undefined, node.kind === "model" ? node.scaleMode : undefined],
        matrix
      });
      composed += 1;
      return matrix;
    }
  };
}

export function createWorldMatrixCache(): AuraWorldMatrixCache {
  const entries = new WeakMap<AuraTransformSpec, CacheEntry>();
  let composed = 0;
  const entryFor = (node: AuraTransformSpec): CacheEntry => {
    let entry = entries.get(node);
    if (!entry) {
      entry = {
        fingerprint: "",
        local: new Float32Array(16),
        world: new Float32Array(16),
        parentSignature: -2,
        worldDirty: true
      };
      entries.set(node, entry);
    }
    return entry;
  };
  return {
    get composed() {
      return composed;
    },
    beginFrame() {
      composed = 0;
    },
    invalidate(node) {
      const entry = entries.get(node);
      if (entry) entry.worldDirty = true;
    },
    clear() {
      composed = 0;
    },
    local(node, out) {
      const entry = entryFor(node);
      const fp = fingerprintOf(node);
      if (entry.fingerprint === fp) {
        out.set(entry.local);
        return out;
      }
      composeWorldMatrixWithLookAt(null, node, entry.local);
      entry.fingerprint = fp;
      entry.worldDirty = true;
      composed += 1;
      out.set(entry.local);
      return out;
    },
    world(node, parentWorld, out) {
      const entry = entryFor(node);
      const fp = fingerprintOf(node);
      const sig = parentSignature(parentWorld);
      if (!entry.worldDirty && entry.fingerprint === fp && entry.parentSignature === sig) {
        out.set(entry.world);
        return out;
      }
      if (entry.fingerprint !== fp) {
        composeWorldMatrixWithLookAt(null, node, entry.local);
        entry.fingerprint = fp;
      }
      entry.worldDirty = false;
      entry.parentSignature = sig;
      if (parentWorld === null) {
        entry.world.set(entry.local);
      } else {
        multiplyMat4Into(entry.world, parentWorld, entry.local);
      }
      composed += 1;
      out.set(entry.world);
      return out;
    }
  };
}
