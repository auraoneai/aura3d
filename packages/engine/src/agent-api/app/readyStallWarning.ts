/**
 * Non-fatal diagnostic for an `app.ready()` that never settles.
 *
 * The usual cause is a module-level `await app.ready()` (or any top-level await on an engine
 * promise) in the entry module. Under Vite's default chunk splitting a lazily loaded engine chunk
 * imports the entry chunk back; an entry suspended on top-level await never finishes evaluating,
 * so that chunk never loads, the mount never settles and the page stays black with no error.
 *
 * This watcher only logs: it never rejects, resolves or delays the promise it observes.
 */

export const AURA_READY_STALLED = "AURA_READY_STALLED";
export const READY_STALL_WARNING_MS = 10_000;

export const READY_STALL_MESSAGE =
  `[aura3d] ${AURA_READY_STALLED}: app.ready() is still pending after ${READY_STALL_WARNING_MS / 1000} s on a visible page. ` +
  "The usual cause is a top-level `await app.ready()` (or another top-level await on an engine promise) in the entry module: " +
  "with Vite's default chunk splitting a lazily loaded engine chunk imports the entry chunk back, so the entry never finishes " +
  "evaluating and the renderer never mounts (black page). Fix: do not await engine work at module top level; use " +
  "`void app.ready().then(() => { ... })` instead.";

export interface ReadyStallEnvironment {
  readonly setTimeout?: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
  /** True when the page is visible (or there is no page). Hidden tabs throttle work; they re-arm instead of logging. */
  readonly isVisible?: () => boolean;
  readonly report?: (message: string) => void;
}

let reportedGlobally = false;

/** Test seam: forget that a stall was already reported in this realm. */
export function resetReadyStallWarningForTests(): void {
  reportedGlobally = false;
}

function defaultIsVisible(): boolean {
  const doc = (globalThis as { document?: { visibilityState?: string } }).document;
  return !doc || doc.visibilityState === undefined || doc.visibilityState === "visible";
}

function defaultReport(message: string): void {
  if (typeof console !== "undefined") console.error(message);
}

/**
 * Observe `pending`; if it is still unsettled after {@link READY_STALL_WARNING_MS} while the page is
 * visible, report {@link READY_STALL_MESSAGE} once per realm. Returns `pending` itself unchanged.
 */
export function watchReadyStall<T>(pending: Promise<T>, environment: ReadyStallEnvironment = {}): Promise<T> {
  if (reportedGlobally) return pending;
  const schedule = environment.setTimeout ?? (typeof setTimeout === "function" ? (callback: () => void, ms: number) => setTimeout(callback, ms) : undefined);
  if (!schedule) return pending;
  const cancel = environment.clearTimeout ?? ((handle: unknown) => { if (typeof clearTimeout === "function") clearTimeout(handle as ReturnType<typeof setTimeout>); });
  const isVisible = environment.isVisible ?? defaultIsVisible;
  const report = environment.report ?? defaultReport;
  let settled = false;
  let handle: unknown;
  const arm = (): void => {
    handle = schedule(() => {
      handle = undefined;
      if (settled || reportedGlobally) return;
      // A hidden tab may legitimately stall (rAF and timers are throttled): wait for another full visible interval.
      if (!isVisible()) { arm(); return; }
      reportedGlobally = true;
      report(READY_STALL_MESSAGE);
    }, READY_STALL_WARNING_MS);
    // Never keep a Node/test process alive for a diagnostic.
    (handle as { unref?: () => void } | undefined)?.unref?.();
  };
  const done = (): void => {
    settled = true;
    if (handle !== undefined) cancel(handle);
    handle = undefined;
  };
  pending.then(done, done);
  arm();
  return pending;
}
