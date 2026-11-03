// #1142 — A3D_QR_COMPILER T3.12 RenderItem reuse must never present a stale
// item. 08-skinned-character (a skinned GLB with no authored animation) was
// the only Round-2 probe that changed with `compiler` alone (washed out,
// median object luminance 117 → 185, run 38130885306): its node carried no
// `animation`, so its per-frame skinned items were cached and reused.

import { describe, expect, it } from "vitest";
import { reuseRenderItemsForTest } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState, setRuntimeQueryRenderItems } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { raycast } from "../../../packages/engine/src/agent-api/SceneQueries";
import { Geometry, IndexBuffer, VertexBuffer, VertexFormat } from "../../../packages/rendering/src";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import type { RenderItem, RenderSource } from "@aura3d/rendering";

type Impl = Parameters<typeof reuseRenderItemsForTest>[0];
type Registry = Parameters<typeof reuseRenderItemsForTest>[2];

const node = { kind: "model", name: "cesium man", runtime: { id: "man" } };
const registry = { get: (id: string) => (id === "man" ? { version: 0 } : undefined) } as unknown as Registry;

function implFor(): Impl {
  return {
    primitiveEntries: [],
    actorEntries: [{ node } as never],
    itemCache: new Map()
  } as unknown as Impl;
}

function frame(impl: Impl, item: RenderItem, currentRegistry: Registry = registry): RenderItem {
  const source = { renderItems: [item] } as unknown as RenderSource;
  const out = reuseRenderItemsForTest(impl, source, currentRegistry);
  return [...out.collectRenderItems!()][0];
}

const geometry = {} as RenderItem["geometry"];
const identityMatrix = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

