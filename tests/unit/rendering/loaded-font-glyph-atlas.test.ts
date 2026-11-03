import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFont, type FontLoaderPlatform, type LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import {
  LoadedFontGlyphAtlas,
  createDynamicSdfText,
  sharedLoadedFontGlyphAtlasStats
} from "../../../packages/rendering/src/SdfText";

const metadata = { family: "Fixture", license: "OFL-1.1", licenseUrl: "https://example.org/license" };
function font(): LoadedFont & { disposed: boolean } {
  return { family: "AuraFont1", metadata, disposed: false, dispose() { this.disposed = true; } };
}

const painted: string[] = [];
class InkCanvas {
  width = 1;
  height = 1;
  readonly ctx = {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", textBaseline: "middle", textAlign: "left", fillStyle: "",
    measureText: (text: string) => ({ width: [...text].length * 8 }),
    fillText: (text: string) => { painted.push(text); },
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let y = 6; y < this.height - 6; y += 1) for (let x = 6; x < this.width - 6; x += 1) data[(y * this.width + x) * 4 + 3] = 255;
      return { data };
    }
  };
  getContext() { return this.ctx; }
}

beforeEach(() => { painted.length = 0; vi.stubGlobal("OffscreenCanvas", InkCanvas); });
afterEach(() => vi.unstubAllGlobals());

describe("retained loaded-font glyph atlas", () => {
  it("rasterizes each shaped run once and reuses it across labels and text updates", () => {
    const atlas = new LoadedFontGlyphAtlas({ width: 512, height: 512 });
    const handle = font();
    const first = createDynamicSdfText("Score\n120", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    const second = createDynamicSdfText("Score\n121", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    expect(painted).toEqual(["Score", "120", "121"]);
    expect(second.layout.quads[0]!.uv).toEqual(first.layout.quads[0]!.uv);
    expect(second.layout.quads[1]!.uv).not.toEqual(first.layout.quads[1]!.uv);
    // Updating back to earlier text is served entirely from resident pixels.
    const again = createDynamicSdfText("Score\n120", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    expect(painted).toHaveLength(3);
    expect(again.image.data).toEqual(first.image.data);
    expect(atlas.stats()).toMatchObject({ entries: 3, hits: 3, misses: 3, evictions: 0, fontSets: 1 });
    // A different handle, raster size or direction is a different run.
    createDynamicSdfText("Score", { font: font(), rasterSize: 16, glyphAtlas: atlas });
    createDynamicSdfText("Score", { font: handle, rasterSize: 32, glyphAtlas: atlas });
    createDynamicSdfText("Score", { font: handle, rasterSize: 16, direction: "rtl", glyphAtlas: atlas });
    expect(painted).toHaveLength(6);
    atlas.dispose();
    expect(atlas.stats()).toMatchObject({ disposed: true, entries: 0 });
    expect(() => createDynamicSdfText("Score", { font: handle, rasterSize: 16, glyphAtlas: atlas })).toThrow(/undisposed LoadedFontGlyphAtlas/);
  });

  it("bounds allocation: evicts least-recently-used runs and errors when one label cannot fit", () => {
    const atlas = new LoadedFontGlyphAtlas({ width: 64, height: 64, maxEntries: 2 });
    const handle = font();
    createDynamicSdfText("A", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    createDynamicSdfText("B", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    createDynamicSdfText("C", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    expect(atlas.stats()).toMatchObject({ entries: 2, misses: 3, evictions: 1 });
    // "A" was least recently used, so it is rasterized again.
    createDynamicSdfText("A", { font: handle, rasterSize: 16, glyphAtlas: atlas });
    expect(painted).toEqual(["A", "B", "C", "A"]);
    expect(() => createDynamicSdfText("D\nE\nF", { font: handle, rasterSize: 16, glyphAtlas: atlas })).toThrow(/AURA_TEXT_GLYPH_ATLAS_FULL/);
    // A failed label releases its runs; the atlas stays usable and bounded.
    expect(createDynamicSdfText("G", { font: handle, rasterSize: 16, glyphAtlas: atlas }).layout.quads).toHaveLength(1);
    expect(atlas.stats().entries).toBeLessThanOrEqual(2);
    atlas.dispose();
  });

  it("purges a disposed font's runs and releases the shared atlas after its final font", async () => {
    const atlas = new LoadedFontGlyphAtlas({ width: 256, height: 256 });
    const keep = font();
    const drop = font();
    createDynamicSdfText("Keep", { font: keep, rasterSize: 16, glyphAtlas: atlas });
    createDynamicSdfText("Drop", { font: drop, rasterSize: 16, glyphAtlas: atlas });
    drop.dispose();
    expect(atlas.purgeDisposedFonts()).toBe(1);
    expect(atlas.stats()).toMatchObject({ entries: 1, fontSets: 1 });
    atlas.dispose();

    const platform: FontLoaderPlatform = {
      createFace: () => ({ load: async function (this: unknown) { return this as never; } }),
      fonts: { add: () => undefined, delete: () => true }
    };
    const bytes = new Uint8Array(32);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x00010000); view.setUint16(4, 1); view.setUint32(20, 28); view.setUint32(24, 4);
    const loaded = await loadFont({ data: bytes, metadata }, { platform });
    createDynamicSdfText("Shared", { font: loaded, rasterSize: 16 });
    createDynamicSdfText("Shared", { font: loaded, rasterSize: 16 });
    expect(painted.filter((text) => text === "Shared")).toHaveLength(1);
    expect(sharedLoadedFontGlyphAtlasStats()).toMatchObject({ entries: 1, hits: 1, fontSets: 1, disposed: false });
    loaded.dispose();
    expect(sharedLoadedFontGlyphAtlasStats()).toBeUndefined();
  });
});
