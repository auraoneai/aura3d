import { describe, expect, it } from "vitest";
import { BANNER_SECONDS, createTelemetry, stepTelemetry } from "../../../examples/heatsink-port/art/telemetry";

const d = (name: string, color = "#c9a0ff") => ({ name, hud: { color, label: name.toUpperCase() } });

describe("heatsink-port IC-23 telemetry HUD", () => {
  it("the first district sets the accent without a banner; a new district banners on the same frame", () => {
    const st = createTelemetry();
    expect(stepTelemetry(st, d("a"), true, 1 / 60)).toBe(true);
    expect(st.bannerT).toBe(0);
    expect(stepTelemetry(st, d("b", "#ffb02e"), true, 1 / 60)).toBe(true);
    expect(st.bannerT).toBe(BANNER_SECONDS);
    expect(st.color).toBe("#ffb02e");
    expect(st.label).toBe("B");
  });
  it("the banner clears after its hold, and never shows outside the race", () => {
    const st = createTelemetry();
    stepTelemetry(st, d("a"), true, 0);
    stepTelemetry(st, d("b"), true, 0);
    let cleared = false;
    for (let i = 0; i < 200 && !cleared; i++) cleared = stepTelemetry(st, d("b"), true, 1 / 60) && st.bannerT === 0;
    expect(cleared).toBe(true);
    stepTelemetry(st, d("c"), false, 0);
    expect(st.bannerT).toBe(0);
  });
});
