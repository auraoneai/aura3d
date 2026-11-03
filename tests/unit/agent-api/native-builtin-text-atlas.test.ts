import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createBuiltinGlyphAtlasScope, type BuiltinGlyphLease } from "../../../packages/engine/src/agent-api/compiler/BuiltinGlyphAtlas";
import {
  SDF_SUPPORTED_GLYPHS,
  createSdfFontAtlas,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
  type SdfFontAtlas
} from "../../../packages/rendering/src/SdfText";

let source: SdfFontAtlas;
beforeAll(() => { source = createSdfFontAtlas(); }, 60_000);
afterEach(() => vi.restoreAllMocks());

function pixels(texture: { getMipLevel(level: number): { data: unknown } | null }): Uint8Array {
  const data = texture.getMipLevel(0)?.data;
  if (!(data instanceof Uint8Array)) throw new Error("Expected a retained RGBA8 mip");
  return data;
}

function rectBytes(texture: { readonly width: number; getMipLevel(level: number): { data: unknown } | null }, lease: BuiltinGlyphLease): Uint8Array {
  const data = pixels(texture);
  const { x, y, width, height } = lease.rect;
  const out = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * texture.width + x) * 4;
    out.set(data.subarray(start, start + width * 4), row * width * 4);
  }
  return out;
}

function expectedImage(glyph: string, atlas = source) {
  return rasterizeSdfTextLabelImage(layoutSdfText(glyph, atlas), atlas, { texelsPerWorldUnit: 64 });
}

