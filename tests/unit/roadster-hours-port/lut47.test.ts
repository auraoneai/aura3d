import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SALTWIND_LUTS, saltwindCube, saltwindGrade } from "../../../examples/roadster-hours-port/art/lut";
import { ROUTE_LUT_URL, buildWorld } from "../../../examples/roadster-hours-port/world";

const routes = ["sunbreak", "redline", "halo"] as const;

describe("Saltwind Highway per-route LUTs (RH47-14)", () => {
  it("the committed .cube files are what the generator writes", () => {
    for (const r of routes) expect(readFileSync(resolve(`examples/roadster-hours-port/assets/luts/saltwind-${r}.cube`), "utf8")).toBe(saltwindCube(r));
  });

  it("keeps black, mid grey and white and leaves signal red alone", () => {
    for (const r of routes) {
      const tone = SALTWIND_LUTS[r];
      for (const v of [0, 0.5, 1]) saltwindGrade(tone, [v, v, v]).forEach((c) => expect(c).toBeCloseTo(v, 6));
      const red = saltwindGrade(tone, [0.784, 0.196, 0.122]);
      expect(Math.abs(red[0] - 0.784) + Math.abs(red[1] - 0.196) + Math.abs(red[2] - 0.122)).toBeLessThan(0.02);
    }
    // Redline highlights lean warm, Halo shadows lean blue
    const warm = saltwindGrade(SALTWIND_LUTS.redline, [0.75, 0.75, 0.75]);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const cool = saltwindGrade(SALTWIND_LUTS.halo, [0.25, 0.25, 0.25]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
  });

  it("each route's grade binds its own LUT with the white balance", () => {
    routes.forEach((r, i) => {
      const json = JSON.stringify(buildWorld(i, "gu47").scene.toJSON());
      expect(json).toContain(ROUTE_LUT_URL[r]);
      expect(ROUTE_LUT_URL[r]).toMatch(new RegExp(`saltwind-${r}\\.cube$`));
    });
    expect(JSON.stringify(buildWorld(0, "original").scene.toJSON())).not.toContain(".cube");
  });
});
