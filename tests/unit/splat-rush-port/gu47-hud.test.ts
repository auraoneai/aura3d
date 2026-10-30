import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_CARNIVAL_CLASS, HUD_INK, HUD_PAPER, comboTubeFill, contrastRatio } from "../../../examples/splat-rush-port/hud";
import { LOOKS } from "../../../examples/splat-rush-port/look";
import { CONFIG } from "../../../examples/splat-rush-port/sim";

const html = readFileSync(new URL("../../../examples/splat-rush-port/index.html", import.meta.url), "utf8");
const carnivalCss = (html.split("GU47 CR-H1")[1]?.split("</style>")[0] ?? "").replace(/^[\s\S]*?\*\//, "");

describe("GU47 CR-H1 paint-world HUD", () => {
  it("plum ink on cream paper is >= 4.5:1, so every sky stage reads the same", () => {
    expect(contrastRatio(HUD_INK, HUD_PAPER)).toBeGreaterThanOrEqual(4.5);
    // the chips are opaque paper; the sky behind them never touches the text
    for (const stage of LOOKS.carnival.sky?.stages ?? []) expect(contrastRatio(HUD_INK, HUD_PAPER)).toBeGreaterThan(contrastRatio(HUD_PAPER, stage.horizon));
  });

  it("the paint-tube meter fills towards the next multiplier and is full at the cap", () => {
    expect(comboTubeFill(0, 1)).toBe(0);
    expect(comboTubeFill(1, 1)).toBeCloseTo(1 / CONFIG.COMBO_PER_MULT, 9);
    expect(comboTubeFill(CONFIG.COMBO_PER_MULT, 2)).toBe(0);
    expect(comboTubeFill(40, CONFIG.MAX_MULT)).toBe(1);
  });

  it("carnival rules are scoped to the body class and use the licensed face only", () => {
    expect(carnivalCss.length).toBeGreaterThan(0);
    expect(carnivalCss).not.toMatch(/Trebuchet|system-ui|sans-serif/);
    expect(carnivalCss).toContain("'Splat Display'");
    for (const rule of carnivalCss.split("}").map((r) => r.trim()).filter((r) => r.includes("{") && !r.startsWith("@media") && !r.startsWith("/*"))) {
      const selector = rule.slice(0, rule.indexOf("{")).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (/^#hud-|^\.paint-only$/.test(selector)) continue; // carnival-only elements, hidden unless .look-carnival
      expect(selector, rule).toMatch(new RegExp(`\\.${HUD_CARNIVAL_CLASS}`));
    }
    expect(html).toMatch(/id="hud-paint" class="paint-only"/);
  });

  it("the mute and pause buttons keep their size and spot (hit test unchanged)", () => {
    expect(carnivalCss).not.toMatch(/icon-btn[^{]*\{[^}]*(width|height|left|bottom|position)/);
  });
});
