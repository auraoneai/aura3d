import { describe, expect, it } from "vitest";
import { createRacketScoring, racketSports } from "../../../packages/engine/src/agent-api/game-kits/racketSports";
import { MATCH_RULES, other } from "../../../examples/aura-slam/contract/sim";
import type { Side } from "../../../examples/aura-slam/contract/sim";
import { pointLabel, resolveScoreAfterPoint, type ScoringSlice } from "../../../examples/aura-slam/sim/scoring";

const sideOf = (s: Side) => (s === "player" ? 0 : 1);
const draw = (i: number) => { const x = Math.sin(i * 9283.17 + 78.31) * 43758.5453; return x - Math.floor(x); };

describe("racketSports().scoring: tennis defaults", () => {
  const scoring = racketSports.scoring();
  it("exposes the kit entry point and the Aura Slam match format", () => {
    expect(racketSports.create().scoring).toBe(createRacketScoring);
    expect(scoring.rules).toMatchObject({ pointsToGame: 4, winBy: 2, gamesToMatch: 3, matchWinBy: 2, tiebreak: { atGames: 3, points: 7, winBy: 2 } });
  });

  it("love game, deuce and advantage", () => {
    let r = scoring.awardPoint(scoring.init(0), 0);
    for (let i = 1; i < 4; i++) r = scoring.awardPoint(r.state, 0);
    expect(r.state.games).toEqual([1, 0]);
    expect(r.state.points).toEqual([0, 0]);
    expect(r.gameWon).toBe(true);
    expect(r.state.server).toBe(1);
    let s = r.state;
    for (const w of [0, 1, 0, 1, 0, 1] as const) s = scoring.awardPoint(s, w).state;
    expect(s.points).toEqual([3, 3]);
    s = scoring.awardPoint(s, 0).state;
    expect(scoring.label(s.points[0], s.points[1])).toBe("AD");
    s = scoring.awardPoint(s, 1).state;
    expect(scoring.label(s.points[0], s.points[1])).toBe("40");
    expect(s.games).toEqual([1, 0]);
  });

  it("3-3 starts a tiebreak to 7 win by 2 and the match ends there", () => {
    let s = scoring.init(0);
    const win = (w: 0 | 1, n = 4) => { for (let i = 0; i < n; i++) s = scoring.awardPoint(s, w).state; };
    win(0); win(1); win(0); win(1); win(0);
    const last = (() => { const before = s; for (let i = 0; i < 4; i++) s = scoring.awardPoint(s, 1).state; return before; })();
    expect(last.tiebreak).toBe(false);
    expect(s.tiebreak).toBe(true);
    expect(s.games).toEqual([3, 3]);
    for (let i = 0; i < 6; i++) { s = scoring.awardPoint(s, 0).state; s = scoring.awardPoint(s, 1).state; }
    s = scoring.awardPoint(s, 0).state;
    s = scoring.awardPoint(s, 1).state;
    s = scoring.awardPoint(s, 1).state;
    const end = scoring.awardPoint(s, 1);
    expect(end.matchWon).toBe(true);
    expect(end.state.winner).toBe(1);
    expect(end.state.games).toEqual([3, 4]);
    expect(scoring.awardPoint(end.state, 0).state).toBe(end.state);
  });

  it("never mutates its input", () => {
    const s = scoring.init(1);
    const frozen = JSON.stringify(s);
    scoring.awardPoint(s, 0);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe("racketSports().scoring: other formats", () => {
  it("table tennis: 11 points win by 2, best of 5 games, no tiebreak", () => {
    const scoring = createRacketScoring({ pointsToGame: 11, winBy: 2, gamesToMatch: 3, matchWinBy: 1, tiebreak: false });
    let s = scoring.init(0);
    for (let g = 0; g < 3; g++) for (let i = 0; i < 11; i++) s = scoring.awardPoint(s, 0).state;
    expect(s.matchWon).toBe(true);
    expect(s.winner).toBe(0);
    let t = scoring.init(0);
    for (let i = 0; i < 10; i++) { t = scoring.awardPoint(t, 0).state; t = scoring.awardPoint(t, 1).state; }
    t = scoring.awardPoint(t, 0).state;
    expect(t.games).toEqual([0, 0]);
    t = scoring.awardPoint(t, 0).state;
    expect(t.games).toEqual([1, 0]);
  });
});

describe("kit scoring equals the Aura Slam simulation scoring (match-engine.js awardPoint) point for point", () => {
  it("2,000 seeded random matches agree on points, games, server, tiebreak and match result", () => {
    const scoring = racketSports.scoring();
    for (let m = 0; m < 2000; m++) {
      const firstServer: Side = draw(m * 3 + 1) < 0.5 ? "player" : "ai";
      const slice: ScoringSlice = {
        score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 }, tiebreak: false, tiebreakFirstServer: firstServer, firstServer, server: firstServer,
        matchWon: false, pointDelay: 0, lastCall: "", message: "", messageTimer: 0,
      };
      let kit = scoring.init(sideOf(firstServer));
      const bias = 0.25 + 0.5 * draw(m * 7 + 2);
      for (let p = 0; p < 400 && !slice.matchWon; p++) {
        const winner: Side = draw(m * 1000 + p + 11) < bias ? "player" : "ai";
        if (winner === "player") slice.score.playerPoints += 1; else slice.score.aiPoints += 1;
        resolveScoreAfterPoint(slice, winner);
        kit = scoring.awardPoint(kit, sideOf(winner)).state;
        expect(kit.points).toEqual([slice.score.playerPoints, slice.score.aiPoints]);
        expect(kit.games).toEqual([slice.score.playerGames, slice.score.aiGames]);
        expect(kit.server).toBe(sideOf(slice.server));
        expect(kit.tiebreak).toBe(slice.tiebreak);
        expect(kit.matchWon).toBe(slice.matchWon);
      }
      expect(slice.matchWon).toBe(true);
    }
  });

  it("labels equal the simulation's pointLabel and the shared rules constants", () => {
    const scoring = racketSports.scoring();
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) expect(scoring.label(a, b)).toBe(pointLabel(a, b));
    expect(scoring.rules.pointsToGame).toBe(MATCH_RULES.pointsToGame);
    expect(scoring.rules.gamesToMatch).toBe(MATCH_RULES.gamesToMatch);
    expect(other("player")).toBe("ai");
  });
});
