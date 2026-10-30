// GU47 WP-22 (lane g12): seeded beach dressing (SS47-W1) — deterministic, clear of the flight lane, within budget.
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { DRESSING_KEEP_OUT, LANE_CLEARANCE, LANE_X, beachDressing } from "../../../apps/showcase-slingshot-siege/src/game/dressing";
import { buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";

describe("slingshot-siege beach dressing (SS47-W1)", () => {
  const d = beachDressing();
  const all = Object.values(d).flat();

  it("is deterministic for a seed and places every kind", () => {
    expect(JSON.stringify(beachDressing())).toBe(JSON.stringify(d));
    for (const list of Object.values(d)) expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(beachDressing(7))).not.toBe(JSON.stringify(d));
  });

  it("keeps nothing within 1.2 m of the flight lane and off every authored prop", () => {
    for (const it of all) {
      const [x, , z] = it.position;
      if (x > LANE_X[0] && x < LANE_X[1]) expect(Math.abs(z)).toBeGreaterThanOrEqual(LANE_CLEARANCE);
      for (const [kx, kz, kr] of DRESSING_KEEP_OUT) expect(Math.hypot(x - kx, z - kz)).toBeGreaterThanOrEqual(kr);
    }
  });

  it("costs at most 12 draws: one instanced node per kind", () => {
    const names = (buildStage(CHAPTERS[0]!, { reducedMotion: false }).nodes as unknown[])
      .map((n) => ((typeof (n as { toJSON?: unknown }).toJSON === "function" ? (n as { toJSON(): { name?: string } }).toJSON() : n) as { name?: string }).name ?? "")
      .filter((n) => n.startsWith("dressing-"));
    expect(names.length).toBe(5);
    expect(names.length).toBeLessThanOrEqual(12);
  });
});
