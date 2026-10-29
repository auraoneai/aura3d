import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM tool without types
import { CREDIT_NOTE, CREDIT_STYLE, PORT_PAGES, appPagePath, composePortPage, pickCreditSpot } from "../../tools/showcase-port-pages/lib.mjs";

type Spot = { left?: number; right?: number; top?: number; bottom?: number };
const pick = (view: { w: number; h: number }, size: { w: number; h: number }, obstacles: { x: number; y: number; w: number; h: number }[]) =>
  pickCreditSpot(view, size, obstacles, 8) as { spot: Spot; overlap: number; index: number };

describe("Built with Aura3D credit placement (audit cross-cutting, splat-rush C3, wind-wanders WW-2)", () => {
  it("keeps bottom-left when nothing is there", () => {
    expect(pick({ w: 1440, h: 900 }, { w: 400, h: 27 }, []).spot).toEqual({ left: 8, bottom: 8 });
  });

  it("leaves Chroma Roll's mute button free at 1440x900", () => {
    // Live rects from the audit: mute [16,840,44,44]; the old credit covered its lower half.
    const mute = { x: 16, y: 840, w: 44, h: 44 };
    const r = pick({ w: 1440, h: 900 }, { w: 400, h: 27 }, [mute]);
    expect(r.overlap).toBe(0);
    expect(r.spot).toEqual({ right: 8, bottom: 8 });
  });

  it("leaves The Bellkeeper's Walk joystick free at 390x844, where the credit wraps to two lines", () => {
    const pad = { x: 16, y: 844 - 14 - 128, w: 128, h: 128 };
    const r = pick({ w: 390, h: 844 }, { w: 374, h: 44 }, [pad]);
    expect(r.overlap).toBe(0);
    expect(r.spot.top).toBe(8);
  });

  it("takes the least-covered corner when every corner has a control", () => {
    const view = { w: 800, h: 600 };
    const size = { w: 200, h: 30 };
    const obstacles = [
      { x: 0, y: 560, w: 800, h: 40 }, // bottom bar: both bottom corners fully covered
      { x: 0, y: 0, w: 100, h: 40 }, // top-left button
      { x: 780, y: 0, w: 20, h: 20 } // small top-right button
    ];
    const r = pick(view, size, obstacles);
    expect(r.spot).toEqual({ right: 8, top: 8 });
    expect(r.overlap).toBeGreaterThan(0);
  });

  it("ships a credit that fades on first input, carries no-steer and parses as a script", () => {
    expect(CREDIT_NOTE).toContain('class="aura-credit no-steer"');
    expect(CREDIT_STYLE).toContain(".aura-credit.is-hidden{opacity:0;visibility:hidden");
    const script = /<script>([\s\S]*)<\/script>/.exec(CREDIT_NOTE)?.[1] ?? "";
    expect(script).toContain('addEventListener("keydown",hide,true)');
    expect(script).toContain('addEventListener("pointerdown",hide,true)');
    expect(script).not.toContain("</");
    expect(() => new Function(script)).not.toThrow();
  });

  it("composePortPage replaces an old credit with the canonical one, and recomposing is stable", () => {
    const oldStyle = '<style>.aura-credit{position:fixed;left:8px;bottom:8px;z-index:2147483000}</style>';
    const oldNote = '<aside class="aura-credit" role="note"><a href="/apps/showcase-index/">Built with Aura3D</a> · old.</aside>';
    const appHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Demo</title>${oldStyle}</head><body><div id="app"></div>${oldNote}</body></html>`;
    const exampleHtml = '<!doctype html><html><head><meta charset="utf-8"><title>Example</title></head><body><div id="app"></div><script type="module" src="./main.ts"></script></body></html>';
    const once = composePortPage({ exampleHtml, appHtml });
    expect(once).toContain(CREDIT_STYLE);
    expect(once).toContain(CREDIT_NOTE);
    expect(once).not.toContain("· old.");
    expect(composePortPage({ exampleHtml, appHtml: once })).toBe(once);
  });

  it("covers the eleven port pages", () => {
    expect(PORT_PAGES).toHaveLength(11);
    expect(appPagePath("splat-rush")).toMatch(/apps\/showcase-splat-rush-port\/index\.html$/);
  });
});