describe("C-36 RenderItem reuse (#1142)", () => {
  it("never reuses a skinned item even when its node has no animation", () => {
    const impl = implFor();
    const first = { label: "actor-0:body", geometry, skinning: { joints: 1 } } as unknown as RenderItem;
    const second = { label: "actor-0:body", geometry, skinning: { joints: 2 } } as unknown as RenderItem;
    expect(frame(impl, first)).toBe(first);
    expect(frame(impl, second)).toBe(second);
  });

  it("drops the cached item when an async upgrade swaps the material", () => {
    const impl = implFor();
    const untextured = { label: "actor-0:body", geometry, material: { id: "scalar" } } as unknown as RenderItem;
    const textured = { label: "actor-0:body", geometry, material: { id: "textured" } } as unknown as RenderItem;
    expect(frame(impl, untextured)).toBe(untextured);
    expect(frame(impl, textured)).toBe(textured);
  });

  it("still reuses an unchanged static item (T3.12)", () => {
    const impl = implFor();
    const material = { id: "m" } as unknown as RenderItem["material"];
    const a = { label: "actor-0:body", geometry, material, modelMatrix: identityMatrix(), drawRange: { start: 0, count: 3 } } as RenderItem;
    const b = { label: "actor-0:body", geometry, material, modelMatrix: Array.from(identityMatrix()), drawRange: { start: 0, count: 3 } } as RenderItem;
    expect(frame(impl, a)).toBe(a);
    expect(frame(impl, b)).toBe(a);
  });

  it("submits the current world transform after an ancestor moves without changing the child version", () => {
    const child = { kind: "primitive" as const, primitive: "custom" as const, name: "triangle", runtime: { id: "child" } };
    const parent = { kind: "group" as const, name: "parent", runtime: { id: "parent" }, children: [child] };
    const nodes = createAuraRuntimeNodeRegistry({ nodes: [parent] } as unknown as AuraSceneSnapshot);
    const parentHandle = nodes.require("parent");
    const childHandle = nodes.require("child");
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [0, 0, 0]);
    vertices.setAttribute(1, "position", [1, 0, 0]);
    vertices.setAttribute(2, "position", [0, 1, 0]);
    const triangle = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const impl = { primitiveEntries: [{ node: child }], actorEntries: [], itemCache: new Map() } as unknown as Impl;
    const item = (): RenderItem => ({
      label: "primitive-0:triangle", geometry: triangle, modelMatrix: runtimeNodeQueryState(childHandle)!.worldMatrix
    });
    const rayAt = (x: number) => ({ origin: [x, 0.25, 5] as const, direction: [0, 0, -1] as const });
    try {
      const first = item();
      setRuntimeQueryRenderItems(childHandle, [first]);
      expect(frame(impl, first, nodes)).toBe(first);
      expect(raycast(rayAt(0.25), { handles: [childHandle], mode: "mesh" })).toHaveLength(1);
      const childVersion = childHandle.version;

      parentHandle.setPosition(3, 0, 0);
      parentHandle.setRotation(0, 0, Math.PI / 2);
      parentHandle.setScale(2);
      expect(childHandle.version).toBe(childVersion);
      const moved = item();
      setRuntimeQueryRenderItems(childHandle, [moved]);
      const rendered = frame(impl, moved, nodes);
      expect(rendered).toBe(moved);
      expect(rendered.modelMatrix).toEqual(runtimeNodeQueryState(childHandle)!.renderItems![0]!.modelMatrix);
      expect(raycast(rayAt(0.25), { handles: [childHandle], mode: "mesh" })).toHaveLength(0);
      expect(raycast(rayAt(2.75), { handles: [childHandle], mode: "mesh" })).toHaveLength(1);
    } finally {
      triangle.dispose();
    }
  });

  it.each(["modelMatrix", "geometryMatrix", "normalMatrix", "modelViewProjectionMatrix"] as const)(
    "does not reuse an item when %s changes",
    (field) => {
      const impl = implFor();
      const first = { label: "actor-0:body", geometry, [field]: Array.from(identityMatrix()) } as RenderItem;
      const matrix = identityMatrix();
      matrix[12] = 2;
      const changed = { ...first, [field]: matrix };
      expect(frame(impl, first)).toBe(first);
      expect(frame(impl, changed)).toBe(changed);
    }
  );

  it("invalidates on a changed draw range, including when a range is added or removed", () => {
    const impl = implFor();
    const noRange = { label: "actor-0:body", geometry } as RenderItem;
    const first = { ...noRange, drawRange: { start: 0, count: 3 } };
    const changed = { ...noRange, drawRange: { start: 3, count: 6 } };
    expect(frame(impl, noRange)).toBe(noRange);
    expect(frame(impl, first)).toBe(first);
    expect(frame(impl, changed)).toBe(changed);
    expect(frame(impl, noRange)).toBe(noRange);
  });

  it.each([
    ["label", "actor-0:other"], ["castShadow", false], ["receiveShadow", false],
    ["includeInAutoFrame", false], ["renderOrder", 2], ["frustumCulled", false],
    ["layerMask", 4], ["lodFade", 0.5], ["lodLevel", 2], ["cameraFade", 0.5],
    ["wrinkleStrength", 0.25], ["environmentCubeMip", 2], ["cubeCameraEnvMap", "reflection"],
    ["writesReactive", true], ["shadowGeometry", {}], ["environmentCube", {}],
    ["instanceAttributes", []], ["instanceEmissive", new Float32Array([1, 0, 0])],
    ["boundingBoxCenter", [1, 2, 3]], ["previousModelMatrix", new Float32Array(16)],
    ["previousInstanceTransforms", new Float32Array(16)], ["previousMorphWeights", new Float32Array([1])],
    ["previousJointTexture", {}], ["userData", { id: 1 }], ["onBeforeRender", () => undefined],
    ["futureRendererState", { mode: "future" }]
  ] as const)("does not reuse an item when %s changes", (field, value) => {
    const impl = implFor();
    const first = { label: "actor-0:body", geometry } as RenderItem;
    const changed = { ...first, [field]: value } as RenderItem;
    expect(frame(impl, first)).toBe(first);
    expect(frame(impl, changed)).toBe(changed);
  });

  it.each([
    ["geometry", {}, {}], ["material", {}, {}], ["castShadow", true, false],
    ["lodFade", 1, 0.5], ["renderOrder", 0, 3], ["layerMask", 1, 2],
    ["instanceTransforms", identityMatrix(), identityMatrix()],
    ["instanceColors", new Float32Array([1, 0, 0, 1]), new Float32Array([0, 1, 0, 1])],
    ["onBeforeRender", () => undefined, () => undefined], ["userData", { id: 1 }, { id: 2 }]
  ] as const)("invalidates when an existing %s changes", (field, before, after) => {
    const impl = implFor();
    const first = { label: "actor-0:body", geometry, [field]: before } as RenderItem;
    const changed = { ...first, [field]: after } as RenderItem;
    expect(frame(impl, first)).toBe(first);
    expect(frame(impl, changed)).toBe(changed);
  });

  it("does not reuse an item when its node version changes", () => {
    const impl = implFor();
    let version = 0;
    const changingRegistry = { get: () => ({ version }) } as unknown as Registry;
    const first = { label: "actor-0:body", geometry } as RenderItem;
    const next = { ...first };
    expect(frame(impl, first, changingRegistry)).toBe(first);
    version += 1;
    expect(frame(impl, next, changingRegistry)).toBe(next);
  });

  it.each([
    ["skinning", { jointCount: 1, matrices: identityMatrix() }],
    ["morphTargets", [{ positions: [[0, 0, 1]] }]],
    ["morphWeights", [0.5]]
  ] as const)("never reuses %s items, even if their current references are unchanged", (field, value) => {
    const impl = implFor();
    const first = { label: "actor-0:body", geometry, [field]: value } as RenderItem;
    const next = { ...first };
    expect(frame(impl, first)).toBe(first);
    expect(frame(impl, next)).toBe(next);
  });

  it("does not reuse the wrong item when a node's mesh order changes", () => {
    const impl = implFor();
    const first = { label: "actor-0:mesh-a", geometry } as RenderItem;
    const second = { label: "actor-0:mesh-b", geometry } as RenderItem;
    const collect = (items: RenderItem[]) => [...reuseRenderItemsForTest(impl, { renderItems: items }, registry).collectRenderItems!()];
    expect(collect([first, second])).toEqual([first, second]);
    const nextSecond = { ...second };
    const nextFirst = { ...first };
    const reordered = collect([nextSecond, nextFirst]);
    expect(reordered[0]).toBe(nextSecond);
    expect(reordered[1]).toBe(nextFirst);
  });
});
