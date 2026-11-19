/**
 * Venue / fighter swaps without a black screen (real-GPU QA: 0.3 s black on Quick Bout, 0.5-2.5 s on a venue switch,
 * and a PRD07_DEVICE_LEASE_BUSY page error during the switch).
 *
 * `setScene` disposes the render device and remounts, so the old venue cannot keep drawing on the same canvas while the
 * new one loads. Instead the last presented frame of the old venue is frozen in an image over the canvas, the new venue
 * mounts and warms underneath (programs, HDRI, texture upgrades), and only then does the freeze fade out — the player
 * never sees a frame with zero draws.
 *
 * The page error: warmPrograms renders explicit frames (`app.step`) while the app's own loop may still have a frame in
 * flight on the same device; the second submit throws PRD07_DEVICE_LEASE_BUSY ("async frame is pending" on the async
 * path). The automatic loop is paused for the warm, and an explicit warm frame that still meets a busy device is skipped
 * (the frame loop retries busy frames the same way) instead of rejecting the bout.
 */
import type { WarmableApp } from "@aura3d/engine/game";

/** A frame submission that collided with a frame still in flight on the same device (retryable, not a failure). */
export function isFrameBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("PRD07_DEVICE_LEASE_BUSY") || message.includes("async frame is pending");
}

export interface LeaseSafeApp {
  step(dt?: number): unknown;
  precompile?(): Promise<unknown>;
  diagnostics?(): unknown;
}

/** The app as warmPrograms sees it, with explicit warm frames that skip (not throw) on a busy device. */
export function leaseSafeWarmApp(app: LeaseSafeApp, onBusy?: () => void): WarmableApp {
  return {
    step(dt?: number) {
      try {
        return app.step(dt);
      } catch (error) {
        if (!isFrameBusyError(error)) throw error;
        onBusy?.();
        return undefined;
      }
    },
    ...(typeof app.precompile === "function" ? { precompile: () => app.precompile!() } : {}),
    ...(typeof app.diagnostics === "function" ? { diagnostics: () => app.diagnostics!() as ReturnType<NonNullable<WarmableApp["diagnostics"]>> } : {})
  };
}

export interface VenueSwapSteps {
  /** Data URL of the frame on screen now (undefined: nothing worth freezing, e.g. the first mount). */
  capture(): string | undefined;
  showFreeze(dataUrl: string): void;
  hideFreeze(): void;
  /** Stop / restart the app's automatic frame loop around the warm. */
  pauseLoop(): void;
  resumeLoop(): void;
  setScene(): Promise<void>;
  /** Settle programs and textures of the mounted scene (warmPrograms on leaseSafeWarmApp). */
  warm(): Promise<unknown>;
}

/** Freeze the old venue, mount and warm the new one under it, then reveal it. */
export async function swapVenue(steps: VenueSwapSteps): Promise<{ readonly froze: boolean }> {
  let url: string | undefined;
  try {
    url = steps.capture();
  } catch {
    // The freeze is cosmetic: a capture that fails (busy device, lost context) just swaps without it.
    url = undefined;
  }
  if (url) steps.showFreeze(url);
  try {
    await steps.setScene();
    steps.pauseLoop();
    try {
      await steps.warm();
    } finally {
      steps.resumeLoop();
    }
  } finally {
    if (url) steps.hideFreeze();
  }
  return { froze: Boolean(url) };
}

/** Freeze-frame overlay: an image pinned over the canvas, under the HUD; fades out when the new venue is warm. */
export function createFreezeFrame(canvas: HTMLCanvasElement | undefined, fadeMs = 180) {
  let img: HTMLImageElement | undefined;
  return {
    show(dataUrl: string) {
      const host = canvas?.parentElement;
      if (!canvas || !host || typeof document === "undefined") return;
      img?.remove();
      img = document.createElement("img");
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.className = "ic-venue-freeze";
      img.src = dataUrl;
      const r = canvas.getBoundingClientRect(), hr = host.getBoundingClientRect();
      Object.assign(img.style, {
        position: "absolute", left: `${r.left - hr.left}px`, top: `${r.top - hr.top}px`, width: `${r.width}px`, height: `${r.height}px`,
        pointerEvents: "none", zIndex: "1", opacity: "1", transition: `opacity ${fadeMs}ms ease-out`
      });
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      canvas.insertAdjacentElement("afterend", img);
    },
    hide() {
      const el = img;
      img = undefined;
      if (!el) return;
      el.style.opacity = "0";
      setTimeout(() => el.remove(), fadeMs + 40);
    }
  };
}
