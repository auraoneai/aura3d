export type InputValueProcessor =
  | { readonly type: "deadzone"; readonly threshold: number }
  | { readonly type: "scale"; readonly factor: number }
  | { readonly type: "invert" }
  | { readonly type: "clamp"; readonly min: number; readonly max: number }
  | { readonly type: "exponential"; readonly exponent: number };

/** Apply a deterministic processor sequence to an authored-unit input value. */
export function processInputValue(value: number, processors: readonly InputValueProcessor[], deltaSeconds = 1 / 60): number {
  let result = finite(value, 0);
  for (const processor of processors) {
    if (processor.type === "deadzone") result = Math.abs(result) < Math.max(0, processor.threshold) ? 0 : result;
    else if (processor.type === "scale") result *= finite(processor.factor, 1);
    else if (processor.type === "invert") result *= -1;
    else if (processor.type === "clamp") result = Math.max(processor.min, Math.min(processor.max, result));
    else {
      const sign = Math.sign(result);
      result = sign * Math.pow(Math.abs(result), Math.max(0.01, finite(processor.exponent, 1))) * Math.max(0.001, deltaSeconds / (1 / 60));
    }
  }
  return Number(result.toFixed(4));
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
