import type { ButtonState, GamepadSnapshot } from "./InputSnapshot";

export interface GamepadButtonLike {
  readonly pressed: boolean;
  readonly value: number;
}

export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly GamepadButtonLike[];
}

export class GamepadDevice {
  private previousButtons = new Map<string, readonly boolean[]>();

  poll(gamepads: readonly (GamepadLike | null | undefined)[], deadZone = 0.1): readonly GamepadSnapshot[] {
    const snapshots: GamepadSnapshot[] = [];

    for (const gamepad of gamepads) {
      if (!gamepad?.connected) {
        continue;
      }

      const key = `${gamepad.index}:${gamepad.id}`;
      const previous = this.previousButtons.get(key) ?? [];
      const buttons: ButtonState[] = gamepad.buttons.map((button, index) => {
        const down = button.pressed || button.value > 0.5;
        const wasDown = previous[index] ?? false;
        return Object.freeze({ down, pressed: down && !wasDown, released: !down && wasDown });
      });

      snapshots.push(
        Object.freeze({
          id: gamepad.id,
          index: gamepad.index,
          axes: Object.freeze(gamepad.axes.map((axis) => (Math.abs(axis) < deadZone ? 0 : axis))),
          buttons: Object.freeze(buttons)
        })
      );
      this.previousButtons.set(key, buttons.map((button) => button.down));
    }

    return snapshots;
  }
}
