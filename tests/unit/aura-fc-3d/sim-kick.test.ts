import { describe, expect, it } from "vitest";
import { createSim } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { PlayerState, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * A full CPU-vs-CPU match through the real sim. Every kick (shots, passes, crosses, keeper kicks) must
 *  - launch at 0.74 of the swing, the fraction the baked kick clips put the boot on the ball,
 *  - launch along the kicker's facing (the swing turns the kicker to the kick line), and
 *  - launch with the kicker planted (standing foot stays on the ground).
 */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;

interface KickRecord { id: string; kind: string; T: number; startStep: number; launchStep: number; yawErrDeg: number; speedAtLaunch: number; speedAtStart: number; power: number }

function playMatch(seconds: number): KickRecord[] {
  const sim = createSim();
  sim.setAutopilot(true);
  sim.startMatch({ mode: "quick", venue: "favela", homeClub: "aurora", awayClub: "kings", userTeam: null, difficulty: 0.7, goldenGoal: false, shootoutOnTie: false });
  const open = new Map<string, { startStep: number; T: number; speed: number; power: number }>();
  const prevKickT = new Map<string, number>();
  const out: KickRecord[] = [];
  for (let step = 0; step < seconds * 60; step++) {
    const events = sim.step(DT, IDLE);
    for (const p of sim.state.players as PlayerState[]) {
      const before = prevKickT.get(p.id) ?? 0;
      if (p.kickT > before + 0.05) open.set(p.id, { startStep: step, T: p.kickDur, speed: p.speed, power: p.kickPower });
      prevKickT.set(p.id, p.kickT);
    }
    for (const ev of events) {
      if ((ev.type !== "shot" && ev.type !== "pass") || !ev.playerId) continue;
      const rec = open.get(ev.playerId);
      const p = (sim.state.players as PlayerState[]).find((q) => q.id === ev.playerId);
      if (!rec || !p) continue;
      const b = sim.state.ball;
      const launch = Math.atan2(b.vz, b.vx);
      let d = launch - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      out.push({ id: p.id, kind: ev.label, T: rec.T, startStep: rec.startStep, launchStep: step, yawErrDeg: Math.abs(d) * 180 / Math.PI, speedAtLaunch: p.speed, speedAtStart: rec.speed, power: rec.power });
      open.delete(ev.playerId);
    }
  }
  return out;
}

describe("sim kicks drive the baked kick animation", () => {
  const kicks = playMatch(300);

  it("the match produced a real sample of kicks", () => {
    expect(kicks.length).toBeGreaterThanOrEqual(10);
    expect(new Set(kicks.map((k) => k.id)).size).toBeGreaterThanOrEqual(4);
  });

  it("every kick launches at 0.74 of its swing (within two sim frames)", () => {
    const errs = kicks.map((k) => Math.abs((k.launchStep - k.startStep) * DT - 0.74 * k.T));
    console.log("SIM_KICK_TIMING", JSON.stringify({ kicks: kicks.length, maxErrSeconds: +Math.max(...errs).toFixed(4) }));
    for (const e of errs) expect(e).toBeLessThanOrEqual(2 * DT + 1e-9);
  });

  it("every kick launches along the kicker's facing (swing direction within 15 degrees of the ball's launch direction)", () => {
    const errs = kicks.map((k) => k.yawErrDeg);
    console.log("SIM_KICK_DIRECTION", JSON.stringify({ kicks: kicks.length, maxYawErrDeg: +Math.max(...errs).toFixed(2), medianYawErrDeg: +[...errs].sort((a, b) => a - b)[Math.floor(errs.length / 2)]!.toFixed(2) }));
    for (const e of errs) expect(e).toBeLessThan(15);
  });

  it("the kicker is planted at the strike (under 0.5 m/s even from a sprint)", () => {
    const fast = kicks.filter((k) => k.speedAtStart > 3);
    console.log("SIM_KICK_PLANT", JSON.stringify({ kicks: kicks.length, startedOnTheRun: fast.length, maxSpeedAtLaunch: +Math.max(...kicks.map((k) => k.speedAtLaunch)).toFixed(3) }));
    for (const k of kicks) expect(k.speedAtLaunch).toBeLessThan(0.5);
  });
});

describe("an interrupted swing is a whiff, not a delayed phantom kick", () => {
  it("losing the ball mid-swing clears the pending kick, and regaining it later does not launch anything", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    sim.startMatch({ mode: "quick", venue: "favela", homeClub: "aurora", awayClub: "kings", userTeam: null, difficulty: 0.7, goldenGoal: false, shootoutOnTie: false });
    const players = () => sim.state.players as unknown as Array<PlayerState & { pendKick: unknown }>;
    let kicker: (PlayerState & { pendKick: unknown }) | undefined;
    for (let step = 0; step < 60 * 120 && !kicker; step++) {
      sim.step(DT, IDLE);
      kicker = players().find((p) => p.pendKick !== null && p.kickT > 0.15);
    }
    expect(kicker, "autopilot started a kick within 2 minutes").toBeTruthy();
    const rival = players().find((p) => p.team !== kicker!.team && !p.isKeeper)!;
    const b = sim.state.ball;
    b.ownerId = rival.id; b.mode = "dribble";                      // the rival wins it mid-swing
    sim.step(DT, IDLE);
    expect(kicker!.pendKick).toBeNull();
    for (let i = 0; i < 90; i++) sim.step(DT, IDLE);                // the swing finishes, nothing launches from it
    const kicksBefore = sim.state.kicks;
    b.ownerId = kicker!.id; b.mode = "dribble"; b.x = kicker!.x; b.z = kicker!.z;
    const events = sim.step(DT, IDLE);
    expect(events.filter((e) => (e.type === "shot" || e.type === "pass") && e.playerId === kicker!.id)).toEqual([]);
    expect(sim.state.kicks).toBe(kicksBefore);
  });

  it("a stun cancels the swing: no launch from a staggering kicker", () => {
    const sim = createSim();
    sim.setAutopilot(true);
    sim.startMatch({ mode: "quick", venue: "favela", homeClub: "aurora", awayClub: "kings", userTeam: null, difficulty: 0.7, goldenGoal: false, shootoutOnTie: false });
    const players = () => sim.state.players as unknown as Array<PlayerState & { pendKick: unknown }>;
    let kicker: (PlayerState & { pendKick: unknown }) | undefined;
    for (let step = 0; step < 60 * 120 && !kicker; step++) {
      sim.step(DT, IDLE);
      kicker = players().find((p) => p.pendKick !== null && p.kickT > 0.15);
    }
    expect(kicker).toBeTruthy();
    const kicksBefore = sim.state.kicks;
    kicker!.stunT = 0.5;
    sim.step(DT, IDLE);
    expect(kicker!.pendKick).toBeNull();
    expect(kicker!.kickT).toBe(0);
    let launched = false;
    for (let i = 0; i < 25; i++) {                                 // the rest of the stun window
      for (const e of sim.step(DT, IDLE)) if ((e.type === "shot" || e.type === "pass") && e.playerId === kicker!.id) launched = true;
    }
    expect(launched).toBe(false);
    expect(sim.state.kicks).toBe(kicksBefore);
  });
});
