// Pause bookkeeping for one story (PRD 03 section 3 CONTEXT_LOST and the hidden tab; PRD 01 section 6).
//
// Several things can hold a story at once: the grown-up's pause, the grown-up area being open, a hidden tab and a
// lost GPU device. The story runs only when none holds it. Coming back from a hidden tab or a restored device never
// resumes speech by itself: that reason turns into the grown-up's pause, so a grown-up taps Resume (01 section 6).
// Pure and clock-free, so the app's context-loss path is unit-tested without a browser.

export type PauseReason = "user" | "hidden" | "parent" | "device";

export interface PauseSet {
  /** Adds a reason. True when nothing held the story before (the caller pauses it now). */
  add(reason: PauseReason): boolean;
  /** Removes the given reasons. True when that removed the last one (the caller may resume). */
  release(reasons: readonly PauseReason[]): boolean;
  /** Back from a hidden tab or a lost device: the reason becomes the grown-up's pause. True when it held the story. */
  holdForGrownUp(reason: "hidden" | "device"): boolean;
  paused(): boolean;
  reasons(): readonly PauseReason[];
  clear(): void;
}

export function createPauseSet(): PauseSet {
  const held = new Set<PauseReason>();
  return {
    add(reason) {
      const wasRunning = held.size === 0;
      held.add(reason);
      return wasRunning;
    },
    release(reasons) {
      let changed = false;
      for (const reason of reasons) if (held.delete(reason)) changed = true;
      return changed && held.size === 0;
    },
    holdForGrownUp(reason) {
      if (!held.delete(reason)) return false;
      held.add("user");
      return true;
    },
    paused: () => held.size > 0,
    reasons: () => [...held],
    clear() {
      held.clear();
    }
  };
}
