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

  const standard: QaStandardHooks<S, I> = {
    ready: options.ready,
    seed: options.seed,
    state: options.state,
    stepFrames(n, input) {
      options.stepFrames?.(n, input);
      return options.state();
    },
    reset(seed) {
      options.reset?.(seed);
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
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(bitmap, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", quality);
    },
    async pixels() {
      const blob = await capturePng();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d") as CanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, data: image.data };
    },
    info: () => {
      const info = app()?.info;
      return (typeof info === "function" ? (info as () => unknown)() : info) ?? null;
    },
    diagnostics: () => app()?.diagnostics?.() ?? null,
    routeHealth: () => options.routeHealth?.() ?? null,
    nodeCount: () => options.nodeCount?.() ?? 0
  };

  const hooks = { ...standard, ...(options.extras ?? {}) } as unknown as QaHooks<S, I, X>;
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
