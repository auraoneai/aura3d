/**
 * 01-S2 — 1,000-node dirty cache (compiler/sceneGraph.ts, C-06 under
 * A3D_QR_CORE). A static 1,000-leaf hierarchy composes every world matrix once
 * on frame 1 and none on frame 2; mutating one node recomposes only that node;
 * mutating a group recomposes the group and its subtree.
 */

import { describe, expect, it } from "vitest";

import { createPrd01SceneGraphCache, flattenSceneNodesV2 } from "../../../../packages/engine/src/agent-api/compiler/sceneGraph";
import type { AuraGroupNode, AuraPrimitiveNode, AuraSceneNode } from "../../../../packages/engine/src/agent-api/nodes/types";

const GROUPS = 10;
const LEAVES_PER_GROUP = 100;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function buildScene(): { roots: Mutable<AuraGroupNode>[]; leaves: Mutable<AuraPrimitiveNode>[] } {
  const roots: Mutable<AuraGroupNode>[] = [];
  const leaves: Mutable<AuraPrimitiveNode>[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    const children: AuraSceneNode[] = [];
    for (let i = 0; i < LEAVES_PER_GROUP; i += 1) {
      const leaf = { kind: "primitive", primitive: "box", position: [i * 0.1, 0, g], rotation: [0, i * 0.01, 0] } as Mutable<AuraPrimitiveNode>;
      leaves.push(leaf);
      children.push(leaf);
    }
    roots.push({ kind: "group", children, position: [g, 0, 0], rotation: [0, g * 0.1, 0] } as Mutable<AuraGroupNode>);
  }
  return { roots, leaves };
}

describe("01-S2 compiler/sceneGraph 1,000-node dirty cache", () => {
  it("frame 1 composes every node, frame 2 composes none", () => {
    const { roots, leaves } = buildScene();
    expect(leaves).toHaveLength(1000);
    const cache = createPrd01SceneGraphCache();
    cache.beginFrame();
    const first = flattenSceneNodesV2(roots, { cache });
    expect(first).toHaveLength(1000);
    expect(cache.composed).toBe(1000 + GROUPS);
    expect(cache.hits).toBe(0);

    cache.beginFrame();
    const second = flattenSceneNodesV2(roots, { cache });
    expect(cache.composed).toBe(0);
    expect(cache.hits).toBe(1000 + GROUPS);
    expect(second).toEqual(first);
  });

  it("mutating one leaf recomposes exactly that leaf", () => {
    const { roots, leaves } = buildScene();
    const cache = createPrd01SceneGraphCache();
    flattenSceneNodesV2(roots, { cache });
    leaves[537]!.position = [9, 9, 9];
    cache.beginFrame();
    flattenSceneNodesV2(roots, { cache });
    expect(cache.composed).toBe(1);
  });

  it("mutating a group recomposes the group and its 100 children only", () => {
    const { roots } = buildScene();
    const cache = createPrd01SceneGraphCache();
    flattenSceneNodesV2(roots, { cache });
    roots[3]!.rotation = [0, 1.234, 0];
    cache.beginFrame();
    flattenSceneNodesV2(roots, { cache });
    expect(cache.composed).toBe(1 + LEAVES_PER_GROUP);
  });

  it("rotationOrder and quaternion are part of the dirty fingerprint", () => {
    const { roots, leaves } = buildScene();
    const cache = createPrd01SceneGraphCache();
    flattenSceneNodesV2(roots, { cache });
    leaves[0]!.rotationOrder = "XYZ";
    leaves[1]!.quaternion = [0, 0, 0, 1];
    cache.beginFrame();
    flattenSceneNodesV2(roots, { cache });
    expect(cache.composed).toBe(2);
  });

  it("invalidate(node) forces one recompose", () => {
    const { roots, leaves } = buildScene();
    const cache = createPrd01SceneGraphCache();
    flattenSceneNodesV2(roots, { cache });
    cache.invalidate(leaves[10]!);
    cache.beginFrame();
    flattenSceneNodesV2(roots, { cache });
    expect(cache.composed).toBe(1);
  });
});
