/**
 * Replay of the original's recorded Last Train reference (evidence/crayon-capture/last-train-reference.json)
 * through the port's simulation. The reference's per-step inputs are applied during each leg's enroute phase
 * (the port decides its own dock timings), and doors / depart / new-service / time-of-day actions are issued the
 * way the capture's controller did.
 */
import { DT, actionDepart, actionDoors, actionNewService, actionTimeOfDay, createState, step, type SimData, type SimState, type StepInput } from "./sim";

export interface RefEvent { step: number; t: number; kind: string; phase?: string; from?: string; leg: number; aboard: number; fares: number; tips: number; lost: number; catches: number; comfort: number; timeOfDay: string; circuits: number; action?: string; value?: string; trips?: RefTrip[]; arrivedLeg?: number; score: number }
export interface RefTrip { id: string; name: string; origin: number; destination: number; seat: number; fareDistance: number; tip: number; comfort: number; weight: number; jDistance: number }
export interface Reference { inputs: string; events: RefEvent[]; loops: { loop: number; steps: number; seconds: number; score: number; legs: { leg: number; steps: number; seconds: number; fares: number; tips: number; lost: number; aboard: number; catches: number }[] }[]; constants: Record<string, unknown> }

export function decodeInputs(text: string): StepInput[] {
  const out: StepInput[] = [];
  for (const seg of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)x(.*)$/.exec(seg);
    if (!m) throw new Error(`bad input segment ${seg}`);
    const [flags, pace] = (m[2] as string).split("/");
    const f = flags === "-" ? "" : (flags as string);
    const input: StepInput = { accelerate: f.includes("A"), brake: f.includes("B"), reverse: f.includes("R"), left: f.includes("L"), right: f.includes("P"), cruisePace: pace ?? null };
    for (let k = 0; k < Number(m[1]); k++) out.push(input);
  }
  return out;
}

export interface ControllerParams { kRoll: number; kVel: number; deadband: number; pace: string; brakeDecel: number; brakeMargin: number }

/** The capture's closed-loop controller (tools/crayon-capture/last-train-lib.ts): PD balance on roll, brake on remaining distance. */
export function controllerInput(s: SimState, data: SimData, p: ControllerParams): StepInput {
  const u = -(p.kRoll * s.roll + p.kVel * s.rollVelocity);
  const remaining = (data.route.legs[s.leg] as { length: number }).length - s.distance;
  const brake = s.speed > 0.5 && remaining < (s.speed * s.speed) / (2 * p.brakeDecel) + p.brakeMargin;
  return { accelerate: !brake, brake, left: u < -p.deadband, right: u > p.deadband, cruisePace: brake ? null : p.pace };
}

export interface EnrouteSlice { loop: number; leg: number; startStep: number; endStep: number }

/** Reference enroute spans: from the `enroute` phase event to the following `docked` event. */
export function enrouteSlices(events: readonly RefEvent[]): EnrouteSlice[] {
  const out: EnrouteSlice[] = [];
  let start: number | null = null;
  let legsInLoop = 0, loop = 1, legIndex = 0;
  for (const e of events) {
    if (e.kind === "new-service") { loop++; legsInLoop = 0; legIndex = 0; }
    if (e.kind === "phase" && e.phase === "enroute") start = e.step;
    if (e.kind === "phase" && e.phase === "docked" && start !== null) {
      out.push({ loop, leg: legIndex, startStep: start, endStep: e.step });
      start = null; legsInLoop++; legIndex++;
    }
  }
  void legsInLoop;
  return out;
}

export interface LegResult { loop: number; leg: number; steps: number; refSteps: number; overran: boolean; fares: number; tips: number; lost: number; aboard: number; catches: number }
export interface ReplayResult { legs: LegResult[]; loopScores: number[]; final: SimState; totalSteps: number; arrivalLegs: number[] }

/** Replay `loops` circuits (default: all in the reference). */
export function replay(ref: Reference, data: SimData, loops?: number, mode: "controller" | "script" = "controller"): ReplayResult {
  const params = (ref as unknown as { setup: { controller: ControllerParams } }).setup.controller;
  const inputs = decodeInputs(ref.inputs);
  const slices = enrouteSlices(ref.events);
  const s = createState();
  const nLegs = data.tables.towns.length;
  const wanted = loops ?? ref.loops.length;
  const legs: LegResult[] = [];
  const loopScores: number[] = [];
  const arrivalLegs: number[] = [];
  let steps = 0;
  const idle: StepInput = {};
  const advance = (input: StepInput): void => { step(s, DT, input, data); steps++; };
  const until = (phase: string): void => { let g = 0; while (s.phase !== phase) { advance(idle); if (++g > 20000) throw new Error(`stuck waiting for ${phase} in ${s.phase}`); } };
  for (let loop = 1; loop <= wanted; loop++) {
    if (s.attempt.status !== "active") actionNewService(s);
    if (loop === 2) actionTimeOfDay(s, "night");
    if (loop === 3) actionTimeOfDay(s, "day");
    for (let k = 0; k < nLegs; k++) {
      const f0 = s.attempt.fares, t0 = s.attempt.tips, l0 = s.attempt.lost, c0 = s.catches;
      if (s.phase === "docked") actionDoors(s);
      until("ready");
      actionDepart(s);
      until("enroute");
      const slice = slices.find((x) => x.loop === loop && x.leg === k);
      if (!slice) throw new Error(`no reference slice for loop ${loop} leg ${k}`);
      const span = inputs.slice(slice.startStep, slice.endStep);
      let i = 0;
      const startSteps = steps;
      while (s.phase === "enroute") {
        advance(mode === "controller" ? controllerInput(s, data, params) : (span[Math.min(i, span.length - 1)] as StepInput));
        i++;
        if (i > span.length + 12000) throw new Error(`leg ${k} of loop ${loop} did not arrive (${i} steps, ref ${span.length})`);
      }
      legs.push({ loop, leg: k, steps: steps - startSteps, refSteps: span.length, overran: i > span.length + 600, fares: s.attempt.fares - f0, tips: s.attempt.tips - t0, lost: s.attempt.lost - l0, aboard: s.passengers, catches: s.catches - c0 });
      arrivalLegs.push(s.leg);
    }
    if (s.phase === "docked") actionDoors(s);
    until("ready");
    loopScores.push(s.score);
  }
  return { legs, loopScores, final: s, totalSteps: steps, arrivalLegs };
}
