import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture, claimRenderTargetTextureOwner } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGL2Buffer, WebGL2ShaderProgram } from "../../../packages/rendering/src/WebGL2Device";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";
import { WebGL2SamplerRegistry } from "../../../packages/rendering/src/webgl2/Samplers";
import { WebGL2TextureRegistry } from "../../../packages/rendering/src/webgl2/TextureUpload";

function context() {
  const state = { signaled: false, upload: undefined as (() => void) | undefined, fence: undefined as (() => void) | undefined };
  const deleted: object[] = [];
  const fences: object[] = [];
  const events: string[] = [];
  let nextTexture = 0;
  const gl = {
    TEXTURE_2D: 0x0de1, RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401, TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    TEXTURE0: 0x84c0, ARRAY_BUFFER: 0x8892, TRIANGLES: 4,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601, NEAREST: 0x2600, CLAMP_TO_EDGE: 0x812f, REPEAT: 0x2901,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, ALREADY_SIGNALED: 0x911a,
    CONDITION_SATISFIED: 0x911c, TIMEOUT_EXPIRED: 0x911b,
    createTexture: () => ({ id: ++nextTexture }),
    deleteTexture: (handle: object) => { deleted.push(handle); },
    bindTexture: () => {}, texParameteri: () => {},
    texImage2D: () => { state.upload?.(); },
    getParameter: () => 0, pixelStorei: () => {},
    fenceSync: () => { const fence = {}; fences.push(fence); events.push("fence"); state.fence?.(); return fence; },
    flush: () => {}, clientWaitSync: () => state.signaled ? 0x911a : 0x911b,
    deleteSync: () => {}, getExtension: () => null, getUniformLocation: () => ({}),
    createSampler: () => ({}), samplerParameteri: () => {}, bindSampler: () => {}, activeTexture: () => {},
    uniform1i: () => {}, useProgram: () => {}, bindBuffer: () => {}, bindVertexArray: () => {},
    drawArrays: () => { events.push("draw"); }
  };
  const device = {};
  const counters = { releasedTextureHandles: 0, uniformLocationLookupCount: 0, inactiveUniformBindCount: 0,
    samplerParameterUploadCount: 0, textureBindCount: 0, nativeEnvironmentBindings: 0, nativeShadowMapBindings: 0,
    drawCalls: 0, nativeInstancedSubmissions: 0 };
  const call = (_key: unknown, action: () => void) => action();
  const bind = (_key: unknown, _value: unknown, action: () => void) => action();
  const host: WebGL2DeviceHost = {
    gl, device, counters, disposed: false, contextLost: false,
    buffers: new Set(), shaders: new Set(), activeRenderTarget: null, errorCheckMode: "frame",
    stateCache: { invalidate() {}, useProgram: call, activeTexture: call, bindVertexArray: call,
      bindTexture: bind, bindSampler: bind, bindBuffer: bind },
    lifecycle: { readError: () => null, isDeviceLost: () => host.contextLost, assertFrame() {} }
  } as unknown as WebGL2DeviceHost;
  const registry = new WebGL2TextureRegistry(host);
  host.textureRegistry = registry;
  return { state, deleted, fences, events, device, host, registry, counters };
}

