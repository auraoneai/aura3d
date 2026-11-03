import { describe, expect, it, vi } from "vitest";
import {
  createModelMatrixV2,
  createPrd01SceneGraphCache,
  flattenSceneNodesV2,
  parentTransformOf,
  worldTransformOf
} from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { composeWorldMatrixWithLookAt, createModelMatrixCache, localMatrixOf } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import { captureFlattenSceneNodes, createModelMatrix, flattenSceneNodes } from "../../../packages/engine/src/agent-api/sceneMath.js";
import type { AuraGroupNode, AuraModelNode, AuraPrimitiveNode, AuraVec3 } from "../../../packages/engine/src/agent-api/nodes/types.js";

const bounds = { min: [-0.5, -0.5, -0.5] as const, max: [0.5, 0.5, 0.5] as const };
const box = (extra: Partial<AuraPrimitiveNode> = {}): AuraPrimitiveNode => ({ kind: "primitive", primitive: "box", ...extra });
const group = (children: AuraGroupNode["children"], extra: Partial<AuraGroupNode> = {}): AuraGroupNode => ({ kind: "group", children, ...extra });

function point(matrix: Float32Array, p: AuraVec3): [number, number, number] {
  return [
    matrix[0]! * p[0] + matrix[4]! * p[1] + matrix[8]! * p[2] + matrix[12]!,
    matrix[1]! * p[0] + matrix[5]! * p[1] + matrix[9]! * p[2] + matrix[13]!,
    matrix[2]! * p[0] + matrix[6]! * p[1] + matrix[10]! * p[2] + matrix[14]!
  ];
}

function expectPoint(actual: readonly number[], expected: AuraVec3): void {
  expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 5));
}

function rotateAxis(p: AuraVec3, axis: string, angle: number): AuraVec3 {
  const [x, y, z] = p, c = Math.cos(angle), s = Math.sin(angle);
  if (axis === "X") return [x, c * y - s * z, s * y + c * z];
  if (axis === "Y") return [c * x + s * z, y, -s * x + c * z];
  return [c * x - s * y, s * x + c * y, z];
}

