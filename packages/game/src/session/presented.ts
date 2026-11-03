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
  firstPresentedFrame(options?: { readonly signal?: AbortSignal }): Promise<number>;
}

/**
 * Resolves once a presented frame reports `drawCalls > 0`. Checks the current
 * count first so a `ready()` called after drawing already started does not wait
 * an extra frame.
 */
export async function awaitFirstPresentedDraw(
  runtime: PresentedFrameSource,
  readDrawCalls: () => number,
  signal?: AbortSignal
): Promise<number> {
  let frame = -1;
  for (;;) {
    throwIfAborted(signal);
    if (readDrawCalls() > 0) {
      throwIfAborted(signal);
      return frame;
    }
    frame = await runtime.firstPresentedFrame(signal ? { signal } : undefined);
  }
}

type ReadinessOutcome =
  | { readonly state: "ready" }
  | { readonly state: "failed"; readonly code: string; readonly message: string }
  | { readonly state: "cancelled" | "disposed" }
  // Mirrors `AuraReadyOutcome` in @aura3d/engine: the awaited mount was replaced
  // by a newer one. Like a superseded render termination, the wait retries
  // against the current mount instead of failing.
  | { readonly state: "superseded" };

type RenderTermination =
  | { readonly state: "failed"; readonly code: string; readonly message: string; readonly revision?: number }
  | { readonly state: "device-lost" | "superseded" | "disposed"; readonly revision?: number };

