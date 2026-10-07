/**
 * C-22 `fovKick` layer (PRD-08 §6.5): named continuous FOV offset channels,
 * each damped to its set value and summed. Reduced motion: ×0.5.
 */
import type { AuraFovKickLayer } from "../../../contracts/camera.js";
import { springDamp } from "../Spring.js";

/** `fovKick` — named continuous FOV offset channels, each damped to its set value. */
export function createFovKickLayer(defaultHalflife = 0.15): AuraFovKickLayer {
  const channels = new Map<string, { offset: number; halflife: number; value: number }>();
  return {
    id: "fovKick",
    set(channel, offsetDeg, halflife = defaultHalflife) {
      const c = channels.get(channel) ?? { offset: 0, halflife, value: 0 };
      c.offset = offsetDeg;
      c.halflife = halflife;
      channels.set(channel, c);
    },
    apply(pose, ctx) {
      let kick = 0;
      for (const c of channels.values()) {
        c.value = springDamp(c.value, c.offset, c.halflife, ctx.dt);
        kick += c.value;
      }
      const applied = ctx.reducedMotion ? kick * 0.5 : kick;
      return applied === 0 ? pose : { ...pose, fov: pose.fov + applied };
    },
    energy: () => {
      let e = 0;
      for (const c of channels.values()) e = Math.max(e, Math.abs(c.value));
      return e;
    }
  };
}
