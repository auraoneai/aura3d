import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SNOW_ROOF_COLOR, SNOW_TOWN, buildWorld } from "../../../examples/last-train-port/world";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const lum = (hex: string): number => { const n = parseInt(hex.slice(1), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };

describe("snow-dusted Observatory roofs (GU47 WP-31 LT-09)", () => {
  it("the band scenes add one roofs-snow mesh; ?look=original keeps today's roofs", () => {
    expect(data.tables.towns[SNOW_TOWN]!.name).toMatch(/Observatory/);
    const band = JSON.stringify(buildWorld(data, "bands").sceneFor("C").toJSON());
    const original = JSON.stringify(buildWorld(data, "original").scene.toJSON());
    expect(band).toContain('"roofs-snow"');
    expect(original).not.toContain('"roofs-snow"');
    for (const k of [0, 1, 2]) { expect(band).toContain(`"roofs-${k}"`); expect(original).toContain(`"roofs-${k}"`); }
  });

  it("snow roofs are >= 1.4x the luminance of the brightest terracotta roof tint", () => {
    expect(lum(SNOW_ROOF_COLOR)).toBeGreaterThanOrEqual(1.4 * Math.max(lum("#b4523d"), lum("#9a4a3a"), lum("#5f6f86")));
  });
});
