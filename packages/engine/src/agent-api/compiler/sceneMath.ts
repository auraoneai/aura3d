// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraTransformSpec, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraEffectNode, AuraLabelNode } from "../nodes/types.js";
import type { GltfBounds } from "./gltfRuntime.js";
import { animation } from "../nodes/animation.js";
import { clamp01 } from "../index.js";
import { group } from "../nodes/groups.js";
import { layoutSdfText } from "@aura3d/rendering";
import { orbitAnimatedPosition } from "./actors.js";
import { resolveAnimationSeconds } from "./animation.js";
import { text3D } from "../nodes/text3d.js";

export function normalizeQuaternion(rotation: readonly number[]): [number, number, number, number] {
  const length = Math.hypot(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1) || 1;
  return [
    (rotation[0] ?? 0) / length,
    (rotation[1] ?? 0) / length,
    (rotation[2] ?? 0) / length,
    (rotation[3] ?? 1) / length
  ];
}

export function slerpQuaternion(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number
): [number, number, number, number] {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    return normalizeQuaternion([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t
    ]);
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta = Math.sin(theta) || 1;
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return normalizeQuaternion([
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb
  ]);
}

export function rotationQuaternion(rotation: readonly number[]): Float32Array {
  const length = Math.hypot(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0, rotation[3] ?? 1) || 1;
  const x = (rotation[0] ?? 0) / length;
  const y = (rotation[1] ?? 0) / length;
  const z = (rotation[2] ?? 0) / length;
  const w = (rotation[3] ?? 1) / length;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return new Float32Array([
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
    0, 0, 0, 1
  ]);
}

export function transformPositions(positions: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index]!;
    const y = positions[index + 1]!;
    const z = positions[index + 2]!;
    output[index] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    output[index + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    output[index + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
  }
  return output;
}

export function boundsFromPositions(positions: Float32Array): GltfBounds {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index]!);
    min[1] = Math.min(min[1], positions[index + 1]!);
    min[2] = Math.min(min[2], positions[index + 2]!);
    max[0] = Math.max(max[0], positions[index]!);
    max[1] = Math.max(max[1], positions[index + 1]!);
    max[2] = Math.max(max[2], positions[index + 2]!);
  }
  return { min, max };
}

export function mergeBounds(a: GltfBounds, b: GltfBounds): GltfBounds {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
  };
}

export function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function animatedPosition(node: AuraModelNode | AuraPrimitiveNode | AuraEffectNode | AuraLabelNode | undefined, time: number): AuraVec3 {
  const basePosition = node?.position ?? [0, 0, 0];
  if (!node?.animation) return basePosition;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  if (node.animation.clip === "orbit") {
    const seconds = resolveAnimationSeconds(node.animation, time);
    return orbitAnimatedPosition(node.animation, basePosition, seconds, speed);
  }
  if (node.animation.clip !== "float") return basePosition;
  return [basePosition[0], basePosition[1] + Math.sin(resolveAnimationSeconds(node.animation, time) * speed) * 0.08, basePosition[2]];
}

export function primitiveSize(node: AuraPrimitiveNode): AuraVec3 {
  // SDF quad positions are already authored in world units by layoutSdfText.
  // Applying the public text size again here shrinks/grows the GPU quad twice.
  if (node.text3D?.backend === "sdf") return [1, 1, 1];
  if (typeof node.size === "number") return [node.size, node.size, node.size];
  return node.size ?? [1, 1, 1];
}

export function multiply4(a: Float32Array, b: Float32Array): Float32Array {
  const output = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      output[column * 4 + row] =
        a[row]! * b[column * 4]! +
        a[4 + row]! * b[column * 4 + 1]! +
        a[8 + row]! * b[column * 4 + 2]! +
        a[12 + row]! * b[column * 4 + 3]!;
    }
  }
  return output;
}

export function translation(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ]);
}

export function scaling(x: number, y: number, z: number): Float32Array {
  return new Float32Array([
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ]);
}

export function rotationXYZ(rotation: AuraVec3): Float32Array {
  const [x, y, z] = rotation;
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  const rx = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rz = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return multiply4(rz, multiply4(ry, rx));
}

export function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

export function scaleRgb(value: readonly [number, number, number], scale: number): readonly [number, number, number] {
  return clampRgb([value[0] * scale, value[1] * scale, value[2] * scale]);
}

export function clampRgb(value: readonly [number, number, number]): readonly [number, number, number] {
  return [
    clamp01(value[0]),
    clamp01(value[1]),
    clamp01(value[2])
  ];
}

export function mix3(a: AuraVec3, b: AuraVec3, t: number): AuraVec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function flattenSceneNodes(nodes: readonly AuraSceneNode[], parentTransform: AuraTransformSpec = {}): AuraSceneNode[] {
  const flattened: AuraSceneNode[] = [];
  for (const node of nodes) {
    if (node.kind === "group") {
      const groupTransform = composeAuraTransform(parentTransform, node);
      flattened.push(...flattenSceneNodes(node.children, groupTransform));
      continue;
    }
    flattened.push(applyAuraParentTransform(node, parentTransform));
  }
  return flattened;
}

function applyAuraParentTransform<TNode extends AuraSceneNode>(node: TNode, parentTransform: AuraTransformSpec): TNode {
  if (!hasAuraTransform(parentTransform)) return node;
  if (node.kind === "effect" || node.kind === "environment" || node.kind === "interaction") return node;
  return {
    ...node,
    ...composeAuraTransform(parentTransform, node)
  };
}

function composeAuraTransform(parentTransform: AuraTransformSpec, childTransform: AuraTransformSpec): AuraTransformSpec {
  const composed: {
    position?: AuraVec3;
    rotation?: AuraVec3;
    scale?: number | AuraVec3;
    lookAt?: AuraVec3;
  } = {};
  if (parentTransform.position || childTransform.position) {
    const parent = parentTransform.position ?? [0, 0, 0] as const;
    const child = childTransform.position ?? [0, 0, 0] as const;
    composed.position = [parent[0] + child[0], parent[1] + child[1], parent[2] + child[2]];
  }
  if (parentTransform.rotation || childTransform.rotation) {
    const parent = parentTransform.rotation ?? [0, 0, 0] as const;
    const child = childTransform.rotation ?? [0, 0, 0] as const;
    composed.rotation = [parent[0] + child[0], parent[1] + child[1], parent[2] + child[2]];
  }
  if (parentTransform.scale || childTransform.scale) {
    const parent = scaleToVec3(parentTransform.scale);
    const child = scaleToVec3(childTransform.scale);
    composed.scale = [parent[0] * child[0], parent[1] * child[1], parent[2] * child[2]];
  }
  composed.lookAt = childTransform.lookAt ?? parentTransform.lookAt;
  return composed;
}

export function scaleToVec3(scale: number | AuraVec3 | undefined): AuraVec3 {
  if (typeof scale === "number") return [scale, scale, scale];
  return scale ?? [1, 1, 1];
}

function hasAuraTransform(transform: AuraTransformSpec): boolean {
  return Boolean(transform.position || transform.rotation || transform.scale || transform.lookAt);
}
