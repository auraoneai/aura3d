import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineAuraAssets, TextureHandle, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial, Texture, TextureBinding } from "@aura3d/rendering";
import * as pngDecoder from "../../../../packages/engine/src/agent-api/PngTexturePixels";
import {
  acquireSharedProductionTextureImage,
  auraTextureRefPixels,
  bitmapRgbaPixels,
  loadProductionPrimitiveBitmap,
  PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS,
  prepareProductionTexturePixels,
  productionPrimitiveBitmapPixels,
  resetSharedProductionTextureDecodes
} from "../../../../packages/engine/src/agent-api/compiler/textures";
import { createProductionRuntimeBackgroundImage } from "../../../../packages/engine/src/agent-api/compiler/backgroundImage";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { upgradeCustomMaterialTextures } from "../../../../packages/engine/src/agent-api/compiler/customTextures";
import type { AuraCustomMaterialSpec, AuraSceneSnapshot, ProductionRuntimePrimitiveEntry } from "../../../../packages/engine/src/agent-api/nodes/types";

// Vitest's root rendering alias points at index.ts, so map this lazy subpath
// to its actual source rather than requiring a built rendering package.
vi.mock("@aura3d/rendering/extension-scalar-atlas", async () =>
  import("../../../../packages/rendering/src/extension-scalar-atlas")
);

// A valid 2x2 RGBA PNG; RGB remains meaningful at alpha 0 and 1.
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGP4IBjNwHOCnZHhnuLJercJe/8DADUDBxKxTfM3AAAAAElFTkSuQmCC",
  "base64"
));
const rgba = [
  240, 17, 91, 0, 12, 200, 7, 1,
  222, 33, 201, 127, 70, 144, 189, 255
];
const composite = [
  255, 17, 91, 255, 255, 200, 7, 255,
  255, 33, 201, 255, 255, 144, 189, 255
];
const assets = defineAuraAssets({
  map: { type: "texture", format: "png", url: "/transparent.png", hash: "fixture" },
  other: { type: "texture", format: "png", url: "/other.png", hash: "other" }
});
const actualDecode = pngDecoder.decodePngTexturePixels;

class FakeBitmap {
  readonly width = 2;
  readonly height = 2;
  readonly close = vi.fn();
}

let bitmaps: FakeBitmap[];
let ownedResources: { textureDisposer?: () => void }[];
let backgrounds: { dispose(): void }[];
let unblockers: (() => void)[];

beforeEach(() => {
  bitmaps = [];
  ownedResources = [];
  backgrounds = [];
  unblockers = [];
  vi.stubGlobal("ImageBitmap", FakeBitmap);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(png.slice(), { headers: { "content-type": "image/png" } })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => {
    const bitmap = new FakeBitmap();
    bitmaps.push(bitmap);
    return bitmap;
  }));
});

