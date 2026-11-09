/**
 * Shared lab-flag parser for the showcase games (work package W-8, owner decision D1).
 *
 * Experimental features are reachable through query-string flags. Owner decision 2026-11-07: a feature that passes a
 * real-GPU check is on by default for that game, passed as the game's default (`labAppOptions(flags, { backend: "auto" })`,
 * `labCameraOptions(flags, "reversed")`); the flag then overrides or opts out. Without a game default the parser enables
 * nothing on its own:
 *
 *   ?backend=auto | webgpu | webgl2   renderer.backend  (auto/webgpu keep the WebGL2 fallback; webgl2 forces WebGL2 and is
 *                                     the opt-out for games that default to auto; invalid values are ignored)
 *   ?worker=1                     worker-owned rendering (main-thread fallback kept)
 *   ?depth=reversed | logarithmic | standard   camera.depth.mode (standard opts out of a game default)
 *   ?gamut=p3                     output.outputColorSpace = "display-p3"
 *
 * `labAppOptions` returns fragments for the `createAuraApp` options (`renderer`, `output`, and the `worker.fallback` half:
 * the game supplies `createWorker` itself); `labCameraOptions` returns the fragment for the `camera({ ... })` node.
 * Unknown or malformed values are ignored and reported in `ignored`. No DOM access at import time.
 */

export type LabBackend = "auto" | "webgpu";
/** `webgl2` is the explicit opt-out for games whose default backend is `auto` (WebGL2 is the engine default). */
export type LabBackendRequest = LabBackend | "webgl2";
export type LabDepthMode = "reversed" | "logarithmic";
/** `standard` is the explicit opt-out for games that default to a non-standard depth mode. */
export type LabDepthRequest = LabDepthMode | "standard";

export interface LabFlags {
  readonly backend?: LabBackendRequest;
  readonly worker: boolean;
  readonly depth?: LabDepthRequest;
  readonly gamut?: "p3";
  /** Query keys that were present with a value the parser does not accept. */
  readonly ignored: readonly string[];
  /** True when at least one flag is active. */
  readonly any: boolean;
}

export interface LabAppOptions {
  readonly renderer?: { readonly backend: LabBackend; readonly allowFallback: true };
  /**
   * Absent means no worker was requested. `createGame` accepts this fragment as is (games run on the main thread and
   * honor `fallback: "main-thread"`). For `createAuraApp` pass the game's `createWorker` as the second argument of
   * `labAppOptions` so the fragment carries it (see `LabAppOptionsWithWorker`).
   */
  readonly worker?: { readonly fallback: "main-thread"; readonly createWorker?: () => Worker };
  readonly output?: { readonly outputColorSpace: "display-p3" };
}

/** `LabAppOptions` whose worker fragment always carries `createWorker`: spread it into `createAuraApp` without a cast. */
export interface LabAppOptionsWithWorker extends Omit<LabAppOptions, "worker"> {
  readonly worker?: { readonly fallback: "main-thread"; readonly createWorker: () => Worker };
}

/** Per-game defaults for `labAppOptions` (a game's verified experimental defaults). */
export interface LabAppDefaults {
  /** Backend used when `?backend` is absent; `?backend=webgl2` opts out. Absent means WebGL2. */
  readonly backend?: LabBackend;
  readonly createWorker?: () => Worker;
}

/*
 * Render-worker factory registered by a showcase app wrapper (`apps/showcase-port-shared/worker-lab.ts`). Examples stay
 * free of the `@aura3d/engine/worker` import (their standalone Vite config emits classic workers): they pass
 * `labRenderWorker` as `createWorker`, and the app route registers the bundled module worker before the example boots.
 */
let registeredWorkerFactory: (() => Worker) | undefined;

/** Registers the factory `labRenderWorker` delegates to (`?worker=1`). `undefined` unregisters. */
export function registerLabWorkerFactory(createWorker: (() => Worker) | undefined): void {
  registeredWorkerFactory = createWorker;
}

/**
 * `createWorker` for examples: constructs the registered render worker. Without a registration it throws, which the
 * engine treats like any worker construction failure: `worker.fallback: "main-thread"` keeps the app on the main thread.
 */
