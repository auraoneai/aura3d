/**
 * `feel/ScreenOverlay.ts` — DOM fallback for the screen-feel channel (§8.3).
 *
 * Opt-in via `createAuraApp({ feel: { screenFallback: "dom" } })`: a fixed,
 * pointer-events-none overlay draws `flash` (white fill at `flash` opacity)
 * and `vignette` (radial-gradient edge darkening) so those two parts produce
 * pixels on hosts with no C-13 post consumer. `chroma` and `radialBlur` count
 * 0 until a C-13 consumer exists — the overlay honestly never draws them.
 */
import type { AuraScreenFeelUniforms } from "../../contracts/time.js";

export interface AuraScreenOverlay {
  /** Apply the current uniforms; returns true when pixels were drawn. */
  apply(u: AuraScreenFeelUniforms): boolean;
  dispose(): void;
}

interface OverlayDocument {
  createElement(tag: string): {
    style: Record<string, string>;
  };
  body?: { appendChild(el: unknown): void; removeChild(el: unknown): void };
}

const FLASH_COLOR = "255,255,255";

export function createScreenOverlay(doc?: OverlayDocument): AuraScreenOverlay {
  const d = doc ?? (typeof document !== "undefined" ? (document as unknown as OverlayDocument) : undefined);
  let el: { style: Record<string, string> } | null = null;
  let vignetteEl: { style: Record<string, string> } | null = null;

  if (d?.body) {
    const base: Record<string, string> = {
      position: "fixed",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "2147483000",
      opacity: "0"
    };
    el = d.createElement("div");
    Object.assign(el.style, base);
    el.style.background = `rgb(${FLASH_COLOR})`;
    vignetteEl = d.createElement("div");
    Object.assign(vignetteEl.style, base);
    vignetteEl.style.background = "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,1) 100%)";
    d.body.appendChild(el);
    d.body.appendChild(vignetteEl);
  }

  return {
    apply(u) {
      if (!el || !vignetteEl) return false;
      el.style.opacity = String(Math.min(1, Math.max(0, u.flash)));
      vignetteEl.style.opacity = String(Math.min(1, Math.max(0, u.vignette)));
      return u.flash > 0 || u.vignette > 0;
    },
    dispose() {
      if (d?.body) {
        if (el) d.body.removeChild(el);
        if (vignetteEl) d.body.removeChild(vignetteEl);
      }
      el = null;
      vignetteEl = null;
    }
  };
}
