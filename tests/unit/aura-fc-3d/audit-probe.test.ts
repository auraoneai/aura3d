import { describe, it } from "vitest";
import { createSim } from "../../../apps/showcase-aura-fc-3d/src/game/sim";
import type { MatchConfig, SimEvent, UserInputFrame } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * Audit probe (lane G09): measures the sim defects the 2026-10-29 audit lists, with no assertions, so the same file runs
 * against the base tree and the fixed tree and prints comparable numbers (SIM_PROBE lines). The pass/fail checks live in
 * audit-fixes.test.ts.
 */
const IDLE: UserInputFrame = {
  move: [0, 0], sprint: false, passShort: false, passDriven: false, shootHeld: false, shootReleased: false,
  skillStepover: false, skillChop: false, switchPlayer: false, pause: false
};
const DT = 1 / 60;
const CPU: MatchConfig = { mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron", userTeam: null, difficulty: 0.65, goldenGoal: false, shootoutOnTie: true };

function cpuShootout(seed: number) {
  const sim = createSim();
  sim.setAutopilot(true);
  sim.startMatch({ ...CPU, seed: (seed * 2654435761) >>> 0 } as MatchConfig);
  // burn a seed-dependent number of steps so the shared RNG differs between shootouts
  for (let i = 0; i < seed % 97; i++) sim.step(DT, IDLE);
  const s = sim.state;
  s.half = 2; s.clock = 89.99; s.phase = "live"; s.score = [0, 0];
  const phase = (): string => s.phase;
  let guard = 0;
  while (phase() !== "shootout" && guard++ < 600) sim.step(DT, IDLE);
  const kicks: { team: number; result: string }[] = [];
  guard = 0;
  while (phase() === "shootout" && guard++ < 60 * 200) {
    for (const e of sim.step(DT, IDLE)) {
      if (e.type === "pen-goal" || e.type === "pen-save" || e.type === "pen-miss") kicks.push({ team: e.team ?? -1, result: e.type });
    }
  }
  return { kicks, taken: s.shootout ? [...s.shootout.taken] : null, scores: s.shootout ? [...s.shootout.scores] : null, winner: s.winner };
}

function cpuMatch(venue: MatchConfig["venue"], seconds: number, seed = 1) {
  const sim = createSim();
  sim.setAutopilot(true);
  sim.startMatch({ ...CPU, venue, shootoutOnTie: false, seed: (seed * 2654435761) >>> 0 } as MatchConfig);
  const counts: Record<string, number> = {} as Record<string, number>;
  let err: string | null = null;
  try {
    for (let i = 0; i < seconds * 60 && sim.state.phase !== "ended"; i++) {
      for (const e of sim.step(DT, IDLE) as SimEvent[]) counts[e.label.startsWith("GOAL") ? "goal" : e.label] = (counts[e.label.startsWith("GOAL") ? "goal" : e.label] ?? 0) + 1;
    }
  } catch (e) { err = String((e as Error).message); }
  const s = sim.state;
  return { score: [...s.score], shotsOn: [...s.shotsOn], saves: [...s.saves], counts, err };
}

describe("aura fc audit probe", () => {
  it("cpu shootouts: conversion per side and how sudden death ends", () => {
    const tally = { home: { taken: 0, scored: 0 }, away: { taken: 0, scored: 0 } };
    const unequalEnds: unknown[] = [];
    const results: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const r = cpuShootout(i * 13 + 1);
      for (const k of r.kicks) {
        const side = k.team === 0 ? tally.home : tally.away;
        side.taken++;
        if (k.result === "pen-goal") side.scored++;
        results[`${k.team}:${k.result}`] = (results[`${k.team}:${k.result}`] ?? 0) + 1;
      }
      if (r.taken && r.taken[0] >= 5 && r.taken[1] >= 5 && r.taken[0] !== r.taken[1]) unequalEnds.push({ taken: r.taken, scores: r.scores });
    }
    console.log("SIM_PROBE shootouts", JSON.stringify({ ...tally, homeRate: +(tally.home.scored / tally.home.taken).toFixed(3), awayRate: +(tally.away.scored / tally.away.taken).toFixed(3), results, suddenDeathEndedBeforeReply: unequalEnds.length, sample: unequalEnds.slice(0, 3) }));
  });

  it("cpu matches: goals, shots, saves and tackle wins", () => {
    const rows: ReturnType<typeof cpuMatch>[] = [];
    for (let i = 0; i < 24; i++) rows.push(cpuMatch("munich", 200, i + 1));
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    console.log("SIM_PROBE matches", JSON.stringify({
      matches: rows.length,
      goals: sum((r) => r.score[0] + r.score[1]),
      nilNil: rows.filter((r) => r.score[0] + r.score[1] === 0).length,
      perMatch: rows.map((r) => r.score[0] + r.score[1]),
      shotsOn: sum((r) => r.shotsOn[0] + r.shotsOn[1]),
      shotEvents: sum((r) => Object.entries(r.counts).filter(([k]) => k.startsWith("shot —")).reduce((a, [, v]) => a + v, 0)),
      saves: sum((r) => r.saves[0] + r.saves[1]),
      tackleWins: sum((r) => r.counts["slide tackle wins it"] ?? 0),
      errors: rows.filter((r) => r.err).map((r) => r.err)
    }));
  });

  it("favela: goals still count with the walls up", () => {
    const rows: ReturnType<typeof cpuMatch>[] = [];
    for (let i = 0; i < 6; i++) rows.push(cpuMatch("favela", 200, i + 101));
    console.log("SIM_PROBE favela", JSON.stringify({ matches: rows.length, goals: rows.reduce((a, r) => a + r.score[0] + r.score[1], 0), wallBounces: rows.reduce((a, r) => a + (r.counts["off the boards"] ?? 0), 0) }));
  });

  it("touch lab: ball over the touchline, the goal line and into the goal", () => {
    const out: Record<string, unknown> = {};
    for (const [name, place] of [
      ["touchline", (b: any) => { b.x = 5; b.z = 18.5; b.vx = 0; b.vz = 3; b.mode = "loose"; }],
      ["goal-line", (b: any) => { b.x = 30.5; b.z = 9; b.vx = 3; b.vz = 0; b.mode = "loose"; }],
      ["into-goal", (b: any) => { b.x = 29; b.z = 0; b.y = 0.5; b.vx = 14; b.vz = 0; b.vy = 0; b.mode = "flight"; b.lastShot = "shot"; }]
    ] as const) {
      const sim = createSim();
      sim.startMatch({ ...CPU, mode: "quick", userTeam: 0 });
      sim.spawnLab("touch");
      place(sim.state.ball);
      let err: string | null = null, steps = 0;
      try { for (; steps < 300; steps++) sim.step(DT, IDLE); } catch (e) { err = String((e as Error).message).slice(0, 80); }
      out[name] = { steps, err, phase: sim.state.phase };
    }
    console.log("SIM_PROBE touchlab", JSON.stringify(out));
  });
});
