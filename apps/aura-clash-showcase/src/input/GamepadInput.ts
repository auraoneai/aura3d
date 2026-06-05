export type GamepadAction =
  | "move-left"
  | "move-right"
  | "jump"
  | "crouch"
  | "dash"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "pause"
  | "restart";

export interface GamepadBinding {
  action: GamepadAction;
  label: string;
  standardButton?: number;
  axis?: number;
  axisDirection?: -1 | 1;
  keyboardFallback: string;
}

export const auraClashGamepadBindings: GamepadBinding[] = [
  { action: "move-left", label: "Move left", axis: 0, axisDirection: -1, keyboardFallback: "A" },
  { action: "move-right", label: "Move right", axis: 0, axisDirection: 1, keyboardFallback: "D" },
  { action: "jump", label: "Jump", standardButton: 0, keyboardFallback: "Space" },
  { action: "crouch", label: "Crouch", axis: 1, axisDirection: 1, keyboardFallback: "S / ArrowDown" },
  { action: "dash", label: "Dash", standardButton: 1, keyboardFallback: "Shift" },
  { action: "guard", label: "Guard", standardButton: 4, keyboardFallback: "Q" },
  { action: "light", label: "Light attack", standardButton: 2, keyboardFallback: "J" },
  { action: "heavy", label: "Heavy attack", standardButton: 3, keyboardFallback: "K" },
  { action: "special", label: "Special", standardButton: 5, keyboardFallback: "L" },
  { action: "pause", label: "Pause", standardButton: 9, keyboardFallback: "P" },
  { action: "restart", label: "Restart", standardButton: 8, keyboardFallback: "R" },
];

export interface GamepadPollResult {
  connected: boolean;
  actions: GamepadAction[];
  sourceLabel: string;
}

export function pollAuraClashGamepad(gamepad: Gamepad | null | undefined): GamepadPollResult {
  if (!gamepad) {
    return {
      connected: false,
      actions: [],
      sourceLabel: "keyboard",
    };
  }

  const actions = auraClashGamepadBindings.flatMap((binding) => {
    if (typeof binding.standardButton === "number" && gamepad.buttons[binding.standardButton]?.pressed) {
      return [binding.action];
    }

    if (typeof binding.axis === "number" && binding.axisDirection && Math.sign(gamepad.axes[binding.axis] ?? 0) === binding.axisDirection) {
      return [binding.action];
    }

    return [];
  });

  return {
    connected: true,
    actions,
    sourceLabel: gamepad.id || "standard gamepad",
  };
}
