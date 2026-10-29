// Wonder World QA hooks (PRD 04 B12; PRD 06 section 4 step 4; PRD 03 section 8).
//
// `installQaHooks("wonder-world", ...)` from `@aura3d/engine` publishes
// `window.__AURA_WONDER_WORLD__` (the name `qaHookGlobalName` derives from the
// id) with the standard hooks and the Wonder World extras the remote browser
// specs (tests/browser/wonder-world-*.spec.ts) drive:
//
//   ready(), state(), stepFrames(n), reset(seed?), replay(script), begin(),
//   traceRow(), frame(), pixels(), info(), routeHealth(), nodeCount(), plus
//   startStory(id, mode), advance(ms), runToEnd(maxMs?), tap(id),
//   parentConfirm(), pause(), resume(), allDone(), skipBeat(),
//   setReducedMotion(on), targetRects(), diagnostics(), and for the character
//   sheet captures nodeRects(ids), stageApply(actions), setTalking(actor).
//
// Time: every hook that moves time moves the story clock in fixed 50 ms steps
// (`stepFrames(n)` is n steps); nothing reads a wall clock. With `?manual=1`
// only these hooks move time. Everything returned is plain data with no child
// data: story ids, beat ids, line keys, target ids, counters and settings.

import { installQaHooks, qaHookGlobalName, type InstalledQaHooks } from "@aura3d/engine";
import { STEP_MS, type RunToEndResult, type WonderApp, type WonderDiagnostics, type WonderState } from "../app.js";
import type { TargetRect } from "../scenes/stage.js";
import type { PlayMode, StageAction } from "../types.js";

/** The QA hook id; the global is `__AURA_WONDER_WORLD__`. */
export const QA_HOOK_NAME = "wonder-world";
export const QA_GLOBAL_NAME = qaHookGlobalName(QA_HOOK_NAME);

/** The part of the app the hooks drive. */
export type WonderQaApp = Pick<
  WonderApp,
  | "isReady"
  | "state"
  | "startStory"
  | "advance"
  | "runToEnd"
  | "tap"
  | "parentConfirm"
  | "pause"
  | "resume"
  | "allDone"
  | "skipBeat"
  | "setReducedMotion"
  | "targetRects"
  | "nodeRects"
  | "stageApply"
  | "setTalking"
  | "diagnostics"
  | "begin"
  | "reset"
  | "auraApp"
>;

/** Wonder World hooks merged over the standard ones. */
export interface WonderQaExtras {
  /** Skips the start screen and menu, loads the world and starts the director (works with audio locked). */
  startStory(id: string, mode: PlayMode): Promise<void>;
  /** Advances director and stage in fixed 50 ms steps, then draws once. */
  advance(ms: number): void;
  /** Zero input until the story ends (default limit 20 minutes of story time). */
  runToEnd(maxMs?: number): RunToEndResult;
  /** Routes like a child tap; false when the target is not active. */
  tap(targetId: string): boolean;
  /** The parent's confirm on a waiting beat; false when nothing is waiting. */
  parentConfirm(): boolean;
  pause(): void;
  resume(): void;
  allDone(): void;
  skipBeat(): void;
  setReducedMotion(on: boolean): void;
  /** Active tap targets in viewport CSS px, for real pointer taps. */
  targetRects(): TargetRect[];
  /** Drawn bounds of the given scene nodes in viewport CSS px (character sheet crops). */
  nodeRects(ids: readonly string[]): TargetRect[];
  /** Applies stage actions to the running story at once (pose and turnaround sheets); no story event. */
  stageApply(actions: readonly StageAction[]): void;
  /** Starts (actor id) or stops (null) a talking pulse without a line. */
  setTalking(actor: string | null): void;
  diagnostics(): WonderDiagnostics;
}

/** One replayed command and the state after it. */
export interface ReplayRow {
  readonly command: string;
  readonly ok: boolean;
  readonly screen: string;
  readonly phase: string | null;
  readonly beatId: string | null;
  readonly elapsedMs: number;
  readonly targets: readonly string[];
  readonly speaking: string | null;
}

/** Column names of `traceRow()`. */
export const TRACE_COLUMNS: readonly string[] = [
  "screen",
  "storyId",
  "phase",
  "beatIndex",
  "beatId",
  "round",
  "lineIndex",
  "elapsedMs",
  "waitedMs",
  "taps",
  "targets",
  "speaking"
];

/** The current state as one compact row in TRACE_COLUMNS order. */
export function traceRowOf(state: WonderState): readonly (string | number | null)[] {
  const d = state.director;
  return [
    state.screen,
    state.storyId,
    d?.phase ?? null,
    d?.beatIndex ?? null,
    d?.beatId ?? null,
    d?.round ?? null,
    d?.lineIndex ?? null,
    d?.elapsedMs ?? null,
    d?.waitedMs ?? null,
    d?.taps ?? null,
    state.targets.join("|"),
    state.speaking
  ];
}

function rowOf(command: string, ok: boolean, state: WonderState): ReplayRow {
  return {
    command,
    ok,
    screen: state.screen,
    phase: state.director?.phase ?? null,
    beatId: state.director?.beatId ?? null,
    elapsedMs: state.director?.elapsedMs ?? 0,
    targets: [...state.targets],
    speaking: state.speaking
  };
}

