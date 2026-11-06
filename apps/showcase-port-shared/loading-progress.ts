/**
 * One shared loading-progress helper for the showcase games (5.0 adoption item A1, work package W-6).
 *
 * 5.0 made `game.shell.setLoadingProgress(fraction, label)` and `game.shell.track(promise, weight)` real (B10). Games kept
 * hand-rolled loaders; this helper is the single implementation they can adopt instead of 25 copies. It works with or
 * without a game shell: pass `shell` to drive the engine loading screen, pass `element` (and load `quickbar.css`) to
 * drive a plain DOM bar, or both. No DOM or engine import happens at module load, so it is safe in unit tests.
 */

export interface LoadingShellLike {
  setLoadingProgress(fraction: number, label?: string): void;
  track?(promise: Promise<unknown>, weight: number): void;
}

export interface LoadingProgressOptions {
  /** `game.shell` (or any object with `setLoadingProgress`). Optional. */
  readonly shell?: LoadingShellLike;
  /** Optional DOM element styled by `.aura3d-loading` in `quickbar.css`; its `--aura3d-loading` variable is kept in step. */
  readonly element?: HTMLElement;
  /** Called after every update with the clamped, monotonic fraction. */
  readonly onProgress?: (fraction: number, label: string | undefined) => void;
}

export interface LoadingProgress {
  /** Current fraction in 0..1. Never decreases. */
  readonly fraction: number;
  /** Register work. Progress is the settled weight over the registered weight; a rejected promise still counts as settled. */
  track<T>(promise: Promise<T>, weight?: number, label?: string): Promise<T>;
  /** Report an absolute fraction for work that is not a promise (e.g. a compile step). */
  set(fraction: number, label?: string): void;
  /** Jump to 1. Idempotent. */
  done(label?: string): void;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

export function createLoadingProgress(options: LoadingProgressOptions = {}): LoadingProgress {
  let total = 0;
  let settled = 0;
  let manual = 0;
  let current = 0;
  let finished = false;

  const publish = (label?: string): void => {
    const target = finished ? 1 : Math.max(manual, total > 0 ? settled / total : 0);
    // A late `track()` raises the total and would lower the ratio; hold the high-water mark so the bar never goes backwards.
    current = Math.max(current, clamp01(target));
    options.shell?.setLoadingProgress(current, label);
    const el = options.element;
    if (el) {
      el.style.setProperty("--aura3d-loading", String(current));
      el.setAttribute("aria-valuenow", String(Math.round(current * 100)));
      if (current >= 1) el.setAttribute("data-complete", "true");
    }
    options.onProgress?.(current, label);
  };

  return {
    get fraction() {
      return current;
    },
    track(promise, weight = 1, label) {
      const w = Number.isFinite(weight) && weight > 0 ? weight : 1;
      total += w;
      const settle = (): void => {
        settled += w;
        publish(label);
      };
      promise.then(settle, settle);
      return promise;
    },
    set(fraction, label) {
      manual = Math.max(manual, clamp01(fraction));
      publish(label);
    },
    done(label) {
      if (finished) return;
      finished = true;
      publish(label);
    }
  };
}
