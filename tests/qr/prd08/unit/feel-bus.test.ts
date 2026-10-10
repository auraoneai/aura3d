/**
 * 08-SPEC / F-08-2: the cited `feel-bus.test.ts` was missing — this is it.
 * FeelBus core: define/emit dispatch, pending-part verdicts, decay-to-idle.
 */
import { describe, expect, it } from "vitest";
import { createFeelBus } from "@aura3d/engine/lanes";
import type { AuraFeelEventSpec } from "@aura3d/engine/contracts";

const SCREEN_HIT: AuraFeelEventSpec = {
  screen: { flash: 0.8, chroma: 0.5, radialBlur: 0.3, vignette: 0.4 }
};

describe("FeelBus core (F-08-2)", () => {
  it("define + emit arms screen parts; screenUniforms reports them", () => {
    const bus = createFeelBus();
    bus.define("hit", SCREEN_HIT);
    const before = bus.screenUniforms();
    expect(before.flash).toBe(0);
    bus.emit("hit");
    const u = bus.screenUniforms();
    expect(u.flash).toBeGreaterThan(0);
    expect(u.chroma).toBeGreaterThan(0);
    expect(u.radialBlur).toBeGreaterThan(0);
    expect(u.vignette).toBeGreaterThan(0);
  });

  it("advance decays every part back to exactly 0", () => {
    const bus = createFeelBus();
    bus.define("hit", SCREEN_HIT);
    bus.emit("hit");
    for (let i = 0; i < 300; i += 1) bus.advance(1 / 60);
    const u = bus.screenUniforms();
    expect(u.flash).toBe(0);
    expect(u.chroma).toBe(0);
    expect(u.radialBlur).toBe(0);
    expect(u.vignette).toBe(0);
  });

  it("screen uniforms stay inside [0, 1] while decaying", () => {
    const bus = createFeelBus();
    bus.define("hit", SCREEN_HIT);
    bus.emit("hit");
    for (let i = 0; i < 30; i += 1) {
      bus.advance(1 / 60);
      const u = bus.screenUniforms();
      for (const v of [u.flash, u.chroma, u.radialBlur, u.vignette]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("unknown event is a no-op (arms nothing)", () => {
    const bus = createFeelBus();
    bus.emit("never-defined");
    const u = bus.screenUniforms();
    expect(u.flash).toBe(0);
    expect(u.vignette).toBe(0);
  });
});
