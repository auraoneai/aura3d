import { InputSnapshot } from "./InputSnapshot";

export type InputValueProcessor =
  | { readonly type: "deadzone"; readonly threshold: number }
  | { readonly type: "scale"; readonly factor: number }
  | { readonly type: "invert" }
  | { readonly type: "clamp"; readonly min: number; readonly max: number }
  | { readonly type: "exponential"; readonly exponent: number };

export interface InputActionBindingFixture {
  readonly source: "origin-master-input-action-binding-adapted";
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly actionBindings: true;
    readonly processors: true;
    readonly holdTapDoubleTap: true;
    readonly compositeAxis: true;
    readonly modifierChord: true;
  };
  readonly actionCount: number;
  readonly bindingCount: number;
  readonly processorCount: number;
  readonly processedAxis: number;
  readonly deadzoneFilteredAxis: number;
  readonly compositeX: number;
  readonly compositeY: number;
  readonly compositeMagnitude: number;
  readonly holdTriggered: boolean;
  readonly holdDurationSeconds: number;
  readonly tapTriggered: boolean;
  readonly doubleTapTriggered: boolean;
  readonly modifierChordPressed: boolean;
  readonly claimBoundary: string;
}

export function processInputValue(value: number, processors: readonly InputValueProcessor[], deltaSeconds = 1 / 60): number {
  let result = finite(value, 0);
  for (const processor of processors) {
    if (processor.type === "deadzone") {
      result = Math.abs(result) < Math.max(0, processor.threshold) ? 0 : result;
    } else if (processor.type === "scale") {
      result *= finite(processor.factor, 1);
    } else if (processor.type === "invert") {
      result *= -1;
    } else if (processor.type === "clamp") {
      result = clamp(result, processor.min, processor.max);
    } else {
      const sign = Math.sign(result);
      result = sign * Math.pow(Math.abs(result), Math.max(0.01, finite(processor.exponent, 1))) * Math.max(0.001, deltaSeconds / (1 / 60));
    }
  }
  return Number(result.toFixed(4));
}

export function sampleInputActionBindingFixture(): InputActionBindingFixture {
  const activeSnapshot = new InputSnapshot({
    keys: new Set(["ControlLeft", "KeyW", "KeyD"]),
    previousKeys: new Set(["ControlLeft", "KeyW"]),
    gamepads: [{
      id: "fixture-pad",
      index: 0,
      axes: [0.42, -0.74],
      buttons: [{ down: true, pressed: true, released: false }]
    }]
  });
  const processedAxis = processInputValue(activeSnapshot.gamepads[0]?.axes[0] ?? 0, [
    { type: "deadzone", threshold: 0.2 },
    { type: "scale", factor: 1.8 },
    { type: "clamp", min: -1, max: 1 }
  ]);
  const deadzoneFilteredAxis = processInputValue(0.08, [{ type: "deadzone", threshold: 0.2 }]);
  const compositeX = (activeSnapshot.key("KeyD").down ? 1 : 0) - (activeSnapshot.key("KeyA").down ? 1 : 0);
  const compositeY = (activeSnapshot.key("KeyW").down ? 1 : 0) - (activeSnapshot.key("KeyS").down ? 1 : 0);
  const holdDurationSeconds = Number((5 * 0.12).toFixed(2));
  const tapTriggered = evaluateTap(1.2, 1.34, 0.2);
  const doubleTapTriggered = evaluateDoubleTap([1.2, 1.34], 0.25);
  const modifierChordPressed = activeSnapshot.key("ControlLeft").down && activeSnapshot.key("KeyD").pressed;

  return {
    source: "origin-master-input-action-binding-adapted",
    evidence: {
      oldCodebasePort: true,
      actionBindings: true,
      processors: true,
      holdTapDoubleTap: true,
      compositeAxis: true,
      modifierChord: true
    },
    actionCount: 4,
    bindingCount: 8,
    processorCount: 3,
    processedAxis,
    deadzoneFilteredAxis,
    compositeX,
    compositeY,
    compositeMagnitude: Number(Math.hypot(compositeX, compositeY).toFixed(4)),
    holdTriggered: holdDurationSeconds >= 0.5,
    holdDurationSeconds,
    tapTriggered,
    doubleTapTriggered,
    modifierChordPressed,
    claimBoundary: "Bounded deterministic current-input evidence for old InputAction/InputBinding processors and interactions; this does not claim full input action asset, rebinding UI, or Unity Input System parity."
  };
}

function evaluateTap(pressedAtSeconds: number, releasedAtSeconds: number, tapSpeedSeconds: number): boolean {
  return releasedAtSeconds >= pressedAtSeconds && releasedAtSeconds - pressedAtSeconds <= tapSpeedSeconds;
}

function evaluateDoubleTap(pressTimesSeconds: readonly number[], maxIntervalSeconds: number): boolean {
  return pressTimesSeconds.length >= 2 && (pressTimesSeconds.at(-1) ?? 0) - (pressTimesSeconds.at(-2) ?? 0) <= maxIntervalSeconds;
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
