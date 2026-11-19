// Autoplay competence, campaign slice 1 of 3 (levels whose index % 3 === 0): hands-free, every level is played
// from load to its first result card through the route's flow (./autoplay-harness.ts) and must be cleared within its
// shot budget. Each slice must clear at least 70 % of its levels, so the whole campaign clears at least 70 %.
// Split in three files so the Rapier-heavy sweep runs in parallel workers.
import { describe, expect, it } from "vitest";
import { LEVELS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { playLevel } from "./autoplay-harness";

describe("slingshot-siege autoplay campaign slice 1", () => {
  it("clears at least 70 % of its levels within their shot budget, level 1 included", async () => {
    const levels = LEVELS.filter((l) => l.id % 3 === 0);
    const outcomes: string[] = [];
    let cleared = 0;
    for (const level of levels) {
      const r = await playLevel(level);
      if (r.won && r.shots <= level.ammo.length) cleared += 1;
      outcomes.push(`L${level.id + 1} ${r.won ? "cleared" : "FAILED"} in ${r.shots}/${level.ammo.length} shots`);
    }
    console.log(outcomes.join("\n"));
    expect(cleared / levels.length).toBeGreaterThanOrEqual(0.7);
    expect(outcomes[0]).toMatch(/^L1 cleared/);
  }, 3_600_000);
});
