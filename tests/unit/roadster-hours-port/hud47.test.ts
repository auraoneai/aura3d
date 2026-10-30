import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPEEDO_MAX_KMH, SPEEDO_SWEEP, speedoArc } from "../../../examples/roadster-hours-port/hud";

describe("Saltwind Highway arc speedo (RH47-17)", () => {
  it("fills the 270 degree arc with speed, clamped at the top nitro speed", () => {
    expect(speedoArc(0, false).dash).toBe("0.0 100");
    expect(speedoArc(SPEEDO_MAX_KMH / 2, false).dash).toBe(`${(SPEEDO_SWEEP / 2).toFixed(1)} 100`);
    expect(speedoArc(SPEEDO_MAX_KMH * 3, false).dash).toBe(`${SPEEDO_SWEEP.toFixed(1)} 100`);
    expect(speedoArc(-5, true)).toEqual({ dash: "0.0 100", nitro: true });
    expect(SPEEDO_MAX_KMH).toBe(100 * 3.6);
  });

  it("both pages carry the arc, hidden on ?look=original", () => {
    for (const page of ["apps/showcase-roadster-hours-port/index.html", "examples/roadster-hours-port/index.html"]) {
      const html = readFileSync(resolve(page), "utf8");
      expect(html).toContain('id="speedo-fill"');
      expect(html).toContain("#speedo-arc { display: none; }");
      expect(html).toContain("body:not(.look-original) #speedo-arc { display: block;");
    }
  });
});
