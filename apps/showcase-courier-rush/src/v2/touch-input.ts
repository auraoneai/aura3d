// Touch input wiring — extracted from boot.ts for 14-LOC. Same listeners on
// the same target; interactTap is exposed via peek/reset so the frame loop's
// read-then-clear order is unchanged.

export interface CourierTouchState {
  readonly touch: { throttle: boolean; brake: boolean; steerX: number; downX: number; downY: number; tapAt: number };
  peekInteractTap(): boolean;
  resetInteractTap(): void;
}

export function wireCourierTouch(target: HTMLElement, unlockAudio: () => void): CourierTouchState {
  // Touch: right-hold throttle, left-hold brake, drag steers, tap interacts.
  let interactTap = false;
  const touch = { throttle: false, brake: false, steerX: 0, downX: 0, downY: 0, tapAt: 0 };
  target.addEventListener("pointerdown", (e) => {
    unlockAudio();
    const x = e.clientX / Math.max(1, target.clientWidth);
    touch.downX = e.clientX;
    touch.downY = e.clientY;
    touch.tapAt = performance.now();
    if (x < 0.5) touch.brake = true; else touch.throttle = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  });
  target.addEventListener("pointermove", (e) => {
    const dx = (e.clientX - touch.downX) / Math.max(1, target.clientWidth);
    touch.steerX = Math.max(-1, Math.min(1, dx * 3.2));
  });
  const endTouch = (e: PointerEvent) => {
    if (touch.tapAt > 0 && performance.now() - touch.tapAt < 220 &&
        Math.hypot(e.clientX - touch.downX, e.clientY - touch.downY) < 14) {
      interactTap = true;
    }
    touch.throttle = false;
    touch.brake = false;
    touch.steerX = 0;
    touch.tapAt = 0;
  };
  target.addEventListener("pointerup", endTouch);
  target.addEventListener("pointercancel", () => { touch.throttle = false; touch.brake = false; touch.steerX = 0; touch.tapAt = 0; });

  return {
    touch,
    peekInteractTap: () => interactTap,
    resetInteractTap: () => { interactTap = false; },
  };
}
