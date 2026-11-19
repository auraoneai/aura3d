import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 120_000 });
import { createSim, makeRng } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import { demoMatchConfig } from "../../../apps/showcase-aura-fc-3d/src/game/autoplay";
import { VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";
import type { UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * Owner QA: in autoplay the away side scored ~2x the home side. Causes: (1) goals and goal-line restarts were credited by
 * a fixed "+X goal is team 0's" rule, so after the half-time switch every goal went to the wrong team; (2) the AI was
 * not symmetric between the two ends (formation z anchors / run wobbles mirrored as a reflection while the right-footed
 * dribble and the weave are rotation-symmetric, and the shot curl was a world-space sign), so the end attacking -X
 * took ~1.7x the shots and scored ~3x the goals.
 */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;

function secondHalfLive() {
  const sim = createSim();
  sim.startMatch({ mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false, seed: 11 });
  const s = sim.state;
  // the half-time switch: home now attacks -X
  s.half = 2; s.attackSign = [-1, 1]; s.phase = "live"; s.phaseT = 5;
  for (const p of s.players) { p.x = 0; p.z = (p.team ? 1 : -1) * 12; }
  return sim;
}

describe("Aura FC 3D side balance", () => {
  it("after half-time a goal at the -X end counts for home and one at +X for away", () => {
    for (const [x, vx, team] of [[-29.6, -14, 0], [29.6, 14, 1]] as const) {
      const sim = secondHalfLive();
      const b = sim.state.ball;
      Object.assign(b, { x, y: 0.6, z: 0, vx, vy: 0, vz: 0, spin: 0, mode: "flight", ownerId: null, lastShot: "shot", rolling: false });
      b.lastTouchTeam = team; b.lastToucherId = team ? "a-fw" : "h-fw"; b.kickerId = b.lastToucherId; b.freeT = 1;
      for (let i = 0; i < 10 && sim.state.phase === "live"; i++) sim.step(DT, IDLE);
      expect(sim.state.score, `goal at ${x > 0 ? "+X" : "-X"}`).toEqual(team === 0 ? [1, 0] : [0, 1]);
    }
  });

  it("after half-time a ball over the goal line gives the corner / goal kick to the right side", () => {
    // home (attacking -X) puts it out over the -X line: away defends there → goal kick for away
    let sim = secondHalfLive();
    let b = sim.state.ball;
    Object.assign(b, { x: -29.9, y: 0.3, z: 9, vx: -8, vy: 0, vz: 0, spin: 0, mode: "loose", ownerId: null, lastShot: "none", rolling: true });
    b.lastTouchTeam = 0; b.lastToucherId = "h-fw"; b.kickerId = "h-fw"; b.freeT = 1;
    for (let i = 0; i < 10 && sim.state.phase === "live"; i++) sim.step(DT, IDLE);
    expect([sim.state.restartKind, sim.state.restartTeam]).toEqual(["goalkick", 1]);
    // away defender puts it out over his own (-X) line → corner for home
    sim = secondHalfLive();
    b = sim.state.ball;
    Object.assign(b, { x: -29.9, y: 0.3, z: 9, vx: -8, vy: 0, vz: 0, spin: 0, mode: "loose", ownerId: null, lastShot: "none", rolling: true });
    b.lastTouchTeam = 1; b.lastToucherId = "a-df0"; b.kickerId = "a-df0"; b.freeT = 1;
    for (let i = 0; i < 10 && sim.state.phase === "live"; i++) sim.step(DT, IDLE);
    expect([sim.state.restartKind, sim.state.restartTeam]).toEqual(["corner", 0]);
  });

  it("192 autoplay fixtures: home and away goals within 25%, and neither end is easier to attack", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    const rand = makeRng(0x5eed0fc3);
    const goals = [0, 0], endGoals = { plus: 0, minus: 0 }, endShots = { plus: 0, minus: 0 };
    for (let m = 0; m < 192; m++) {
      sim.startMatch({ ...demoMatchConfig(rand, VENUE_ORDER[m % VENUE_ORDER.length]!), seed: 5000 + m });
      const s = sim.state;
      for (let i = 0; i < 20 * 60 * 60 && s.phase !== "ended"; i++) {
        for (const e of sim.step(DT, IDLE)) {
          if (e.type !== "goal" && e.type !== "shot") continue;
          const end = s.attackSign[e.team ?? 0] > 0 ? "plus" : "minus";
          if (e.type === "goal") { goals[e.team ?? 0]!++; endGoals[end]++; } else endShots[end]++;
        }
      }
    }
    console.log("FC_SIDE_BALANCE", JSON.stringify({ goals, endGoals, endShots, perMatch: +((goals[0]! + goals[1]!) / 192).toFixed(2) }));
    const within = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b);
    expect(goals[0]! + goals[1]!).toBeGreaterThan(192 * 2);
    expect(within(goals[0]!, goals[1]!)).toBeLessThanOrEqual(0.25);
    expect(within(endGoals.plus, endGoals.minus)).toBeLessThanOrEqual(0.25);
    expect(within(endShots.plus, endShots.minus)).toBeLessThanOrEqual(0.25);
  });
});
