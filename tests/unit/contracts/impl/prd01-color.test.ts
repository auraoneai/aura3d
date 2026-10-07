/**
 * PRD-01 Phase-1 C-06 real color-parser tests (lane 01, §15 Phase-1).
 * Grammar: #rgb / #rgba / #rrggbb / #rrggbbaa, rgb()/rgba() comma + space
 * syntax, hsl()/hsla(), 148 CSS named colors, numbers 0xRRGGBB(+AA).
 * `parseAuraColor` returns linear-light RGBA via the exact piecewise sRGB
 * transfer; `parseAuraColorSrgb` returns sRGB-encoded RGBA.
 */

import { describe, expect, it } from "vitest";
import { srgbToLinearChannel } from "@aura3d/rendering";

import {
  AuraColorParseError,
  parseAuraColor,
  parseAuraColorSrgb
} from "../../../../packages/engine/src/agent-api/color";

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
