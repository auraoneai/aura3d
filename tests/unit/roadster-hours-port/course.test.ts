import { describe, expect, it } from "vitest";
import { LEVELS, actAt, clamp, levelLayout, medalFor, roadProfile, surfaceAt, trafficPiece, pieceSpec } from "../../../examples/roadster-hours-port/course";

describe("roadster-hours-port course data (extracted from the captured release)", () => {
  it("has the three routes with their authored counts", () => {
    expect(LEVELS.map((l) => l.id)).toEqual(["sunbreak", "redline", "halo"]);
    expect(LEVELS.map((l) => [l.length, l.gates.length, l.traffic.length, l.lineups.length, l.cells.length])).toEqual([
      [2800, 5, 13, 5, 9], [3250, 6, 10, 6, 10], [3300, 6, 11, 5, 11]
    ]);
    for (const level of LEVELS) {
      const gates = level.gates.map((g) => g.s);
      expect(gates, `${level.id} gates ascend`).toEqual([...gates].sort((a, b) => a - b));
      expect(level.acts[0]!.s).toBe(0);
    }
  });

  it("road profile: ramps rise to their height, banks peak mid-span, the centre line is continuous", () => {
    const sun = LEVELS[0]!;
    expect(roadProfile(sun, 337).ramp).toBe(0);
    expect(roadProfile(sun, 360).ramp).toBeCloseTo(3.8, 10);
    const bank = roadProfile(sun, (1600 + 1920) / 2).bank;
    expect(bank).toBeCloseTo(1.2, 10);
    for (let s = 0; s < 2800; s += 37) {
      const a = roadProfile(sun, s);
      const b = roadProfile(sun, s + 0.01);
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.1);
      expect(a.z).toBe(-s);
    }
  });

  it("surface: gaps are holes, kickers rise quadratically, shortcut decks sit at their height", () => {
    const sun = LEVELS[0]!;
    expect(surfaceAt(sun, 380, 0)).toBeNull();
    expect(surfaceAt(sun, 100, 0)).toEqual({ height: 0, shortcut: false });
    expect(surfaceAt(sun, 100, sun.width)).toBeNull();
    expect(surfaceAt(sun, -1, 0)).toBeNull();
    const k = sun.lineups[0]!.kicker;
    expect(surfaceAt(sun, k.s + k.len, 0)!.height).toBeCloseTo(k.h, 10);
    expect(surfaceAt(sun, k.s + k.len / 2, 0)!.height).toBeCloseTo(k.h * 0.25, 10);
    expect(surfaceAt(sun, k.s + 5, 0)!.kicker).toBe(k);
    expect(surfaceAt(sun, 900, 17)).toEqual({ height: 4, shortcut: true });
  });

  it("lineup layout puts every row after its kicker, in order, with consistent counts", () => {
    for (const level of LEVELS) {
      const layout = levelLayout(level);
      expect(layout.lineups.length).toBe(level.lineups.length);
      for (const lineup of layout.lineups) {
        expect(lineup.s0).toBeGreaterThan(lineup.kicker.s + lineup.kicker.len);
        let last = -Infinity;
        for (const row of lineup.rows) { expect(row.s0).toBeGreaterThanOrEqual(last - 1e-9); last = row.s1; }
        expect(lineup.count).toBe(lineup.rows.reduce((n, r) => n + r.count, 0));
      }
      expect(layout.vehicles.length).toBe(layout.lineups.reduce((n, l) => n + l.count, 0));
      expect(levelLayout(level)).toBe(layout);
    }
  });

  it("traffic pieces carry their collision boxes in road coordinates (forward = -z)", () => {
    const bus = trafficPiece("bus");
    const spec = pieceSpec("bus")!;
    expect(bus.halfLen).toBeCloseTo(spec.len / 2, 12);
    expect(bus.boxes[0]!.s0).toBeCloseTo(-spec.boxes[0]!.max[2], 12);
    expect(trafficPiece("does-not-exist").id).toBe("sedan");
    expect(trafficPiece("semi_tractor").roofs.every((r) => r.y1 >= trafficPiece("semi_tractor").top! - 0.15)).toBe(true);
  });

  it("acts, medals and clamp", () => {
    const sun = LEVELS[0]!;
    expect(actAt(sun, 0).name).toBe("THE FIRST LEAP");
    expect(actAt(sun, 900).name).toBe("CITY ABOVE THE SEA");
    expect(medalFor(sun, 50, 3000, 3)).toBe("gold");
    expect(medalFor(sun, 50, 3000, 2)).toBe("silver");
    expect(medalFor(sun, 80, 1500, 3)).toBe("bronze");
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
