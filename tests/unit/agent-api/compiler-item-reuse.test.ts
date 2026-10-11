// #1142 — A3D_QR_COMPILER T3.12 RenderItem reuse must never present a stale
// item. 08-skinned-character (a skinned GLB with no authored animation) was
// the only Round-2 probe that changed with `compiler` alone (washed out,
// median object luminance 117 → 185, run 38130885306): its node carried no
// `animation`, so its per-frame skinned items were cached and reused.

import { describe, expect, it } from "vitest";
import { reuseRenderItemsForTest } from "../../../packages/engine/src/agent-api/compiler/compileScene";
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

function frame(impl: Impl, item: RenderItem): RenderItem {
  const source = { renderItems: [item] } as unknown as RenderSource;
  const out = reuseRenderItemsForTest(impl, source, registry);
  return [...out.collectRenderItems!()][0];
}

const geometry = {} as RenderItem["geometry"];

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
    const a = { label: "actor-0:body", geometry, material } as unknown as RenderItem;
    const b = { label: "actor-0:body", geometry, material } as unknown as RenderItem;
    expect(frame(impl, a)).toBe(a);
    expect(frame(impl, b)).toBe(a);
  });
});
