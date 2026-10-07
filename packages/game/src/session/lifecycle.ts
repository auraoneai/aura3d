/**
 * session/lifecycle.ts — PRD-09 day-0.
 *
 * Pause/resume hooks bound to the document lifecycle (§7.3):
 *  - `visibilitychange` hidden → `pause("visibility")` + `sound.suspend()`
 *  - `pagehide` persisted → suspend only; non-persisted → dispose audio
 *  - `pageshow` persisted → re-arm audio unlock + pause menu
 *  - pause keys (Escape/KeyP) → `pause("user")` / release
 *  - gamepad standard-mapping button 9 (start) polled through the gamepad API
 * Returns a disposer.
 */

import type { GameSessionImpl } from "./GameSession";

export interface LifecycleSound {
  suspend(): void;
  dispose(): void;
  unlock?(): void;
}

export interface LifecycleOptions {
  readonly session: GameSessionImpl;
  readonly sound?: LifecycleSound;
  readonly doc?: Document;
  readonly pauseKeys?: readonly string[];
  readonly gamepadButton?: number;
  /** Default: navigator.getGamepads(). Injectable for tests. */
  readonly getGamepads?: () => readonly (Gamepad | null)[];
  /** Default: requestAnimationFrame polling; injectable for tests. */
  readonly onPoll?: (cb: () => void) => number;
  readonly cancelPoll?: (id: number) => void;
}

const DEFAULT_PAUSE_KEYS = ["Escape", "KeyP"] as const;

export function attachSessionLifecycle(options: LifecycleOptions): () => void {
  const { session, sound } = options;
  const doc = options.doc ?? (typeof document !== "undefined" ? document : undefined);
  const pauseKeys = options.pauseKeys ?? DEFAULT_PAUSE_KEYS;
  const buttonIndex = options.gamepadButton ?? 9;
  const disposers: Array<() => void> = [];

  if (doc !== undefined) {
    const onVisibility = () => {
      if (doc.visibilityState === "hidden") {
        session.pause("visibility");
        sound?.suspend();
      } else {
        session.releasePause("visibility");
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if ((e as PageTransitionEvent).persisted) {
        sound?.suspend();
      } else {
        sound?.dispose();
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if ((e as PageTransitionEvent).persisted) {
        sound?.unlock?.();
        session.pause("menu");
      }
    };
    doc.addEventListener("visibilitychange", onVisibility);
    disposers.push(() => doc.removeEventListener("visibilitychange", onVisibility));
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", onPageHide as EventListener);
      window.addEventListener("pageshow", onPageShow as EventListener);
      disposers.push(() => {
        window.removeEventListener("pagehide", onPageHide as EventListener);
        window.removeEventListener("pageshow", onPageShow as EventListener);
      });
    }
  }

  if (typeof window !== "undefined") {
    const onKey = (e: KeyboardEvent) => {
      const code = (e as KeyboardEvent).code ?? (e as KeyboardEvent).key;
      if (!pauseKeys.includes(code)) return;
      if (session.state === "paused") session.releasePause("user");
      else session.pause("user");
    };
    window.addEventListener("keydown", onKey);
    disposers.push(() => window.removeEventListener("keydown", onKey));

    const getGamepads =
      options.getGamepads ??
      (() => {
        try {
          return typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
        } catch {
          return [];
        }
      });
    const schedulePoll =
      options.onPoll ??
      ((cb: () => void) =>
        typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 16) as unknown as number);
    const cancelPoll = options.cancelPoll ?? ((id: number) => cancelAnimationFrame(id));

    let prevPressed = false;
    let pollId = 0;
    const poll = () => {
      let pressed = false;
      try {
        for (const pad of getGamepads()) {
          if (pad?.buttons?.[buttonIndex]?.pressed) pressed = true;
        }
      } catch {
        /* gamepad polling unsupported */
      }
      if (pressed && !prevPressed) {
        if (session.state === "paused") session.releasePause("user");
        else session.pause("user");
      }
      prevPressed = pressed;
      pollId = schedulePoll(poll);
    };
    pollId = schedulePoll(poll);
    disposers.push(() => cancelPoll(pollId));
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}
