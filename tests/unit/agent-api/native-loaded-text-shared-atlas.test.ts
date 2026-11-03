import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBuiltinGlyphAtlasScope, isBuiltinGlyphResource, retainBuiltinGlyphResource,
  type BuiltinGlyphAtlasScope, type BuiltinGlyphLease
} from "../../../packages/engine/src/agent-api/compiler/BuiltinGlyphAtlas";
import {
  createProductionRuntimePrimitiveEntries, resolveProductionPrimitiveRuntimeState,
  selectProductionPrimitiveResource
} from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createSdfTextPrimitiveResource, retireSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { rootSdfFontAtlas, text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { AuraPrimitiveNode, ProductionRuntimePrimitiveResource } from "../../../packages/engine/src/agent-api/nodes/types";
import { createSdfTextQuadMesh, type SdfTextRasterImage } from "../../../packages/rendering/src/SdfText";
import type { LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const font: LoadedFont = {
  family: "AuraFont1", metadata: { family: "Fixture font", license: "OFL-1.1", licenseUrl: "https://example.org/license" },
  disposed: false, dispose() {}
};
const measured: string[] = [];
class MockCanvas {
  width = 1;
  height = 1;
  readonly ctx = {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", textBaseline: "middle", textAlign: "left", fillStyle: "",
    measureText(text: string) { measured.push(text); return { width: [...text].length * 8 }; },
    fillText() {},
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let y = 4; y < this.height - 4; y += 1) for (let x = 5; x < this.width - 5; x += 1) {
        if (y % 20 < 12) data[(y * this.width + x) * 4 + 3] = 255;
      }
      return { data };
    }
  };
  getContext() { return this.ctx; }
}

