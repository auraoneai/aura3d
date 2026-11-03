import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { Texture } from "../../../packages/rendering/src/Texture";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGL2Buffer, WebGL2Device, WebGL2RenderTarget, WebGL2ShaderProgram } from "../../../packages/rendering/src/WebGL2Device";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { acquireV2TargetLease } from "../../../packages/rendering/src/post/v2Stages";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";
import { acquireTargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";
import {
  disposeNativePostEffectsForHost,
  registerNativePostEffectLifecycle,
  type NativePostEffectLifecycle
} from "../../../packages/rendering/src/renderer/postSkipped";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";

/** A recording context; no browser or GPU is needed. */
function makeDevice() {
  const constants = new Map<string, number>([["NO_ERROR", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const attempts = new Map<object, number>();
  const deleted = new Map<object, number>();
  const failures = new Map<object, Error>();
  const textures: WebGLTexture[] = [];
  const vaos: WebGLVertexArrayObject[] = [];
  const listeners = new Map<string, Set<EventListener>>();
  const hooks: { onDelete?: (handle: object) => void; signalRetirements?: boolean } = {};
  let lost = false;
  const remove = (handle: object): void => {
    attempts.set(handle, (attempts.get(handle) ?? 0) + 1);
    hooks.onDelete?.(handle);
    const failure = failures.get(handle);
    if (failure) throw failure;
    deleted.set(handle, (deleted.get(handle) ?? 0) + 1);
  };
  const methods: Record<string, unknown> = {
    getError: () => 0,
    getParameter: () => 16,
    getExtension: () => null,
    isContextLost: () => lost,
    createBuffer: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
    createVertexArray: () => {
      const vao = {} as WebGLVertexArrayObject;
      vaos.push(vao);
      return vao;
    },
    createTexture: () => {
      const texture = {} as WebGLTexture;
      textures.push(texture);
      return texture;
    },
    deleteBuffer: remove,
    deleteVertexArray: remove,
    deleteTexture: remove,
    deleteFramebuffer: remove,
    deleteRenderbuffer: remove,
    deleteProgram: remove,
    deleteSampler: remove,
    fenceSync: () => hooks.signalRetirements ? {} : null,
    clientWaitSync: () => constant("ALREADY_SIGNALED")
  };
  const gl = new Proxy({}, {
    get(_target, property) {
      const name = String(property);
      if (name in methods) return methods[name];
      if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
      return () => undefined;
    }
  }) as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => {
      let group = listeners.get(name);
      if (!group) listeners.set(name, group = new Set());
      group.add(listener);
    },
    removeEventListener: (name: string, listener: EventListener) => listeners.get(name)?.delete(listener)
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const host = webgl2DeviceHost(device)!;
  const vaoFor = (vertex: WebGL2Buffer) => {
    const shader = {
      id: 1,
      reflection: { attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map() }
    } as unknown as WebGL2ShaderProgram;
    return host.drawBinder.bindVertexArrayForCommand({
      vertexBuffer: vertex, vertexCount: 3, vertexFormat: VertexFormat.P3, topology: "triangles"
    }, shader, vertex);
  };
  return {
    device, host, attempts, deleted, failures, textures, vaos, vaoFor, hooks,
    listeners: (name: string) => listeners.get(name)?.size ?? 0,
    lose: () => {
      lost = true;
      for (const listener of [...(listeners.get("webglcontextlost") ?? [])]) {
        listener({ preventDefault() {} } as Event);
      }
    }
  };
}

function postOwner(dispose: () => void): NativePostEffectLifecycle {
  return { dispose, releaseView() {}, releaseScope() {} };
}

function thrownBy(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the operation to throw");
}

function leafErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leafErrors) : [error];
}

afterEach(() => vi.restoreAllMocks());

describe("WebGL2 device post lifecycle disposal", () => {
  it("retries post and buffer failures independently without repeating successful cleanup or touching another device", () => {
    const first = makeDevice(), other = makeDevice();
    const buffer = first.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const vao = first.vaoFor(buffer);
    const otherBuffer = other.device.createBuffer("vertex", 36) as WebGL2Buffer;
    const postError = new Error("post cleanup failed"), bufferError = new Error("buffer cleanup failed");
    let failPost = true;
    const failedPost = vi.fn(() => {
      first.device.dispose(); // A reentrant disposal must not start another pass.
      if (failPost) throw postError;
    });
    const siblingPost = vi.fn(), otherPost = vi.fn();
    registerNativePostEffectLifecycle(first.host, postOwner(failedPost));
    registerNativePostEffectLifecycle(first.host, postOwner(siblingPost));
    registerNativePostEffectLifecycle(other.host, postOwner(otherPost));
    first.failures.set(buffer.handle, bufferError);

    try {
      const initial = thrownBy(() => first.device.dispose());
      expect(initial).toBeInstanceOf(AggregateError);
      expect(leafErrors(initial)).toEqual([postError, bufferError]);
      expect(first.device.disposed).toBe(true);
      expect(first.device[resourceDisposalPending]).toBe(true);
      expect(first.attempts.get(vao.handle)).toBe(1);
      expect(first.host.drawBinder.vertexArrayCache.size).toBe(0);
      expect(siblingPost).toHaveBeenCalledTimes(1);

      const repeated = thrownBy(() => first.device.dispose());
      expect(leafErrors(repeated)).toEqual([postError, bufferError]);
      expect(failedPost).toHaveBeenCalledTimes(2);
      expect(siblingPost).toHaveBeenCalledTimes(1);
      expect(first.attempts.get(vao.handle)).toBe(1);

      first.failures.delete(buffer.handle);
      expect(leafErrors(thrownBy(() => first.device.dispose()))).toEqual([postError]);
      expect(buffer.disposed).toBe(true);
      expect(first.device[resourceDisposalPending]).toBe(true);
      expect(first.attempts.get(buffer.handle)).toBe(3);
      expect(first.deleted.get(buffer.handle)).toBe(1);
      expect(otherBuffer.disposed).toBe(false);
      expect(otherPost).not.toHaveBeenCalled();

      failPost = false;
      first.device.dispose();
      first.device.dispose();
      expect(first.device[resourceDisposalPending]).toBe(false);
      expect(failedPost).toHaveBeenCalledTimes(4);
      expect(siblingPost).toHaveBeenCalledTimes(1);
      expect(first.attempts.get(vao.handle)).toBe(1);
      expect(first.attempts.get(buffer.handle)).toBe(3);
      expect(otherBuffer.disposed).toBe(false);
      expect(otherPost).not.toHaveBeenCalled();
    } finally {
      failPost = false;
      first.failures.clear();
      first.device.dispose();
      disposeNativePostEffectsForHost(first.host);
      other.device.dispose();
    }
  });

  it("keeps a closed device owned by its outer resource lifecycle until post cleanup succeeds", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const failure = new Error("post cleanup failed");
    let fail = true;
    const dispose = vi.fn(() => { if (fail) throw failure; });
    registerNativePostEffectLifecycle(ctx.host, postOwner(dispose));
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toContain(failure);
      expect(ctx.device.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(lifecycle.leakCount()).toBe(1);
      fail = false;
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(lifecycle.leakCount()).toBe(0);
      lifecycle.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      fail = false;
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });

  it("preserves a post error when a later device cleanup also throws", () => {
    const ctx = makeDevice();
    const postError = new Error("post cleanup failed"), shaderError = new Error("shader callback failed");
    const program = {} as WebGLProgram;
    const shader = new WebGL2ShaderProgram(1, "shader", "test", {
      attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map()
    }, program, ctx.host.gl);
    let failShader = true;
    shader.onDispose = () => { if (failShader) throw shaderError; };
    ctx.host.shaders.add(shader);
    let fail = true;
    const dispose = vi.fn(() => { if (fail) throw postError; });
    registerNativePostEffectLifecycle(ctx.host, postOwner(dispose));
    try {
      const error = thrownBy(() => ctx.device.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect(leafErrors(error)).toEqual([postError, shaderError]);
      expect(ctx.deleted.get(program)).toBe(1);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      fail = false;
      failShader = false;
      ctx.device.dispose();
      ctx.device.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(program)).toBe(1);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
    } finally {
      fail = false;
      failShader = false;
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });

  it("retries real v2 post resources while leaving successful GL objects and borrowed pool targets alone", () => {
    const ctx = makeDevice(), backingDevice = new MockRenderDevice();
    const poolError = new Error("pool release failed"), textureError = new Error("post texture delete failed");
    let failedTarget: RenderTarget | undefined, failPool = true;
    const release = vi.fn((target: RenderTarget) => {
      if (target === failedTarget && failPool) throw poolError;
    });
    const pool: RenderTargetPoolLike = {
      acquire: descriptor => backingDevice.createRenderTarget({
        width: descriptor.width, height: descriptor.height, format: descriptor.format, sampleCount: descriptor.samples
      }),
      release,
      trim() {}
    };
    vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const first = acquireV2TargetLease(ctx.host, { width: 4, height: 4, format: "rgba8" });
    const sibling = acquireV2TargetLease(ctx.host, { width: 4, height: 4, format: "rgba8" });
    failedTarget = first.target;
    const [identity, blank] = ctx.textures;
    const [vao] = ctx.vaos;
    expect(identity).toBeDefined();
    expect(blank).toBeDefined();
    expect(vao).toBeDefined();
    ctx.failures.set(identity!, textureError);
    try {
      const initial = thrownBy(() => ctx.device.dispose());
      expect(leafErrors(initial)).toEqual(expect.arrayContaining([poolError, textureError]));
      expect(release.mock.calls.map(call => call[0])).toEqual([first.target, sibling.target]);
      expect(ctx.attempts.get(identity!)).toBe(1);
      expect(ctx.attempts.get(blank!)).toBe(1);
      expect(ctx.attempts.get(vao!)).toBe(1);
      expect(first.target.disposed).toBe(false);
      expect(sibling.target.disposed).toBe(false);
      expect(backingDevice.disposed).toBe(false);

      expect(leafErrors(thrownBy(() => ctx.device.dispose()))).toEqual(expect.arrayContaining([poolError, textureError]));
      expect(release.mock.calls.map(call => call[0])).toEqual([first.target, sibling.target, first.target]);
      expect(ctx.attempts.get(identity!)).toBe(2);
      expect(ctx.attempts.get(blank!)).toBe(1);
      expect(ctx.attempts.get(vao!)).toBe(1);

      failPool = false;
      ctx.failures.delete(identity!);
      ctx.device.dispose();
      first.release(); sibling.release();
      ctx.device.dispose();
      expect(release.mock.calls.map(call => call[0])).toEqual([first.target, sibling.target, first.target, first.target]);
      expect(ctx.attempts.get(identity!)).toBe(3);
      expect(ctx.deleted.get(identity!)).toBe(1);
      expect(ctx.attempts.get(blank!)).toBe(1);
      expect(ctx.attempts.get(vao!)).toBe(1);
      expect(first.target.disposed).toBe(false);
      expect(sibling.target.disposed).toBe(false);
      expect(backingDevice.disposed).toBe(false);
    } finally {
      failPool = false;
      ctx.failures.clear();
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
      backingDevice.dispose();
    }
  });

  it("keeps context-loss observation until a retry registers and drains late texture retirement", async () => {
    const ctx = makeDevice(), failure = new Error("post cleanup failed");
    const lateTexture = {} as WebGLTexture, debit = vi.fn();
    let fail = true, retirement: Promise<void> | undefined;
    registerNativePostEffectLifecycle(ctx.host, postOwner(() => {
      if (fail) throw failure;
      retirement = ctx.host.textureRegistry.retireNativeTextures([lateTexture], debit);
    }));
    try {
      expect(leafErrors(thrownBy(() => ctx.device.dispose()))).toContain(failure);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      fail = false;
      ctx.device.dispose();
      expect(retirement).toBeDefined();
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      expect(debit).not.toHaveBeenCalled();
      ctx.device.dispose();
      ctx.lose();
      await retirement;
      expect(debit).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.has(lateTexture)).toBe(false);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      fail = false;
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });

  it("retains device ownership if disposal reenters an already-running post lifecycle", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const failure = new Error("outer post cleanup failed");
    let first = true, nested: unknown;
    const dispose = vi.fn(() => {
      if (!first) return;
      first = false;
      try { lifecycle.dispose(); } catch (error) { nested = error; }
      throw failure;
    });
    registerNativePostEffectLifecycle(ctx.host, postOwner(dispose));
    lifecycle.track(ctx.device);
    try {
      expect(thrownBy(() => disposeNativePostEffectsForHost(ctx.host))).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(ctx.device.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      first = false;
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });

  it("does not repeat a successful outer post cleanup after reentrant device disposal", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    let nested: unknown;
    const dispose = vi.fn(() => {
      try { lifecycle.dispose(); } catch (error) { nested = error; }
    });
    registerNativePostEffectLifecycle(ctx.host, postOwner(dispose));
    lifecycle.track(ctx.device);
    try {
      disposeNativePostEffectsForHost(ctx.host);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      lifecycle.dispose();
      ctx.device.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });

  it("defers a post owner re-registered during disposal without invoking it twice in the same pass", () => {
    const ctx = makeDevice();
    let registerAgain = true;
    const dispose = vi.fn(() => {
      if (!registerAgain) return;
      registerAgain = false;
      registerNativePostEffectLifecycle(ctx.host, owner);
      ctx.device.dispose();
    });
    const owner = postOwner(dispose);
    registerNativePostEffectLifecycle(ctx.host, owner);
    try {
      const error = thrownBy(() => ctx.device.dispose());
      expect(leafErrors(error)).toEqual([expect.objectContaining({
        message: expect.stringContaining("deferred by reentrant registration")
      })]);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      ctx.device.dispose();
      ctx.device.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
    } finally {
      registerAgain = false;
      ctx.device.dispose();
      disposeNativePostEffectsForHost(ctx.host);
    }
  });
});

describe("WebGL2 device-owned teardown retry", () => {
  it("retries a failed shader delete without repeating its successful cleanup callback", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const program = {} as WebGLProgram, failure = new Error("shader delete failed");
    const shader = new WebGL2ShaderProgram(1, "shader", "test", {
      attributes: new Map(), uniforms: new Set(), attributeDetails: new Map(), uniformDetails: new Map()
    }, program, ctx.host.gl);
    const unbind = vi.fn();
    shader.onDispose = unbind;
    ctx.host.shaders.add(shader);
    ctx.failures.set(program, failure);
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toContain(failure);
      expect(shader.disposed).toBe(true);
      expect(shader[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(unbind).toHaveBeenCalledTimes(1);
      ctx.failures.clear();
      lifecycle.dispose();
      ctx.device.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(shader[resourceDisposalPending]).toBe(false);
      expect(unbind).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(program)).toBe(2);
      expect(ctx.deleted.get(program)).toBe(1);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });

  it("retries a partially deleted target while continuing other resources and retaining its lifecycle", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const main = {} as WebGLFramebuffer, layerA = {} as WebGLFramebuffer, layerB = {} as WebGLFramebuffer;
    const depth = {} as WebGLRenderbuffer, color = {} as WebGLTexture;
    const target = new WebGL2RenderTarget(1, 2, 2, "target", new Texture({ width: 2, height: 2 }), undefined,
      main, color, depth, null, 1, main, null, ctx.host.gl, { layerFramebuffers: [layerA, layerB] });
    const detach = vi.fn(), retire = vi.fn((_handles: readonly WebGLTexture[], release: () => void) => release());
    target.onDispose = detach;
    target.retireTextures = retire;
    ctx.host.renderTargets.add(target);
    const sibling = new WebGL2RenderTarget(2, 2, 2, "sibling", new Texture({ width: 2, height: 2 }), undefined,
      {} as WebGLFramebuffer, {} as WebGLTexture, null, null, 1, {} as WebGLFramebuffer, null, ctx.host.gl);
    const retireSibling = vi.fn((_handles: readonly WebGLTexture[], release: () => void) => release());
    sibling.retireTextures = retireSibling;
    ctx.host.renderTargets.add(sibling);
    const sampler = {} as WebGLSampler, post = {} as WebGLProgram;
    ctx.host.samplers.samplerObjectCache.set("sibling", sampler);
    ctx.host.post.presentationProgram = post;
    const failure = new Error("layer framebuffer failed");
    ctx.failures.set(layerB, failure);
    ctx.hooks.onDelete = () => ctx.device.dispose();
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toContain(failure);
      expect(ctx.device.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(layerA)).toBe(1);
      expect(ctx.attempts.get(layerB)).toBe(1);
      expect(ctx.deleted.get(main)).toBe(1);
      expect(ctx.deleted.get(depth)).toBe(1);
      expect(retire).not.toHaveBeenCalled();
      expect(retireSibling).toHaveBeenCalledTimes(1);
      expect(ctx.deleted.get(sampler)).toBe(1);
      expect(ctx.deleted.get(post)).toBe(1);
      expect(ctx.listeners("webglcontextlost")).toBe(1);

      ctx.failures.clear();
      lifecycle.dispose();
      ctx.device.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(layerA)).toBe(1);
      expect(ctx.attempts.get(layerB)).toBe(2);
      expect(ctx.attempts.get(main)).toBe(1);
      expect(ctx.attempts.get(depth)).toBe(1);
      expect(retire).toHaveBeenCalledTimes(1);
      expect(retireSibling).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(sampler)).toBe(1);
      expect(ctx.attempts.get(post)).toBe(1);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.failures.clear();
      ctx.hooks.onDelete = undefined;
      ctx.device.dispose();
    }
  });

  it("retains device ownership when a target delete reenters device disposal", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer;
    const target = new WebGL2RenderTarget(1, 2, 2, "target", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    const retire = vi.fn((_handles: readonly WebGLTexture[], release: () => void) => release());
    target.retireTextures = retire;
    ctx.host.renderTargets.add(target);
    lifecycle.track(ctx.device);
    let nested: unknown;
    ctx.hooks.onDelete = (handle) => {
      if (handle === framebuffer) {
        try { lifecycle.dispose(); } catch (error) { nested = error; }
      }
    };
    try {
      target.dispose();
      expect(nested).toBeInstanceOf(AggregateError);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
      expect(retire).toHaveBeenCalledTimes(1);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
      expect(retire).toHaveBeenCalledTimes(1);
    } finally {
      ctx.hooks.onDelete = undefined;
      ctx.device.dispose();
    }
  });

  it("keeps loss observation until a retried target's newly registered native retirement drains", async () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, color = {} as WebGLTexture, freed = vi.fn();
    const target = new WebGL2RenderTarget(1, 2, 2, "target", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, color, null, null, 1, framebuffer, null, ctx.host.gl);
    let retirement: Promise<void> | undefined;
    target.onFreed = freed;
    target.retireTextures = (handles, release) => { retirement = ctx.host.textureRegistry.retireNativeTextures(handles, release); };
    ctx.host.renderTargets.add(target);
    ctx.failures.set(framebuffer, new Error("framebuffer failed"));
    lifecycle.track(ctx.device);
    try {
      thrownBy(() => lifecycle.dispose());
      expect(retirement).toBeUndefined();
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      ctx.failures.clear();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(retirement).toBeDefined();
      expect(freed).not.toHaveBeenCalled();
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      ctx.lose();
      await retirement;
      expect(freed).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.has(color)).toBe(false);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });

  it("keeps a failed sampler owned and retries it without re-deleting successful siblings", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const a = {} as WebGLSampler, b = {} as WebGLSampler, c = {} as WebGLSampler;
    const post = {} as WebGLProgram, failure = new Error("sampler failed");
    ctx.host.samplers.samplerObjectCache.set("a", a);
    ctx.host.samplers.samplerObjectCache.set("alias-a", a);
    ctx.host.samplers.samplerObjectCache.set("b", b);
    ctx.host.samplers.samplerObjectCache.set("c", c);
    ctx.host.post.presentationProgram = post;
    ctx.failures.set(b, failure);
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toContain(failure);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(ctx.host.samplers.samplerObjectCache.get("b")).toBe(b);
      expect(ctx.deleted.get(a)).toBe(1);
      expect(ctx.deleted.get(c)).toBe(1);
      expect(ctx.deleted.get(post)).toBe(1);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      ctx.failures.clear();
      lifecycle.dispose();
      ctx.device.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.host.samplers.samplerObjectCache.size).toBe(0);
      expect(ctx.attempts.get(a)).toBe(1);
      expect(ctx.attempts.get(b)).toBe(2);
      expect(ctx.attempts.get(c)).toBe(1);
      expect(ctx.attempts.get(post)).toBe(1);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });

  it("retries individual legacy programs and bloom textures without repeating successful siblings", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const a = {} as WebGLProgram, b = {} as WebGLProgram, c = {} as WebGLProgram;
    const texA = {} as WebGLTexture, texB = {} as WebGLTexture;
    const fbA = {} as WebGLFramebuffer, fbB = {} as WebGLFramebuffer;
    const programError = new Error("legacy program failed"), textureError = new Error("bloom texture failed");
    ctx.host.post.ldrPostprocessPrograms.set("a", a);
    ctx.host.post.ldrPostprocessPrograms.set("b", b);
    ctx.host.post.ldrPostprocessPrograms.set("c", c);
    ctx.host.post.bloomPingPongResources = {
      width: 2, height: 2, hdr: false, textures: [texA, texB], framebuffers: [fbA, fbB]
    };
    ctx.failures.set(b, programError);
    ctx.failures.set(texB, textureError);
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual(expect.arrayContaining([programError, textureError]));
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.deleted.get(a)).toBe(1);
      expect(ctx.deleted.get(c)).toBe(1);
      expect(ctx.deleted.get(texA)).toBe(1);
      expect(ctx.deleted.get(fbA)).toBe(1);
      expect(ctx.deleted.get(fbB)).toBe(1);
      ctx.failures.clear();
      lifecycle.dispose();
      ctx.device.dispose();
      expect(lifecycle.disposed).toBe(true);
      for (const handle of [a, c, texA, fbA, fbB]) expect(ctx.attempts.get(handle)).toBe(1);
      expect(ctx.attempts.get(b)).toBe(2);
      expect(ctx.attempts.get(texB)).toBe(2);
      expect(ctx.host.post.ldrPostprocessPrograms.size).toBe(0);
      expect(ctx.host.post.bloomPingPongResources).toBeNull();
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });

  it("does not delete stale target, sampler, or legacy names after a real context loss", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, sampler = {} as WebGLSampler, program = {} as WebGLProgram;
    const target = new WebGL2RenderTarget(1, 2, 2, "target", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    const freed = vi.fn(), retire = vi.fn();
    target.onFreed = freed;
    target.retireTextures = retire;
    ctx.host.renderTargets.add(target);
    ctx.host.samplers.samplerObjectCache.set("sampler", sampler);
    ctx.host.post.presentationProgram = program;
    for (const handle of [framebuffer, sampler, program]) ctx.failures.set(handle, new Error("delete failed"));
    lifecycle.track(ctx.device);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toHaveLength(3);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      ctx.lose();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      for (const handle of [framebuffer, sampler, program]) expect(ctx.attempts.get(handle)).toBe(1);
      expect(retire).not.toHaveBeenCalled();
      expect(freed).toHaveBeenCalledTimes(1);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });
});

