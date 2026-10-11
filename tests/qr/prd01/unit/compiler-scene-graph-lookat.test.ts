/**
 * 01-S2 — lookAt after composition (compiler/sceneGraph.ts, C-06 under
 * A3D_QR_CORE). The lookAt target is a world-space point: it is never
 * transformed by the parent, the child's own lookAt wins over the parent's,
 * and the node's position is composed first so a light's direction is
 * world(position) -> target.
 */

import { describe, expect, it } from "vitest";

import { flattenSceneNodesV2 } from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { flattenSceneNodes } from "../../../../packages/engine/src/agent-api/sceneMath";
import type { AuraGroupNode, AuraSceneNode, AuraTransformSpec, AuraVec3 } from "../../../../packages/engine/src/agent-api/nodes/types";

/** Flattened nodes all carry transform fields (pass-through kinds are not inspected here). */
type FlatNode = AuraTransformSpec & { readonly kind: string };
const flatV2 = (nodes: readonly AuraSceneNode[], options?: Parameters<typeof flattenSceneNodesV2>[1]): FlatNode[] =>
  flattenSceneNodesV2(nodes, options) as unknown as FlatNode[];
const flatLegacy = (nodes: readonly AuraSceneNode[]): FlatNode[] => flattenSceneNodes(nodes) as unknown as FlatNode[];

function spot(extra: Record<string, unknown> = {}): AuraSceneNode {
  return { kind: "light", light: "spot", ...extra } as unknown as AuraSceneNode;
}

function group(children: readonly AuraSceneNode[], extra: Partial<AuraGroupNode> = {}): AuraGroupNode {
  return { kind: "group", children, ...extra } as AuraGroupNode;
}

function close(actual: readonly number[] | undefined, expected: AuraVec3, eps = 1e-6): void {
  expect(actual).toBeDefined();
  for (let i = 0; i < 3; i += 1) expect(Math.abs(actual![i]! - expected[i])).toBeLessThan(eps);
}

describe("01-S2 lookAt after composition", () => {
  it("the child's lookAt target is world space: not rotated, scaled or moved by the parent", () => {
    const [light] = flatV2([
      group([spot({ position: [1, 0, 0], lookAt: [0, 0, 0] })], { position: [5, 0, 0], rotation: [0, Math.PI / 2, 0], scale: 2 })
    ]);
    // position composed first: parent · [1,0,0] = [5,0,0] + R_y(π/2)·[2,0,0] = [5,0,-2]
    close(light!.position, [5, 0, -2]);
    expect(light!.lookAt).toEqual([0, 0, 0]);
  });

  it("an ancestor's lookAt is inherited unchanged when the child has none", () => {
    const [light] = flatV2([group([group([spot({ position: [0, 1, 0] })], { position: [0, 0, 3] })], { lookAt: [1, 2, 3] })]);
    expect(light!.lookAt).toEqual([1, 2, 3]);
    close(light!.position, [0, 1, 3]);
  });

  it("the child's own lookAt wins over the parent's", () => {
    const [light] = flatV2([group([spot({ lookAt: [9, 9, 9] })], { lookAt: [1, 2, 3], position: [0, 1, 0] })]);
    expect(light!.lookAt).toEqual([9, 9, 9]);
  });

  it("lookAt-only root group: target propagates without moving children (matches legacy)", () => {
    const nodes = [group([spot({ position: [0, 2, 0] })], { lookAt: [0, 0, 0] })];
    const [v2] = flatV2(nodes);
    const [legacy] = flatLegacy(nodes);
    expect(v2!.lookAt).toEqual(legacy!.lookAt);
    close(v2!.position, legacy!.position as AuraVec3);
  });

  it("the composed direction world(position) -> target differs from legacy under a rotated parent", () => {
    const nodes = [group([spot({ position: [0, 0, 2], lookAt: [0, 0, 0] })], { rotation: [0, Math.PI / 2, 0] })];
    const [v2] = flatV2(nodes);
    const [legacy] = flatLegacy(nodes);
    close(v2!.position, [2, 0, 0]);
    expect(legacy!.position).toEqual([0, 0, 2]);
  });
});
