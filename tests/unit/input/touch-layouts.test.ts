import { describe, expect, it } from "vitest";
import { createTouchLayoutPreset, TOUCH_LAYOUT_GENRES, type TouchLayoutRect } from "@aura3d/input";

const VIEWPORT = { width: 390, height: 844 };

function rectsFor(genre: (typeof TOUCH_LAYOUT_GENRES)[number]): Readonly<Record<string, TouchLayoutRect>> {
  return createTouchLayoutPreset(genre, { width: VIEWPORT.width, height: VIEWPORT.height }).rects;
}

describe("touch layout presets (PRD-09 1765)", () => {
  it("exposes the eight genres", () => {
    expect([...TOUCH_LAYOUT_GENRES].sort()).toEqual(
      ["aim-drag", "fight", "flight", "flippers", "lane-swipe", "platform", "race", "twin-stick"].sort()
    );
  });

  it("every control target is at least 48 CSS px on both axes at 390x844", () => {
    for (const genre of TOUCH_LAYOUT_GENRES) {
      for (const [name, r] of Object.entries(rectsFor(genre))) {
        expect(r.w * VIEWPORT.width, `${genre}/${name} width`).toBeGreaterThanOrEqual(48);
        expect(r.h * VIEWPORT.height, `${genre}/${name} height`).toBeGreaterThanOrEqual(48);
      }
    }
  });

  it("every rect stays inside the safe area", () => {
    for (const genre of TOUCH_LAYOUT_GENRES) {
      for (const [name, r] of Object.entries(rectsFor(genre))) {
        expect(r.x, `${genre}/${name} x`).toBeGreaterThanOrEqual(0);
        expect(r.y, `${genre}/${name} y`).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `${genre}/${name} right`).toBeLessThanOrEqual(1.001);
        expect(r.y + r.h, `${genre}/${name} bottom`).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it("every button binding has a rect", () => {
    for (const genre of TOUCH_LAYOUT_GENRES) {
      const preset = createTouchLayoutPreset(genre, { width: VIEWPORT.width, height: VIEWPORT.height });
      const names = new Set(Object.keys(preset.rects));
      for (const b of [...preset.hold, ...preset.pulse]) {
        const base = b.elementId.split(":").pop()!;
        expect(names.has(base), `${genre}/${base}`).toBe(true);
      }
    }
  });
});
