import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { PBRMaterial, TexturedPBRMaterial } from "@aura3d/rendering";
import { PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS, loadProductionPrimitiveBitmap } from "../../../../packages/engine/src/agent-api/compiler/textures";
import { Texture } from "../../../../packages/rendering/src/Texture";
import { WebGL2TextureRegistry } from "../../../../packages/rendering/src/webgl2/TextureUpload";
import type { WebGL2DeviceHost } from "../../../../packages/rendering/src/webgl2/DeviceHost";

/**
 * GU47 e6 phase 7 (g09 texPending): on the loaded software-WebGL2 runner `createImageBitmap` did not settle, so textured
 * upgrades sat pending for the whole capture. A decode that does not settle within PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS
 * now falls back to an `<img>` decode of the same blob, uploaded with the same unpack settings as the bitmap.
 */
// Native 5.0: the policy transport verifies the declared digest, so declare the real SHA-256 of the served bytes.
const JPG_BYTES = [0xff, 0xd8, 0xff, 0xd9];
const JPG_SHA256 = createHash("sha256").update(Uint8Array.from(JPG_BYTES)).digest("hex");
const assets = defineAuraAssets({ map: { type: "texture", format: "jpg", url: "/map.jpg", hash: JPG_SHA256 } });

class FakeImage {
  static created: FakeImage[] = [];
  decoding = "";
  src = "";
  width = 4;
  height = 2;
  constructor() { FakeImage.created.push(this); }
  async decode(): Promise<void> {}
}

function bitmap() { return { width: 4, height: 2, close: vi.fn() }; }

function stubBrowser(createImageBitmapImpl: () => Promise<unknown>) {
  FakeImage.created = [];
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(JPG_BYTES))));
  vi.stubGlobal("createImageBitmap", vi.fn(createImageBitmapImpl));
  vi.stubGlobal("Image", FakeImage);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function resource(name: string) {
  const materialSpec = { texture: assets.map };
  return { name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } }, textureStatus: "none",
    textureWarnings: [] as string[], textureSlots: [] as string[], texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined, textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined };
}

test("a createImageBitmap that never settles falls back to an <img> decode and the upgrade lands", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubBrowser(() => new Promise(() => undefined));
  const value = resource("stalled-decode");
  const done = upgradeProductionPrimitiveTextures([{ resources: [value] }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], () => undefined);
  await vi.waitFor(() => expect(value.textureStage).toBe("decode /map.jpg"));
  await vi.advanceTimersByTimeAsync(PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS);
  await done;
  expect(value.textureStatus).toBe("textured");
  expect(value.textureStage).toBe("done");
  expect(FakeImage.created).toHaveLength(1);
  expect(FakeImage.created[0]!.src).toBe("blob:fixture");
  const material = value.texturedMaterial as unknown as TexturedPBRMaterial;
  const baseColor = (material as unknown as { baseColorTexture?: Texture }).baseColorTexture
    ?? (material.getParameter("u_baseColorTexture") as { texture?: Texture } | undefined)?.texture;
  expect(baseColor?.source).toBe(FakeImage.created[0]);
  expect(baseColor?.flipY).toBe(false);
  expect([baseColor?.width, baseColor?.height]).toEqual([4, 2]);
});

test("a healthy createImageBitmap keeps the bitmap path and never builds an <img>", async () => {
  const decoded = bitmap();
  stubBrowser(async () => decoded);
  expect(await loadProductionPrimitiveBitmap("/map.jpg")).toBe(decoded);
  expect(FakeImage.created).toHaveLength(0);
});

test("a bitmap that settles after the fallback won is closed, not leaked", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let settle: (value: unknown) => void = () => undefined;
  stubBrowser(() => new Promise((resolve) => { settle = resolve; }));
  const steps: string[] = [];
  const loading = loadProductionPrimitiveBitmap("/map.jpg", (step) => steps.push(step));
  await vi.advanceTimersByTimeAsync(PRIMITIVE_TEXTURE_DECODE_FALLBACK_MS);
  const image = await loading;
  expect(image).toBe(FakeImage.created[0]);
  expect(steps).toEqual(["fetch", "body", "decode", "decode-fallback", "pixels"]);
  const late = bitmap();
  settle(late);
  await Promise.resolve();
  await Promise.resolve();
  expect(late.close).toHaveBeenCalledTimes(1);
  image.close();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
});

test("an <img> source uploads with no premultiply, no colour-space conversion and no flip (the bitmap's settings)", () => {
  const state = new Map<number, unknown>();
  const atUpload: Record<string, unknown>[] = [];
  const gl = {
    TEXTURE_2D: 0x0de1, RGBA: 0x1908, RGBA8: 0x8058, SRGB8_ALPHA8: 0x8c43, UNSIGNED_BYTE: 0x1401, NONE: 0,
    TEXTURE_BASE_LEVEL: 0x813c, TEXTURE_MAX_LEVEL: 0x813d,
    UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243, BROWSER_DEFAULT_WEBGL: 0x9244,
    createTexture: () => ({}), bindTexture: () => undefined, texParameteri: () => undefined, generateMipmap: () => undefined,
    pixelStorei: (name: number, value: unknown) => { state.set(name, value); },
    texImage2D: (...args: unknown[]) => {
      // GLboolean: native 5.0 passes 0/1, 4.7.x passed false/true; both mean the same unpack state.
      atUpload.push({ source: args[5], flipY: Number(state.get(0x9240)), premultiply: Number(state.get(0x9241)), colorspace: state.get(0x9243) });
    },
    getExtension: () => null, getParameter: () => 4096
  } as unknown as WebGL2RenderingContext;
  const host = { gl, stateCache: { invalidate: () => undefined }, counters: { releasedTextureHandles: 0 }, textureBudgetPolicy: undefined,
    lifecycle: { readError: () => null } } as unknown as WebGL2DeviceHost;
  const image = new FakeImage() as unknown as HTMLImageElement;
  new WebGL2TextureRegistry(host).getTextureHandle(new Texture({ width: 4, height: 2, source: image, colorSpace: "srgb", label: "fallback-basecolor" }));
  expect(atUpload).toEqual([{ source: image, flipY: 0, premultiply: 0, colorspace: 0 }]);
});