afterEach(() => {
  for (const unblock of unblockers) unblock();
  for (const value of ownedResources) value.textureDisposer?.();
  for (const background of backgrounds) background.dispose();
  resetSharedProductionTextureDecodes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function gate() {
  let unblock!: () => void;
  const promise = new Promise<void>((resolve) => { unblock = resolve; });
  unblockers.push(unblock);
  return { promise, unblock };
}

function resource(name: string, materialSpec: Record<string, unknown>) {
  const value = {
    name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none", textureWarnings: [] as string[], textureSlots: [] as string[],
    texturedMaterial: null as PBRMaterial | null, textureDisposer: undefined as (() => void) | undefined,
    textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined
  };
  ownedResources.push(value);
  return value;
}

const run = (values: ReturnType<typeof resource>[], warn: (message: string) => void = () => undefined) =>
  upgradeProductionPrimitiveTextures([{ resources: values }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn);

function boundTexture(value: ReturnType<typeof resource>, uniform: string): Texture {
  const binding = value.texturedMaterial?.getParameter(uniform);
  expect(binding).toBeInstanceOf(TextureBinding);
  expect((binding as TextureBinding).texture).toBeInstanceOf(Texture);
  return (binding as TextureBinding).texture!;
}

async function fallbackColor(name: string) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  class FallbackImage {
    readonly width = 2;
    readonly height = 2;
    decoding = "";
    src = "";
    async decode(): Promise<void> {}
  }
  vi.stubGlobal("ImageBitmap", undefined);
  vi.stubGlobal("Image", FallbackImage);
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:ref-fixture");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const color = resource(name, { texture: assets.map });
  const pending = run([color]);
  await vi.waitFor(() => expect(color.textureStage).toBe("decode /transparent.png"));
  await vi.advanceTimersByTimeAsync(PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS);
  await pending;
  vi.useRealTimers();
  const source = boundTexture(color, "u_baseColorTexture").source as HTMLImageElement & { close(): void };
  expect(source).toBeInstanceOf(FallbackImage);
  return { color, source, revoke };
}

test("GPU-only PNG maps share one image without starting the CPU decoder", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const first = resource("gpu", {
    texture: assets.map, normal: assets.map, occlusionMap: assets.map, emissiveMap: assets.map, clearcoatMap: assets.map
  });
  const second = resource("gpu-again", { texture: assets.map });
  await run([first, second]);

  expect([first.textureStatus, second.textureStatus]).toEqual(["textured", "textured"]);
  expect(first.textureSlots).toEqual(expect.arrayContaining(["baseColor", "normal", "occlusion", "emissive", "clearcoat"]));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(createImageBitmap).toHaveBeenCalledTimes(1);
  expect(decode).not.toHaveBeenCalled();
  const source = boundTexture(first, "u_baseColorTexture").source as ImageBitmap;
  expect(boundTexture(second, "u_baseColorTexture").source).toBe(source);
  expect(productionPrimitiveBitmapPixels.has(source)).toBe(false);
  expect(() => bitmapRgbaPixels(source)).toThrow(/must be prepared/);

  first.textureDisposer!();
  expect(bitmaps[0]!.close).not.toHaveBeenCalled();
  second.textureDisposer!();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
});

test("shared PNGs have a retryable preparation path for synchronous pixel readers", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels")
    .mockRejectedValueOnce(new Error("temporary PNG failure"))
    .mockImplementation(actualDecode);
  const held = acquireSharedProductionTextureImage("/transparent.png");
  const image = await held.image;
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source: image }));
  try {
    expect(decode).not.toHaveBeenCalled();
    expect(() => bitmapRgbaPixels(image)).toThrow(/await prepareProductionTexturePixels/);
    expect(() => auraTextureRefPixels(handle)).toThrow(/await prepareProductionTexturePixels/);
    await expect(prepareProductionTexturePixels(image)).rejects.toThrow("temporary PNG failure");
    expect(() => bitmapRgbaPixels(image)).toThrow(/await prepareProductionTexturePixels/);

    await Promise.all([prepareProductionTexturePixels(image), prepareProductionTexturePixels(image)]);
    expect(decode).toHaveBeenCalledTimes(2);
    expect([...bitmapRgbaPixels(image).data]).toEqual(rgba);
    expect([...auraTextureRefPixels(handle)!.data]).toEqual(rgba);
    held.release();
    expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
    await expect(prepareProductionTexturePixels(image)).rejects.toThrow(/released/);
  } finally {
    held.release();
    handle.dispose();
  }
});

