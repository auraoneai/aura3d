import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import { shapeText, type TextDirection, type TextMeasureContext } from "../../../packages/rendering/src/text/TextShaper";
import { createDynamicSdfText } from "../../../packages/rendering/src/SdfText";

const font: LoadedFont = {
  family: "AuraFont1",
  metadata: { family: "Test", license: "OFL-1.1", licenseUrl: "https://example.org/license" },
  disposed: false,
  dispose() {}
};

function measureContext(): TextMeasureContext & { calls: { text: string; direction: CanvasDirection }[] } {
  return {
    font: "", direction: "ltr", calls: [],
    measureText(text) {
      this.calls.push({ text, direction: this.direction });
      return { width: [...text].length };
    }
  };
}

function direction(text: string, requested: TextDirection = "auto"): "ltr" | "rtl" {
  return shapeText(text, { font, direction: requested }, measureContext()).lines[0]!.direction;
}

function formattingMeasureContext(): TextMeasureContext & { calls: { text: string; direction: CanvasDirection }[] } {
  const context = measureContext();
  context.measureText = function (text) {
    this.calls.push({ text, direction: this.direction });
    return { width: [...text.replace(/[\u202A-\u202E\u2066-\u2069]/g, "")].length };
  };
  return context;
}

afterEach(() => vi.unstubAllGlobals());

