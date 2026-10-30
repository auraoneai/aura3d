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

describe("serpentine-sky-run SDF stage boards (SSR-11)", () => {
  it("hangs one board per stage boundary after the first, named after the stage", async () => {
    const { STAGE_BOARDS, BOARD_SHOW_AHEAD } = await import("../../../examples/saiyan-snake-way-port/world");
    const { STAGES } = await import("../../../examples/saiyan-snake-way-port/sim");
    expect(STAGE_BOARDS).toHaveLength(STAGES.length - 1);
    STAGE_BOARDS.forEach((b, i) => { expect(b.s).toBe(STAGES[i + 1]!.from); expect(b.text).toBe(STAGES[i + 1]!.name); });
    // at most two boards can be inside the show window at once (boundaries are > 400 m apart)
    const gaps = STAGE_BOARDS.slice(1).map((b, i) => b.s - STAGE_BOARDS[i]!.s);
    expect(Math.min(...gaps)).toBeGreaterThan(BOARD_SHOW_AHEAD / 2);
  });
});