test("an explicit cache lease keeps a shared image alive for a texture handle", async () => {
  const color = resource("leased-color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  const lease = acquireSharedProductionTextureImage("/transparent.png");
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  try {
    expect(await lease.image).toBe(source);
    color.textureDisposer!();
    expect(bitmaps[0]!.close).not.toHaveBeenCalled();
    const scalar = resource("leased-ref", { roughnessMap: handle, metalnessMap: handle });
    await run([scalar]);
    expect(scalar.textureStatus).toBe("textured");
    expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
    expect(fetch).toHaveBeenCalledTimes(1);
    lease.release();
    expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
    expect(() => auraTextureRefPixels(handle)).toThrow(/released/);
  } finally {
    lease.release();
    handle.dispose();
  }
});

test("color-first sharing does not wait for scalar pixels, which decode once and retain transparent channels", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels").mockImplementation(async (bytes) => {
    await paused.promise;
    return actualDecode(bytes);
  });
  const color = resource("first-color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;

  // One material uses the same URL for both GPU and CPU slots; another asks
  // for the same scalar data concurrently.
  const mixed = resource("mixed", { texture: assets.map, roughnessMap: assets.map, metalnessMap: assets.map });
  const scalar = resource("scalar", { roughnessMap: assets.map, metalnessMap: assets.map });
  const pending = run([mixed, scalar]);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  expect(mixed.textureStage).toBe("pixels /transparent.png");
  expect(scalar.textureStage).toBe("pixels /transparent.png");

  const laterColor = resource("later-color", { texture: assets.map });
  await run([laterColor]);
  expect(laterColor.textureStatus).toBe("textured");
  expect(boundTexture(laterColor, "u_baseColorTexture").source).toBe(source);
  expect(decode).toHaveBeenCalledTimes(1);

  paused.unblock();
  await pending;
  expect([mixed.textureStatus, scalar.textureStatus]).toEqual(["textured", "textured"]);
  expect([...boundTexture(mixed, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  const exact = bitmapRgbaPixels(source);
  expect([...exact.data]).toEqual(rgba);
  expect(bitmapRgbaPixels(source)).toBe(exact);

  const cached = resource("cached", { roughnessMap: assets.map, metalnessMap: assets.map });
  await run([cached]);
  expect([...boundTexture(cached, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(createImageBitmap).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);

  mixed.textureDisposer!();
  scalar.textureDisposer!();
  cached.textureDisposer!();
  laterColor.textureDisposer!();
  expect(bitmaps[0]!.close).not.toHaveBeenCalled();
  color.textureDisposer!();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  expect(productionPrimitiveBitmapPixels.has(source)).toBe(false);
});

test("a scalar acquired while the first color image is still decoding shares it without blocking color", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels").mockImplementation(async (bytes) => {
    await paused.promise;
    return actualDecode(bytes);
  });
  let land!: (image: ImageBitmap) => void;
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise<ImageBitmap>((resolve) => { land = resolve; })));
  const color = resource("color-in-flight", { texture: assets.map });
  const scalar = resource("scalar-in-flight", { roughnessMap: assets.map, metalnessMap: assets.map });
  const colorDone = run([color]);
  const scalarDone = run([scalar]);
  await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1));
  const image = new FakeBitmap();
  bitmaps.push(image);
  land(image as unknown as ImageBitmap);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(color.textureStatus).toBe("textured"));
  expect(scalar.textureStatus).toBe("pending");
  expect(scalar.textureStage).toBe("pixels /transparent.png");
  expect(fetch).toHaveBeenCalledTimes(1);

  paused.unblock();
  await Promise.all([colorDone, scalarDone]);
  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
});

test("scalar texture refs prepare an image previously acquired for color", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const color = resource("color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source, colorSpace: "linear" }));
  const scalar = resource("ref-scalar", { roughnessMap: handle, metalnessMap: handle });
  await run([scalar]);

  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect([...bitmapRgbaPixels(source).data]).toEqual(rgba);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  handle.dispose();
});

test("scalar texture refs prepare exact shared PNG pixels from a fallback image", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const { color, source, revoke } = await fallbackColor("fallback-ref-color");
  expect(decode).not.toHaveBeenCalled();
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalar = resource("fallback-ref-scalar", { roughnessMap: handle, metalnessMap: handle });
  await run([scalar]);

  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect([...auraTextureRefPixels(handle)!.data]).toEqual(rgba);
  expect([...bitmapRgbaPixels(source).data]).toEqual(rgba);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);

  color.textureDisposer!();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:ref-fixture");
  expect(() => bitmapRgbaPixels(source)).toThrow(/released/);
  expect(() => auraTextureRefPixels(handle)).toThrow(/released/);
  handle.dispose();
});

