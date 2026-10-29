/**
 * Shared helpers for the Wonder World browser specs (PRD 04 J08-J13,
 * docs/prds/veer-wonder-world/04-implementation-backlog-by-filename.md section J).
 *
 * REMOTE RUNNER ONLY. These specs start headless Chromium with software WebGL2 (SwiftShader); never run them on the Mac.
 * From the repo root (each line is one `tools/remote-acr/run.sh` run with EXTRA_DIRS="apps/veer-wonder-world"):
 *   apps/veer-wonder-world/tools/remote-run.sh first-frame touch-and-layout audio-and-pausing low-motion
 *   apps/veer-wonder-world/tools/remote-run.sh playback-episodes playback-activities
 *   apps/veer-wonder-world/tools/remote-run.sh no-speech-required
 * The ACR task step stops at 60 minutes, so the suites are split across runs instead of one SPECS glob.
 *
 * How the specs reach the app: the repo dev server (./example-dev-server.ts) serves the app's index.html and bundles
 * its src/main.ts with esbuild; the app installs `installQaHooks("wonder-world", ...)` from @aura3d/engine, which the
 * published qa/hooks.d.ts names `window.__AURA_WONDER_WORLD__` (first boot error in `__AURA_WONDER_WORLD_ERROR__`).
 * The hook contract (ready, state, startStory, advance, runToEnd, tap, targetRects, pause, resume, allDone,
 * setReducedMotion, diagnostics, ...) is mirrored by `WonderHooks` below; the state shape by `WonderQaState`.
 *
 * Evidence: ad-hoc `az acr run` cannot upload artifacts, so every spec prints what it keeps into the run log:
 *   WWSHOT <name> <index> <total> <base64 chunk> .   a screenshot, chunked (the trailing " ." keeps a JSON-escaped
 *                                                    copy of the line, printed again by the json reporter, decodable)
 *   WWJSON <name> <json>                             one JSON record per line
 * `node apps/veer-wonder-world/tools/extract-remote-evidence.mjs <acr-run.log> <out-dir>` turns them back into files.
 * The same files are also written to tests/reports/wonder-world/ (gitignored) on the runner.
 *
 * Privacy (PRD 01, MASTER-PROMPT section 6): nothing here reads, records or prints child data. Every printed record
 * (console text included) is stripped of the dev-server origin and the app directory name.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import type { DirectorSnapshot, PlayMode } from "../../apps/veer-wonder-world/src/types";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

export type { DirectorSnapshot, PlayMode };

// ---------------------------------------------------------------- constants

export const APP_DIR = "apps/veer-wonder-world";
/** The route the repo dev server serves (it bundles `${APP_DIR}/src/main.ts`). */
export const APP_ROUTE = `/${APP_DIR}/index.html`;
/** `installQaHooks("wonder-world", ...)`: qaHookGlobalName("wonder-world"). */
export const QA_GLOBAL = "__AURA_WONDER_WORLD__";
/** qaErrorGlobalName("wonder-world"): the first boot error the app reports. */
export const QA_ERROR_GLOBAL = "__AURA_WONDER_WORLD_ERROR__";
export const REPORT_DIR = resolve("tests/reports/wonder-world");
export const SOFTWARE_GL_NOTE = "Remote runner, headless Chromium, software WebGL2: not real-GPU or physical-device evidence.";

/** Cold boot on software WebGL2 (bundle, first mount, warmPrograms). Other software-GL specs allow 420-540 s. */
export const READY_TIMEOUT_MS = 480_000;
/** One `startStory` (world swap, model preload with stand-in fallback, warmPrograms). */
export const STORY_LOAD_TIMEOUT_MS = 180_000;
/** Per test; no test in these files is allowed longer (the repo's long software-GL specs use 900 s). */
export const TEST_TIMEOUT_MS = 900_000;
/** Story-time bound for one zero-input run (the longest story runs about 6 minutes with zero input). */
export const RUN_MAX_MS = 900_000;
/** Story-time chunk between state samples. Every wait is at least 3000 ms (settings WAIT_MS_MIN), so each is sampled. */
export const SAMPLE_CHUNK_MS = 2_500;
/** Child-safety rule: at most two tap targets at a time. */
export const MAX_TARGETS = 2;
/** Grown-up controls: at least 44 x 44 CSS px (PRD 04 E06). */
export const MIN_CONTROL_PX = 44;
/** Child targets are large; the stage draws hit areas of at least 128 CSS px, so 64 is a conservative floor. */
export const MIN_TARGET_PX = 64;
const POLL_MS = 250;
/** A page error with no QA hooks installed after this long means the bundle died: stop waiting. */
const HOOKLESS_FAIL_FAST_MS = 60_000;
const SHOT_CHUNK = 4_000;
const LINE_KEY_SOURCE = "^[eg]\\d{2}\\.[A-Za-z0-9_-]+\\.\\d+$";

/** DOM hooks from the UI unit (src/ui/*.ts) and the stage (src/scenes/stage.ts). */
export const SELECTORS = {
  stage: "#stage",
  start: '[data-ui="start"] [data-action="start"]',
  controlButtons: '[data-ui="controls"] button',
  pause: '[data-ui="controls"] [data-control="pause"]',
  allDone: '[data-ui="controls"] [data-control="all-done"]',
  /** The grown-up's "Your child had a turn" confirm: enabled only while a beat waits for a turn. */
  confirm: '[data-ui="controls"] [data-control="confirm"]',
  /** The grown-up corner button: the press-and-hold gate (src/ui/parent-gate.ts), then the parent panel (parent-panel.ts). */
  parent: '[data-ui="controls"] [data-control="parent"]',
  gateHold: '[data-ui="parent-gate"] [data-action="hold"]',
  parentPanel: '[data-ui="parent-panel"]',
  /** The panel's Sound switch input (visually hidden; its label row is what a grown-up taps). */
  soundSwitch: 'input[data-setting="sound"]',
  panelClose: '[data-ui="parent-panel"] [data-action="close"]',
  offline: '[data-ui="offline"]',
  captions: '[data-ui="captions"]',
  loading: '[data-ui="loading"]',
  veil: ".ww-stage-veil",
  /** createGame's scene-transition overlay (black, opacity 0 at idle). */
  gameOverlay: ".a3g-overlay"
} as const;

// ---------------------------------------------------------------- the QA hook contract

export type WonderScreen = "start" | "menu" | "story" | "offline";

/** `state()`: plain JSON. */
export interface WonderQaState {
  readonly screen: WonderScreen;
  readonly storyId: string | null;
  readonly director: DirectorSnapshot | null;
  readonly targets: readonly string[];
  readonly speaking: string | null;
  readonly audio: { readonly unlocked: boolean; readonly available: boolean };
  readonly settings: { readonly mode: string; readonly reducedMotion: boolean; readonly captions: boolean; readonly music: boolean; readonly sound: boolean };
  readonly stage: { readonly drawCalls: number; readonly nodes: number; readonly modelsEnabled: boolean };
  /** Always false in this build (no microphone). Typed boolean so a spec can assert it. */
  readonly micRequested: boolean;
  readonly errors: readonly string[];
}

export interface WonderRunResult {
  readonly finished: boolean;
  readonly reason: "complete" | "all-done" | null;
  readonly elapsedMs: number;
}

/** A target's hit area in viewport CSS px (the app adds the canvas offset), ready for page.mouse / page.touchscreen. */
export interface WonderTargetRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface WonderDiagnostics {
  readonly drawCalls: number;
  readonly nodes: number;
  readonly renderPath?: string;
  readonly [extra: string]: unknown;
}

export interface WonderHooks {
  ready(): boolean;
  state(): WonderQaState;
  stepFrames(n: number): unknown;
  reset(seed?: number): void;
  startStory(id: string, mode: PlayMode): Promise<void>;
  advance(ms: number): void;
  runToEnd(maxMs?: number): WonderRunResult;
  tap(targetId: string): boolean;
  parentConfirm(): unknown;
  pause(): unknown;
  resume(): unknown;
  allDone(): unknown;
  setReducedMotion(on: boolean): unknown;
  targetRects(): readonly WonderTargetRect[];
  diagnostics(): WonderDiagnostics | null;
  /** The grown-up's manual next (src/qa/install-hooks.ts extra; not part of the frozen QA contract). */
  skipBeat?(): unknown;
}

export const REQUIRED_HOOKS: readonly (keyof WonderHooks)[] = [
  "ready", "state", "stepFrames", "reset", "startStory", "advance", "runToEnd", "tap", "parentConfirm",
  "pause", "resume", "allDone", "setReducedMotion", "targetRects", "diagnostics"
];

type HookHost = Record<string, WonderHooks | undefined>;

// ---------------------------------------------------------------- the canonical catalog (PRD 05; MASTER-PROMPT section 2)

export interface StoryEntry {
  readonly code: string;
  readonly id: string;
  readonly title: string;
  readonly kind: "episode" | "activity";
  readonly phase: "P1" | "P2";
}

const episode = (code: string, id: string, title: string, phase: "P1" | "P2"): StoryEntry => ({ code, id, title, kind: "episode", phase });
const activity = (code: string, id: string, title: string, phase: "P1" | "P2"): StoryEntry => ({ code, id, title, kind: "activity", phase });

