// apps/aura-clash-showcase/src/v2/scene/camera.ts — fighting rig (T2.3).
// Route-local AuraCameraRig (G12 stand-in, direction.standIns[] R-14-10):
// §6.9.3 `rigs.fighting({ fighters: ["p1","p2"], framing: {
// subjectHeightFraction: 0.5 }, fov: 32 })`, pitch −6°, separation dolly.
// Frames the midpoint of the two fighters, solving distance so each fighter
// (~1.8 m) holds ~0.5 of frame height at fov 32, widening for separation.
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";
import { FIGHTER_TARGET_HEIGHT, P1_NODE, P2_NODE } from "./world";

export interface AuraClashFightingRigOptions {
  /** Frame-height fraction each fighter should occupy (art-direction band
   * is [0.45, 0.6]; solve for the midpoint 0.5). */
  readonly subjectHeightFraction?: number;
  /** Vertical fov in degrees (art direction: 32, band [30, 34]). */
  readonly fovDeg?: number;
  /** Downward pitch in degrees (PRD: −6). */
  readonly pitchDeg?: number;
  /** Extra horizontal room around the fighters' separation. */
  readonly separationPad?: number;
}

const UP: AuraVec3 = [0, 1, 0];
const DEG = Math.PI / 180;

export function createAuraClashFightingRig(
  o: AuraClashFightingRigOptions = {}
): AuraCameraRig {
  const fraction = o.subjectHeightFraction ?? 0.5;
  const fovDeg = o.fovDeg ?? 32;
  const pitchRad = (o.pitchDeg ?? 6) * DEG;
  const pad = o.separationPad ?? 0.55;
  const halfFov = (fovDeg / 2) * DEG;
  // Distance solving `fraction` of frame height for a FIGHTER_TARGET_HEIGHT
  // subject in a fovDeg vertical field.
  const subjectDistance = FIGHTER_TARGET_HEIGHT / (2 * Math.tan(halfFov) * fraction);
  let smoothed: AuraVec3 | undefined;
  return {
    id: "aura-clash.fighting",
    reset: () => { smoothed = undefined; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const p1 = ctx.subject(P1_NODE);
      const p2 = ctx.subject(P2_NODE);
      const a = p1?.position ?? [-1.45, 0, 0];
      const b = p2?.position ?? [1.45, 0, 0];
      const midX = (a[0] + b[0]) / 2;
      const midY = Math.max(a[1], b[1]) + FIGHTER_TARGET_HEIGHT * 0.55;
      const midZ = (a[2] + b[2]) / 2;
      const separation = Math.abs(b[0] - a[0]);
      // Separation dolly: pull out until both fighters + pad fit across the
      // horizontal field; never closer than the subject-height solve.
      const halfWidthFov = Math.atan(Math.tan(halfFov) * ctx.aspect);
      const separationDistance = (separation / 2 + pad) / Math.tan(halfWidthFov);
      const distance = Math.max(subjectDistance, separationDistance);
      // Side view, pitched down −6°: camera sits distance behind on +z and
      // rises by pitch (pos − tan(pitch)·d below the look target).
      const wanted: AuraVec3 = [
        midX,
        midY + Math.tan(pitchRad) * distance,
        midZ + distance
      ];
      const k = smoothed === undefined ? 1 : Math.min(1, ctx.dt * 7);
      smoothed = smoothed === undefined
        ? wanted
        : [
            smoothed[0] + (wanted[0] - smoothed[0]) * k,
            smoothed[1] + (wanted[1] - smoothed[1]) * k,
            smoothed[2] + (wanted[2] - smoothed[2]) * k
          ];
      return {
        position: smoothed,
        target: [midX, midY, midZ],
        up: UP,
        roll: 0,
        fov: fovDeg,
        near: 0.05,
        far: 80
      };
    }
  };
}
