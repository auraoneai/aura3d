/**
 * 08-SPEC / F-08-5: the cited `feel-screenspace.test.ts` was missing — this is
 * it. S-3 screen-space feel: uniforms from events, tier publishing (C-27),
 * and the DOM overlay path (createScreenOverlay apply/remove).
 */
import { describe, expect, it } from "vitest";
import { createFeelBus, createScreenOverlay } from "@aura3d/engine/lanes";
import type { AuraFeelEventSpec } from "@aura3d/engine/contracts";

const HEAVY: AuraFeelEventSpec = {
  screen: { flash: 0.9, chroma: 0.6, radialBlur: 0.4, vignette: 0.5 }
};

describe("S-3 screen-space feel uniforms (F-08-5)", () => {
  it("event screen parts publish into screenUniforms", () => {
    const bus = createFeelBus();
    bus.define("hit", HEAVY);
    bus.emit("hit");
    const u = bus.screenUniforms();
    expect(u.flash).toBeGreaterThan(0.5);
    expect(u.chroma).toBeGreaterThan(0.3);
    expect(u.radialBlur).toBeGreaterThan(0.2);
    expect(u.vignette).toBeGreaterThan(0.3);
  });

  it("C-27 tier publish: low tier keeps flash+vignette, drops chroma/radialBlur", () => {
    const bus = createFeelBus();
    bus.define("hit", HEAVY);
    bus.emit("hit");
    const low = bus.screenUniformsForTier("low");
    expect(low.flash).toBeGreaterThan(0);
    expect(low.vignette).toBeGreaterThan(0);
    expect(low.chroma).toBe(0);
    expect(low.radialBlur).toBe(0);
    const ultra = bus.screenUniformsForTier("ultra");
    expect(ultra.chroma).toBeGreaterThan(0);
    expect(ultra.radialBlur).toBeGreaterThan(0);
  });

  it("createScreenOverlay draws flash+vignette pixels into a DOM fallback", () => {
    const els: { style: Record<string, string> }[] = [];
    const doc = {
      createElement: () => {
        const el = { style: {} as Record<string, string> };
        els.push(el);
        return el;
      },
      body: { appendChild: () => undefined, removeChild: () => undefined }
    };
    const overlay = createScreenOverlay(doc);
    const bus = createFeelBus();
    bus.define("hit", HEAVY);
    bus.emit("hit");
    const u = bus.screenUniforms();
    expect(overlay.apply(u)).toBe(true);
    // flash div + vignette div, opacity tracks the uniforms.
    expect(els[0].style.opacity).toBe(String(Math.min(1, u.flash)));
    expect(els[1].style.opacity).toBe(String(Math.min(1, u.vignette)));
    // Zeroed uniforms draw nothing.
    bus.advance(10);
    expect(overlay.apply(bus.screenUniforms())).toBe(false);
  });
});
