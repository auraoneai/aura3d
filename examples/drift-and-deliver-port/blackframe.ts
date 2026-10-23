/**
 * Black-frame self-heal. Some GPU/driver combinations render a frame that is entirely black while the engine reports
 * draw calls. When that persists the page reloads itself one rung down a compatibility ladder (each rung switches off
 * one more optional stage) and records the rung, so a player still gets a picture and `?diag=1` shows which rung fixed it.
 * `?heal=0` disables it.
 */
const LADDER: ReadonlyArray<{ readonly name: string; readonly params: Readonly<Record<string, string>> }> = [
  { name: "no-aa", params: { aa: "0" } },
  { name: "no-post", params: { post: "0" } },
  { name: "aces-tone", params: { tm: "aces" } },
  { name: "no-env", params: { env: "0" } },
  { name: "no-shadow", params: { shadow: "0" } },
  { name: "low-quality", params: { quality: "low", sky: "1" } }
];

const STORAGE_KEY = "drift-heal-stage";
const BLACK_FRAMES_NEEDED = 45;
const BLACK_MAX_CHANNEL = 4;

/** Current rung (0 = full quality), taken from session storage so a reload continues down the ladder. */
export function healStage(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): number {
  const raw = Number(storage?.getItem(STORAGE_KEY) ?? "0");
  return Number.isInteger(raw) && raw >= 0 && raw <= LADDER.length ? raw : 0;
}

/** Query parameters implied by rung `stage` (cumulative), merged under the author's explicit parameters. */
export function healParams(stage: number): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const rung of LADDER.slice(0, stage)) Object.assign(merged, rung.params);
  return merged;
}

export const healRungName = (stage: number): string => (stage <= 0 ? "full" : LADDER[Math.min(stage, LADDER.length) - 1]!.name);

/** True when every sampled texel of a downscaled frame is (almost) black. */
export function isBlackFrame(rgba: ArrayLike<number>): boolean {
  if (rgba.length < 4) return false;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i]! > BLACK_MAX_CHANNEL || rgba[i + 1]! > BLACK_MAX_CHANNEL || rgba[i + 2]! > BLACK_MAX_CHANNEL) return false;
  }
  return true;
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export interface BlackFrameWatch {
  /** Call right after a frame was drawn, in the same task (before the browser composites it). */
  sample(framesDrawn: number): void;
  readonly stage: number;
}

/** `fastFrames` shortens the detection window (tests only); production uses 20 frames then 23 consecutive black samples. */
export function createBlackFrameWatch(canvas: HTMLCanvasElement, options: { enabled: boolean; fastFrames?: number }): BlackFrameWatch {
  const minFrames = options.fastFrames ?? 20;
  const samplesNeeded = Math.max(2, Math.ceil((options.fastFrames ?? BLACK_FRAMES_NEEDED) / 2));
  const storage = safeStorage();
  const stage = healStage(storage);
  const probe = document.createElement("canvas");
  probe.width = 16;
  probe.height = 16;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  let consecutive = 0;
  let escalated = false;
  if (stage > 0) console.warn(`DRIFT_COMPAT_MODE: rung ${stage} (${healRungName(stage)}) after a black frame was detected`);
  return {
    stage,
    sample(framesDrawn: number): void {
      if (!options.enabled || escalated || !ctx || framesDrawn < minFrames || framesDrawn % 2 !== 0) return;
      let black: boolean;
      try {
        ctx.drawImage(canvas, 0, 0, 16, 16);
        black = isBlackFrame(ctx.getImageData(0, 0, 16, 16).data);
      } catch {
        return;
      }
      consecutive = black ? consecutive + 1 : 0;
      if (consecutive < samplesNeeded || stage >= LADDER.length) return;
      escalated = true;
      storage?.setItem(STORAGE_KEY, String(stage + 1));
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(healParams(stage + 1))) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
      console.warn(`DRIFT_BLACK_FRAME: reloading at rung ${stage + 1} (${healRungName(stage + 1)})`);
      location.replace(url.toString());
    }
  };
}