test("fallback-image refs also read exact PNG pixels already prepared by a URL consumer", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const { source } = await fallbackColor("fallback-cached-color");
  const scalarUrl = resource("fallback-cached-url", { roughnessMap: assets.map });
  await run([scalarUrl]);
  expect(scalarUrl.textureStatus).toBe("textured");
  expect([...bitmapRgbaPixels(source).data]).toEqual(rgba);

  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalarRef = resource("fallback-cached-ref", { roughnessMap: handle, metalnessMap: handle });
  await run([scalarRef]);
  expect(scalarRef.textureStatus).toBe("textured");
  expect([...boundTexture(scalarRef, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  handle.dispose();
});

test("fallback-image texture refs retry failed PNG preparation while the image is held", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels")
    .mockRejectedValueOnce(new Error("temporary ref PNG failure"))
    .mockImplementation(actualDecode);
  const { color, source, revoke } = await fallbackColor("fallback-retry-color");
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const failed = resource("fallback-ref-failed", { roughnessMap: handle });
  const warn = vi.fn();
  await run([failed], warn);
  expect(failed.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("temporary ref PNG failure"));
  expect(revoke).not.toHaveBeenCalled();
  expect(() => auraTextureRefPixels(handle)).toThrow(/must be prepared/);

  const retry = resource("fallback-ref-retry", { roughnessMap: handle, metalnessMap: handle });
  await run([retry]);
  expect(retry.textureStatus).toBe("textured");
  expect([...boundTexture(retry, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(decode).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(1);
  color.textureDisposer!();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:ref-fixture");
  handle.dispose();
});

test("a fallback image released during ref pixel preparation cannot be resurrected", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels").mockImplementation(async (bytes) => {
    await paused.promise;
    return actualDecode(bytes);
  });
  const { color, source, revoke } = await fallbackColor("fallback-in-flight-color");
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalar = resource("fallback-in-flight-ref", { roughnessMap: handle });
  const warn = vi.fn();
  const pending = run([scalar], warn);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  color.textureDisposer!();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:ref-fixture");
  paused.unblock();
  await pending;
  expect(scalar.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("released while preparing pixels"));
  expect(productionPrimitiveBitmapPixels.has(source)).toBe(false);
  expect(() => bitmapRgbaPixels(source)).toThrow(/released/);
  handle.dispose();
});

test("scalar texture refs prepare exact shared PNG pixels from a foreign bitmap", async () => {
  class ForeignBitmap {
    readonly width = 2;
    readonly height = 2;
    readonly close = vi.fn();
  }
  const foreign = new ForeignBitmap();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => foreign));
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const color = resource("foreign-color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  expect(source).toBe(foreign);
  expect(source).not.toBeInstanceOf(FakeBitmap);
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalar = resource("foreign-ref-scalar", { roughnessMap: handle, metalnessMap: handle });
  await run([scalar]);

  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect([...auraTextureRefPixels(handle)!.data]).toEqual(rgba);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  color.textureDisposer!();
  expect(foreign.close).toHaveBeenCalledTimes(1);
  expect(() => auraTextureRefPixels(handle)).toThrow(/released/);
  handle.dispose();
});

test("unmanaged bitmap and canvas refs keep their existing readback; video remains unsupported", () => {
  class FakeCanvas {
    readonly width = 2;
    readonly height = 2;
  }
  const drawImage = vi.fn();
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage, getImageData: () => ({ data: Uint8ClampedArray.from(rgba) }) })
    })
  });
  const bitmap = new FakeBitmap();
  const canvas = new FakeCanvas();
  const video = { width: 2, height: 2 };
  const handles = [bitmap, canvas, video].map((source) => new TextureHandle(new Texture({
    width: 2, height: 2, source: source as unknown as TexImageSource
  })));
  expect([...auraTextureRefPixels(handles[0]!)!.data]).toEqual(rgba);
  expect([...auraTextureRefPixels(handles[1]!)!.data]).toEqual(rgba);
  expect(auraTextureRefPixels(handles[2]!)).toBeUndefined();
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
  expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0);
  for (const handle of handles) handle.dispose();
});

