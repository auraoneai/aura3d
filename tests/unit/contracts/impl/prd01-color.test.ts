/**
 * PRD-01 Phase-1 C-06 real color-parser tests (lane 01, §15 Phase-1).
 * Grammar: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb()/rgba() comma + space
 * syntax, hsl()/hsla(), 148 CSS named colors, numbers 0xRRGGBB(+AA).
 * `parseAuraColor` returns linear-light RGBA via the exact piecewise sRGB
 * transfer; `parseAuraColorSrgb` returns sRGB-encoded RGBA.
 */

import { afterEach, describe, expect, it } from "vitest";
import { srgbToLinearChannel } from "@aura3d/rendering";

import {
  AuraColorParseError,
  parseAuraColor,
  parseAuraColorSrgb
} from "../../../../packages/engine/src/agent-api/color";
import {
  prd01ColorParsingEnabled,
  setPrd01ColorParsing
} from "../../../../packages/engine/src/agent-api/compiler/color";
import {
  colorToAcesInputClearColor,
  colorToClearColor,
  colorToLinearRgb,
  colorToLinearRgba,
  colorToRgba
} from "../../../../packages/engine/src/agent-api/colorUtils";
import { colorToRgb } from "../../../../packages/engine/src/agent-api/sceneMath";

describe("prd01 C-06 color parser", () => {
  it("parses all hex shapes", () => {
    expect(parseAuraColorSrgb("#f00")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("#f008")).toEqual([1, 0, 0, 0x88 / 255]);
    expect(parseAuraColorSrgb("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("#33669980")).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255, 0x80 / 255]);
    expect(parseAuraColorSrgb("  #ABCDEF  ")).toEqual([0xab / 255, 0xcd / 255, 0xef / 255, 1]);
  });

  it("parses rgb()/rgba() comma and space syntax with percents", () => {
    expect(parseAuraColorSrgb("rgb(255, 0, 0)")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("rgba(255,0,0,0.5)")).toEqual([1, 0, 0, 0.5]);
    expect(parseAuraColorSrgb("rgb(255 0 0)")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("rgb(255 0 0 / 0.5)")).toEqual([1, 0, 0, 0.5]);
    expect(parseAuraColorSrgb("rgb(100% 0% 0% / 50%)")).toEqual([1, 0, 0, 0.5]);
    expect(parseAuraColorSrgb("rgba(51,102,153,25%)")).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255, 0.25]);
  });

  it("parses hsl()/hsla() including deg/turn units", () => {
    expect(parseAuraColorSrgb("hsl(0, 100%, 50%)")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("hsl(120, 100%, 50%)")).toEqual([0, 1, 0, 1]);
    expect(parseAuraColorSrgb("hsl(240deg, 100%, 50%)")).toEqual([0, 0, 1, 1]);
    const halfTurn = parseAuraColorSrgb("hsla(0.5turn, 100%, 50%, 0.25)");
    expect(halfTurn[0]).toBeCloseTo(0, 6);
    expect(halfTurn[1]).toBeCloseTo(1, 6);
    expect(halfTurn[2]).toBeCloseTo(1, 6);
    expect(halfTurn[3]).toBe(0.25);
    expect(parseAuraColorSrgb("hsl(360, 100%, 50%)")).toEqual([1, 0, 0, 1]); // wraps
    const [r, g, b] = parseAuraColorSrgb("hsl(30 100% 50%)");
    expect(r).toBeCloseTo(1, 6);
    expect(g).toBeCloseTo(0.5, 6);
    expect(b).toBeCloseTo(0, 6);
  });

  it("parses CSS named colors (148 coverage spot-check)", () => {
    expect(parseAuraColorSrgb("red")).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb("rebeccapurple")).toEqual([0x66 / 255, 0x33 / 255, 0x99 / 255, 1]);
    expect(parseAuraColorSrgb("mediumspringgreen")).toEqual([0, 0xfa / 255, 0x9a / 255, 1]);
    expect(parseAuraColorSrgb("WhiteSmoke")).toEqual([0xf5 / 255, 0xf5 / 255, 0xf5 / 255, 1]);
    expect(parseAuraColorSrgb("grey")).toEqual([0x80 / 255, 0x80 / 255, 0x80 / 255, 1]);
    expect(parseAuraColorSrgb("darkslategray")).toEqual(parseAuraColorSrgb("darkslategrey"));
  });

  it("parses numeric colors", () => {
    expect(parseAuraColorSrgb(0xff0000)).toEqual([1, 0, 0, 1]);
    expect(parseAuraColorSrgb(0x336699)).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255, 1]);
  });

  it("parseAuraColor returns linear-light via the exact piecewise transfer", () => {
    const [r, g, b, a] = parseAuraColor("#336699");
    expect(r).toBeCloseTo(srgbToLinearChannel(0x33 / 255), 8);
    expect(g).toBeCloseTo(srgbToLinearChannel(0x66 / 255), 8);
    expect(b).toBeCloseTo(srgbToLinearChannel(0x99 / 255), 8);
    expect(a).toBe(1);
    // Piecewise knee: 0.04045 is the linear-segment boundary.
    const [k] = parseAuraColor("#0a0a0a");
    expect(k).toBeCloseTo((0x0a / 255) / 12.92, 8);
  });

  it("invalid input throws AuraColorParseError carrying the input", () => {
    for (const bad of ["", "#ff", "#ff0g", "#gg0000", "rgb(1,2)", "rgb(1,2,3,4,5)", "notacolor", "hsl(abc, 0, 0)", {}, null, undefined]) {
      try {
        parseAuraColor(bad as never);
        expect.unreachable(`accepted ${String(bad)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(AuraColorParseError);
        expect((error as AuraColorParseError).input).toBe(bad);
      }
    }
  });
});

/* ------------------------------------------------------------------------ */
/* 01-S5: the 40-row table, plus the compiler/color.ts helper delegation.    */

const h = (v: number): number => v / 255;
type Row = readonly [input: string | number, expected: readonly [number, number, number, number] | "invalid"];

const COLOR_TABLE: readonly Row[] = [
  ["#f00", [1, 0, 0, 1]],
  ["#f80", [1, h(0x88), 0, 1]],
  ["#f808", [1, h(0x88), 0, h(0x88)]],
  ["#ff8800", [1, h(0x88), 0, 1]],
  ["#FF8800", [1, h(0x88), 0, 1]],
  ["#ff880080", [1, h(0x88), 0, h(0x80)]],
  ["  #336699 ", [h(0x33), h(0x66), h(0x99), 1]],
  ["rgb(255, 136, 0)", [1, h(0x88), 0, 1]],
  ["rgba(255,136,0,0.5)", [1, h(0x88), 0, 0.5]],
  ["rgb(255 136 0)", [1, h(0x88), 0, 1]],
  ["rgb(255 136 0 / 50%)", [1, h(0x88), 0, 0.5]],
  ["rgb(100%, 0%, 0%)", [1, 0, 0, 1]],
  ["hsl(0, 100%, 50%)", [1, 0, 0, 1]],
  ["hsl(120deg 100% 50%)", [0, 1, 0, 1]],
  ["hsla(240, 100%, 50%, 0.25)", [0, 0, 1, 0.25]],
  ["hsl(0, 0%, 100%)", [1, 1, 1, 1]],
  ["hsl(0, 0%, 0%)", [0, 0, 0, 1]],
  ["orange", [1, h(0xa5), 0, 1]],
  ["rebeccapurple", [h(0x66), h(0x33), h(0x99), 1]],
  ["Orange", [1, h(0xa5), 0, 1]],
  ["white", [1, 1, 1, 1]],
  ["black", [0, 0, 0, 1]],
  ["cornflowerblue", [h(0x64), h(0x95), h(0xed), 1]],
  ["lightgoldenrodyellow", [h(0xfa), h(0xfa), h(0xd2), 1]],
  ["gray", [h(0x80), h(0x80), h(0x80), 1]],
  [0xff8800, [1, h(0x88), 0, 1]],
  [0x000000, [0, 0, 0, 1]],
  [0xffffff, [1, 1, 1, 1]],
  [0x336699, [h(0x33), h(0x66), h(0x99), 1]],
  ["rgb(0,0,0)", [0, 0, 0, 1]],
  ["#000", [0, 0, 0, 1]],
  ["#fff", [1, 1, 1, 1]],
  ["", "invalid"],
  ["#ff", "invalid"],
  ["#ggg", "invalid"],
  ["notacolor", "invalid"],
  ["rgb(1,2)", "invalid"],
  ["hsl(abc, 0, 0)", "invalid"],
  ["#12345", "invalid"],
  ["rgb(1,2,3,4,5)", "invalid"]
];

const LEGACY_NAVY = [0.02, 0.025, 0.035, 1] as const;

function expectRgba(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(4);
  for (let i = 0; i < 4; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, 9);
}

describe("01-S5 prd01-color 40-row table", () => {
  it("has exactly 40 rows", () => {
    expect(COLOR_TABLE).toHaveLength(40);
  });

  it.each(COLOR_TABLE.map((row, index) => [index + 1, ...row] as const))("row %i: %j", (_index, input, expected) => {
    if (expected === "invalid") {
      expect(() => parseAuraColorSrgb(input)).toThrow(AuraColorParseError);
      expect(() => parseAuraColor(input)).toThrow(AuraColorParseError);
      return;
    }
    expectRgba(parseAuraColorSrgb(input), expected);
    const linear = parseAuraColor(input);
    expectRgba(linear, [srgbToLinearChannel(expected[0]), srgbToLinearChannel(expected[1]), srgbToLinearChannel(expected[2]), expected[3]]);
  });
});

describe("compiler/color.ts: colorUtils helpers always parse (no flag gate), invalid throws COLOR_INVALID", () => {
  afterEach(() => setPrd01ColorParsing(null));

  const helpers = {
    colorToRgba: (c: string) => colorToRgba(c),
    colorToClearColor: (c: string) => colorToClearColor(c),
    colorToLinearRgba: (c: string) => colorToLinearRgba(c),
    colorToLinearRgb: (c: string) => colorToLinearRgb(c),
    colorToRgb: (c: string) => colorToRgb(c),
    colorToAcesInputClearColor: (c: string) => colorToAcesInputClearColor(c)
  } as const;

  it("no policy installed: CSS forms parse (no near-black fallback)", () => {
    expect(prd01ColorParsingEnabled()).toBe(false);
    expect(colorToClearColor("orange")).toEqual(parseAuraColorSrgb("orange"));
    expect(colorToRgba("#f80")).toEqual([1, h(0x88), 0, 1]);
    expect(colorToClearColor("hsl(205, 65%, 58%)")).not.toEqual(LEGACY_NAVY);
  });

  it("hex colours are byte-identical to the legacy hex path in every policy state", () => {
    let seed = 7;
    const inputs = Array.from({ length: 50 }, () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return `#${(seed & 0xffffff).toString(16).padStart(6, "0")}`;
    });
    const legacyHex = (c: string): readonly number[] => {
      const v = Number.parseInt(c.slice(1), 16);
      return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255, 1];
    };
    for (const input of inputs) {
      for (const mode of [null, { warn: () => undefined }, { strict: true }] as const) {
        setPrd01ColorParsing(mode);
        expect(colorToClearColor(input)).toEqual(legacyHex(input));
        expect(colorToRgba(input)).toEqual(legacyHex(input));
        const lin = colorToLinearRgba(input);
        for (let i = 0; i < 3; i += 1) expect(lin[i]).toBe(srgbToLinearChannel(legacyHex(input)[i]!));
      }
    }
    for (const helper of Object.values(helpers)) expect(helper("#336699")).toBeDefined();
  });

  it("every valid table row parses through the sRGB and linear helpers", () => {
    for (const [input, expected] of COLOR_TABLE) {
      if (expected === "invalid" || typeof input !== "string") continue;
      expectRgba(colorToClearColor(input), expected);
      expectRgba(colorToLinearRgba(input), [srgbToLinearChannel(expected[0]), srgbToLinearChannel(expected[1]), srgbToLinearChannel(expected[2]), expected[3]]);
    }
  });

  it("parses transparent and oklch", () => {
    expect(parseAuraColorSrgb("transparent")).toEqual([0, 0, 0, 0]);
    const white = parseAuraColorSrgb("oklch(1 0 0)");
    for (let i = 0; i < 3; i += 1) expect(white[i]).toBeCloseTo(1, 2);
    const red = parseAuraColorSrgb("oklch(62.8% 0.2577 29.23)");
    expect(red[0]).toBeCloseTo(1, 1);
    expect(red[1]).toBeLessThan(0.05);
    expect(red[2]).toBeLessThan(0.05);
    expect(parseAuraColorSrgb("oklch(0.5 0.1 120 / 0.3)")[3]).toBe(0.3);
  });

  it.each([[null], [{ warn: () => undefined }], [{ strict: true }]] as const)("invalid input throws COLOR_INVALID in every policy (%j)", (mode) => {
    setPrd01ColorParsing(mode);
    for (const helper of Object.values(helpers)) {
      try {
        helper("notacolor");
        expect.unreachable("accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(AuraColorParseError);
        expect((error as AuraColorParseError).code).toBe("COLOR_INVALID");
        expect((error as Error).message).toContain("notacolor");
      }
    }
  });

  it("entry-point validation names the option", async () => {
    const { material } = await import("../../../../packages/engine/src/agent-api/nodes/material");
    const { scene } = await import("../../../../packages/engine/src/agent-api/nodes/scene");
    const { lights } = await import("../../../../packages/engine/src/agent-api/nodes/lights");
    expect(() => material.pbr({ color: "hsl(banana)" })).toThrow(/material\.pbr\(\{ color \}\)/);
    expect(() => scene().background("nope")).toThrow(/background/);
    expect(() => lights.directional({ color: "nope" })).toThrow(/lights\.directional/);
    expect(() => material.pbr({ color: "hsl(205, 65%, 58%)" })).not.toThrow();
  });
});