describe("automatic Unicode paragraph direction", () => {
  it.each([
    ["Samaritan", "\u0800", "rtl"],
    ["Mandaic", "\u0840", "rtl"],
    ["Imperial Aramaic", "\u{10840}", "rtl"],
    ["Phoenician", "\u{10900}", "rtl"],
    ["Old North Arabian", "\u{10A80}", "rtl"],
    ["Hanifi Rohingya", "\u{10D00}", "rtl"],
    ["Mende Kikakui", "\u{1E800}", "rtl"],
    ["Adlam", "\u{1E900}", "rtl"],
    ["Arabic mathematical symbol", "\u{1EE00}", "rtl"],
    ["Hebrew punctuation", "\u05BE", "rtl"],
    ["Arabic letter mark", "\u061C", "rtl"],
    ["right-to-left mark", "\u200F", "rtl"],
    ["left-to-right mark", "\u200E", "ltr"],
    ["strong Devanagari spacing mark", "\u0903", "ltr"]
  ] as const)("recognizes %s as strong", (_name, first, expected) => {
    // A following opposite-direction letter exposes any missed first strong.
    expect(direction(first + (expected === "ltr" ? "א" : "A"))).toBe(expected);
  });

  it.each([
    ["Arabic-Indic digits", "\u0661\u0662\u0663", "א", "rtl"],
    ["European digits and punctuation", "123 !?", "א", "rtl"],
    ["Hebrew nonspacing mark", "\u05B0", "A", "ltr"],
    ["combining acute", "\u0301", "א", "rtl"],
    ["Arabic number sign", "\u0600", "A", "ltr"],
    ["emoji", "🙂", "א", "rtl"],
    ["superscript number", "²", "א", "rtl"]
  ] as const)("ignores non-strong %s", (_name, prefix, first, expected) => {
    expect(direction(prefix + first)).toBe(expected);
  });

  it("uses the Unicode 16 default classes for unassigned code points and noncharacters", () => {
    expect(direction("\u0378א")).toBe("ltr"); // Unassigned, default L.
    expect(direction("\u0590A")).toBe("rtl"); // Unassigned, default R.
    expect(direction("\u088FA")).toBe("rtl"); // Unassigned, default AL.
    expect(direction("\uFDD0א")).toBe("rtl"); // Noncharacter, BN.
    expect(direction("\u{10FFFF}א")).toBe("rtl"); // Plane-end noncharacter, BN.
    expect(direction("\uD800א")).toBe("ltr"); // Unpaired surrogate, L in the pinned data.
  });

  it("skips embedding and override controls while considering their content", () => {
    expect(direction("\u202Eabc\u202Cא")).toBe("ltr");
    expect(direction("\u202Aא\u202CA")).toBe("rtl");
    expect(direction("\u202B\u202C!?")).toBe("ltr");
  });

  it("excludes all kinds of isolate, including their nested contents", () => {
    expect(direction("\u2067שלום\u2069A")).toBe("ltr");
    expect(direction("\u2066abc\u2069א")).toBe("rtl");
    expect(direction("\u2068שלום\u2069A")).toBe("ltr");
    expect(direction("\u2067abc\u2068אבג\u2069xyz\u2069א")).toBe("rtl");
    expect(direction("\u2067א")).toBe("ltr"); // Unmatched isolate consumes the rest.
    expect(direction("\u2069א")).toBe("rtl"); // Unmatched PDI has no effect.
    const deep = "\u2066".repeat(250) + "A" + "\u2069".repeat(249) + "A\u2069א";
    expect(direction(deep)).toBe("rtl"); // Match nesting even beyond embedding-level limits.
  });

  it("defaults to LTR without any first strong character and bounds pathological nesting", () => {
    expect(direction("123 🙂 \u0301")).toBe("ltr");
    expect(direction("\u2066".repeat(16000))).toBe("ltr");
    expect(() => direction("\u2066".repeat(16385))).toThrow(/16384/);
  });

  it("applies explicit direction without changing full-line text or platform measurement", () => {
    const source = "AV fi \u2067שלום\u2069 אב";
    for (const forced of ["ltr", "rtl"] as const) {
      const context = measureContext();
      const result = shapeText(source, { font, direction: forced }, context);
      expect(result.lines).toEqual([{ text: source, width: [...source].length, direction: forced }]);
      expect(context.calls).toEqual([{ text: source, direction: forced }]);
    }
  });

  it("detects direction independently at each Unicode paragraph boundary", () => {
    const source = "A\r\nא\rB\nא\u001CA\u001Dא\u001EA\u0085א\u2029A";
    const context = measureContext();
    const result = shapeText(source, { font }, context);
    expect(result.lines.map((line) => line.text)).toEqual(["A", "א", "B", "א", "A", "א", "A", "א", "A"]);
    expect(result.lines.map((line) => line.direction)).toEqual(["ltr", "rtl", "ltr", "rtl", "ltr", "rtl", "ltr", "rtl", "ltr"]);
    expect(context.calls).toEqual(result.lines.map(({ text, direction }) => ({ text, direction })));
    // An isolate cannot consume text from the following paragraph.
    expect(shapeText("\u2066A\u2029א", { font }, measureContext()).lines.map((line) => line.direction)).toEqual(["ltr", "rtl"]);
    expect(shapeText("\r\n\r\n", { font }, measureContext()).lines.map((line) => line.text)).toEqual(["", "", ""]);
    // The Unicode line separator has bidi class WS rather than B.
    expect(shapeText("A\u2028א", { font }, measureContext()).lines.map((line) => line.text)).toEqual(["A\u2028א"]);
  });

  it("keeps the paragraph direction on all of its wrapped lines", () => {
    const context = measureContext();
    const result = shapeText("אבג דהו זחט", { font, maxWidth: 4 }, context);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.every((line) => line.direction === "rtl")).toBe(true);
    expect(context.calls.every((call) => call.direction === "rtl")).toBe(true);
  });
});

