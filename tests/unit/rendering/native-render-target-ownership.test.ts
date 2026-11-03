import { describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Texture, claimRenderTargetTextureOwner, getRenderTargetTextureOwner } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGL2Device, type WebGL2RenderTarget } from "../../../packages/rendering/src/WebGL2Device";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { WebGL2ResidencySource } from "../../../packages/rendering/src/webgl2/TextureResidencyAdapter";

/** A device-shaped GL recorder; no browser or graphics context is involved. */
function makeWebGLDevice() {
  const constants = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0]]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  const listeners = new Map<string, EventListener>();
  const bindings = new Map<number, unknown>();
  let nextId = 0;
  let textureCreations = 0;
  let activeTexture = constant("TEXTURE0");
  let framebuffer: unknown = null;
  let renderbuffer: unknown = null;
  let lost = false;
  const methods: Record<string, unknown> = {
    getError: () => 0,
    isContextLost: () => lost,
    getContextAttributes: () => ({ stencil: true }),
    getExtension: () => null,
    getParameter: (name: number) => {
      if (name === constant("MAX_SAMPLES")) return 4;
      if (name === constant("MAX_VERTEX_ATTRIBS") || name === constant("MAX_TEXTURE_IMAGE_UNITS")) return 16;
      if (name === constant("ACTIVE_TEXTURE")) return activeTexture;
      if (name === constant("TEXTURE_BINDING_2D")) return bindings.get(constant("TEXTURE_2D")) ?? null;
      if (name === constant("TEXTURE_BINDING_CUBE_MAP")) return bindings.get(constant("TEXTURE_CUBE_MAP")) ?? null;
      if (name === constant("TEXTURE_BINDING_2D_ARRAY")) return bindings.get(constant("TEXTURE_2D_ARRAY")) ?? null;
      if (name === constant("FRAMEBUFFER_BINDING") || name === constant("DRAW_FRAMEBUFFER_BINDING") || name === constant("READ_FRAMEBUFFER_BINDING")) return framebuffer;
      if (name === constant("RENDERBUFFER_BINDING")) return renderbuffer;
      return 0;
    },
    createTexture: () => { textureCreations += 1; return { texture: ++nextId }; },
    createFramebuffer: () => ({ framebuffer: ++nextId }),
    createRenderbuffer: () => ({ renderbuffer: ++nextId }),
    checkFramebufferStatus: () => constant("FRAMEBUFFER_COMPLETE"),
    activeTexture: (value: number) => { activeTexture = value; },
    bindTexture: (target: number, value: unknown) => { bindings.set(target, value); },
    bindFramebuffer: (_target: number, value: unknown) => { framebuffer = value; },
    bindRenderbuffer: (_target: number, value: unknown) => { renderbuffer = value; },
    fenceSync: () => ({ sync: ++nextId }),
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
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name)
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const host = (device as unknown as { host: WebGL2DeviceHost }).host;
  return {
    device,
    host,
    textureCreations: () => textureCreations,
    lose: () => { lost = true; listeners.get("webglcontextlost")?.({ preventDefault() {} } as Event); },
    restore: () => { lost = false; listeners.get("webglcontextrestored")?.({} as Event); }
  };
}

function streamSource(texture: Texture): WebGL2ResidencySource {
  return {
    texture,
    identity: {},
    fallback: [0, 0, 0, 255],
    levels: [{ width: texture.width, height: texture.height, bytes: texture.width * texture.height * 4 }],
    async loadMip() { return { value: { data: new Uint8Array(texture.width * texture.height * 4) }, release() {} }; }
  };
}

function expectTargetOwnership(target: RenderTarget, owner: object): void {
  const textures = [target.colorTexture, ...(target.colorTextures ?? []), ...(target.depthTexture ? [target.depthTexture] : [])];
  for (const texture of textures) expect(getRenderTargetTextureOwner(texture)).toBe(owner);
  for (const child of target.layerTargets ?? []) {
    expect(child.colorTexture).toBe(target.colorTexture);
    expect(child.depthTexture).toBe(target.depthTexture);
    expect(child.colorTextures).toBe(target.colorTextures);
    for (const texture of textures) expect(getRenderTargetTextureOwner(texture)).toBe(owner);
  }
}

