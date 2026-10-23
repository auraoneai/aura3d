/**
 * Generic black-frame self-heal for showcase games. Some GPU/driver combinations present an entirely black canvas while
 * the engine reports draw calls. Instead of shipping every game with the optional stages (post, VFX fog, the compiler
 * lane) switched off for everyone, games run at full engine defaults and this guard steps down only when a frame
 * actually stays black: it reloads the page one rung down a ladder expressed in the engine's own highest-precedence
 * `a3d-qr` URL flag list, and `?diag=1` shows the rung through `window.__AURA3D_HEAL__`.
 *
 * `?heal=0` disables it; an explicit `a3d-qr` in the URL is always respected (the guard never rewrites it).
 */
export const HEAL_LADDER: ReadonlyArray<{ readonly name: string; readonly qr: string }> = [
  { name: "no-vfx-fog", qr: "-vfxFog" },
  { name: "no-post", qr: "-vfxFog,-post" },
  { name: "legacy-compile", qr: "-vfxFog,-post,-compiler" }
];

const BLACK_MAX_CHANNEL = 4;
const MIN_FRAMES = 40;
const MIN_BLACK_SAMPLES = 40;
const MIN_BLACK_MS = 4000;

/** Rung currently applied (0 = full quality). */
export function healStage(raw: string | null | undefined): number {
  const n = Number(raw ?? "0");
  return Number.isInteger(n) && n >= 0 && n <= HEAL_LADDER.length ? n : 0;
}

export const healRungName = (stage: number): string => (stage <= 0 ? "full" : HEAL_LADDER[Math.min(stage, HEAL_LADDER.length) - 1]!.name);

/** True when every sampled texel of a downscaled RGBA frame is (almost) black. */
export function isBlackFrame(rgba: ArrayLike<number>): boolean {
  if (rgba.length < 4) return false;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i]! > BLACK_MAX_CHANNEL || rgba[i + 1]! > BLACK_MAX_CHANNEL || rgba[i + 2]! > BLACK_MAX_CHANNEL) return false;
  }
  return true;
}

/**
 * URL for rung `stage`, or `null` when the ladder is exhausted or an author/user supplied their own `a3d-qr`.
 * `ownsQr` is true when the `a3d-qr` already in the URL was written by an earlier rung of this guard.
 */
export function healUrl(href: string, stage: number, ownsQr = false): string | null {
  if (stage < 1 || stage > HEAL_LADDER.length) return null;
  const url = new URL(href);
  if (url.searchParams.has("a3d-qr") && !ownsQr) return null;
  url.searchParams.set("a3d-qr", `game,${HEAL_LADDER[stage - 1]!.qr}`);
  return url.toString();
}

declare global {
  interface Window {
    __AURA3D_HEAL__?: { rung: number; name: string; enabled: boolean };
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

/** The largest canvas on the page that is big enough to be the world view. */
function worldCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  for (const canvas of Array.from(document.querySelectorAll("canvas"))) {
    const a = canvas.width * canvas.height;
    if (canvas.width >= 128 && canvas.height >= 96 && a > area) { best = canvas; area = a; }
  }
  return best;
}

export interface BlackFrameGuardOptions {
  /** Defaults to true unless the URL has `heal=0`. */
  readonly enabled?: boolean;
  /** Tests only: shorter detection window. */
  readonly fast?: boolean;
}

/**
 * Install once, before the app starts drawing. It samples the world canvas right after each animation-frame callback
 * (in the same task, before the browser composites) and reloads one rung down when the canvas stays black.
 */
export function installBlackFrameGuard(options: BlackFrameGuardOptions = {}): void {
  if (typeof window === "undefined" || (window as { __AURA3D_HEAL_INSTALLED__?: boolean }).__AURA3D_HEAL_INSTALLED__) return;
  (window as { __AURA3D_HEAL_INSTALLED__?: boolean }).__AURA3D_HEAL_INSTALLED__ = true;
  const params = new URLSearchParams(location.search);
  const enabled = options.enabled ?? params.get("heal") !== "0";
  const storage = safeStorage();
  const key = `aura3d-heal:${location.pathname}`;
  const stage = healStage(storage?.getItem(key));
  window.__AURA3D_HEAL__ = { rung: stage, name: healRungName(stage), enabled };
  if (stage > 0) console.warn(`AURA3D_COMPAT_MODE: rung ${stage} (${healRungName(stage)}) after a black frame was detected`);
  if (!enabled) return;

  const minFrames = options.fast ? 6 : MIN_FRAMES;
  const minSamples = options.fast ? 4 : MIN_BLACK_SAMPLES;
  const minMs = options.fast ? 400 : MIN_BLACK_MS;
  const probe = document.createElement("canvas");
  probe.width = 16;
  probe.height = 16;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  let frames = 0;
  let consecutive = 0;
  let blackSince = 0;
  let escalated = false;
  const originalRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    originalRaf((time) => {
      callback(time);
      frames += 1;
      if (escalated || document.hidden || frames < minFrames || frames % 2 !== 0) return;
      const canvas = worldCanvas();
      if (!canvas) return;
      let black: boolean;
      try {
        ctx.drawImage(canvas, 0, 0, 16, 16);
        black = isBlackFrame(ctx.getImageData(0, 0, 16, 16).data);
      } catch {
        return;
      }
      if (!black) { consecutive = 0; blackSince = 0; return; }
      consecutive += 1;
      blackSince = blackSince || performance.now();
      if (consecutive < minSamples || performance.now() - blackSince < minMs || stage >= HEAL_LADDER.length) return;
      const next = healUrl(location.href, stage + 1, stage > 0);
      if (!next) return;
      escalated = true;
      storage?.setItem(key, String(stage + 1));
      console.warn(`AURA3D_BLACK_FRAME: reloading at rung ${stage + 1} (${healRungName(stage + 1)})`);
      location.replace(next);
    });
}