test.each([false, true])("released shared PNG refs fail closed without canvas readback (previously prepared: %s)", async (prepared) => {
  const color = resource("released-color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  if (prepared) {
    const firstScalar = resource("first-scalar", { roughnessMap: handle });
    await run([firstScalar]);
    expect(firstScalar.textureStatus).toBe("textured");
  }
  color.textureDisposer!();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);

  const drawImage = vi.fn();
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage, getImageData: () => ({ data: new Uint8ClampedArray(16) }) })
    })
  });
  expect(() => bitmapRgbaPixels(source)).toThrow(/released/);
  expect(() => auraTextureRefPixels(handle)).toThrow(/released/);
  const stale = resource("stale-ref", { roughnessMap: handle });
  const warn = vi.fn();
  await run([stale], warn);
  expect(stale.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/released/));
  const staleGpu = resource("stale-gpu-ref", { texture: handle });
  await run([staleGpu], warn);
  expect(staleGpu.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(/released shared texture image/));
  expect(drawImage).not.toHaveBeenCalled();
  handle.dispose();
});

test("a custom shader and a later scalar map share one image without eager CPU decoding", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const custom: AuraCustomMaterialSpec = {
    glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)); }" },
    uniforms: { map: { type: "texture2d", value: assets.map } }
  } as unknown as AuraCustomMaterialSpec;
  const material = createCustomShaderMaterial(custom, "custom");
  const customResource = {
    name: "custom", material, materialSpec: { kind: "custom", custom },
    textureWarnings: [] as string[], textureDisposer: undefined as (() => void) | undefined
  };
  ownedResources.push(customResource);
  await upgradeCustomMaterialTextures(
    [{ resources: [customResource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[],
    () => undefined
  );
  expect(customResource.textureWarnings).toEqual([]);
  expect(decode).not.toHaveBeenCalled();

  const scalar = resource("scalar", { roughnessMap: assets.map, metalnessMap: assets.map });
  await run([scalar]);
  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  scalar.textureDisposer!();
  expect(bitmaps[0]!.close).not.toHaveBeenCalled();
  customResource.textureDisposer!();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  material.dispose();
});

test("the image-element fallback also shares lazy, exact PNG data with scalar maps", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  class FallbackImage {
    readonly width = 2;
    readonly height = 2;
    decoding = "";
    src = "";
    async decode(): Promise<void> {}
  }
  vi.stubGlobal("Image", FallbackImage);
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const color = resource("fallback-color", { texture: assets.map });
  const pending = run([color]);
  await vi.waitFor(() => expect(color.textureStage).toBe("decode /transparent.png"));
  await vi.advanceTimersByTimeAsync(PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS);
  await pending;
  expect(color.textureStatus).toBe("textured");
  expect(boundTexture(color, "u_baseColorTexture").source).toBeInstanceOf(FallbackImage);
  expect(decode).not.toHaveBeenCalled();

  const scalar = resource("fallback-scalar", { roughnessMap: assets.map, metalnessMap: assets.map });
  await run([scalar]);
  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  color.textureDisposer!();
  expect(revoke).not.toHaveBeenCalled();
  scalar.textureDisposer!();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fixture");
});

test("the scalar extension atlas keeps all four transparent PNG channels", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const value = resource("atlas", {
    texture: assets.map, clearcoatMap: assets.map, sheenRoughnessMap: assets.map, iridescenceMap: assets.map
  });
  await run([value]);
  expect(value.textureStatus).toBe("textured");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(1);
  const atlas = boundTexture(value, "u_extensionScalarAtlas");
  for (const slot of ["clearcoat", "sheenRoughness", "iridescence"]) {
    const rect = value.texturedMaterial!.getParameter(`u_${slot}AtlasRect`) as readonly number[];
    const y = value.texturedMaterial!.getParameter(`u_${slot}AtlasY`) as number;
    for (let row = 0; row < 2; row++) {
      const offset = ((y + row) * atlas.width + rect[0]!) * 4;
      expect([...atlas.data!.slice(offset, offset + 8)]).toEqual(rgba.slice(row * 8, row * 8 + 8));
    }
  }
});