export const EPISODES: readonly StoryEntry[] = [
  episode("e01", "momo-magic-mouth", "Momo's Magic Mouth", "P1"),
  episode("e02", "peekaboo-palace", "The Peekaboo Palace", "P1"),
  episode("e03", "alphabet-zoo", "The Alphabet Zoo", "P2"),
  episode("e04", "gogo-abc-train", "GoGo's ABC Train", "P2"),
  episode("e05", "counting-cookies", "Momo's Counting Cookies", "P1"),
  episode("e06", "lulu-dino-dance", "Lulu's Dino Dance Party", "P1"),
  episode("e07", "magic-colour-machine", "The Magic Colour Machine", "P2"),
  episode("e08", "wheres-sheru", "Where's Sheru?", "P2"),
  episode("e09", "baby-animal-orchestra", "Baby Animal Orchestra", "P1"),
  episode("e10", "momos-hungry-belly", "Momo's Hungry Belly", "P2"),
  episode("e11", "number-balloon-rescue", "Number Balloon Rescue", "P2"),
  episode("e12", "magic-shape-bakery", "The Magic Shape Bakery", "P2"),
  episode("e13", "silly-robot-factory", "The Silly Robot Factory", "P2"),
  episode("e14", "lost-teddy-adventure", "The Lost Teddy Adventure", "P2"),
  episode("e15", "momo-bubble-universe", "Momo's Bubble Universe", "P2"),
  episode("e16", "little-birthday-party", "The Little Birthday Party", "P2"),
  episode("e17", "sheru-big-adventure", "Sheru's Big Adventure", "P1"),
  episode("e18", "whos-at-the-door", "Who's at the Door?", "P2"),
  episode("e19", "momos-day", "Momo's Day", "P2"),
  episode("e20", "little-story-machine", "The Little Story Machine", "P2")
];

export const ACTIVITIES: readonly StoryEntry[] = [
  activity("g01", "bubble-garden", "Bubble Garden", "P1"),
  activity("g02", "gogo-train", "Go-Go Train", "P1"),
  activity("g03", "sheru-ball", "Sheru's Ball Game", "P1"),
  activity("g04", "peekaboo-animal-barn", "Peekaboo Animal Barn", "P2"),
  activity("g05", "teddy-snack-picnic", "Teddy's Snack Picnic", "P2"),
  activity("g06", "splashy-car-wash", "Splashy Car Wash", "P2"),
  activity("g07", "little-lift", "The Little Lift", "P2"),
  activity("g08", "build-and-tumble", "Build and Tumble", "P2"),
  activity("g09", "family-doorbells", "Family Doorbells", "P2"),
  activity("g10", "bears-little-band", "Bear's Little Band", "P2"),
  activity("g11", "magic-sound-garden", "Magic Sound Garden", "P2"),
  activity("g12", "find-my-real-toy", "Find My Real Toy", "P2")
];

export const STORIES: readonly StoryEntry[] = [...EPISODES, ...ACTIVITIES];

/**
 * E17, the golden slice (src/content/episodes/sheru-big-adventure.ts; PRD 05 section 4): Momo and Sheru, one ball, two
 * tap waits ("invite" and "repeat"), the ball the only target.
 */
export const E17 = {
  id: "sheru-big-adventure",
  code: "e17",
  cast: ["momo", "sheru"],
  props: ["ball"],
  target: "ball",
  inviteBeat: "invite",
  repeatBeat: "repeat"
} as const;

/** Story slugs on disk (src/content/<kind>/<slug>.ts), to prove the canonical list above is the shipped one. */
export function storySlugsOnDisk(kind: "episodes" | "activities"): string[] {
  return readdirSync(resolve(APP_DIR, "src", "content", kind))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.slice(0, -3))
    .sort();
}

/** Model keys the generated src/aura-assets.ts marks admitted, or null when the file cannot be read. */
export function admittedModelKeys(): ReadonlySet<string> | null {
  try {
    const text = readFileSync(resolve(APP_DIR, "src", "aura-assets.ts"), "utf8");
    const keys = new Set<string>();
    for (const match of text.matchAll(/^\s+([A-Za-z0-9]+): \{ admitted: (true|false)\b/gm)) {
      if (match[2] === "true" && match[1]) keys.add(match[1]);
    }
    return keys;
  } catch {
    return null;
  }
}

export function engineVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(resolve("packages", "engine", "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export function storyRange(stories: readonly StoryEntry[]): string {
  const first = stories[0]?.code.toUpperCase() ?? "";
  const last = stories[stories.length - 1]?.code.toUpperCase() ?? "";
  return first === last ? first : `${first}-${last}`;
}

// ---------------------------------------------------------------- small utilities

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** Strips the dev-server origin and the app directory name from text that may be printed. */
export function redact(text: string): string {
  return text.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/g, "").split(`/${APP_DIR}/`).join("/<app>/");
}

function short(value: unknown, max = 1_500): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return redact(text).slice(0, max);
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Distance from a point to the nearest point of a box (0 inside). */
export function distanceToBox(x: number, y: number, box: Box): number {
  const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
  const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

// ---------------------------------------------------------------- evidence channel

function ensureReportDir(): void {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "_");
}

/**
 * Prints `WWJSON <name> <json>` (one line) and writes tests/reports/wonder-world/<name>.json. Both are redacted: the
 * dev-server origin and the app directory name never reach the evidence.
 */
export function emitJson(name: string, record: Readonly<Record<string, unknown>>): void {
  const file = safeName(name);
  ensureReportDir();
  writeFileSync(join(REPORT_DIR, `${file}.json`), `${redact(JSON.stringify(record, null, 2))}\n`);
  console.log(`WWJSON ${file} ${redact(JSON.stringify(record))}`);
}

/** Writes a file under tests/reports/wonder-world/ without printing it. */
export function saveReportFile(fileName: string, bytes: Buffer): string {
  ensureReportDir();
  const path = join(REPORT_DIR, safeName(fileName));
  writeFileSync(path, bytes);
  return path;
}

/** Prints the image as `WWSHOT <name> <i> <total> <chunk> .` lines and writes it under tests/reports/wonder-world/. */
export function emitShot(name: string, bytes: Buffer, extension: "jpg" | "png"): void {
  const file = safeName(name);
  saveReportFile(`${file}.${extension}`, bytes);
  const base64 = bytes.toString("base64");
  const total = Math.max(1, Math.ceil(base64.length / SHOT_CHUNK));
  for (let index = 0; index < total; index += 1) {
    console.log(`WWSHOT ${file} ${index} ${total} ${base64.slice(index * SHOT_CHUNK, (index + 1) * SHOT_CHUNK)} .`);
  }
}

// ---------------------------------------------------------------- page log (console errors, page errors, failed loads)

export interface LogMark {
  readonly console: number;
  readonly page: number;
  readonly responses: number;
  readonly failed: number;
}

export interface LogSlice {
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly badResponses: readonly string[];
  readonly failedRequests: readonly string[];
}

export interface PageLog extends LogSlice {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly badResponses: string[];
  readonly failedRequests: string[];
  mark(): LogMark;
  since(mark: LogMark): LogSlice;
}

/** Attach before navigating. Console messages of type "error" and uncaught page errors are the "console errors". */
export function attachPageLog(page: Page): PageLog {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const badResponses: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const where = location.url ? ` @ ${location.url}:${location.lineNumber}` : "";
    consoleErrors.push(redact(`${message.text()}${where}`).slice(0, 600));
  });
  page.on("pageerror", (error) => {
    const stack = (error.stack ?? "").split("\n").slice(0, 6).join("\n");
    pageErrors.push(redact(`${error.message}\n${stack}`).slice(0, 1_500));
  });
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(redact(`${response.status()} ${response.url()}`).slice(0, 300));
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(redact(`${request.failure()?.errorText ?? "failed"} ${request.url()}`).slice(0, 300));
  });
  return {
    consoleErrors,
    pageErrors,
    badResponses,
    failedRequests,
    mark: () => ({ console: consoleErrors.length, page: pageErrors.length, responses: badResponses.length, failed: failedRequests.length }),
    since: (mark) => ({
      consoleErrors: consoleErrors.slice(mark.console),
      pageErrors: pageErrors.slice(mark.page),
      badResponses: badResponses.slice(mark.responses),
      failedRequests: failedRequests.slice(mark.failed)
    })
  };
}

// ---------------------------------------------------------------- QA hook calls

export type WonderQuery = Readonly<Record<string, string | number | boolean | undefined>>;

export function wonderPath(query: WonderQuery = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === false) continue;
    params.set(key, value === true ? "1" : String(value));
  }
  const search = params.toString();
  return search ? `${APP_ROUTE}?${search}` : APP_ROUTE;
}

async function callHook(page: Page, method: keyof WonderHooks, args: readonly (string | number | boolean)[] = []): Promise<unknown> {
  return page.evaluate(({ name, method: hook, args: hookArgs }) => {
    const hooks = (window as unknown as Record<string, Record<string, unknown> | undefined>)[name];
    if (!hooks) throw new Error(`${name} is not installed`);
    const fn = hooks[hook];
    if (typeof fn !== "function") throw new Error(`${name}.${hook} is not a function`);
    return (fn as (...values: unknown[]) => unknown).apply(hooks, hookArgs);
  }, { name: QA_GLOBAL, method, args: [...args] });
}

export async function qaState(page: Page): Promise<WonderQaState> {
  return (await callHook(page, "state")) as WonderQaState;
}

export async function qaAdvance(page: Page, ms: number): Promise<void> {
  await callHook(page, "advance", [ms]);
}

export async function qaRunToEnd(page: Page, maxMs: number = RUN_MAX_MS): Promise<WonderRunResult> {
  return (await callHook(page, "runToEnd", [maxMs])) as WonderRunResult;
}

