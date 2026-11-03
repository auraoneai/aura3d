import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseImageFormat } from "../../../packages/assets/src/loaders/ImageFormatLoaders";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import { texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import { createProjectedSpotResource } from "../../../packages/engine/src/agent-api/compiler/projectedSpotResources";
import { createAuraApp, material, primitives, scene } from "../../../packages/engine/src/public/index";
import { MockRenderDevice, type DrawCommand, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

/** Independently constructed PVR v3 RGBA fixture; values are source samples. */
function pvr(options: {
  readonly bits?: 8 | 16;
  readonly colorSpace?: "linear" | "srgb";
  readonly flags?: number;
  readonly metadata?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  readonly levels: readonly (readonly number[])[];
}): Uint8Array {
  const bits = options.bits ?? 8;
  const metadata = options.metadata ?? new Uint8Array();
  const count = options.levels.reduce((sum, level) => sum + level.length, 0);
  const bytes = new Uint8Array(52 + metadata.length + count * (bits / 8));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(4, options.flags ?? 2, true);
  view.setUint32(8, 0x61626772, true); // rgba in source channel order
  view.setUint32(12, bits === 8 ? 0x08080808 : 0x10101010, true);
  view.setUint32(16, options.colorSpace === "srgb" ? 1 : 0, true);
  view.setUint32(20, bits === 8 ? 0 : 4, true);
  view.setUint32(24, options.height ?? 2, true);
  view.setUint32(28, options.width ?? 2, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, options.levels.length, true);
  view.setUint32(48, metadata.length, true);
  bytes.set(metadata, 52);
  let offset = 52 + metadata.length;
  for (const level of options.levels) for (const sample of level) {
    if (bits === 8) bytes[offset++] = sample;
    else { view.setUint16(offset, sample, true); offset += 2; }
  }
  return bytes;
}

/** One independently encoded 4x4 DXT2 block: alpha=136 and red=132. */
function dxt2(): Uint8Array {
  const bytes = new Uint8Array(52 + 16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(8, 8, true); // existing importer contract: DXT2 is premultiplied
  view.setUint32(24, 4, true);
  view.setUint32(28, 4, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, 1, true);
  bytes.fill(0x88, 52, 60);
  view.setUint16(60, 0x8000, true);
  return bytes;
}

/** DXT4 alpha endpoints and block color are authored independently here. */
function dxt4(): Uint8Array {
  const bytes = new Uint8Array(68);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x03525650, true);
  view.setUint32(8, 10, true); // existing importer contract: DXT4 is premultiplied
  view.setUint32(24, 4, true);
  view.setUint32(28, 4, true);
  view.setUint32(32, 1, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, 1, true);
  bytes[52] = 128;
  view.setUint16(60, 0x7800, true);
  return bytes;
}

const base = [64, 32, 0, 128, 0, 0, 0, 0, 255, 128, 3, 255, 1, 2, 3, 3] as const;
const coarse = [17, 33, 65, 85] as const;
const expectedBase = [128, 64, 0, 128, 0, 0, 0, 0, 255, 128, 3, 255, 85, 170, 255, 3];
const expectedCoarse = [51, 99, 195, 85];

function admitted(bytes: Uint8Array) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return defineAuraAssets({ image: { type: "texture", format: "pvr", url: "https://assets.example.test/image.pvr", hash: `sha256-${hash}` } }).image;
}

function response(bytes: Uint8Array): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } });
}

class ProjectedDevice {
  readonly kind = "webgl2" as const;
  disposed = false;
  contextLost = false;
  generation = 1;
  activeFrameToken: object | null = null;
  private complete!: () => void;
  readonly supportsSubmittedWorkCompletion = () => true;
  readonly onDeviceLost = (_listener: () => void) => () => {};
  readonly waitForSubmittedWork = () => new Promise<void>((resolve) => { this.complete = resolve; });
  asDevice(): RenderDevice { return this as unknown as RenderDevice; }
  finish(): void { this.complete(); }
}

