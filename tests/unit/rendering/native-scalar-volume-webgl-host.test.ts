import { describe, expect, it, vi } from "vitest";
import type { RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture, claimRenderTargetTextureOwner } from "../../../packages/rendering/src/Texture";
import type { VolumeRenderer } from "../../../packages/rendering/src/VolumeRenderer";
import type { WebGL2RenderTarget } from "../../../packages/rendering/src/WebGL2Device";
import { FRAME_RESOURCES, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { PRD01_FORWARD_TARGET } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { ScalarVolumeDrawRecord } from "../../../packages/rendering/src/renderer/ScalarVolumeFrame";
import { registerWebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { drawScalarVolumeOnWebGL2 } from "../../../packages/rendering/src/webgl2/ScalarVolumeHost";

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Records native-shaped state only; it does not execute GL or rasterize. */
function harness() {
  const flags = { SCISSOR_TEST: 1, STENCIL_TEST: 2, POLYGON_OFFSET_FILL: 3, RASTERIZER_DISCARD: 4,
    SAMPLE_ALPHA_TO_COVERAGE: 5, SAMPLE_COVERAGE: 6, VIEWPORT: 7, DRAW_FRAMEBUFFER_BINDING: 8, SCISSOR_BOX: 9 };
  const enabled = new Set<number>([flags.SCISSOR_TEST, flags.STENCIL_TEST, flags.SAMPLE_COVERAGE]);
  let viewport = [0, 0, 16, 8];
  let scissor = [0, 0, 16, 8];
  const framebuffer = {} as WebGLFramebuffer;
  let boundFramebuffer = framebuffer;
  const gl = { ...flags,
    isEnabled: (flag: number) => enabled.has(flag),
    enable: vi.fn((flag: number) => { enabled.add(flag); }),
    disable: vi.fn((flag: number) => { enabled.delete(flag); }),
    getParameter: (parameter: number) => parameter === flags.VIEWPORT ? viewport : parameter === flags.SCISSOR_BOX ? scissor :
      parameter === flags.DRAW_FRAMEBUFFER_BINDING ? boundFramebuffer : undefined
  } as unknown as WebGL2RenderingContext;
  const texture = () => new Texture({ width: 16, height: 8, format: "depth24" });
  const targetDepth = texture(), copyDepth = texture();
  const targetDepthHandle = {} as WebGLTexture, copyDepthHandle = {} as WebGLTexture;
  const target = { width: 16, height: 8, sampleCount: 1, disposed: false, nativeInvalid: false, framebuffer,
    colorTexture: new Texture({ width: 16, height: 8, format: "rgba8", colorSpace: "linear" }),
    drawFramebuffer: framebuffer, depthTexture: targetDepth, depthTextureHandle: targetDepthHandle,
    colorHandle: {} as WebGLTexture } as WebGL2RenderTarget;
  const copy = { width: 16, height: 8, sampleCount: 1, disposed: false, nativeInvalid: false,
    depthTexture: copyDepth, depthTextureHandle: copyDepthHandle } as WebGL2RenderTarget;
  const device = { kind: "webgl2", disposed: false, contextLost: false, generation: 2, getRenderTarget: () => target } as unknown as RenderDevice;
  claimRenderTargetTextureOwner(targetDepth, device);
  claimRenderTargetTextureOwner(copyDepth, device);
  const invalidate = vi.fn();
  const handles = new Map([[copyDepth, copyDepthHandle]]);
  const host = { device, gl, disposed: false, contextLost: false, activeRenderTarget: target,
    renderTargets: new Set([target, copy]), textureRegistry: { textures: handles }, stateCache: { invalidate } } as unknown as WebGL2DeviceHost;
  registerWebGL2DeviceHost(host);
  const draw = vi.fn();
  const assertUsableForDevice = vi.fn();
  const frameLease = { assertCurrent: vi.fn(), release: vi.fn() };
  const record: ScalarVolumeDrawRecord = { renderer: { draw, assertUsableForDevice } as unknown as VolumeRenderer, frameLease,
    modelMatrix: identity(), worldBounds: { min: [0, 0, 0], max: [1, 1, 1] }, layerMask: 1,
    frustumCulled: true, renderOrder: 0, mode: { type: "raymarch" } };
  const context = { device, width: 16, height: 8, rasterViewportIsFull: true, rasterViewProjectionMatrix: identity(),
    camera: { depth: { mode: "standard", clipRange: "minus-one-to-one", clearValue: 1, compare: "less-equal" } },
    blackboard: new Map<string, unknown>([[PRD01_FORWARD_TARGET, target], [FRAME_RESOURCES.sceneDepthCopy, copy], ["prd01.outputColorSpace", "linear"]])
  } as unknown as FrameContributorContext;
  const frame = { deviceGeneration: 2, assertCurrent: vi.fn() };
  return { context, frame, frameLease, target, copy, targetDepthHandle, copyDepthHandle, record, host, gl, enabled, draw,
    assertUsableForDevice, invalidate, handles,
    viewport(value: number[]) { viewport = value; }, scissor(value: number[]) { scissor = value; },
    framebuffer(value: WebGLFramebuffer) { boundFramebuffer = value; } };
}

describe("scalar volume WebGL2 host", () => {
  it("draws against the separate opaque-depth copy and restores raw GL state", () => {
    const h = harness();
    const previous = [...h.enabled];
    h.draw.mockImplementation(() => expect(h.enabled.size).toBe(0));
    drawScalarVolumeOnWebGL2(h.context, h.record, h.frame);
    expect(h.draw).toHaveBeenCalledOnce();
    expect(h.draw).toHaveBeenCalledWith(expect.objectContaining({ sceneDepth: h.copyDepthHandle,
      viewProjectionMatrix: h.context.rasterViewProjectionMatrix, modelMatrix: h.record.modelMatrix, mode: h.record.mode }));
    expect([...h.enabled].sort()).toEqual(previous.sort());
    expect(h.frame.assertCurrent).toHaveBeenCalledTimes(2);
    expect(h.frameLease.assertCurrent).toHaveBeenCalledTimes(2);
    expect(h.assertUsableForDevice).toHaveBeenCalledWith(h.context.device);
    expect(h.invalidate).toHaveBeenCalledOnce();
  });

  it("rejects missing, foreign, stale, aliased and incorrectly sized depth copies before drawing", () => {
    for (const mutate of [
      (h: ReturnType<typeof harness>) => h.context.blackboard.delete(FRAME_RESOURCES.sceneDepthCopy),
      (h: ReturnType<typeof harness>) => h.host.renderTargets.delete(h.copy),
      (h: ReturnType<typeof harness>) => { (h.copy as { nativeInvalid: boolean }).nativeInvalid = true; },
      (h: ReturnType<typeof harness>) => { (h.copy as { width: number }).width = 15; },
      (h: ReturnType<typeof harness>) => { h.handles.set(h.copy.depthTexture!, h.targetDepthHandle); }
    ]) {
      const h = harness(); mutate(h);
      expect(() => drawScalarVolumeOnWebGL2(h.context, h.record, h.frame)).toThrow(/depth copy/i);
      expect(h.draw).not.toHaveBeenCalled();
    }
  });

  it("rejects non-linear output, unsupported depth, partial viewport and wrong framebuffer", () => {
    const nonLinear = harness(); nonLinear.context.blackboard.set("prd01.outputColorSpace", "srgb");
    expect(() => drawScalarVolumeOnWebGL2(nonLinear.context, nonLinear.record, nonLinear.frame)).toThrow(/linear/);
    const reverse = harness(); (reverse.context.camera!.depth as { mode: string }).mode = "reversed";
    expect(() => drawScalarVolumeOnWebGL2(reverse.context, reverse.record, reverse.frame)).toThrow(/standard WebGL depth/);
    const viewport = harness(); viewport.viewport([0, 0, 8, 8]);
    expect(() => drawScalarVolumeOnWebGL2(viewport.context, viewport.record, viewport.frame)).toThrow(/viewport/);
    const scissor = harness(); scissor.scissor([0, 0, 8, 8]);
    expect(() => drawScalarVolumeOnWebGL2(scissor.context, scissor.record, scissor.frame)).toThrow(/viewport/);
    const framebuffer = harness(); framebuffer.framebuffer({} as WebGLFramebuffer);
    expect(() => drawScalarVolumeOnWebGL2(framebuffer.context, framebuffer.record, framebuffer.frame)).toThrow(/viewport/);
  });

  it("checks frame lifetime before and immediately after state setup", () => {
    const h = harness();
    h.frame.assertCurrent.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error("frame released"); });
    const previous = [...h.enabled];
    expect(() => drawScalarVolumeOnWebGL2(h.context, h.record, h.frame)).toThrow(/frame released/);
    expect(h.draw).not.toHaveBeenCalled();
    expect([...h.enabled].sort()).toEqual(previous.sort());
    expect(h.invalidate).toHaveBeenCalledOnce();
  });

  it("restores flags and invalidates state if drawing fails", () => {
    const h = harness();
    const previous = [...h.enabled];
    h.draw.mockImplementation(() => { throw new Error("synthetic draw failure"); });
    expect(() => drawScalarVolumeOnWebGL2(h.context, h.record, h.frame)).toThrow(/synthetic draw failure/);
    expect([...h.enabled].sort()).toEqual(previous.sort());
    expect(h.invalidate).toHaveBeenCalledOnce();
  });

  it("rejects a disposed or changed-generation device before native state changes", () => {
    const h = harness();
    (h.context.device as { generation: number }).generation = 3;
    expect(() => drawScalarVolumeOnWebGL2(h.context, h.record, h.frame)).toThrow(/stale/);
    expect(h.gl.disable).not.toHaveBeenCalled();
    expect(h.draw).not.toHaveBeenCalled();
  });
});