export async function qaTap(page: Page, targetId: string): Promise<boolean> {
  return (await callHook(page, "tap", [targetId])) === true;
}

export async function qaTargetRects(page: Page): Promise<readonly WonderTargetRect[]> {
  return (await callHook(page, "targetRects")) as readonly WonderTargetRect[];
}

export async function qaDiagnostics(page: Page): Promise<WonderDiagnostics | null> {
  return (await callHook(page, "diagnostics")) as WonderDiagnostics | null;
}

export async function qaPause(page: Page): Promise<void> {
  await callHook(page, "pause");
}

export async function qaResume(page: Page): Promise<void> {
  await callHook(page, "resume");
}

export async function qaAllDone(page: Page): Promise<void> {
  await callHook(page, "allDone");
}

export async function qaSetReducedMotion(page: Page, on: boolean): Promise<void> {
  await callHook(page, "setReducedMotion", [on]);
}

/** skipBeat(): the app's manual-next extra (fails with a named error when the app does not expose it). */
export async function qaSkipBeat(page: Page): Promise<void> {
  await callHook(page, "skipBeat");
}

/** `startStory(id, mode)` with an in-page deadline, so a load that never settles fails with a named error. */
export async function qaStartStory(page: Page, id: string, mode: PlayMode, timeoutMs: number = STORY_LOAD_TIMEOUT_MS): Promise<void> {
  await page.evaluate(async ({ name, id: storyId, mode: playMode, timeoutMs: deadline }) => {
    const hooks = (window as unknown as HookHost)[name];
    if (!hooks) throw new Error(`${name} is not installed`);
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`startStory("${storyId}") did not settle within ${deadline} ms`)), deadline);
    });
    try {
      await Promise.race([hooks.startStory(storyId, playMode), timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  }, { name: QA_GLOBAL, id, mode, timeoutMs });
}

/** `__AURA_WONDER_WORLD_ERROR__`: the first boot or runtime error the app reported, or null. */
export async function readBootError(page: Page): Promise<string | null> {
  return page
    .evaluate((name) => {
      const value = (window as unknown as Record<string, unknown>)[name];
      return value === undefined || value === null ? null : String(value);
    }, QA_ERROR_GLOBAL)
    .catch(() => null);
}

/** What the app looks like right now, for timeout messages. */
async function describeApp(page: Page): Promise<unknown> {
  return page.evaluate(({ name, errorName }) => {
    const host = window as unknown as Record<string, unknown>;
    const hooks = host[name] as Record<string, unknown> | undefined;
    const call = (method: string): unknown => {
      const fn = hooks?.[method];
      if (typeof fn !== "function") return "(missing)";
      try {
        return (fn as () => unknown).call(hooks);
      } catch (error) {
        return `(threw: ${String(error)})`;
      }
    };
    return {
      hooksInstalled: hooks !== undefined,
      hookNames: hooks ? Object.keys(hooks).sort() : [],
      ready: call("ready"),
      state: call("state"),
      bootError: host[errorName] ?? null,
      loading: document.querySelector('[data-ui="loading"]') !== null,
      screens: Array.from(document.querySelectorAll("[data-ui]")).map((el) => el.getAttribute("data-ui"))
    };
  }, { name: QA_GLOBAL, errorName: QA_ERROR_GLOBAL });
}

/**
 * Polls `probe` until it returns a value. Fails at once when the app reports a boot error, when `abortIf` names a
 * reason, or with the app's state and the collected errors once `timeoutMs` has passed.
 */
export async function waitFor<T>(
  page: Page,
  log: PageLog,
  label: string,
  timeoutMs: number,
  probe: () => Promise<T | null | undefined | false>,
  abortIf?: () => string | null
): Promise<T> {
  const started = Date.now();
  let last: unknown = null;
  for (;;) {
    const bootError = await readBootError(page);
    if (bootError) throw new Error(`${label}: the app reported a boot error (${QA_ERROR_GLOBAL}): ${short(bootError, 3_000)}`);
    const abort = abortIf?.() ?? null;
    if (abort) throw new Error(`${label}: ${abort}`);
    try {
      const value = await probe();
      if (value !== null && value !== undefined && value !== false) return value;
      last = value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() - started > timeoutMs) {
      const app = await describeApp(page).catch((error: unknown) => `(describe failed: ${String(error)})`);
      throw new Error(
        `${label}: timed out after ${timeoutMs} ms. Last probe: ${short(last)}. App: ${short(app, 3_000)}. ` +
          `Page errors: ${short(log.pageErrors)}. Console errors: ${short(log.consoleErrors)}. Bad responses: ${short(log.badResponses)}`
      );
    }
    await sleep(POLL_MS);
  }
}

/** Waits until `window.__AURA_WONDER_WORLD__` exists, then requires every contract hook. */
export async function waitForHooks(page: Page, log: PageLog, timeoutMs: number = READY_TIMEOUT_MS): Promise<void> {
  const started = Date.now();
  const names = await waitFor(
    page,
    log,
    `${QA_GLOBAL} installed`,
    timeoutMs,
    () =>
      page.evaluate((name) => {
        const hooks = (window as unknown as Record<string, Record<string, unknown> | undefined>)[name];
        return hooks ? Object.keys(hooks).filter((key) => typeof hooks[key] === "function") : null;
      }, QA_GLOBAL),
    () =>
      log.pageErrors.length > 0 && Date.now() - started > HOOKLESS_FAIL_FAST_MS
        ? `the page threw before installing the QA hooks: ${short(log.pageErrors[0])}`
        : null
  );
  const missing = REQUIRED_HOOKS.filter((hook) => !names.includes(hook));
  if (missing.length > 0) throw new Error(`${QA_GLOBAL} is missing contract hooks: ${missing.join(", ")} (has: ${names.sort().join(", ")})`);
}

export async function waitForReady(page: Page, log: PageLog, timeoutMs: number = READY_TIMEOUT_MS): Promise<void> {
  await waitFor(page, log, `${QA_GLOBAL}.ready()`, timeoutMs, () =>
    page.evaluate((name) => (window as unknown as HookHost)[name]?.ready() === true, QA_GLOBAL)
  );
}

export interface OpenOptions {
  /** Wait for ready() (default true). The start-screen flow waits for the button instead. */
  readonly ready?: boolean;
}

/** Navigates to the app route with `query` (the dev server bundles the app on the first request). */
export async function gotoWonderWorld(page: Page, server: ExampleDevServer, query: WonderQuery): Promise<void> {
  await page.goto(`${server.origin}${wonderPath(query)}`, { waitUntil: "commit", timeout: 120_000 });
}

/** Navigates to the app route with `query`, then waits for the QA hooks (and ready() unless told not to). */
export async function openWonderWorld(page: Page, server: ExampleDevServer, log: PageLog, query: WonderQuery, options: OpenOptions = {}): Promise<void> {
  await gotoWonderWorld(page, server, query);
  await waitForHooks(page, log);
  if (options.ready !== false) await waitForReady(page, log);
}

/** The story scene is visible: no loading status, and the stage's swap veil and the game's transition overlay faded out. */
async function sceneShown(page: Page): Promise<boolean> {
  return page.evaluate(({ loading, occluders }) => {
    const visible = (el: Element | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const style = getComputedStyle(el);
      return el.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    if (visible(document.querySelector(loading))) return false;
    for (const selector of occluders) {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (el instanceof HTMLElement && visible(el) && Number.parseFloat(getComputedStyle(el).opacity) > 0.02) return false;
      }
    }
    return true;
  }, { loading: SELECTORS.loading, occluders: [SELECTORS.veil, SELECTORS.gameOverlay] });
}

/** Waits until the story is on screen with its director started (any phase after START) and the scene shown. */
export async function waitForStoryOnStage(page: Page, log: PageLog, id: string, timeoutMs: number = READY_TIMEOUT_MS): Promise<WonderQaState> {
  return waitFor(page, log, `story "${id}" on stage`, timeoutMs, async () => {
    const state = await qaState(page);
    const director = state.director;
    if (state.screen !== "story" || state.storyId !== id || !director || director.storyId !== id || director.phase === "idle") return null;
    return (await sceneShown(page)) ? state : null;
  });
}

export interface AdvanceUntilGoal {
  readonly phase?: string;
  readonly beatId?: string;
}

export interface AdvanceUntilResult {
  readonly reached: boolean;
  readonly spentMs: number;
  readonly state: WonderQaState;
}

/** Advances story time in `stepMs` steps (one render each) until the director matches `goal`; in-page, no wall clock. */
export async function advanceUntil(page: Page, goal: AdvanceUntilGoal, stepMs: number, maxMs: number): Promise<AdvanceUntilResult> {
  return page.evaluate(({ name, goal: want, stepMs: step, maxMs: limit }) => {
    const hooks = (window as unknown as HookHost)[name];
    if (!hooks) throw new Error(`${name} is not installed`);
    const matches = (state: WonderQaState): boolean => {
      const director = state.director;
      if (!director) return false;
      if (want.phase !== undefined && director.phase !== want.phase) return false;
      if (want.beatId !== undefined && director.beatId !== want.beatId) return false;
      return true;
    };
    let spent = 0;
    let state = hooks.state();
    while (!matches(state) && spent < limit) {
      const phase = state.director?.phase;
      if (state.screen === "offline" || phase === "finished" || phase === "disposed") break;
      hooks.advance(step);
      spent += step;
      state = hooks.state();
    }
    return { reached: matches(state), spentMs: spent, state };
  }, { name: QA_GLOBAL, goal, stepMs, maxMs });
}

