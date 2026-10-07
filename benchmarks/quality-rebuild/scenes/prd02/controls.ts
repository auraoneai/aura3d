/**
 * Broken-control spec transforms (C-30, PRD-02 §15). Pure data transforms —
 * the lane page applies them before the shared translators run, so controls
 * never reach into engine internals.
 */
import type { SceneSpec } from "../../shared/types";

export type Prd02BrokenControl = "no-shadows" | "no-ibl";

export function applyBrokenControl(spec: SceneSpec, control: string): SceneSpec {
  if (control === "no-shadows") {
    return {
      ...spec,
      lights: spec.lights.map((light) =>
        "castShadow" in light ? ({ ...light, castShadow: false } as typeof light) : light
      ),
      objects: spec.objects.map((object) =>
        "castShadow" in object ? ({ ...object, castShadow: false } as typeof object) : object
      ),
      shadows: undefined,
      csm: undefined
    };
  }
  if (control === "no-ibl") {
    return { ...spec, environment: undefined };
  }
  throw new Error(`Unknown broken control "${control}"`);
}
