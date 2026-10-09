// Touch lane-swipe wiring — extracted from boot.ts for 14-LOC. Same gestures
// onto the same buffered intents; `actions` is consumed (and cleared) by the
// frame loop exactly as before.

export interface PulseTouchActions {
  left: boolean;
  right: boolean;
  jump: boolean;
  slide: boolean;
  confirm: boolean;
}

export function wirePulseTouch(
  target: HTMLElement,
  unlockAudio: () => void,
): { actions: PulseTouchActions } {
  // Touch lane-swipe: horizontal swipe = lane move, up = jump, down = slide,
  // tap = start/confirm. The preset drives the shell chrome; the gestures map
  // onto the same buffered intents as keys.
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeAt = 0;
  const actions: PulseTouchActions = { left: false, right: false, jump: false, slide: false, confirm: false };
  target.addEventListener("pointerdown", (e) => {
    unlockAudio();
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeAt = performance.now();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  });
  const endTouch = (e: PointerEvent) => {
    if (swipeAt <= 0) return;
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;
    const dist = Math.hypot(dx, dy);
    if (performance.now() - swipeAt < 240 && dist < 16) {
      actions.confirm = true;
    } else if (dist >= 24) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx < 0) actions.left = true; else actions.right = true;
      } else if (dy < 0) {
        actions.jump = true;
      } else {
        actions.slide = true;
      }
    }
    swipeAt = 0;
  };
  target.addEventListener("pointerup", endTouch);
  target.addEventListener("pointercancel", () => { swipeAt = 0; });
  return { actions };
}

export function consumePulseTouch(swipe: { actions: PulseTouchActions }): PulseTouchActions {
  const out = { ...swipe.actions };
  swipe.actions.left = false;
  swipe.actions.right = false;
  swipe.actions.jump = false;
  swipe.actions.slide = false;
  swipe.actions.confirm = false;
  return out;
}
