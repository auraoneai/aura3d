import type { InputSnapshot, PointerTouch } from "./InputSnapshot";

export type Gesture =
  | { readonly type: "tap"; readonly x: number; readonly y: number }
  | { readonly type: "pan"; readonly deltaX: number; readonly deltaY: number }
  | { readonly type: "pinch"; readonly scale: number };

interface TrackedContact {
  startedAt: number;
  startClientX: number;
  startClientY: number;
  maxDistance: number;
  multiple: boolean;
}

/** Tap duration and movement limits are in milliseconds and viewport CSS pixels. */
export class GestureRecognizer {
  private readonly tracked = new Map<number, TrackedContact>();
  private previousTouches = new Map<number, PointerTouch>();
  private pair?: readonly [number, number];
  private legacyStart?: { time: number; x: number; y: number };

  update(snapshot: InputSnapshot): readonly Gesture[] {
    const gestures: Gesture[] = [];
    const { pointer } = snapshot;
    if (pointer.cancellationReason) {
      this.tracked.clear();
      this.pair = undefined;
      this.previousTouches.clear();
      this.legacyStart = undefined;
      return gestures;
    }

    if (pointer.contacts.length > 0) {
      const activeCount = pointer.contacts.filter(contact => contact.down && contact.pointerType === "touch").length;
      for (const contact of pointer.contacts) {
        const left = contact.buttons.get(0);
        let track = this.tracked.get(contact.id);
        if (!track && (left?.down || left?.pressed || left?.released)) {
          track = { startedAt: contact.startedAt, startClientX: contact.startClientX, startClientY: contact.startClientY, maxDistance: 0, multiple: false };
          this.tracked.set(contact.id, track);
        }
        if (!track) continue;
        track.maxDistance = Math.max(track.maxDistance, contact.maxClientDistance, Math.hypot(contact.clientX - track.startClientX, contact.clientY - track.startClientY));
        if (activeCount > 1 || contact.hadMultipleContacts) track.multiple = true;
        if (contact.cancelled) {
          this.tracked.delete(contact.id);
          continue;
        }
        if (left?.down && (contact.deltaX !== 0 || contact.deltaY !== 0)) {
          gestures.push({ type: "pan", deltaX: contact.deltaX, deltaY: contact.deltaY });
        }
        if (left?.released) {
          if (!track.multiple && track.maxDistance <= 10 && contact.timestamp >= track.startedAt && contact.timestamp - track.startedAt <= 200) {
            gestures.push({ type: "tap", x: contact.x, y: contact.y });
          }
          this.tracked.delete(contact.id);
        }
      }
    } else {
      this.tracked.clear();
      // Preserve support for manually constructed legacy snapshots without contact records.
      const left = snapshot.button(0);
      if (left.down && !this.legacyStart) this.legacyStart = { time: pointer.timestamp, x: pointer.x, y: pointer.y };
      if (left.down && (pointer.deltaX !== 0 || pointer.deltaY !== 0)) gestures.push({ type: "pan", deltaX: pointer.deltaX, deltaY: pointer.deltaY });
      if (left.released && this.legacyStart && pointer.timestamp >= this.legacyStart.time && pointer.timestamp - this.legacyStart.time <= 200 &&
          Math.hypot(pointer.x - this.legacyStart.x, pointer.y - this.legacyStart.y) <= 10 && pointer.cancellations.length === 0) {
        gestures.push({ type: "tap", x: pointer.x, y: pointer.y });
      }
      if (!left.down) this.legacyStart = undefined;
      for (const cancellation of pointer.cancellations) this.tracked.delete(cancellation.id);
    }

    this.addPinch(pointer.touches, gestures);
    return gestures;
  }

  private addPinch(touches: readonly PointerTouch[], gestures: Gesture[]): void {
    const current = new Map(touches.map(touch => [touch.id, touch]));
    if (!this.pair || !current.has(this.pair[0]) || !current.has(this.pair[1])) {
      const ids = [...current.keys()].sort((a, b) => a - b);
      this.pair = ids.length >= 2 ? [ids[0]!, ids[1]!] : undefined;
      this.previousTouches = current;
      return;
    }
    const [a, b] = this.pair;
    const previousA = this.previousTouches.get(a), previousB = this.previousTouches.get(b);
    const nextA = current.get(a), nextB = current.get(b);
    if (previousA && previousB && nextA && nextB) {
      const before = distance(previousA, previousB), after = distance(nextA, nextB);
      if (before > 0 && after > 0) gestures.push({ type: "pinch", scale: after / before });
    }
    this.previousTouches = current;
  }
}

function distance(a: PointerTouch, b: PointerTouch): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