describe("pivoted scene graph matrices", () => {
  it("places the pivot before geometry size in both root matrix paths", () => {
    const node = box({ position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], size: 2 });
    for (const matrix of [createModelMatrix(node, bounds, false), createModelMatrixV2(node, bounds, false)]) {
      expectPoint(point(matrix, [0, 0, 0]), [4, -2, 0]);
      expectPoint(point(matrix, [0.5, 0, 0]), [4, 0, 0]);
    }
    const model: AuraModelNode = {
      kind: "model", asset: {} as AuraModelNode["asset"], castShadow: true, receiveShadow: true, visible: true,
      position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], targetHeight: 2
    };
    for (const matrix of [createModelMatrix(model, bounds, false), createModelMatrixV2(model, bounds, false)]) {
      expectPoint(point(matrix, [0.5, 0, 0]), [4, 0, 0]);
    }
  });

  it("matches the pivot equation for six Euler orders and a quaternion", () => {
    const rotation: AuraVec3 = [0.3, -0.4, 0.2], position: AuraVec3 = [3, -2, 4], pivot: AuraVec3 = [1, -0.5, 0.75];
    const scale: AuraVec3 = [2, 0.5, 1.5], size: AuraVec3 = [3, 2, 0.25], input: AuraVec3 = [0.2, 0.7, -0.4];
    const local: AuraVec3 = [(size[0] * input[0] - pivot[0]) * scale[0], (size[1] * input[1] - pivot[1]) * scale[1], (size[2] * input[2] - pivot[2]) * scale[2]];
    for (const order of ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"] as const) {
      let rotated = local;
      for (const axis of [...order].reverse()) rotated = rotateAxis(rotated, axis, rotation["XYZ".indexOf(axis)]!);
      const expected: AuraVec3 = [position[0] + pivot[0] + rotated[0], position[1] + pivot[1] + rotated[1], position[2] + pivot[2] + rotated[2]];
      expectPoint(point(createModelMatrixV2(box({ position, pivot, scale, size, rotation, rotationOrder: order }), bounds, false), input), expected);
    }
    const q = Math.SQRT1_2;
    const node = box({ position: [3, 0, 0], pivot: [1, 0, 0], quaternion: [0, 0, q, q], scale: [2, 1, 1], size: 2 });
    expectPoint(point(createModelMatrixV2(node, bounds, false), [0, 0, 0]), [4, -2, 0]);
  });

  it("retains the source and a copied parent matrix without applying a child pivot twice", () => {
    const child = box({ position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2], scale: [2, 1, 1], size: 2 });
    const parentPosition: [number, number, number] = [10, 0, 0];
    const [flat] = flattenSceneNodesV2([group([child], { position: parentPosition })]);
    const metadata = parentTransformOf(flat);
    expect(metadata?.source).toBe(child);
    expect(metadata?.hasPivot).toBe(true);
    expect(metadata?.parentWorldMatrix[12]).toBe(10);
    parentPosition[0] = 20;
    expect(metadata?.parentWorldMatrix[12]).toBe(10);
    const matrix = createModelMatrixV2(flat as AuraPrimitiveNode, bounds, false);
    expectPoint(point(matrix, [0, 0, 0]), [14, -2, 0]);
    expectPoint(point(matrix, [0.5, 0, 0]), [14, 0, 0]);
  });

  it("retains ancestor pivots and complete sheared world matrices", () => {
    const [pivotedGroupChild] = flattenSceneNodesV2([group([box({ position: [2, 0, 0] })], { pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 2] })]);
    expect(parentTransformOf(pivotedGroupChild)?.hasPivot).toBe(true);
    expectPoint(point(createModelMatrixV2(pivotedGroupChild as AuraPrimitiveNode, bounds, false), [0, 0, 0]), [1, 1, 0]);

    const child = box({ position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0, 0, Math.PI / 4], scale: [2, 1, 1], size: 2 });
    const [flat] = flattenSceneNodesV2([group([child], { scale: [2, 1, 1] })]);
    expect(worldTransformOf(flat)?.sheared).toBe(true);
    const matrix = createModelMatrixV2(flat as AuraPrimitiveNode, bounds, false);
    expectPoint(point(matrix, [0, 0, 0]), [8 - 2 * Math.SQRT2, -Math.SQRT2, 0]);
    expectPoint(point(matrix, [0.5, 0, 0]), [8, 0, 0]);
  });

  it("invalidates retained matrices when pivot or quaternion components change in place", () => {
    const pivot: [number, number, number] = [1, 0, 0];
    const node = box({ pivot, rotation: [0, 0, Math.PI / 2] });
    const worldCache = createPrd01SceneGraphCache();
    expectPoint(point(worldCache.world(node, null), [0, 0, 0]), [1, -1, 0]);
    worldCache.world(node, null);
    expect(worldCache.hits).toBe(1);
    pivot[0] = 2;
    expectPoint(point(worldCache.world(node, null), [0, 0, 0]), [2, -2, 0]);
    expect(worldCache.composed).toBe(2);

    const quaternion: [number, number, number, number] = [0, 0, 0, 1];
    const model = box({ pivot: [1, 0, 0], quaternion });
    const matrixCache = createModelMatrixCache((value, boxBounds, normalize, time) => createModelMatrixV2(value, boxBounds, normalize, time));
    expectPoint(point(matrixCache.modelMatrix(model, bounds, false), [0, 0, 0]), [0, 0, 0]);
    matrixCache.modelMatrix(model, bounds, false);
    expect(matrixCache.hits).toBe(1);
    quaternion[2] = Math.SQRT1_2;
    quaternion[3] = Math.SQRT1_2;
    expectPoint(point(matrixCache.modelMatrix(model, bounds, false), [0, 0, 0]), [1, -1, 0]);
    expect(matrixCache.composed).toBe(2);
  });

  it("preserves zero-pivot output and rejects unsupported or non-finite inputs before target mutation", () => {
    const ordinary = box({ position: [3, 1, -2], rotation: [0.2, -0.4, 0.6], scale: [2, 3, 4] });
    const zero = box({ ...ordinary, pivot: [0, 0, 0] });
    expect(Array.from(createModelMatrix(zero, bounds, false))).toEqual(Array.from(createModelMatrix(ordinary, bounds, false)));
    expect(Array.from(createModelMatrixV2(zero, bounds, false))).toEqual(Array.from(createModelMatrixV2(ordinary, bounds, false)));

    const target = new Float32Array(16).fill(37);
    const malformed = box({ pivot: [Number.NaN, 0, 0] });
    expect(() => createModelMatrixV2(malformed, bounds, false, 0, target)).toThrow(/PIVOT_INVALID/);
    expect(Array.from(target)).toEqual(Array(16).fill(37));
    const overflowing = box({ pivot: [Number.MAX_VALUE, 0, 0], scale: 2 });
    expect(() => createModelMatrixV2(overflowing, bounds, false, 0, target)).toThrow(/PIVOT_UNSUPPORTED_NONFINITE/);
    expect(Array.from(target)).toEqual(Array(16).fill(37));
    expect(() => localMatrixOf(overflowing, target)).toThrow(/PIVOT_UNSUPPORTED_NONFINITE/);
    expect(Array.from(target)).toEqual(Array(16).fill(37));

    const legacyNode = box({ pivot: [1, 0, 0], quaternion: [0, 0, 0, 1] });
    expect(() => createModelMatrix(legacyNode, bounds, false)).toThrow(/PIVOT_UNSUPPORTED_LEGACY_ROTATION/);
    expect(() => createModelMatrix(box({ pivot: [1, 0, 0], lookAt: [0, 0, 1] }), bounds, false)).toThrow(/PIVOT_UNSUPPORTED_LOOK_AT/);
    expect(() => createModelMatrixV2(box({ pivot: [1, 0, 0], lookAt: [0, Number.NaN, 1] }), bounds, false, 0, target)).toThrow(/LOOK_AT_INVALID/);
    expect(Array.from(target)).toEqual(Array(16).fill(37));
  });

  it("composes an own pivot with lookAt: the pivot point stays fixed while -Z faces the target", () => {
    const lookAt: [number, number, number] = [4, 0, 10];
    const node = box({ position: [3, 0, 0], pivot: [1, 0, 0], rotation: [0.3, 0.2, 0.1], scale: 2, lookAt });
    const matrix = createModelMatrixV2(node, bounds, false);
    // position + pivot is the drawn pivot point regardless of the look rotation.
    expectPoint(point(matrix, [1, 0, 0]), [4, 0, 0]);
    // Local -Z (scaled by 2) faces +Z, toward the target; the look rotation replaces `rotation`.
    const origin = point(matrix, [0, 0, 0]);
    const forward = point(matrix, [0, 0, -1]).map((value, axis) => value - origin[axis]!);
    expectPoint(forward, [0, 0, 2]);
    expectPoint(origin, [6, 0, 0]);
    // The runtime world cache composes the same pivot-fixed look-at transform.
    const world = composeWorldMatrixWithLookAt(null, node, new Float32Array(16));
    Array.from(world).forEach((value, index) => expect(matrix[index]).toBeCloseTo(value, 5));
    // A cached matrix is recomposed when the target moves.
    const cache = createModelMatrixCache((value, boxBounds, normalize, time) => createModelMatrixV2(value, boxBounds, normalize, time));
    cache.modelMatrix(node, bounds, false);
    lookAt[0] = 14;
    lookAt[2] = 0;
    const moved = cache.modelMatrix(node, bounds, false);
    expect(cache.composed).toBe(2);
    expectPoint(point(moved, [1, 0, 0]), [4, 0, 0]);
    const turned = point(moved, [0, 0, -1]).map((value, axis) => value - point(moved, [0, 0, 0])[axis]!);
    expectPoint(turned, [2, 0, 0]);
  });

  it("rejects legacy pivot hierarchies before group observers but leaves capture available", () => {
    const root = group([box({ pivot: [1, 0, 0] })], { position: [5, 0, 0] });
    const observer = vi.fn();
    expect(() => flattenSceneNodes([root], {}, { onGroupSpan: observer })).toThrow(/PIVOT_UNSUPPORTED_LEGACY_HIERARCHY/);
    expect(observer).not.toHaveBeenCalled();
    expect(() => captureFlattenSceneNodes([root])).not.toThrow();
  });

  it("fails closed for static nested animation on a pivoted chain", () => {
    const child = box({ pivot: [1, 0, 0], animation: { clip: "turntable" } });
    const [flat] = flattenSceneNodesV2([group([child], { position: [2, 0, 0] })]);
    const target = new Float32Array(16).fill(9);
    expect(() => createModelMatrixV2(flat as AuraPrimitiveNode, bounds, false, 1, target)).toThrow(/PIVOT_UNSUPPORTED_NESTED_ANIMATION/);
    expect(Array.from(target)).toEqual(Array(16).fill(9));
  });
});
