import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial, type Texture } from "@aura3d/rendering";
import {
  acquireSharedProductionTextureImage,
  resetSharedProductionTextureDecodes,
  sharedProductionTextureDecodeStats
} from "../../../../packages/engine/src/agent-api/compiler/textures";
import { upgradeCustomMaterialTextures } from "../../../../packages/engine/src/agent-api/compiler/customTextures";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import type { AuraCustomMaterialSpec, ProductionRuntimePrimitiveEntry } from "../../../../packages/engine/src/agent-api/nodes/types";

/**
 * GU47 e6 phase 8 (shared decodes): Bunker Zero builds 188 textured materials over ~20 map URLs, and each material used
 * to fetch and decode its own copy of every map. Decodes are now shared per URL (refcounted), and a material's maps
 * start decoding together.
 *
 * Native 5.0: typed assets go through the policy transport, which verifies the declared SHA-256 before decoding, so
 * each fixture declares the real digest of the bytes its fetch stub serves (every stub serves the same JPG bytes).
 */
const JPG_BYTES = [0xff, 0xd8, 0xff, 0xd9];
const JPG_SHA256 = createHash("sha256").update(Uint8Array.from(JPG_BYTES)).digest("hex");
const assets = defineAuraAssets({
  color: { type: "texture", format: "jpg", url: "/bz-color.jpg", hash: JPG_SHA256 },
  normal: { type: "texture", format: "jpg", url: "/bz-normal.jpg", hash: JPG_SHA256 },
  ao: { type: "texture", format: "jpg", url: "/bz-ao.jpg", hash: JPG_SHA256 },
  glow: { type: "texture", format: "jpg", url: "/bz-glow.jpg", hash: JPG_SHA256 }
});

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn>; closed: boolean; url: string };

let bitmaps: FakeBitmap[] = [];

function stubBrowser(fetchImpl?: (url: string) => Promise<Response>) {
  bitmaps = [];
  const fetchMock = vi.fn(fetchImpl ?? (async (url: string) => new Response(Uint8Array.from(JPG_BYTES), { headers: { "x-url": url } })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => {
    const value: FakeBitmap = { width: 4, height: 4, closed: false, url: "", close: vi.fn(() => { value.closed = true; }) };
    bitmaps.push(value);
    return value;
  }));
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSharedProductionTextureDecodes();
});

function resource(name: string, materialSpec: Record<string, unknown>) {
  return { name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } }, textureStatus: "none",
    textureWarnings: [] as string[], textureSlots: [] as string[], texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined, textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined };
}

const run = (values: ReturnType<typeof resource>[]) =>
  upgradeProductionPrimitiveTextures([{ resources: values }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], () => undefined);

const baseColorOf = (value: ReturnType<typeof resource>): Texture | undefined => {
  const material = value.texturedMaterial as unknown as { baseColorTexture?: Texture; getParameter(name: string): unknown };
  return material.baseColorTexture ?? (material.getParameter("u_baseColorTexture") as { texture?: Texture } | undefined)?.texture;
};

