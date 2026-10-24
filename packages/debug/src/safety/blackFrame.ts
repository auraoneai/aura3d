/**
 * Black-frame self-heal. Some GPU/driver combinations present a frame that is entirely black while the engine reports
 * draw calls. When that persists the page reloads itself one rung down a compatibility ladder (each rung switches off
 * one more optional stage) and records the rung and why, so a player still gets a picture and the diagnostics panel
 * shows which rung fixed it. Opt-in only: nothing here runs unless `installSafetyNet`, `installBlackFrameGuard` or
 * `createBlackFrameWatch` is called.
 *
 * The watch is deliberately conservative. A frame counts as broken only when (almost) every sampled texel of the world
 * canvas is the clear colour, the app is ready (document loaded, no loading overlay, no asset fetches in flight, the
 * engine drew something), it has rendered a minimum number of frames since becoming ready, and the canvas stayed that
 * way for several consecutive samples over a time budget that grows with the measured frame time. A dark but valid
 * scene, a slow first frame on a CPU renderer or a page that is still loading never trips it.
 */
export interface HealRung {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
}

export const DEFAULT_HEAL_LADDER: readonly HealRung[] = [
  { name: "no-aa", params: { aa: "0" } },
  { name: "no-post", params: { post: "0" } },
  { name: "aces-tone", params: { tm: "aces" } },
  { name: "no-env", params: { env: "0" } },
  { name: "no-shadow", params: { shadow: "0" } },
  { name: "low-quality", params: { quality: "low", sky: "1" } }
];

export const DEFAULT_HEAL_STORAGE_KEY = "aura3d-safety-heal-stage";
const BLACK_MAX_CHANNEL = 4;
/** Nearest-neighbour probe grid: one texel per block, so thin bright features are not averaged away. */
const PROBE_WIDTH = 48;
const PROBE_HEIGHT = 32;
/** "Nearly all" black: at most this fraction of grid samples may be lit (a few stray texels of a HUD drawn into the canvas). */
const MAX_LIT_FRACTION = 0.002;
const LOADING_SELECTOR = '#boot, .boot, #loading, #loader, #loading-screen, .loading, .loader, [data-loading="true"], [aria-busy="true"], [id*="loading" i], [class*="loading" i]';
const HIDDEN_CLASSES = ["hidden", "done", "is-hidden", "loaded", "ready", "fade-out"];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function safeStorage(): StorageLike | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Current rung (0 = full quality) from session storage, so a reload continues down the ladder. */
export function healStage(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
  ladder: readonly HealRung[] = DEFAULT_HEAL_LADDER,
  storageKey: string = DEFAULT_HEAL_STORAGE_KEY
): number {
  const raw = Number(storage?.getItem(storageKey) ?? "0");
  return Number.isInteger(raw) && raw >= 0 && raw <= ladder.length ? raw : 0;
}

/** Query parameters implied by rung `stage` (cumulative); callers merge them under the author's explicit parameters. */
export function healParams(stage: number, ladder: readonly HealRung[] = DEFAULT_HEAL_LADDER): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const rung of ladder.slice(0, Math.max(0, stage))) Object.assign(merged, rung.params);
  return merged;
}

export function healRungName(stage: number, ladder: readonly HealRung[] = DEFAULT_HEAL_LADDER): string {
  return stage <= 0 ? "full" : ladder[Math.min(stage, ladder.length) - 1]!.name;
}

export interface FrameStats {
  readonly samples: number;
  /** Samples with any colour channel above the black threshold. */
  readonly lit: number;
  readonly litFraction: number;
  /** Largest colour channel seen (0..255). */
  readonly max: number;
  /** Mean of the RGB channels (0..255). */
  readonly mean: number;
}

/** Statistics of a downscaled RGBA probe of the canvas. */
export function analyseFrame(rgba: ArrayLike<number>, maxChannel: number = BLACK_MAX_CHANNEL): FrameStats {
  let samples = 0;
  let lit = 0;
  let max = 0;
  let sum = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    samples += 1;
    sum += r + g + b;
    const peak = Math.max(r, g, b);
    if (peak > max) max = peak;
    if (peak > maxChannel) lit += 1;
  }
  return { samples, lit, litFraction: samples === 0 ? 1 : lit / samples, max, mean: samples === 0 ? 0 : sum / (samples * 3) };
}

