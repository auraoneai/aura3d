import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AIR_LOW,
  AIR_RUNGS,
  HUD_ICONS,
  SPEEDO_MAX_KMH,
  airRungsLit,
  arcPoint,
  clusterMarkup,
  speedoArcPath,
  speedoPercent
} from "../../../apps/showcase-roadster-rush/src/native/hudCluster";

const css = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/native/hud.css"), "utf8");
const hud = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/native/hud.ts"), "utf8");

describe("Apex Overdrive motorsport cluster (GU47 AO-H2)", () => {
  it("maps speed onto the arc's share of full scale and air onto lit rungs", () => {
    expect(speedoPercent(0)).toBe(0);
    expect(speedoPercent(SPEEDO_MAX_KMH / 2)).toBe(50);
    expect(speedoPercent(SPEEDO_MAX_KMH)).toBe(100);
    expect(speedoPercent(SPEEDO_MAX_KMH * 2)).toBe(100);
    expect(speedoPercent(Number.NaN)).toBe(0);
    expect(speedoPercent(64 * 3.6)).toBeGreaterThan(70);
    expect(airRungsLit(0)).toBe(0);
    expect(airRungsLit(0.01)).toBe(1);
    expect(airRungsLit(0.5)).toBe(AIR_RUNGS / 2);
    expect(airRungsLit(1)).toBe(AIR_RUNGS);
    expect(airRungsLit(3)).toBe(AIR_RUNGS);
    expect(AIR_LOW).toBe(0.2);
  });

  it("draws a 240-degree arc open at the bottom (large-arc, clockwise)", () => {
    expect(arcPoint(210)).toEqual([15.36, 72]);
    expect(arcPoint(-30)).toEqual([84.64, 72]);
    expect(arcPoint(90)).toEqual([50, 12]);
    expect(speedoArcPath()).toBe("M 15.36 72 A 40 40 0 1 1 84.64 72");
  });

  it("ships five inline single-colour glyphs with nothing to load", () => {
    expect(Object.keys(HUD_ICONS).sort()).toEqual(["air", "magnet", "multiplier", "rocket", "shield"]);
    for (const glyph of Object.values(HUD_ICONS)) {
      expect(glyph).toMatch(/^<svg class="rr-glyph" viewBox="0 0 16 16"/);
      expect(glyph).toContain("currentColor");
      expect(glyph).toContain('aria-hidden="true"');
      expect(glyph).not.toMatch(/href|url\(|<image|<text/);
    }
  });

  it("mounts the gauge (pathLength 100, palette gradient) and an eight-rung AIR ladder in the score card", () => {
    const markup = clusterMarkup();
    expect(markup.match(/class="rr-rung"/g) ?? []).toHaveLength(AIR_RUNGS);
    expect(markup.match(/pathLength="100"/g) ?? []).toHaveLength(2);
    const stops = [...markup.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(stops).toEqual(["#1f3fa8", "#4df0ff", "#ff8a3d"]);
    expect(hud).toContain("${clusterMarkup()}");
    expect(hud).toContain("airRungsLit(air)");
    expect(hud).toContain("strokeDasharray");
  });

  it("keeps 44 px targets on every pointer and no rival red in the HUD chrome", () => {
    expect(css).toMatch(/\.rr-icon-btn \{ width: 44px; height: 44px;/);
    expect(css).toMatch(/\.rr-btn \{ height: 44px;/);
    for (const red of ["#ff2a3c", "#ff2a3a", "#ff4d5e", "#ff1830"]) expect(css.toLowerCase()).not.toContain(red);
  });

  it("reduced motion: no low-air pulse and no gauge transition; phones get the compact cluster last", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.rr-air\.rr-low \.rr-rung\.rr-on \{ animation: none; \}/);
    expect(reduced).toMatch(/\.rr-gauge-value \{ transition: none; \}/);
    const phone = css.lastIndexOf("@media (max-width: 760px)");
    expect(phone).toBeGreaterThan(css.indexOf(".rr-mile { display: grid"));
    expect(css.slice(phone)).toContain(".rr-gauge { width: 84px; height: 67px; }");
  });
});