// ---------------------------------------------------------------- page geometry

/** The largest canvas under #stage (the createGame canvas; any canvas when #stage holds none), in viewport CSS px. */
export async function canvasBox(page: Page): Promise<Box> {
  const box = await page.evaluate((stageSelector) => {
    const largest = (root: ParentNode): { x: number; y: number; width: number; height: number } | null => {
      let best: { x: number; y: number; width: number; height: number } | null = null;
      for (const canvas of Array.from(root.querySelectorAll("canvas"))) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width * rect.height > (best ? best.width * best.height : 0)) best = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      }
      return best;
    };
    const stage = document.querySelector(stageSelector);
    return (stage ? largest(stage) : null) ?? largest(document);
  }, SELECTORS.stage);
  if (!box) throw new Error("no canvas is mounted");
  return box;
}

export interface ElementInfo {
  readonly isCanvas: boolean;
  readonly tag: string;
  readonly id: string;
  readonly className: string;
  readonly data: string;
}

/** The topmost hit-testable element at a viewport point (pointer-events: none overlays are skipped, as for taps). */
export async function elementAt(page: Page, x: number, y: number): Promise<ElementInfo> {
  return page.evaluate(({ x: px, y: py }) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return { isCanvas: false, tag: "(none)", id: "", className: "", data: "" };
    return {
      isCanvas: el instanceof HTMLCanvasElement,
      tag: el.tagName.toLowerCase(),
      id: el.id,
      className: typeof el.className === "string" ? el.className : "",
      data: Array.from(el.attributes)
        .filter((attr) => attr.name.startsWith("data-"))
        .map((attr) => `${attr.name}=${attr.value}`)
        .join(" ")
    };
  }, { x, y });
}

export interface ControlBox extends Box {
  readonly control: string;
  readonly visible: boolean;
  readonly disabled: boolean;
}

/** The grown-up corner controls (src/ui/child-controls.ts). */
export async function controlBoxes(page: Page): Promise<ControlBox[]> {
  return page.evaluate((selector) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        control: el.dataset["control"] ?? el.getAttribute("aria-label") ?? (el.textContent ?? "").trim(),
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number.parseFloat(style.opacity) > 0.05,
        disabled: el instanceof HTMLButtonElement && el.disabled
      };
    }), SELECTORS.controlButtons);
}

/** The first matching element's box when it is laid out, else null. */
export async function boxOf(page: Page, selector: string): Promise<Box | null> {
  return page.evaluate((query) => {
    const el = document.querySelector(query);
    if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;
  }, selector);
}

/** Simulates a tab switch: overrides document.visibilityState/hidden and fires visibilitychange. */
export async function setPageHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (isHidden ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  }, hidden);
}

export interface RendererInfo {
  readonly renderer: string | null;
  readonly vendor: string | null;
  readonly version: string | null;
}

/** The WebGL2 renderer string (evidence must name it; software WebGL2 is not real-GPU evidence). */
export async function rendererInfo(page: Page): Promise<RendererInfo> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return { renderer: null, vendor: null, version: null };
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const read = (value: unknown): string | null => (typeof value === "string" ? value : null);
    const info = {
      renderer: read(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: read(debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      version: read(gl.getParameter(gl.VERSION))
    };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return info;
  });
}

export async function runContext(page: Page, label: string): Promise<Record<string, unknown>> {
  const renderer = await rendererInfo(page).catch(() => null);
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);
  return {
    label,
    runId: process.env["AURA3D_RUN_ID"] ?? null,
    engineVersion: engineVersion(),
    viewport: page.viewportSize(),
    renderer,
    userAgent,
    note: SOFTWARE_GL_NOTE
  };
}

// ---------------------------------------------------------------- engine scene graph (public live-app registry)

export interface LiveNode {
  readonly id: string;
  readonly exists: boolean;
  readonly visible: boolean;
  readonly tags: readonly string[];
}

/**
 * Story actors and props by runtime id through `globalThis.__AURA3D_LIVE_APPS__` (the engine's public registry "so a
 * Playwright page.evaluate can reach it without the route having to opt in"). The stage names each actor's main node
 * after its cast/prop id and tags it "model" (drawn from its GLB) or "stand-in" (primitive fallback).
 */
export async function liveNodes(page: Page, ids: readonly string[]): Promise<{ readonly apps: number; readonly nodes: readonly LiveNode[] }> {
  return page.evaluate((wanted) => {
    interface Handle { readonly visible: boolean; readonly tags: readonly string[] }
    interface App { readonly nodes: { get(id: string): Handle | undefined } }
    const registry = (globalThis as { __AURA3D_LIVE_APPS__?: { all(): readonly App[] } }).__AURA3D_LIVE_APPS__;
    const apps = registry?.all() ?? [];
    const nodes = wanted.map((id) => {
      for (const app of apps) {
        let handle: Handle | undefined;
        try {
          handle = app.nodes.get(id);
        } catch {
          handle = undefined;
        }
        if (handle) return { id, exists: true, visible: handle.visible === true, tags: Array.from(handle.tags ?? []).map(String) };
      }
      return { id, exists: false, visible: false, tags: [] as string[] };
    });
    return { apps: apps.length, nodes };
  }, [...ids]);
}

// ---------------------------------------------------------------- screenshots and pixel statistics

/**
 * "canvas" capture mode: hides the #ui overlay and everything in #stage that is neither the canvas nor holds it (the
 * swap veil, any game-shell overlay), and paints #stage black. A screenshot then shows only what the canvas drew; a
 * transparent or blank canvas reads as black instead of borrowing the page's pastel background.
 */
export async function setCaptureMode(page: Page, on: boolean): Promise<void> {
  await page.evaluate((enable) => {
    const id = "ww-qa-capture-style";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = [
        'html[data-ww-qa-capture="canvas"] #ui { visibility: hidden !important; }',
        'html[data-ww-qa-capture="canvas"] #stage { background: #000 !important; }',
        'html[data-ww-qa-capture="canvas"] #stage *:not(canvas):not(:has(canvas)) { visibility: hidden !important; }'
      ].join("\n");
      document.head.appendChild(style);
    }
    if (enable) document.documentElement.setAttribute("data-ww-qa-capture", "canvas");
    else document.documentElement.removeAttribute("data-ww-qa-capture");
  }, on);
}

/** A PNG page screenshot clipped to the canvas; `canvasOnly` hides the overlays first (see setCaptureMode). */
export async function captureCanvas(page: Page, options: { readonly canvasOnly: boolean }): Promise<Buffer> {
  const box = await canvasBox(page);
  const viewport = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.floor(Math.min(box.width, (viewport?.width ?? box.width) - x)));
  const height = Math.max(1, Math.floor(Math.min(box.height, (viewport?.height ?? box.height) - y)));
  if (options.canvasOnly) await setCaptureMode(page, true);
  try {
    return await page.screenshot({ type: "png", clip: { x, y, width, height } });
  } finally {
    if (options.canvasOnly) await setCaptureMode(page, false);
  }
}

/** What the grown-up sees (overlays included), as a small JPEG for the log. */
export async function captureView(page: Page): Promise<Buffer> {
  return page.screenshot({ type: "jpeg", quality: 65 });
}

/** The canvas alone (overlays hidden), as a JPEG for the log: the look-dev frames. */
export async function captureCanvasJpeg(page: Page, quality = 82): Promise<Buffer> {
  const box = await canvasBox(page);
  const viewport = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.floor(Math.min(box.width, (viewport?.width ?? box.width) - x)));
  const height = Math.max(1, Math.floor(Math.min(box.height, (viewport?.height ?? box.height) - y)));
  await setCaptureMode(page, true);
  try {
    return await page.screenshot({ type: "jpeg", quality, clip: { x, y, width, height } });
  } finally {
    await setCaptureMode(page, false);
  }
}

/** Longer than the app's 120 s download cap (src/runtime/asset-preloader.ts), so every model download has settled by then. */
export const DOWNLOADS_SETTLED_MS = 150_000;

/**
 * Makes sure the story's admitted models are drawn. Software WebGL2 starves the page, so a large GLB can outlast the
 * preload's 10 s wait; the app then draws its stand-in for that mount and keeps downloading it. When any of `ids` is
 * a stand-in, this waits for the downloads to settle and starts the story again (the app's own path for a late
 * model). Returns what the first mount drew, or null when it already drew every model.
 */
export async function remountIfModelsLate(
  page: Page,
  log: PageLog,
  storyId: string,
  mode: PlayMode,
  ids: readonly string[]
): Promise<{ readonly standIns: readonly string[]; readonly modelStatus: unknown } | null> {
  const late = (await liveNodes(page, ids)).nodes.filter((node) => !node.tags.includes("model")).map((node) => node.id);
  if (late.length === 0) return null;
  const first = await qaDiagnostics(page);
  const firstMount = { standIns: late, modelStatus: first?.["modelStatus"] ?? null };
  await waitFor(page, log, "model downloads settled", DOWNLOADS_SETTLED_MS, async () => {
    const status = (await qaDiagnostics(page))?.["modelStatus"] as Readonly<Record<string, number>> | undefined;
    return status !== undefined && !((status["pending"] ?? 0) > 0);
  });
  await qaStartStory(page, storyId, mode);
  await waitForStoryOnStage(page, log, storyId);
  return firstMount;
}

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Straight RGBA, 8 bits per channel. */
  readonly rgba: Uint8Array;
}

