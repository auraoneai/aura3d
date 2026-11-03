import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createBuiltinGlyphAtlasScope, retainBuiltinGlyphResource } from "../../../packages/engine/src/agent-api/compiler/BuiltinGlyphAtlas";
import { compileSdfTextSnapshot } from "../../../packages/engine/src/agent-api/compiler/text";
import { createSdfTextPrimitiveResource, retireSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import {
  createProductionRuntimePrimitiveEntries, resolveProductionPrimitiveRuntimeState,
  selectProductionPrimitiveResource
} from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { rootSdfFontAtlas, text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { SdfTextRasterImage } from "../../../packages/rendering/src/SdfText";
import type { LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import { GlyphAtlas } from "../../../packages/rendering/src/text/GlyphAtlas";
import { shapeText, type TextMeasureContext } from "../../../packages/rendering/src/text/TextShaper";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

function image(width: number, height: number, values: readonly number[]): SdfTextRasterImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < values.length; index += 1) {
    const alpha = values[index]!;
    data.fill(alpha === 0 ? 0 : 255, index * 4, index * 4 + 3);
    data[index * 4 + 3] = alpha;
  }
  return { kind: "aura-sdf-text-image", width, height, data, coveredTexels: values.filter((value) => value > 8).length };
}

function rectangleBytes(scope: ReturnType<typeof createBuiltinGlyphAtlasScope>, rect: { x: number; y: number; width: number; height: number }): Uint8Array {
  const pixels = scope.texture.getMipLevel(0)?.data;
  if (!(pixels instanceof Uint8Array)) throw new Error("Expected RGBA8 texture data.");
  const result = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row += 1) {
    const start = ((rect.y + row) * scope.texture.width + rect.x) * 4;
    result.set(pixels.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  return result;
}

beforeAll(() => { rootSdfFontAtlas(); });

describe("retained shaped-label pixel reuse", () => {
  it("reuses equal snapshots across releases without a second texture update", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const snapshot = image(2, 2, [1, 50, 100, 255]);
    const expected = snapshot.data.slice();
    const first = scope.tryAcquireLabel!(snapshot)!;
    expect(scope.flush()).toBe(true);
    snapshot.data.fill(0); // The cache owns a copy, not the caller's mutable image.
    first.release();
    const second = scope.tryAcquireLabel!(image(2, 2, [1, 50, 100, 255]))!;
    expect(second.glyph).toBe(first.glyph);
    expect(second.uv).toEqual(first.uv);
    expect(scope.flush()).toBe(false);
    expect(rectangleBytes(scope, second.rect)).toEqual(expected);
    scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    second.release(); second.release();
    await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
  });

  it("compares every pixel after a hash collision", async () => {
    // These two 2x2 alpha arrays have the same FNV-1a hash after edge padding.
    const firstImage = image(2, 2, [142, 24, 77, 65]);
    const secondImage = image(2, 2, [58, 4, 153, 97]);
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const first = scope.tryAcquireLabel!(firstImage)!;
    const second = scope.tryAcquireLabel!(secondImage)!;
    expect(second.glyph).not.toBe(first.glyph);
    expect(second.rect).not.toEqual(first.rect);
    scope.flush();
    expect(rectangleBytes(scope, first.rect)).toEqual(firstImage.data);
    expect(rectangleBytes(scope, second.rect)).toEqual(secondImage.data);
    first.release(); second.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("shares a retained full atlas and re-uploads cached pixels after atlas eviction", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const size = 508;
    const full: SdfTextRasterImage = { kind: "aura-sdf-text-image", width: size, height: size,
      data: new Uint8Array(size * size * 4).fill(255), coveredTexels: size * size };
    const first = scope.tryAcquireLabel!(full)!;
    expect(scope.flush()).toBe(true);
    const same = scope.tryAcquireLabel!(full)!;
    expect(same.glyph).toBe(first.glyph);
    expect(scope.flush()).toBe(false);
    expect(scope.tryAcquireLabel!(image(1, 1, [9]))).toBeUndefined();
    first.release(); same.release();
    const small = scope.tryAcquireLabel!(image(1, 1, [9]))!;
    expect(small).toBeDefined();
    scope.flush();
    expect(scope.tryAcquireLabel!(full)).toBeUndefined();
    small.release();
    const reloaded = scope.tryAcquireLabel!(full)!;
    expect(reloaded.glyph).toBe(first.glyph);
    expect(scope.flush()).toBe(true);
    expect(Buffer.compare(rectangleBytes(scope, reloaded.rect), full.data)).toBe(0);
    reloaded.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("bounds cached entries and never evicts a retained label", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const keys: string[] = [];
    for (let value = 0; value < 38; value += 1) {
      const lease = scope.tryAcquireLabel!(image(1, 1, [value]))!;
      keys.push(lease.glyph);
      lease.release();
    }
    const pinned = scope.tryAcquireLabel!(image(1, 1, [0]))!;
    const newcomer = scope.tryAcquireLabel!(image(1, 1, [38]))!;
    const pinnedAgain = scope.tryAcquireLabel!(image(1, 1, [0]))!;
    expect(pinnedAgain.glyph).toBe(keys[0]);
    const displaced = scope.tryAcquireLabel!(image(1, 1, [1]))!;
    expect(displaced.glyph).not.toBe(keys[1]);
    pinned.release(); pinnedAgain.release(); newcomer.release(); displaced.release();
    scope.dispose(); await scope.whenDisposed();
  });

  it("does not evict cached snapshots when an impossible allocation falls back", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    let oldest = "";
    for (let value = 1; value <= 37; value += 1) {
      const lease = scope.tryAcquireLabel!(image(1, 1, [value]))!;
      if (value === 1) oldest = lease.glyph;
      lease.release();
    }
    const size = 508;
    const blocker = scope.tryAcquireLabel!({
      kind: "aura-sdf-text-image", width: size, height: size,
      data: new Uint8Array(size * size * 4).fill(255), coveredTexels: size * size
    })!;
    expect(scope.tryAcquireLabel!(image(1, 1, [50]))).toBeUndefined();
    blocker.release();
    const recovered = scope.tryAcquireLabel!(image(1, 1, [1]))!;
    expect(recovered.glyph).toBe(oldest);
    recovered.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("reuses an exact edge-safe subimage without changing the retained snapshot", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const source = new Array<number>(45).fill(0);
    source[2 * 9 + 2] = 180;
    source[2 * 9 + 6] = 90;
    const larger = image(9, 5, source);
    const smaller = image(3, 3, [0, 0, 0, 0, 180, 0, 0, 0, 0]);
    const whole = scope.tryAcquireLabel!(larger)!;
    expect(scope.flush()).toBe(true);
    const part = scope.tryAcquireLabel!(smaller)!;
    expect(part.glyph).toBe(whole.glyph);
    expect(part.rect.width).toBe(3);
    expect(part.rect.height).toBe(3);
    expect(scope.flush()).toBe(false);
    expect(rectangleBytes(scope, part.rect)).toEqual(smaller.data);
    expect(rectangleBytes(scope, whole.rect)).toEqual(larger.data);
    whole.release(); scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    part.release(); await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
  });

  it("does not reuse a subimage when adjacent texels would change edge filtering", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const source = new Array<number>(45).fill(0);
    source[2 * 9 + 2] = 180;
    source[2 * 9] = 75;
    const whole = scope.tryAcquireLabel!(image(9, 5, source))!;
    const smaller = image(3, 3, [0, 0, 0, 0, 180, 0, 0, 0, 0]);
    scope.flush();
    const part = scope.tryAcquireLabel!(smaller)!;
    expect(part.glyph).not.toBe(whole.glyph);
    expect(scope.flush()).toBe(true);
    expect(rectangleBytes(scope, part.rect)).toEqual(smaller.data);
    whole.release(); part.release(); scope.dispose(); await scope.whenDisposed();
  });

  it("does not admit mutable shared-memory pixels to the alpha-only atlas", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const data = new Uint8Array(new SharedArrayBuffer(4));
    data.set([255, 255, 255, 128]);
    expect(scope.tryAcquireLabel!({ kind: "aura-sdf-text-image", width: 1, height: 1, data, coveredTexels: 1 })).toBeUndefined();
    scope.dispose(); await scope.whenDisposed();
  });
});

describe("glyph atlas identity and allocation", () => {
  it("invalidates a released key, rejects conflicting live bytes, and snapshots exposed state", () => {
    const atlas = new GlyphAtlas({ width: 24, height: 8, maxEntries: 3 });
    const bitmap = { width: 6, height: 6, data: new Uint8Array(36).fill(11) };
    const first = atlas.acquire("font:A", bitmap);
    atlas.takeUpdates();
    const exposed = atlas.data;
    exposed.fill(0);
    expect(atlas.data[first.y * atlas.width + first.x]).toBe(11);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.uv)).toBe(true);
    expect(() => atlas.acquire("font:A", { ...bitmap, data: new Uint8Array(36).fill(22) })).toThrow(/KEY_CONFLICT/);
    expect(atlas.takeUpdates()).toEqual([]);
    atlas.release("font:A");
    const changed = atlas.acquire("font:A", { ...bitmap, data: new Uint8Array(36).fill(22) });
    expect(changed).toEqual(first);
    expect(atlas.takeUpdates()[0]!.data.every((value) => value === 22)).toBe(true);
    atlas.release("font:A");
    const resized = atlas.acquire("font:A", { width: 1, height: 1, data: new Uint8Array([33]) });
    expect(resized.width).toBe(1);
    expect(resized.height).toBe(1);
    expect(atlas.size).toBe(1);
    expect(atlas.data[resized.y * atlas.width + resized.x]).toBe(33);
    atlas.release("font:A"); atlas.dispose();
  });

  it("preserves released entries and clean pixels when retained packing makes a request impossible", () => {
    const atlas = new GlyphAtlas({ width: 16, height: 8, maxEntries: 2 });
    const bitmap = { width: 6, height: 6, data: new Uint8Array(36).fill(91) };
    const first = atlas.acquire("a", bitmap);
    atlas.acquire("b", bitmap);
    atlas.takeUpdates();
    atlas.release("a");
    const before = atlas.data;
    expect(() => atlas.acquire("large", { width: 14, height: 6, data: new Uint8Array(84).fill(5) })).toThrow(/full/);
    expect(atlas.size).toBe(2);
    expect(atlas.data).toEqual(before);
    expect(atlas.takeUpdates()).toEqual([]);
    expect(atlas.acquire("a", bitmap)).toEqual(first);
    expect(atlas.takeUpdates()).toEqual([]);
    atlas.release("a"); atlas.release("b"); atlas.dispose();
  });

  it("prevents recursive uploads from overwriting a newer dirty revision", () => {
    const uploaded: number[] = [];
    let atlas: GlyphAtlas;
    const texture = {
      update: (region: { data: Uint8Array }) => {
        if (uploaded.length === 0) {
          atlas.update("a", { width: 1, height: 1, data: new Uint8Array([20]) });
          expect(() => atlas.flush()).toThrow(/recursively/);
        }
        uploaded.push(region.data[0]!);
      },
      dispose: vi.fn()
    };
    atlas = new GlyphAtlas({ width: 8, height: 8, texture });
    atlas.acquire("a", { width: 1, height: 1, data: new Uint8Array([10]) });
    expect(atlas.flush()).toBe(true);
    expect(atlas.flush()).toBe(true);
    expect(atlas.flush()).toBe(false);
    expect(uploaded).toEqual([10, 20]);
    atlas.release("a"); atlas.dispose();
    expect(texture.dispose).toHaveBeenCalledOnce();
  });

  it("defers backing disposal until a synchronous atlas upload returns", () => {
    let atlas: GlyphAtlas;
    const texture = {
      update: () => {
        atlas.dispose();
        expect(atlas.disposed).toBe(true);
        expect(texture.dispose).not.toHaveBeenCalled();
      },
      dispose: vi.fn()
    };
    atlas = new GlyphAtlas({ width: 8, height: 8, texture });
    atlas.acquire("a", { width: 1, height: 1, data: new Uint8Array([10]) });
    expect(atlas.flush()).toBe(true);
    expect(texture.dispose).toHaveBeenCalledOnce();
    expect(atlas.data.length).toBe(0);
    atlas.dispose();
    expect(texture.dispose).toHaveBeenCalledOnce();
  });

  it("keeps every retained padded rectangle disjoint through fragmented allocations", () => {
    const atlas = new GlyphAtlas({ width: 64, height: 64, maxEntries: 12 });
    const live = new Map<string, { x: number; y: number; width: number; height: number }>();
    let seed = 0x12345678;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let iteration = 0; iteration < 160; iteration += 1) {
      if (live.size && random() % 3 === 0) {
        const key = [...live.keys()][random() % live.size]!;
        atlas.release(key);
        live.delete(key);
      }
      const width = 1 + random() % 14;
      const height = 1 + random() % 14;
      const key = `glyph:${iteration}`;
      const before = atlas.data;
      const size = atlas.size;
      try {
        const entry = atlas.acquire(key, { width, height, data: new Uint8Array(width * height).fill(1 + iteration % 254) });
        const block = (item: { x: number; y: number; width: number; height: number }) => ({
          x: item.x - 1, y: item.y - 1,
          width: Math.ceil((item.width + 2) / 8) * 8, height: Math.ceil((item.height + 2) / 8) * 8
        });
        const a = block(entry);
        for (const item of live.values()) {
          const b = block(item);
          expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
        }
        live.set(key, entry);
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
        expect(atlas.size).toBe(size);
        expect(atlas.data).toEqual(before);
      }
    }
    for (const key of live.keys()) atlas.release(key);
    atlas.dispose();
  });
});