/**
 * True when the sampled frame is black: every texel by default; pass a small `maxLitFraction` to tolerate a few stray lit
 * texels (for example a HUD drawn into the same canvas). Empty input is never black.
 */
export function isBlackFrame(rgba: ArrayLike<number>, maxLitFraction = 0): boolean {
  if (rgba.length < 4) return false;
  return analyseFrame(rgba).litFraction <= maxLitFraction;
}

function elementVisible(element: Element): boolean {
  const node = element as HTMLElement;
  if (node.hidden === true) return false;
  const classes = node.classList;
  if (classes && HIDDEN_CLASSES.some((name) => classes.contains(name))) return false;
  if (typeof getComputedStyle === "function") {
    try {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.02) return false;
    } catch {
      /* detached or stubbed element: treat as visible */
    }
  }
  if (typeof node.getBoundingClientRect === "function") {
    const box = node.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
  }
  return true;
}

/** True while a visible loading overlay is on the page (`#boot`, `#loading`, `.loading`, `[aria-busy=true]` ...). */
export function hasVisibleLoadingOverlay(root: Pick<Document, "querySelectorAll"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  if (!root || typeof root.querySelectorAll !== "function") return false;
  try {
    return Array.from(root.querySelectorAll(LOADING_SELECTOR)).some(elementVisible);
  } catch {
    return false;
  }
}

/** Default readiness: document fully loaded, no asset fetches in flight, no visible loading overlay. */
export function defaultIsReady(): boolean {
  if (typeof document !== "undefined" && document.readyState && document.readyState !== "complete") return false;
  const inflight = (globalThis as { __aura3dInFlightByteFetches?: unknown }).__aura3dInFlightByteFetches;
  if (typeof inflight === "number" && inflight > 0) return false;
  return !hasVisibleLoadingOverlay();
}

/** Largest canvas big enough to be the world view, ignoring minimap/HUD/overlay canvases. */
export function findWorldCanvas(root: Pick<Document, "querySelectorAll"> | undefined = typeof document === "undefined" ? undefined : document): HTMLCanvasElement | null {
  if (!root || typeof root.querySelectorAll !== "function") return null;
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  for (const canvas of Array.from(root.querySelectorAll("canvas")) as HTMLCanvasElement[]) {
    const label = `${canvas.id ?? ""} ${canvas.className ?? ""}`;
    if (/minimap|mini-map|hud|overlay|compass|radar|(^|[\s_-])ui([\s_-]|$)/i.test(label)) continue;
    const a = canvas.width * canvas.height;
    if (canvas.width >= 128 && canvas.height >= 96 && a > area) {
      best = canvas;
      area = a;
    }
  }
  return best;
}

export interface WatchObservation {
  /** `sample()` calls so far (frames the app drew while the watch was installed). */
  readonly calls: number;
  /** Call index at which the app first counted as ready, or null while it is not. */
  readonly readyAtCall: number | null;
  readonly framesSinceReady: number;
  readonly samples: number;
  readonly blackSamples: number;
  readonly consecutiveBlack: number;
  /** True once lit frames were seen for long enough that the watch relaxed to occasional sampling. */
  readonly healthy: boolean;
  readonly lastStats: FrameStats | undefined;
  readonly medianFrameMs: number;
  /** How long the canvas has stayed black (ms), 0 when it is not. */
  readonly blackMs: number;
  readonly skipped: { readonly notReady: number; readonly noDrawCalls: number; readonly hidden: number };
  readonly escalated: boolean;
  /** Why the watch reloaded this page (set on escalation) or why the previous page did (from session storage). */
  readonly reason: string | undefined;
}

