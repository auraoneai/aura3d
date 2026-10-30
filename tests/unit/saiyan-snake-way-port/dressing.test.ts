import { describe, expect, it } from "vitest";
import { ISLAND_BANDS } from "../../../examples/saiyan-snake-way-port/world";
import { ISLAND_COUNT } from "../../../examples/saiyan-snake-way-port/models";

describe("serpentine-sky-run island parallax bands (SSR-11)", () => {
  it("adds a mid and a far band beyond the near Meshy islands, one instanced draw each", () => {
    expect(ISLAND_BANDS.map((b) => b.id)).toEqual(["islands-mid", "islands-far"]);
    expect(ISLAND_COUNT + ISLAND_BANDS.reduce((n, b) => n + b.count, 0)).toBeGreaterThanOrEqual(12 * 2);
    // bands sit progressively farther out and foggier (silhouette layers)
    expect(ISLAND_BANDS[1]!.lateral[0]).toBeGreaterThan(ISLAND_BANDS[0]!.lateral[1]);
    expect(ISLAND_BANDS[1]!.fog).toBeGreaterThan(ISLAND_BANDS[0]!.fog);
    for (const b of ISLAND_BANDS) expect(b.count * b.spacing).toBeGreaterThan(1000);
  });
});