/** Decodes an 8-bit, non-interlaced PNG (what Chromium screenshots are) into RGBA. */
export function decodePng(png: Buffer): DecodedImage {
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? -1;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (width <= 0 || height <= 0 || bitDepth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(`unsupported PNG (bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  let source = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[source] ?? 0;
    source += 1;
    const base = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const left = column >= channels ? (pixels[base + column - channels] ?? 0) : 0;
      const up = row > 0 ? (pixels[base - stride + column] ?? 0) : 0;
      const upLeft = row > 0 && column >= channels ? (pixels[base - stride + column - channels] ?? 0) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predicted = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`bad PNG filter ${filter}`);
      }
      pixels[base + column] = ((raw[source] ?? 0) + predicted) & 0xff;
      source += 1;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const from = index * channels;
    const to = index * 4;
    if (channels >= 3) {
      rgba[to] = pixels[from] ?? 0;
      rgba[to + 1] = pixels[from + 1] ?? 0;
      rgba[to + 2] = pixels[from + 2] ?? 0;
      rgba[to + 3] = channels === 4 ? (pixels[from + 3] ?? 255) : 255;
    } else {
      const grey = pixels[from] ?? 0;
      rgba[to] = grey;
      rgba[to + 1] = grey;
      rgba[to + 2] = grey;
      rgba[to + 3] = channels === 2 ? (pixels[from + 1] ?? 255) : 255;
    }
  }
  return { width, height, rgba };
}

export interface LumaStats {
  /** Mean Rec. 709 luma of the sRGB values, 0-255 (as tests/support/frame-stats.ts). */
  readonly meanLuma: number;
  readonly lumaStdDev: number;
  /** Share of pixels whose brightest channel is above 8/255. */
  readonly nonBlackRatio: number;
  /** Distinct colours after quantising to 4 bits per channel (a flat fill has one or two). */
  readonly coarseColours: number;
}

function lumaAt(rgba: Uint8Array, pixel: number): number {
  const at = pixel * 4;
  return 0.2126 * (rgba[at] ?? 0) + 0.7152 * (rgba[at + 1] ?? 0) + 0.0722 * (rgba[at + 2] ?? 0);
}

export function lumaStats(image: DecodedImage): LumaStats {
  const pixels = image.width * image.height;
  if (pixels === 0) return { meanLuma: 0, lumaStdDev: 0, nonBlackRatio: 0, coarseColours: 0 };
  let sum = 0;
  let sumSquares = 0;
  let lit = 0;
  const colours = new Set<number>();
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const luma = lumaAt(image.rgba, pixel);
    sum += luma;
    sumSquares += luma * luma;
    const at = pixel * 4;
    const r = image.rgba[at] ?? 0;
    const g = image.rgba[at + 1] ?? 0;
    const b = image.rgba[at + 2] ?? 0;
    if (Math.max(r, g, b) > 8) lit += 1;
    colours.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  const mean = sum / pixels;
  return {
    meanLuma: round3(mean),
    lumaStdDev: round3(Math.sqrt(Math.max(0, sumSquares / pixels - mean * mean))),
    nonBlackRatio: round3(lit / pixels),
    coarseColours: colours.size
  };
}

export interface ColourStats {
  /** Mean HSV saturation, 0..1. */
  readonly meanSaturation: number;
  /** Hasler-Suesstrunk colourfulness (about 15 is "slightly colourful", 33 "moderately", 45 "quite"). */
  readonly colourfulness: number;
  /** Share of pixels with luma >= 250 (clipped highlights). */
  readonly clippedRatio: number;
  /** 5th and 95th percentile luma: the frame's usable tonal range. */
  readonly p5Luma: number;
  readonly p95Luma: number;
}

/** Colour and tonal-range numbers for the look-dev loop: a washed-out frame has high luma, low saturation and a narrow range. */
export function colourStats(image: DecodedImage): ColourStats {
  const pixels = image.width * image.height;
  if (pixels === 0) return { meanSaturation: 0, colourfulness: 0, clippedRatio: 0, p5Luma: 0, p95Luma: 0 };
  let saturation = 0;
  let clipped = 0;
  let rgSum = 0;
  let rgSquares = 0;
  let ybSum = 0;
  let ybSquares = 0;
  const histogram = new Array<number>(256).fill(0);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const at = pixel * 4;
    const r = image.rgba[at] ?? 0;
    const g = image.rgba[at + 1] ?? 0;
    const b = image.rgba[at + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    saturation += max === 0 ? 0 : (max - min) / max;
    const luma = lumaAt(image.rgba, pixel);
    if (luma >= 250) clipped += 1;
    histogram[Math.min(255, Math.round(luma))] = (histogram[Math.min(255, Math.round(luma))] ?? 0) + 1;
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg;
    rgSquares += rg * rg;
    ybSum += yb;
    ybSquares += yb * yb;
  }
  const percentile = (share: number): number => {
    const wanted = share * pixels;
    let seen = 0;
    for (let value = 0; value < 256; value += 1) {
      seen += histogram[value] ?? 0;
      if (seen >= wanted) return value;
    }
    return 255;
  };
  const rgMean = rgSum / pixels;
  const ybMean = ybSum / pixels;
  const rgStd = Math.sqrt(Math.max(0, rgSquares / pixels - rgMean * rgMean));
  const ybStd = Math.sqrt(Math.max(0, ybSquares / pixels - ybMean * ybMean));
  return {
    meanSaturation: round3(saturation / pixels),
    colourfulness: round3(Math.sqrt(rgStd * rgStd + ybStd * ybStd) + 0.3 * Math.sqrt(rgMean * rgMean + ybMean * ybMean)),
    clippedRatio: round3(clipped / pixels),
    p5Luma: percentile(0.05),
    p95Luma: percentile(0.95)
  };
}

export interface FrameDelta {
  readonly meanAbsLumaDiff: number;
  readonly meanLumaDelta: number;
  /** Share of pixels whose luma moved by more than 16. */
  readonly changedRatio: number;
}

export function frameDelta(a: DecodedImage, b: DecodedImage): FrameDelta {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`frame sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const pixels = a.width * a.height;
  let absSum = 0;
  let deltaSum = 0;
  let changed = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const delta = lumaAt(b.rgba, pixel) - lumaAt(a.rgba, pixel);
    absSum += Math.abs(delta);
    deltaSum += delta;
    if (Math.abs(delta) > 16) changed += 1;
  }
  return {
    meanAbsLumaDiff: round3(absSum / Math.max(1, pixels)),
    meanLumaDelta: round3(deltaSum / Math.max(1, pixels)),
    changedRatio: round3(changed / Math.max(1, pixels))
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------- probes installed before the app loads

/**
 * addInitScript: replaces every microphone and speech-recognition entry point with a stub that only counts the call
 * (getUserMedia rejects with NotAllowedError), so a spec can prove the app never asks for the microphone.
 */
export function micProbeInitScript(): void {
  const host = window as unknown as Record<string, unknown>;
  if (host["__WW_MIC_PROBE__"]) return;
  const probe = {
    installed: true,
    getUserMedia: 0,
    legacyGetUserMedia: 0,
    enumerateDevices: 0,
    speechRecognition: 0,
    speechRecognitionStart: 0,
    mediaRecorder: 0,
    mediaStreamSource: 0,
    micPermissionQuery: 0,
    calls: [] as string[]
  };
  host["__WW_MIC_PROBE__"] = probe;
  const note = (what: string): void => {
    if (probe.calls.length < 50) probe.calls.push(what);
  };
  const blocked = (): DOMException => new DOMException("Blocked by the Wonder World no-speech probe", "NotAllowedError");
  const mark = (fn: object): void => {
    Object.defineProperty(fn, "__wwProbe", { value: true });
  };
  if (typeof MediaDevices !== "undefined") {
    const getUserMedia = function (): Promise<MediaStream> {
      probe.getUserMedia += 1;
      note("mediaDevices.getUserMedia");
      return Promise.reject(blocked());
    };
    mark(getUserMedia);
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", { configurable: true, writable: true, value: getUserMedia });
    const enumerate = MediaDevices.prototype.enumerateDevices;
    Object.defineProperty(MediaDevices.prototype, "enumerateDevices", {
      configurable: true,
      writable: true,
      value: function (this: MediaDevices): Promise<MediaDeviceInfo[]> {
        probe.enumerateDevices += 1;
        note("mediaDevices.enumerateDevices");
        return enumerate.call(this);
      }
    });
  }
  for (const name of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia"]) {
    Object.defineProperty(Navigator.prototype, name, {
      configurable: true,
      writable: true,
      value: function (_constraints: unknown, _onSuccess: unknown, onError?: unknown): void {
        probe.legacyGetUserMedia += 1;
        note(`navigator.${name}`);
        if (typeof onError === "function") (onError as (error: unknown) => void)(blocked());
      }
    });
  }
  const ProbeSpeechRecognition = function (this: unknown): void {
    probe.speechRecognition += 1;
    note("SpeechRecognition");
  };
  ProbeSpeechRecognition.prototype.start = function (): void {
    probe.speechRecognitionStart += 1;
    note("SpeechRecognition.start");
  };
  ProbeSpeechRecognition.prototype.stop = function (): void {};
  ProbeSpeechRecognition.prototype.abort = function (): void {};
  ProbeSpeechRecognition.prototype.addEventListener = function (): void {};
  ProbeSpeechRecognition.prototype.removeEventListener = function (): void {};
  mark(ProbeSpeechRecognition);
  for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: ProbeSpeechRecognition });
  }
  if (typeof window.MediaRecorder === "function") {
    const Original = window.MediaRecorder;
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: new Proxy(Original, {
        construct(target, args, newTarget) {
          probe.mediaRecorder += 1;
          note("MediaRecorder");
          return Reflect.construct(target, args, newTarget) as object;
        }
      })
    });
  }
  if (typeof AudioContext !== "undefined") {
    const original = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (this: AudioContext, stream: MediaStream): MediaStreamAudioSourceNode {
      probe.mediaStreamSource += 1;
      note("AudioContext.createMediaStreamSource");
      return original.call(this, stream);
    };
  }
  if (typeof Permissions !== "undefined") {
    const original = Permissions.prototype.query;
    Permissions.prototype.query = function (this: Permissions, descriptor: PermissionDescriptor): Promise<PermissionStatus> {
      if (descriptor && (descriptor.name as string) === "microphone") {
        probe.micPermissionQuery += 1;
        note("permissions.query(microphone)");
      }
      return original.call(this, descriptor);
    };
  }
}

