import { describe, expect, it } from "vitest";
import { pointLabel } from "../../../examples/aura-slam/ui/format";
import { scoreAnnouncement, scoreboardState } from "../../../examples/aura-slam/ui/scoreboard";
import type { HudState } from "../../../examples/aura-slam/ui/types";
import { originalEngine, playedEngine } from "./ui-original";

const names = { player: "ALEX", ai: "CPU" };
const base = (over: Record<string, unknown> = {}): HudState => ({
  mode: "playing", paused: false, phase: "rally", server: "player", serveNumber: 1, tiebreak: false, matchWon: false, lastCall: "",
  score: { playerPoints: 0, aiPoints: 0, playerGames: 0, aiGames: 0 }, ...over
}) as unknown as HudState;

describe("pointLabel", () => {
  it("matches the original engine for every score pair up to 8-8", () => {
    const engine = originalEngine.create();
    for (let a = 0; a <= 8; a++) for (let b = 0; b <= 8; b++) expect(pointLabel(a, b), `${a}-${b}`).toBe(engine.pointLabel(a, b));
  });
});

describe("scoreboardState", () => {
  it("reads 1ST SERVE at the start of a game and 2ND SERVE on the second attempt", () => {
    expect(scoreboardState(base({ phase: "serve" }), names).status).toBe("1ST SERVE");
    expect(scoreboardState(base({ phase: "serveToss", serveNumber: 2 }), names).status).toBe("2ND SERVE");
  });
  it("calls deuce, advantage, break point and match point", () => {
    const s = (p: number, a: number, extra: Record<string, unknown> = {}) => scoreboardState(base({ score: { playerPoints: p, aiPoints: a, playerGames: 0, aiGames: 0 }, ...extra }), names);
    expect(s(3, 3).status).toBe("DEUCE");
    expect(s(4, 3).status).toBe("ADVANTAGE");
    expect(s(0, 3, { server: "player" }).status).toBe("BREAK POINT");
    expect(scoreboardState(base({ score: { playerPoints: 3, aiPoints: 0, playerGames: 2, aiGames: 0 } }), names).status).toBe("MATCH POINT");
  });
  it("handles tiebreak, paused, point and match complete states", () => {
    expect(scoreboardState(base({ tiebreak: true, phase: "rally", score: { playerPoints: 2, aiPoints: 1, playerGames: 3, aiGames: 3 } }), names).gameLabel).toBe("TIEBREAK");
    expect(scoreboardState(base({ paused: true }), names).status).toBe("PAUSED");
    expect(scoreboardState(base({ phase: "point", lastCall: "GAME — ALEX" }), names).status).toBe("GAME WON");
    const done = scoreboardState(base({ mode: "gameover", matchWon: true, winner: "player", score: { playerPoints: 0, aiPoints: 0, playerGames: 3, aiGames: 1 } }), names);
    expect(done).toMatchObject({ status: "MATCH COMPLETE", complete: true, winner: "player", server: null, formatLabel: "GAMES WON", gameLabel: "MATCH COMPLETE" });
    expect(done.points).toEqual({ player: "–", ai: "–" });
  });
  it("produces the screen-reader sentence", () => {
    const state = base({ phase: "serve" });
    expect(scoreAnnouncement(state, scoreboardState(state, names))).toBe("GAME 1. ALEX: 0 games, 0 points. CPU: 0 games, 0 points. 1ST SERVE. ALEX serving.");
  });
  it("renders a live original engine state without throwing and starts on game 1", () => {
    const engine = playedEngine(30);
    const view = scoreboardState(engine.state as HudState, names);
    expect(view.game).toBe(1);
    expect(["1ST SERVE", "IN PLAY", "2ND SERVE", "POINT"]).toContain(view.status);
  });
});