/** Splits a replay script: a JSON array of command strings, or commands separated by ";" or new lines. */
export function parseReplayScript(script: string): string[] {
  const trimmed = script.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
    } catch {
      // Not JSON: fall through to the plain form.
    }
  }
  return trimmed
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Runs a replay script on the current story, synchronously, and returns one
 * row per command. Commands: `advance <ms>`, `steps <n>`, `tap <targetId>`,
 * `confirm`, `pause`, `resume`, `skip`, `all-done`, `run-to-end [maxMs]`,
 * `reduced-motion on|off`. Start the story first with `startStory` (loading a
 * world is asynchronous). An unknown command gives a row with `ok: false`.
 */
export function runReplay(app: WonderQaApp, script: string): ReplayRow[] {
  const rows: ReplayRow[] = [];
  for (const command of parseReplayScript(script)) {
    const [verb = "", arg = ""] = command.split(/\s+/, 2);
    const number = Number(arg);
    let ok = true;
    switch (verb.toLowerCase()) {
      case "advance":
        if (Number.isFinite(number) && number > 0) app.advance(number);
        else ok = false;
        break;
      case "steps":
      case "step":
        if (Number.isFinite(number) && number > 0) app.advance(Math.floor(number) * STEP_MS);
        else ok = false;
        break;
      case "tap":
        ok = arg.length > 0 && app.tap(arg);
        break;
      case "confirm":
      case "parent-confirm":
        ok = app.parentConfirm();
        break;
      case "pause":
        app.pause();
        break;
      case "resume":
        app.resume();
        break;
      case "skip":
      case "skip-beat":
        app.skipBeat();
        break;
      case "all-done":
      case "alldone":
        app.allDone();
        break;
      case "run-to-end":
        ok = app.runToEnd(Number.isFinite(number) && number > 0 ? number : undefined).finished;
        break;
      case "reduced-motion":
        if (arg === "on" || arg === "off") app.setReducedMotion(arg === "on");
        else ok = false;
        break;
      default:
        ok = false;
    }
    rows.push(rowOf(command, ok, app.state()));
  }
  return rows;
}

/** Anonymous route health: readiness, screen and render counters. No child data. */
export function routeHealthOf(app: WonderQaApp): {
  readonly route: string;
  readonly ok: boolean;
  readonly ready: boolean;
  readonly screen: string;
  readonly storyId: string | null;
  readonly drawCalls: number;
  readonly nodes: number;
  readonly renderPath: string | null;
  readonly errors: number;
} {
  const state = app.state();
  const diagnostics = app.diagnostics();
  return {
    route: QA_HOOK_NAME,
    ok: app.isReady() && state.errors.length === 0,
    ready: app.isReady(),
    screen: state.screen,
    storyId: state.storyId,
    drawCalls: diagnostics.drawCalls,
    nodes: diagnostics.nodes,
    renderPath: diagnostics.renderPath ?? null,
    errors: state.errors.length
  };
}

export interface WonderQaOptions {
  /** `?seed=N` (the content is deterministic; the seed is recorded for capture tooling). */
  readonly seed?: number;
  /** Install target; defaults to `globalThis`. */
  readonly target?: Record<string, unknown>;
}

export type WonderQaHooks = InstalledQaHooks<WonderState, Record<string, never>, WonderQaExtras>;

/** Installs `window.__AURA_WONDER_WORLD__`. */
export function installWonderQaHooks(app: WonderQaApp, options: WonderQaOptions = {}): WonderQaHooks {
  const extras: WonderQaExtras = {
    startStory: (id, mode) => app.startStory(id, mode),
    advance: (ms) => app.advance(ms),
    runToEnd: (maxMs) => app.runToEnd(maxMs),
    tap: (targetId) => app.tap(targetId),
    parentConfirm: () => app.parentConfirm(),
    pause: () => app.pause(),
    resume: () => app.resume(),
    allDone: () => app.allDone(),
    skipBeat: () => app.skipBeat(),
    setReducedMotion: (on) => app.setReducedMotion(on),
    targetRects: () => app.targetRects(),
    nodeRects: (ids) => app.nodeRects(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []),
    stageApply: (actions) => app.stageApply(Array.isArray(actions) ? actions : []),
    setTalking: (actor) => app.setTalking(typeof actor === "string" ? actor : null),
    diagnostics: () => app.diagnostics()
  };
  return installQaHooks<WonderState, Record<string, never>, WonderQaExtras>(QA_HOOK_NAME, {
    ready: () => app.isReady(),
    state: () => app.state(),
    stepFrames: (n) => {
      if (Number.isFinite(n) && n > 0) app.advance(Math.floor(n) * STEP_MS);
    },
    reset: () => app.reset(),
    replay: (script) => runReplay(app, script),
    begin: () => app.begin(),
    traceRow: () => traceRowOf(app.state()),
    traceColumns: TRACE_COLUMNS,
    app: () => app.auraApp(),
    routeHealth: () => routeHealthOf(app),
    nodeCount: () => app.diagnostics().nodes,
    extras,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.target !== undefined ? { target: options.target } : {})
  });
}