describe("WebGL2 render target retirement and pool ownership", () => {
  const desc = { width: 2, height: 2, format: "rgba8", samples: 1, depth: false } as const;

  it("retains and retries callback, framebuffer, and texture failures independently across aliases", () => {
    const ctx = makeDevice(), peer = makeDevice(), lifecycle = new ResourceLifecycle();
    const root = {} as WebGLFramebuffer, layer = {} as WebGLFramebuffer, failedLayer = {} as WebGLFramebuffer;
    const rbA = {} as WebGLRenderbuffer, rbB = {} as WebGLRenderbuffer;
    const handleA = {} as WebGLTexture, handleB = {} as WebGLTexture;
    const texA = new Texture({ width: 2, height: 2 }), texB = new Texture({ width: 2, height: 2 });
    const target = new WebGL2RenderTarget(1, 2, 2, "aliased", texA, texB, root, handleA, rbA, handleB, 4, root, rbA, ctx.host.gl, {
      colorTextures: [texA, texB, texB], extraColorHandles: [handleA, handleB, handleB],
      layerFramebuffers: [layer, failedLayer, layer, root], extraMultisampleColorHandles: [rbA, rbB, rbB]
    });
    const child = new WebGL2RenderTarget(4, 2, 2, "layer", texA, texB, layer, handleA, null, handleB, 1, layer, null, ctx.host.gl,
      { colorTextures: [texA, texB], layerChild: true });
    target.layerTargets = [child, child];
    const siblingFramebuffer = {} as WebGLFramebuffer, peerFramebuffer = {} as WebGLFramebuffer;
    const sibling = new WebGL2RenderTarget(2, 2, 2, "sibling", new Texture({ width: 2, height: 2 }), undefined,
      siblingFramebuffer, {} as WebGLTexture, null, null, 1, siblingFramebuffer, null, ctx.host.gl);
    const peerTarget = new WebGL2RenderTarget(3, 2, 2, "peer", new Texture({ width: 2, height: 2 }), undefined,
      peerFramebuffer, {} as WebGLTexture, null, null, 1, peerFramebuffer, null, peer.host.gl);
    ctx.host.renderTargets.add(target);
    ctx.host.renderTargets.add(sibling);
    ctx.host.renderTargets.add(child);
    peer.host.renderTargets.add(peerTarget);
    const callbackError = new Error("target detach failed"), framebufferError = new Error("framebuffer failed");
    const logicalError = new Error("logical texture failed"), nativeError = new Error("native texture failed");
    let failCallback = true;
    const detach = vi.fn(() => { expect(child.disposed).toBe(true); if (failCallback) throw callbackError; });
    const originalTexA = texA.dispose.bind(texA);
    const disposeA = vi.spyOn(texA, "dispose").mockImplementationOnce(() => { throw logicalError; }).mockImplementation(originalTexA);
    const disposeB = vi.spyOn(texB, "dispose");
    const freed = vi.fn();
    target.onDispose = detach;
    target.onFreed = freed;
    ctx.failures.set(failedLayer, framebufferError);
    ctx.failures.set(handleB, nativeError);
    lifecycle.track(target);
    lifecycle.track(sibling);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([callbackError, framebufferError]);
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.deleted.get(layer)).toBe(1);
      expect(ctx.deleted.get(root)).toBe(1);
      expect(ctx.deleted.get(rbA)).toBe(1);
      expect(ctx.deleted.get(rbB)).toBe(1);
      expect(ctx.deleted.get(siblingFramebuffer)).toBe(1);
      expect(child.disposed).toBe(true);
      child.dispose();
      expect(disposeA).not.toHaveBeenCalled();
      expect(disposeB).not.toHaveBeenCalled();
      expect(peerTarget.disposed).toBe(false);
      expect(peer.attempts.size).toBe(0);

      failCallback = false;
      ctx.failures.delete(failedLayer);
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([logicalError, nativeError]);
      expect(lifecycle.disposed).toBe(false);
      expect(disposeA).toHaveBeenCalledTimes(1);
      expect(disposeB).toHaveBeenCalledTimes(1);
      expect(ctx.deleted.get(handleA)).toBe(1);
      expect(freed).not.toHaveBeenCalled();

      ctx.failures.clear();
      lifecycle.dispose();
      target.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(detach).toHaveBeenCalledTimes(2);
      expect(disposeA).toHaveBeenCalledTimes(2);
      expect(disposeB).toHaveBeenCalledTimes(1);
      expect(freed).toHaveBeenCalledTimes(1);
      for (const handle of [layer, root, rbA, rbB, handleA, siblingFramebuffer]) expect(ctx.attempts.get(handle)).toBe(1);
      expect(ctx.attempts.get(failedLayer)).toBe(2);
      expect(ctx.attempts.get(handleB)).toBe(2);
      expect(peer.attempts.size).toBe(0);
    } finally {
      failCallback = false;
      ctx.failures.clear();
      ctx.device.dispose();
      peer.device.dispose();
    }
  });

  it("does not drop a stub-pool lease when a target callback reenters its release", () => {
    const ctx = makeDevice();
    const pool = renderTargetPoolSlot.stub(ctx.device);
    const lease = acquireTargetPoolLease(pool, desc);
    const target = lease.target as WebGL2RenderTarget;
    const original = target.onDispose!;
    const failure = new Error("target callback failed");
    let first = true, nested: unknown;
    target.onDispose = () => {
      if (first) {
        first = false;
        nested = thrownBy(() => lease.release());
        throw failure;
      }
      original();
    };
    const retire = vi.fn(target.retireTextures!);
    target.retireTextures = retire;
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(nested).toEqual(expect.objectContaining({ message: expect.stringMatching(/disposal is in progress/i) }));
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
      expect(retire).not.toHaveBeenCalled();
      lease.release();
      lease.release();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
      expect(retire).toHaveBeenCalledTimes(1);
    } finally {
      first = false;
      lease.release();
      ctx.lose();
      ctx.device.dispose();
    }
  });

  it("preserves failed real-pool retirement while isolating sibling leases and another device", () => {
    const ctx = makeDevice(), peer = makeDevice();
    const pool = new RenderTargetPool(ctx.device), peerPool = new RenderTargetPool(peer.device);
    const target = pool.acquire(desc) as WebGL2RenderTarget;
    const sibling = pool.acquire(desc) as WebGL2RenderTarget;
    const other = peerPool.acquire(desc) as WebGL2RenderTarget;
    const original = target.onDispose!, callbackError = new Error("detach failed"), framebufferError = new Error("framebuffer failed");
    let failCallback = true;
    const detach = vi.fn(() => { if (failCallback) throw callbackError; original(); });
    target.onDispose = detach;
    ctx.failures.set(target.framebuffer, framebufferError);
    try {
      expect(leafErrors(thrownBy(() => pool.release(target)))).toEqual([callbackError, framebufferError]);
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
      const replacement = pool.acquire(desc);
      expect(replacement).not.toBe(target);
      expect(sibling.disposed).toBe(false);
      expect(other.disposed).toBe(false);
      expect(peer.attempts.size).toBe(0);
      failCallback = false;
      ctx.failures.clear();
      pool.release(target);
      pool.release(target);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(detach).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(target.framebuffer)).toBe(2);
      expect(sibling.disposed).toBe(false);
      expect(other.disposed).toBe(false);
    } finally {
      failCallback = false;
      ctx.failures.clear();
      pool.dispose();
      peerPool.dispose();
      ctx.lose();
      peer.lose();
      ctx.device.dispose();
      peer.device.dispose();
    }
  });

  it("retains a real WebGL target through PostResources and the stub backing pool", () => {
    const ctx = makeDevice(), peer = makeDevice();
    const firstPool = renderTargetPoolSlot.stub(ctx.device), peerPool = renderTargetPoolSlot.stub(peer.device);
    vi.spyOn(renderTargetPoolSlot, "get").mockImplementation(() => device => device === ctx.device ? firstPool : peerPool);
    const flags = { values: {}, on: () => false };
    const owner = new PostResources(ctx.device, flags), otherOwner = new PostResources(peer.device, flags);
    const failed = owner.acquireLease(desc), sibling = owner.acquireLease(desc), other = otherOwner.acquireLease(desc);
    const target = failed.target as WebGL2RenderTarget, siblingTarget = sibling.target as WebGL2RenderTarget;
    const original = target.onDispose!, failure = new Error("post target callback failed");
    let fail = true;
    const detach = vi.fn(() => { if (fail) throw failure; original(); });
    const disposeSibling = vi.spyOn(siblingTarget, "dispose");
    target.onDispose = detach;
    try {
      expect(leafErrors(thrownBy(() => owner.dispose()))).toEqual([failure]);
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(siblingTarget.disposed).toBe(true);
      expect(other.target.disposed).toBe(false);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
      expect(peer.attempts.size).toBe(0);
      fail = false;
      owner.dispose();
      failed.release();
      sibling.release();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(detach).toHaveBeenCalledTimes(2);
      expect(disposeSibling).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
      expect(other.target.disposed).toBe(false);
      expect(peer.attempts.size).toBe(0);
    } finally {
      fail = false;
      owner.dispose();
      otherOwner.dispose();
      ctx.device.dispose();
      peer.device.dispose();
      ctx.lose();
      peer.lose();
    }
  });

  it("lets a real pool retry a target whose earlier external disposal failed", () => {
    const ctx = makeDevice(), pool = new RenderTargetPool(ctx.device);
    const target = pool.acquire(desc) as WebGL2RenderTarget;
    const original = target.onDispose!, failure = new Error("external target failure");
    let fail = true;
    const detach = vi.fn(() => { if (fail) throw failure; original(); });
    target.onDispose = detach;
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(target.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(true);
      fail = false;
      pool.release(target);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(detach).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
    } finally {
      fail = false;
      pool.dispose();
      ctx.device.dispose();
      ctx.lose();
    }
  });

  it("retains a real-pool lease when external target disposal reenters its release", () => {
    const ctx = makeDevice(), pool = new RenderTargetPool(ctx.device);
    const target = pool.acquire(desc) as WebGL2RenderTarget;
    const original = target.onDispose!, failure = new Error("outer target callback failed");
    let first = true;
    target.onDispose = () => {
      if (first) {
        first = false;
        try { pool.release(target); } catch { /* The active target cannot be released recursively. */ }
        throw failure;
      }
      original();
    };
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(target[resourceDisposalPending]).toBe(true);
      pool.release(target);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
    } finally {
      pool.dispose();
      ctx.device.dispose();
      ctx.lose();
    }
  });

  it("retains an externally failed idle target when pool statistics are read", () => {
    const ctx = makeDevice(), pool = new RenderTargetPool(ctx.device);
    const lease = pool.acquireLease(desc), target = lease.target as WebGL2RenderTarget;
    const original = target.onDispose!, failure = new Error("idle target callback failed");
    let fail = true;
    target.onDispose = () => { if (fail) throw failure; original(); };
    lease.release();
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
      fail = false;
      pool.trim(0);
      expect(target[resourceDisposalPending]).toBe(false);
      expect(ctx.attempts.get(target.framebuffer)).toBe(1);
    } finally {
      fail = false;
      pool.dispose();
      ctx.device.dispose();
      ctx.lose();
    }
  });

  it("deduplicates retired texture aliases and keeps a successful debit despite a later error", () => {
    const ctx = makeDevice();
    const a = {} as WebGLTexture, b = {} as WebGLTexture, framebuffer = {} as WebGLFramebuffer;
    const target = new WebGL2RenderTarget(1, 2, 2, "aliases", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, a, null, b, 1, framebuffer, null, ctx.host.gl, { extraColorHandles: [a, b, b] });
    ctx.host.renderTargets.add(target);
    const failure = new Error("after release"), freed = vi.fn();
    const retire = vi.fn((handles: readonly WebGLTexture[], release: () => void) => {
      expect(handles).toEqual([a, b]);
      release();
      release();
      throw failure;
    });
    target.onFreed = freed;
    target.retireTextures = retire;
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(target[resourceDisposalPending]).toBe(false);
      target.dispose();
      expect(retire).toHaveBeenCalledTimes(1);
      expect(freed).toHaveBeenCalledTimes(1);
    } finally {
      target.retireTextures = undefined;
      ctx.device.dispose();
    }
  });

  it("deletes aliased textures only once when the actual registry retirement fence signals", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const framebuffer = {} as WebGLFramebuffer, a = {} as WebGLTexture, b = {} as WebGLTexture;
    const target = new WebGL2RenderTarget(1, 2, 2, "native aliases", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, a, null, b, 1, framebuffer, null, ctx.host.gl, { extraColorHandles: [a, b, b] });
    const freed = vi.fn();
    let retirement: Promise<void> | undefined;
    target.onFreed = freed;
    target.retireTextures = (handles, release) => { retirement = ctx.host.textureRegistry.retireNativeTextures(handles, release); };
    ctx.host.renderTargets.add(target);
    ctx.hooks.signalRetirements = true;
    try {
      target.dispose();
      expect(retirement).toBeDefined();
      expect(ctx.attempts.has(a)).toBe(false);
      expect(ctx.attempts.has(b)).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      await retirement;
      target.dispose();
      expect(ctx.attempts.get(a)).toBe(1);
      expect(ctx.attempts.get(b)).toBe(1);
      expect(freed).toHaveBeenCalledTimes(1);
    } finally {
      ctx.device.dispose();
      vi.useRealTimers();
    }
  });

  it("re-enlists a failed asynchronous debit after the device has already closed", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const framebuffer = {} as WebGLFramebuffer, handle = {} as WebGLTexture;
    const target = new WebGL2RenderTarget(1, 2, 2, "late debit", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, handle, null, null, 1, framebuffer, null, ctx.host.gl);
    const failure = new Error("late target debit failed");
    let fail = true, retirement: Promise<void> | undefined;
    const freed = vi.fn(() => { if (fail) throw failure; });
    target.onFreed = freed;
    target.retireTextures = (handles, release) => { retirement = ctx.host.textureRegistry.retireNativeTextures(handles, release); };
    ctx.host.renderTargets.add(target);
    ctx.hooks.signalRetirements = true;
    try {
      target.dispose();
      ctx.device.dispose();
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(ctx.listeners("webglcontextlost")).toBe(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(ctx.device[resourceDisposalPending]).toBe(true);
      expect(ctx.attempts.get(handle)).toBe(1);
      expect(leafErrors(thrownBy(() => ctx.device.dispose()))).toEqual([failure]);
      expect(freed).toHaveBeenCalledTimes(2);
      fail = false;
      ctx.device.dispose();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(ctx.device[resourceDisposalPending]).toBe(false);
      expect(freed).toHaveBeenCalledTimes(3);
      // The registry still owns its failed completion callback until loss;
      // that later callback must not debit or delete a second time.
      ctx.lose();
      await retirement;
      expect(ctx.attempts.get(handle)).toBe(1);
      expect(freed).toHaveBeenCalledTimes(3);
      expect(ctx.listeners("webglcontextlost")).toBe(0);
    } finally {
      fail = false;
      ctx.device.dispose();
      ctx.lose();
      vi.useRealTimers();
    }
  });

  it("retries a failed debit without re-registering a successfully retired texture", () => {
    const ctx = makeDevice();
    const framebuffer = {} as WebGLFramebuffer;
    const target = new WebGL2RenderTarget(1, 2, 2, "debit", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const failure = new Error("debit failed");
    let fail = true;
    const freed = vi.fn(() => { if (fail) throw failure; });
    const retire = vi.fn((_handles: readonly WebGLTexture[], release: () => void) => release());
    target.onFreed = freed;
    target.retireTextures = retire;
    try {
      expect(thrownBy(() => target.dispose())).toBe(failure);
      expect(target[resourceDisposalPending]).toBe(true);
      fail = false;
      target.dispose();
      target.dispose();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(retire).toHaveBeenCalledTimes(1);
      expect(freed).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
    } finally {
      fail = false;
      ctx.device.dispose();
    }
  });

  it("retries a direct post-delete debit without deleting the texture again", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, handle = {} as WebGLTexture;
    const target = new WebGL2RenderTarget(1, 2, 2, "direct debit", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, handle, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const failure = new Error("direct debit failed");
    let fail = true;
    const freed = vi.fn(() => { if (fail) throw failure; });
    target.onFreed = freed;
    lifecycle.track(target);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([failure]);
      expect(lifecycle.disposed).toBe(false);
      expect(ctx.deleted.get(handle)).toBe(1);
      fail = false;
      lifecycle.dispose();
      target.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
      expect(ctx.attempts.get(handle)).toBe(1);
      expect(freed).toHaveBeenCalledTimes(2);
    } finally {
      fail = false;
      ctx.device.dispose();
    }
  });

  it("retries a failed retirement submission without repeating framebuffer or texture cleanup", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, texture = new Texture({ width: 2, height: 2 });
    const target = new WebGL2RenderTarget(1, 2, 2, "submission", texture, undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const failure = new Error("retirement submission failed");
    let fail = true;
    const disposed = vi.spyOn(texture, "dispose"), freed = vi.fn();
    const retire = vi.fn((_handles: readonly WebGLTexture[], release: () => void) => {
      if (fail) throw failure;
      release();
    });
    target.onFreed = freed;
    target.retireTextures = retire;
    lifecycle.track(target);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([failure]);
      expect(lifecycle.disposed).toBe(false);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
      expect(disposed).toHaveBeenCalledTimes(1);
      fail = false;
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(retire).toHaveBeenCalledTimes(2);
      expect(freed).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally {
      fail = false;
      ctx.device.dispose();
    }
  });

  it("does not repeat a logical texture release that completed before reporting an error", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, texture = new Texture({ width: 2, height: 2 });
    const target = new WebGL2RenderTarget(1, 2, 2, "texture", texture, undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const failure = new Error("after logical release"), original = texture.dispose.bind(texture);
    const dispose = vi.spyOn(texture, "dispose").mockImplementationOnce(() => { original(); throw failure; }).mockImplementation(original);
    const freed = vi.fn();
    target.onFreed = freed;
    lifecycle.track(target);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([failure]);
      expect(lifecycle.disposed).toBe(false);
      expect(texture.disposed).toBe(true);
      expect(freed).toHaveBeenCalledTimes(1);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(freed).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
    } finally {
      ctx.device.dispose();
    }
  });

  it("attempts logical textures independently of a failed framebuffer while deferring native retirement", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer, handle = {} as WebGLTexture, texture = new Texture({ width: 2, height: 2 });
    const target = new WebGL2RenderTarget(1, 2, 2, "independent", texture, undefined,
      framebuffer, handle, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const fbError = new Error("framebuffer failed"), textureError = new Error("logical texture failed");
    const original = texture.dispose.bind(texture);
    const dispose = vi.spyOn(texture, "dispose").mockImplementationOnce(() => { throw textureError; }).mockImplementation(original);
    const freed = vi.fn();
    target.onFreed = freed;
    ctx.failures.set(framebuffer, fbError);
    lifecycle.track(target);
    try {
      expect(leafErrors(thrownBy(() => lifecycle.dispose()))).toEqual([fbError, textureError]);
      expect(lifecycle.disposed).toBe(false);
      expect(target[resourceDisposalPending]).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(ctx.attempts.has(handle)).toBe(false);
      expect(freed).not.toHaveBeenCalled();
      ctx.failures.clear();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(framebuffer)).toBe(2);
      expect(ctx.attempts.get(handle)).toBe(1);
      expect(freed).toHaveBeenCalledTimes(1);
    } finally {
      ctx.failures.clear();
      ctx.device.dispose();
    }
  });

  it("keeps an asynchronous debit retryable and rejects reentrant target disposal until it finishes", () => {
    const ctx = makeDevice(), lifecycle = new ResourceLifecycle();
    const framebuffer = {} as WebGLFramebuffer;
    const target = new WebGL2RenderTarget(1, 2, 2, "async debit", new Texture({ width: 2, height: 2 }), undefined,
      framebuffer, {} as WebGLTexture, null, null, 1, framebuffer, null, ctx.host.gl);
    ctx.host.renderTargets.add(target);
    const failure = new Error("async debit failed");
    let release: (() => void) | undefined, fail = true, reenter = true, nested: unknown;
    const freed = vi.fn(() => {
      if (reenter) {
        reenter = false;
        nested = thrownBy(() => lifecycle.dispose());
      }
      if (fail) throw failure;
    });
    const retire = vi.fn((_handles: readonly WebGLTexture[], callback: () => void) => { release = callback; });
    target.onFreed = freed;
    target.retireTextures = retire;
    lifecycle.track(target);
    try {
      target.dispose();
      expect(target[resourceDisposalPending]).toBe(false);
      expect(release).toBeDefined();
      expect(thrownBy(() => release!())).toBe(failure);
      expect(nested).toBeInstanceOf(AggregateError);
      expect(lifecycle.disposed).toBe(false);
      expect(target[resourceDisposalPending]).toBe(true);
      fail = false;
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(target[resourceDisposalPending]).toBe(false);
      release!();
      release!();
      expect(retire).toHaveBeenCalledTimes(1);
      expect(freed).toHaveBeenCalledTimes(2);
      expect(ctx.attempts.get(framebuffer)).toBe(1);
    } finally {
      fail = false;
      ctx.device.dispose();
    }
  });
});
