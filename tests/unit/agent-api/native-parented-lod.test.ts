import { describe, expect, it } from "vitest";
import {
  lodLevelVisible,
  lodMarkerOf,
  tagLodLevel,
  type AuraLodRootSpec,
  type AuraLodVisibilityOptions
} from "../../../packages/engine/src/agent-api/lodMarkers";
import type { AuraPrimitiveNode, AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types";

function root(position: readonly [number, number, number] = [0, 0, 0], hysteresis = 0): AuraLodRootSpec {
  return { position, thresholds: [{ maxDistance: 10 }, {}], hysteresis };
}

function primitive(name: string, position: readonly [number, number, number] = [0, 0, 0]): AuraPrimitiveNode {
  return { kind: "primitive", primitive: "box", name, position };
}

function level(lodRoot: AuraLodRootSpec, levelIndex: number, name: string, position?: readonly [number, number, number]): AuraSceneNode {
  return tagLodLevel(primitive(name, position), { root: lodRoot, levelIndex });
}

describe("mixed-child LOD live anchors", () => {
  it("retains the authored-position behavior when no live anchor is supplied", () => {
    const lodRoot = root([3, 0, 0]);
    const near = level(lodRoot, 0, "near");
    const far = level(lodRoot, 1, "far");

    expect(lodLevelVisible(near, [8, 0, 0])).toBe(true);
    expect(lodLevelVisible(far, [8, 0, 0])).toBe(false);
    expect(lodLevelVisible(near, [20, 0, 0])).toBe(false);
    expect(lodLevelVisible(far, [20, 0, 0])).toBe(true);
    expect(lodLevelVisible(primitive("untagged"), [20, 0, 0])).toBe(true);
  });

  it("uses one live group origin for all children as the parent moves", () => {
    const lodRoot = root([0, 0, 0]);
    const near = level(lodRoot, 0, "near", [100, 0, 0]);
    const far = level(lodRoot, 1, "far", [-100, 0, 0]);
    const scope = {};
    const owner = {};
    const at = (worldPosition: readonly [number, number, number]): AuraLodVisibilityOptions => ({ scope, owner, worldPosition });

    expect(lodLevelVisible(near, [0, 0, 0], at([2, 0, 0]))).toBe(true);
    expect(lodLevelVisible(far, [0, 0, 0], at([2, 0, 0]))).toBe(false);
    expect(lodLevelVisible(near, [0, 0, 0], at([20, 0, 0]))).toBe(false);
    expect(lodLevelVisible(far, [0, 0, 0], at([20, 0, 0]))).toBe(true);
    expect(lodLevelVisible(near, [0, 0, 0], at([3, 0, 0]))).toBe(true);
  });

  it("keeps differently placed instances of the same authored LOD independent", () => {
    const lodRoot = root([50, 0, 0], 2);
    const near = level(lodRoot, 0, "near");
    const far = level(lodRoot, 1, "far");
    const scope = {};
    const first = {};
    const second = {};

    expect(lodLevelVisible(near, [0, 0, 0], { scope, owner: first, worldPosition: [9, 0, 0] })).toBe(true);
    expect(lodLevelVisible(far, [0, 0, 0], { scope, owner: second, worldPosition: [11, 0, 0] })).toBe(true);
    expect(lodLevelVisible(near, [0, 0, 0], { scope, owner: first, worldPosition: [11, 0, 0] })).toBe(true);
    expect(lodLevelVisible(far, [0, 0, 0], { scope, owner: second, worldPosition: [11, 0, 0] })).toBe(true);
  });

  it("isolates hysteresis between mounts even when the authored root and owner are reused", () => {
    const lodRoot = root([0, 0, 0], 2);
    const near = level(lodRoot, 0, "near");
    const far = level(lodRoot, 1, "far");
    const firstMount = {};
    const secondMount = {};
    const owner = {};

    expect(lodLevelVisible(near, [9, 0, 0], { scope: firstMount, owner })).toBe(true);
    expect(lodLevelVisible(near, [11, 0, 0], { scope: firstMount, owner })).toBe(true);
    expect(lodLevelVisible(far, [11, 0, 0], { scope: secondMount, owner })).toBe(true);
    expect(lodLevelVisible(near, [11, 0, 0], { scope: firstMount, owner })).toBe(true);
  });

  it("keeps different LOD roots independent even if an owner object is reused", () => {
    const firstRoot = root([0, 0, 0], 2);
    const secondRoot = root([0, 0, 0], 2);
    const scope = {};
    const owner = {};

    expect(lodLevelVisible(level(firstRoot, 0, "first"), [9, 0, 0], { scope, owner })).toBe(true);
    expect(lodLevelVisible(level(secondRoot, 1, "second"), [11, 0, 0], { scope, owner })).toBe(true);
    expect(lodLevelVisible(level(firstRoot, 0, "first"), [11, 0, 0], { scope, owner })).toBe(true);
  });

  it("keeps scoped authored-position selections separate without an owner handle", () => {
    const lodRoot = root([0, 0, 0], 2);
    const near = level(lodRoot, 0, "near");
    const far = level(lodRoot, 1, "far");
    const first = {};
    const second = {};

    expect(lodLevelVisible(near, [9, 0, 0], { scope: first })).toBe(true);
    expect(lodLevelVisible(far, [11, 0, 0], { scope: second })).toBe(true);
    expect(lodLevelVisible(near, [11, 0, 0], { scope: first })).toBe(true);
  });

  it("rejects non-finite anchors without changing the prior selection", () => {
    const lodRoot = root([0, 0, 0], 2);
    const near = level(lodRoot, 0, "near");
    const scope = {};
    const owner = {};

    expect(lodLevelVisible(near, [9, 0, 0], { scope, owner })).toBe(true);
    expect(() => lodLevelVisible(near, [0, 0, 0], { scope, owner, worldPosition: [Number.NaN, 0, 0] })).toThrow(/finite/);
    expect(lodLevelVisible(near, [11, 0, 0], { scope, owner })).toBe(true);
  });

  it("retains nested LOD markers and selects them independently", () => {
    const outerRoot = root();
    const innerRoot = root();
    const inner = level(innerRoot, 0, "inner");
    const outer = tagLodLevel({ kind: "group", name: "outer", children: [inner] }, { root: outerRoot, levelIndex: 1 });
    if (outer.kind !== "group") throw new Error("expected a group");

    expect(lodMarkerOf(outer)?.root).toBe(outerRoot);
    expect(lodMarkerOf(outer.children[0])?.root).toBe(innerRoot);
    expect(lodLevelVisible(outer, [20, 0, 0], { scope: {}, owner: {} })).toBe(true);
    expect(lodLevelVisible(outer.children[0], [0, 0, 0], { scope: {}, owner: {} })).toBe(true);
  });
});
