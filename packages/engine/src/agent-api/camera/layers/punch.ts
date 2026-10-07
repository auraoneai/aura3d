/**
 * C-22 `punch` layer (PRD-08 §6.5): wraps the createPunchIn envelope —
 * attack/hold/release applying `fovOffset` AND a dolly along the view axis.
 * Reduced motion: dolly ×0 (FOV still applies).
 */
import type { AuraPunchLayer } from "../../../contracts/camera.js";
import { add, normalize, scale, sub } from "./shared.js";

/** `punch` — FOV offset + dolly along the view axis, attack/hold/release. */
export function createPunchLayer(): AuraPunchLayer {
  let fov = 0;
  let dolly = 0;
  let attack = 0.05;
  let hold = 0.03;
  let release = 0.25;
  let clock = Number.POSITIVE_INFINITY;

  const envelope = (): number => {
    if (clock < attack) return attack <= 1e-6 ? 1 : clock / attack;
    if (clock < attack + hold) return 1;
    const r = (clock - attack - hold) / Math.max(release, 1e-6);
    if (r >= 1) return 0;
    const out = 1 - r; // outQuad-ish release
    return out * out;
  };

  return {
    id: "punch",
    trigger(o = {}) {
      fov = o.fov ?? fov;
      dolly = o.dolly ?? dolly;
      attack = o.attack ?? 0.05;
      hold = o.hold ?? 0.03;
      release = o.release ?? 0.25;
      clock = 0;
    },
    apply(pose, ctx) {
      clock += ctx.dt;
      const e = envelope();
      if (e <= 0) return pose;
      const dollyAmount = ctx.reducedMotion ? 0 : dolly * e;
      const dir = normalize(sub(pose.target, pose.position));
      return {
        ...pose,
        position: add(pose.position, scale(dir, dollyAmount)),
        fov: pose.fov + fov * e
      };
    },
    energy: () => envelope()
  };
}
