/**
 * First-frame gate (beat-three.js PRD-2, WP-8). Environment work that is not needed to draw the first frame (decoding the
 * baked default probe: base64, gunzip, RGB9E5 decode, half-float encode of five mip levels) must not run before that frame is
 * submitted. A `Renderer` arms the gate when it is created and notifies it when its first frame has been submitted; the
 * default-probe loader waits on it. The frame is lit by the synchronous analytic floor probe in the meantime.
 *
 * Process-wide and one-shot: once any renderer has submitted a frame, later waits resolve at once. Where no renderer exists
 * (unit tests, tooling) the gate is never armed and waits resolve at once. A frame that never arrives must not strand the
 * upgrade, so a wait also ends after `timeoutMs`.
 */

interface GateState {
  armed: boolean;
  presented: boolean;
  waiters: (() => void)[];
}

const state: GateState = { armed: false, presented: false, waiters: [] };

/** Default upper bound on a wait, in ms; a first frame slower than this lets the deferred work run before it. */
export const FIRST_FRAME_GATE_TIMEOUT_MS = 3000;

/** Called when a renderer is created. No effect once a frame has been submitted. */
export function armFirstFrameGate(): void {
  if (!state.presented) state.armed = true;
}

/** Called after a renderer submits a frame. Releases waiters in a later task, so they never extend the frame's own task. */
export function notifyFirstFramePresented(): void {
  if (state.presented) return;
  state.presented = true;
  const waiters = state.waiters;
  state.waiters = [];
  if (waiters.length === 0) return;
  setTimeout(() => { for (const release of waiters) release(); }, 0);
}

/** Resolves once the first frame has been submitted (in a later task), at once if no frame is pending, or after `timeoutMs`. */
export function whenFirstFramePresented(timeoutMs: number = FIRST_FRAME_GATE_TIMEOUT_MS): Promise<void> {
  if (!state.armed || state.presented) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const release = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(release, timeoutMs);
    state.waiters.push(release);
  });
}

/** Test seam: back to the initial, unarmed state. */
export function resetFirstFrameGateForTests(): void {
  state.armed = false;
  state.presented = false;
  state.waiters = [];
}

/** Test seam: the gate's current phase. */
export function firstFrameGatePhase(): "idle" | "armed" | "presented" {
  return state.presented ? "presented" : state.armed ? "armed" : "idle";
}
