/**
 * PRD-06 T2.8 (§9.7) — shader warm-up on actor load: the `prd06.animation`
 * extension's `onLoad` kicks the installed compiler over the actor's
 * skinned/morph render items, and its `collectRenderItems` withholds exactly
 * those items until the compile resolves. With the C-28-stub semantics
 * (resolve after a synchronous compile) the promise settles on a microtask —
 * at most one presented frame is withheld.
 */

import { afterEach, describe, expect, it } from "vitest";
import { typedGLBActorExtensions } from "../../../packages/engine/src/production-runtime/actor/extensions.js";
import "../../../packages/engine/src/lanes/prd06.js";
import {
  beginPrd06ShaderWarmup,
  disposePrd06ShaderWarmup,
  filterPrd06ShaderWarmupItems,
  setPrd06ShaderWarmupCompiler
} from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.js";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

const ON_FLAGS = { values: {}, on: (name: string) => name === "A3D_QR_ANIMATION" };
const OFF_FLAGS = { values: {}, on: () => false };

function skinnedItem(label: string): RenderItem {
  return {
    label,
    geometry: { id: `geom-${label}` } as unknown as RenderItem["geometry"],
    material: {} as RenderItem["material"],
    modelMatrix: new Float32Array(16),
    skinning: { jointCount: 8, matrices: new Float32Array(8 * 16) }
  } as unknown as RenderItem;
}

function morphItem(label: string): RenderItem {
  return {
    label,
    geometry: { id: `geom-${label}` } as unknown as RenderItem["geometry"],
    material: {} as RenderItem["material"],
    modelMatrix: new Float32Array(16),
    morphTargets: [] as RenderItem["morphTargets"],
    morphWeights: [0.5]
  } as unknown as RenderItem;
}

function staticItem(label: string): RenderItem {
  return {
    label,
    geometry: { id: `geom-${label}` } as unknown as RenderItem["geometry"],
    material: {} as RenderItem["material"],
    modelMatrix: new Float32Array(16)
  } as unknown as RenderItem;
}

afterEach(() => setPrd06ShaderWarmupCompiler(null));

describe("prd06 shader warm-up (T2.8)", () => {
  it("the prd06.animation extension carries onLoad + collectRenderItems under the flag", () => {
    const extension = typedGLBActorExtensions(ON_FLAGS).find((entry) => entry.id === "prd06.animation");
    expect(extension).toBeDefined();
    expect(extension!.onLoad).toBeTypeOf("function");
    expect(extension!.collectRenderItems).toBeTypeOf("function");
    expect(typedGLBActorExtensions(OFF_FLAGS).some((entry) => entry.id === "prd06.animation")).toBe(false);
  });

  it("withholds skinned/morph items until the compiler resolves — stub settles inside one frame", async () => {
    const actor = {} as TypedGLBActor;
    const items = [skinnedItem("a"), staticItem("b"), morphItem("c")];
    const seen: string[][] = [];
    // C-28-stub shape: a synchronous compile wrapped in a resolved promise.
    setPrd06ShaderWarmupCompiler((warm) => {
      seen.push(warm.map((item) => item.label ?? "?"));
      return Promise.resolve();
    });

    beginPrd06ShaderWarmup(actor, items);
    // Warm set handed to the compiler immediately at load.
    expect(seen).toEqual([["a", "c"]]);
    // Frame 1 collect — compile still in flight: warm items withheld, static passes.
    const withheld = filterPrd06ShaderWarmupItems(actor, items);
    expect(withheld.map((item) => item.label)).toEqual(["b"]);
    // Microtask later — the stub's synchronous-compile promise has resolved.
    await Promise.resolve();
    const released = filterPrd06ShaderWarmupItems(actor, items);
    expect(released).toBe(items);
    disposePrd06ShaderWarmup(actor);
  });

  it("keeps items withheld while the compiler promise is pending", async () => {
    const actor = {} as TypedGLBActor;
    const items = [skinnedItem("a"), morphItem("c")];
    let resolve: () => void = () => {};
    setPrd06ShaderWarmupCompiler(() => new Promise<void>((done) => { resolve = done; }));
    beginPrd06ShaderWarmup(actor, items);
    await Promise.resolve();
    expect(filterPrd06ShaderWarmupItems(actor, items)).toEqual([]);
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(filterPrd06ShaderWarmupItems(actor, items)).toBe(items);
    disposePrd06ShaderWarmup(actor);
  });

  it("is a no-op with no compiler installed — nothing withheld", () => {
    const actor = {} as TypedGLBActor;
    const items = [skinnedItem("a")];
    beginPrd06ShaderWarmup(actor, items);
    expect(filterPrd06ShaderWarmupItems(actor, items)).toBe(items);
    disposePrd06ShaderWarmup(actor);
  });

  it("is a no-op when the actor has no skinned/morph items", () => {
    const actor = {} as TypedGLBActor;
    const items = [staticItem("b")];
    let called = false;
    setPrd06ShaderWarmupCompiler(() => { called = true; });
    beginPrd06ShaderWarmup(actor, items);
    expect(called).toBe(false);
    expect(filterPrd06ShaderWarmupItems(actor, items)).toBe(items);
    disposePrd06ShaderWarmup(actor);
  });
});
