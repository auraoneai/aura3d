/**
 * session/presented.ts — T0-30 (#54): the C-24 readiness gate.
 *
 * `game.ready()` may only let the session reach `playing` after the driver
 * presented a frame that actually drew (`diagnostics().drawCalls > 0`) — never
 * on `app.ready()` alone. The first presented frame can still be blank while a
 * renderer mounts or the scene streams in, so the gate re-arms the
 * `firstPresentedFrame()` waiter until a presented frame reports drawCalls > 0.
 * When nothing ever presents, this stays pending: the beacon keeps reporting
 * the pre-playing state and the capture harness times out honestly instead of
 * certifying a black frame as "playing".
 */

export interface PresentedFrameSource {
  firstPresentedFrame(): Promise<number>;
}

/**
 * Resolves once a presented frame reports `drawCalls > 0`. Checks the current
 * count first so a `ready()` called after drawing already started does not wait
 * an extra frame.
 */
export async function awaitFirstPresentedDraw(
  runtime: PresentedFrameSource,
  readDrawCalls: () => number
): Promise<number> {
  let frame = -1;
  while (readDrawCalls() <= 0) {
    frame = await runtime.firstPresentedFrame();
  }
  return frame;
}

/** Defensive `app.diagnostics().drawCalls` read — never throws, NaN counts as 0. */
export function drawCallsOf(app: {
  diagnostics?: () => { drawCalls?: unknown };
}): number {
  try {
    const value = app.diagnostics?.().drawCalls;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
