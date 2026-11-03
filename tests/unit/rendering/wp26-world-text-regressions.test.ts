import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFont, type FontLoaderPlatform, type LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import { shapeText, type TextMeasureContext } from "../../../packages/rendering/src/text/TextShaper";
import { reshapeWorldTextDescriptor, text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";

const metadata = { family: "Source fixture", license: "OFL-1.1", licenseUrl: "https://example.org/license" };

function fixtureBytes(): Uint8Array {
  const data = new Uint8Array(32);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(20, 28);
  view.setUint32(24, 4);
  return data;
}

function testFont(): LoadedFont {
  return { family: "AuraFont1", metadata, disposed: false, dispose() {} };
}

function measure(): TextMeasureContext {
  return {
    font: "",
    direction: "ltr",
    measureText(text) {
      return { width: [...text].filter((char) => char !== "\u2060").length };
    }
  };
}

type DrawnBounds = { left: number; right: number; top: number; bottom: number; width: number; height: number };
const drawn: DrawnBounds[] = [];

class MetricCanvas {
  width = 1;
  height = 1;
  readonly ctx = {
    font: "",
    direction: "ltr",
    fontKerning: "auto",
    letterSpacing: "0px",
    textBaseline: "alphabetic",
    textAlign: "left",
    fillStyle: "",
    measureText: (text: string) => ({
      width: [...text].length * 8,
      actualBoundingBoxLeft: text ? 40 : 0,
      actualBoundingBoxRight: text ? 44 : 0,
      actualBoundingBoxAscent: text ? 32 : 0,
      actualBoundingBoxDescent: text ? 24 : 0
    }),
    fillText: (text: string, x: number, y: number) => {
      if (!text) return;
      drawn.push({ left: x - 40, right: x + 44, top: y - 32, bottom: y + 24, width: this.width, height: this.height });
    },
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (const box of drawn) {
        for (let y = Math.max(0, Math.floor(box.top)); y < Math.min(this.height, Math.ceil(box.bottom)); y += 1) {
          for (let x = Math.max(0, Math.floor(box.left)); x < Math.min(this.width, Math.ceil(box.right)); x += 1) {
            data[(y * this.width + x) * 4 + 3] = 255;
          }
        }
      }
      return { data };
    }
  };
  getContext() { return this.ctx; }
}

afterEach(() => {
  drawn.length = 0;
  vi.unstubAllGlobals();
});

describe("WP-26 world-text source regressions", () => {
  it.each(["\u00a0", "\u2007", "\u202f", "\u2060", "\ufeff"])(
    "preserves and does not split a no-break joiner %j",
    (joiner) => {
      const input = `C A${joiner}B D`;
      const lines = shapeText(input, { font: testFont(), maxWidth: 3 }, measure()).lines.map((line) => line.text);
      expect(lines).toEqual(["C", `A${joiner}B`, "D"]);
      expect(shapeText(`A${joiner}B`, { font: testFont(), maxWidth: 1 }, measure()).lines.map((line) => line.text))
        .toEqual([`A${joiner}B`]);
    }
  );

  it("places measured italic and combining-mark ink inside the public font-backed texture", () => {
    vi.stubGlobal("OffscreenCanvas", MetricCanvas);
    const node = text3D("A\u0301", { font: testFont(), rasterSize: 16 }).toJSON();
    expect(node.text3D?.sdfDynamic?.image.coveredTexels).toBeGreaterThan(0);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.left).toBeGreaterThanOrEqual(0);
    expect(drawn[0]!.right).toBeLessThanOrEqual(drawn[0]!.width);
    expect(drawn[0]!.top).toBeGreaterThanOrEqual(0);
    expect(drawn[0]!.bottom).toBeLessThanOrEqual(drawn[0]!.height);
  });

  it("keeps overhanging ink across an empty line and maintains separate RTL anchors", () => {
    vi.stubGlobal("OffscreenCanvas", MetricCanvas);
    const node = text3D("אב\n\nA", { font: testFont(), rasterSize: 16, lineHeight: 0.5 }).toJSON();
    expect(drawn).toHaveLength(2);
    for (const box of drawn) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(box.width);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(box.height);
    }
    // Each run's ink box is its own retained atlas entry; the empty line needs none.
    expect(node.text3D?.sdfDynamic?.layout.quads.map((quad) => quad.glyph)).toEqual(["אב", "A"]);
  });

  it("rejects unreasonable measured ink bounds before resizing or reading the canvas", () => {
    let reads = 0;
    class OversizedCanvas {
      width = 1;
      height = 1;
      readonly ctx = {
        font: "", direction: "ltr", textBaseline: "middle", textAlign: "left",
        measureText: () => ({ width: 8, actualBoundingBoxLeft: 10000, actualBoundingBoxRight: 10000, actualBoundingBoxAscent: 1, actualBoundingBoxDescent: 1 }),
        getImageData: () => { reads += 1; return { data: new Uint8ClampedArray(0) }; }
      };
      getContext() { return this.ctx; }
    }
    vi.stubGlobal("OffscreenCanvas", OversizedCanvas);
    expect(() => text3D("A", { font: testFont(), rasterSize: 16 })).toThrow(/bounded raster/);
    expect(reads).toBe(0);
  });

  it("retains a copy of author style when live text is reshaped", () => {
    vi.stubGlobal("OffscreenCanvas", MetricCanvas);
    const style = { outlineWidthEm: 0, shadowOffsetEm: [0, 0] as [number, number] };
    const node = text3D("A", { font: testFont(), rasterSize: 16, sdfStyle: style }).toJSON();
    style.outlineWidthEm = Number.NaN;
    style.shadowOffsetEm[0] = 100;
    expect(node.text3D?.sdfStyle?.outlineWidthEm).toBe(0);
    expect(node.text3D?.sdfStyle?.shadowOffsetEm).toEqual([0, 0]);
    const next = reshapeWorldTextDescriptor(node.text3D!, "B");
    expect(next.sdfDynamic?.layout.style.outlineWidthEm).toBe(0);
    expect(next.sdfDynamic?.layout.style.shadowOffsetEm).toEqual([0, 0]);
  });

  it("keeps a font disposable after a transient font-set deletion failure", async () => {
    const face = { load: async () => face };
    const deletion = vi.fn().mockImplementationOnce(() => { throw new Error("delete failed"); }).mockReturnValue(true);
    const platform: FontLoaderPlatform = { createFace: () => face, fonts: { add() {}, delete: deletion } };
    const font = await loadFont({ data: fixtureBytes(), metadata }, { platform });
    expect(() => font.dispose()).toThrow("delete failed");
    expect(font.disposed).toBe(false);
    font.dispose();
    expect(font.disposed).toBe(true);
    font.dispose();
    expect(deletion).toHaveBeenCalledTimes(2);
  });
});
