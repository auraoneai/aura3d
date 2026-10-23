/**
 * Black-frame self-heal. Some GPU/driver combinations present a frame that is entirely black while the engine reports
 * draw calls. When that persists the page reloads itself one rung down a compatibility ladder (each rung switches off
 * one more optional stage) and records the rung, so a player still gets a picture and the diagnostics panel shows which
 * rung fixed it. Opt-in only: nothing here runs unless `installSafetyNet` (or `createBlackFrameWatch`) is called.
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
const DEFAULT_FRAMES_NEEDED = 45;
const BLACK_MAX_CHANNEL = 4;
const PROBE_SIZE = 16;

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

/** True when every sampled texel of a downscaled frame is (almost) black. */
export function isBlackFrame(rgba: ArrayLike<number>): boolean {
  if (rgba.length < 4) return false;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    if (rgba[i]! > BLACK_MAX_CHANNEL || rgba[i + 1]! > BLACK_MAX_CHANNEL || rgba[i + 2]! > BLACK_MAX_CHANNEL) return false;
  }
  return true;
}

export interface BlackFrameWatchOptions {
  readonly enabled: boolean;
  readonly ladder?: readonly HealRung[];
  readonly storageKey?: string;
  /** Shortens the detection window (tests only); production uses 20 frames then 23 consecutive black samples. */
  readonly fastFrames?: number;
  /** Reads a downscaled RGBA probe of the canvas. Defaults to a 16x16 2D canvas copy. */
  readonly readProbe?: (canvas: HTMLCanvasElement) => ArrayLike<number> | undefined;
  readonly storage?: StorageLike;
  readonly currentUrl?: () => string;
  /** Navigates to the next rung. Defaults to `location.replace`. */
  readonly navigate?: (url: string) => void;
  readonly log?: (code: string, message: string) => void;
}

export interface BlackFrameWatch {
  /** Call right after a frame was drawn, in the same task (before the browser composites it). */
  sample(framesDrawn: number): void;
  readonly stage: number;
  readonly rung: string;
  /** True once the watch decided to reload one rung down. */
  readonly escalated: boolean;
}

function defaultProbe(): (canvas: HTMLCanvasElement) => ArrayLike<number> | undefined {
  let ctx: CanvasRenderingContext2D | null | undefined;
  return (canvas) => {
    if (ctx === undefined) {
      const probe = document.createElement("canvas");
      probe.width = PROBE_SIZE;
      probe.height = PROBE_SIZE;
      ctx = probe.getContext("2d", { willReadFrequently: true });
    }
    if (!ctx) return undefined;
    ctx.drawImage(canvas, 0, 0, PROBE_SIZE, PROBE_SIZE);
    return ctx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;
  };
}

export function createBlackFrameWatch(canvas: HTMLCanvasElement, options: BlackFrameWatchOptions): BlackFrameWatch {
  const ladder = options.ladder ?? DEFAULT_HEAL_LADDER;
  const storageKey = options.storageKey ?? DEFAULT_HEAL_STORAGE_KEY;
  const storage = options.storage ?? safeStorage();
  const minFrames = options.fastFrames ?? 20;
  const samplesNeeded = Math.max(2, Math.ceil((options.fastFrames ?? DEFAULT_FRAMES_NEEDED) / 2));
  const stage = healStage(storage, ladder, storageKey);
  const readProbe = options.readProbe ?? defaultProbe();
  const log = options.log ?? ((code, message) => console.warn(`${code}: ${message}`));
  const currentUrl = options.currentUrl ?? (() => location.href);
  const navigate = options.navigate ?? ((url: string) => location.replace(url));
  let consecutive = 0;
  let escalated = false;
  if (stage > 0) log("SAFETY_COMPAT_MODE", `rung ${stage} (${healRungName(stage, ladder)}) after a black frame was detected`);
  return {
    stage,
    rung: healRungName(stage, ladder),
    get escalated() {
      return escalated;
    },
    sample(framesDrawn: number): void {
      if (!options.enabled || escalated || framesDrawn < minFrames || framesDrawn % 2 !== 0) return;
      let black: boolean;
      try {
        const data = readProbe(canvas);
        if (!data) return;
        black = isBlackFrame(data);
      } catch {
        return;
      }
      consecutive = black ? consecutive + 1 : 0;
      if (consecutive < samplesNeeded || stage >= ladder.length) return;
      escalated = true;
      storage?.setItem(storageKey, String(stage + 1));
      const url = new URL(currentUrl());
      for (const [key, value] of Object.entries(healParams(stage + 1, ladder))) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      log("SAFETY_BLACK_FRAME", `reloading at rung ${stage + 1} (${healRungName(stage + 1, ladder)})`);
      navigate(url.toString());
    }
  };
}
