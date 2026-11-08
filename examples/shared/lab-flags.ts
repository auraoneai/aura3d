/**
 * Shared lab-flag parser for the showcase games (work package W-8, owner decision D1).
 *
 * EXPERIMENTAL 5.0 features never ship as a game default. They are reachable only through query-string flags, all off by
 * default, and the parser only maps them to the app options; it never enables anything on its own:
 *
 *   ?backend=auto | webgpu        renderer.backend      (WebGL2 is the default; invalid values are ignored)
 *   ?worker=1                     worker-owned rendering (main-thread fallback kept)
 *   ?depth=reversed | logarithmic | standard   camera.depth.mode (standard opts out of a game default)
 *   ?gamut=p3                     output.outputColorSpace = "display-p3"
 *
 * `labAppOptions` returns fragments for the `createAuraApp` options (`renderer`, `output`, and the `worker.fallback` half:
 * the game supplies `createWorker` itself); `labCameraOptions` returns the fragment for the `camera({ ... })` node.
 * Unknown or malformed values are ignored and reported in `ignored`. No DOM access at import time.
 */

export type LabBackend = "auto" | "webgpu";
export type LabDepthMode = "reversed" | "logarithmic";
/** `standard` is the explicit opt-out for games that default to a non-standard depth mode. */
export type LabDepthRequest = LabDepthMode | "standard";

export interface LabFlags {
  readonly backend?: LabBackend;
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
  const backend = pick("backend", ["auto", "webgpu"] as const);
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
 * Maps flags to `createAuraApp` option fragments to spread into the app options. Every experimental backend keeps its
 * WebGL2 fallback (`allowFallback: true`, worker `main-thread`). Returns `{}` when no flag is active.
 */
export function labAppOptions(flags: LabFlags): LabAppOptions;
export function labAppOptions(flags: LabFlags, createWorker: () => Worker): LabAppOptionsWithWorker;
export function labAppOptions(flags: LabFlags, createWorker?: () => Worker): LabAppOptions {
  return {
    ...(flags.backend ? { renderer: { backend: flags.backend, allowFallback: true as const } } : {}),
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
