import { InputSnapshot } from "./InputSnapshot";

export type ActionBinding =
  | { readonly type: "keyboard"; readonly code: string }
  | { readonly type: "keyboard-chord"; readonly codes: readonly string[] }
  | { readonly type: "pointer"; readonly button: number }
  | { readonly type: "gamepad-button"; readonly gamepad?: number; readonly button: number };

export type AxisBinding =
  | { readonly type: "keyboard-axis"; readonly negative: string; readonly positive: string; readonly scale?: number }
  | { readonly type: "pointer-axis"; readonly axis: "x" | "y" | "wheelX" | "wheelY"; readonly scale?: number }
  | { readonly type: "gamepad-axis"; readonly gamepad?: number; readonly axis: number; readonly scale?: number };

export class ActionMap {
  private readonly actions = new Map<string, readonly ActionBinding[]>();
  private readonly axes = new Map<string, readonly AxisBinding[]>();
  private snapshot = new InputSnapshot();

  bind(name: string, bindings: readonly ActionBinding[]): void {
    this.actions.set(name, [...bindings]);
  }

  bindAxis(name: string, bindings: readonly AxisBinding[]): void {
    this.axes.set(name, [...bindings]);
  }

  useSnapshot(snapshot: InputSnapshot): void {
    this.snapshot = snapshot;
  }

  down(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "down");
  }

  pressed(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "pressed");
  }

  released(name: string, snapshot = this.snapshot): boolean {
    return this.evaluate(name, snapshot, "released");
  }

  axis(name: string, snapshot = this.snapshot): number {
    let value = 0;

    for (const binding of this.axes.get(name) ?? []) {
      const scale = binding.scale ?? 1;
      if (binding.type === "keyboard-axis") {
        value += (snapshot.key(binding.positive).down ? 1 : 0) * scale;
        value -= (snapshot.key(binding.negative).down ? 1 : 0) * scale;
      } else if (binding.type === "pointer-axis") {
        const pointerValue =
          binding.axis === "x"
            ? snapshot.pointer.deltaX
            : binding.axis === "y"
              ? snapshot.pointer.deltaY
              : snapshot.pointer[binding.axis];
        value += pointerValue * scale;
      } else {
        const gamepad = snapshot.gamepads.find((pad) => pad.index === (binding.gamepad ?? 0));
        value += (gamepad?.axes[binding.axis] ?? 0) * scale;
      }
    }

    return value;
  }

  private evaluate(name: string, snapshot: InputSnapshot, field: "down" | "pressed" | "released"): boolean {
    return (this.actions.get(name) ?? []).some((binding) => {
      if (binding.type === "keyboard") {
        return snapshot.key(binding.code)[field];
      }
      if (binding.type === "keyboard-chord") {
        return evaluateChord(binding.codes, snapshot, field);
      }
      if (binding.type === "pointer") {
        return snapshot.button(binding.button)[field];
      }
      return snapshot.gamepadButton(binding.gamepad ?? 0, binding.button)[field];
    });
  }
}

function evaluateChord(codes: readonly string[], snapshot: InputSnapshot, field: "down" | "pressed" | "released"): boolean {
  if (codes.length === 0) return false;
  const states = codes.map((code) => snapshot.key(code));
  if (field === "down") {
    return states.every((state) => state.down);
  }
  if (field === "pressed") {
    return states.every((state) => state.down) && states.some((state) => state.pressed);
  }
  return states.some((state) => state.released);
}
