/**
 * `rigs.fighting` (PRD-08 §6.4, §7.1 R-4): side-on camera at the fighters'
 * midpoint, distance solved so both fighters' bounds stay inside the [15%, 85%]
 * horizontal band at height fraction ~0.5. Zoom is distance-only (FOV constant)
 * and the camera never leaves the fight plane's normal.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { springDampVec3, springDamp } from "../Spring.js";
import { add, length3, mul, nearForDistance, sub, subjectHalfWidth, subjectHeight } from "./rigUtils.js";

export interface FightingRigOptions {
  readonly fighters: readonly [string, string];
  /** Fight plane is the XZ line through the fighters; camera sits on +Z/-Z. */
  readonly plane?: "xz-side";
  readonly side?: 1 | -1;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly framing?: { readonly subjectHeightFraction: number };
  readonly fov?: number;
  readonly midHalflife?: number;
  readonly distHalflife?: number;
}

export function createFightingRig(o: FightingRigOptions): AuraCameraRig {
  const minDistance = o.minDistance ?? 4;
  const maxDistance = o.maxDistance ?? 14;
  const fov = o.fov ?? 45;
  const fraction = o.framing?.subjectHeightFraction ?? 0.5;
  const midHalflife = o.midHalflife ?? 0.1;
  const distHalflife = o.distHalflife ?? 0.15;
  const side = o.side ?? 1;

  let midpoint: AuraVec3 | undefined;
  let dist = Number.NaN;

  return {
    id: "fighting",
    continuous: true,
    reset(pose) {
      midpoint = undefined;
      dist = Number.NaN;
      if (pose) midpoint = [...pose.target];
    },
    update(ctx) {
      const a = ctx.subject(o.fighters[0]);
      const b = ctx.subject(o.fighters[1]);
      if (!a && !b) return ctx.previous;
      const pa = a?.position ?? b!.position;
      const pb = b?.position ?? a!.position;

      const mid: AuraVec3 = mul(add(pa, pb), 0.5);
      midpoint = midpoint === undefined ? mid : springDampVec3(midpoint, mid, midHalflife, ctx.dt);

      const sep = length3(sub(pb, pa));
      const halfW = Math.max(subjectHalfWidth(a ?? b!), subjectHalfWidth(b ?? a!));
      const h = Math.max(subjectHeight(a ?? b!), subjectHeight(b ?? a!));

      // Both fighters inside the [15%,85%] band → visible half-extent covers
      // (sep/2 + halfW) at 70% of the frame half-width.
      const vFov = (fov * Math.PI) / 180;
      const hHalf = Math.tan(vFov / 2) * ctx.aspect;
      const needX = sep / 2 + halfW;
      const dX = needX / (hHalf * 0.7);
      // Height fraction target (default 0.5): d = h/(2·tan(fov/2)·p).
      const dY = h / (2 * Math.tan(vFov / 2) * fraction);
      const dTarget = Math.min(maxDistance, Math.max(minDistance, dX, dY));
      dist = Number.isNaN(dist) ? dTarget : springDamp(dist, dTarget, distHalflife, ctx.dt);

      // Fight-plane normal: camera stays on +Z/-Z of the midpoint, never orbits.
      const eye: AuraVec3 = [midpoint[0], midpoint[1] + h * 0.4, midpoint[2] + side * dist];
      return {
        position: eye,
        target: midpoint,
        up: [0, 1, 0],
        roll: 0,
        fov,
        near: nearForDistance(dist),
        far: ctx.previous.far
      };
    }
  };
}

import { registerRigFactory } from "./registry.js";

registerRigFactory("fighting", (o: unknown) => createFightingRig(o as Parameters<typeof createFightingRig>[0]));
