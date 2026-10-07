/**
 * §7.8/§6.6 overlay driver — drives C-05 `app.setOutputOverlay({ flash,
 * vignette, shape, fade })` and records the returned `reason` as the juice
 * backend (`"dom-fallback"` → `"dom"`, none → `"shader"`). With
 * `shell.overlay: "dom"` it bypasses C-05 and drives `.a3g-overlay` directly.
 *
 * Envelope: attack 0; `amount(t) = peak · exp(-5·t/ms)` for `t < ms`, then
 * exactly 0 (the idle path is reached and no overlay work remains).
 */
import type { JuiceOverlayDriver, Vec3Like } from "./Juice.js";

export interface OverlayApp {
  setOutputOverlay(overlay: {
    flash?: readonly [number, number, number, number];
    vignette?: readonly [number, number, number, number];
    shape?: readonly [number, number];
    fade?: readonly [number, number, number, number];
  }): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
}

export interface OverlayDriverDeps {
  readonly app?: OverlayApp;
  /** `shell.overlay: "dom"` — bypass C-05 and drive the DOM element. */
  readonly domElement?: HTMLElement | null;
  /** Injectable clock in seconds (default: performance.now()/1000). */
  readonly now?: () => number;
  /** Frame scheduler (default: requestAnimationFrame). Returns a cancel fn. */
  readonly schedule?: (cb: () => void) => () => void;
}

interface ChannelState {
  target: number;
  holdUntil: number;
  decayMs: number;
  start: number;
  peak: number;
  color: [number, number, number];
}

const IDLE = { applied: true } as const;

export function createOverlayDriver(deps: OverlayDriverDeps): JuiceOverlayDriver & { tick(): void } {
  const now = deps.now ?? (() => performance.now() / 1000);
  const schedule =
    deps.schedule ?? ((cb: () => void) => { const id = requestAnimationFrame(() => cb()); return () => cancelAnimationFrame(id); });

  let backend: "dom" | "shader" | "none" = deps.domElement !== undefined && deps.domElement !== null ? "dom" : "none";
  let active = false;
  let cancelFrame: (() => void) | null = null;
  const flash: ChannelState = { target: 0, holdUntil: 0, decayMs: 0, start: 0, peak: 0, color: [1, 1, 1] };
  const vignette: ChannelState = { target: 0, holdUntil: 0, decayMs: 0, start: 0, peak: 0, color: [0, 0, 0] };
  const fade: ChannelState = { target: 0, holdUntil: Infinity, decayMs: 0, start: 0, peak: 0, color: [0, 0, 0] };
  const fadeResolvers: (() => void)[] = [];

  function parseColor(color: string | undefined): [number, number, number] {
    if (!color) return [1, 1, 1];
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (!m) return [1, 1, 1];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /** Exponential decay to 0: peak·exp(-5·t/ms) for t<ms, exactly 0 at t>=ms. */
  function amountAt(ch: ChannelState, t: number): number {
    const dt = Math.max(0, (t - ch.start) * 1000);
    if (dt >= ch.decayMs) return 0;
    return ch.peak * Math.exp((-5 * dt) / ch.decayMs);
  }

  function begin(ch: ChannelState, peak: number, ms: number, color: string | undefined): void {
    ch.peak = peak;
    ch.decayMs = Math.max(1, ms);
    ch.start = now();
    ch.color = parseColor(color);
  }

  function write(): void {
    const t = now();
    const flashA = amountAt(flash, t);
    const vigA = amountAt(vignette, t);
    const fadeV = fade.target; // fades persist (hold), not decayed here
    const idle = flashA === 0 && vigA === 0 && fadeV === 0;

    if (deps.domElement) {
      const el = deps.domElement;
      el.style.background = flashA > 0
        ? `rgba(${Math.round(flash.color[0] * 255)},${Math.round(flash.color[1] * 255)},${Math.round(flash.color[2] * 255)},${flashA})`
        : "transparent";
      el.style.boxShadow = vigA > 0 ? `inset 0 0 ${Math.round(40 * vigA)}px rgba(${Math.round(vignette.color[0] * 255)},${Math.round(vignette.color[1] * 255)},${Math.round(vignette.color[2] * 255)},${vigA})` : "";
      backend = "dom";
    } else if (deps.app) {
      const r = deps.app.setOutputOverlay(
        idle
          ? {}
          : {
              ...(flashA > 0 ? { flash: [...flash.color, flashA] as const } : {}),
              ...(vigA > 0 ? { vignette: [...vignette.color, vigA] as const } : {}),
              ...(fadeV > 0 ? { fade: [...fade.color, fadeV] as const } : {})
            }
      );
      backend = r.reason === "dom-fallback" ? "dom" : r.applied || r.reason === undefined ? "shader" : "none";
    }
    // Decayed channels stop the pump; a held fade is static after its write.
    const decayed = flashA === 0 && vigA === 0;
    if (decayed) {
      active = false;
      cancelFrame?.();
      cancelFrame = null;
    }
    if (idle && fadeResolvers.length) {
      fadeResolvers.splice(0).forEach((r) => r());
    }
  }

  function pump(): void {
    if (!active) {
      active = true;
      const step = () => {
        if (!active) return;
        write();
        if (active) cancelFrame = schedule(step);
      };
      cancelFrame = schedule(step);
    }
  }

  return {
    get backend() {
      return backend;
    },
    tick: write,
    flash(color, peak, ms) {
      begin(flash, peak, ms, color);
      write();
      pump();
    },
    vignette(amount, ms, color) {
      begin(vignette, amount, ms, color);
      write();
      pump();
    },
    fade(to01, ms, color) {
      // Fade is a ramp to a held value, not a decay: drive it as one write and
      // resolve on the next frame.
      fade.target = to01;
      fade.color = parseColor(color);
      write();
      return new Promise<void>((r) => {
        fadeResolvers.push(r);
        if (to01 === 0) {
          fade.target = 0;
          write();
        } else {
          // Resolve after the requested duration even though the fade holds.
          const deadline = now() + ms / 1000;
          const step = () => {
            if (now() >= deadline) {
              const i = fadeResolvers.indexOf(r);
              if (i >= 0) fadeResolvers.splice(i, 1);
              r();
            } else schedule(step);
          };
          schedule(step);
        }
      });
    }
  };
}
