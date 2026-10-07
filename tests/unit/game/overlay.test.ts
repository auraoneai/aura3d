import { describe, expect, it } from "vitest";
import { createOverlayDriver, type OverlayApp } from "../../../packages/game/src/juice/overlay";

describe("juice/overlay §7.8 (PRD-09 1747)", () => {
  it("envelope: peak·exp(-5t/ms) for t<ms, exactly 0 at t=ms", () => {
    let t = 0;
    const writes: { flash?: readonly number[]; vignette?: readonly number[] }[] = [];
    const app: OverlayApp = {
      setOutputOverlay: (o) => (writes.push(o as { flash?: readonly number[] }), { applied: true })
    };
    const driver = createOverlayDriver({ app, now: () => t, schedule: () => () => {} });
    driver.flash("#ff0000", 0.8, 200);
    const peak = writes.at(-1)!.flash![3];
    expect(peak).toBeCloseTo(0.8, 9);
    expect(writes.at(-1)!.flash!.slice(0, 3)).toEqual([1, 0, 0]);

    t = 0.1; // ms/2
    driver.tick();
    expect(writes.at(-1)!.flash![3]).toBeCloseTo(0.8 * Math.exp(-2.5), 9);

    t = 0.199; // ms−ε
    driver.tick();
    const nearEnd = writes.at(-1)!.flash![3];
    expect(nearEnd).toBeGreaterThan(0);
    expect(nearEnd).toBeCloseTo(0.8 * Math.exp(-5 * 199 / 200), 9);

    t = 0.2; // exactly ms → idle, empty overlay written
    driver.tick();
    expect(writes.at(-1)).toEqual({});
  });

  it("records dom-fallback → backend \"dom\"; applied without reason → \"shader\"", () => {
    const dom: OverlayApp = { setOutputOverlay: () => ({ applied: true, reason: "dom-fallback" }) };
    const d1 = createOverlayDriver({ app: dom, now: () => 0, schedule: () => () => {} });
    d1.flash("#fff", 0.5, 50);
    expect(d1.backend).toBe("dom");

    const shader: OverlayApp = { setOutputOverlay: () => ({ applied: true }) };
    const d2 = createOverlayDriver({ app: shader, now: () => 0, schedule: () => () => {} });
    d2.flash("#fff", 0.5, 50);
    expect(d2.backend).toBe("shader");
  });

  it("vignette pulse decays on the same envelope", () => {
    let t = 0;
    const writes: { vignette?: readonly number[] }[] = [];
    const driver = createOverlayDriver({
      app: { setOutputOverlay: (o) => (writes.push(o as { vignette?: readonly number[] }), { applied: true }) },
      now: () => t,
      schedule: () => () => {}
    });
    driver.vignette(0.6, 100, "#000000");
    expect(writes.at(-1)!.vignette![3]).toBeCloseTo(0.6, 9);
    t = 0.05;
    driver.tick();
    expect(writes.at(-1)!.vignette![3]).toBeCloseTo(0.6 * Math.exp(-2.5), 9);
  });

  it("dom element path bypasses C-05 and writes .a3g-overlay styles", () => {
    const el = { style: {} as Record<string, string> } as unknown as HTMLElement;
    const app = { setOutputOverlay: () => { throw new Error("must not be called"); } };
    const driver = createOverlayDriver({ app, domElement: el, now: () => 0, schedule: () => () => {} });
    driver.flash("#00ff00", 0.5, 100);
    expect(driver.backend).toBe("dom");
    expect(el.style.background).toContain("rgba(0,255,0");
  });
});
