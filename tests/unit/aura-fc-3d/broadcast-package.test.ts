import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BROADCAST_HEIGHT, BROADCAST_PITCH_DEG, INTRO_RAIL, INTRO_RAIL_S,
  broadcastPose, fitCameraToAspect, fullTimeOrbitPose, horizontalCoverage, introRailPose, replayPose
} from "../../../apps/showcase-aura-fc-3d/src/game/camera";
import { REPLAY_HISTORY_S, REPLAY_PLAYBACK_S, createReplayBuffer } from "../../../apps/showcase-aura-fc-3d/src/game/replay";
import { createSim, PITCH_HX, SIM_DT } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { MatchConfig, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";

type V = readonly [number, number, number];
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const depressionDeg = (eye: V, target: V) => (Math.atan2(eye[1] - target[1], Math.hypot(eye[0] - target[0], eye[2] - target[2])) * 180) / Math.PI;

/** GU47 WP-19 FC47-C1 (lane g09): broadcast package poses and the render-side goal replay buffer. */
describe("aura-fc-3d broadcast package (FC47-C1)", () => {
  it("main cam is the gantry: 14 m up, 30 degrees down at the centre spot, >= 20 m of pitch in portrait", () => {
    const shot = broadcastPose(0, 0, 0);
    expect(shot.eye[1]).toBe(BROADCAST_HEIGHT);
    expect(depressionDeg(shot.eye, shot.target)).toBeCloseTo(BROADCAST_PITCH_DEG, 5);
    // landscape coverage stays about the old rig's (~28 m at 16:9)
    expect(horizontalCoverage(shot.eye, shot.target, shot.fov, 16 / 9)).toBeGreaterThan(26);
    const fit = fitCameraToAspect(shot.eye, shot.target, shot.fov, 390 / 844);
    expect(horizontalCoverage(fit.eye, shot.target, fit.fov, 390 / 844)).toBeGreaterThanOrEqual(19.5);
  });

  it("intro rail runs 4 s from the tunnel mouth to the gantry it hands over to", () => {
    expect(INTRO_RAIL_S).toBe(4);
    const start = introRailPose(0), end = introRailPose(INTRO_RAIL_S);
    expect(start.eye[1]).toBeLessThan(2.5);
    expect(dist(start.eye, INTRO_RAIL[0]!)).toBeLessThan(1e-6);
    const gantry = broadcastPose(0, 0, 0);
    expect(dist(end.eye, gantry.eye)).toBeLessThan(1e-6);
    expect(dist(end.target, gantry.target)).toBeLessThan(1e-6);
    expect(end.fov).toBeCloseTo(gantry.fov, 6);
    // continuous: no jump between consecutive 60 Hz samples
    let prev = introRailPose(0);
    for (let t = 1 / 60; t <= INTRO_RAIL_S; t += 1 / 60) {
      const cur = introRailPose(t);
      expect(dist(prev.eye, cur.eye)).toBeLessThan(0.5);
      prev = cur;
    }
  });

  it("reduced motion holds the replay framing and the full-time frame still", () => {
    expect(replayPose(1, 4, 2, true, PITCH_HX)).toEqual(replayPose(1, 12, -3, true, PITCH_HX));
    expect(replayPose(1, 4, 2, false, PITCH_HX).target).not.toEqual(replayPose(1, 12, -3, false, PITCH_HX).target);
    expect(fullTimeOrbitPose(0, true)).toEqual(fullTimeOrbitPose(9, true));
    expect(fullTimeOrbitPose(0, false).eye).not.toEqual(fullTimeOrbitPose(9, false).eye);
  });

  it("replay buffer: >= 3 s playback of the last 2.4 s, snapshots are copies, the sim is untouched", () => {
    expect(REPLAY_PLAYBACK_S).toBeGreaterThanOrEqual(3 - 1e-9);
    const cfg: MatchConfig = { mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: false, seed: 7 } as MatchConfig;
    const recorded = createSim(), control = createSim();
    for (const sim of [recorded, control]) { sim.setAutopilot(true); sim.startMatch(cfg); }
    const buf = createReplayBuffer();
    const input: UserInputFrame = { move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false, skillStepover: false, skillChop: false, switchPlayer: false, pause: false };
    // record every step for 5 s of play; the control sim runs without a buffer
    for (let i = 0; i < 300; i++) {
      recorded.step(SIM_DT, input);
      control.step(SIM_DT, input);
      buf.record(recorded.state);
    }
    expect(JSON.stringify(recorded.state)).toBe(JSON.stringify(control.state));
    expect(buf.span()).toBeLessThanOrEqual(4 + 1e-9);
    const plan = buf.plan();
    expect(plan).not.toBeNull();
    expect(plan!.to - plan!.from).toBeCloseTo(REPLAY_HISTORY_S, 6);
    expect(plan!.duration).toBeGreaterThanOrEqual(3 - 1e-9);
    const first = buf.sample(plan!, 0)!, last = buf.sample(plan!, plan!.duration)!;
    expect(first.t).toBeCloseTo(plan!.from, 1);
    expect(last.t).toBeCloseTo(plan!.to, 6);
    // a snapshot is a copy: changing it does not reach the sim
    (first.players[0] as { x: number }).x += 100;
    expect(recorded.state.players[0]!.x).not.toBe(first.players[0]!.x);
    // a repeated record with no sim step is ignored; clear empties
    const n = buf.size;
    buf.record(recorded.state);
    expect(buf.size).toBe(n);
    buf.clear();
    expect(buf.plan()).toBeNull();
  });

  it("main.ts cuts on shot changes, plans the replay on goals and ships intro/replay off switches", () => {
    const main = readFileSync("apps/showcase-aura-fc-3d/src/main.ts", "utf8");
    expect(main).toMatch(/setPose\?\.\([^)]*\}, cut \? \{ cut: true \} : undefined\)/);
    expect(main).toMatch(/replayBuf\.plan\(\)/);
    expect(main).toMatch(/bootParams\.get\("intro"\) === "off" \|\| reducedMotion/);
    expect(main).toMatch(/bootParams\.get\("replay"\) === "off"/);
    expect(main).toMatch(/hud\.replayTag\(cam\.mode === "replay"\)/);
  });
});
