import { describe, expect, it } from "vitest";
import { SCORE_DASH_ID, bindScoreboardText, scoreReelIds, scoreboardTextNodes, shownScore, visibleScoreIds } from "../../../apps/showcase-aura-fc-3d/src/game/scoreboard3d";

/** GU47 WP-19 FC47-H1 (lane g09): the SDF in-world score matches the sim score. */
describe("aura-fc-3d in-world score (FC47-H1)", () => {
  it("builds one SDF node per reel id", () => {
    const nodes = scoreboardTextNodes("#f3f0dc").map((b) => b.toJSON() as { name: string; text3D?: { backend?: string } });
    expect(nodes.map((n) => n.name)).toEqual(scoreReelIds());
    expect(nodes.every((n) => n.text3D?.backend === "sdf")).toBe(true);
  });

  it("the shown digits read back as the score, 0-0 to 99-99", () => {
    for (const score of [[0, 0], [1, 0], [3, 2], [9, 10], [12, 7], [99, 99]] as [number, number][]) {
      const ids = visibleScoreIds(score);
      expect(ids.has(SCORE_DASH_ID)).toBe(true);
      expect(shownScore(ids)).toEqual(score);
    }
    expect(visibleScoreIds([2, 1]).size).toBe(3);
  });

  it("bindScoreboardText toggles visibility only on a score change", () => {
    const vis = new Map<string, boolean>();
    let calls = 0;
    const app = { nodes: { require: (id: string) => ({ setVisible: (on: boolean) => { calls++; vis.set(id, on); } }) } };
    const update = bindScoreboardText(app);
    update([1, 0]);
    const n = calls;
    expect(n).toBe(scoreReelIds().length);
    update([1, 0]);
    expect(calls).toBe(n);
    expect([...vis].filter(([, on]) => on).map(([id]) => id).sort()).toEqual([...visibleScoreIds([1, 0])].sort());
  });
});