test("the scalar atlas also prepares PNG-backed texture refs from an earlier color use", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const color = resource("color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const value = resource("atlas-refs", {
    clearcoatNormalMap: assets.other, sheenColorMap: assets.other, iridescenceMap: assets.other,
    clearcoatMap: handle, sheenRoughnessMap: handle, iridescenceThicknessMap: handle
  });
  await run([value]);
  expect(value.textureStatus).toBe("textured");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(decode).toHaveBeenCalledTimes(2);
  const atlas = boundTexture(value, "u_extensionScalarAtlas");
  for (const slot of ["clearcoat", "sheenRoughness", "iridescenceThickness"]) {
    const rect = value.texturedMaterial!.getParameter(`u_${slot}AtlasRect`) as readonly number[];
    const y = value.texturedMaterial!.getParameter(`u_${slot}AtlasY`) as number;
    for (let row = 0; row < 2; row++) {
      const offset = ((y + row) * atlas.width + rect[0]!) * 4;
      expect([...atlas.data!.slice(offset, offset + 8)]).toEqual(rgba.slice(row * 8, row * 8 + 8));
    }
  }
  handle.dispose();
});

test("the scalar atlas prepares exact PNG pixels from fallback-image texture refs", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const { source } = await fallbackColor("fallback-atlas-color");
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => {
    const bitmap = new FakeBitmap();
    bitmaps.push(bitmap);
    return bitmap;
  }));
  const value = resource("fallback-atlas-refs", {
    clearcoatNormalMap: assets.other, sheenColorMap: assets.other, iridescenceMap: assets.other,
    clearcoatMap: handle, sheenRoughnessMap: handle, iridescenceThicknessMap: handle
  });
  await run([value]);
  expect(value.textureStatus).toBe("textured");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(decode).toHaveBeenCalledTimes(2);
  const atlas = boundTexture(value, "u_extensionScalarAtlas");
  for (const slot of ["clearcoat", "sheenRoughness", "iridescenceThickness"]) {
    const rect = value.texturedMaterial!.getParameter(`u_${slot}AtlasRect`) as readonly number[];
    const y = value.texturedMaterial!.getParameter(`u_${slot}AtlasY`) as number;
    for (let row = 0; row < 2; row++) {
      const offset = ((y + row) * atlas.width + rect[0]!) * 4;
      expect([...atlas.data!.slice(offset, offset + 8)]).toEqual(rgba.slice(row * 8, row * 8 + 8));
    }
  }
  handle.dispose();
});

test("an equirectangular background keeps the direct loader's eager pixel contract", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const background = createProductionRuntimeBackgroundImage({
    backgroundImage: { texture: "/transparent.png" }
  } as unknown as AuraSceneSnapshot, vi.fn())!;
  backgrounds.push(background);
  await vi.waitFor(() => expect(background.current()).toBeDefined());
  const source = background.current()!.texture.texture!.source as ImageBitmap;
  expect([...bitmapRgbaPixels(source).data]).toEqual(rgba);
  expect(decode).toHaveBeenCalledTimes(1);
  background.dispose();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
});

test("a cube background still eagerly reads exact PNG pixels and closes all six images", async () => {
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const background = createProductionRuntimeBackgroundImage({
    backgroundImage: { cube: { faces: Array(6).fill("/transparent.png") } }
  } as unknown as AuraSceneSnapshot, vi.fn())!;
  backgrounds.push(background);
  await vi.waitFor(() => expect(background.current()).toBeDefined());

  const texture = background.current()!.texture.texture!;
  expect(texture.cubeFaces).toHaveLength(6);
  for (const face of texture.cubeFaces) expect([...face.mipLevels[0]!.data]).toEqual(rgba);
  expect(decode).toHaveBeenCalledTimes(6);
  background.dispose();
  expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});