const font: LoadedFont = {
  family: "AuraFont1", metadata: { family: "Fixture font", license: "OFL-1.1", licenseUrl: "https://example.org/license" },
  disposed: false, dispose() {}
};
const measured: string[] = [];
const painted: string[] = [];
class MockCanvas {
  width = 1;
  height = 1;
  readonly ctx = {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", textBaseline: "middle", textAlign: "left", fillStyle: "",
    measureText(text: string) { measured.push(text); return { width: [...text].length * 8 }; },
    fillText(text: string) { painted.push(text); },
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let y = 4; y < this.height - 4; y += 1) for (let x = 5; x < this.width - 5; x += 1) data[(y * this.width + x) * 4 + 3] = 255;
      return { data };
    }
  };
  getContext() { return this.ctx; }
}

describe("loaded-font snapshot reuse integration", () => {
  beforeEach(() => { measured.length = 0; painted.length = 0; vi.stubGlobal("OffscreenCanvas", MockCanvas); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("keeps contextual lines intact and retains shared pixels while either frame needs them", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const firstNode = text3D("AV fi\nمرحبا", { font, rasterSize: 32, sdfGlyphAtlas: "shared" }).toJSON();
    const secondNode = text3D("AV fi\nمرحبا", { font, rasterSize: 32, sdfGlyphAtlas: "shared" }).toJSON();
    // The second label shapes its lines but reuses both retained atlas runs.
    expect(measured).toEqual(["AV fi", "مرحبا", "AV fi", "مرحبا", "AV fi", "مرحبا"]);
    expect(painted).toEqual(["AV fi", "مرحبا"]);
    const first = createSdfTextPrimitiveResource(firstNode, () => {}, scope)!;
    const revision = scope.texture.revision;
    const second = createSdfTextPrimitiveResource(secondNode, () => {}, scope)!;
    expect(scope.texture.revision).toBe(revision);
    expect(second.geometry.vertexBuffer.getAttribute(0, "uv")).toEqual(first.geometry.vertexBuffer.getAttribute(0, "uv"));
    const releaseFrame = retainBuiltinGlyphResource(first)!;
    retireSdfTextPrimitiveResource(first); retireSdfTextPrimitiveResource(second); scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
  });

  it("reuses a prior loaded-label snapshot after live invalidation while its old frame is retained", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const node = text3D("A", { font, rasterSize: 32, sdfGlyphAtlas: "shared" })
      .runtime({ id: "caption", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([node], undefined, scope)[0]!;
    const first = entry.resources[0]!;
    const firstUv = first.geometry.vertexBuffer.getAttribute(0, "uv");
    const releaseFrame = retainBuiltinGlyphResource(first)!;
    handle.setText("AAA");
    const middleState = resolveProductionPrimitiveRuntimeState(entry, registry);
    const middle = selectProductionPrimitiveResource(entry, middleState.node, [0, 0, 1]);
    expect(middle).not.toBe(first);
    const revision = scope.texture.revision;
    handle.setText("A");
    const lastState = resolveProductionPrimitiveRuntimeState(entry, registry);
    const last = selectProductionPrimitiveResource(entry, lastState.node, [0, 0, 1]);
    expect(last).not.toBe(middle);
    expect(last.geometry.vertexBuffer.getAttribute(0, "uv")).toEqual(firstUv);
    expect(scope.texture.revision).toBe(revision);
    expect(first.texturedMaterial!.disposed).toBe(false);
    retireSdfTextPrimitiveResource(last); scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(first.texturedMaterial!.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });

  it("preserves ambiguous alpha bytes on the independent fallback until its frame drains", async () => {
    const scope = createBuiltinGlyphAtlasScope(rootSdfFontAtlas());
    const node = text3D("A", { font, rasterSize: 32, sdfGlyphAtlas: "shared" }).toJSON();
    const dynamic = node.text3D!.sdfDynamic!;
    const data = dynamic.image.data.slice();
    data.set([128, 128, 128, 128], 0);
    const changed = { ...node, text3D: { ...node.text3D!, sdfDynamic: { ...dynamic, image: { ...dynamic.image, data } } } };
    const resource = createSdfTextPrimitiveResource(changed, () => {}, scope)!;
    const texture = (resource.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    expect(texture).not.toBe(scope.texture);
    expect(texture.getMipLevel(0)?.data).toEqual(data);
    expect(resource.textureWarnings.join(" ")).toMatch(/SDF_GLYPH_ATLAS_FALLBACK/);
    const releaseFrame = retainBuiltinGlyphResource(resource)!;
    retireSdfTextPrimitiveResource(resource);
    scope.dispose();
    expect(texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(texture.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });

  it("owns validated typed and serialized snapshots independently from their author", () => {
    const node = text3D("AV", { font, rasterSize: 32 }).toJSON();
    const source = node.text3D!.sdfDynamic!;
    const compiled = compileSdfTextSnapshot(node.text3D!);
    const pixels = compiled.image.data.slice();
    const firstCorner = compiled.layout.quads[0]!.corners[0];
    source.image.data.fill(0);
    (source.layout.quads[0]!.corners as unknown as number[])[0] = 999;
    expect(compiled.image.data).toEqual(pixels);
    expect(compiled.layout.quads[0]!.corners[0]).toBe(firstCorner);
    const buffer = Buffer.from(pixels);
    const buffered = { ...node.text3D!, sdfDynamic: { ...source, image: { ...source.image, data: buffer } } };
    const copiedBuffer = compileSdfTextSnapshot(buffered);
    buffer.fill(0);
    expect(copiedBuffer.image.data).toEqual(pixels);
    const serialized = JSON.parse(JSON.stringify(node.text3D!));
    const restored = compileSdfTextSnapshot(serialized);
    expect(restored.image.data).toBeInstanceOf(Uint8Array);
    expect(restored.image.data).not.toBe(serialized.sdfDynamic.image.data);
    const shared = new Uint8Array(new SharedArrayBuffer(source.image.data.length));
    const unsafe = { ...node.text3D!, sdfDynamic: { ...source, image: { ...source.image, data: shared } } };
    expect(() => compileSdfTextSnapshot(unsafe)).toThrow(/shared/i);
    const invalid = { ...node.text3D!, sdfDynamic: { ...source, layout: { ...source.layout, widthWorld: NaN } } };
    expect(() => compileSdfTextSnapshot(invalid)).toThrow(/invalid layout/);
  });

  it("does not misrepresent a platform missing-glyph result as verified coverage", () => {
    const node = text3D("A𐍈", { font, rasterSize: 32 }).toJSON();
    expect(node.text3D!.sdfDynamic!.layout.glyphCoverage).toBe("platform-unverified");
    expect(node.text3D!.sdfDynamic!.layout.unsupportedCharacters).toEqual([]);
  });
});

describe("bounded shaping fallbacks", () => {
  afterEach(() => vi.unstubAllGlobals());

  function measure(): TextMeasureContext {
    return { font: "", direction: "ltr", measureText: (text) => ({ width: [...text].length }) };
  }

  it("wraps simple ASCII without Intl.Segmenter but explicitly rejects complex wrapping", () => {
    const withoutSegmenter = Object.create(Intl) as typeof Intl;
    Object.defineProperty(withoutSegmenter, "Segmenter", { value: undefined });
    vi.stubGlobal("Intl", withoutSegmenter);
    expect(shapeText("one two three", { font, maxWidth: 7 }, measure()).lines.map((line) => line.text)).toEqual(["one two", "three"]);
    expect(shapeText("abcdef", { font, maxWidth: 2 }, measure()).lines.map((line) => line.text)).toEqual(["ab", "cd", "ef"]);
    expect(shapeText("مرحبا", { font, maxWidth: 5 }, measure()).lines[0]!.text).toBe("مرحبا");
    expect(() => shapeText("مرحبا", { font, maxWidth: 2 }, measure())).toThrow(/AURA_TEXT_SEGMENTER_REQUIRED/);
    expect(() => shapeText("A\u0301", { font, maxWidth: 1 }, measure())).toThrow(/AURA_TEXT_SEGMENTER_REQUIRED/);
  });

  it("rejects a font disposed during platform measurement", () => {
    let disposed = false;
    const transient: LoadedFont = { ...font, get disposed() { return disposed; } };
    const context = measure();
    context.measureText = () => { disposed = true; return { width: 1 }; };
    expect(() => shapeText("A", { font: transient }, context)).toThrow(/undisposed/);
  });

  it("rejects ignored letter spacing and an unbounded fallback font list", () => {
    const context = measure();
    Object.defineProperty(context, "letterSpacing", { get: () => "0px", set: () => {} });
    expect(() => shapeText("AB", { font, letterSpacing: 1 }, context)).toThrow(/letterSpacing/);
    expect(() => shapeText("AB", { font, fallbackFonts: Array.from({ length: 33 }, () => font) }, measure())).toThrow(/32 fallback/);
  });
});
