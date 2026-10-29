import { beforeEach, describe, expect, it } from "vitest";
import {
  st, frame, startRun, skipClear, releaseStep, pickCorridorTile,
  EXTRA_LIFE_AT, MIN_SPAWN_PATH, READY_TIME, SCHOOL_TIME_SCALE, CLEAR_TIME, DEATH_TIME
} from "../../../apps/showcase-dot-dash-3d/src/game/sim";
import { MAZES, MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";
import { bfsDistances, idx, parseMaze } from "../../../apps/showcase-dot-dash-3d/src/game/grid";

/** Glint Courier simulation (audit rows DD-1/2/5/6/11/12, DD-E5 and the sim test gap). */
const idle = { held: () => false, consume: () => false, pressed: () => false };
const hold = (action: string) => ({ held: (a: string) => a === action, consume: () => false, pressed: (a: string) => a === action });
const DT = 1 / 60;
const run = (seconds: number, ctl = idle) => { for (let t = 0; t < seconds; t += DT) frame(DT, ctl); };

function clearBoard(): void {
  st.hasMoved = true;
  st.dots.fill(0);
  st.dotsLeft = 0;
}

beforeEach(() => {
  st.autopilot = false;
  st.mode = "title";
  st.profile.mazeBest = {};
  st.profile.best = 0;
  startRun("quick", "classic");
});

describe("run loop", () => {
  it("a cleared Quick Play board advances after the clear pause and keeps score and lives", () => {
    st.score = 1234; st.lives = 2;
    clearBoard();
    frame(DT, idle);
    expect(st.mode).toBe("cleared");
    const scored = st.score;
    run(CLEAR_TIME + 0.1);
    expect(st.mazeId).toBe("spiral");
    expect(st.mode).toBe("ready");
    expect(st.score).toBe(scored);
    expect(st.lives).toBe(2);
  });

  it("Next Board (skipClear) advances at once and keeps score and lives (DD-5)", () => {
    st.score = 900; st.lives = 1;
    clearBoard();
    frame(DT, idle);
    const scored = st.score;
    skipClear();
    expect(st.mazeId).toBe("spiral");
    expect(st.score).toBe(scored);
    expect(st.lives).toBe(1);
    expect(st.boardsCleared).toBe(1);
  });

  it("a Board Map run ends in win mode after its board (DD-2)", () => {
    startRun("circuit", "twin");
    clearBoard();
    frame(DT, idle);
    run(CLEAR_TIME + 0.1);
    expect(st.mode).toBe("win");
    expect(st.boardsCleared).toBe(1);
    expect(st.profile.cleared).toContain("twin");
  });

  it("the sixth Quick Play board ends in win mode", () => {
    startRun("quick", MAZE_ORDER[MAZE_ORDER.length - 1]!);
    clearBoard();
    frame(DT, idle);
    run(CLEAR_TIME + 0.1);
    expect(st.mode).toBe("win");
  });

  it("three catches end the run in game over, and a retry resets score and lives (DD-1 sim side)", () => {
    for (let i = 0; i < 3; i++) {
      st.hasMoved = true;
      const g = st.ghosts[0]!;
      g.px = st.player.px; g.py = st.player.py; st.fright = 0;
      frame(DT, idle);
      expect(st.mode).toBe("dying");
      run(DEATH_TIME + 0.1);
    }
    expect(st.mode).toBe("gameover");
    st.score = 50;
    startRun("quick", "classic");
    expect(st.mode).toBe("play");
    expect(st.lives).toBe(3);
    expect(st.score).toBe(0);
  });

  it("marks a new board best when the clear beats the stored best", () => {
    st.profile.mazeBest.classic = 100;
    st.score = 5000;
    clearBoard();
    frame(DT, idle);
    expect(st.newBoardBest).toBe(true);
  });
});

describe("scoring", () => {
  it("chain scoring doubles per sentry in one surge (200, 400, 800, 1600)", () => {
    st.hasMoved = true;
    st.fright = 5; st.frightMax = 5; st.chain = 0;
    const got: number[] = [];
    for (const g of st.ghosts) {
      g.state = "active";
      g.px = st.player.px; g.py = st.player.py;
      const before = st.score;
      frame(DT, idle);
      got.push(st.score - before);
      g.state = "eyes"; g.px = 1; g.py = 1;
    }
    expect(got.map((p) => Math.round(p / 100) * 100)).toEqual([200, 400, 800, 1600]);
  });

  it("the surge length shrinks on later boards and is stored for the HUD bar (DD-11)", () => {
    startRun("quick", "foundry");
    st.hasMoved = true;
    const m = st.maze;
    st.orbs[idx(m.width, Math.round(st.player.px), Math.round(st.player.py))] = 1;
    frame(DT, idle);
    expect(st.frightMax).toBeCloseTo(6 - 0.45 * 4, 5);
    expect(st.fright).toBeLessThanOrEqual(st.frightMax);
    expect(st.fright / st.frightMax).toBeGreaterThan(0.98);
  });

  it("the cache gem scores its kind and reports a pop-up at its tile", () => {
    st.hasMoved = true;
    const m = st.maze;
    st.fruitActive = true;
    st.player.px = m.fruitTile.x; st.player.py = m.fruitTile.y;
    for (const g of st.ghosts) { g.px = 1; g.py = 1; }
    const before = st.score;
    frame(DT, idle);
    expect(st.score - before).toBeGreaterThanOrEqual(100);
    expect(st.events.points.some((p) => p.x === m.fruitTile.x && p.y === m.fruitTile.y)).toBe(true);
  });

  it("awards one extra life at EXTRA_LIFE_AT (DD-E5)", () => {
    st.hasMoved = true;
    st.lives = 2;
    st.score = EXTRA_LIFE_AT - 1;
    frame(DT, idle);
    st.score = EXTRA_LIFE_AT + 10;
    frame(DT, idle);
    expect(st.lives).toBe(3);
    st.score += 20000;
    frame(DT, idle);
    expect(st.lives).toBe(3);
  });
});

describe("movement", () => {
  it("wraps through the side tunnel on a wrapX board", () => {
    expect(MAZES.classic.wrapX).toBe(true);
    const m = st.maze;
    const row = 9; // the tunnel row of Relay Grid
    expect(m.def.rows[row]![0]).toBe(" ");
    for (const g of st.ghosts) { g.px = 9; g.py = 1; }
    st.player.px = 1; st.player.py = row;
    st.player.dir = { x: -1, z: 0 } as typeof st.player.dir;
    st.hasMoved = true;
    let wrapped = false;
    for (let i = 0; i < 60 && !wrapped; i++) {
      frame(DT, hold("left"));
      if (st.player.px > m.width / 2) wrapped = true;
    }
    expect(wrapped).toBe(true);
  });
});

describe("board start (DD-6)", () => {
  it("every corridor sentry spawns at least MIN_SPAWN_PATH path tiles from the courier on every board", () => {
    for (const id of MAZE_ORDER) {
      startRun("quick", id);
      const m = st.maze;
      const dist = bfsDistances(m, m.spawn, false);
      for (const g of st.ghosts.filter((x) => x.id !== "blitz")) {
        const d = dist[idx(m.width, Math.round(g.px), Math.round(g.py))]!;
        expect(d, `${id} ${g.id}`).toBeGreaterThanOrEqual(MIN_SPAWN_PATH);
      }
    }
  });

  it("pickCorridorTile never returns a tile closer than MIN_SPAWN_PATH", () => {
    const m = parseMaze(MAZES.classic);
    const dist = bfsDistances(m, m.spawn, false);
    const t = pickCorridorTile(m, m.spawn.x + 1, m.spawn.y);
    expect(dist[idx(m.width, t.x, t.y)]!).toBeGreaterThanOrEqual(MIN_SPAWN_PATH);
  });

  it("releases sentries one after another on board 1, all at once from board 6", () => {
    const byId = Object.fromEntries(st.ghosts.map((g) => [g.id, g.releaseAt]));
    expect(byId.blitz).toBe(0);
    expect(byId.flick).toBeGreaterThan(0);
    expect(byId.dim!).toBeGreaterThan(byId.flick!);
    expect(byId.sly!).toBeGreaterThan(byId.dim!);
    expect(releaseStep(6)).toBe(0);
  });

  it("a held sentry does not move before its release time", () => {
    const sly = st.ghosts.find((g) => g.id === "sly")!;
    const at = [sly.px, sly.py];
    st.hasMoved = true;
    run(sly.releaseAt * 0.5);
    expect([sly.px, sly.py]).toEqual(at);
    run(sly.releaseAt);
    expect([sly.px, sly.py]).not.toEqual(at);
  });

  it("holds the board until the first direction and shows the intro banner for READY_TIME", () => {
    const p = [st.player.px, st.player.py];
    run(1);
    expect([st.player.px, st.player.py]).toEqual(p);
    expect(st.hasMoved).toBe(false);
    expect(READY_TIME).toBeGreaterThanOrEqual(1.5);
  });
});

describe("Sentry Lab (DD-12)", () => {
  it("runs at SCHOOL_TIME_SCALE and never catches the courier", () => {
    startRun("school", "classic");
    st.hasMoved = true;
    const t0 = st.runT;
    frame(1 / 30, idle);
    expect(st.runT - t0).toBeCloseTo((1 / 30) * SCHOOL_TIME_SCALE, 6);
    const g = st.ghosts[0]!;
    g.px = st.player.px; g.py = st.player.py;
    frame(DT, idle);
    expect(st.mode).toBe("play");
  });
});

describe("title boot", () => {
  it("bootToTitle lays out board 1 behind the title without starting a run", async () => {
    const { bootToTitle } = await import("../../../apps/showcase-dot-dash-3d/src/game/sim");
    const played = st.profile.mazesPlayed;
    bootToTitle();
    expect(st.mode).toBe("title");
    expect(st.dotsLeft).toBe(st.maze.dots.length);
    expect(st.dotsLeft).toBeGreaterThan(0);
    expect(st.profile.mazesPlayed).toBe(played);
  });
});

describe("evidence beacon", () => {
  it("reports simulated seconds so tooling can tell a slow sim from a stalled one", async () => {
    const { evidenceExtra } = await import("../../../apps/showcase-dot-dash-3d/src/game/sim");
    const a = evidenceExtra().simTime as number;
    run(0.5);
    expect((evidenceExtra().simTime as number) - a).toBeCloseTo(0.5, 1);
  });
});