describe("render-target texture ownership", () => {
  it("claims identities once and retains their owner after texture disposal", () => {
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4) });
    const first = {};
    const second = {};
    expect(getRenderTargetTextureOwner(texture)).toBeUndefined();
    claimRenderTargetTextureOwner(texture, first);
    claimRenderTargetTextureOwner(texture, first);
    expect(() => claimRenderTargetTextureOwner(texture, second)).toThrow(/already owned by another device/);
    texture.dispose();
    expect(getRenderTargetTextureOwner(texture)).toBe(first);
    expect(() => claimRenderTargetTextureOwner(texture, second)).toThrow(/already owned by another device/);
    expect(() => claimRenderTargetTextureOwner(texture, first)).not.toThrow();
  });

  it("claims every MRT, layered, depth and colorless alias for mock and WebGL targets", () => {
    const mock = new MockRenderDevice();
    const webgl = makeWebGLDevice();
    try {
      for (const owner of [mock, webgl.device]) {
        const layered = owner.createRenderTarget({
          width: 2, height: 2, dimension: "2d-array", layers: 2, depth: "texture",
          colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }]
        });
        expect(layered.colorTextures).toHaveLength(2);
        expect(layered.layerTargets).toHaveLength(2);
        expectTargetOwnership(layered, owner);
        const depthOnly = owner.createRenderTarget({ width: 2, height: 2, dimension: "cube", depthOnly: true });
        expect(depthOnly.layerTargets).toHaveLength(6);
        expect(depthOnly.depthTexture).toBeDefined();
        expectTargetOwnership(depthOnly, owner);
      }
    } finally {
      mock.dispose();
      webgl.device.dispose();
    }
  });

  it("uses same-device storage and refuses foreign target aliases without allocating", () => {
    const first = makeWebGLDevice();
    const second = makeWebGLDevice();
    const mock = new MockRenderDevice();
    try {
      const target = first.device.createRenderTarget({ width: 2, height: 2, depth: "texture" }) as WebGL2RenderTarget;
      expect(first.host.textureRegistry.getTextureHandle(target.colorTexture)).toBe(target.colorHandle);
      expect(first.host.textureRegistry.getTextureHandle(target.depthTexture!)).toBe(target.depthTextureHandle);
      const mockTarget = mock.createRenderTarget({ width: 2, height: 2, depth: "texture" });
      const before = second.textureCreations();
      for (const texture of [target.colorTexture, target.depthTexture!, mockTarget.colorTexture, mockTarget.depthTexture!]) {
        expect(() => second.host.textureRegistry.getTextureHandle(texture)).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      }
      expect(second.textureCreations()).toBe(before);
      const colorless = first.device.createRenderTarget({ width: 2, height: 2, depthOnly: true });
      expect(() => first.host.textureRegistry.getTextureHandle(colorless.colorTexture)).toThrow(expect.objectContaining({ code: "INVALID_RENDER_TARGET" }));
      expect(first.host.textureRegistry.getTextureHandle(colorless.depthTexture!)).toBeTruthy();
    } finally {
      first.device.dispose();
      second.device.dispose();
      mock.dispose();
    }
  });

  it("keeps ordinary CPU-authored textures shareable, including render-attachment usage", () => {
    const first = makeWebGLDevice();
    const second = makeWebGLDevice();
    const texture = new Texture({ width: 1, height: 1, renderAttachment: true, data: new Uint8Array([1, 2, 3, 4]), generateMipmaps: false });
    try {
      expect(getRenderTargetTextureOwner(texture)).toBeUndefined();
      const firstHandle = first.host.textureRegistry.getTextureHandle(texture);
      const secondHandle = second.host.textureRegistry.getTextureHandle(texture);
      expect(firstHandle).not.toBe(secondHandle);
      expect(first.host.textureRegistry.getTextureHandle(texture)).toBe(firstHandle);
      expect(second.host.textureRegistry.getTextureHandle(texture)).toBe(secondHandle);
      expect(getRenderTargetTextureOwner(texture)).toBeUndefined();
    } finally {
      texture.dispose();
      first.device.dispose();
      second.device.dispose();
    }
  });

  it("rejects owned target aliases on WebGL streaming admission", () => {
    const first = makeWebGLDevice();
    const second = makeWebGLDevice();
    try {
      const target = first.device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
      const localAdapter = first.device.createTextureResidencyAdapter();
      const foreignAdapter = second.device.createTextureResidencyAdapter();
      const localBefore = first.textureCreations();
      const foreignBefore = second.textureCreations();
      expect(() => first.host.textureRegistry.assertCanPrepareStreamedTexture(target.colorTexture)).toThrow(expect.objectContaining({ code: "RENDER_TARGET_STREAMING_UNSUPPORTED" }));
      expect(() => second.host.textureRegistry.assertCanPrepareStreamedTexture(target.colorTexture)).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      // The public adapter rejects render-attachment usage even earlier.
      expect(() => localAdapter.prepare(streamSource(target.colorTexture), { maxBytes: 1024, generation: localAdapter.generation() })).toThrow(/render attachments/);
      expect(() => foreignAdapter.prepare(streamSource(target.colorTexture), { maxBytes: 1024, generation: foreignAdapter.generation() })).toThrow(/render attachments/);
      expect(first.textureCreations()).toBe(localBefore);
      expect(second.textureCreations()).toBe(foreignBefore);
    } finally {
      first.device.dispose();
      second.device.dispose();
    }
  });

  it("preserves target ownership through context loss, restoration and disposal", () => {
    const first = makeWebGLDevice();
    const second = makeWebGLDevice();
    try {
      const target = first.device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
      const color = target.colorTexture;
      first.lose();
      expect(getRenderTargetTextureOwner(color)).toBe(first.device);
      expect(() => first.host.textureRegistry.getTextureHandle(color)).toThrow(expect.objectContaining({ code: "CONTEXT_LOST" }));
      first.restore();
      expect(() => first.host.textureRegistry.getTextureHandle(color)).toThrow(expect.objectContaining({ code: "INVALID_RENDER_TARGET" }));
      expect(() => second.host.textureRegistry.getTextureHandle(color)).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      const replacement = first.device.createRenderTarget({ width: 2, height: 2 });
      expect(first.host.textureRegistry.getTextureHandle(replacement.colorTexture)).toBeTruthy();
      target.dispose();
      expect(getRenderTargetTextureOwner(color)).toBe(first.device);
      expect(() => first.host.textureRegistry.getTextureHandle(color)).toThrow(expect.objectContaining({ code: "DISPOSED_RESOURCE" }));
      expect(() => second.host.textureRegistry.getTextureHandle(color)).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
    } finally {
      first.device.dispose();
      second.device.dispose();
    }
  });

  it("keeps an alias owned after the originating device is disposed", () => {
    const first = makeWebGLDevice();
    const second = makeWebGLDevice();
    try {
      const target = first.device.createRenderTarget({ width: 1, height: 1, depth: "texture" });
      first.device.dispose();
      for (const texture of [target.colorTexture, target.depthTexture!]) {
        expect(texture.disposed).toBe(true);
        expect(getRenderTargetTextureOwner(texture)).toBe(first.device);
        expect(() => claimRenderTargetTextureOwner(texture, second.device)).toThrow(/another device/);
        expect(() => second.host.textureRegistry.getTextureHandle(texture)).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      }
    } finally {
      first.device.dispose();
      second.device.dispose();
    }
  });

  it("rejects foreign target bindings in mock draws while allowing local and CPU textures", () => {
    const first = new MockRenderDevice();
    const second = new MockRenderDevice();
    const webgl = makeWebGLDevice();
    const ordinary = new Texture({ width: 1, height: 1, data: new Uint8Array(4) });
    try {
      const local = first.createRenderTarget({ width: 1, height: 1 });
      const foreign = second.createRenderTarget({ width: 1, height: 1 });
      const foreignGl = webgl.device.createRenderTarget({ width: 1, height: 1 });
      const vertexBuffer = first.createBuffer("vertex", 12);
      first.beginFrame(1, 1);
      const command = (texture: Texture): DrawCommand => ({
        topology: "triangles", vertexBuffer, vertexCount: 3,
        uniforms: new Map([["image", new TextureBinding({ name: "image", texture })]])
      });
      expect(() => first.draw(command(local.colorTexture))).not.toThrow();
      expect(() => first.draw(command(ordinary))).not.toThrow();
      expect(() => first.draw(command(foreign.colorTexture))).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      expect(() => first.draw(command(foreignGl.colorTexture))).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      expect(() => first.draw({
        topology: "triangles", vertexBuffer, vertexCount: 3,
        nativeStorageBindings: [{ kind: "storage-texture", name: "storage", group: 1, binding: 0, texture: foreign.colorTexture }]
      })).toThrow(expect.objectContaining({ code: "FOREIGN_RESOURCE" }));
      first.endFrame();
    } finally {
      ordinary.dispose();
      first.dispose();
      second.dispose();
      webgl.device.dispose();
    }
  });

  it("shares the ownership registry across duplicate renderer modules", async () => {
    const device = new MockRenderDevice();
    try {
      const target = device.createRenderTarget({ width: 1, height: 1 });
      vi.resetModules();
      const copy = await import("../../../packages/rendering/src/Texture");
      expect(copy.Texture).not.toBe(Texture);
      expect(copy.getRenderTargetTextureOwner(target.colorTexture)).toBe(device);
      expect(() => copy.claimRenderTargetTextureOwner(target.colorTexture, {})).toThrow(/another device/);
      const secondTexture = new copy.Texture({ width: 1, height: 1 });
      const otherOwner = {};
      copy.claimRenderTargetTextureOwner(secondTexture, otherOwner);
      expect(getRenderTargetTextureOwner(secondTexture)).toBe(otherOwner);
      secondTexture.dispose();
    } finally {
      device.dispose();
    }
  });
});
