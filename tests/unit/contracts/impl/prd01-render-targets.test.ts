import { describe, expect, it } from "vitest";
import { MockRenderDevice, MockRenderTarget, RenderDeviceError } from "../../../../packages/rendering/src";

// PRD-01 §15 Phase-2 render targets (CONTRACTS §3.4): the PR 0a descriptor
// fields dimension/layers/depthOnly/depthCompare/colorAttachments are real on
// RenderDevice. MockRenderDevice mirrors the WebGL2 surface in memory; the real
// GL path is covered by tests/qr/prd01/browser/render-targets.spec.ts.

describe("prd01 render targets — feature fields (C-11/Q-01-5, lane 03 Q-01-2)", () => {
  it("depth-only cube target exposes six renderable faces", () => {
    const device = new MockRenderDevice();
    device.beginFrame(16, 16);
    const target = device.createRenderTarget({ width: 16, height: 16, label: "shadow-cube", dimension: "cube", depthOnly: true });

    expect(target.dimension).toBe("cube");
    expect(target.layers).toBe(6);
    expect(target.depthTexture?.dimension).toBe("cube");
    expect(target.layerTargets).toHaveLength(6);

    for (const face of target.layerTargets ?? []) {
      device.setRenderTarget(face);
      device.clearRenderTarget([0.25, 0.5, 0.75, 1]);
      expect((face as MockRenderTarget).depthPixels).not.toBeNull();
    }
    expect(device.getDiagnostics().lastError).toBeNull();
  });

  it("2d-array targets expose one child target per layer", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "array-4", dimension: "2d-array", layers: 4 });

    expect(target.dimension).toBe("2d-array");
    expect(target.layers).toBe(4);
    expect(target.colorTexture.dimension).toBe("2d-array");
    expect(target.colorTexture.layers).toBe(4);
    expect(target.layerTargets).toHaveLength(4);

    // Each layer target is an independently bindable surface sharing the array texture.
    for (const [index, layer] of (target.layerTargets ?? []).entries()) {
      device.setRenderTarget(layer);
      device.clearRenderTarget([index / 4, 0, 0, 1]);
      const pixels = device.readPixels(0, 0, 1, 1);
      expect(pixels[0]).toBe(Math.round((index / 4) * 255));
    }
  });

  it("MRT targets receive distinct clears per attachment", () => {
    const device = new MockRenderDevice();
    device.beginFrame(4, 4);
    const target = device.createRenderTarget({
      width: 4,
      height: 4,
      label: "mrt-2",
      colorAttachments: [{ format: "rgba8" }, { format: "rgba16f" }]
    });

    expect(target.colorTextures).toHaveLength(2);
    expect(target.colorTextures?.[1]?.format).toBe("rgba16f");

    device.setRenderTarget(target);
    device.clearRenderTarget([1, 0, 0, 1], 0);
    device.clearRenderTarget([0, 1, 0, 1], 1);

    const attachment0 = device.readPixels(0, 0, 1, 1, 0);
    const attachment1 = device.readPixels(0, 0, 1, 1, 1);
    expect([attachment0[0], attachment0[1], attachment0[2]]).toEqual([255, 0, 0]);
    expect([attachment1[0], attachment1[1], attachment1[2]]).toEqual([0, 255, 0]);
  });

  it("attachment-less clear fills every MRT attachment", () => {
    const device = new MockRenderDevice();
    device.beginFrame(4, 4);
    const target = device.createRenderTarget({
      width: 4,
      height: 4,
      label: "mrt-fill",
      colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }]
    });
    device.setRenderTarget(target);
    device.clearRenderTarget([0.5, 0.25, 1, 1]);
    expect(device.readPixels(0, 0, 1, 1, 0)[2]).toBe(255);
    expect(device.readPixels(0, 0, 1, 1, 1)[2]).toBe(255);
    expect(device.readPixels(0, 0, 1, 1, 0)[0]).toBe(128);
  });

  it("depthCompare targets allocate a sampleable depth texture", () => {
    const device = new MockRenderDevice();
    device.beginFrame(4, 4);
    const target = device.createRenderTarget({ width: 4, height: 4, label: "shadow-2d", depth: "texture", depthCompare: true });
    expect(target.depthTexture).toBeDefined();
    expect(target.layerTargets).toBeUndefined();
  });

  it("rejects invalid descriptor combinations", () => {
    const device = new MockRenderDevice();
    device.beginFrame(4, 4);
    expect(() => device.createRenderTarget({ width: 4, height: 4, layers: 2 })).toThrowError(RenderDeviceError);
    expect(() => device.createRenderTarget({ width: 4, height: 4, dimension: "cube", layers: 6 })).toThrowError(RenderDeviceError);
    expect(() => device.createRenderTarget({ width: 4, height: 4, dimension: "2d-array", layers: 0 })).toThrowError(RenderDeviceError);
    expect(() => device.createRenderTarget({ width: 4, height: 4, depthOnly: true, colorAttachments: [{ format: "rgba8" }] })).toThrowError(RenderDeviceError);
    expect(() => device.createRenderTarget({ width: 4, height: 4, depthOnly: true, depth: false })).toThrowError(RenderDeviceError);
  });

  it("layer children are bindable but not independently disposable owners", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const target = device.createRenderTarget({ width: 8, height: 8, dimension: "cube", label: "own" });
    const child = target.layerTargets![0]!;
    child.dispose();
    expect(child.disposed).toBe(true);
    // Parent still binds (shared resources survive child dispose).
    device.setRenderTarget(target);
    target.dispose();
    expect(target.disposed).toBe(true);
    expect((target.layerTargets![5] as MockRenderTarget).disposed).toBe(true);
  });
});
