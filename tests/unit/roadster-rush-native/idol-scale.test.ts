import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VEHICLE_SPECS, type VehicleType } from "../../../apps/showcase-roadster-rush/src/native/constants";
import { IDOL_HERO_FIT, IDOL_TRAFFIC, IDOL_TRAFFIC_FIT, gantryFit } from "../../../apps/showcase-roadster-rush/src/render/idolFleet";

// invariant: every Idol model(...) call in main.ts must use world scale mode, or Idol GLBs render at their raw generated size (FIX-CHECKLIST scale bug).
const main = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");

describe("Apex Overdrive Idol models keep their real-world size", () => {
  it("mounts every Idol model with scaleMode world (no 1.55 m auto-normalisation)", () => {
    const calls = main.split("\n").filter((line) => /(\bmodel\(IDOL_|\.model\(idol\b)/.test(line));
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const line of calls) expect(line).toContain('scaleMode: "world"');
  });

  it("fits each traffic class onto its collision box from the measured GLB size, not the inflated manifest bounds", () => {
    // Carrier: normalised with a -42 deg yaw; the manifest reports 17.7 m x 17.7 m, the truck is 4.1 m x 16 m.
    const carrier = IDOL_TRAFFIC_FIT.carrier;
    expect(carrier[2]).toBeCloseTo(1, 2);
    expect(carrier[0]).toBeGreaterThan(0.5);
    for (const t of Object.keys(IDOL_TRAFFIC) as VehicleType[]) {
      const [sx, sy, sz] = IDOL_TRAFFIC_FIT[t];
      for (const s of [sx, sy, sz]) expect(s).toBeGreaterThan(0.3);
      for (const s of [sx, sy, sz]) expect(s).toBeLessThan(2.5);
      expect(VEHICLE_SPECS[t].l).toBeGreaterThan(0);
    }
  });

  it("keeps the hero near its generated proportions and the gantry frame (truss included) under the sign band top", () => {
    expect(IDOL_HERO_FIT[2]).toBeCloseTo(1, 2);
    expect(IDOL_HERO_FIT[0]).toBeGreaterThan(0.7);
    const [sx, sy] = gantryFit(11.1);
    expect(sx).toBeCloseTo(1, 1);
    // pass-through QA (Nov 18): the whole frame now fits under the band top (19.4 m model -> 11.1 m), towers stay recognisable
    expect(sy).toBeGreaterThan(0.55);
  });
});

describe("Apex Overdrive Idol set pieces sit on the deck (no floating / sinking)", () => {
  it("places the gantry and light-pole models at deck level (y = 0, the asphalt top) with grounded GLBs inside the 24 m deck", async () => {
    const { GANTRY_HALF_SPAN } = await import("../../../apps/showcase-roadster-rush/src/render/idolFleet");
    expect(main).toMatch(/gantrySteel\.add\(rx\(0\), ry\(0\), gz/);
    expect(main).toMatch(/polePool\.add\([^\n]*ry\(0\), poleZ/);
    // the deck box is 24 m wide with its top at y = 0 (freeway-asphalt-deck: size [24, 0.12, 380] at y -0.06)
    expect(main).toMatch(/name: "freeway-asphalt-deck",\s*size: \[24, 0\.12, 380\]/);
    expect(main).toMatch(/\.position\(0, -0\.06, -150\)/);
    expect(GANTRY_HALF_SPAN).toBeLessThanOrEqual(12);
  });
});
