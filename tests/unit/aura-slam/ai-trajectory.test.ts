import { describe, expect, it } from "vitest";
import { injectedEngine, pristineEngine, shippedEngine, useShipped } from "./oracle";
import { humanPolicy, mulberry32, stateDigest } from "./scenario";

const DIFFICULTIES = ["beginner", "club", "ace", "pro", "legend"] as const;
const VENUES = ["hard", "grass", "clay"] as const;

const cheap = (e: any) => { const s = e.state; return [s.tick, s.phase, s.ball.x, s.ball.y, s.ball.z, s.ai.x, s.ai.y, s.ai.vx, s.ai.vy, s.player.x, s.score.playerPoints, s.score.aiPoints, s.rallyHits].join(','); };

function run(difficulty: string, venue: string, seed: number, steps: number, swipe: boolean) {
  const calls = new Map<string, number>();
  const A = pristineEngine().create({ difficulty, venue, allowSwipe: swipe, controlStyle: swipe ? "swipe" : "classic" });
  const B = (useShipped ? shippedEngine() : injectedEngine({ calls })).create({ difficulty, venue, allowSwipe: swipe, controlStyle: swipe ? "swipe" : "classic" });
  const ra = mulberry32(seed), rb = mulberry32(seed);
  let aiHits = 0;
  for (let i = 0; i < steps; i++) {
    humanPolicy(A, ra, i, swipe);
    humanPolicy(B, rb, i, swipe);
    A.step(1 / 60); B.step(1 / 60);
    const cheapA = cheap(A), cheapB = cheap(B);
    if (cheapA !== cheapB || i % 20 === 0 && stateDigest(A) !== stateDigest(B)) {
      const da = stateDigest(A), db = stateDigest(B);
      const sa = JSON.parse(da), sb = JSON.parse(db);
      const diff: string[] = [];
      for (const k of Object.keys(sa)) if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) diff.push(k);
      throw new Error(`diverged at step ${i} (${difficulty}/${venue}/seed ${seed}) in: ${diff.join(",")}`);
    }
    if (A.state.rallyHits > aiHits) aiHits = A.state.rallyHits;
  }
  return { A, calls, aiHits };
}

describe("M-AI: TS AI inside the original engine reproduces the original trajectory bit for bit", () => {
  for (const difficulty of DIFFICULTIES) {
    for (const venue of VENUES) {
      it(`${difficulty} on ${venue}: 3,000 steps identical`, () => {
        const { A, calls } = run(difficulty, venue, 1000 + DIFFICULTIES.indexOf(difficulty) * 7 + VENUES.indexOf(venue), 3000, false);
        expect(A.state.tick).toBe(3000);
        if (!useShipped) expect(calls.get("updateAI") ?? 0).toBeGreaterThan(1000);
      }, 120_000);
    }
  }
});

describe("M-AI/swipe: swipe control style and long matches also reproduce the original bit for bit", () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty} with swipe controls: 3,000 steps identical, swipe module exercised`, () => {
      const { A, calls } = run(difficulty, "hard", 5000 + DIFFICULTIES.indexOf(difficulty), 3000, true);
      expect(A.state.tick).toBe(3000);
      if (!useShipped) expect(calls.get("sw.updateSwipePlayer") ?? 0).toBeGreaterThan(100);
      if (!useShipped) expect(calls.get("sw.swipeActive") ?? 0).toBeGreaterThan(1000);
    }, 120_000);
  }
  for (const difficulty of ["club", "legend"] as const) {
    it(`${difficulty}: a 10,000-step match (several games) is identical`, () => {
      const { A } = run(difficulty, "clay", 9100 + DIFFICULTIES.indexOf(difficulty), 10000, false);
      expect(A.state.tick).toBe(10000);
      expect(A.state.score.playerGames + A.state.score.aiGames).toBeGreaterThan(0);
    }, 300_000);
  }
});
