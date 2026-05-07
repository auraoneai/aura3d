import { ActionMap } from "./ActionMap";
import { GamepadDevice, type GamepadLike } from "./GamepadDevice";
import { InputSnapshot } from "./InputSnapshot";
import { KeyboardDevice, type KeyboardEventLike } from "./KeyboardDevice";
import { PointerDevice, type PointerEventLike, type WheelEventLike } from "./PointerDevice";

export interface InputEventTargetLike {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export class InputSystem {
  readonly keyboard = new KeyboardDevice();
  readonly pointer = new PointerDevice();
  readonly gamepads = new GamepadDevice();
  readonly actions = new ActionMap();

  private readonly attachedTargets = new Map<InputEventTargetLike, Array<() => void>>();
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
    const onPointerMove = ((event: Event) => this.pointer.move(event as unknown as PointerEventLike)) as EventListener;
    const onPointerDown = ((event: Event) => this.pointer.down(event as unknown as PointerEventLike)) as EventListener;
    const onPointerUp = ((event: Event) => this.pointer.up(event as unknown as PointerEventLike)) as EventListener;
    const onWheel = ((event: Event) => this.pointer.wheel(event as unknown as WheelEventLike)) as EventListener;
    const onBlur = (() => {
      this.keyboard.blur();
      this.pointer.blur();
    }) as EventListener;

    const listeners: Array<readonly [string, EventListener]> = [
      ["keydown", onKeyDown],
      ["keyup", onKeyUp],
      ["pointermove", onPointerMove],
      ["pointerdown", onPointerDown],
      ["pointerup", onPointerUp],
      ["wheel", onWheel],
      ["blur", onBlur]
    ];

    const disposers: Array<() => void> = [];
    for (const [type, listener] of listeners) {
      target.addEventListener(type, listener);
      disposers.push(() => target.removeEventListener(type, listener));
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

  dispose(): void {
    for (const disposers of this.attachedTargets.values()) {
      while (disposers.length > 0) {
        disposers.pop()?.();
      }
    }
    this.attachedTargets.clear();
    this.keyboard.blur();
    this.pointer.blur();
  }
}
