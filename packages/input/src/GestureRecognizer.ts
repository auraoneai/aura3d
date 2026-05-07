import type { InputSnapshot, PointerTouch } from "./InputSnapshot";

export type Gesture =
  | { readonly type: "tap"; readonly x: number; readonly y: number }
  | { readonly type: "pan"; readonly deltaX: number; readonly deltaY: number }
  | { readonly type: "pinch"; readonly scale: number };

export class GestureRecognizer {
  private previousTouches: readonly PointerTouch[] = [];
  private downFrames = 0;

  update(snapshot: InputSnapshot): readonly Gesture[] {
    const gestures: Gesture[] = [];
    const touches = snapshot.pointer.touches;

    if (snapshot.button(0).down) {
      this.downFrames += 1;
      if (snapshot.pointer.deltaX !== 0 || snapshot.pointer.deltaY !== 0) {
        gestures.push({ type: "pan", deltaX: snapshot.pointer.deltaX, deltaY: snapshot.pointer.deltaY });
      }
    }

    if (snapshot.button(0).released && this.downFrames <= 12) {
      gestures.push({ type: "tap", x: snapshot.pointer.x, y: snapshot.pointer.y });
    }

    if (touches.length >= 2 && this.previousTouches.length >= 2) {
      const previousDistance = distance(this.previousTouches[0]!, this.previousTouches[1]!);
      const currentDistance = distance(touches[0]!, touches[1]!);
      if (previousDistance > 0) gestures.push({ type: "pinch", scale: currentDistance / previousDistance });
    }

    if (!snapshot.button(0).down) {
      this.downFrames = 0;
    }
    this.previousTouches = touches;
    return gestures;
  }
}

function distance(a: PointerTouch, b: PointerTouch): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
