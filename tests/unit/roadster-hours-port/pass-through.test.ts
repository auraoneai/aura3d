import { describe, expect, it } from "vitest";
import { landmarkPlacements } from "../../../examples/roadster-hours-port/art/landmarks";
import { LEVELS } from "../../../examples/roadster-hours-port/data";
import { LAMP_POLE_OFFSET, lampBlocksShortcut } from "../../../examples/roadster-hours-port/world";

/** Owner QA (Nov 18): nothing solid stands where the car can drive without being part of the sim. */
describe("Saltwind Highway pass-through", () => {
  it("no street-lamp pole stands inside a roofline shortcut deck (the car used to drive through a 9 m pole on the cut)", () => {
    let skipped = 0;
    for (const level of LEVELS) {
      let i = 0;
      for (let s = 90; s < level.length + 40; s += 64, i++) {
        const sign = (i % 2 === 0 ? 1 : -1) as 1 | -1;
        const l = sign * (level.width + LAMP_POLE_OFFSET);
        const inDeck = level.shortcuts.some((sc) => s >= sc.start && s <= sc.end && Math.abs(l - sc.l) <= 5.5 + 1);
        if (inDeck) expect(lampBlocksShortcut(level, s, sign)).toBe(true);
        if (lampBlocksShortcut(level, s, sign)) skipped++;
      }
    }
    // Sunbreak (2 poles under the Roofline cut), Redline (Mesa shelf) and Halo (Skyrail cut) each lose their deck poles
    expect(skipped).toBeGreaterThanOrEqual(4);
  });

  it("every off-road landmark (diners, towers, stacks, masts...) clears the drivable road plus its edge margin", () => {
    for (const level of LEVELS) {
      for (const kind of ["turbine", "sea-stack", "mesa", "hoodoo", "arch", "uplink-mast", "antenna", "arcology", "coastal-viaduct", "roadside-diner", "suspension-tower"] as const) {
        for (const seaSide of [-1, 1] as const) {
          for (const p of landmarkPlacements(kind, level.length, level.width, seaSide, level.seed)) {
            // scale-1 placements are generated models (diner ~16 m wide, viaduct/tower legs): require 20 m from the centre line
            const half = Math.max(p.size[0], p.size[2]) > 1.01 ? Math.max(p.size[0], p.size[2]) / 2 : 8;
            const onShortcut = level.shortcuts.some((sc) => p.s > sc.start - 10 && p.s < sc.end + 10 && Math.abs(p.l - sc.l) < 5.5 + half);
            expect(onShortcut, `${level.id} ${kind} at s ${p.s.toFixed(0)}`).toBe(false);
            expect(Math.abs(p.l) - half, `${level.id} ${kind} at s ${p.s.toFixed(0)}`).toBeGreaterThan(level.width + 2);
          }
        }
      }
    }
  });
});
