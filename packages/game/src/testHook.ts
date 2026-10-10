/**
 * testHook.ts — §15 deterministic-clock hook.
 *
 * Installs `window.__AURA3D_GAME_TEST__` so browser specs can advance the
 * session clock by exactly `dt` per frame (`runtime.step(dt)` fires the
 * engine frame callbacks, which tick the session) and inspect presented-
 * frame ordering via `presentLog`. Installed only when the build defines
 * `import.meta.env.MODE === "test"` — `layout.spec.ts` asserts the global
 * is absent on production bundles.
 */

interface GameTestStepper {
  step(dt?: number): unknown;
  firstPresentedFrame(): Promise<number>;
  readonly evidence?: { frame?: number };
}

export interface PresentedLogEntry {
  frame: number;
  overlayOpacity: number;
  sceneId: number;
}

export interface GameTestHook {
  stepFrames(n: number, dt?: number): Promise<void>;
  presentLog: PresentedLogEntry[];
}

declare global {
  interface Window {
    __AURA3D_GAME_TEST__?: GameTestHook;
  }
}

function overlayOpacityNow(): number {
  const el = document.querySelector<HTMLElement>(".a3g-overlay");
  if (!el) return 0;
  const opacity = Number.parseFloat(getComputedStyle(el).opacity);
  return Number.isFinite(opacity) ? opacity : 0;
}

/**
 * Install the hook. `stepper` is the mounted `createGameApp` runtime (its
 * `step(dt)` advances the loop, renders, and fires the frame callbacks the
 * session listens to). `getSceneId` reads the route's scene revision so the
 * presentLog can correlate entries with `game.setScene` calls.
 */
export function installGameTestHook(args: {
  stepper: GameTestStepper;
  getSceneId: () => number;
}): GameTestHook {
  const { stepper, getSceneId } = args;
  const presentLog: PresentedLogEntry[] = [];

  // Re-arm a presented-frame waiter: one entry per actually presented frame,
  // with the overlay opacity sampled inside the same task as the resolve.
  const armPresentLog = () => {
    void stepper.firstPresentedFrame().then((frame) => {
      presentLog.push({ frame, overlayOpacity: overlayOpacityNow(), sceneId: getSceneId() });
      armPresentLog();
    });
  };
  armPresentLog();

  const hook: GameTestHook = {
    presentLog,
    async stepFrames(n: number, dt = 1 / 60): Promise<void> {
      const presented = stepper.firstPresentedFrame();
      for (let i = 0; i < n; i += 1) stepper.step(dt);
      // `step()` resolves presented waiters synchronously after its render;
      // awaiting the waiter still covers runtimes that defer presentation.
      await presented;
    }
  };
  window.__AURA3D_GAME_TEST__ = hook;
  return hook;
}
