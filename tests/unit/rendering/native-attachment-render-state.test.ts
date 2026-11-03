import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderCommandState } from "../../../packages/rendering/src/RenderDevice";
import { renderPipelineStateKey, renderStateSignature, validateRenderCommandState } from "../../../packages/rendering/src/contracts/blend";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";

const base: RenderCommandState = {
  depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal"
};
const coverage: RenderCommandState = {
  ...base,
  colorAttachments: [undefined, { colorWrite: [true, false, false, false], blendMode: "opaque" }]
};

describe("per-attachment render state contract", () => {
  it("accepts dense inherited slots and checks the actual attachment count", () => {
    expect(() => validateRenderCommandState(base, 1)).not.toThrow();
    expect(() => validateRenderCommandState(coverage, 2)).not.toThrow();
    expect(() => validateRenderCommandState(coverage, 1)).toThrow(/attachment count/i);
    expect(() => validateRenderCommandState({ ...base, colorAttachments: [] }, 0)).not.toThrow();
    expect(() => validateRenderCommandState(base, -1)).toThrow(/attachment count/i);
  });

  it("rejects malformed, sparse, out-of-range and unsupported override values", () => {
    const withAttachments = (value: unknown) => ({ ...base, colorAttachments: value }) as RenderCommandState;
    const sparse = new Array(2);
    sparse[1] = {};
    const sparseMask = [true, false, false, false];
    delete sparseMask[2];
    for (const value of [null, {}, [null], [[true]], sparse, [{ colorWrite: [true, false, false] }],
      [{ colorWrite: [true, false, 0, false] }], [{ colorWrite: sparseMask }], [{ blendMode: null }], [{ blendMode: "unknown" }],
      [{ blendMode: { kind: "custom", color: { equation: "add", src: "one", dst: "src-alpha-saturated" }, alpha: { equation: "add", src: "one", dst: "zero" } } }],
      [{ ignoredField: true }], new Array(65).fill(undefined)]) {
      expect(() => validateRenderCommandState(withAttachments(value))).toThrow();
    }
  });

  it("includes per-attachment writes and resolved blending in pipeline and batch identity", () => {
    const same: RenderCommandState = { ...base, colorAttachments: [undefined, { blendMode: "opaque", colorWrite: [true, false, false, false] }] };
    const changedMask: RenderCommandState = { ...base, colorAttachments: [undefined, { blendMode: "opaque", colorWrite: [true, true, false, false] }] };
    const changedBlend: RenderCommandState = { ...base, colorAttachments: [undefined, { blendMode: "alpha", colorWrite: [true, false, false, false] }] };
    expect(renderPipelineStateKey(coverage)).toBe(renderPipelineStateKey(same));
    expect(renderPipelineStateKey(coverage)).not.toBe(renderPipelineStateKey(changedMask));
    expect(renderPipelineStateKey(coverage)).not.toBe(renderPipelineStateKey(changedBlend));
    expect(renderPipelineStateKey(base)).not.toBe(renderPipelineStateKey(coverage));
    expect(renderStateSignature(coverage)).not.toBe(renderStateSignature(changedMask));
    expect(renderPipelineStateKey({ ...coverage, scissor: { x: 0, y: 0, width: 1, height: 1 } })).toBe(renderPipelineStateKey(coverage));
    expect(renderStateSignature({ ...coverage, scissor: { x: 0, y: 0, width: 1, height: 1 } })).not.toBe(renderStateSignature(coverage));
  });

  it("rejects unsupported WebGL overrides before mutating state or submitting a fallback batch", () => {
    const gl = { getExtension: vi.fn(() => null), frontFace: vi.fn(), blendColor: vi.fn() };
    const binder = new WebGL2DrawCallBinder({
      gl, stateCache: { onInvalidate: vi.fn() }, activeRenderTarget: { colorTextures: [{}, {}] }
    } as never);
    expect(() => binder.applyRenderState(coverage)).toThrow(/independent color attachment state/i);
    expect(gl.frontFace).not.toHaveBeenCalled();
    expect(gl.blendColor).not.toHaveBeenCalled();
    const fallback = vi.fn();
    const first = { renderState: base } as DrawCommand;
    const second = { renderState: coverage } as DrawCommand;
    expect(() => binder.multiDrawElementsInstanced([first, second], fallback)).toThrow(/independent color attachment state/i);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("keeps ordinary mock draws working and refuses overrides it cannot apply", () => {
    const device = new MockRenderDevice();
    const buffer = device.createBuffer("vertex", 12);
    const command: DrawCommand = { topology: "triangles", vertexBuffer: buffer, vertexCount: 3, renderState: base };
    device.beginFrame(2, 2);
    device.draw(command);
    expect(device.drawCommands).toHaveLength(1);
    const target = device.createRenderTarget({ width: 2, height: 2, colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }] });
    device.setRenderTarget(target);
    expect(() => device.draw({ ...command, renderState: coverage })).toThrow(/independent color attachment state/i);
    expect(device.drawCommands).toHaveLength(1);
    device.endFrame();
    device.dispose();
  });
});