export interface BlackFrameWatchOptions {
  readonly enabled: boolean;
  readonly ladder?: readonly HealRung[];
  readonly storageKey?: string;
  /** Shortens every window (tests only): minimum frames after ready, no minimum black time, samples needed = half of it. */
  readonly fastFrames?: number;
  /** Reads a downscaled RGBA probe of the canvas. Defaults to a nearest-neighbour 2D canvas copy. */
  readonly readProbe?: (canvas: HTMLCanvasElement) => ArrayLike<number> | undefined;
  readonly storage?: StorageLike;
  readonly currentUrl?: () => string;
  /** Navigates to the next rung. Defaults to `location.replace`. */
  readonly navigate?: (url: string) => void;
  readonly log?: (code: string, message: string) => void;
  /** Extra readiness signal (for example the app's own `ready` flag). The default checks overlays, load state and fetches. */
  readonly isReady?: () => boolean;
  /** Engine draw calls for the current frame; when given and not > 0 the frame is not judged (nothing was drawn). */
  readonly getDrawCalls?: () => number | undefined;
  /** Builds the reload URL for rung `stage`, or null to stop. Default merges the rung parameters under the existing query. */
  readonly buildUrl?: (stage: number, currentUrl: string) => string | null;
  /** Clock in ms (tests). Defaults to `performance.now()`. */
  readonly now?: () => number;
  /** Treat the page as hidden (tests). Defaults to `document.hidden`. */
  readonly isHidden?: () => boolean;
  /** Minimum black duration in ms; the effective window is `max(minBlackMs, medianFrameMs * blackFramesBudget)`. Default 4000. */
  readonly minBlackMs?: number;
  /** Frames' worth of measured frame time black must persist for. Default 40. */
  readonly blackFramesBudget?: number;
  /** Rendered frames required after becoming ready before judging. Default 30. */
  readonly minFramesAfterReady?: number;
  /** Judge every Nth frame. Default 4. */
  readonly sampleEvery?: number;
  /** Consecutive black samples required. Default 12. */
  readonly samplesNeeded?: number;
}

export interface BlackFrameWatch {
  /**
   * Call right after a frame was drawn, in the same task (before the browser composites it). Pass the canvas that was just
   * drawn when it is known (the frame tap does); a number (a frame counter) is accepted and ignored for compatibility.
   */
  sample(drawn?: HTMLCanvasElement | number): void;
  readonly stage: number;
  readonly rung: string;
  /** True once the watch decided to reload one rung down. */
  readonly escalated: boolean;
  /** What the watch has seen so far (also why the previous page reloaded, if it did). */
  observation(): WatchObservation;
}

