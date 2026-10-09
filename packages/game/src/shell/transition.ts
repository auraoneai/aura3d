/**
 * §6.2 transition: fade the DOM overlay to opaque → run `fn` (usually
 * `app.setScene`) → await the runtime's first presented frame → fade back in.
 * No GPU readback; the overlay element is opaque for the whole remount gap, so
 * no frame is ever presented while it is transparent between setScene and the
 * first new frame (browser-tested by transition.spec.ts).
 */
import type { HudElement } from "../hud/dom.js";

export interface TransitionSpec {
  readonly kind: "fade" | "cut" | "wipe";
  readonly ms?: number;
  readonly color?: string;
}

export interface TransitionDriver {
  /** Opacity 0..1; drivers apply transition timing to the DOM node. */
  setOverlay(opacity: number, ms: number, color?: string): void;
  /** Resolves when the runtime presents the next frame. */
  firstPresentedFrame(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

/** rAF-timed driver over the overlay element's `opacity` style. */
export function domTransitionDriver(
  overlay: HudElement,
  deps: {
    firstPresentedFrame(): Promise<void>;
    sleep?(ms: number): Promise<void>;
  }
): TransitionDriver {
  return {
    setOverlay(opacity, ms, color) {
      overlay.style.transition = `opacity ${ms}ms linear`;
      overlay.style.opacity = String(opacity);
      if (color) overlay.style.background = color;
      overlay.classList.toggle("a3g-overlay-opaque", opacity > 0);
    },
    firstPresentedFrame: deps.firstPresentedFrame,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  };
}

const FIRST_PRESENTED_TIMEOUT_MS = 2000;

export async function runTransition<T>(
  driver: TransitionDriver,
  run: () => T | Promise<T>,
  spec?: TransitionSpec
): Promise<T> {
  const kind = spec?.kind ?? "fade";
  if (kind === "cut") return run();
  const outMs = spec?.ms ?? 180;
  const inMs = Math.round(outMs * 1.22); // §6.2 default 180 out / 220 in
  driver.setOverlay(1, outMs, spec?.color);
  await driver.sleep(outMs);
  const result = await run();
  // firstPresentedFrame only resolves for `frame.source === "raf"` frames —
  // under a stepper/offscreen present it would hang forever with the overlay
  // opaque. Bound the wait, then fail visibly with the overlay released.
  const presented = await Promise.race([
    driver.firstPresentedFrame().then(() => "presented" as const),
    driver.sleep(FIRST_PRESENTED_TIMEOUT_MS).then(() => "timeout" as const)
  ]);
  if (presented === "timeout") {
    driver.setOverlay(0, inMs);
    throw new Error(
      `A3D_TRANSITION_NO_PRESENTED_FRAME: firstPresentedFrame() did not resolve within ${FIRST_PRESENTED_TIMEOUT_MS}ms; overlay released.`
    );
  }
  driver.setOverlay(0, inMs);
  await driver.sleep(inMs);
  return result;
}