export function labRenderWorker(): Worker {
  if (!registeredWorkerFactory) throw new Error("No render worker registered for ?worker=1 (registerLabWorkerFactory).");
  return registeredWorkerFactory();
}

export function parseLabFlags(search: string | URLSearchParams | undefined): LabFlags {
  const params = typeof search === "string" ? new URLSearchParams(search) : (search ?? new URLSearchParams());
  const ignored: string[] = [];
  const read = (key: string): string | undefined => {
    const raw = params.get(key);
    return raw === null ? undefined : raw.trim().toLowerCase();
  };
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | undefined => {
    const value = read(key);
    if (value === undefined) return undefined;
    if ((allowed as readonly string[]).includes(value)) return value as T;
    ignored.push(key);
    return undefined;
  };
  const backend = pick("backend", ["auto", "webgpu", "webgl2"] as const);
  const depth = pick("depth", ["reversed", "logarithmic", "standard"] as const);
  const gamut = pick("gamut", ["p3"] as const);
  const workerRaw = read("worker");
  const worker = workerRaw === "1";
  if (workerRaw !== undefined && !worker) ignored.push("worker");
  return { ...(backend ? { backend } : {}), worker, ...(depth ? { depth } : {}), ...(gamut ? { gamut } : {}), ignored, any: Boolean(backend || worker || depth || gamut) };
}

/** Reads `location.search` when a window exists; otherwise returns the all-off flags. */
export function readLabFlags(): LabFlags {
  return parseLabFlags(typeof window !== "undefined" ? window.location.search : undefined);
}

/**
 * The backend a game requests: `?backend=` when given, else the game default. `undefined` means WebGL2 (no renderer
 * fragment), which is also what `?backend=webgl2` yields.
 */
export function resolveLabBackend(flags: LabFlags, defaultBackend?: LabBackend): LabBackend | undefined {
  const backend = flags.backend ?? defaultBackend;
  return backend === "webgl2" ? undefined : backend;
}

/**
 * Maps flags to `createAuraApp` option fragments to spread into the app options. Every experimental backend keeps its
 * WebGL2 fallback (`allowFallback: true`, worker `main-thread`). The second argument is either the game's `createWorker`
 * or its defaults (`{ backend: "auto", createWorker }`). Returns `{}` when no flag is active and no default applies.
 */
export function labAppOptions(flags: LabFlags): LabAppOptions;
export function labAppOptions(flags: LabFlags, createWorker: () => Worker): LabAppOptionsWithWorker;
export function labAppOptions(flags: LabFlags, defaults: LabAppDefaults & { readonly createWorker: () => Worker }): LabAppOptionsWithWorker;
export function labAppOptions(flags: LabFlags, defaults: LabAppDefaults): LabAppOptions;
export function labAppOptions(flags: LabFlags, defaultsOrWorker?: LabAppDefaults | (() => Worker)): LabAppOptions {
  const defaults: LabAppDefaults = typeof defaultsOrWorker === "function" ? { createWorker: defaultsOrWorker } : (defaultsOrWorker ?? {});
  const { createWorker } = defaults;
  const backend = resolveLabBackend(flags, defaults.backend);
  return {
    ...(backend ? { renderer: { backend, allowFallback: true as const } } : {}),
    ...(flags.worker ? { worker: { fallback: "main-thread" as const, ...(createWorker ? { createWorker } : {}) } } : {}),
    ...(flags.gamut ? { output: { outputColorSpace: "display-p3" as const } } : {})
  };
}

/**
 * Fragment for `camera({ ... })`: `depth.mode` with the standard-depth fallback allowed. `defaultMode` is the game's
 * verified default (owner decision 2026-11-07: experimental features that pass a real-GPU check are on by default);
 * `?depth=standard` opts out, `?depth=reversed|logarithmic` overrides. `{}` when the result is standard depth.
 */
export function labCameraOptions(flags: LabFlags, defaultMode?: LabDepthMode): { readonly depth?: { readonly mode: LabDepthMode; readonly allowFallback: true } } {
  const mode = flags.depth ?? defaultMode;
  return mode && mode !== "standard" ? { depth: { mode, allowFallback: true as const } } : {};
}
