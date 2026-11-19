import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { createSim, makeRng } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import {
  AUTOPLAY_RESULT_HOLD_S, autoplayRequested, createAutoplayLoop, demoMatchConfig, nextAutoplayVenue
} from "../../../apps/showcase-aura-fc-3d/src/game/autoplay";
import { CLUB_ORDER, VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";
import type { MatchConfig, UserInputFrame, VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/** Owner addendum: `?autoplay=1` plays hands-free (computer on both sides), shows full time ~3 s, then loops for ever. */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const params = (q: string) => new URLSearchParams(q);

describe("autoplay entry points", () => {
  it("?autoplay=1, the ?autopilot=1 alias and legacy ?demo=1 all start autoplay; nothing else does", () => {
    expect(autoplayRequested(params("autoplay=1"))).toBe(true);
    expect(autoplayRequested(params("autopilot=1"))).toBe(true);
    expect(autoplayRequested(params("demo=1&venue=kyoto"))).toBe(true);
    expect(autoplayRequested(params(""))).toBe(false);
    expect(autoplayRequested(params("autoplay=0&mode=menu"))).toBe(false);
  });

  it("the fixture is CPU v CPU and makes the same two seeded club draws the Demo button always made", () => {
    const a = makeRng(0x5eed0fc3), b = makeRng(0x5eed0fc3);
    const cfg = demoMatchConfig(a, "lagos");
    const h = CLUB_ORDER[(b() * 8) | 0], aw = CLUB_ORDER[(b() * 8) | 0];
    expect(cfg).toMatchObject({ userTeam: null, venue: "lagos", homeClub: h, awayClub: aw === h ? "iron" : aw });
    expect(a()).toBe(b());   // same number of draws: normal-play fixtures after a demo are unchanged
  });

  it("the venue rotation visits every venue and wraps", () => {
    const seen: VenueId[] = [];
    let v: VenueId = VENUE_ORDER[0]!;
    for (let i = 0; i < VENUE_ORDER.length; i++) { seen.push(v); v = nextAutoplayVenue(v); }
    expect(new Set(seen).size).toBe(VENUE_ORDER.length);
    expect(v).toBe(VENUE_ORDER[0]);
  });

  it("the full-time hold fires once, after the result has shown for ~3 s", () => {
    const loop = createAutoplayLoop();
    expect(loop.tick(1, false)).toBe(false);
    let t = 0, fired = 0;
    while (t < AUTOPLAY_RESULT_HOLD_S + 2) { if (loop.tick(DT, true)) { fired++; expect(t).toBeGreaterThanOrEqual(AUTOPLAY_RESULT_HOLD_S - DT * 2); } t += DT; }
    expect(fired).toBe(1);
    expect(AUTOPLAY_RESULT_HOLD_S).toBeGreaterThanOrEqual(2.5);
    expect(AUTOPLAY_RESULT_HOLD_S).toBeLessThanOrEqual(4);
  });
});

describe("autoplay loop on the real sim", () => {
  it("8 simulated minutes: play starts by itself, both sides pass / dribble / shoot / score, nothing stalls ≥ 5 s, and full time rolls into the next venue", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    const rand = makeRng(0x5eed0fc3);
    let venue: VenueId = "munich";
    const loop = createAutoplayLoop();
    const start = (v: VenueId): MatchConfig => { const c = demoMatchConfig(rand, v); sim.startMatch(c); return c; };
    start(venue);
    const s = sim.state;
    const venues: VenueId[] = [venue];
    const stats = { goals: 0, shots: 0, passes: 0, skills: 0, dribbleSecs: 0, matches: 1, restarts: 0 };
    const shotsBy = [0, 0];
    let firstLiveAt = -1;
    let simSecs = 0;
    // stuck detectors: a non-live phase that never ends, or live play where the ball does not move 1 m
    let phase = s.phase, phaseSince = 0, worstPhase = { phase: "", secs: 0 };
    let anchor = { x: s.ball.x, z: s.ball.z, t: 0 }, worstStill = 0;
    for (let i = 0; i < 8 * 60 * 60; i++) {
      for (const e of sim.step(DT, IDLE)) {
        if (e.type === "goal") stats.goals++;
        if (e.type === "shot") { stats.shots++; shotsBy[e.team ?? 0]!++; }
        if (e.type === "pass") stats.passes++;
        if (e.type === "skill") stats.skills++;
      }
      simSecs += DT;
      if (s.ball.mode === "dribble") stats.dribbleSecs += DT;
      if (firstLiveAt < 0 && s.phase === "live") firstLiveAt = simSecs;
      if (s.phase !== phase) { phase = s.phase; phaseSince = simSecs; }
      else if (s.phase !== "live" && simSecs - phaseSince > worstPhase.secs) worstPhase = { phase: s.phase, secs: simSecs - phaseSince };
      if (s.phase !== "live" || Math.hypot(s.ball.x - anchor.x, s.ball.z - anchor.z) > 1) anchor = { x: s.ball.x, z: s.ball.z, t: simSecs };
      else worstStill = Math.max(worstStill, simSecs - anchor.t);
      // modes.ts: the same tick runs from the frame loop in demo mode
      if (loop.tick(DT, s.phase === "ended")) {
        venue = nextAutoplayVenue(venue);
        start(venue);
        venues.push(venue);
        stats.matches++; stats.restarts++;
      }
    }
    console.log("FC_AUTOPLAY", JSON.stringify({ ...stats, dribbleSecs: Math.round(stats.dribbleSecs), shotsBy, firstLiveAt: +firstLiveAt.toFixed(2), worstPhase, worstStill: +worstStill.toFixed(1), venues }));
    expect(firstLiveAt).toBeGreaterThan(0);
    expect(firstLiveAt).toBeLessThanOrEqual(3);          // kickoff without a key press
    expect(stats.goals).toBeGreaterThan(0);
    expect(stats.shots).toBeGreaterThan(0);
    expect(shotsBy[0]).toBeGreaterThan(0);                // the "human" side plays too
    expect(shotsBy[1]).toBeGreaterThan(0);
    expect(stats.passes).toBeGreaterThan(20);
    expect(stats.dribbleSecs).toBeGreaterThan(30);
    expect(stats.restarts).toBeGreaterThanOrEqual(2);     // full time → next fixture, more than once
    expect(new Set(venues).size).toBe(venues.length);     // a new venue each time (6-venue rotation)
    expect(worstPhase.secs).toBeLessThan(5);              // never parked on kickoff / restart / goal / full time
    expect(worstStill).toBeLessThan(5);                   // live play never stalls
  });

  it("autopilot on a user match (O key / ?autopilot on Quick Play) plays the user's side competently", () => {
    // six seeds, two minutes each: a single seeded match can go two minutes without a user-side shot by chance
    // (0-12 user shots per 2 minutes across seeds, ~4.5 on average)
    let userShots = 0, userPasses = 0;
    for (const seed of [7, 8, 9, 10, 11, 12]) {
      const sim = createSim();
      sim.setAutopilot(true);
      sim.startMatch({ mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: 0, difficulty: 0.6, goldenGoal: true, shootoutOnTie: true, seed });
      const s = sim.state;
      let firstLiveAt = -1;
      for (let i = 0; i < 120 * 60 && s.phase !== "ended"; i++) {
        for (const e of sim.step(DT, IDLE)) {
          if (e.team === 0 && e.type === "shot") userShots++;
          if (e.team === 0 && e.type === "pass") userPasses++;
        }
        if (firstLiveAt < 0 && s.phase === "live") firstLiveAt = i * DT;
      }
      expect(firstLiveAt).toBeGreaterThanOrEqual(0);
      expect(firstLiveAt).toBeLessThanOrEqual(3);
    }
    expect(userShots).toBeGreaterThanOrEqual(6);
    expect(userPasses).toBeGreaterThan(30);
  });
});
