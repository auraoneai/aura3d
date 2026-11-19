import { describe, expect, it } from "vitest";
import {
  st, frame, startRun, normPos, normGhostPos, AUTOPLAY_RESULTS_SECONDS, DEATH_TIME, TOUCH_RADIUS
} from "../../../apps/showcase-dot-dash-3d/src/game/sim";
import { idx } from "../../../apps/showcase-dot-dash-3d/src/game/grid";
import { MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";

const idle = { held: () => false, consume: () => false, pressed: () => false };
const DT = 1 / 60;

/**
 * Collisions read correctly (owner review): the courier and the sentries stay on corridor centre lines and never
 * enter a wall tile; a catch only happens when a sentry is within touch range. Autoplay (?autoplay=1 / P): the
 * computer player clears pellets, eats sentries when powered, never stalls, and loops after a game over.
 */
describe("dot-dash-3d collisions and autoplay", () => {
  it("actors never enter wall tiles and stay on corridor centre lines (30 s of autoplay on each of the six boards)", () => {
    for (const id of MAZE_ORDER) {
      st.mode = "title" as never;
      st.autopilot = true;
      startRun("quick", id);
      const bad: string[] = [];
      let catches = 0;
      for (let t = 0; t < 30 && st.mazeId === id; t += DT) {
        frame(DT, idle);
        const m = st.maze;
        const onWall = (x: number, y: number) => {
          const tx = ((Math.round(x) % m.width) + m.width) % m.width, ty = ((Math.round(y) % m.height) + m.height) % m.height;
          return m.wall[idx(m.width, tx, ty)] === true;
        };
        const offAxis = (x: number, y: number) => Math.min(Math.abs(x - Math.round(x)), Math.abs(y - Math.round(y))) > 0.02;
        const p = normPos(m);
        if (onWall(p.x, p.y) || offAxis(p.x, p.y)) bad.push(`courier ${p.x.toFixed(2)},${p.y.toFixed(2)}`);
        for (const g of st.ghosts) {
          if (g.state !== "active") continue;
          const gp = normGhostPos(g);
          if (onWall(gp.x, gp.y) || offAxis(gp.x, gp.y)) bad.push(`${g.id} ${gp.x.toFixed(2)},${gp.y.toFixed(2)}`);
        }
        if (st.events.death) {
          catches++;
          const near = st.ghosts.some((g) => g.state === "active" && Math.hypot(normGhostPos(g).x - p.x, normGhostPos(g).y - p.y) <= TOUCH_RADIUS + 0.2);
          expect(near, "a catch only happens next to an active sentry").toBe(true);
        }
      }
      expect(bad.slice(0, 5), id).toEqual([]);
      void catches;
    }
  }, 120_000);

  it("autoplay scores, clears boards, eats sentries and never stalls for 5 s (240 s)", () => {
    st.mode = "title" as never;
    st.autopilot = true;
    startRun("quick", "classic");
    let boards = 0, eaten = 0, stuck = 0, maxStuck = 0, last = normPos(st.maze), best = 0;
    for (let t = 0; t < 240; t += DT) {
      frame(DT, idle);
      if (st.events.clear) boards++;
      if (st.events.ghostEat) eaten++;
      best = Math.max(best, st.score);
      const p = normPos(st.maze);
      if (st.mode === "play" && Math.hypot(p.x - last.x, p.y - last.y) < 1e-6) stuck += DT; else stuck = 0;
      maxStuck = Math.max(maxStuck, stuck);
      last = p;
    }
    expect(best).toBeGreaterThan(2000);
    expect(boards).toBeGreaterThanOrEqual(1);
    expect(eaten).toBeGreaterThanOrEqual(1);
    expect(maxStuck).toBeLessThan(5);
  }, 120_000);

  it("autoplay shows the game-over card for ~3 s, then starts a new run by itself", () => {
    st.mode = "title" as never;
    st.autopilot = true;
    startRun("quick", "twin");
    st.lives = 0;
    st.mode = "dying" as never;
    st.deathT = 0.01;
    frame(DT, idle);
    expect(st.mode).toBe("gameover");
    let t = 0;
    while (st.mode === "gameover" && t < 10) { frame(DT, idle); t += DT; }
    expect(t).toBeGreaterThanOrEqual(AUTOPLAY_RESULTS_SECONDS - 0.05);
    expect(t).toBeLessThan(AUTOPLAY_RESULTS_SECONDS + 0.5);
    expect(st.mode).toBe("play");
    expect(st.lives).toBe(3);
    expect(st.score).toBe(0);
    void DEATH_TIME;
  });

  it("without autoplay a game over waits on its card (normal play unchanged)", () => {
    st.mode = "title" as never;
    st.autopilot = false;
    startRun("quick", "classic");
    st.lives = 0;
    st.mode = "dying" as never;
    st.deathT = 0.01;
    for (let t = 0; t < 8; t += DT) frame(DT, idle);
    expect(st.mode).toBe("gameover");
  });
});
