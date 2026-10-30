import { describe, expect, it } from "vitest";
import {
  BOARD_HOME_RUN_SECONDS,
  BOARD_MAX_UPDATES_PER_S,
  BoardThrottle,
  boardModel,
  homeRunPhase,
  paintBoard,
  type BoardInput,
  type BoardPainter
} from "../../../apps/showcase-aura-diamond-3d/art/board";
import { buildParkScene, DEFAULT_SCENE_CONTEXT } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { PARKS } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const BASE: BoardInput = {
  parkName: "Harbor Sandlot",
  teams: { away: "aur", home: "bay" },
  linescore: { away: [0, 2], home: [1] },
  runs: { away: 2, home: 1 },
  hits: { away: 4, home: 3 },
  inning: 2,
  inningsTotal: 3,
  half: "bottom",
  balls: 2,
  strikes: 1,
  outs: 1
};

function recorder(): BoardPainter & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    fillRect: () => {},
    fillText: (t: string) => void texts.push(t)
  };
}

describe("aura-diamond GU47 outfield board (DIA-V2)", () => {
  it("shows the linescore, runs, hits, count and park name, blank for unplayed innings", () => {
    const m = boardModel(BASE);
    expect(m.title).toBe("HARBOR SANDLOT");
    expect(m.header).toEqual(["1", "2", "3"]);
    expect(m.rows[0]).toMatchObject({ team: "AUR", cells: ["0", "2", ""], runs: "2", hits: "4", batting: false });
    expect(m.rows[1]).toMatchObject({ team: "BAY", cells: ["1", "", ""], runs: "1", batting: true });
    expect(m.count).toBe("B 2  S 1  O 1");
    expect(boardModel(BASE).key).toBe(m.key);
    expect(boardModel({ ...BASE, strikes: 2 }).key).not.toBe(m.key);
  });

  it("keeps the last nine innings once a game goes long", () => {
    const m = boardModel({ ...BASE, inning: 11, inningsTotal: 9 });
    expect(m.header).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  });

  it("repaints only on change and at most 4 times a second", () => {
    const th = new BoardThrottle();
    let paints = 0;
    for (let f = 0; f < 600; f++) {
      const now = f / 60;
      const key = `k${f}`; // the worst case: the state changes every frame
      if (th.due(now, key, 0)) {
        paints += 1;
        th.painted(now, key, 0);
      }
    }
    expect(paints).toBeLessThanOrEqual(10 * BOARD_MAX_UPDATES_PER_S + 1);
    const idle = new BoardThrottle();
    idle.painted(0, "same", 0);
    expect(idle.due(5, "same", 0)).toBe(false);
  });

  it("runs the HOME RUN card for 2 s, readable throughout, and steady under reduced flash", () => {
    expect(homeRunPhase(-0.1)).toBe(0);
    expect(homeRunPhase(BOARD_HOME_RUN_SECONDS)).toBe(0);
    for (let t = 0; t < BOARD_HOME_RUN_SECONDS; t += 0.05) {
      expect(homeRunPhase(t)).toBeGreaterThanOrEqual(0.55);
      expect(homeRunPhase(t, true)).toBe(0.6);
    }
    const plain = recorder();
    paintBoard(plain, boardModel(BASE), { accent: "#f08a4b", font: "sans-serif" }, 0);
    expect(plain.texts).toContain("HARBOR SANDLOT");
    expect(plain.texts).not.toContain("HOME RUN");
    const hr = recorder();
    paintBoard(hr, boardModel(BASE), { accent: "#f08a4b", font: "sans-serif" }, homeRunPhase(0.5));
    expect(hr.texts.at(-1)).toBe("HOME RUN");
  });

  it("keeps the 4.6.2 flat screen without a DOM and under ?look=original", () => {
    for (const ctx of [DEFAULT_SCENE_CONTEXT, { ...DEFAULT_SCENE_CONTEXT, variant: "original" as const }]) {
      const snap = buildParkScene(PARKS.sandlot, ctx).toJSON() as { nodes: { name?: string; material?: Record<string, unknown> }[] };
      const screen = JSON.stringify(snap.nodes).includes('"scoreboard-screen"');
      expect(screen).toBe(true);
    }
  });
});
