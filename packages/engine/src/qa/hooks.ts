import {
  createQaRunMonitor,
  type QaFrameSample,
  type QaNonFiniteEntry,
  type QaRunMonitorOptions,
  type QaTelemetrySnapshot
} from "./telemetry.js";

/** The slice of an `AuraApp` the generated hooks read; every member is optional so partial apps work. */
export interface QaHookApp {
  capture?(options: { type: "png-blob" }): Promise<unknown>;
  diagnostics?(): unknown;
  /** Renderer info: either a getter function or the info object itself (`AuraApp.info`). */
  readonly info?: unknown;
}

export interface QaHooksOptions<S, I, X extends object = {}> {
  /** True once the app finished booting. */
  readonly ready: () => boolean;
  /** Plain-data snapshot of the simulation (compared against recorded references). */
  readonly state: () => S;
  /** Advance `n` simulation steps (input applies to the first step) and present once. Default: not installed. */
  readonly stepFrames?: (n: number, input?: Partial<I>) => void;
  /** Rebuild the simulation, optionally with a new seed. */
  readonly reset?: (seed?: number) => void;
  /** Headless replay of a recorded script; returns the trace. */
  readonly replay?: (script: string, ...rest: number[]) => unknown;
  /** Start a run (press Start) without rendering a title flow. */
  readonly begin?: () => void;
  readonly seed?: number;
  /** One compact trace row for the current step and the column names (for capture/replay tooling). */
  readonly traceRow?: () => unknown;
  readonly traceColumns?: readonly string[];
  /** The mounted app (or a getter, because ports create it asynchronously). Powers `frame`, `pixels`, `info`, `diagnostics`. */
  readonly app?: QaHookApp | null | (() => QaHookApp | null | undefined);
  readonly routeHealth?: () => unknown;
  readonly nodeCount?: () => number;
  /** Game-specific hooks merged on top of the standard ones (they win on name clashes). */
  readonly extras?: X;
  /** Install target; defaults to `globalThis`. */
  readonly target?: Record<string, unknown>;
}

export interface QaPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface QaStandardHooks<S, I> {
  ready(): boolean;
  readonly seed: number | undefined;
  state(): S;
  stepFrames(n: number, input?: Partial<I>): S;
  reset(seed?: number): void;
  replay(script: string, ...rest: number[]): unknown;
  begin(): void;
  traceRow(): unknown;
  readonly traceColumns: readonly string[] | undefined;
  frame(width?: number, height?: number, quality?: number): Promise<string>;
  pixels(): Promise<QaPixels>;
  info(): unknown;
  diagnostics(): unknown;
  routeHealth(): unknown;
  nodeCount(): number;
}

export type QaHooks<S, I, X extends object = {}> = QaStandardHooks<S, I> & X;

export interface InstalledQaHooks<S, I, X extends object = {}> {
  readonly hooks: QaHooks<S, I, X>;
  /** Name of the global the hooks live on, for example `__AURA_SPLAT_RUSH__`. */
  readonly globalName: string;
  /** Name of the global the first boot error is stored on, for example `__AURA_SPLAT_RUSH_ERROR__`. */
  readonly errorGlobalName: string;
  /** Record a boot/runtime error; the first error wins so later noise cannot hide the cause. */
  reportError(error: unknown): void;
  /** Remove the hooks (and the error global) from the target. */
  uninstall(): void;
}

export interface QaTelemetryMethods {
  /** Scan `state()` now for `NaN`/`±Infinity` numbers and return all first-seen non-finite paths. */
  checkState(): readonly QaNonFiniteEntry[];
  /** Capture RGBA `pixels()`, flushing GPU rendering, and return its FNV-1a hash, blank flag, and readback duration. */
  measureFrame(): Promise<QaFrameSample>;
  /** Simulation step timing vs. GPU-flushed frame timing, first-seen `NaN`/`±Infinity` paths, and input-aware stuck status. */
  telemetry(): QaTelemetrySnapshot;
  /** Zero the run monitor counters (`stepTiming`, `frameTiming`, `nonFinite`, `stuck`). */
  resetTelemetry(): void;
}

export interface QaTelemetryHooksOptions<S, I, X extends object = {}> extends QaHooksOptions<S, I, X> {
  /** Optional telemetry configuration (non-finite state scan depth, stuck step threshold, injectable clock). */
  readonly telemetry?: QaRunMonitorOptions;
}

export type QaTelemetryHooks<S, I, X extends object = {}> = QaHooks<S, I, QaTelemetryMethods & X>;

export type InstalledQaTelemetryHooks<S, I, X extends object = {}> = InstalledQaHooks<S, I, QaTelemetryMethods & X>;

