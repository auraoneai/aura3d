// Touch input — extracted from boot.ts for 14-LOC. `t` is mutable state that
// boot reads when collecting per-frame inputs.
export interface SkylineTouchState {
  touchMoveX: number;
  touchJumpQueued: boolean;
  touchJumpHeld: boolean;
  touchDashQueued: boolean;
  touchFastFall: boolean;
  touchEngaged: boolean;
  activePointer: { id: number; x: number; y: number } | null;
}

export function createSkylineTouch(): SkylineTouchState {
  return {
    touchMoveX: 0,
    touchJumpQueued: false,
    touchJumpHeld: false,
    touchDashQueued: false,
    touchFastFall: false,
    touchEngaged: false,
    activePointer: null
  };
}

export function wireSkylineTouch(t: SkylineTouchState, getCanvas: () => HTMLElement | null): void {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    t.touchEngaged = true;
    const rect = canvas.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (event.clientY - rect.top) / Math.max(1, rect.height);
    t.activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (nx < 0.33) t.touchMoveX = -1;
    else if (nx > 0.67) t.touchMoveX = 1;
    else { t.touchJumpQueued = true; t.touchJumpHeld = true; }
    if (ny > 0.75) t.touchFastFall = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!t.activePointer || event.pointerId !== t.activePointer.id) return;
    const dy = event.clientY - t.activePointer.y;
    const dx = event.clientX - t.activePointer.x;
    if (dy < -48) { t.touchJumpQueued = true; t.touchJumpHeld = true; t.activePointer.y = event.clientY; }
    if (dy > 56) t.touchFastFall = true;
    if (Math.abs(dx) > 64) { t.touchDashQueued = true; t.activePointer.x = event.clientX; }
  });
  const release = (event: PointerEvent) => {
    if (t.activePointer && event.pointerId === t.activePointer.id) {
      t.activePointer = null;
      t.touchMoveX = 0;
      t.touchJumpHeld = false;
      t.touchFastFall = false;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
