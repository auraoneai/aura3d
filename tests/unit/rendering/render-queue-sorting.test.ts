import { describe, expect, it } from "vitest";
import {
  ForwardPass,
  Geometry,
  MockRenderDevice,
  UnlitMaterial,
  sortRenderQueueItems
} from "../../../packages/rendering/src";

describe("render queue sorting", () => {
  it("sorts opaque items front-to-back and transparent items back-to-front", () => {
    const plan = sortRenderQueueItems([
      { item: "transparent-near", bucket: "transparent", depth: 2, pipelineKey: "glass" },
      { item: "opaque-far", bucket: "opaque", depth: 8, pipelineKey: "mat-a" },
      { item: "opaque-near", bucket: "opaque", depth: 1, pipelineKey: "mat-b" },
      { item: "masked-mid", bucket: "mask", depth: 4, pipelineKey: "foliage", batchKey: "foliage", instanceCount: 3 },
      { item: "transparent-far", bucket: "transparent", depth: 12, pipelineKey: "glass" }
    ]);

    expect(plan.items).toEqual([
      "opaque-near",
      "opaque-far",
      "masked-mid",
      "transparent-far",
      "transparent-near"
    ]);
    expect(plan.diagnostics).toMatchObject({
      total: 5,
      objectCount: 5,
      estimatedDrawCalls: 5,
      totalInstances: 7,
      opaqueCount: 2,
      maskedCount: 1,
      transparentCount: 2,
      materialSwitches: 3,
      opaqueFrontToBack: true,
      transparentBackToFront: true
    });
  });

  it("can group opaque work by pipeline key for explicit batching plans", () => {
    const plan = sortRenderQueueItems([
      { item: "b-near", bucket: "opaque", depth: 1, pipelineKey: "b" },
      { item: "a-far", bucket: "opaque", depth: 10, pipelineKey: "a" },
      { item: "a-mid", bucket: "opaque", depth: 5, pipelineKey: "a" }
    ], { groupOpaqueByPipeline: true });

    expect(plan.items).toEqual(["a-mid", "a-far", "b-near"]);
    expect(plan.diagnostics.pipelineTransitions).toBe(1);
    expect(plan.diagnostics.batchableGroups).toBe(1);
    expect(plan.diagnostics.largestBatch).toBe(2);
  });

  it("rejects invalid queue depths before a frame reaches the GPU", () => {
    expect(() => sortRenderQueueItems([{ item: "bad", bucket: "opaque", depth: Number.NaN }])).toThrow(/depth/i);
    expect(() => sortRenderQueueItems([{ item: "bad", bucket: "opaque", depth: 1, instanceCount: 0 }])).toThrow(/instanceCount/i);
  });

  it("drives ForwardPass opaque early-Z order and alpha order through the public sorter", () => {
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const transparent = new UnlitMaterial({
      name: "transparent",
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    });

    device.beginFrame(8, 8);
    new ForwardPass({
      cameraPosition: [0, 0, 0],
      items: [
        { geometry, material: new UnlitMaterial({ name: "opaque-far" }), modelMatrix: translationMatrix(0, 0, -8), label: "opaque-far" },
        { geometry, material: transparent, modelMatrix: translationMatrix(0, 0, -2), label: "transparent-near" },
        { geometry, material: new UnlitMaterial({ name: "opaque-near" }), modelMatrix: translationMatrix(0, 0, -1), label: "opaque-near" },
        { geometry, material: transparent, modelMatrix: translationMatrix(0, 0, -12), label: "transparent-far" }
      ]
    }).execute({ device, width: 8, height: 8 });
    device.endFrame();

    expect(device.drawCommands.map((command) => command.label)).toEqual([
      "opaque-near",
      "opaque-far",
      "transparent-far",
      "transparent-near"
    ]);
  });
});

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}
