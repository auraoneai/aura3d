/**
 * `rigs.topDown` (PRD-08 §6.4, §7.1 R-7): fixed-pitch camera following the
 * centroid of one or many targets with a dead zone; `bounds` clamps the look
 * point so arena edges stay framed; `pitchDeg ≥ 89.5` swaps the up vector to
 * the fight-plane forward so `lookAtMat4` stays finite (§6.4).
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { springDampVec3 } from "../Spring.js";
import { distanceForFractionInContext } from "../framing.js";
import { add, mul, subjectHeight } from "./rigUtils.js";

const DEG = Math.PI / 180;

export interface TopDownRigOptions {
  readonly target?: string | readonly string[];
  /** Camera tilt from straight-down in degrees (default 75). */
  readonly pitchDeg?: number;
  readonly height?: number;
  readonly deadZone?: { readonly x: number; readonly y: number };
  /** Arena bounds; the look point clamps so the edges stay inside the frame. */
  readonly bounds?: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly fov?: number;
  readonly centreHalflife?: number;
  /** When set, altitude is solved so the tallest subject fills this fraction of frame height (#76). */
  readonly framing?: { readonly subjectHeightFraction: number };
}

export function createTopDownRig(o: TopDownRigOptions = {}): AuraCameraRig {
  const pitchDeg = o.pitchDeg ?? 75;
  const height = o.height ?? 14;
  const deadZone = o.deadZone ?? { x: 0.1, y: 0.1 };
  const fov = o.fov ?? 45;
  const centreHalflife = o.centreHalflife ?? 0.12;
  const pitch = pitchDeg * DEG;
  // Arm: straight down for pitch 90°, else tilted back along +Z (per-frame:
  // `back` scales with the solved altitude, not just `o.height`).
  // Up-vector degeneracy: at ≥89.5° the view axis is (near) parallel to
  // world-up — pass the plane forward instead (§6.4).
  const upVec: AuraVec3 = Math.abs(pitchDeg) >= 89.5 ? [0, 0, -1] : [0, 1, 0];

  let centre: AuraVec3 | undefined;

  return {
    id: "topDown",
    reset(pose) {
      centre = pose ? [...pose.target] : undefined;
    },
    update(ctx) {
      const refs = Array.isArray(o.target) ? o.target : [o.target].filter((t): t is string => !!t);
      const pts: AuraVec3[] = [];
      let maxSubjectH = 0;
      for (const ref of refs) {
        const s = ctx.subject(ref);
        if (s) {
          pts.push(s.position);
          maxSubjectH = Math.max(maxSubjectH, subjectHeight(s));
        }
      }
      if (pts.length === 0 && refs.length === 0) pts.push(ctx.previous.target);
      if (pts.length === 0) return ctx.previous;
      let centroid = pts[0];
      for (let i = 1; i < pts.length; i++) centroid = add(centroid, pts[i]);
      centroid = mul(centroid, 1 / pts.length);

      // Framing solver wins over the fixed altitude when set (#76): the
      // tallest subject fills `subjectHeightFraction` of frame height.
      const heightNow =
        o.framing !== undefined && maxSubjectH > 0
          ? distanceForFractionInContext(maxSubjectH, fov, o.framing.subjectHeightFraction, { aspect: ctx.aspect })
          : height;

      // World-space dead zone on the ground plane.
      const halfH = Math.tan(((fov / 2) * Math.PI) / 180) * heightNow;
      const halfW = halfH * ctx.aspect;
      if (centre === undefined) centre = centroid;
      const dzX = deadZone.x * halfW;
      const dzZ = deadZone.y * halfH;
      const desiredX = Math.abs(centroid[0] - centre[0]) > dzX ? centroid[0] : centre[0];
      const desiredZ = Math.abs(centroid[2] - centre[2]) > dzZ ? centroid[2] : centre[2];
      centre = springDampVec3(centre, [desiredX, 0, desiredZ], centreHalflife, ctx.dt);

      // Arena clamp: the look point stays inside [edge - halfFrame, edge + halfFrame]
      // so all four arena edges project into the frame when the arena fits.
      if (o.bounds) {
        const [minB, maxB] = [o.bounds.min, o.bounds.max];
        const clampToFrame = (c: number, lo: number, hi: number, half: number): number => {
          if ((hi - lo) / 2 > half) return (lo + hi) / 2; // arena wider than frame → centre
          return Math.min(Math.max(c, hi - half), lo + half);
        };
        centre = [
          clampToFrame(centre[0], minB[0], maxB[0], halfW),
          centre[1],
          clampToFrame(centre[2], minB[2], maxB[2], halfH)
        ];
      }

      return {
        position: [centre[0], heightNow, centre[2] + Math.cos(pitch) * heightNow],
        target: centre,
        up: upVec,
        roll: 0,
        fov,
        near: Math.max(0.05, heightNow * 0.02),
        far: ctx.previous.far
      };
    }
  };
}
