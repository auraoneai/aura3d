/**
 * PRD-06 T2.5 (§8.5) — the `prd06.velocity-inputs` TypedGLBActor extension:
 * `collectRenderItems` stamps the inert C-14 fields. The palette cache's
 * once-per-presented-frame rotation (`beginFrame`: keys touched since the last
 * call move current→previous) is owned by the present boundary
 * (`SkinningPaletteUploadManager.beginFrame()` in `ForwardPass.execute`, #652),
 * so the test rotates explicitly between frames — `previousJointTexture`
 * = the palette pair's `previous` texture and `previousMorphWeights` = the
 * item's weights as of the prior collect. Flag-off the extension is filtered
 * out entirely.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { typedGLBActorExtensions } from "../../../packages/engine/src/production-runtime/actor/extensions.js";
import { prd06RenderingLaneReady } from "../../../packages/engine/src/lanes/prd06.js";
import { skinningPaletteCache } from "../../../packages/rendering/src/lanes/prd06.js";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";
import type { TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";

const ON_FLAGS = { values: {}, on: (name: string) => name === "A3D_QR_ANIMATION" };
const OFF_FLAGS = { values: {}, on: () => false };
const fakeDevice = {} as RenderDevice;
const actor = {} as TypedGLBActor;

function velocityExtension() {
  const extension = typedGLBActorExtensions(ON_FLAGS).find((entry) => entry.id === "prd06.velocity-inputs");
  expect(extension).toBeDefined();
  return extension!;
}

describe("prd06.velocity-inputs extension (T2.5)", () => {
  // 06-S12: the rendering lane loads behind a dynamic import.
  beforeAll(() => prd06RenderingLaneReady());
  it("is flag-gated: absent while A3D_QR_ANIMATION is off", () => {
    expect(typedGLBActorExtensions(OFF_FLAGS).some((entry) => entry.id === "prd06.velocity-inputs")).toBe(false);
    velocityExtension();
  });

  it("stamps previousJointTexture from the pair rotated at the present boundary", () => {
    const extension = velocityExtension();
    const paletteKey = { skin: "t2.5-rotation" };
    const item = {
      label: "actor:node:mesh",
      geometry: {} as RenderItem["geometry"],
      material: {} as RenderItem["material"],
      modelMatrix: new Float32Array(16),
      skinning: { jointCount: 8, matrices: new Float32Array(8 * 16), paletteKey }
    } as unknown as RenderItem;

    // Frame 1 collect — stamps the previous pair (first use: both pristine).
    const first = extension.collectRenderItems!(actor, [item]);
    const set1 = skinningPaletteCache.paletteUniformSet(paletteKey, 8);
    expect(first[0]).not.toBe(item);
    expect(first[0]!.previousJointTexture).toBe(set1.previous);
    const frame1Current = set1.current;
    skinningPaletteCache.acquire(fakeDevice, paletteKey, 8);
    skinningPaletteCache.upload(paletteKey, new Float32Array(8 * 16).fill(1));

    // Present boundary (ForwardPass.execute) rotates once; the frame 2
    // collect then sees frame 1's current as the previous.
    skinningPaletteCache.beginFrame();
    const second = extension.collectRenderItems!(actor, [item]);
    const set2 = skinningPaletteCache.paletteUniformSet(paletteKey, 8);
    expect(set2.previous).toBe(frame1Current);
    expect(second[0]!.previousJointTexture).toBe(frame1Current);
    skinningPaletteCache.release(paletteKey);
  });

  it("snapshots previousMorphWeights per geometry across collects", () => {
    const extension = velocityExtension();
    const geometry = { id: "geom-t2.5" } as unknown as RenderItem["geometry"];
    const weights1 = [0.25, 0.75];
    const weights2 = [1, 0];
    const make = (weights: number[]) => ({
      label: "actor:node:morph",
      geometry,
      material: {} as RenderItem["material"],
      modelMatrix: new Float32Array(16),
      morphTargets: [{}],
      morphWeights: weights
    } as unknown as RenderItem);

    const frame1 = extension.collectRenderItems!(actor, [make(weights1)]);
    expect(frame1[0]!.previousMorphWeights).toBeUndefined();

    const frame2 = extension.collectRenderItems!(actor, [make(weights2)]);
    expect(Array.from(frame2[0]!.previousMorphWeights ?? [])).toEqual(weights1);
    // The stamped field is a stable copy — later weight edits don't rewrite it.
    weights1[0] = 99;
    expect(Array.from(frame2[0]!.previousMorphWeights ?? [])).toEqual([0.25, 0.75]);
  });

  it("leaves static items untouched (no new item objects)", () => {
    const extension = velocityExtension();
    const item = {
      label: "actor:node:static",
      geometry: {} as RenderItem["geometry"],
      material: {} as RenderItem["material"],
      modelMatrix: new Float32Array(16)
    } as unknown as RenderItem;
    const out = extension.collectRenderItems!(actor, [item]);
    expect(out[0]).toBe(item);
  });
});
