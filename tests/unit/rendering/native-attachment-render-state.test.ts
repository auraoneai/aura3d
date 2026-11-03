import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderCommandState } from "../../../packages/rendering/src/RenderDevice";
import { renderPipelineStateKey, renderStateSignature, validateRenderCommandState } from "../../../packages/rendering/src/contracts/blend";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";
import { Material } from "../../../packages/rendering/src/Material";

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

describe("WebGL2 extension-backed command state", () => {
  function recordingBinder(extensions: Record<string, object>, colorTextures = 2) {
    const calls: string[] = [];
    const constants = new Map<string, number>();
    const record = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.join(",")})`); };
    const ext = (name: string, methods: readonly string[]) => Object.fromEntries(methods.map((method) => [method, record(`${name}.${method}`)]));
    const available: Record<string, object> = {
      OES_draw_buffers_indexed: ext("OES", ["enableiOES", "disableiOES", "blendEquationSeparateiOES", "blendFuncSeparateiOES", "colorMaskiOES"]),
      EXT_polygon_offset_clamp: ext("EXT", ["polygonOffsetClampEXT"])
    };
    const gl = new Proxy({}, {
      get(_target, key: string) {
        if (key === "getExtension") return (name: string) => (extensions[name] ? available[name] : null) ?? null;
        if (/^[A-Z0-9_]+$/.test(key)) {
          if (!constants.has(key)) constants.set(key, 0x1000 + constants.size);
          return constants.get(key);
        }
        return record(key);
      }
    });
    const binder = new WebGL2DrawCallBinder({ gl, stateCache: new WebGL2StateCache({ label: "test" }),
      activeRenderTarget: { colorTextures: Array.from({ length: colorTextures }, () => ({})) },
      lifecycle: { effectiveScissor: () => null } } as never);
    return { binder, calls, constant: (name: string) => constants.get(name) };
  }

  it("applies independent attachment masks and blending through OES_draw_buffers_indexed, then reissues global state", () => {
    const { binder, calls, constant } = recordingBinder({ OES_draw_buffers_indexed: {} });
    binder.applyRenderState({ ...base, blend: true, blendMode: "alpha", depthWrite: false,
      colorAttachments: [undefined, { colorWrite: [true, false, false, false], blendMode: "opaque" }] });
    const blend = constant("BLEND");
    expect(calls).toContain("OES.colorMaskiOES(0,true,true,true,true)");
    expect(calls).toContain(`OES.enableiOES(${blend},0)`);
    expect(calls.some((call) => call.startsWith("OES.blendFuncSeparateiOES(0,"))).toBe(true);
    expect(calls).toContain("OES.colorMaskiOES(1,true,false,false,false)");
    expect(calls).toContain(`OES.disableiOES(${blend},1)`);
    calls.length = 0;
    // The global cache was told to forget, so the next ordinary draw resets every buffer.
    binder.applyRenderState({ ...base });
    expect(calls).toContain("colorMask(true,true,true,true)");
    expect(calls).toContain(`disable(${blend})`);
  });

  it("applies a polygon offset clamp with EXT_polygon_offset_clamp, clears it later and refuses it without the extension", () => {
    const { binder, calls } = recordingBinder({ EXT_polygon_offset_clamp: {} });
    binder.applyRenderState({ ...base, polygonOffset: { factor: 2, units: 3, clamp: 0.5 } });
    expect(calls).toContain("EXT.polygonOffsetClampEXT(2,3,0.5)");
    calls.length = 0;
    binder.applyRenderState({ ...base, polygonOffset: { factor: 2, units: 3 } });
    expect(calls).toContain("EXT.polygonOffsetClampEXT(2,3,0)");
    calls.length = 0;
    binder.applyRenderState({ ...base, polygonOffset: { factor: 2, units: 3 } });
    expect(calls.some((call) => call.startsWith("EXT."))).toBe(false);
    const plain = recordingBinder({});
    expect(() => plain.binder.applyRenderState({ ...base, polygonOffset: { factor: 1, units: 1, clamp: 0.25 } })).toThrow(/EXT_polygon_offset_clamp/);
    expect(() => plain.binder.applyRenderState({ ...base, sampleMask: 3 })).toThrow(/sample mask/);
  });

  it("expresses every command-state field through the material API", () => {
    const material = new Material({ shaderKey: "custom", renderState: {
      frontFace: "cw", sampleMask: 5, blendConstant: [0.25, 0.5, 0.75, 1], blend: true, blendMode: "alpha", depthWrite: true,
      blendedDepthWrite: "allow", polygonOffset: { factor: 1, units: 2, clamp: 0.125 },
      colorAttachments: [undefined, { colorWrite: [true, false, false, false], blendMode: "opaque" }]
    } });
    expect(material.renderState).toMatchObject({ frontFace: "cw", sampleMask: 5, blendConstant: [0.25, 0.5, 0.75, 1], blendedDepthWrite: "allow",
      polygonOffset: { clamp: 0.125 }, colorAttachments: [undefined, { colorWrite: [true, false, false, false], blendMode: "opaque" }] });
    expect(() => new Material({ shaderKey: "custom", renderState: { blend: true, depthWrite: true } })).toThrow(/depthWrite/);
    expect(() => new Material({ shaderKey: "custom", renderState: { sampleMask: -1 } })).toThrow(/sampleMask/);
    expect(() => new Material({ shaderKey: "custom", renderState: { frontFace: "left" as never } })).toThrow(/winding/);
    expect(() => new Material({ shaderKey: "custom", renderState: { blendConstant: [2, 0, 0, 0] } })).toThrow(/blendConstant/);
    expect(() => new Material({ shaderKey: "custom", renderState: { colorAttachments: [{ colorWrite: [true] as never }] } })).toThrow(/colorWrite/);
    material.dispose();
  });
});