beforeAll(() => { rootSdfFontAtlas(); });
beforeEach(() => { measured.length = 0; vi.stubGlobal("OffscreenCanvas", MockCanvas); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function node(text: string): AuraPrimitiveNode {
  return text3D(text, { font, rasterSize: 32, sdfGlyphAtlas: "shared" }).toJSON();
}

function boundTexture(resource: ProductionRuntimePrimitiveResource) {
  return (resource.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
}

function atlasPixels(scope: BuiltinGlyphAtlasScope): Uint8Array {
  const data = scope.texture.getMipLevel(0)?.data;
  if (!(data instanceof Uint8Array)) throw new Error("Expected RGBA8 atlas bytes");
  return data;
}

function imageAt(scope: BuiltinGlyphAtlasScope, lease: BuiltinGlyphLease): Uint8Array {
  const { x, y, width, height } = lease.rect;
  const data = atlasPixels(scope);
  const result = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * scope.texture.width + x) * 4;
    result.set(data.subarray(start, start + width * 4), row * width * 4);
  }
  return result;
}

function recordingScope(scope: BuiltinGlyphAtlasScope, leases: BuiltinGlyphLease[]): BuiltinGlyphAtlasScope {
  return {
    get texture() { return scope.texture; }, get sampler() { return scope.sampler; },
    isOpen: () => scope.isOpen(), acquire: (glyph) => scope.acquire(glyph),
    tryAcquireLabel: (image) => {
      const lease = scope.tryAcquireLabel!(image);
      if (lease) leases.push(lease);
      return lease;
    },
    hold: () => scope.hold!(),
    flush: () => scope.flush(), dispose: () => scope.dispose(), whenDisposed: () => scope.whenDisposed()
  };
}

describe("shared shaped-label snapshots", () => {
  it("shares a texture without changing snapshot pixels or run UVs", async () => {
    const base = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const leases: BuiltinGlyphLease[] = [];
    const scope = recordingScope(base, leases);
    const firstNode = text3D("AV fi\nمرحبا", { font, rasterSize: 32, sdfGlyphAtlas: "shared", sdfStyle: { smoothingEm: 0.06 } }).toJSON();
    const secondNode = node("你好");
    const sourceNode = node("fi");
    const serializedNode = JSON.parse(JSON.stringify(sourceNode)) as AuraPrimitiveNode;
    const [first, second] = createProductionRuntimePrimitiveEntries([firstNode, secondNode], undefined, scope);
    const a = first!.resources[0]!;
    const b = second!.resources[0]!;
    const restored = createSdfTextPrimitiveResource(serializedNode, () => {}, scope)!;
    expect(measured).toContain("AV fi");
    expect(measured).toContain("مرحبا");
    expect(firstNode.text3D?.sdfAccessibleLabel).toBe("AV fi\nمرحبا");
    expect(isBuiltinGlyphResource(a)).toBe(true);
    expect(isBuiltinGlyphResource(b)).toBe(true);
    expect(boundTexture(a)).toBe(base.texture);
    expect(boundTexture(b)).toBe(base.texture);
    expect(boundTexture(restored)).toBe(base.texture);
    expect(a.sdfText?.imageBytes).toBe(0);
    expect(a.textureBytes).toBe(0);
    expect(a.textureWarnings).toEqual([]);

    const snapshot = firstNode.text3D!.sdfDynamic!;
    const partialAlpha = snapshot.image.data.findIndex((value, index) => index % 4 === 3 && value > 0 && value < 255);
    expect(partialAlpha).toBeGreaterThanOrEqual(3);
    expect([...snapshot.image.data.slice(partialAlpha - 3, partialAlpha + 1)])
      .toEqual([255, 255, 255, snapshot.image.data[partialAlpha]]);
    expect(Buffer.compare(imageAt(base, leases[0]!), snapshot.image.data)).toBe(0);
    expect(Buffer.compare(imageAt(base, leases[1]!), secondNode.text3D!.sdfDynamic!.image.data)).toBe(0);
    expect(Buffer.compare(imageAt(base, leases[2]!), sourceNode.text3D!.sdfDynamic!.image.data)).toBe(0);
    const fallback = createSdfTextPrimitiveResource(firstNode, () => {})!;
    const fallbackPixels = boundTexture(fallback).getMipLevel(0)?.data;
    if (!(fallbackPixels instanceof Uint8Array)) throw new Error("Expected RGBA8 fallback pixels");
    expect(Buffer.compare(fallbackPixels, snapshot.image.data)).toBe(0);
    expect(Buffer.compare(imageAt(base, leases[0]!), fallbackPixels)).toBe(0);
    retireSdfTextPrimitiveResource(fallback);
    const original = createSdfTextQuadMesh(snapshot.layout, snapshot.image);
    const [u0, v0, u1, v1] = leases[0]!.uv;
    for (let vertex = 0; vertex < original.vertexCount; vertex += 1) {
      const uv = a.geometry.vertexBuffer.getAttribute(vertex, "uv");
      expect(uv[0]).toBeCloseTo(u0 + original.uvs[vertex * 2]! * (u1 - u0), 6);
      expect(uv[1]).toBeCloseTo(v0 + original.uvs[vertex * 2 + 1]! * (v1 - v0), 6);
      expect(a.geometry.vertexBuffer.getAttribute(vertex, "uv1")).toEqual(uv);
    }
    base.dispose(); retireSdfTextPrimitiveResource(a); retireSdfTextPrimitiveResource(b); retireSdfTextPrimitiveResource(restored);
    await base.whenDisposed();
    expect(base.texture.disposed).toBe(true);
  });

  it("replicates edge texels to preserve clamp sampling and keeps a transparent outer gutter", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const image: SdfTextRasterImage = {
      kind: "aura-sdf-text-image", width: 2, height: 2, coveredTexels: 2,
      data: new Uint8Array([0, 0, 0, 0, 255, 255, 255, 1, 255, 255, 255, 128, 255, 255, 255, 255])
    };
    const lease = scope.tryAcquireLabel!(image)!;
    scope.flush();
    expect(imageAt(scope, lease)).toEqual(image.data);
    const { x, y } = lease.rect;
    const pixels = atlasPixels(scope);
    const alphaAt = (px: number, py: number) => pixels[(py * scope.texture.width + px) * 4 + 3];
    expect([alphaAt(x - 1, y - 1), alphaAt(x + 2, y - 1), alphaAt(x - 1, y + 2), alphaAt(x + 2, y + 2)]).toEqual([0, 1, 128, 255]);
    expect([alphaAt(x - 2, y), alphaAt(x + 3, y), alphaAt(x, y - 2), alphaAt(x, y + 3)]).toEqual([0, 0, 0, 0]);
    lease.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("rejects colored and premultiplied snapshots instead of silently changing their pixels", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const image: SdfTextRasterImage = {
      kind: "aura-sdf-text-image", width: 1, height: 1, coveredTexels: 1,
      data: new Uint8Array([255, 255, 255, 128])
    };
    const premultiplied = { ...image, data: new Uint8Array([128, 128, 128, 128]) };
    const colored = { ...image, data: new Uint8Array([255, 0, 0, 128]) };
    const coloredTransparent = { ...image, data: new Uint8Array([255, 0, 0, 0]) };
    const transparentWhite = { ...image, data: new Uint8Array([255, 255, 255, 0]) };
    expect(scope.tryAcquireLabel!(premultiplied)).toBeUndefined();
    expect(scope.tryAcquireLabel!(colored)).toBeUndefined();
    expect(scope.tryAcquireLabel!(coloredTransparent)).toBeUndefined();
    expect(scope.tryAcquireLabel!(transparentWhite)).toBeUndefined();
    const lease = scope.tryAcquireLabel!(image)!;
    expect(lease).toBeDefined();
    scope.flush();
    expect(imageAt(scope, lease)).toEqual(image.data);
    lease.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("falls back for colored, oversized, incompatible and unavailable snapshots", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const original = node("AV");
    const snapshot = original.text3D!.sdfDynamic!;
    const coloredPixels = snapshot.image.data.slice();
    coloredPixels[0] = coloredPixels[3] === 255 ? 254 : 255;
    const colored: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, sdfDynamic: {
      ...snapshot, image: { ...snapshot.image, data: coloredPixels }
    } } };
    const oversized: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, sdfDynamic: {
      ...snapshot, image: { ...snapshot.image, width: 509, height: 1, data: new Uint8Array(509 * 4).fill(255) }
    } } };
    const incompatible: AuraPrimitiveNode = { ...original, material: { ...original.material, textureAnisotropy: 4 } };
    const resources = [
      createSdfTextPrimitiveResource(colored, () => {}, scope)!,
      createSdfTextPrimitiveResource(oversized, () => {}, scope)!,
      createSdfTextPrimitiveResource(incompatible, () => {}, scope)!,
      createSdfTextPrimitiveResource(original, () => {})!
    ];
    for (const [index, resource] of resources.entries()) {
      expect(isBuiltinGlyphResource(resource)).toBe(index < 3);
      expect(boundTexture(resource)).not.toBe(scope.texture);
      expect(resource.textureBytes).toBeGreaterThan(0);
      expect(resource.textureWarnings.join(" ")).toMatch(/SDF_GLYPH_ATLAS_FALLBACK/);
      retireSdfTextPrimitiveResource(resource);
    }
    scope.dispose(); await scope.whenDisposed();
  });

  it("retains a whole-label fallback and its mount scope until the pending frame releases it", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const original = node("AV");
    const snapshot = original.text3D!.sdfDynamic!;
    const data = snapshot.image.data.slice();
    data[0] = data[3] === 255 ? 254 : 255;
    const colored: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, sdfDynamic: {
      ...snapshot, image: { ...snapshot.image, data }
    } } };
    const resource = createSdfTextPrimitiveResource(colored, () => {}, scope)!;
    const texture = boundTexture(resource);
    const releaseFrame = retainBuiltinGlyphResource(resource)!;
    expect(texture).not.toBe(scope.texture);
    retireSdfTextPrimitiveResource(resource);
    scope.dispose();
    expect(texture.disposed).toBe(false);
    expect(scope.texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(texture.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });

  it("keeps shaped and built-in labels on whole-label textures when retained entries fill the atlas", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const size = 508;
    const blocker = scope.tryAcquireLabel!({
      kind: "aura-sdf-text-image", width: size, height: size, coveredTexels: size * size,
      data: new Uint8Array(size * size * 4).fill(255)
    })!;
    const shaped = createSdfTextPrimitiveResource(node("AV"), () => {}, scope)!;
    const builtinNode = text3D("AB", { backend: "sdf", sdfGlyphAtlas: "shared" }).toJSON();
    const builtin = createSdfTextPrimitiveResource(builtinNode, () => {}, scope)!;
    for (const resource of [shaped, builtin]) {
      expect(resource.sdfText).not.toBeNull();
      expect(boundTexture(resource)).not.toBe(scope.texture);
      expect(resource.textureWarnings.join(" ")).toMatch(/SDF_GLYPH_ATLAS_FALLBACK/);
      retireSdfTextPrimitiveResource(resource);
    }
    blocker.release();
    const recovered = createSdfTextPrimitiveResource(node("AV"), () => {}, scope)!;
    expect(boundTexture(recovered)).toBe(scope.texture);
    retireSdfTextPrimitiveResource(recovered); scope.dispose(); await scope.whenDisposed();
  });

  it("switches a live fallback back to the shared atlas without retiring its pending frame", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const size = 508;
    const blocker = scope.tryAcquireLabel!({
      kind: "aura-sdf-text-image", width: size, height: size, coveredTexels: size * size,
      data: new Uint8Array(size * size * 4).fill(255)
    })!;
    const original = text3D("AV", { font, rasterSize: 32, sdfGlyphAtlas: "shared" })
      .runtime({ id: "fallback-caption", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(original as never, original.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const old = entry.resources[0]!;
    const oldTexture = boundTexture(old);
    const releaseFrame = retainBuiltinGlyphResource(old)!;
    expect(oldTexture).not.toBe(scope.texture);
    blocker.release();
    handle.setText("fi");
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const next = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(boundTexture(next)).toBe(scope.texture);
    expect(oldTexture.disposed).toBe(false);
    scope.dispose(); retireSdfTextPrimitiveResource(next);
    expect(scope.texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(oldTexture.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });

  it("rolls back a failed update and retains the previous snapshot through a live frame", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const original = text3D("AV", { font, rasterSize: 32, sdfGlyphAtlas: "shared" })
      .runtime({ id: "loaded-caption", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(original as never, original.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const old = entry.resources[0]!;
    const releaseFrame = retainBuiltinGlyphResource(old)!;
    handle.setText("AV fi\nمرحبا");
    const failure = new Error("injected atlas update failure");
    vi.spyOn(scope.texture, "update").mockImplementationOnce(() => { throw failure; });
    expect(() => resolveProductionPrimitiveRuntimeState(entry, registry)).toThrow(failure);
    expect(entry.resources[0]).toBe(old);
    expect(old.texturedMaterial!.disposed).toBe(false);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();

    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const next = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(next).not.toBe(old);
    expect(boundTexture(next)).toBe(scope.texture);
    expect(current.node.text3D?.sdfAccessibleLabel).toBe("AV fi\nمرحبا");
    expect(old.texturedMaterial!.disposed).toBe(false);
    scope.dispose(); retireSdfTextPrimitiveResource(next);
    expect(scope.texture.disposed).toBe(false);
    releaseFrame(); releaseFrame();
    await scope.whenDisposed();
    expect(old.texturedMaterial!.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });
});
