import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInputMapper } from "../../../examples/aura-slam/input/mapper";
import { createAdapterController } from "../../../examples/aura-slam/shell/controller";
import { playerFrame } from "../../../examples/aura-slam/shell/inputFrame";
import { matchResetOptions } from "../../../examples/aura-slam/shell/matchSetup";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";

/**
 * Shell-level replay of evidence/aura-slam/reference.json scenarios (gate G1): the engine is driven the way the page
 * drives it (readInput through the native input mapper, key events, one adapter-controller step per presented frame
 * after each fixed step) and every step is snapshot, digested and logged with the same procedure as the capture
 * (tests/browser/aura-slam-capture.spec.ts).
 */
export interface ReferenceScenario {
  id: string;
  setup: { difficulty: string; venue: string; fixedStepSeconds: number };
  script: { encoding: string; inputs?: Array<{ step: number; code: string; down: boolean }> };
  reference: {
    steps: number; finalMode: string; finalPhase: string; winner: string | null; matchWon: boolean | null;
    score: { pg: number; ag: number; pp: number; ap: number }; stats: unknown; eventCounts: Record<string, number>; eventCount: number;
    timeline: TimelineEntry[]; digest: string;
  };
  events: ReplayEvent[];
  sampled: { columns: string[]; rows: Array<Array<number | string | null>> };
  sessions: Array<{ digest: string; steps: number }>;
}
export interface ReferenceFile {
  schema: string; game: string; scenarios: ReferenceScenario[];
  tolerance: { exactDigestRequired?: boolean; sampledAbsTolerance: number; eventStepTolerance: number };
}
export interface TimelineEntry { step: number; t: number; pg: number; ag: number; pp: number; ap: number; phase: string; winner: string | null; tb: boolean }
export interface ReplayEvent {
  step: number; t: number | null; type: string; side: string | null; shot: string | null; won: boolean | null;
  args: Array<number | string> | null; contact: Record<string, unknown> | null;
}
export interface ReplayResult {
  steps: number; digest: string; leadIn: number; finalMode: string; finalPhase: string; winner: string | null; matchWon: boolean | null;
  score: { pg: number; ag: number; pp: number; ap: number }; stats: unknown; events: ReplayEvent[]; eventCounts: Record<string, number>;
  timeline: TimelineEntry[]; rows: Map<number, Array<number | string | null>>;
}
export interface DrivableEngine { state: any; step(dt?: number): void; resetMatch(options?: any): void; requestSwing?(side: string, time: number, forcePower?: boolean): unknown; selectShot?(shot: string, side?: string): unknown; capabilities?: { serveTargeting?: boolean } }
export type EngineFactory = (options: { readInput: (side: string) => unknown; onEvent: (event: any) => void }) => DrivableEngine;

export const REFERENCE_PATH = join(process.cwd(), "evidence/aura-slam/reference.json");
export const loadReference = (): ReferenceFile => JSON.parse(readFileSync(REFERENCE_PATH, "utf8")) as ReferenceFile;
export const nativeFactory: EngineFactory = (options) => createMatchEngine(options as never) as unknown as DrivableEngine;

const FIXED_DT = 1 / 60;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** One snapshot row: the 39 columns of the capture (column 0 `step` is added by the sampler). */
export function snapshotRow(s: any): Array<number | string | null> {
  const b = s.ball, p = s.player, a = s.ai;
  return [round6(s.time), s.mode, s.phase, s.server, s.serveNumber, s.score.playerPoints, s.score.aiPoints, s.score.playerGames, s.score.aiGames, s.rallyHits, s.tiebreak ? 1 : 0,
    round6(b.x), round6(b.y), round6(b.z), round6(b.vx), round6(b.vy), round6(b.vz), b.active ? 1 : 0, b.bounceCount, b.lastHit, round6(b.speedKph ?? 0),
    round6(p.x), round6(p.y), round6(p.vx), round6(p.vy), round6(p.swing), p.stroke, round6(p.moveBlend), round6(p.stride),
    round6(a.x), round6(a.y), round6(a.vx), round6(a.vy), round6(a.swing), a.stroke, round6(a.moveBlend), round6(a.stride), s.message || "", round6(s.energy ?? 0)];
}

/** Ticks the live page ran between the match reset and the first captured snapshot: step 1 of the reference sits at t = (leadIn + 1) / 60. */
export function leadInTicks(sc: ReferenceScenario): number {
  const firstTime = sc.sampled.rows[0]![1] as number;
  return Math.round(firstTime / FIXED_DT) - 1;
}