describe("standalone built-in glyph atlas", () => {
  it("stages the existing white raster exactly with top-row UVs and transparent gutters", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const glyphA = scope.acquire("A");
    const glyphR = scope.acquire("R");
    const imageA = expectedImage("A");
    const imageR = expectedImage("R");

    expect(scope.texture).toMatchObject({ width: 512, height: 512, format: "rgba8", colorSpace: "srgb", dynamic: true, generateMipmaps: false, mipLevelCount: 1 });
    expect(scope.texture.usage).toEqual(["sampled", "copy-dst"]);
    expect(scope.sampler).toMatchObject({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge", maxAnisotropy: 1 });
    expect(glyphA.rect).toMatchObject({ width: imageA.width, height: imageA.height });
    expect(glyphA.uv[0]).toBe(glyphA.rect.x / 512);
    expect(glyphA.uv[1]).toBe(glyphA.rect.y / 512);
    expect(glyphA.uv[2]).toBe((glyphA.rect.x + glyphA.rect.width) / 512);
    expect(glyphA.uv[3]).toBe((glyphA.rect.y + glyphA.rect.height) / 512);
    expect(glyphA.rect.x + glyphA.rect.width).toBeLessThan(glyphR.rect.x);

    expect(scope.flush()).toBe(true);
    expect(scope.flush()).toBe(false);
    expect(rectBytes(scope.texture, glyphA)).toEqual(imageA.data);
    expect(rectBytes(scope.texture, glyphR)).toEqual(imageR.data);
    const data = pixels(scope.texture);
    const pixel = (x: number, y: number) => data.slice((y * 512 + x) * 4, (y * 512 + x + 1) * 4);
    for (const glyph of [glyphA, glyphR]) {
      const { x, y, width, height } = glyph.rect;
      for (let column = x - 1; column <= x + width; column += 1) {
        expect(pixel(column, y - 1)).toEqual(new Uint8Array(4));
        expect(pixel(column, y + height)).toEqual(new Uint8Array(4));
      }
      for (let row = y; row < y + height; row += 1) {
        expect(pixel(x - 1, row)).toEqual(new Uint8Array(4));
        expect(pixel(x + width, row)).toEqual(new Uint8Array(4));
      }
    }
    glyphA.release(); glyphR.release(); scope.dispose();
  });

  it("holds all drawable catalog glyphs simultaneously without overlap", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const glyphs = [...SDF_SUPPORTED_GLYPHS].filter((glyph) => glyph !== " ");
    expect(glyphs).toHaveLength(38);
    const leases = glyphs.map((glyph) => scope.acquire(glyph));
    for (let i = 0; i < leases.length; i += 1) {
      const a = leases[i]!.rect;
      expect(a.x).toBeGreaterThanOrEqual(1);
      expect(a.y).toBeGreaterThanOrEqual(1);
      expect(a.x + a.width).toBeLessThan(512);
      expect(a.y + a.height).toBeLessThan(512);
      for (let j = 0; j < i; j += 1) {
        const b = leases[j]!.rect;
        expect(a.x >= b.x + b.width + 1 || b.x >= a.x + a.width + 1 ||
          a.y >= b.y + b.height + 1 || b.y >= a.y + a.height + 1).toBe(true);
      }
    }
    expect(scope.flush()).toBe(true);
    for (let i = 0; i < glyphs.length; i += 1) {
      expect(rectBytes(scope.texture, leases[i]!)).toEqual(expectedImage(glyphs[i]!).data);
    }
    for (const lease of leases) lease.release();
    scope.dispose();
  }, 60_000);

  it("shares repeated glyphs and disposes only after the last idempotent lease release", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const dispose = vi.spyOn(scope.texture, "dispose");
    const first = scope.acquire("A");
    const second = scope.acquire("A");
    expect(second.rect).toEqual(first.rect);
    expect(second.uv).toEqual(first.uv);
    expect(scope.flush()).toBe(true);
    first.release(); first.release();
    const third = scope.acquire("A");
    expect(third.uv).toEqual(second.uv);
    expect(scope.flush()).toBe(false);

    scope.dispose(); scope.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(scope.texture.disposed).toBe(false);
    expect(() => scope.acquire("B")).toThrow(/closed/);
    expect(() => scope.flush()).toThrow(/closed/);
    second.release(); second.release();
    expect(dispose).not.toHaveBeenCalled();
    third.release(); third.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scope.texture.disposed).toBe(true);
    expect(scope.texture.getMipLevel(0)).toBeNull();
  });

  it("batches updates and keeps previous canonical pixels across subsequent writes", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const update = vi.spyOn(scope.texture, "update");
    const a = scope.acquire("A");
    const b = scope.acquire("B");
    expect(scope.texture.revision).toBe(0);
    expect(scope.flush()).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(scope.texture.revision).toBe(1);
    expect(rectBytes(scope.texture, a)).toEqual(expectedImage("A").data);
    expect(rectBytes(scope.texture, b)).toEqual(expectedImage("B").data);

    const c = scope.acquire("C");
    expect(scope.flush()).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(scope.texture.revision).toBe(2);
    expect(rectBytes(scope.texture, a)).toEqual(expectedImage("A").data);
    expect(rectBytes(scope.texture, b)).toEqual(expectedImage("B").data);
    expect(rectBytes(scope.texture, c)).toEqual(expectedImage("C").data);
    a.release(); b.release(); c.release(); scope.dispose();
  });

  it("retries both the failed region and new dirt created during the failed update", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const a = scope.acquire("A");
    const originalUpdate = scope.texture.update.bind(scope.texture);
    const failure = new Error("injected texture update failure");
    const added: { lease?: BuiltinGlyphLease } = {};
    vi.spyOn(scope.texture, "update").mockImplementationOnce(() => {
      added.lease = scope.acquire("B");
      throw failure;
    }).mockImplementation(originalUpdate);
    expect(() => scope.flush()).toThrow(failure);
    expect(scope.texture.revision).toBe(0);
    expect(scope.flush()).toBe(true);
    expect(scope.flush()).toBe(false);
    const b = added.lease;
    if (!b) throw new Error("Expected the reentrant glyph lease");
    expect(rectBytes(scope.texture, a)).toEqual(expectedImage("A").data);
    expect(rectBytes(scope.texture, b)).toEqual(expectedImage("B").data);
    a.release(); b.release(); scope.dispose();
  });

  it("keeps dirt retryable if an update throws after changing the texture", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const a = scope.acquire("A");
    const originalUpdate = scope.texture.update.bind(scope.texture);
    const failure = new Error("injected post-update failure");
    vi.spyOn(scope.texture, "update").mockImplementationOnce((data, region) => {
      originalUpdate(data, region);
      throw failure;
    });
    expect(() => scope.flush()).toThrow(failure);
    expect(scope.texture.revision).toBe(1);
    expect(scope.flush()).toBe(true);
    expect(scope.texture.revision).toBe(2);
    expect(rectBytes(scope.texture, a)).toEqual(expectedImage("A").data);
    a.release(); scope.dispose();
  });

  it("defers final disposal through a reentrant update even if its last lease is released", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const a = scope.acquire("A");
    const originalUpdate = scope.texture.update.bind(scope.texture);
    const dispose = vi.spyOn(scope.texture, "dispose");
    vi.spyOn(scope.texture, "update").mockImplementationOnce((data, region) => {
      scope.dispose();
      a.release();
      expect(scope.texture.disposed).toBe(false);
      expect(dispose).not.toHaveBeenCalled();
      originalUpdate(data, region);
    });
    expect(scope.flush()).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scope.texture.disposed).toBe(true);
    a.release(); scope.dispose();
  });

  it("rejects noncatalog inputs, nondefault sources, and snapshots mutable source data", () => {
    const expected = expectedImage("R").data;
    const uv = [...source.glyphs.R!.uv] as [number, number, number, number];
    const mutable: SdfFontAtlas = { ...source, distances: source.distances.slice(), glyphs: { ...source.glyphs, R: { ...source.glyphs.R!, uv } } };
    const scope = createBuiltinGlyphAtlasScope(mutable);
    mutable.distances.fill(0);
    uv[0] = 0;
    const r = scope.acquire("R");
    expect(scope.flush()).toBe(true);
    expect(rectBytes(scope.texture, r)).toEqual(expected);
    for (const glyph of ["", " ", "a", "AB", "!", "😀"]) {
      expect(() => scope.acquire(glyph)).toThrow(/drawable catalog glyph/);
    }
    expect(() => createBuiltinGlyphAtlasScope({ ...source, padding: 4 })).toThrow(/default built-in/);
    expect(() => createBuiltinGlyphAtlasScope({ ...source, glyphs: { ...source.glyphs, A: { ...source.glyphs.A!, advanceEm: 1 } } })).toThrow(/default catalog metrics/);
    const invalidDistances = source.distances.slice();
    invalidDistances[0] = NaN;
    expect(() => createBuiltinGlyphAtlasScope({ ...source, distances: invalidDistances })).toThrow(/normalized distance/);
    r.release(); scope.dispose();
  });

  it("retires a scope with no leases immediately and exactly once", () => {
    const scope = createBuiltinGlyphAtlasScope(source);
    const dispose = vi.spyOn(scope.texture, "dispose");
    scope.dispose(); scope.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scope.texture.disposed).toBe(true);
    expect(() => scope.acquire("A")).toThrow(/closed/);
    expect(() => scope.flush()).toThrow(/closed/);
  });
});
