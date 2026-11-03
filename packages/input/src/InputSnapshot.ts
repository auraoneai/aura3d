export type ButtonState = Readonly<{
  down: boolean;
  pressed: boolean;
  released: boolean;
}>;

/** Client coordinates are viewport CSS pixels; CSS coordinates are relative to the target's
 * unscaled content rectangle; framebuffer coordinates use that target's drawing-buffer dimensions
 * with the same top-left origin (convert Y for bottom-left graphics readback).
 * Legacy x/y and deltaX/deltaY use framebuffer coordinates. */
export interface PointerCoordinates {
  readonly clientX: number;
  readonly clientY: number;
  readonly cssX: number;
  readonly cssY: number;
  readonly framebufferX: number;
  readonly framebufferY: number;
}

export type PointerCancellationReason = "pointercancel" | "lostpointercapture" | "blur" | "device-disconnect" | "dispose";

export interface PointerCancellation {
  readonly id: number;
  readonly reason: PointerCancellationReason;
  readonly timestamp: number;
}

/** Touch x/y are framebuffer coordinates, matching the historical pointer x/y fields. */
export interface PointerTouch {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** A contact remains in the frame that releases or cancels it, then is retired at endFrame. */
export interface PointerContact extends PointerTouch, PointerCoordinates {
  readonly pointerType: string;
  readonly overTarget: boolean;
  readonly timestamp: number;
  readonly startedAt: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly maxClientDistance: number;
  readonly hadMultipleContacts: boolean;
  readonly startX: number;
  readonly startY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly buttons: ReadonlyMap<number, ButtonState>;
  readonly down: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
  readonly cancelled: boolean;
}

export interface PointerSnapshot extends Partial<PointerCoordinates> {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly wheelX: number;
  readonly wheelY: number;
  readonly timestamp?: number;
  readonly primaryId?: number;
  readonly buttons: ReadonlyMap<number, ButtonState>;
  readonly touches: readonly PointerTouch[];
  readonly contacts?: readonly PointerContact[];
  readonly cancellations?: readonly PointerCancellation[];
  /** Whole-device termination such as focus loss, even when no button was held. */
  readonly cancellationReason?: PointerCancellationReason;
}

/** The normalized pointer returned by InputSnapshot always contains the new fields. */
export type ResolvedPointerSnapshot = PointerSnapshot & PointerCoordinates & {
  readonly timestamp: number;
  readonly contacts: readonly PointerContact[];
  readonly cancellations: readonly PointerCancellation[];
};

export interface GamepadSnapshot {
  readonly id: string;
  readonly index: number;
  readonly axes: readonly number[];
  readonly buttons: readonly ButtonState[];
}

export interface InputSnapshotOptions {
  readonly keys?: ReadonlySet<string>;
  readonly previousKeys?: ReadonlySet<string>;
  readonly pointer?: Partial<PointerSnapshot>;
  readonly previousPointerButtons?: ReadonlySet<number>;
  /** Buttons whose last owner was cancelled rather than released during this frame. */
  readonly cancelledPointerButtons?: ReadonlySet<number>;
  readonly gamepads?: readonly GamepadSnapshot[];
}

const EMPTY_SET = new Set<string>();
const EMPTY_BUTTON_SET = new Set<number>();

export class InputSnapshot {
  readonly keys: ReadonlySet<string>;
  readonly pointer: ResolvedPointerSnapshot;
  readonly gamepads: readonly GamepadSnapshot[];

  private readonly previousKeys: ReadonlySet<string>;

  constructor(options: InputSnapshotOptions = {}) {
    this.keys = new Set(options.keys ?? EMPTY_SET);
    this.previousKeys = new Set(options.previousKeys ?? EMPTY_SET);
    this.gamepads = Object.freeze([...(options.gamepads ?? [])]);

    const previousButtons = options.previousPointerButtons ?? EMPTY_BUTTON_SET;
    const currentButtons = new Set([...options.pointer?.buttons ?? []].filter(([, state]) => state.down).map(([button]) => button));
    const buttons = new Map<number, ButtonState>();

    for (const button of new Set([...previousButtons, ...currentButtons])) {
      const down = currentButtons.has(button);
      const wasDown = previousButtons.has(button);
      buttons.set(button, Object.freeze({
        down,
        pressed: down && !wasDown,
        released: !down && wasDown && !options.cancelledPointerButtons?.has(button)
      }));
    }

    const x = options.pointer?.x ?? 0;
    const y = options.pointer?.y ?? 0;
    this.pointer = Object.freeze({
      x,
      y,
      clientX: options.pointer?.clientX ?? x,
      clientY: options.pointer?.clientY ?? y,
      cssX: options.pointer?.cssX ?? x,
      cssY: options.pointer?.cssY ?? y,
      framebufferX: options.pointer?.framebufferX ?? x,
      framebufferY: options.pointer?.framebufferY ?? y,
      deltaX: options.pointer?.deltaX ?? 0,
      deltaY: options.pointer?.deltaY ?? 0,
      wheelX: options.pointer?.wheelX ?? 0,
      wheelY: options.pointer?.wheelY ?? 0,
      timestamp: options.pointer?.timestamp ?? 0,
      primaryId: options.pointer?.primaryId,
      buttons,
      touches: Object.freeze([...(options.pointer?.touches ?? [])]),
      contacts: Object.freeze([...(options.pointer?.contacts ?? [])]),
      cancellations: Object.freeze([...(options.pointer?.cancellations ?? [])]),
      cancellationReason: options.pointer?.cancellationReason
    });
  }

  key(code: string): ButtonState {
    const down = this.keys.has(code);
    const wasDown = this.previousKeys.has(code);
    return Object.freeze({ down, pressed: down && !wasDown, released: !down && wasDown });
  }

  button(button: number): ButtonState {
    return this.pointer.buttons.get(button) ?? Object.freeze({ down: false, pressed: false, released: false });
  }

  /** View the same frame from one contact, useful to compute one picking ray per pointer. */
  forContact(contact: PointerContact): InputSnapshot {
    const view = Object.create(this) as InputSnapshot;
    Object.defineProperty(view, "pointer", { value: Object.freeze({
      ...this.pointer,
      x: contact.x, y: contact.y,
      clientX: contact.clientX, clientY: contact.clientY,
      cssX: contact.cssX, cssY: contact.cssY,
      framebufferX: contact.framebufferX, framebufferY: contact.framebufferY,
      deltaX: contact.deltaX, deltaY: contact.deltaY,
      timestamp: contact.timestamp, primaryId: contact.id, buttons: contact.buttons
    }) });
    return view;
  }

  gamepadButton(gamepadIndex: number, buttonIndex: number): ButtonState {
    return (
      this.gamepads.find((gamepad) => gamepad.index === gamepadIndex)?.buttons[buttonIndex] ??
      Object.freeze({ down: false, pressed: false, released: false })
    );
  }
}
