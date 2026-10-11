/**
 * Broken-control spec transforms (C-30, PRD-02 §15). Pure data transforms —
 * the lane page applies them before the shared translators run, so controls
 * never reach into engine internals.
 */
import type { SceneSpec } from "../../shared/types";

export type Prd02BrokenControl = "no-shadows" | "no-ibl" | "no-background" | "receive-shadow-off" | "receive-shadow-on" | "with-probes";

export function applyBrokenControl(spec: SceneSpec, control: string): SceneSpec {
  // 02-S12: the spec is unchanged; the lane page appends the probe fixtures
  // (scenes/prd02/fixtures.ts) when this control is selected.
  if (control === "with-probes") return spec;
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
  if (control === "no-background") {
    // 02-S8 control (`background: false`): the HDRI backdrop becomes its
    // solid fallback colour; IBL lighting stays.
    return spec.background.kind === "hdri"
      ? { ...spec, background: { kind: "color", color: spec.background.fallbackColor } }
      : spec;
  }
  if (control === "receive-shadow-off" || control === "receive-shadow-on") {
    // 02-T1923: the ground planes ask for `receiveShadow: false` (or keep
    // true). The lane page also registers the C-01 collect fixture that
    // stamps the same value on the Aura render items (scenes/prd02/fixtures.ts).
    const receive = control === "receive-shadow-on";
    return {
      ...spec,
      objects: spec.objects.map((object) =>
        object.kind === "primitive" && object.shape === "plane" ? { ...object, receiveShadow: receive } : object
      )
    };
  }
  throw new Error(`Unknown broken control "${control}"`);
}
