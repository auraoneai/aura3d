/**
 * Autoplay (`?autoplay=1`): with the computer driving the real game layer (sim + encounters + falls + finale) through
 * the normal StepInput path, the run makes steady progress, never stalls for 5 s, plays competently (pearls, orbs, staff
 * crossings, few hits) and, after the result card, starts the next run, looping.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTOPLAY_RESULT_SECONDS, createAutopilot } from "../../../examples/kid-goku-beyond-the-clouds-port/autopilot";
import { CUMULUS_RIDGE as CH } from "../../../examples/kid-goku-beyond-the-clouds-port/chapter";
import { Game } from "../../../examples/kid-goku-beyond-the-clouds-port/game";
import { IDLE } from "../../../examples/kid-goku-beyond-the-clouds-port/sim";

const DT = 1 / 60;

describe("Cumulus Dash autoplay", () => {
  it("leaves the title, finishes the ridge playing well, shows the result ~3 s and starts the next run", () => {
    const game = new Game(CH, 0, 0);
    const pilot = createAutopilot(true);
    let stuckFor = 0, worstStuck = 0, lastS = -1, firstPlay = -1, resultAt = -1, restartedAt = -1;
    let firstResult: NonNullable<Game["result"]> | null = null;
    const events = new Map<string, number>();
    for (let i = 0; i < 60 * 240 && restartedAt < 0; i++) {
      const t = i * DT;
      pilot.tick(game, DT);
      for (const e of game.frame(DT, pilot.input(game))) events.set(e, (events.get(e) ?? 0) + 1);
      if (game.phase === "playing" && firstPlay < 0) firstPlay = t;
      if (game.phase === "playing") {
        if (game.state.s > lastS + 0.01) { stuckFor = 0; lastS = game.state.s; } else stuckFor += DT;
        worstStuck = Math.max(worstStuck, stuckFor);
      }
      if (game.phase === "result" && resultAt < 0) { resultAt = t; firstResult = game.result; }
      if (resultAt >= 0 && game.phase === "playing" && t > resultAt) restartedAt = t;
    }
    expect(firstPlay).toBeGreaterThanOrEqual(0);
    expect(firstPlay).toBeLessThan(3);
    expect(worstStuck).toBeLessThan(5);
    expect(firstResult).not.toBeNull();
    expect(firstResult!.won).toBe(true); // it reaches home
    expect(firstResult!.score).toBeGreaterThan(5000);
    expect(firstResult!.balls).toBeGreaterThanOrEqual(5);
    expect(firstResult!.orbs).toBeGreaterThan(40);
    expect(firstResult!.hits).toBeLessThanOrEqual(3);
    expect(events.get("extend") ?? 0).toBeGreaterThanOrEqual(4); // planted the staff at every gorge
    expect(events.get("power-launch") ?? 0).toBeGreaterThanOrEqual(3);
    expect(restartedAt - resultAt).toBeGreaterThanOrEqual(AUTOPLAY_RESULT_SECONDS - 0.1);
    expect(restartedAt - resultAt).toBeLessThan(AUTOPLAY_RESULT_SECONDS + 0.5);
    expect(game.state.s).toBeLessThan(10); // the next run starts from the top
  }, 60_000);

  it("is off unless asked for and gives no input outside play", () => {
    const game = new Game(CH, 0, 0);
    const pilot = createAutopilot();
    expect(pilot.input(game)).toEqual(IDLE);
    for (let i = 0; i < 600; i++) pilot.tick(game, DT);
    expect(game.phase).toBe("menu");
  });

  it("main.ts reads ?autoplay=1 / ?autopilot=1 and the O key toggles it; the title's key list (ui.ts, shared by both pages) shows it", () => {
    const main = readFileSync("examples/kid-goku-beyond-the-clouds-port/main.ts", "utf8");
    expect(main).toMatch(/params\.get\("autoplay"\) === "1" \|\| params\.get\("autopilot"\) === "1"/);
    expect(main).toContain('e.code === "KeyO"');
    expect(readFileSync("examples/kid-goku-beyond-the-clouds-port/ui.ts", "utf8")).toContain("<kbd>O</kbd>autoplay");
    // invariant: the showcase app must mount this example's main and the O-key autoplay toggle must stay bound and labelled in the HUD; no runtime seam exposes either.
    expect(readFileSync("apps/showcase-cloud-runner-port/src/main.ts", "utf8")).toContain("examples/kid-goku-beyond-the-clouds-port/main");
  });
});