/** The public app methods used while a game waits for its first drawn frame. */
export interface GameReadinessApp {
  readonly backend?: string;
  ready(): Promise<void>;
  readiness?(options?: { readonly stage?: "renderer" | "first-frame"; readonly signal?: AbortSignal }): Promise<ReadinessOutcome>;
  onRenderTermination?(listener: (event: RenderTermination) => void): () => void;
  renderTermination?(): RenderTermination | undefined;
  onDeviceLost?(listener: () => void): () => void;
  deviceLost?(): boolean;
  diagnostics?: () => { drawCalls?: unknown };
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("Game readiness cancelled.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

function readinessError(code: string, message: string): Error {
  const error = new Error(message);
  error.name = "AuraGameReadinessError";
  return Object.assign(error, { code });
}

function terminalError(event: RenderTermination): Error {
  if (event.state === "failed") return readinessError(event.code, event.message);
  if (event.state === "device-lost") {
    return readinessError("device-lost", "The rendering device was lost; wait for restoration and remount.");
  }
  return readinessError("disposed", "The rendering app was disposed before the game became ready.");
}

function isGpuBackend(backend: string | undefined): boolean {
  return backend === "webgl2" || backend === "webgpu";
}

/**
 * Wait for a drawn frame without turning a renderer failure into an endless
 * presentation wait. Each iteration belongs to one mount; a superseded mount
 * cancels its waiters and retries against the current mount. Healthy blank,
 * paused and manually stepped scenes intentionally remain pending. The
 * optional commit runs synchronously while the mount is still observed; its
 * check must be called again after any reentrant session transition.
 */
export async function awaitGamePresentedDraw(
  app: GameReadinessApp,
  runtime: PresentedFrameSource,
  signal?: AbortSignal,
  commit?: (isCurrent: () => boolean) => boolean
): Promise<number> {
  for (;;) {
    throwIfAborted(signal);
    const scope = new AbortController();
    const abortScope = (): void => { if (!scope.signal.aborted) scope.abort(signal?.reason); };
    signal?.addEventListener("abort", abortScope, { once: true });
    if (signal?.aborted) abortScope();

    let termination: RenderTermination | undefined;
    let resolveTermination!: (event: RenderTermination) => void;
    const terminated = new Promise<RenderTermination>((resolve) => { resolveTermination = resolve; });
    const observeTermination = (event: RenderTermination): void => {
      if (termination) return;
      termination = event;
      resolveTermination(event);
    };
    const aborted = new Promise<never>((_resolve, reject) => {
      const abort = (): void => reject(abortReason(scope.signal));
      scope.signal.addEventListener("abort", abort, { once: true });
      if (scope.signal.aborted) abort();
    });
    // Cleanup also aborts the scope after successful completion, when no race
    // may remain interested in this promise.
    void aborted.catch(() => undefined);
    const compete = <T>(work: Promise<T>): Promise<
      | { readonly kind: "value"; readonly value: T }
      | { readonly kind: "termination"; readonly event: RenderTermination }
    > => Promise.race([
      work.then((value) => ({ kind: "value" as const, value })),
      terminated.then((event) => ({ kind: "termination" as const, event })),
      aborted
    ]);
    const currentTermination = (): RenderTermination | undefined => {
      if (termination) return termination;
      const current = app.renderTermination?.();
      if (current) return current;
      if (app.deviceLost?.()) return { state: "device-lost" };
      return undefined;
    };
    const handleTermination = (event: RenderTermination): "retry" => {
      if (event.state === "superseded") return "retry";
      throw terminalError(event);
    };
    const isCurrent = (): boolean => {
      const latest = currentTermination();
      if (latest && handleTermination(latest) === "retry") return false;
      throwIfAborted(scope.signal);
      return true;
    };
    const handleCancellation = (): void => {
      throwIfAborted(scope.signal);
      const latest = currentTermination();
      if (latest && handleTermination(latest) === "retry") return;
      throw readinessError("cancelled", "The rendering readiness wait was cancelled.");
    };
    const commitPresented = (): boolean => isCurrent() && (commit?.(isCurrent) ?? true);
    let offTermination: (() => void) | undefined;
    let offDeviceLost: (() => void) | undefined;
    try {
      // Subscribe first, then inspect the current state so a loss/failure
      // between those operations cannot be missed.
      offTermination = app.onRenderTermination?.(observeTermination);
      offDeviceLost = app.onDeviceLost?.(() => observeTermination({ state: "device-lost" }));
      const initial = currentTermination();
      if (initial) {
        if (handleTermination(initial) === "retry") continue;
      }

      const mounted = await compete(Promise.resolve().then(() => app.ready()));
      if (mounted.kind === "termination") {
        handleTermination(mounted.event);
        continue;
      }
      throwIfAborted(scope.signal);

      if (app.readiness) {
        const renderer = await compete(app.readiness({ stage: "renderer", signal: scope.signal }));
        if (renderer.kind === "termination") {
          handleTermination(renderer.event);
          continue;
        }
        const outcome = renderer.value;
        if (outcome.state === "superseded") continue;
        if (outcome.state === "cancelled") {
          handleCancellation();
          continue;
        }
        if (outcome.state === "disposed") throw readinessError("disposed", "The rendering app was disposed before the game became ready.");
        if (outcome.state === "failed" && !(outcome.code === "renderer-unavailable" &&
          (app.backend === "headless" || app.backend === "canvas2d"))) {
          throw readinessError(outcome.code, outcome.message);
        }
      }

      const draw = awaitFirstPresentedDraw(runtime, () => drawCallsOf(app), scope.signal);
      if (app.readiness && isGpuBackend(app.backend)) {
        // First-frame readiness can report a blank submission. Keep waiting
        // for a real draw after it succeeds, while still observing terminal
        // failures through the app's separate mount-scoped signal.
        const first = await compete(Promise.race([
          draw.then((frame) => ({ kind: "draw" as const, frame })),
          app.readiness({ stage: "first-frame", signal: scope.signal }).then((outcome) => ({ kind: "first-frame" as const, outcome }))
        ]));
        if (first.kind === "termination") {
          handleTermination(first.event);
          continue;
        }
        if (first.value.kind === "first-frame") {
          const outcome = first.value.outcome;
          if (outcome.state === "superseded") continue;
          if (outcome.state === "cancelled") {
            handleCancellation();
            continue;
          }
          if (outcome.state === "disposed") throw readinessError("disposed", "The rendering app was disposed before the game became ready.");
          if (outcome.state === "failed") throw readinessError(outcome.code, outcome.message);
        } else {
          if (!commitPresented()) continue;
          return first.value.frame;
        }
      }
      const presented = await compete(draw);
      if (presented.kind === "termination") {
        handleTermination(presented.event);
        continue;
      }
      if (!commitPresented()) continue;
      return presented.value;
    } finally {
      signal?.removeEventListener("abort", abortScope);
      if (!scope.signal.aborted) scope.abort();
      try {
        offDeviceLost?.();
      } finally {
        offTermination?.();
      }
    }
  }
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
