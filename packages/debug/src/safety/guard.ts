import { createBlackFrameWatch, findWorldCanvas, healRungName, type BlackFrameWatch, type HealRung, type WatchObservation } from "./blackFrame.js";

/**
 * Black-frame guard for pages that run on the engine's `a3d-qr` URL flag list (the showcase games). It installs once,
 * before the app starts drawing, wraps `requestAnimationFrame` so the world canvas is sampled right after each frame
 * callback (same task, before the browser composites), and reloads one rung down when the canvas stays black. It is a
 * thin shell around `createBlackFrameWatch`: readiness gating, black-versus-dark detection, once-per-load stepping and
 * the recorded reason all live there.
 *
 * `?heal=0` disables it; an `a3d-qr` supplied in the URL by the author or player is never rewritten.
 */
export const QR_HEAL_LADDER: ReadonlyArray<{ readonly name: string; readonly qr: string }> = [
  { name: "no-vfx-fog", qr: "-vfxFog" },
  { name: "no-post", qr: "-vfxFog,-post" },
  { name: "legacy-compile", qr: "-vfxFog,-post,-compiler" }
];

const QR_RUNGS: readonly HealRung[] = QR_HEAL_LADDER.map((rung) => ({ name: rung.name, params: { "a3d-qr": `game,${rung.qr}` } }));

/** Rung currently applied (0 = full quality) from the stored value. */
export function qrHealStage(raw: string | null | undefined): number {
  const n = Number(raw ?? "0");
  return Number.isInteger(n) && n >= 0 && n <= QR_HEAL_LADDER.length ? n : 0;
}

export const qrHealRungName = (stage: number): string => healRungName(stage, QR_RUNGS);

/**
 * URL for rung `stage`, or `null` when the ladder is exhausted or an author/player supplied their own `a3d-qr`.
 * `ownsQr` is true when the `a3d-qr` already in the URL was written by an earlier rung of this guard.
 */
export function qrHealUrl(href: string, stage: number, ownsQr = false): string | null {
  if (stage < 1 || stage > QR_HEAL_LADDER.length) return null;
  const url = new URL(href);
  if (url.searchParams.has("a3d-qr") && !ownsQr) return null;
  url.searchParams.set("a3d-qr", `game,${QR_HEAL_LADDER[stage - 1]!.qr}`);
  return url.toString();
}

export interface HealGlobal {
  rung: number;
  name: string;
  enabled: boolean;
  /** Live view of what the watch has seen (frames, samples, last probe stats, skips) and why a reload happened. */
  observation?: () => WatchObservation;
}

declare global {
  interface Window {
    __AURA3D_HEAL__?: HealGlobal;
  }
}

export interface BlackFrameGuardOptions {
  /** Defaults to true unless the URL has `heal=0`. */
  readonly enabled?: boolean;
  /** Tests only: shorter detection window. */
  readonly fast?: boolean;
  /** Extra readiness signal, for example the app's own `ready` flag. Combined with the built-in overlay/load/fetch checks. */
  readonly isReady?: () => boolean;
  /** Engine draw calls for the current frame; when given and not > 0 the frame is not judged. */
  readonly getDrawCalls?: () => number | undefined;
  /** Which canvas to judge. Defaults to the largest non-HUD canvas on the page. */
  readonly canvas?: () => HTMLCanvasElement | null | undefined;
  /** Test hooks forwarded to the watch (clock, probe, storage, navigation, logging). */
  readonly watch?: Partial<Pick<Parameters<typeof createBlackFrameWatch>[1], "now" | "readProbe" | "storage" | "navigate" | "log" | "isHidden" | "currentUrl" | "minBlackMs" | "blackFramesBudget" | "minFramesAfterReady" | "sampleEvery" | "samplesNeeded">>;
}

/** Returns the watch (or undefined when disabled/unavailable) so callers and tests can read its observation. */
export function installBlackFrameGuard(options: BlackFrameGuardOptions = {}): BlackFrameWatch | undefined {
  if (typeof window === "undefined" || (window as { __AURA3D_HEAL_INSTALLED__?: boolean }).__AURA3D_HEAL_INSTALLED__) return undefined;
  (window as { __AURA3D_HEAL_INSTALLED__?: boolean }).__AURA3D_HEAL_INSTALLED__ = true;
  const params = new URLSearchParams(location.search);
  const enabled = options.enabled ?? params.get("heal") !== "0";
  const key = `aura3d-heal:${location.pathname}`;
  const watch = createBlackFrameWatch(options.canvas ?? (() => findWorldCanvas()), {
    enabled,
    ladder: QR_RUNGS,
    storageKey: key,
    ...(options.fast ? { fastFrames: 6 } : {}),
    ...(options.isReady ? { isReady: options.isReady } : {}),
    ...(options.getDrawCalls ? { getDrawCalls: options.getDrawCalls } : {}),
    buildUrl: (next, href) => qrHealUrl(href, next, next > 1),
    ...(options.watch ?? {})
  });
  window.__AURA3D_HEAL__ = { rung: watch.stage, name: qrHealRungName(watch.stage), enabled, observation: () => watch.observation() };
  if (!enabled) return watch;
  const originalRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
    originalRaf((time) => {
      callback(time);
      watch.sample();
    });
  return watch;
}
