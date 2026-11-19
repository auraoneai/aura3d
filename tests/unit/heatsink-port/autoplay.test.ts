/**
 * `?autoplay=1` (owner addendum 2, Nov 2026): the bot drives the real sim through the same `Input` the keys produce,
 * makes progress, never sits still for 5 s, holds the results ~3 s and starts the next race, forever.
 */
import { describe, expect, it } from "vitest";
import { AUTOPLAY, autoplayRequested, createAutoplay } from "../../../examples/heatsink-port/autoplay";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { Track } from "../../../examples/heatsink-port/track";

const track = new Track();

describe("Ion Circuit autoplay", () => {
  it("reads ?autoplay=1 and the ?autopilot=1 alias only", () => {
    expect(autoplayRequested(new URLSearchParams("?autoplay=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autopilot=1"))).toBe(true);
    expect(autoplayRequested(new URLSearchParams("?autostart=1"))).toBe(false);
    expect(autoplayRequested(new URLSearchParams(""))).toBe(false);
  });

  it("drives the real sim: progress, no 5 s stall, results held ~3 s, then a restart, looping", () => {
    const ap = createAutoplay();
    /* main.ts begin(): a fresh Race on the same track */
    let race = new Race(track);
    const SECONDS = 420;
    let restarts = 0;
    let finishes = 0;
    let lastDist = race.player.dist;
    let idle = 0;
    let maxIdle = 0;
    let resultsHeld = 0;
    let firstRaceKills = -1;
    let passThroughFrames = 0;
    for (let i = 0; i < SECONDS * 60; i++) {
      race.frame(FRAME, ap.input(race));
      const p = race.player;
      /* progress: distance flown, or the countdown ticking toward GO */
      if (p.dist > lastDist + 0.05 || race.state === "countdown") idle = 0;
      else idle += FRAME;
      lastDist = p.dist;
      maxIdle = Math.max(maxIdle, idle);
      /* the craft's body never overlaps a live strike target's visual (the sim has no craft-vs-target collider, so the
         bot must kill each one before it gets there) */
      if (race.state === "race" && !p.crashed) {
        for (const t of race.ops.targets) {
          if (!t.alive) continue;
          const span = t.kind === "heavy" ? 13.9 : 10.23;
          if (Math.abs(track.wrapDelta(p.s, t.s)) < span / 2 + 2.4 && Math.abs(p.x - t.x) < span / 2 + 2.4) passThroughFrames++;
        }
      }
      if (race.resultsOpen) resultsHeld += FRAME;
      if (ap.shouldRestart(race, FRAME)) {
        expect(resultsHeld).toBeGreaterThanOrEqual(AUTOPLAY.resultsSeconds - FRAME);
        expect(resultsHeld).toBeLessThan(AUTOPLAY.resultsSeconds + 0.1);
        if (race.state === "finished") finishes++;
        if (firstRaceKills < 0) firstRaceKills = race.ops.kills;
        race = new Race(track);
        ap.reset();
        lastDist = race.player.dist;
        resultsHeld = 0;
        restarts++;
      }
    }
    expect(restarts).toBeGreaterThanOrEqual(1);
    expect(finishes).toBeGreaterThanOrEqual(1);
    /* competent: it shoots most targets (gold needs 36 of 48) */
    expect(firstRaceKills).toBeGreaterThanOrEqual(30);
    expect(maxIdle).toBeLessThan(5);
    /* the second race is under way too */
    expect(race.player.dist).toBeGreaterThan(100);
    expect(passThroughFrames).toBe(0);
  }, 120_000);

  it("is deterministic: the same race gives the same inputs and outcome", () => {
    const run = () => {
      const ap = createAutoplay();
      const race = new Race(track);
      for (let i = 0; i < 60 * 40; i++) race.frame(FRAME, ap.input(race));
      return { dist: race.player.dist, x: race.player.x, hash: race.ops.hash() };
    };
    expect(run()).toEqual(run());
  });
});
