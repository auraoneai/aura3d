// PRD-07 P2-T7 — TransientLightPool: tier caps (0/2/4/8), intensity 0 when
// idle, 10 simultaneous explosions use ≤ the cap and the oldest is recycled.

import { describe, expect, it } from "vitest";
import { TRANSIENT_LIGHT_CAPS, TransientLightPool } from "../../../../packages/engine/src/production-runtime/effects/TransientLightPool";

const FLASH = { position: [1, 2, 3] as const, color: [6, 4, 2] as const, intensity: 10, range: 8, duration: 0.5 };

describe("P2-T7 transient light pool", () => {
  it("tier caps are 0/2/4/8 for low/medium/high/ultra", () => {
    expect(TRANSIENT_LIGHT_CAPS).toEqual({ low: 0, medium: 2, high: 4, ultra: 8 });
    expect(new TransientLightPool("low").cap).toBe(0);
    expect(new TransientLightPool("ultra").cap).toBe(8);
  });

  it("low tier rejects flashes; idle pool collects 0 lights (T0-34)", () => {
    const pool = new TransientLightPool("low");
    expect(pool.flash(FLASH)).toBe(false);
    const high = new TransientLightPool("high");
    // Idle slots must not be collected — intensity-0 lights still occupy slots
    // in the frame's light list and push scenes into LIGHTS_CLUSTERED.
    expect(high.collect()).toHaveLength(0);
  });

  it("10 simultaneous explosions use ≤ the cap; the oldest is recycled", () => {
    const pool = new TransientLightPool("high"); // cap 4
    for (let i = 0; i < 10; i++) {
      expect(pool.flash({ ...FLASH, position: [i, 0, 0] })).toBe(true);
    }
    expect(pool.liveCount).toBe(4);
    const xs = pool.collect().map((l) => l.position[0]).sort((a, b) => a - b);
    // The four MOST RECENT flashes survive — the six oldest were recycled.
    expect(xs).toEqual([6, 7, 8, 9]);
  });

  it("flashes decay to 0 over their duration", () => {
    const pool = new TransientLightPool("medium");
    pool.flash({ ...FLASH, duration: 0.5 });
    const before = pool.collect().find((l) => l.intensity > 0);
    expect(before?.intensity).toBe(10);
    for (let i = 0; i < 60; i++) pool.step(1 / 60);
    expect(pool.collect()).toHaveLength(0);
  });
});