class SceneCanvas {
  width = 64; height = 64; clientWidth = 64; clientHeight = 64;
  style = {}; dataset = {}; parentElement = null;
  getBoundingClientRect() { return { width: 64, height: 64, left: 0, top: 0 }; }
  hasAttribute() { return false; }
  getContext() { return null; }
  addEventListener() {}
  removeEventListener() {}
}

class SceneDevice extends MockRenderDevice {
  bound?: Texture;
  override draw(command: DrawCommand): void {
    const map = command.uniforms?.get("u_baseColorMap");
    if (map instanceof TextureBinding && map.texture) this.bound = map.texture;
    super.draw(command);
  }
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("bounded PVR premultiplied alpha support", () => {
  it("converts every linear RGBA8 mip with rounded division and an independent snapshot", async () => {
    const image = await parseImageFormat(pvr({ levels: [base, coarse] }), "pvr");
    const handle = texture.fromNativeImage(image, { maxDecodedBytes: 20 });
    try {
      expect(handle.texture.format).toBe("rgba8");
      expect(handle.texture.colorSpace).toBe("linear");
      expect(Array.from(handle.texture.mipLevels[0]!.data)).toEqual(expectedBase);
      expect(Array.from(handle.texture.mipLevels[1]!.data)).toEqual(expectedCoarse);
      expect(Array.from(image.levels[0]!.data)).toEqual(base);
      expect(Array.from(image.levels[1]!.data)).toEqual(coarse);
      expect(handle.repeat).toEqual([1, 1]);
      expect(handle.offset).toEqual([0, 0]);
      expect(handle.texture.flipY).toBe(false);
      expect(handle.diagnostics.join(" ")).toMatch(/converted to straight alpha.*quantized/);
      (image.levels[0]!.data as Uint8Array).fill(0);
      expect(Array.from(handle.texture.mipLevels[0]!.data)).toEqual(expectedBase);
    } finally { handle.dispose(); }
    expect(handle.texture.disposed).toBe(true);
  });

  it.each(["linear", "srgb"] as const)("accepts verified opaque %s RGBA8 and UNORM16 without changing colors", async (colorSpace) => {
    const image8 = await parseImageFormat(pvr({ colorSpace, width: 1, height: 1, levels: [[64, 96, 128, 255]] }), "pvr");
    const image16 = await parseImageFormat(pvr({ bits: 16, colorSpace, width: 1, height: 1, levels: [[65535, 32768, 1024, 65535]] }), "pvr");
    const h8 = texture.fromNativeImage(image8);
    const h16 = texture.fromNativeImage(image16);
    try {
      expect(Array.from(h8.texture.mipLevels[0]!.data)).toEqual([64, 96, 128, 255]);
      expect(h8.texture.colorSpace).toBe(colorSpace);
      const transfer = (n: number) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      const expected = colorSpace === "srgb" ? transfer(32768 / 65535) : 32768 / 65535;
      expect(h16.texture.colorSpace).toBe("linear");
      expect(h16.texture.mipLevels[0]!.data[1]).toBeCloseTo(expected, 6);
      expect(h16.texture.mipLevels[0]!.data[3]).toBe(1);
      expect(h8.diagnostics.join(" ")).toMatch(/verified fully opaque/);
    } finally { h8.dispose(); h16.dispose(); }
  });

  it("converts the CPU-decoded DXT2 format without requiring the header flag", async () => {
    const image = await parseImageFormat(dxt2(), "pvr");
    const handle = texture.fromNativeImage(image);
    try {
      expect(image.levels[0]!.encoding).toBe("rgba8");
      expect(Array.from(handle.texture.mipLevels[0]!.data.slice(0, 4))).toEqual([248, 0, 0, 136]);
    } finally { handle.dispose(); }
    const compressed = await parseImageFormat(dxt2(), "pvr", { gpuFormats: ["bc2"] });
    expect(() => texture.fromNativeImage(compressed)).toThrow(/encoding bc2|premultiplied.*compressed/i);
  });

  it("converts CPU-decoded DXT4 but rejects its retained compressed GPU representation", async () => {
    const image = await parseImageFormat(dxt4(), "pvr");
    const handle = texture.fromNativeImage(image);
    try { expect(Array.from(handle.texture.mipLevels[0]!.data.slice(0, 4))).toEqual([245, 0, 0, 128]); }
    finally { handle.dispose(); }
    const compressed = await parseImageFormat(dxt4(), "pvr", { gpuFormats: ["bc3"] });
    expect(() => texture.fromNativeImage(compressed)).toThrow(/premultiplied.*compressed/);
  });

  it("rejects impossible channels, including nonzero RGB at zero alpha, in any mip", async () => {
    const first = await parseImageFormat(pvr({ width: 1, height: 1, levels: [[1, 0, 0, 0]] }), "pvr");
    const later = await parseImageFormat(pvr({ levels: [base, [1, 2, 4, 3]] }), "pvr");
    expect(() => texture.fromNativeImage(first)).toThrow(/premultiplied.*greater than alpha/);
    expect(() => texture.fromNativeImage(later)).toThrow(/mip 1.*greater than alpha/);
    expect(Array.from(later.levels[0]!.data)).toEqual(base);
  });

  it("rejects transparent sRGB, transparent 16-bit, malformed metadata, and unhandled orientation", async () => {
    const srgb = await parseImageFormat(pvr({ colorSpace: "srgb", width: 1, height: 1, levels: [[64, 32, 0, 128]] }), "pvr");
    const rgba16 = await parseImageFormat(pvr({ bits: 16, width: 1, height: 1, levels: [[1, 2, 3, 4]] }), "pvr");
    const unknown = await parseImageFormat(pvr({ metadata: Uint8Array.of(1, 2, 3, 4), levels: [base] }), "pvr");
    expect(() => texture.fromNativeImage(srgb)).toThrow(/premultiplied.*linear RGBA8/);
    expect(() => texture.fromNativeImage(rgba16)).toThrow(/premultiplied.*linear RGBA8/);
    expect(() => texture.fromNativeImage(unknown)).toThrow(/orientation/);
    expect(() => texture.fromNativeImage({ ...srgb, metadata: { ...srgb.metadata, metadata: "ignored" } })).toThrow(/invalid PVR orientation metadata/);
    expect(() => texture.fromNativeImage({ ...srgb, metadata: { ...srgb.metadata, flags: NaN } })).toThrow(/invalid PVR flags/);
    expect(() => texture.fromNativeImage({ ...srgb, metadata: { ...srgb.metadata, pixelFormat: [8] } })).toThrow(/invalid PVR pixel format/);
  });

  it("enforces decoded-byte and mip validation before conversion", async () => {
    const bytes = pvr({ levels: [base, coarse] });
    await expect(parseImageFormat(bytes, "pvr", { maxDecodedBytes: 19 })).rejects.toThrow(/limit/i);
    const image = await parseImageFormat(bytes, "pvr");
    expect(() => texture.fromNativeImage(image, { maxDecodedBytes: 19 })).toThrow(/decoded-byte limit/);
    expect(() => texture.fromNativeImage({ ...image, levels: [image.levels[0]!, { ...image.levels[1]!, data: Uint8Array.of(0) }] })).toThrow(/mip 1.*invalid pixel/);
  });

  it("uses admitted digest-checked bytes through the typed load and releases the result", async () => {
    const bytes = pvr({ levels: [base, coarse] });
    const fetch = vi.fn(async () => response(bytes));
    vi.stubGlobal("fetch", fetch);
    const handle = await texture.loadNativeAsset(admitted(bytes), { maxDecodedBytes: 20 });
    expect(Array.from(handle.texture.mipLevels[0]!.data)).toEqual(expectedBase);
    expect(Array.from(handle.texture.mipLevels[1]!.data)).toEqual(expectedCoarse);
    handle.dispose();
    expect(handle.texture.disposed).toBe(true);
    const altered = bytes.slice();
    altered[altered.length - 1] ^= 1;
    vi.stubGlobal("fetch", vi.fn(async () => response(altered)));
    await expect(texture.loadNativeAsset(admitted(bytes))).rejects.toThrow(/integrity|load asset/i);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("mounts converted mips on a scene material and retires the scene-owned texture", async () => {
    const bytes = pvr({ levels: [base, coarse] });
    vi.stubGlobal("fetch", vi.fn(async () => response(bytes)));
    vi.stubGlobal("HTMLCanvasElement", SceneCanvas);
    vi.stubGlobal("window", { innerWidth: 64, innerHeight: 64, location: { href: "https://assets.example.test/", search: "" }, addEventListener() {}, removeEventListener() {} });
    const device = new SceneDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
    vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) =>
      new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory()));
    const app = createAuraApp(new SceneCanvas() as unknown as HTMLCanvasElement, {
      scene: scene().add(primitives.box({ name: "pvr-alpha", material: material.pbr({ texture: admitted(bytes) }) })),
      autoStart: false, resize: false,
      qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true,
        A3D_QR_MATERIALS: false, A3D_QR_POST: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_VFX: false }, allowUrlFlags: false }
    });
    let bound: Texture | undefined;
    try {
      await app.readyStrict({ stage: "first-frame" });
      await vi.waitFor(() => expect(app.diagnostics().renderer?.runtime.texturedMaterials).toContainEqual(
        expect.objectContaining({ nodeName: "pvr-alpha", status: "textured", pixelBacked: true })
      ));
      app.step(0);
      bound = device.bound;
      expect(bound).toBeInstanceOf(Texture);
      expect(Array.from(bound!.mipLevels[0]!.data)).toEqual(expectedBase);
      expect(Array.from(bound!.mipLevels[1]!.data)).toEqual(expectedCoarse);
    } finally { await app.disposeAsync(); }
    expect(bound?.disposed).toBe(true);
  });

  it("accepts only fully opaque premultiplied pixels for alpha-ignoring projected lights", async () => {
    const opaque = pvr({ colorSpace: "srgb", width: 1, height: 1, levels: [[40, 80, 120, 255]] });
    const device = new ProjectedDevice();
    const owner = {};
    vi.stubGlobal("fetch", vi.fn(async () => response(opaque)));
    const resource = createProjectedSpotResource(admitted(opaque), { device: device.asDevice(), owner });
    await resource.ready;
    device.activeFrameToken = {};
    const lease = resource.acquireFrame({ device: device.asDevice(), owner, viewId: "main", frameIndex: 1 });
    expect(lease).toBeDefined();
    expect(Array.from(lease!.texture.mipLevels[0]!.data)).toEqual([40, 80, 120, 255]);
    device.activeFrameToken = null;
    expect(lease!.release()).toBe(true);
    resource.dispose();
    expect(lease!.texture.disposed).toBe(false);
    device.finish();
    await Promise.resolve();
    expect(lease!.texture.disposed).toBe(true);
    await resource.settled;

    const dispose = vi.spyOn(Texture.prototype, "dispose");
    for (const pixel of [[40, 80, 0, 100], [0, 0, 0, 0]]) {
      const transparent = pvr({ width: 1, height: 1, levels: [pixel] });
      vi.stubGlobal("fetch", vi.fn(async () => response(transparent)));
      const rejected = createProjectedSpotResource(admitted(transparent), { device: device.asDevice(), owner });
      await expect(rejected.ready).rejects.toThrow(/fully opaque premultiplied/);
      expect(rejected.state).toBe("failed");
      device.activeFrameToken = {};
      expect(rejected.acquireFrame({ device: device.asDevice(), owner, viewId: "main", frameIndex: 1 })).toBeUndefined();
      device.activeFrameToken = null;
      await rejected.settled;
      rejected.dispose();
    }
    expect(dispose).toHaveBeenCalledTimes(2);
  });
});
