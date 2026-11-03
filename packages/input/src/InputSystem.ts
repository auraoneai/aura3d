import { ActionMap } from "./ActionMap";
import { GamepadDevice, type GamepadLike } from "./GamepadDevice";
import { InputSnapshot } from "./InputSnapshot";
import { KeyboardDevice, type KeyboardEventLike } from "./KeyboardDevice";
import { PointerDevice, type PointerCoordinateTarget, type PointerEventLike, type WheelEventLike } from "./PointerDevice";
import { acquirePointerCapture, releasePointerCaptureLease, type PointerCaptureTargetLike } from "./PointerLeases";

export interface InputEventTargetLike extends PointerCaptureTargetLike {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  readonly ownerDocument?: { readonly defaultView?: InputEventTargetLike | null };
}

export class InputSystem {
  readonly keyboard = new KeyboardDevice();
  readonly pointer = new PointerDevice();
  readonly gamepads = new GamepadDevice();
  readonly actions = new ActionMap();

  private readonly attachedTargets = new Map<InputEventTargetLike, Array<() => void>>();
  private readonly captureReleasers = new Map<InputEventTargetLike, () => () => void>();
  private snapshotRef = new InputSnapshot();

  constructor(target?: InputEventTargetLike) {
    if (target) {
      this.attach(target);
    }
  }

  get snapshot(): InputSnapshot {
    return this.snapshotRef;
  }

