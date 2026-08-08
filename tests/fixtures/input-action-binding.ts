import { InputSnapshot, processInputValue } from "../../packages/input/src/index";

export interface InputActionBindingDiagnostic {
  readonly processedAxis: number;
  readonly deadzoneFilteredAxis: number;
  readonly compositeMagnitude: number;
  readonly modifierChordPressed: boolean;
  readonly scope: "test-only-diagnostic";
}

/** Test-only composition of real input primitives; never exported by a runtime package. */
export function createInputActionBindingDiagnostic(): InputActionBindingDiagnostic {
  const snapshot = new InputSnapshot({
    keys: new Set(["ControlLeft", "KeyW", "KeyD"]),
    previousKeys: new Set(["ControlLeft", "KeyW"]),
    gamepads: [{
      id: "diagnostic-pad",
      index: 0,
      axes: [0.42, -0.74],
      buttons: [{ down: true, pressed: true, released: false }]
    }]
  });
  const compositeX = Number(snapshot.key("KeyD").down) - Number(snapshot.key("KeyA").down);
  const compositeY = Number(snapshot.key("KeyW").down) - Number(snapshot.key("KeyS").down);

  return {
    processedAxis: processInputValue(snapshot.gamepads[0]?.axes[0] ?? 0, [
      { type: "deadzone", threshold: 0.2 },
      { type: "scale", factor: 1.8 },
      { type: "clamp", min: -1, max: 1 }
    ]),
    deadzoneFilteredAxis: processInputValue(0.08, [{ type: "deadzone", threshold: 0.2 }]),
    compositeMagnitude: Number(Math.hypot(compositeX, compositeY).toFixed(4)),
    modifierChordPressed: snapshot.key("ControlLeft").down && snapshot.key("KeyD").pressed,
    scope: "test-only-diagnostic"
  };
}
