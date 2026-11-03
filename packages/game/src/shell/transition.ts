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

export interface TransitionWaitOptions {
  readonly signal?: AbortSignal;
}

export interface TransitionDriver {
  /** Opacity 0..1; drivers apply transition timing to the DOM node. */
  setOverlay(opacity: number, ms: number, color?: string): void;
  /** Resolves when the runtime presents the next frame. */
  firstPresentedFrame(options?: TransitionWaitOptions): Promise<void>;
  sleep(ms: number, options?: TransitionWaitOptions): Promise<void>;
}

function sleepWithCancellation(ms: number, options?: TransitionWaitOptions): Promise<void> {
  const signal = options?.signal;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Transition wait cancelled", "AbortError"));
      return;
    }
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Transition wait cancelled", "AbortError"));
    };
    try {
      signal?.addEventListener("abort", abort, { once: true });
    } catch (error) {
      clearTimeout(timer);
      settled = true;
      reject(error);
      return;
    }
    // An AbortSignal can be aborted by a reentrant listener while it is being
    // registered; do not leave its timer behind in that case.
    if (signal?.aborted) abort();
  });
}

/** rAF-timed driver over the overlay element's `opacity` style. */
export function domTransitionDriver(
  overlay: HudElement,
  deps: {
    firstPresentedFrame(options?: TransitionWaitOptions): Promise<void>;
    sleep?(ms: number, options?: TransitionWaitOptions): Promise<void>;
  }
): TransitionDriver {
  return {
    setOverlay(opacity, ms, color) {
      // ms 0 must cancel a running fade: a 0 ms duration with the same end
      // value leaves the running CSS transition untouched (CSS Transitions
      // §3), while `none` cancels it and applies the value at once.
      overlay.style.transition = ms > 0 ? `opacity ${ms}ms linear` : "none";
      overlay.style.opacity = String(opacity);
      if (color) overlay.style.background = color;
      overlay.classList.toggle("a3g-overlay-opaque", opacity > 0);
    },
    firstPresentedFrame: deps.firstPresentedFrame,
    sleep: deps.sleep ?? sleepWithCancellation
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
  let overlayArmed = false;
  try {
    // Mark ownership before calling the driver: a throwing driver can have
    // already changed part of the overlay state.
    overlayArmed = true;
    driver.setOverlay(1, outMs, spec?.color);
    await driver.sleep(outMs);
    // The CSS fade can lag its timer on a loaded main thread. Snap to fully
    // opaque before the swap so the remount gap is never visible.
    driver.setOverlay(1, 0, spec?.color);
    // Let the snapped overlay cover an old-scene frame before the swap.
    await driver.sleep(0);
    const result = await run();
    // Cancel whichever wait loses the race. A runtime that supports the
    // optional signal releases its waiter; the DOM driver clears its timer.
    const controller = new AbortController();
    let presented: "presented" | "timeout";
    try {
      presented = await Promise.race([
        Promise.resolve().then(() => driver.firstPresentedFrame({ signal: controller.signal })).then(() => "presented" as const),
        Promise.resolve().then(() => driver.sleep(FIRST_PRESENTED_TIMEOUT_MS, { signal: controller.signal })).then(() => "timeout" as const)
      ]);
    } finally {
      controller.abort();
    }
    if (presented === "timeout") {
      throw new Error(
        `A3D_TRANSITION_NO_PRESENTED_FRAME: firstPresentedFrame() did not resolve within ${FIRST_PRESENTED_TIMEOUT_MS}ms; overlay released.`
      );
    }
    driver.setOverlay(0, inMs);
    await driver.sleep(inMs);
    overlayArmed = false;
    return result;
  } catch (error) {
    if (overlayArmed) {
      try {
        // Cancel a running CSS transition as well as making the overlay clear.
        driver.setOverlay(0, 0);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Transition failed and the overlay could not be released.", { cause: error });
      }
    }
    throw error;
  }
}