export interface MicProbeReport {
  readonly installed: boolean;
  /** The stubs are the live entry points (navigator.mediaDevices.getUserMedia and webkitSpeechRecognition). */
  readonly stubsLive: boolean;
  readonly getUserMedia: number;
  readonly legacyGetUserMedia: number;
  readonly enumerateDevices: number;
  readonly speechRecognition: number;
  readonly speechRecognitionStart: number;
  readonly mediaRecorder: number;
  readonly mediaStreamSource: number;
  readonly micPermissionQuery: number;
  readonly calls: readonly string[];
}

export async function readMicProbe(page: Page): Promise<MicProbeReport> {
  return page.evaluate(() => {
    const host = window as unknown as Record<string, unknown>;
    const probe = host["__WW_MIC_PROBE__"] as Omit<MicProbeReport, "stubsLive"> | undefined;
    const isStub = (fn: unknown): boolean => typeof fn === "function" && (fn as { __wwProbe?: unknown }).__wwProbe === true;
    const stubsLive = isStub(navigator.mediaDevices?.getUserMedia) && isStub(host["webkitSpeechRecognition"]) && isStub(host["SpeechRecognition"]);
    if (!probe) {
      return {
        installed: false, stubsLive, getUserMedia: 0, legacyGetUserMedia: 0, enumerateDevices: 0, speechRecognition: 0,
        speechRecognitionStart: 0, mediaRecorder: 0, mediaStreamSource: 0, micPermissionQuery: 0, calls: []
      };
    }
    return { ...probe, calls: [...probe.calls], stubsLive };
  });
}

/**
 * Microphone and speech-recognition calls in a probe report: getUserMedia (modern and legacy), SpeechRecognition
 * (constructed or started) and microphone permission queries. MediaRecorder, createMediaStreamSource and
 * enumerateDevices are reported but not counted: with getUserMedia stubbed they cannot reach a microphone (the engine
 * can record its own output with a MediaRecorder for capture tooling).
 */
export function micCalls(report: MicProbeReport): number {
  return report.getUserMedia + report.legacyGetUserMedia + report.speechRecognition + report.speechRecognitionStart + report.micPermissionQuery;
}

/** The calls made between two reads of the (cumulative) probe. */
export function micDelta(after: MicProbeReport, before: MicProbeReport | null): MicProbeReport {
  if (!before) return after;
  return {
    installed: after.installed,
    stubsLive: after.stubsLive,
    getUserMedia: after.getUserMedia - before.getUserMedia,
    legacyGetUserMedia: after.legacyGetUserMedia - before.legacyGetUserMedia,
    enumerateDevices: after.enumerateDevices - before.enumerateDevices,
    speechRecognition: after.speechRecognition - before.speechRecognition,
    speechRecognitionStart: after.speechRecognitionStart - before.speechRecognitionStart,
    mediaRecorder: after.mediaRecorder - before.mediaRecorder,
    mediaStreamSource: after.mediaStreamSource - before.mediaStreamSource,
    micPermissionQuery: after.micPermissionQuery - before.micPermissionQuery,
    calls: after.calls.slice(before.calls.length)
  };
}

/**
 * addInitScript: records when each recorded voice line (a decoded buffer fetched from .../audio/<locale>/lines/<key>.mp3)
 * starts and stops on any AudioContext, so a spec can measure whether two voice lines ever sound at once. It tags
 * buffers through Response.arrayBuffer -> ArrayBuffer.slice -> decodeAudioData and watches AudioBufferSourceNode
 * start/stop; it changes no behaviour.
 */
export function voiceProbeInitScript(): void {
  const host = window as unknown as Record<string, unknown>;
  if (host["__WW_VOICE_PROBE__"]) return;
  interface VoiceRecord { key: string; start: number; end: number; ctx: BaseAudioContext }
  const records: VoiceRecord[] = [];
  const probe = { installed: true, fetched: 0, decoded: 0, starts: 0, records };
  host["__WW_VOICE_PROBE__"] = probe;
  const linePattern = /\/audio\/[A-Za-z_-]+\/lines\/([^/?#]+?)\.(?:mp3|ogg|wav|m4a|webm)(?:[?#]|$)/i;
  const bufferKeys = new WeakMap<ArrayBuffer, string>();
  const audioKeys = new WeakMap<AudioBuffer, string>();
  const sources = new WeakMap<AudioBufferSourceNode, VoiceRecord>();
  const keyOf = (url: string): string | null => {
    const match = linePattern.exec(url);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };
  const originalArrayBuffer = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function (this: Response): Promise<ArrayBuffer> {
    const key = keyOf(this.url);
    return originalArrayBuffer.call(this).then((buffer) => {
      if (key) {
        bufferKeys.set(buffer, key);
        probe.fetched += 1;
      }
      return buffer;
    });
  };
  const originalSlice = ArrayBuffer.prototype.slice;
  ArrayBuffer.prototype.slice = function (this: ArrayBuffer, begin?: number, end?: number): ArrayBuffer {
    const out = originalSlice.call(this, begin, end);
    const key = bufferKeys.get(this);
    if (key) bufferKeys.set(out, key);
    return out;
  };
  const originalDecode = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (
    this: BaseAudioContext,
    data: ArrayBuffer,
    onSuccess?: DecodeSuccessCallback | null,
    onError?: DecodeErrorCallback | null
  ): Promise<AudioBuffer> {
    const key = bufferKeys.get(data);
    const tag = (buffer: AudioBuffer): void => {
      if (key && !audioKeys.has(buffer)) {
        audioKeys.set(buffer, key);
        probe.decoded += 1;
      }
    };
    const success = onSuccess ? (buffer: AudioBuffer): void => { tag(buffer); onSuccess(buffer); } : onSuccess;
    return originalDecode.call(this, data, success, onError).then((buffer) => {
      tag(buffer);
      return buffer;
    });
  };
  const originalStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: [number?, number?, number?]): void {
    const buffer = this.buffer;
    const key = buffer ? audioKeys.get(buffer) : undefined;
    if (key && buffer) {
      const ctx = this.context;
      const [when, offset, duration] = args;
      const startAt = Math.max(ctx.currentTime, when ?? 0);
      const from = Math.max(0, offset ?? 0);
      const rate = this.playbackRate.value > 0 ? this.playbackRate.value : 1;
      let length = Math.max(0, buffer.duration - from);
      if (duration !== undefined) length = Math.min(length, duration);
      const record: VoiceRecord = { key, start: startAt, end: this.loop ? Number.POSITIVE_INFINITY : startAt + length / rate, ctx };
      records.push(record);
      sources.set(this, record);
      probe.starts += 1;
    }
    originalStart.apply(this, args);
  };
  const originalStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, ...args: [number?]): void {
    const record = sources.get(this);
    if (record) record.end = Math.min(record.end, Math.max(record.ctx.currentTime, args[0] ?? 0));
    originalStop.apply(this, args);
  };
}

export interface VoiceProbeReport {
  readonly installed: boolean;
  readonly fetched: number;
  readonly decoded: number;
  readonly starts: number;
  /** Voice lines still sounding now (ends more than 50 ms ahead of their context clock). */
  readonly activeNow: number;
  readonly voices: readonly { readonly key: string; readonly start: number; readonly end: number | null }[];
}

export async function readVoiceProbe(page: Page): Promise<VoiceProbeReport> {
  return page.evaluate(() => {
    interface VoiceRecord { key: string; start: number; end: number; ctx: BaseAudioContext }
    const probe = (window as unknown as Record<string, unknown>)["__WW_VOICE_PROBE__"] as
      | { installed: boolean; fetched: number; decoded: number; starts: number; records: VoiceRecord[] }
      | undefined;
    if (!probe) return { installed: false, fetched: 0, decoded: 0, starts: 0, activeNow: 0, voices: [] };
    return {
      installed: probe.installed,
      fetched: probe.fetched,
      decoded: probe.decoded,
      starts: probe.starts,
      activeNow: probe.records.filter((record) => record.end > record.ctx.currentTime + 0.05).length,
      voices: probe.records.map((record) => ({ key: record.key, start: record.start, end: Number.isFinite(record.end) ? record.end : null }))
    };
  });
}

/** The longest time two recorded voice lines overlap, in seconds (0 when they never do). */
export function maxVoiceOverlapSec(report: VoiceProbeReport): { readonly seconds: number; readonly pair: readonly string[] } {
  let worst = 0;
  let pair: string[] = [];
  const voices = [...report.voices].sort((a, b) => a.start - b.start);
  for (let i = 0; i < voices.length; i += 1) {
    for (let j = i + 1; j < voices.length; j += 1) {
      const a = voices[i];
      const b = voices[j];
      if (!a || !b) continue;
      const aEnd = a.end ?? Number.POSITIVE_INFINITY;
      const bEnd = b.end ?? Number.POSITIVE_INFINITY;
      const overlap = Math.min(aEnd, bEnd) - Math.max(a.start, b.start);
      if (overlap > worst) {
        worst = overlap;
        pair = [a.key, b.key];
      }
    }
  }
  return { seconds: round3(worst), pair };
}