const texture = () => new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("prompt WebGL texture retirement", () => {
  it("schedules retirement on disposal even if the registry is never used again", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const handle = ctx.registry.getTextureHandle(source);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    source.dispose();
    source.dispose();
    expect(ctx.registry.textures.has(source)).toBe(false);
    expect(ctx.fences).toHaveLength(0);
    expect(ctx.deleted).toEqual([]);
    expect(ctx.counters.releasedTextureHandles).toBe(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    let drained = false;
    ctx.registry.onNativeRetirementsDrained(() => { drained = true; });
    expect(drained).toBe(false);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([]);
    expect(drained).toBe(false);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(8);
    expect(ctx.deleted).toEqual([handle]);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    expect(drained).toBe(true);
    ctx.registry.releaseDisposedTextureHandles();
    ctx.registry.disposeTextureHandles();
    expect(ctx.deleted).toEqual([handle]);
  });

  it("retires a shared CPU texture independently on each owning device", async () => {
    vi.useFakeTimers();
    const a = context(), b = context();
    const source = texture();
    const first = a.registry.getTextureHandle(source);
    const second = b.registry.getTextureHandle(source);
    source.dispose();
    expect(a.fences).toHaveLength(0);
    expect(b.fences).toHaveLength(0);
    await Promise.resolve();
    expect(a.fences).toHaveLength(1);
    expect(b.fences).toHaveLength(1);
    a.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(a.deleted).toEqual([first]);
    expect(b.deleted).toEqual([]);
    expect(textureBudgetReport(a.device as never).textureBytes).toBe(0);
    expect(textureBudgetReport(b.device as never).textureBytes).toBe(16);
    b.state.signaled = true;
    await vi.advanceTimersByTimeAsync(8);
    expect(b.deleted).toEqual([second]);
    expect(textureBudgetReport(b.device as never).textureBytes).toBe(0);
  });

  it("unsubscribes on context invalidation, then watches only the restored handle", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    let unsubscribed = 0;
    const onDispose = source.onDispose.bind(source);
    vi.spyOn(source, "onDispose").mockImplementation((listener) => {
      const unsubscribe = onDispose(listener);
      return () => { unsubscribed += 1; unsubscribe(); };
    });
    const old = ctx.registry.getTextureHandle(source);
    ctx.host.contextLost = true;
    ctx.registry.invalidateTextureHandles();
    ctx.host.contextLost = false;
    expect(unsubscribed).toBe(1);
    expect(ctx.deleted).toEqual([]);
    const restored = ctx.registry.getTextureHandle(source);
    expect(restored).not.toBe(old);
    source.dispose();
    expect(unsubscribed).toBe(2);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([restored]);
  });

  it("unsubscribes on device teardown and does not retire the same name twice", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    let unsubscribed = 0;
    const onDispose = source.onDispose.bind(source);
    vi.spyOn(source, "onDispose").mockImplementation((listener) => {
      const unsubscribe = onDispose(listener);
      return () => { unsubscribed += 1; unsubscribe(); };
    });
    const handle = ctx.registry.getTextureHandle(source);
    ctx.registry.disposeTextureHandles();
    expect(unsubscribed).toBe(1);
    source.dispose();
    expect(ctx.fences).toHaveLength(1);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([handle]);
  });

  it("releases a pending charge on context loss without deleting the invalid name", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    ctx.registry.getTextureHandle(source);
    source.dispose();
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    ctx.host.contextLost = true;
    ctx.registry.invalidateTextureHandles();
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    expect(ctx.deleted).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(ctx.deleted).toEqual([]);
  });

  it("cancels a queued fence and drains accounting when context loss wins the microtask", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    ctx.registry.getTextureHandle(source);
    source.dispose();
    let drained = false;
    ctx.registry.onNativeRetirementsDrained(() => { drained = true; });
    expect(drained).toBe(false);
    ctx.host.contextLost = true;
    ctx.registry.invalidateTextureHandles();
    expect(drained).toBe(true);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(0);
    expect(ctx.deleted).toEqual([]);
  });

  it("never returns an old handle when a live-source poll disposes the texture", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const handle = ctx.registry.getTextureHandle(source);
    source.pollContentRevision = () => source.dispose();
    expect(() => ctx.registry.getTextureHandle(source)).toThrow(/disposed/i);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    expect(ctx.deleted).toEqual([]);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([handle]);
  });

  it("fences a texture disposed during upload without returning or deleting it early", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    ctx.state.upload = () => source.dispose();
    expect(() => ctx.registry.getTextureHandle(source)).toThrow(/disposed/i);
    expect(ctx.registry.textures.has(source)).toBe(false);
    expect(ctx.fences).toHaveLength(1);
    expect(ctx.deleted).toEqual([]);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(16);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toHaveLength(1);
    expect(textureBudgetReport(ctx.device as never).textureBytes).toBe(0);
  });

  it("handles immediate disposal during subscription without double retirement", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const onDispose = source.onDispose.bind(source);
    vi.spyOn(source, "onDispose").mockImplementation((listener) => {
      source.dispose();
      return onDispose(listener);
    });
    expect(() => ctx.registry.getTextureHandle(source)).toThrow(/disposed/i);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    expect(ctx.deleted).toEqual([]);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toHaveLength(1);
    ctx.registry.disposeTextureHandles();
    expect(ctx.deleted).toHaveLength(1);
  });

  it("detaches the handle before a fence callback can reenter the disposed sweep", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const handle = ctx.registry.getTextureHandle(source);
    ctx.state.fence = () => ctx.registry.releaseDisposedTextureHandles();
    source.dispose();
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    expect(ctx.counters.releasedTextureHandles).toBe(1);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([handle]);
  });

  it("watches the replacement allocation after a color-space change", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const first = ctx.registry.getTextureHandle(source);
    source.colorSpace = "srgb";
    const second = ctx.registry.getTextureHandle(source);
    expect(second).not.toBe(first);
    expect(ctx.fences).toHaveLength(0);
    source.dispose();
    expect(ctx.fences).toHaveLength(0);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(2);
    expect(ctx.deleted).toEqual([]);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([first, second]);
  });

  it("lets a reentrant retirement callback observe the already-created replacement", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const source = texture();
    const first = ctx.registry.getTextureHandle(source);
    let replacement: WebGLTexture | undefined;
    ctx.state.fence = () => {
      ctx.state.fence = undefined;
      expect(ctx.registry.getTextureHandle(source)).toBe(replacement);
    };
    source.colorSpace = "srgb";
    replacement = ctx.registry.getTextureHandle(source);
    expect(replacement).toBeDefined();
    expect(replacement).not.toBe(first);
    expect(ctx.fences).toHaveLength(0);
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(1);
    source.dispose();
    await Promise.resolve();
    expect(ctx.fences).toHaveLength(2);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([first, replacement]);
  });

  it("does not attach an ordinary-upload listener to target-owned textures", () => {
    const ctx = context();
    const attachment = texture();
    const onDispose = vi.spyOn(attachment, "onDispose");
    const handle = {} as WebGLTexture;
    claimRenderTargetTextureOwner(attachment, ctx.device);
    ctx.registry.textures.set(attachment, handle);
    expect(ctx.registry.getTextureHandle(attachment)).toBe(handle);
    expect(onDispose).not.toHaveBeenCalled();
    // A render target forgets its attachment before disposing its wrapper and
    // retires the native attachment through its own fence contract.
    ctx.registry.textures.delete(attachment);
    attachment.dispose();
    expect(ctx.fences).toHaveLength(0);
  });

  it("places the retirement fence after a draw when a later sampler disposes an earlier texture", async () => {
    vi.useFakeTimers();
    const ctx = context();
    const first = texture();
    const second = texture();
    const firstHandle = ctx.registry.getTextureHandle(first);
    ctx.registry.getTextureHandle(second);
    second.pollContentRevision = () => first.dispose();
    const gl = ctx.host.gl;
    const buffer = new WebGL2Buffer(1, "vertex", 36, gl.ARRAY_BUFFER, {} as WebGLBuffer, gl);
    const shader = new WebGL2ShaderProgram(1, "two-samplers", "test", {
      uniforms: new Set(["first", "second"]),
      uniformDetails: new Map([["first", { type: "sampler2D" }], ["second", { type: "sampler2D" }]]),
      attributes: new Map()
    } as never, {} as WebGLProgram, gl);
    ctx.host.buffers.add(buffer);
    ctx.host.shaders.add(shader);
    ctx.host.samplers = new WebGL2SamplerRegistry(ctx.host);
    const binder = new WebGL2DrawCallBinder(ctx.host);
    ctx.host.drawBinder = binder;
    vi.spyOn(binder, "applyRenderState").mockImplementation(() => {});
    ctx.events.length = 0;
    binder.draw({
      topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
      uniforms: new Map([
        ["first", new TextureBinding({ name: "first", texture: first })],
        ["second", new TextureBinding({ name: "second", texture: second })]
      ])
    });
    // The first texture is already bound when the second source's poll runs.
    // The fence must cover the draw that the real binder submits afterward.
    expect(ctx.events).toEqual(["draw"]);
    await Promise.resolve();
    expect(ctx.events).toEqual(["draw", "fence"]);
    expect(ctx.deleted).toEqual([]);
    ctx.state.signaled = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.deleted).toEqual([firstHandle]);
    second.dispose();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
  });
});