test("a failed cube face closes completed and late-arriving sibling images", async () => {
  let fail!: () => void;
  let finishLate!: () => void;
  vi.mocked(fetch).mockImplementation((url) => {
    if (url === "/failed.png") return new Promise<Response>((resolve) => { fail = () => resolve(new Response("missing", { status: 404 })); });
    if (url === "/late.png") return new Promise<Response>((resolve) => { finishLate = () => resolve(new Response(png.slice())); });
    return Promise.resolve(new Response(png.slice()));
  });
  const warn = vi.fn();
  const background = createProductionRuntimeBackgroundImage({
    backgroundImage: { cube: { faces: ["/a.png", "/b.png", "/failed.png", "/c.png", "/d.png", "/late.png"] } }
  } as unknown as AuraSceneSnapshot, warn)!;
  backgrounds.push(background);
  await vi.waitFor(() => expect(bitmaps).toHaveLength(4));
  fail();
  await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("status 404")));
  expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
  finishLate();
  await vi.waitFor(() => expect(bitmaps).toHaveLength(5));
  await vi.waitFor(() => expect(bitmaps[4]!.close).toHaveBeenCalledTimes(1));
  expect(background.current()).toBeUndefined();
  background.dispose();
  expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});

test("disposing a pending cube background closes completed and later faces once", async () => {
  let finishLate!: () => void;
  vi.mocked(fetch).mockImplementation((url) => {
    if (url === "/late.png") return new Promise<Response>((resolve) => { finishLate = () => resolve(new Response(png.slice())); });
    return Promise.resolve(new Response(png.slice()));
  });
  const warn = vi.fn();
  const background = createProductionRuntimeBackgroundImage({
    backgroundImage: { cube: { faces: ["/a.png", "/b.png", "/c.png", "/d.png", "/e.png", "/late.png"] } }
  } as unknown as AuraSceneSnapshot, warn)!;
  backgrounds.push(background);
  await vi.waitFor(() => expect(bitmaps).toHaveLength(5));
  background.dispose();
  await vi.waitFor(() => expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true));
  finishLate();
  await vi.waitFor(() => expect(bitmaps).toHaveLength(6));
  await vi.waitFor(() => expect(bitmaps[5]!.close).toHaveBeenCalledTimes(1));
  expect(background.current()).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
});

test("unsupported PNG layouts retain the existing canvas fallback for scalar maps", async () => {
  const unsupported = png.slice();
  unsupported[25] = 3;
  vi.mocked(fetch).mockImplementation(async () => new Response(unsupported));
  const drawImage = vi.fn();
  const fallbackPixels = Uint8ClampedArray.from(rgba);
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage, getImageData: () => ({ data: fallbackPixels }) })
    }))
  });
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const value = resource("canvas-fallback", { roughnessMap: assets.map, metalnessMap: assets.map });
  await run([value]);
  expect(value.textureStatus).toBe("textured");
  expect([...boundTexture(value, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(drawImage).toHaveBeenCalled();
});

test("unsupported shared PNG layouts still use canvas for fallback-image texture refs", async () => {
  const unsupported = png.slice();
  unsupported[25] = 3;
  vi.mocked(fetch).mockImplementation(async () => new Response(unsupported.slice()));
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const { source } = await fallbackColor("unsupported-ref-color");
  const drawImage = vi.fn();
  const canvasPixels = Uint8ClampedArray.from([
    0, 0, 0, 0, 0, 0, 0, 1,
    220, 32, 200, 127, 70, 144, 189, 255
  ]);
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage, getImageData: () => ({ data: canvasPixels }) })
    })
  });
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalar = resource("unsupported-ref-scalar", { roughnessMap: handle, metalnessMap: handle });
  await run([scalar]);
  expect(scalar.textureStatus).toBe("textured");
  expect([...boundTexture(scalar, "u_metallicRoughnessTexture").data!]).toEqual([
    255, 0, 0, 255, 255, 0, 0, 255,
    255, 32, 200, 255, 255, 144, 189, 255
  ]);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
  handle.dispose();
});