// ---------------------------------------------------------------- speaking monitor (real-time sampling of state().speaking)

export interface SpeakingMonitorReport {
  readonly samples: number;
  readonly transitions: readonly { readonly sample: number; readonly speaking: string | null; readonly phase: string | null }[];
  /** Samples where `speaking` was neither null nor exactly one line key (for example two keys at once). */
  readonly malformed: readonly string[];
  readonly maxTargets: number;
  readonly errors: readonly string[];
}

/** Samples state() every `intervalMs` of real time inside the page until stopSpeakingMonitor. */
export async function startSpeakingMonitor(page: Page, intervalMs = 40): Promise<void> {
  await page.evaluate(({ name, intervalMs: every, keySource }) => {
    const host = window as unknown as Record<string, unknown>;
    const hooks = (host as HookHost)[name];
    if (!hooks) throw new Error(`${name} is not installed`);
    const keyPattern = new RegExp(keySource);
    const record = {
      samples: 0,
      transitions: [] as { sample: number; speaking: string | null; phase: string | null }[],
      malformed: [] as string[],
      maxTargets: 0,
      errors: [] as string[],
      last: "\u0000(none)" as unknown,
      timer: 0
    };
    record.timer = window.setInterval(() => {
      try {
        const state = hooks.state();
        record.samples += 1;
        const speaking: unknown = state.speaking;
        if (speaking !== null && (typeof speaking !== "string" || !keyPattern.test(speaking)) && record.malformed.length < 20) {
          record.malformed.push(JSON.stringify(speaking));
        }
        if (speaking !== record.last) {
          record.last = speaking;
          if (record.transitions.length < 400) {
            record.transitions.push({
              sample: record.samples,
              speaking: typeof speaking === "string" ? speaking : speaking === null ? null : JSON.stringify(speaking),
              phase: state.director ? state.director.phase : null
            });
          }
        }
        record.maxTargets = Math.max(record.maxTargets, Array.isArray(state.targets) ? state.targets.length : 0);
      } catch (error) {
        if (record.errors.length < 10) record.errors.push(String(error));
      }
    }, every);
    host["__WW_SPEAKING_MONITOR__"] = record;
  }, { name: QA_GLOBAL, intervalMs, keySource: LINE_KEY_SOURCE });
}

export async function stopSpeakingMonitor(page: Page): Promise<SpeakingMonitorReport> {
  return page.evaluate(() => {
    const record = (window as unknown as Record<string, unknown>)["__WW_SPEAKING_MONITOR__"] as
      | (SpeakingMonitorReport & { timer: number })
      | undefined;
    if (!record) return { samples: 0, transitions: [], malformed: ["(monitor not running)"], maxTargets: 0, errors: [] };
    window.clearInterval(record.timer);
    return { samples: record.samples, transitions: record.transitions, malformed: record.malformed, maxTargets: record.maxTargets, errors: record.errors };
  });
}

// ---------------------------------------------------------------- one zero-input story run

export interface StoryClockRun {
  readonly style: "sampled" | "single";
  readonly chunks: number;
  /** Chunks where runToEnd(chunk) did not move the story clock and advance(chunk) was used instead. */
  readonly fallbacks: number;
  readonly finalCallUsed: boolean;
  readonly result: WonderRunResult | null;
  readonly maxTargets: number;
  readonly targetIds: readonly string[];
  readonly waitSamples: number;
  readonly maxRound: number;
  readonly beatIds: readonly string[];
  readonly phases: readonly string[];
  readonly screens: readonly string[];
  readonly speakingKeys: number;
  readonly malformedSpeaking: readonly string[];
  readonly foreignSpeaking: readonly string[];
}

/**
 * Runs the started story to its end with zero input. "single": one runToEnd(RUN_MAX_MS). "sampled": runToEnd in
 * SAMPLE_CHUNK_MS chunks (the hook stops early when the story finishes), reading state() between chunks to record the
 * targets, waits and speaking keys along the way; if a chunk does not move the story clock (an implementation that
 * reads maxMs as a total), advance(chunk) moves it and a final runToEnd gives the hook's own result.
 */
export async function runStoryClock(page: Page, story: StoryEntry, style: "sampled" | "single"): Promise<StoryClockRun> {
  return page.evaluate(({ name, code, chunkMs, maxMs, style: runStyle, keySource }) => {
    const hooks = (window as unknown as HookHost)[name];
    if (!hooks) throw new Error(`${name} is not installed`);
    const keyPattern = new RegExp(keySource);
    const out = {
      style: runStyle,
      chunks: 0,
      fallbacks: 0,
      finalCallUsed: false,
      result: null as WonderRunResult | null,
      maxTargets: 0,
      targetIds: [] as string[],
      waitSamples: 0,
      maxRound: 0,
      beatIds: [] as string[],
      phases: [] as string[],
      screens: [] as string[],
      speakingKeys: 0,
      malformedSpeaking: [] as string[],
      foreignSpeaking: [] as string[]
    };
    const spoken = new Set<string>();
    const remember = (list: string[], value: string, cap: number): void => {
      if (!list.includes(value) && list.length < cap) list.push(value);
    };
    const sample = (): WonderQaState => {
      const state = hooks.state();
      remember(out.screens, String(state.screen), 10);
      const targets = Array.isArray(state.targets) ? state.targets : [];
      out.maxTargets = Math.max(out.maxTargets, targets.length);
      for (const target of targets) remember(out.targetIds, String(target), 40);
      const director = state.director;
      if (director) {
        remember(out.phases, director.phase, 12);
        if (director.beatId) remember(out.beatIds, director.beatId, 80);
        if (director.phase === "waiting") out.waitSamples += 1;
        out.maxRound = Math.max(out.maxRound, director.round);
      }
      const speaking: unknown = state.speaking;
      if (speaking !== null) {
        if (typeof speaking !== "string" || !keyPattern.test(speaking)) remember(out.malformedSpeaking, JSON.stringify(speaking), 20);
        else {
          spoken.add(speaking);
          if (!speaking.startsWith(`${code}.`)) remember(out.foreignSpeaking, speaking, 20);
        }
      }
      return state;
    };
    const ended = (state: WonderQaState): boolean =>
      state.screen === "offline" || state.director?.phase === "finished" || state.director?.phase === "disposed";
    let state = sample();
    if (runStyle === "single") {
      out.result = hooks.runToEnd(maxMs);
      out.chunks = 1;
      sample();
    } else {
      for (let spent = 0; spent < maxMs; ) {
        const before = state.director ? state.director.elapsedMs : -1;
        const result = hooks.runToEnd(chunkMs);
        spent += chunkMs;
        out.chunks += 1;
        state = sample();
        if (result.finished) {
          out.result = result;
          break;
        }
        if (ended(state)) break;
        const after = state.director ? state.director.elapsedMs : -1;
        if (!(after > before)) {
          out.fallbacks += 1;
          hooks.advance(chunkMs);
          state = sample();
          if (ended(state)) break;
        }
      }
      if (!out.result) {
        out.result = hooks.runToEnd(chunkMs);
        out.finalCallUsed = true;
        sample();
      }
    }
    out.speakingKeys = spoken.size;
    return out;
  }, { name: QA_GLOBAL, code: story.code, chunkMs: SAMPLE_CHUNK_MS, maxMs: RUN_MAX_MS, style, keySource: LINE_KEY_SOURCE });
}

export interface AfterEndCheck {
  /** Still on the offline card after 1 s of real time and 3 s of story time: nothing plays next by itself. */
  readonly stayedOffline: boolean;
  readonly screen: string;
  readonly storyId: string | null;
  readonly directorStoryId: string | null;
  readonly directorPhase: string | null;
  readonly advanceError: string | null;
}

export async function checkNoAutoNext(page: Page, id: string): Promise<AfterEndCheck> {
  await sleep(1_000);
  let advanceError: string | null = null;
  try {
    await qaAdvance(page, 3_000);
  } catch (error) {
    advanceError = redact(error instanceof Error ? error.message : String(error)).slice(0, 300);
  }
  const state = await qaState(page);
  const director = state.director;
  return {
    stayedOffline: state.screen === "offline" && (director === null || (director.storyId === id && (director.phase === "finished" || director.phase === "disposed"))),
    screen: state.screen,
    storyId: state.storyId,
    directorStoryId: director?.storyId ?? null,
    directorPhase: director?.phase ?? null,
    advanceError
  };
}

export interface StoryRunRecord {
  readonly code: string;
  readonly id: string;
  readonly mode: PlayMode;
  readonly style: "sampled" | "single";
  readonly loadMs: number;
  readonly runMs: number;
  readonly loadError: string | null;
  readonly started: WonderQaState | null;
  readonly run: StoryClockRun | null;
  readonly runError: string | null;
  readonly ended: WonderQaState | null;
  readonly offlineCardVisible: boolean;
  readonly afterEnd: AfterEndCheck | null;
  readonly mic: MicProbeReport | null;
  /** Entries this story added to state().errors (the app keeps one list per page). */
  readonly newAppErrors: readonly string[];
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly badResponses: readonly string[];
}

