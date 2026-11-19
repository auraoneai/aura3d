import { describe, expect, it, vi } from "vitest";
import { createSim, makeRng } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import { demoMatchConfig } from "../../../apps/showcase-aura-fc-3d/src/game/autoplay";
import { KEEPER_MAX_OFF_LINE, keeperSpot } from "../../../apps/showcase-aura-fc-3d/src/game/ai";
import { GOAL_HALF_W, PITCH_HX } from "../../../apps/showcase-aura-fc-3d/src/game/dims";
import type { MatchState, UserInputFrame, VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * Owner (2026-11-18): in ?autoplay=1 "the kicking-off side often scores within ~3 s — that looks dumb". Before the fix,
 * over 20 CPU matches 15 of 69 goals came 3.8–5.9 s after a kickoff: the lay-off was re-picked by the sim as a 28 m driven
 * ball back to the keeper, both opposing pressers chased it into the box and camped on him, and his distribution went
 * straight into them for a free shot. The defending side now presses with one man + a cover, the back line holds
 * goal-side, nobody camps on a keeper with the ball, and the keeper narrows the angle on the ball↔goal line.
 */
vi.setConfig({ testTimeout: 180_000 });
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const VENUES: VenueId[] = ["munich", "favela", "kyoto", "lagos"];

/** Full autoplay (CPU v CPU) matches: seconds from each kickoff going live to every goal scored after it. */
function playMatches(matches: number) {
  const goalsAfterKickoff: number[] = [];
  const kickoffsBy = [0, 0];
  let shots = 0, simSecs = 0;
  for (let m = 0; m < matches; m++) {
    const sim = createSim();
    sim.setAutopilot(true);
    const rand = makeRng((0x5eed0fc3 + m * 7919) >>> 0);
    sim.startMatch({ ...demoMatchConfig(rand, VENUES[m % VENUES.length]!), seed: (m * 2654435761) >>> 0 });
    const s = sim.state;
    let prev = s.phase, liveAt = -1, t = 0;
    for (let i = 0; i < 60 * 200 && s.phase !== "ended"; i++) {
      for (const e of sim.step(DT, IDLE)) {
        if (e.type === "goal" && liveAt >= 0) goalsAfterKickoff.push(+(t - liveAt).toFixed(2));
        if (e.type === "shot") shots++;
      }
      t += DT;
      if (prev === "kickoff" && s.phase === "live") { liveAt = t; kickoffsBy[s.kickoffTeam]!++; }
      prev = s.phase;
    }
    simSecs += t;
  }
  return { goalsAfterKickoff, kickoffsBy, shots, simMinutes: simSecs / 60 };
}

describe("aura-fc-3d kickoff defence", () => {
  it("20 autoplay matches (both sides kicking off): ≤ 1 goal within 5 s of a kickoff, and goals still come from open play", () => {
    const r = playMatches(20);
    const fast = r.goalsAfterKickoff.filter((g) => g <= 5);
    const quick = r.goalsAfterKickoff.filter((g) => g <= 8);
    console.log("FC_KICKOFF", JSON.stringify({ kickoffsBy: r.kickoffsBy, goals: r.goalsAfterKickoff.length, fast: fast.length, within8s: quick.length, shots: r.shots, simMinutes: +r.simMinutes.toFixed(1), earliest: Math.min(...r.goalsAfterKickoff) }));
    expect(r.kickoffsBy[0]! + r.kickoffsBy[1]!).toBeGreaterThanOrEqual(20);
    expect(r.kickoffsBy[0]).toBeGreaterThanOrEqual(5);
    expect(r.kickoffsBy[1]).toBeGreaterThanOrEqual(5);
    expect(fast.length).toBeLessThanOrEqual(1);
    expect(quick.length).toBeLessThanOrEqual(3);
    // not unscorable: at least one goal every ~3 simulated minutes, from real shots
    expect(r.goalsAfterKickoff.length).toBeGreaterThanOrEqual(Math.floor(r.simMinutes / 3));
    expect(r.shots).toBeGreaterThan(r.goalsAfterKickoff.length * 4);
  });

  it("the keeper stands on the ball↔goal-centre line, off his line by at most KEEPER_MAX_OFF_LINE, inside the posts", () => {
    const sim = createSim();
    sim.startMatch({ ...demoMatchConfig(makeRng(1), "munich"), seed: 3 });
    const st = sim.state as MatchState;
    for (const team of [0, 1] as const) {
      const s = st.attackSign[team];
      const own = -s * PITCH_HX;
      for (const [bx, bz] of [[0, 0], [10, 8], [18, -6], [22, 2], [26, 0.5], [12, -15]] as const) {
        (st.ball as { x: number; z: number }).x = own + s * bx;
        (st.ball as { x: number; z: number }).z = bz;
        const { hx, hz } = keeperSpot(st, team);
        const off = (hx - own) * s;
        expect(off).toBeGreaterThanOrEqual(0.5);
        expect(off).toBeLessThanOrEqual(KEEPER_MAX_OFF_LINE + 1e-6);
        expect(Math.abs(hz)).toBeLessThanOrEqual(GOAL_HALF_W - 0.5 + 1e-6);
        // same side of the goal as the ball (narrows the near-post angle), never on the far side
        if (Math.abs(bz) > 1) expect(Math.sign(hz)).toBe(Math.sign(bz));
        // a ball in shooting range brings him further off the line than one at the halfway line
        if (bx >= 14 && bx <= 22) {
          (st.ball as { x: number }).x = own + s * PITCH_HX;
          (st.ball as { z: number }).z = 0;
          expect(off).toBeGreaterThan((keeperSpot(st, team).hx - own) * s);
        }
      }
    }
  });

  it("QA ?qaHalf shortens the halves so a capture reaches full time; a normal match still runs HALF_LEN halves", () => {
    const run = (qaHalf?: number) => {
      const sim = createSim();
      sim.setAutopilot(true);
      if (qaHalf) sim.setQaHalfLength(qaHalf);
      sim.startMatch({ ...demoMatchConfig(makeRng(5), "munich"), seed: 11 });
      let t = 0;
      while (sim.state.phase !== "ended" && t < 400) { sim.step(DT, IDLE); t += DT; }
      return t;
    };
    expect(run(15)).toBeLessThan(60);
    expect(run()).toBeGreaterThan(180);
  });
});
