import { describe, expect, it } from "vitest";
import { createRenderDevice, runWebGPURenderToTextureProof } from "../../../packages/rendering/src";
import { createProofWebGPU } from "./webgpu-rtt-mock";

describe("native-shaped WebGPU offscreen proof", () => {
  it("compares independently read source and copied pixels and restores the previous target", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    const previous = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    device.setRenderTarget(previous);
    try {
      const proof = await runWebGPURenderToTextureProof(device, {
        width: 8, height: 8, triangleColor: [0.75, 0.25, 0.5, 1], clearColor: [0, 0, 0, 1]
      });
      expect(proof.presentation).toBe("offscreen-copy");
      expect(proof.targetPixel).toEqual([191, 64, 128, 255]);
      expect(proof.presentedPixel).toEqual(proof.targetPixel);
      expect(proof.readbackMatchesPresentation).toBe(true);
      expect(device.getRenderTarget?.()).toBe(previous);
      expect(mock.events.filter((event) => event === "copy-readback")).toHaveLength(3);
      expect(mock.events.filter((event) => event === "triangle")).toHaveLength(1);
      expect(mock.events.filter((event) => event === "presentation-copy")).toHaveLength(1);
    } finally { previous.dispose(); device.dispose(); }
  });

  it("samples the same native row from a small even-height target and its copy", async () => {
    const mock = createProofWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const proof = await runWebGPURenderToTextureProof(device, { width: 2, height: 2 });
      expect(proof.targetPixel).toEqual([26, 204, 51, 255]);
      expect(proof.presentedPixel).toEqual(proof.targetPixel);
      expect(proof.readbackMatchesPresentation).toBe(true);
    } finally { device.dispose(); }
  });

  it("does not report a match when the copied output differs", async () => {
    const mock = createProofWebGPU({ corruptCopy: true });
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    try {
      const proof = await runWebGPURenderToTextureProof(device, { width: 8, height: 8 });
      expect(proof.targetPixel).toEqual([26, 204, 51, 255]);
      expect(proof.presentedPixel).not.toEqual(proof.targetPixel);
      expect(proof.readbackMatchesPresentation).toBe(false);
    } finally { device.dispose(); }
  });

  it("releases created resources and restores state if native readback fails", async () => {
    const mock = createProofWebGPU({ rejectReadback: true });
    const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu });
    const previous = device.createRenderTarget({ width: 2, height: 2, format: "rgba8", depth: false });
    device.setRenderTarget(previous);
    try {
      await expect(runWebGPURenderToTextureProof(device, { width: 8, height: 8, disposeResources: false })).rejects.toThrow("injected readback failure");
      expect(device.getRenderTarget?.()).toBe(previous);
      expect(device.getDiagnostics().renderTargets).toBe(1);
      expect(device.getDiagnostics().buffers).toBe(0);
      expect(device.getDiagnostics().shaders).toBe(0);
      expect(mock.events).not.toContain("presentation-copy");
    } finally { previous.dispose(); device.dispose(); }
  });

  it("fails before allocating when native proof capabilities are absent", () => {
    const createRenderTarget = () => { throw new Error("must not allocate"); };
    const base = { kind: "webgpu", createRenderTarget };
    expect(() => runWebGPURenderToTextureProof(base as never)).toThrow(/asynchronous texture readback/);
    expect(() => runWebGPURenderToTextureProof({ ...base, readPixelsAsync: async () => new Uint8Array() } as never)).toThrow(/presentation-copy pass/);
    expect(() => runWebGPURenderToTextureProof({ ...base, readPixelsAsync: async () => new Uint8Array(), presentLdrPostprocess() {} } as never)).toThrow(/state inspection/);
    expect(() => runWebGPURenderToTextureProof(base as never, { width: 0 })).toThrow(/positive integers/);
  });
});