  attach(target: InputEventTargetLike): void {
    if (this.attachedTargets.has(target)) {
      return;
    }

    const onKeyDown = ((event: Event) => this.keyboard.keyDown(event as unknown as KeyboardEventLike)) as EventListener;
    const onKeyUp = ((event: Event) => this.keyboard.keyUp(event as unknown as KeyboardEventLike)) as EventListener;
    const surface = target as InputEventTargetLike & PointerCoordinateTarget;
    const captured = new Map<number, object>();
    const expectedLosses = new Map<number, number>();
    const pressTimes = new Map<number, number>();
    const isEarlierThanPress = (pointer: PointerEventLike): boolean => {
      const pressTime = pressTimes.get(pointer.pointerId ?? 0);
      return pressTime !== undefined && pointer.timeStamp !== undefined &&
        Number.isFinite(pointer.timeStamp) && pointer.timeStamp < pressTime;
    };
    const releaseLease = (id: number, owner: object, release: boolean) => {
      try {
        releasePointerCaptureLease(target, id, owner, release, () => {
          expectedLosses.set(id, (expectedLosses.get(id) ?? 0) + 1);
        });
      } catch {
        expectedLosses.delete(id); // The browser may already have released capture.
      }
    };
    const releaseCapture = (id: number, owner = captured.get(id), release = true) => {
      if (!owner || captured.get(id) !== owner) return;
      // Forget this generation before invoking the target, which may dispatch
      // loss or a new press synchronously from releasePointerCapture.
      captured.delete(id);
      releaseLease(id, owner, release);
    };
    const prepareCaptureReleases = () => {
      pressTimes.clear();
      // Detach the old generation before any native release. Another target
      // or pointer in the batch may receive a new press reentrantly.
      const previous = [...captured];
      captured.clear();
      return () => { for (const [id, owner] of previous) releaseLease(id, owner, true); };
    };
    this.captureReleasers.set(target, prepareCaptureReleases);
    const onPointerMove = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      if (!isEarlierThanPress(pointer)) this.pointer.move(pointer, surface);
    }) as EventListener;
    const onPointerDown = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      const id = pointer.pointerId ?? 0;
      if (pointer.timeStamp !== undefined && Number.isFinite(pointer.timeStamp)) pressTimes.set(id, pointer.timeStamp);
      else pressTimes.delete(id);
      this.pointer.down(pointer, surface);
      if (pointer.pointerId !== undefined) expectedLosses.delete(id);
      if (pointer.pointerId !== undefined && target.setPointerCapture && !captured.has(pointer.pointerId)) {
        const owner = {};
        captured.set(pointer.pointerId, owner);
        try { acquirePointerCapture(target, pointer.pointerId, owner); } catch { /* Synthetic or inactive pointer. */ }
      }
    }) as EventListener;
    const onPointerUp = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      // A control can dispatch a new press from an older up/cancel listener
      // before this listener sees the older event on a headless event target.
      if (isEarlierThanPress(pointer)) return;
      if (!pointer.buttons) pressTimes.delete(pointer.pointerId ?? 0);
      this.pointer.up(pointer, surface);
      if (pointer.pointerId !== undefined && !pointer.buttons) releaseCapture(pointer.pointerId);
    }) as EventListener;
    const onPointerCancel = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      if (isEarlierThanPress(pointer)) return;
      pressTimes.delete(pointer.pointerId ?? 0);
      this.pointer.cancel(pointer, "pointercancel", surface);
      if (pointer.pointerId !== undefined) releaseCapture(pointer.pointerId);
    }) as EventListener;
    const onLostCapture = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      if (isEarlierThanPress(pointer)) return;
      if (pointer.pointerId !== undefined) {
        const expected = expectedLosses.get(pointer.pointerId) ?? 0;
        if (expected > 0) {
          if (expected === 1) expectedLosses.delete(pointer.pointerId);
          else expectedLosses.set(pointer.pointerId, expected - 1);
          return;
        }
        // A stale loss after a new press must not cancel the newer capture.
        try { if (target.hasPointerCapture?.(pointer.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }
        releaseCapture(pointer.pointerId, captured.get(pointer.pointerId), false);
      }
      pressTimes.delete(pointer.pointerId ?? 0);
      this.pointer.cancel(pointer, "lostpointercapture", surface);
    }) as EventListener;
    const onPointerLeave = ((event: Event) => {
      const pointer = event as unknown as PointerEventLike;
      if (!isEarlierThanPress(pointer)) this.pointer.leave(pointer);
    }) as EventListener;
    const onWheel = ((event: Event) => this.pointer.wheel(event as unknown as WheelEventLike, surface)) as EventListener;
    const onBlur = ((event: Event) => {
      this.keyboard.blur();
      this.pointer.blur("blur", event.timeStamp);
      this.releaseCaptures();
    }) as EventListener;

    const listeners: Array<readonly [string, EventListener]> = [
      ["keydown", onKeyDown],
      ["keyup", onKeyUp],
      ["pointermove", onPointerMove],
      ["pointerdown", onPointerDown],
      ["pointerup", onPointerUp],
      ["pointercancel", onPointerCancel],
      ["lostpointercapture", onLostCapture],
      ["pointerleave", onPointerLeave],
      ["wheel", onWheel],
      ["blur", onBlur]
    ];

    // Remove listeners before releasing captures so reentrant target callbacks
    // cannot attach another press to a system being disposed.
    const disposers: Array<() => void> = [() => { prepareCaptureReleases()(); this.captureReleasers.delete(target); }];
    // The public structural target only requires two arguments; DOM targets
    // accept this optional third capture argument, and simpler hosts ignore it.
    // The options-object form is used for both calls: older Node EventTarget
    // releases (the ACR image's Node; local Node 26 is fixed) read only
    // `options?.capture` in removeEventListener, so a boolean `true` there
    // left every capture listener attached after dispose.
    const captureOptions = { capture: true } as const;
    const eventTarget = target as InputEventTargetLike & {
      addEventListener(type: string, listener: EventListener, options: { readonly capture: boolean }): void;
      removeEventListener(type: string, listener: EventListener, options: { readonly capture: boolean }): void;
    };
    for (const [type, listener] of listeners) {
      // DOM capture phase observes an old event before a control's bubbling
      // listener can synchronously dispatch a new press with the same ID.
      const capture = type.startsWith("pointer") || type === "lostpointercapture";
      if (capture) {
        try {
          eventTarget.addEventListener(type, listener, captureOptions);
          disposers.push(() => eventTarget.removeEventListener(type, listener, captureOptions));
        } catch {
          // Some synthetic targets enforce the two-argument structural API.
          target.addEventListener(type, listener);
          disposers.push(() => target.removeEventListener(type, listener));
        }
      } else {
        target.addEventListener(type, listener);
        disposers.push(() => target.removeEventListener(type, listener));
      }
    }
    // Element blur covers focus changes within the document; window blur covers the
    // tab/window losing focus, which is not delivered as an element blur everywhere.
    const windowTarget = target.ownerDocument?.defaultView;
    if (windowTarget && windowTarget !== target) {
      windowTarget.addEventListener("blur", onBlur);
      disposers.push(() => windowTarget.removeEventListener("blur", onBlur));
    }
    this.attachedTargets.set(target, disposers);
  }

  update(gamepads: readonly (GamepadLike | null | undefined)[] = []): InputSnapshot {
    const keyboard = this.keyboard.snapshotSets();
    const pointer = this.pointer.snapshotData();
    this.snapshotRef = new InputSnapshot({
      ...keyboard,
      ...pointer,
      gamepads: this.gamepads.poll(gamepads)
    });
    this.actions.useSnapshot(this.snapshotRef);
    return this.snapshotRef;
  }

  endFrame(): void {
    this.keyboard.endFrame();
    this.pointer.endFrame();
  }

  /** Terminates pointer input after a device is removed, without activating release bindings. */
  disconnectPointer(timestamp?: number): void {
    this.pointer.blur("device-disconnect", timestamp);
    this.releaseCaptures();
  }

  private prepareCaptureReleases(): Array<() => void> {
    return [...this.captureReleasers.values()].map((prepare) => prepare());
  }

  private releaseCaptures(): void {
    // Prepare every target before releasing any of them, so a callback from
    // one target cannot accidentally release a new press on a later target.
    for (const release of this.prepareCaptureReleases()) release();
  }

  dispose(): void {
    this.keyboard.blur();
    this.pointer.blur("dispose");
    const releases = this.prepareCaptureReleases();
    for (const disposers of this.attachedTargets.values()) {
      while (disposers.length > 0) {
        disposers.pop()?.();
      }
    }
    this.attachedTargets.clear();
    for (const release of releases) release();
  }
}
