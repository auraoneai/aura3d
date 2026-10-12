/**
 * PRD-10 T2.5: the GPU splat bake runs lazily inside the terrain pass, with
 * the scene target bound. It must hand that target back, or the terrain draw
 * that follows lands on the canvas instead of the scene target.
 */
import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { bakeTerrainSplat } from "../../../../packages/rendering/src/world/terrain/SplatBake";

describe("prd10 splat bake render-target restore", () => {
  it("restores the render target bound before the bake", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 64);
    const scene = device.createRenderTarget({ width: 64, height: 64, label: "scene", format: "rgba16f" });
    device.setRenderTarget(scene);
    const heightTexture = new Texture({ width: 4, height: 4, format: "rgba32f", colorSpace: "linear", data: new Float32Array(64) });
    const bake = bakeTerrainSplat(device, {
      heightTexture,
      heightTexSize: [4, 4],
      texelWorld: 1,
      heightScale: 1,
      resolution: 8,
      layerCount: 6,
      rules: [{ layer: 1, weight: 1, slopeDeg: [25, 90] }]
    });
    expect(bake.splat1).not.toBeNull();
    expect(device.getRenderTarget()).toBe(scene);
    bake.dispose();
    device.endFrame();
    device.dispose();
  });

  it("leaves the canvas bound when nothing was bound before", () => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 64);
    const heightTexture = new Texture({ width: 4, height: 4, format: "rgba32f", colorSpace: "linear", data: new Float32Array(64) });
    bakeTerrainSplat(device, { heightTexture, heightTexSize: [4, 4], texelWorld: 1, heightScale: 1, resolution: 8, layerCount: 2, rules: [] }).dispose();
    expect(device.getRenderTarget()).toBeNull();
    device.endFrame();
    device.dispose();
  });
});