function defaultProbe(): (canvas: HTMLCanvasElement) => ArrayLike<number> | undefined {
  let ctx: CanvasRenderingContext2D | null | undefined;
  return (canvas) => {
    if (ctx === undefined) {
      const probe = document.createElement("canvas");
      probe.width = PROBE_WIDTH;
      probe.height = PROBE_HEIGHT;
      ctx = probe.getContext("2d", { willReadFrequently: true });
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    if (!ctx) return undefined;
    ctx.drawImage(canvas, 0, 0, PROBE_WIDTH, PROBE_HEIGHT);
    return ctx.getImageData(0, 0, PROBE_WIDTH, PROBE_HEIGHT).data;
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function createBlackFrameWatch(canvas: HTMLCanvasElement | (() => HTMLCanvasElement | null | undefined), options: BlackFrameWatchOptions): BlackFrameWatch {
  const ladder = options.ladder ?? DEFAULT_HEAL_LADDER;
  const storageKey = options.storageKey ?? DEFAULT_HEAL_STORAGE_KEY;
  const reasonKey = `${storageKey}:reason`;
  const storage = options.storage ?? safeStorage();
  const fast = options.fastFrames !== undefined;
  const minFramesAfterReady = options.minFramesAfterReady ?? options.fastFrames ?? 30;
  const sampleEvery = Math.max(1, options.sampleEvery ?? (fast ? 2 : 4));
  const samplesNeeded = Math.max(2, options.samplesNeeded ?? (fast ? Math.ceil(options.fastFrames! / 2) : 12));
  const minBlackMs = options.minBlackMs ?? (fast ? 0 : 4000);
  const blackFramesBudget = options.blackFramesBudget ?? (fast ? 0 : 40);
  const stage = healStage(storage, ladder, storageKey);
  const readProbe = options.readProbe ?? defaultProbe();
  const log = options.log ?? ((code, message) => console.warn(`${code}: ${message}`));
  const currentUrl = options.currentUrl ?? (() => location.href);
  const navigate = options.navigate ?? ((url: string) => location.replace(url));
  const now = options.now ?? (() => performance.now());
  const isHidden = options.isHidden ?? (() => typeof document !== "undefined" && (document.hidden === true || document.visibilityState === "hidden"));
  const appReady = options.isReady;
  const previousReason = (() => {
    try {
      return (storage as Storage | undefined)?.getItem(reasonKey) ?? undefined;
    } catch {
      return undefined;
    }
  })();

  let calls = 0;
  let readyAtCall: number | null = null;
  let samples = 0;
  let blackSamples = 0;
  let consecutive = 0;
  let litStreak = 0;
  let healthy = false;
  let blackSince = 0;
  let escalated = false;
  let lastStats: FrameStats | undefined;
  let lastTime: number | undefined;
  let reason: string | undefined = previousReason;
  const deltas: number[] = [];
  const skipped = { notReady: 0, noDrawCalls: 0, hidden: 0 };

  if (stage > 0) log("SAFETY_COMPAT_MODE", `rung ${stage} (${healRungName(stage, ladder)}) after a black frame was detected${previousReason ? `: ${previousReason}` : ""}`);

  const resetStreak = (): void => {
    consecutive = 0;
    blackSince = 0;
  };

  return {
    stage,
    rung: healRungName(stage, ladder),
    get escalated() {
      return escalated;
    },
    observation(): WatchObservation {
      const t = lastTime ?? 0;
      return {
        calls,
        readyAtCall,
        framesSinceReady: readyAtCall === null ? 0 : calls - readyAtCall + 1,
        samples,
        blackSamples,
        consecutiveBlack: consecutive,
        healthy,
        lastStats,
        medianFrameMs: median(deltas),
        blackMs: blackSince ? Math.max(0, t - blackSince) : 0,
        skipped: { ...skipped },
        escalated,
        reason
      };
    },
    sample(drawn?: HTMLCanvasElement | number): void {
      const t = now();
      if (lastTime !== undefined && t >= lastTime) {
        deltas.push(t - lastTime);
        if (deltas.length > 31) deltas.shift();
      }
      lastTime = t;
      calls += 1;
      if (!options.enabled || escalated) return;
      if (isHidden()) {
        skipped.hidden += 1;
        resetStreak();
        return;
      }
      let ready = (appReady ? appReady() : true) && defaultIsReady();
      if (!ready) {
        skipped.notReady += 1;
        readyAtCall = null;
        healthy = false;
        litStreak = 0;
        resetStreak();
        return;
      }
      if (readyAtCall === null) readyAtCall = calls;
      ready = true;
      const since = calls - readyAtCall + 1;
      const every = healthy ? sampleEvery * 8 : sampleEvery;
      if (since < minFramesAfterReady || since % every !== 0) return;
      const drawCalls = options.getDrawCalls?.();
      if (drawCalls !== undefined && !(drawCalls > 0)) {
        skipped.noDrawCalls += 1;
        resetStreak();
        return;
      }
      const target = drawn !== undefined && typeof drawn === "object" ? drawn : typeof canvas === "function" ? canvas() : canvas;
      if (!target) return;
      let stats: FrameStats;
      try {
        const data = readProbe(target);
        if (!data) return;
        stats = analyseFrame(data);
      } catch {
        return;
      }
      lastStats = stats;
      samples += 1;
      const black = stats.samples > 0 && stats.litFraction <= MAX_LIT_FRACTION;
      if (!black) {
        litStreak += 1;
        resetStreak();
        if (litStreak >= 3) healthy = true;
        return;
      }
      litStreak = 0;
      blackSamples += 1;
      consecutive += 1;
      if (blackSince === 0) blackSince = t;
      const medianFrameMs = median(deltas);
      const windowMs = Math.max(minBlackMs, medianFrameMs * blackFramesBudget);
      if (consecutive < samplesNeeded || t - blackSince < windowMs || stage >= ladder.length) return;
      escalated = true;
      reason = `black for ${consecutive} samples / ${Math.round(t - blackSince)} ms after ${since} ready frames (lit ${stats.lit}/${stats.samples}, max channel ${stats.max}, median frame ${Math.round(medianFrameMs)} ms, drawCalls ${drawCalls ?? "n/a"})`;
      const href = currentUrl();
      let next: string | null;
      if (options.buildUrl) {
        next = options.buildUrl(stage + 1, href);
      } else {
        const url = new URL(href);
        for (const [key, value] of Object.entries(healParams(stage + 1, ladder))) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
        next = url.toString();
      }
      if (!next) {
        escalated = false;
        return;
      }
      try {
        storage?.setItem(storageKey, String(stage + 1));
        storage?.setItem(reasonKey, reason);
      } catch {
        /* storage unavailable: the reload still happens, the rung just cannot continue */
      }
      log("SAFETY_BLACK_FRAME", `reloading at rung ${stage + 1} (${healRungName(stage + 1, ladder)}): ${reason}`);
      navigate(next);
    }
  };
}