test("CPU decode errors reach scalar users, leave a color holder alive, and can be retried", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels")
    .mockImplementationOnce(async () => {
      await paused.promise;
      throw new Error("broken data pixels");
    })
    .mockImplementation(actualDecode);
  const color = resource("color", { texture: assets.map });
  await run([color]);
  const failed = resource("failed", { roughnessMap: assets.map });
  const failedAgain = resource("failed-again", { metalnessMap: assets.map });
  const warn = vi.fn();
  const pending = run([failed, failedAgain], warn);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  paused.unblock();
  await pending;
  expect([failed.textureStatus, failedAgain.textureStatus]).toEqual(["fallback", "fallback"]);
  expect([failed.textureStage, failedAgain.textureStage]).toEqual(["failed", "failed"]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("broken data pixels"));
  expect(color.textureStatus).toBe("textured");
  expect(bitmaps[0]!.close).not.toHaveBeenCalled();

  const retry = resource("retry", { roughnessMap: assets.map, metalnessMap: assets.map });
  await run([retry]);
  expect(retry.textureStatus).toBe("textured");
  expect([...boundTexture(retry, "u_metallicRoughnessTexture").data!]).toEqual(composite);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(decode).toHaveBeenCalledTimes(2);
});

test("an eager direct-load CPU error closes its image and rejects", async () => {
  vi.spyOn(pngDecoder, "decodePngTexturePixels").mockRejectedValueOnce(new Error("broken PNG"));
  await expect(loadProductionPrimitiveBitmap("/transparent.png")).rejects.toThrow("broken PNG");
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  expect(productionPrimitiveBitmapPixels.has(bitmaps[0] as unknown as ImageBitmap)).toBe(false);
});

test("disposal during a pending scalar decode closes once and drops cached pixels", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels").mockImplementation(async (bytes) => {
    await paused.promise;
    return actualDecode(bytes);
  });
  const value = resource("disposed", { roughnessMap: assets.map });
  const warn = vi.fn();
  const pending = run([value], warn);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  value.material.dispose();
  paused.unblock();
  await pending;
  expect(value.textureStatus).toBe("none");
  expect(value.textureStage).toBe("cancelled");
  expect(value.texturePendingSince).toBeUndefined();
  expect(warn).not.toHaveBeenCalled();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  expect(productionPrimitiveBitmapPixels.has(bitmaps[0] as unknown as ImageBitmap)).toBe(false);
});

test("a released image cannot be resurrected by an in-flight texture-ref pixel decode", async () => {
  const paused = gate();
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels").mockImplementation(async (bytes) => {
    await paused.promise;
    return actualDecode(bytes);
  });
  const color = resource("color", { texture: assets.map });
  await run([color]);
  const source = boundTexture(color, "u_baseColorTexture").source as ImageBitmap;
  const handle = new TextureHandle(new Texture({ width: 2, height: 2, source }));
  const scalar = resource("ref-scalar", { roughnessMap: handle });
  const warn = vi.fn();
  const pending = run([scalar], warn);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  color.textureDisposer!();
  expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1);
  paused.unblock();
  await pending;
  expect(scalar.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("released while preparing pixels"));
  expect(productionPrimitiveBitmapPixels.has(source)).toBe(false);
  handle.dispose();
});

test("an abandoned shared handle does not leave an unhandled derived rejection", async () => {
  let reject!: (error: Error) => void;
  const handle = acquireSharedProductionTextureImage("/abandoned.png", undefined, () =>
    new Promise((_resolve, rejectPromise) => { reject = rejectPromise; })
  );
  handle.release();
  reject(new Error("abandoned fetch failure"));
  // Give the rejection a full event-loop turn; Vitest reports unhandled rejections.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

test("an abandoned shared handle closes a late successful image without an unhandled rejection", async () => {
  let land!: (image: ImageBitmap) => void;
  const handle = acquireSharedProductionTextureImage("/late.png", undefined, () =>
    new Promise((resolve) => { land = resolve; })
  );
  handle.release();
  const image = new FakeBitmap();
  land(image as unknown as ImageBitmap);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(image.close).toHaveBeenCalledTimes(1);
});
