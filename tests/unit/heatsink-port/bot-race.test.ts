import { describe, expect, it } from "vitest";
import { runBotRace } from "../../../examples/heatsink-port/bot";
import { GO_SECONDS, countText } from "../../../examples/heatsink-port/hud";
import { STRIKE } from "../../../examples/heatsink-port/operation";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { IDLE } from "../../../examples/heatsink-port/vehicle";

/*
 * Whole races driven by the lane-follow bot (examples/heatsink-port/bot.ts). These pin the balance the audit fixes set:
 * barrels are shootable from hover height (HP-02), chains survive the gap between targets (HP-11), and gold needs
 * kills and pace rather than crawling (HP-14). Measured before the fixes: 60 m/s and up all ended DNF after ramming
 * barrels the bolts flew over (0 to 3 barrels shot), and gold was reachable only at 40 m/s in 574 s.
 */
describe("bot races", () => {
  const at = (speed: number) => runBotRace(new Race(), { speed });

  it("a fast, accurate race finishes with gold inside the gold time", () => {
    const r = at(80);
    expect(r.state).toBe("finished");
    expect(r.player.finishTime).toBeLessThanOrEqual(STRIKE.goldTime);
    expect(r.ops.kills).toBeGreaterThanOrEqual(STRIKE.medals.gold);
    expect(r.ops.medal).toBe("gold");
    expect(r.ops.barrelsShot).toBeGreaterThanOrEqual(12);
    expect(r.ops.bestChain).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it("crawling for every kill no longer earns gold", () => {
    const r = at(40);
    expect(r.state).toBe("finished");
    expect(r.ops.kills).toBeGreaterThanOrEqual(STRIKE.medals.gold);
    expect(r.player.finishTime).toBeGreaterThan(STRIKE.goldTime);
    expect(r.ops.medal).toBe("silver");
  }, 60_000);

  it("full throttle finishes the race (no barrel-ramming DNF) with a medal", () => {
    const r = at(115);
    expect(r.state).toBe("finished");
    expect(r.player.crashes).toBe(0);
    expect(r.ops.medal).not.toBe("none");
  }, 60_000);
});

describe("GO banner (HP-01)", () => {
  it("shows 3-2-1, then GO for GO_SECONDS, then clears for the rest of the race", () => {
    const race = new Race();
    const seen: string[] = [];
    let goSteps = 0;
    for (let i = 0; i < 600; i++) {
      race.frame(FRAME, IDLE);
      const t = countText(race);
      if (t === "GO") goSteps++;
      if (seen[seen.length - 1] !== t) seen.push(t);
    }
    expect(seen).toEqual(["3", "2", "1", "GO", ""]);
    expect(goSteps).toBe(Math.round(GO_SECONDS / FRAME));
    expect(race.state).toBe("race");
    expect(countText(race)).toBe("");
  });

  it("restarts the banner on a new race", () => {
    const race = new Race();
    for (let i = 0; i < 400; i++) race.frame(FRAME, IDLE);
    race.startRace();
    expect(race.goT).toBe(0);
    expect(countText(race)).toBe("3");
  });
});