test("N materials referencing the same two URLs fetch and decode each URL once", async () => {
  const fetchMock = stubBrowser();
  const values = Array.from({ length: 24 }, (_, index) => resource(`wall-${index}`, { texture: assets.color, normal: assets.normal }));
  await run(values);
  expect(values.every((value) => value.textureStatus === "textured")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(["/bz-color.jpg", "/bz-normal.jpg"]);
  expect(createImageBitmap).toHaveBeenCalledTimes(2);
  expect(sharedProductionTextureDecodeStats.decodes).toBe(2);
  // Each material owns its own GPU texture; the decoded source image is the shared one.
  const textures = values.map(baseColorOf);
  expect(new Set(textures).size).toBe(values.length);
  expect(new Set(textures.map((texture) => texture?.source)).size).toBe(1);
});

test("the maps of one material start decoding together, not one after another", async () => {
  const gates = new Map<string, () => void>();
  const fetchMock = stubBrowser((url) => new Promise<Response>((resolve) => {
    gates.set(url, () => resolve(new Response(Uint8Array.from(JPG_BYTES))));
  }));
  const value = resource("panel", { texture: assets.color, normal: assets.normal, occlusionMap: assets.ao, emissiveMap: assets.glow });
  const done = run([value]);
  // All four fetches are in flight before any one of them has finished.
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(gates.size).toBe(4);
  expect(value.textureStage?.split("; ").map((step) => step.split(" ")[0])).toEqual(["fetch", "fetch", "fetch", "fetch"]);
  for (const open of gates.values()) open();
  await done;
  expect(value.textureStatus).toBe("textured");
  expect(value.textureSlots).toEqual(expect.arrayContaining(["baseColor", "normal", "occlusion", "emissive"]));
});

test("disposal closes the shared image only after the last holder, and never hands out a closed image", async () => {
  const fetchMock = stubBrowser();
  const first = resource("first", { texture: assets.color });
  const second = resource("second", { texture: assets.color });
  await run([first, second]);
  expect(bitmaps).toHaveLength(1);
  const shared = bitmaps[0]!;
  expect(baseColorOf(first)?.source).toBe(shared);
  expect(baseColorOf(second)?.source).toBe(shared);

  first.textureDisposer!();
  expect(shared.closed).toBe(false);
  expect(baseColorOf(second)?.source).toBe(shared);
  second.textureDisposer!();
  expect(shared.close).toHaveBeenCalledTimes(1);

  // A material created after every holder left decodes afresh: it never receives the closed image.
  const third = resource("third", { texture: assets.color });
  await run([third]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(bitmaps).toHaveLength(2);
  const source = baseColorOf(third)?.source as FakeBitmap | undefined;
  expect(source).toBe(bitmaps[1]);
  expect(source?.closed).toBe(false);
});

test("a decode whose every holder left before it landed is closed on arrival and not reused", async () => {
  let land: (value: FakeBitmap) => void = () => undefined;
  const late: FakeBitmap = { width: 4, height: 4, closed: false, url: "", close: vi.fn(() => { late.closed = true; }) };
  const loader = vi.fn((_url: string) => new Promise<FakeBitmap>((resolve) => { land = resolve; }));
  const held = acquireSharedProductionTextureImage("/bz-color.jpg", undefined, loader as never);
  held.image.catch(() => undefined);
  held.release();
  land(late);
  await Promise.resolve();
  await Promise.resolve();
  expect(late.close).toHaveBeenCalledTimes(1);
  const fresh: FakeBitmap = { width: 4, height: 4, closed: false, url: "", close: vi.fn() };
  const next = acquireSharedProductionTextureImage("/bz-color.jpg", undefined, async () => fresh as never);
  expect(await next.image).toBe(fresh);
  expect(loader).toHaveBeenCalledTimes(1);
  next.release();
  expect(fresh.close).toHaveBeenCalledTimes(1);
});

test("a failed decode leaves the cache, so the next material retries", async () => {
  let attempt = 0;
  stubBrowser(async () => (attempt++ === 0 ? new Response("absent", { status: 404 }) : new Response(Uint8Array.from(JPG_BYTES))));
  const failed = resource("failed", { texture: assets.color });
  await run([failed]);
  expect(failed.textureStatus).toBe("fallback");
  const retried = resource("retried", { texture: assets.color });
  await run([retried]);
  expect(retried.textureStatus).toBe("textured");
});

test("custom-material asset textures share the decode with PBR maps and load their uniforms together", async () => {
  const fetchMock = stubBrowser();
  const custom: AuraCustomMaterialSpec = {
    glsl: { fragment: "out vec4 outColor;\nvoid main() { outColor = texture(map, vec2(0.5)) + texture(mask, vec2(0.5)); }" },
    uniforms: {
      // Native 5.0: the typed refs themselves (format + digest), so the custom uniforms carry the same request
      // identity as the PBR map and may share its decode. Hand-built refs without a format are rejected, and refs
      // without the digest are a different identity (integrity is part of it), so they would not share.
      map: { type: "texture2d", value: assets.color },
      mask: { type: "texture2d", value: assets.ao }
    }
  } as unknown as AuraCustomMaterialSpec;
  const material = createCustomShaderMaterial(custom, "primitive-box");
  const customResource = { name: "screen", material, materialSpec: { kind: "custom", custom }, textureWarnings: [] as string[], textureDisposer: undefined as (() => void) | undefined };
  const pbr = resource("wall", { texture: assets.color });
  await Promise.all([
    run([pbr]),
    upgradeCustomMaterialTextures([{ resources: [customResource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[], () => undefined)
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(pbr.textureStatus).toBe("textured");
  expect(customResource.textureWarnings).toEqual([]);
  const shared = baseColorOf(pbr)?.source as FakeBitmap;
  pbr.textureDisposer!();
  expect(shared.closed).toBe(false);
  customResource.textureDisposer!();
  expect(shared.closed).toBe(true);
  material.dispose();
});