describe("bidi formatting at wrapped line boundaries", () => {
  it.each([
    ["left-to-right embedding", "\u202A", "\u202C"],
    ["right-to-left embedding", "\u202B", "\u202C"],
    ["left-to-right override", "\u202D", "\u202C"],
    ["right-to-left override", "\u202E", "\u202C"],
    ["left-to-right isolate", "\u2066", "\u2069"],
    ["right-to-left isolate", "\u2067", "\u2069"],
    ["first-strong isolate", "\u2068", "\u2069"]
  ] as const)("rejects a %s crossing a wrap but allows it wholly within one line", (_name, open, close) => {
    const spanning = `${open}ABCD${close}`;
    for (const explicit of ["auto", "ltr", "rtl"] as const) {
      expect(() => shapeText(spanning, { font, maxWidth: 2, direction: explicit }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
    }
    const contained = `${open}AB${close} CD`;
    const result = shapeText(contained, { font, maxWidth: 2 }, formattingMeasureContext());
    expect(result.lines.map((line) => line.text)).toEqual([`${open}AB${close}`, "CD"]);
    expect(shapeText(spanning, { font }, formattingMeasureContext()).lines[0]!.text).toBe(spanning);
  });

  it("tracks isolates and embeddings independently, including nested and unmatched controls", () => {
    // The PDF inside the isolate cannot close its surrounding embedding.
    expect(() => shapeText("\u202A\u2067A\u202C\u2069 B\u202C", { font, maxWidth: 1 }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
    // An unmatched PDI cannot close an enclosing embedding either.
    expect(() => shapeText("\u202AA\u2069 B\u202C", { font, maxWidth: 1 }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
    // PDI discards the embedding opened inside its isolate before the wrap.
    const closed = shapeText("\u2067\u202AA\u2069 B C", { font, maxWidth: 1 }, formattingMeasureContext());
    expect(closed.lines.map((line) => line.text)).toEqual(["\u2067\u202AA\u2069", "B", "C"]);
    const unmatched = shapeText("\u202C\u2069AB CD", { font, maxWidth: 2 }, formattingMeasureContext());
    expect(unmatched.lines.map((line) => line.text)).toEqual(["\u202C\u2069AB", "CD"]);
    const opens = "\u2066".repeat(200);
    const closes = "\u2069".repeat(200);
    const deep = shapeText(`${opens}A${closes} B`, { font, maxWidth: 1 }, formattingMeasureContext());
    expect(deep.lines.map((line) => line.text)).toEqual([`${opens}A${closes}`, "B"]);
    expect(() => shapeText(`${opens}A B${closes}`, { font, maxWidth: 1 }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
  });

  it("resets scope at paragraph breaks and does not reject an unclosed scope on the last line", () => {
    const paragraphs = shapeText("\u202EAB\nCD", { font, maxWidth: 2 }, formattingMeasureContext());
    expect(paragraphs.lines.map((line) => line.text)).toEqual(["\u202EAB", "CD"]);
    const trailingSpace = shapeText("\u2066AB  ", { font, maxWidth: 2 }, formattingMeasureContext());
    expect(trailingSpace.lines.map((line) => line.text)).toEqual(["\u2066AB"]);
    expect(() => shapeText("\u2066AB CD", { font, maxWidth: 2 }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
    expect(() => shapeText("\u2066AB \u2069", { font, maxWidth: 2 }, formattingMeasureContext())).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
  });

  it("measures and paints the same logical runs, and rejects before painting unsafe wraps", () => {
    const measured: { text: string; direction: string }[] = [];
    const painted: { text: string; direction: string }[] = [];
    let reads = 0;
    class Canvas {
      width = 1;
      height = 1;
      readonly ctx = {
        font: "", direction: "ltr", textBaseline: "", fillStyle: "", textAlign: "", fontKerning: "auto", letterSpacing: "0px",
        measureText(text: string) {
          measured.push({ text, direction: this.direction });
          return { width: [...text.replace(/[\u202A-\u202E\u2066-\u2069]/g, "")].length * 8 };
        },
        fillText(text: string) { painted.push({ text, direction: this.direction }); },
        getImageData: () => { reads += 1; return { data: new Uint8ClampedArray(this.width * this.height * 4).fill(255) }; }
      };
      getContext() { return this.ctx; }
    }
    vi.stubGlobal("OffscreenCanvas", Canvas);
    const source = "\u2067AB\u2069 CD";
    const output = createDynamicSdfText(source, { font, size: 1, rasterSize: 16, maxWidth: 1, direction: "rtl" });
    expect(output.layout.text).toBe(source);
    expect(output.layout.quads.map((quad) => quad.glyph)).toEqual(["\u2067AB\u2069", "CD"]);
    expect(painted).toEqual([{ text: "\u2067AB\u2069", direction: "rtl" }, { text: "CD", direction: "rtl" }]);
    for (const line of painted) expect(measured).toContainEqual(line);
    painted.length = 0;
    const priorReads = reads;
    expect(() => createDynamicSdfText("\u2067ABCD\u2069", { font, size: 1, rasterSize: 16, maxWidth: 1 })).toThrow(/AURA_TEXT_BIDI_WRAP_UNSUPPORTED/);
    expect(painted).toEqual([]);
    expect(reads).toBe(priorReads);
  });
});
