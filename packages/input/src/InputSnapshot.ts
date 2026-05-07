export type ButtonState = Readonly<{
  down: boolean;
  pressed: boolean;
  released: boolean;
}>;

export interface PointerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly wheelX: number;
  readonly wheelY: number;
  readonly buttons: ReadonlyMap<number, ButtonState>;
  readonly touches: readonly PointerTouch[];
}

export interface PointerTouch {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

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
  readonly gamepads?: readonly GamepadSnapshot[];
}

const EMPTY_SET = new Set<string>();
const EMPTY_BUTTON_SET = new Set<number>();

export class InputSnapshot {
  readonly keys: ReadonlySet<string>;
  readonly pointer: PointerSnapshot;
  readonly gamepads: readonly GamepadSnapshot[];

  private readonly previousKeys: ReadonlySet<string>;

  constructor(options: InputSnapshotOptions = {}) {
    this.keys = new Set(options.keys ?? EMPTY_SET);
    this.previousKeys = new Set(options.previousKeys ?? EMPTY_SET);
    this.gamepads = Object.freeze([...(options.gamepads ?? [])]);

    const previousButtons = options.previousPointerButtons ?? EMPTY_BUTTON_SET;
    const currentButtons = new Set(options.pointer?.buttons?.keys() ?? []);
    const buttons = new Map<number, ButtonState>();

    for (const button of new Set([...previousButtons, ...currentButtons])) {
      const down = currentButtons.has(button);
      const wasDown = previousButtons.has(button);
      buttons.set(button, Object.freeze({ down, pressed: down && !wasDown, released: !down && wasDown }));
    }

    this.pointer = Object.freeze({
      x: options.pointer?.x ?? 0,
      y: options.pointer?.y ?? 0,
      deltaX: options.pointer?.deltaX ?? 0,
      deltaY: options.pointer?.deltaY ?? 0,
      wheelX: options.pointer?.wheelX ?? 0,
      wheelY: options.pointer?.wheelY ?? 0,
      buttons,
      touches: Object.freeze([...(options.pointer?.touches ?? [])])
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

  gamepadButton(gamepadIndex: number, buttonIndex: number): ButtonState {
    return (
      this.gamepads.find((gamepad) => gamepad.index === gamepadIndex)?.buttons[buttonIndex] ??
      Object.freeze({ down: false, pressed: false, released: false })
    );
  }
}