export function replayScenario(sc: ReferenceScenario, make: EngineFactory, options: { maxSteps?: number } = {}): ReplayResult {
  const autoplay = sc.id.startsWith("auto-");
  const mapper = createInputMapper();
  const keys: Record<string, boolean> = {};
  const events: ReplayEvent[] = [];
  let step = 0;
  let engine: DrivableEngine;
  const strategic = (): boolean => engine.state.difficulty === "pro" || engine.state.difficulty === "legend";
  engine = make({
    readInput: (side) => (side === "player"
      ? playerFrame(mapper, { keys, stick: { x: 0, y: 0 }, inputBlocked: false, modernServe: Boolean(engine.capabilities?.serveTargeting), strategic: strategic(), state: engine.state })
      : undefined),
    onEvent: (e) => {
      const rounded = (n: unknown): unknown => (typeof n === "number" ? +n.toFixed(4) : n);
      events.push({
        step, t: engine?.state?.time ?? null, type: e.type, side: e.side ?? null, shot: e.shot ?? null, won: e.won ?? null,
        args: Array.isArray(e.args) ? e.args.map(rounded) as Array<number | string> : null,
        contact: e.contact ? { x: +e.contact.x.toFixed(4), y: +e.contact.y.toFixed(4), speedKph: e.contact.speedKph ?? null, vz: e.contact.verticalSpeed != null ? +e.contact.verticalSpeed.toFixed(4) : null, venue: e.contact.venue ?? null, stroke: e.contact.stroke ?? null } : null
      });
    }
  });
  events.length = 0;
  const controller = createAdapterController({ engine: () => engine, state: () => engine.state, autoplay });

  const keyEvent = (code: string, down: boolean): void => {
    if (!down) { controller.keyUp({ code }); keys[code] = false; return; }
    controller.keyDown({ code });
    const action = mapper.bindings.actionForKey(code) as string | null;
    const actionWasDown = Boolean(action && mapper.bindings.isDown(action, keys));
    if (keys[code]) return;
    keys[code] = true;
    const s = engine.state;
    if (!action || s.mode !== "playing" || s.paused) return;
    if (action === "hit") { if (!actionWasDown) engine.requestSwing?.("player", s.time, false); return; }
    if (!["left", "right", "up", "down"].includes(action)) throw new Error(`replay script uses unsupported action ${action} (${code})`);
  };

  engine.resetMatch(matchResetOptions({ difficulty: sc.setup.difficulty as never, venue: sc.setup.venue, practice: false, allowSwipe: false, controlStyle: "classic" }));
  const leadIn = leadInTicks(sc);
  for (let i = 0; i < leadIn; i++) engine.step(FIXED_DT);

  const byStep = new Map<number, Array<{ code: string; down: boolean }>>();
  for (const input of sc.script.inputs ?? []) byStep.set(input.step, [...(byStep.get(input.step) ?? []), input]);

  let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
  const feed = (text: string): void => { for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ (c + 31), 2246822519 | 0); } };
  const rows = new Map<number, Array<number | string | null>>();
  const timeline: TimelineEntry[] = [];
  feed(JSON.stringify(snapshotRow(engine.state)));
  let prevGames = 0, prevPoints = 0;
  const maxSteps = options.maxSteps ?? sc.reference.steps;
  for (step = 1; step <= maxSteps; step++) {
    for (const input of byStep.get(step) ?? []) keyEvent(input.code, input.down);
    engine.step(FIXED_DT);
    controller.step(engine.state, FIXED_DT);
    const row = snapshotRow(engine.state);
    feed(JSON.stringify(row));
    if (step % 10 === 0 || step < 200) rows.set(step, row);
    const s = engine.state;
    const games = s.score.playerGames + s.score.aiGames, points = s.score.playerPoints + s.score.aiPoints;
    if (games !== prevGames || points !== prevPoints) timeline.push({ step, t: round6(s.time), pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints, phase: s.phase, winner: s.pointWinner ?? null, tb: s.tiebreak });
    prevGames = games; prevPoints = points;
    if (s.mode === "gameover") { step++; break; }
  }
  const steps = step - 1;
  const s = engine.state;
  const eventCounts: Record<string, number> = {};
  for (const e of events) eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1;
  return {
    steps, leadIn, digest: `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`,
    finalMode: s.mode, finalPhase: s.phase, winner: s.winner ?? null, matchWon: s.matchWon ?? null,
    score: { pg: s.score.playerGames, ag: s.score.aiGames, pp: s.score.playerPoints, ap: s.score.aiPoints }, stats: s.stats,
    events, eventCounts, timeline, rows
  };
}

/** First sampled step whose row differs from the reference by more than `tolerance` (one unit of the 1e-6 rounding), or -1; also reports the column. */
export function firstRowDivergence(rows: Map<number, Array<number | string | null>>, sc: ReferenceScenario, tolerance: number): { step: number; column: string; got: unknown; want: unknown } | null {
  const slack = tolerance + 1e-9;
  for (const ref of sc.sampled.rows) {
    const step = ref[0] as number;
    const got = rows.get(step);
    if (!got) return { step, column: "(row missing)", got: null, want: null };
    for (let j = 0; j < got.length; j++) {
      const a = got[j], b = ref[j + 1];
      const bad = typeof a === "number" && typeof b === "number" ? Math.abs(a - b) > slack : a !== b;
      if (bad) return { step, column: sc.sampled.columns[j + 1]!, got: a, want: b };
    }
  }
  return null;
}

const GAME_DIR = join(process.cwd(), "apps/showcase-top-tennis/public/toptennis");
function loadUmd(file: string, modules: Record<string, unknown> = {}): any {
  const module = { exports: {} as any };
  new Function("module", "require", "exports", readFileSync(join(GAME_DIR, file), "utf8"))(module, (name: string) => modules[name], module.exports);
  return module.exports;
}
/** The original match-engine.js (data, evaluated as CJS), the in-process oracle for "native is bit-identical on this platform". */
export function originalFactory(): EngineFactory {
  const physics = loadUmd("physics.js");
  const strokes = loadUmd("strokes.js", { "./physics.js": physics });
  const original = loadUmd("match-engine.js", { "./physics.js": physics, "./strokes.js": strokes, "./player-roster.js": loadUmd("player-roster.js"), "./player-appearance.js": loadUmd("player-appearance.js") });
  return (options) => original.create(options) as DrivableEngine;
}
