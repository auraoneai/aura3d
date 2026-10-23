/**
 * Deterministic replay of an action script through the port's simulation, recorded the same way the
 * reference capture records the original: actions land at the START of a 1/120 s step, events are
 * stamped with the 1-based step in which they happened (`start` is step 0), and a trace point is taken
 * every 60 steps (plus step 0 and the last step) with values rounded to 6 decimals.
 */
import { policyActions, type PolicyParams } from "./autopilot";
import { SIM_STEP, applyAction, createState, drainEvents, startRun, stepSim, type Action, type SimEvent, type SimState } from "./sim";

export interface ScriptEntry { readonly step: number; readonly actions: readonly Action[] }

export const ACTIONS: readonly Action[] = ["left", "right", "jump", "slide", "rasengan", "dash", "clones", "rasenshuriken", "cycleForm"];

/** `120:jump+rasengan;240:left` — the format the capture writes. */
export function decodeActionScript(text: string): ScriptEntry[] {
  if (text.trim() === "") return [];
  return text.split(";").map((chunk) => {
    const m = /^(\d+):([a-zA-Z+]+)$/.exec(chunk.trim());
    if (!m) throw new Error(`bad script entry "${chunk}"`);
    const actions = m[2]!.split("+").map((a) => {
      if (!ACTIONS.includes(a as Action)) throw new Error(`unknown action "${a}"`);
      return a as Action;
    });
    return { step: Number(m[1]), actions };
  });
}

export function encodeActionScript(entries: readonly ScriptEntry[]): string {
  return entries.map((e) => `${e.step}:${e.actions.join("+")}`).join(";");
}

const round = (x: number, d: number): number => {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
};

export interface TracePoint {
  step: number; time: number; s: number; x: number; lane: number; y: number; vy: number; speed: number; health: number; chakra: number;
  kills: number; score: number; combo: number; form: string; phase: string; attack: number; dash: number; slide: number;
  invulnerable: number; clones: number; cloneStrikes: number; shurikens: number; deflections: number; damageTaken: number;
  falling: boolean; vaults: number; projectiles: number; aliveEnemies: number;
}

export function tracePoint(z: SimState, step: number): TracePoint {
  let alive = 0;
  for (const e of z.entities) if (e.alive && e.type !== "chakra") alive++;
  return {
    step, time: round(z.time, 6), s: round(z.s, 6), x: round(z.x, 6), lane: z.lane, y: round(z.y, 6), vy: round(z.vy, 6), speed: round(z.speed, 6),
    health: z.health, chakra: round(z.chakra, 6), kills: z.kills, score: z.score, combo: z.combo, form: z.form, phase: z.phase,
    attack: round(z.attack, 6), dash: round(z.dash, 6), slide: round(z.slide, 6), invulnerable: round(z.invulnerable, 6), clones: round(z.clones, 6),
    cloneStrikes: z.cloneStrikes, shurikens: z.shurikens.length, deflections: z.deflections, damageTaken: z.damageTaken, falling: !!z.falling,
    vaults: z.vaults, projectiles: z.projectiles.length, aliveEnemies: alive
  };
}

export interface RecordedEvent extends SimEvent { step: number }

export interface RunRecord {
  outcome: "won" | "lost" | "timeout";
  steps: number;
  endPhase: string;
  lostBy: "gap" | "health" | null;
  distance: number;
  time: number;
  kills: number;
  score: number;
  health: number;
  chakra: number;
  bestCombo: number;
  form: string;
  vaults: number;
  deflections: number;
  interrupts: number;
  damageTaken: number;
  attacksFired: number;
  cloneStrikes: number;
  eventCounts: Record<string, number>;
  events: RecordedEvent[];
  trace: TracePoint[];
  script: ScriptEntry[];
  state: SimState;
}

export type Decide = (z: SimState, step: number) => readonly Action[];

/** Run until the phase leaves `running` or `maxSteps`. `decide` returns the actions for the start of each step. */
export function runRecorded(decide: Decide, maxSteps: number, seed?: number): RunRecord {
  const z = createState(seed);
  startRun(z);
  const events: RecordedEvent[] = [];
  const collect = (step: number): void => { for (const ev of drainEvents(z)) events.push({ step, ...ev }); };
  collect(0);
  const trace: TracePoint[] = [tracePoint(z, 0)];
  const script: ScriptEntry[] = [];
  let n = 0;
  while (z.phase === "running" && n < maxSteps) {
    const actions = decide(z, n);
    if (actions.length) script.push({ step: n, actions: [...actions] });
    for (const a of actions) applyAction(z, a);
    stepSim(z, SIM_STEP);
    collect(n + 1);
    n++;
    if (n % 60 === 0) trace.push(tracePoint(z, n));
  }
  if (n % 60 !== 0) trace.push(tracePoint(z, n));
  const eventCounts: Record<string, number> = {};
  for (const e of events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
  return {
    outcome: z.phase === "won" ? "won" : z.phase === "lost" ? "lost" : "timeout", steps: n, endPhase: z.phase,
    lostBy: z.phase === "lost" ? (z.falling ? "gap" : "health") : null, distance: round(z.s, 6), time: round(z.time, 6), kills: z.kills, score: z.score,
    health: z.health, chakra: round(z.chakra, 6), bestCombo: z.bestCombo, form: z.form, vaults: z.vaults, deflections: z.deflections,
    interrupts: z.interrupts, damageTaken: z.damageTaken, attacksFired: z.attacksFired, cloneStrikes: z.cloneStrikes, eventCounts, events, trace, script, state: z
  };
}

export function replayScript(entries: readonly ScriptEntry[], maxSteps: number, seed?: number): RunRecord {
  const byStep = new Map<number, readonly Action[]>();
  for (const e of entries) byStep.set(e.step, e.actions);
  return runRecorded((_, n) => byStep.get(n) ?? [], maxSteps, seed);
}

export function runPolicy(params: PolicyParams, maxSteps: number, seed?: number): RunRecord {
  return runRecorded((z) => policyActions(z, params), maxSteps, seed);
}

export function runIdle(maxSteps: number, seed?: number): RunRecord {
  return runRecorded(() => [], maxSteps, seed);
}

/** FNV-1a over the course population, identical to the capture's `courseDigest`. */
export function courseDigest(z: SimState): { entities: number; byType: Record<string, number>; fnv1a: string } {
  const byType: Record<string, number> = {};
  const rows: string[] = [];
  for (const e of z.entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    rows.push(`${e.id},${e.s.toFixed(6)},${e.lane},${e.type},${e.hp}`);
  }
  const text = rows.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { entities: z.entities.length, byType, fnv1a: `00000000${h.toString(16)}`.slice(-8) };
}