/** `splat-rush` -> `__AURA_SPLAT_RUSH__`. */
export function qaHookGlobalName(name: string): string {
  return `__AURA_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")}__`;
}

/** `splat-rush` -> `__AURA_SPLAT_RUSH_ERROR__`. */
export function qaErrorGlobalName(name: string): string {
  return qaHookGlobalName(name).replace(/__$/, "_ERROR__");
}

/**
 * Install the `window.__AURA_<NAME>__` QA hooks browser specs, capture tools and the live smoke read:
 * `ready`, `state`, `stepFrames`, `reset`, `replay`, `begin`, `traceRow`, `frame` (JPEG data URL), `pixels`
 * (RGBA), `info`, `diagnostics`, `routeHealth` and `nodeCount`, plus any game-specific extras.
 */
export function installQaHooks<S, I = Record<string, unknown>, X extends object = {}>(
  name: string,
  options: QaHooksOptions<S, I, X>
): InstalledQaHooks<S, I, X> {
  const target = (options.target ?? (globalThis as unknown as Record<string, unknown>)) as Record<string, unknown>;
  const globalName = qaHookGlobalName(name);
  const errorGlobalName = qaErrorGlobalName(name);
  const app = (): QaHookApp | null => {
    const value = typeof options.app === "function" ? options.app() : options.app;
    return value ?? null;
  };

  const capturePng = async (): Promise<Blob> => {
    const current = app();
    if (!current?.capture) throw new Error(`${globalName}: no app with capture() is mounted yet`);
    return (await current.capture({ type: "png-blob" })) as Blob;
  };

  const monitor = createQaRunMonitor((options as { readonly telemetry?: QaRunMonitorOptions }).telemetry);
  const readPixelsRaw = async (): Promise<QaPixels> => {
    const blob = await capturePng();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, data: image.data };
    } finally {
      bitmap.close?.();
    }
  };

  const standard: QaStandardHooks<S, I> & QaTelemetryMethods = {
    ready: options.ready,
    seed: options.seed,
    state: options.state,
    stepFrames(n, input) {
      const hasInput = input !== undefined && Object.keys(input as object).length > 0;
      let latestState!: S;
      monitor.recordSteps(
        n,
        hasInput,
        () => {
          options.stepFrames?.(n, input);
        },
        () => {
          latestState = options.state();
          return latestState;
        }
      );
      return latestState;
    },
    reset(seed) {
      options.reset?.(seed);
      monitor.reset();
    },
    replay(script, ...rest) {
      if (!options.replay) throw new Error(`${globalName}: replay is not supported by this game`);
      return options.replay(script, ...rest);
    },
    begin() {
      options.begin?.();
    },
    traceRow: () => options.traceRow?.() ?? null,
    traceColumns: options.traceColumns,
    async frame(width = 480, height = 270, quality = 0.7) {
      const blob = await capturePng();
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", quality);
      } finally {
        bitmap.close?.();
      }
    },
    async pixels() {
      let captured!: QaPixels;
      await monitor.measurePixels(async () => {
        captured = await readPixelsRaw();
        return captured;
      });
      return captured;
    },
    info: () => {
      const info = app()?.info;
      return (typeof info === "function" ? (info as () => unknown)() : info) ?? null;
    },
    diagnostics: () => app()?.diagnostics?.() ?? null,
    routeHealth: () => options.routeHealth?.() ?? null,
    nodeCount: () => options.nodeCount?.() ?? 0,
    checkState: () => [...monitor.inspectState(options.state())],
    measureFrame: () => monitor.measurePixels(readPixelsRaw),
    telemetry: () => monitor.snapshot(),
    resetTelemetry: () => monitor.reset()
  };

  const hooks = Object.defineProperties({ ...standard }, Object.getOwnPropertyDescriptors(options.extras ?? {})) as unknown as QaHooks<S, I, X>;
  target[globalName] = hooks;

  return {
    hooks,
    globalName,
    errorGlobalName,
    reportError(error) {
      if (target[errorGlobalName]) return;
      target[errorGlobalName] = String((error as Error | undefined)?.stack ?? error);
    },
    uninstall() {
      if (target[globalName] === hooks) delete target[globalName];
      delete target[errorGlobalName];
    }
  };
}

/**
 * Typed variant of `installQaHooks` that exposes `checkState`, `measureFrame`,
 * `telemetry`, and `resetTelemetry` on the returned `hooks` handle and accepts `options.telemetry`.
 */
export function installQaTelemetryHooks<S, I = Record<string, unknown>, X extends object = {}>(
  name: string,
  options: QaTelemetryHooksOptions<S, I, X>
): InstalledQaTelemetryHooks<S, I, X> {
  return installQaHooks(name, options) as unknown as InstalledQaTelemetryHooks<S, I, X>;
}