/** The entries `after` added to an append-only (capped, oldest dropped first) list. */
export function addedEntries(before: readonly string[], after: readonly string[]): string[] {
  if (after.length >= before.length && before.every((entry, index) => after[index] === entry)) return after.slice(before.length);
  const remaining = [...before];
  const added: string[] = [];
  for (const entry of after) {
    const at = remaining.indexOf(entry);
    if (at >= 0) remaining.splice(at, 1);
    else added.push(entry);
  }
  return added;
}

/** startStory, then a zero-input run to the end, then the no-autoplay check; never throws for a story-level failure. */
export async function runStory(page: Page, log: PageLog, story: StoryEntry, mode: PlayMode, style: "sampled" | "single", withMicProbe: boolean): Promise<StoryRunRecord> {
  const mark = log.mark();
  const message = (error: unknown): string => redact(error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const errorsBefore = (await qaState(page).catch(() => null))?.errors ?? [];
  let loadError: string | null = null;
  let runError: string | null = null;
  let started: WonderQaState | null = null;
  let run: StoryClockRun | null = null;
  let ended: WonderQaState | null = null;
  let afterEnd: AfterEndCheck | null = null;
  let offlineCardVisible = false;
  const micBefore = withMicProbe ? await readMicProbe(page).catch(() => null) : null;
  const loadStart = Date.now();
  try {
    await qaStartStory(page, story.id, mode);
    started = await qaState(page);
  } catch (error) {
    loadError = message(error);
  }
  const loadMs = Date.now() - loadStart;
  const runStart = Date.now();
  if (loadError === null) {
    try {
      run = await runStoryClock(page, story, style);
      ended = await qaState(page);
      offlineCardVisible = await page.locator(SELECTORS.offline).first().isVisible().catch(() => false);
      afterEnd = await checkNoAutoNext(page, story.id);
    } catch (error) {
      runError = message(error);
    }
  }
  const runMs = Date.now() - runStart;
  const micAfter = withMicProbe ? await readMicProbe(page).catch(() => null) : null;
  const mic = micAfter ? micDelta(micAfter, micBefore) : null;
  const errorsAfter = (await qaState(page).catch(() => null))?.errors ?? ended?.errors ?? [];
  const slice = log.since(mark);
  return {
    code: story.code,
    id: story.id,
    mode,
    style,
    loadMs,
    runMs,
    loadError,
    started,
    run,
    runError,
    ended,
    offlineCardVisible,
    afterEnd,
    mic,
    newAppErrors: addedEntries(errorsBefore, errorsAfter).map((entry) => redact(entry)),
    consoleErrors: slice.consoleErrors,
    pageErrors: slice.pageErrors,
    badResponses: slice.badResponses
  };
}

/** Soft assertions for one story run, labelled with the story so one shard reports every failing story. */
export function expectStoryRecord(record: StoryRunRecord): void {
  const label = `${record.code.toUpperCase()} ${record.id} (${record.mode})`;
  expect.soft(record.loadError, `${label}: startStory settles`).toBeNull();
  expect.soft(record.runError, `${label}: the zero-input run completes without a hook error`).toBeNull();
  const started = record.started;
  if (started) {
    expect.soft(started.screen, `${label}: story screen after startStory`).toBe("story");
    expect.soft(started.storyId, `${label}: state().storyId`).toBe(record.id);
    expect.soft(started.director?.storyId ?? null, `${label}: the director runs this story`).toBe(record.id);
    expect.soft(started.director?.mode ?? null, `${label}: the director runs in the requested mode`).toBe(record.mode);
    expect.soft(started.micRequested, `${label}: micRequested at start`).toBe(false);
  }
  const run = record.run;
  if (run) {
    expect.soft(run.result?.finished ?? false, `${label}: runToEnd reports finished`).toBe(true);
    expect.soft(run.result?.reason ?? null, `${label}: it finishes by completing (not "all done")`).toBe("complete");
    expect.soft(run.maxTargets, `${label}: never more than ${MAX_TARGETS} tap targets`).toBeLessThanOrEqual(MAX_TARGETS);
    expect.soft(run.malformedSpeaking, `${label}: speaking names at most one line key at a time`).toEqual([]);
    expect.soft(run.foreignSpeaking, `${label}: every spoken line belongs to this story`).toEqual([]);
  }
  const ended = record.ended;
  if (ended) {
    expect.soft(ended.screen, `${label}: the offline card follows the end`).toBe("offline");
    if (ended.director) {
      expect.soft(ended.director.finishedReason, `${label}: director finishedReason`).toBe("complete");
      expect.soft(ended.director.taps, `${label}: zero input means zero taps`).toBe(0);
    }
    expect.soft(ended.targets.length, `${label}: no tap targets after the end`).toBe(0);
    expect.soft(ended.speaking, `${label}: nothing is spoken after the end`).toBeNull();
    expect.soft(ended.micRequested, `${label}: micRequested at the end`).toBe(false);
    expect.soft(record.offlineCardVisible, `${label}: the offline card is visible`).toBe(true);
  }
  expect.soft(record.newAppErrors, `${label}: state().errors added during this story`).toEqual([]);
  if (record.afterEnd) expect.soft(record.afterEnd.stayedOffline, `${label}: nothing plays next by itself (${JSON.stringify(record.afterEnd)})`).toBe(true);
  if (record.mic) expect.soft(micCalls(record.mic), `${label}: microphone/speech calls (${record.mic.calls.join(", ")})`).toBe(0);
  expect.soft(record.consoleErrors, `${label}: console errors`).toEqual([]);
  expect.soft(record.pageErrors, `${label}: page errors`).toEqual([]);
}

// ---------------------------------------------------------------- the story suite (playback J09, no speech J12)

export interface StorySuiteOptions {
  readonly title: string;
  readonly stories: readonly StoryEntry[];
  readonly storiesPerTest: number;
  readonly mode: PlayMode;
  readonly style: "sampled" | "single";
  readonly micProbe: boolean;
  /** WWJSON record prefix: `<prefix>-<code>` per story. */
  readonly reportPrefix: string;
  readonly viewport: { readonly width: number; readonly height: number };
}

/**
 * Defines one describe block: a dev server for the file and one test per shard of stories. Each shard boots the app
 * once (`?autostart=1&manual=1`: menu, no real-time loop, audio locked) and plays its stories in order through
 * startStory + runToEnd with zero input. Story failures are soft, so one shard reports every failing story.
 */
export function defineStorySuite(options: StorySuiteOptions): void {
  test.describe(options.title, () => {
    test.setTimeout(TEST_TIMEOUT_MS);
    let server: ExampleDevServer;
    test.beforeAll(async () => {
      server = await startExampleDevServer();
    });
    test.afterAll(async () => {
      await server?.close();
    });

    for (const shard of chunk(options.stories, options.storiesPerTest)) {
      const range = storyRange(shard);
      test(`${range}: ${options.mode} runs finish with zero input`, async ({ page }) => {
        if (options.micProbe) await page.addInitScript(micProbeInitScript);
        await page.setViewportSize(options.viewport);
        const log = attachPageLog(page);
        await openWonderWorld(page, server, log, { autostart: 1, manual: 1 });
        const boot = log.since({ console: 0, page: 0, responses: 0, failed: 0 });
        const bootState = await qaState(page);
        expect.soft(boot.consoleErrors, "boot: console errors").toEqual([]);
        expect.soft(boot.pageErrors, "boot: page errors").toEqual([]);
        expect.soft(bootState.errors, "boot: state().errors").toEqual([]);
        expect.soft(bootState.screen, "boot: ?autostart=1 without a story opens the menu").toBe("menu");
        expect.soft(bootState.micRequested, "boot: micRequested").toBe(false);
        if (options.micProbe) {
          const probe = await readMicProbe(page);
          expect(probe.installed, "the microphone probe was installed before the app loaded").toBe(true);
          expect(probe.stubsLive, "the microphone and speech stubs are the live entry points").toBe(true);
        }
        const context = await runContext(page, `${options.reportPrefix}-${range}`);
        const summary: Record<string, unknown>[] = [];
        for (const story of shard) {
          await test.step(`${story.code.toUpperCase()} ${story.title} (${story.id})`, async () => {
            const record = await runStory(page, log, story, options.mode, options.style, options.micProbe);
            emitJson(`${options.reportPrefix}-${story.code}`, { ...record, context: { runId: context["runId"], engineVersion: context["engineVersion"] } });
            summary.push({
              code: record.code,
              id: record.id,
              finished: record.run?.result?.finished ?? false,
              reason: record.run?.result?.reason ?? null,
              storyMs: record.ended?.director?.elapsedMs ?? record.run?.result?.elapsedMs ?? null,
              loadMs: record.loadMs,
              runMs: record.runMs,
              maxTargets: record.run?.maxTargets ?? null,
              waits: record.run?.waitSamples ?? null,
              lines: record.run?.speakingKeys ?? null,
              errors: record.consoleErrors.length + record.pageErrors.length + record.newAppErrors.length,
              loadError: record.loadError,
              runError: record.runError
            });
            expectStoryRecord(record);
          });
        }
        const mic = options.micProbe ? await readMicProbe(page) : null;
        emitJson(`${options.reportPrefix}-${range.toLowerCase()}-summary`, { ...context, mode: options.mode, style: options.style, stories: summary, mic, boot });
        if (mic) {
          expect(micCalls(mic), `no microphone or speech-recognition call in ${range} (${mic.calls.join(", ")})`).toBe(0);
          expect((await qaState(page)).micRequested, "micRequested stays false").toBe(false);
        }
      });
    }
  });
}
