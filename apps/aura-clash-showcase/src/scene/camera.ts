// apps/aura-clash-showcase/src/v2/scene/camera.ts — fighting rig (T2.3).
// Route-local AuraCameraRig (G12 stand-in, direction.standIns[] R-14-10):
// side-on `follow` per the aura3d-art-direction fighting recipe row
// (look-recipes.md: fov 45, subject 20-30% of frame height for the pair,
// top spot, `arena-fight` post). Frames the midpoint of the two fighters,
// solving distance by construction from aspect + separation so BOTH
// fighters and the arena floor stay in frame at any viewport — no
// per-viewport constants.
//
// Solve: distance = max(subjectDistance, separationDistance) where
// subjectDistance holds each fighter (FIGHTER_TARGET_HEIGHT) at
// `subjectHeightFraction` (0.25, recipe band midpoint) of frame height and
// separationDistance fits separation/2 + pad across the horizontal field.
// In portrait the separation term governs and the fraction falls as
// H*aspect/(separation + 2*pad) — at 390x844 and the 2.9 m opening
// separation that is 0.208, inside the recipe band; at wall-to-wall
// separation both-in-frame wins over the band (geometric necessity).
// The previous 32°/0.5 solve put the camera at z=6.28, inside the
// error corridor of the foreground skyline copy that used to sit at
// z=2.1 in world.ts (lane run 38414884637: full-frame brick at
// 1920x1080, brick-dominated openings at every viewport).
import type {
  AuraCameraPose, AuraCameraRig, AuraCameraRigContext, AuraVec3
} from "@aura3d/engine";
import { FIGHTER_TARGET_HEIGHT, P1_NODE, P2_NODE, STAGE_HALF_WIDTH } from "./world";

export interface AuraClashFightingRigOptions {
  /** Frame-height fraction each fighter should occupy (recipe band
   * is [0.20, 0.30] for the pair; solve for the midpoint 0.25). */
  readonly subjectHeightFraction?: number;
  /** Vertical fov in degrees (recipe fighting row: 45). */
  readonly fovDeg?: number;
  /** Downward pitch in degrees (PRD: −6). */
  readonly pitchDeg?: number;
  /** Extra horizontal room around the fighters' separation. */
  readonly separationPad?: number;
}

const UP: AuraVec3 = [0, 1, 0];
const DEG = Math.PI / 180;

export const AURA_CLASH_FIGHTING_FOV_DEG = 45;
export const AURA_CLASH_SUBJECT_HEIGHT_FRACTION = 0.25;
export const AURA_CLASH_SEPARATION_PAD = 0.55;

export interface AuraClashFightingSolveInput {
  readonly aspect: number;
  readonly separation: number;
  readonly fovDeg?: number;
  readonly subjectHeightFraction?: number;
  readonly subjectHeight?: number;
  readonly separationPad?: number;
}

/**
 * Aspect-aware fighting-camera distance solve (pure). `subjectDistance`
 * holds the subject at the recipe fraction of frame height;
 * `separationDistance` fits both fighters + pad across the horizontal
 * field. The result is their max, so both constraints hold by
 * construction at any aspect.
 */
export function solveAuraClashFightingDistance(input: AuraClashFightingSolveInput): {
  readonly distance: number;
  readonly subjectDistance: number;
  readonly separationDistance: number;
} {
  const fovDeg = input.fovDeg ?? AURA_CLASH_FIGHTING_FOV_DEG;
  const fraction = input.subjectHeightFraction ?? AURA_CLASH_SUBJECT_HEIGHT_FRACTION;
  const height = input.subjectHeight ?? FIGHTER_TARGET_HEIGHT;
  const pad = input.separationPad ?? AURA_CLASH_SEPARATION_PAD;
  const halfFov = (fovDeg / 2) * DEG;
  const aspect = Math.max(input.aspect, 0.05);
  const subjectDistance = height / (2 * Math.tan(halfFov) * fraction);
  const separationDistance =
    (Math.max(input.separation, 0) / 2 + pad) / (Math.tan(halfFov) * aspect);
  return {
    distance: Math.max(subjectDistance, separationDistance),
    subjectDistance,
    separationDistance
  };
}

/**
 * Screen-height fraction of a vertical segment under a column-major
 * view-projection matrix (engine convention: x' = m[0]x + m[4]y + m[8]z
 * + m[12], w from m[3]/m[7]/m[11]/m[15]). Projects the fighter's feet and
 * head (authored height above the kit body position) and returns the NDC
 * height share — the honest measured counterpart of the rig solve.
 * Returns null when either end is behind the camera.
 */
export function projectedSubjectHeightFraction(
  viewProjection: readonly number[],
  base: readonly [number, number, number],
  height: number = FIGHTER_TARGET_HEIGHT
): number | null {
  if (viewProjection.length < 16) return null;
  const projectY = (y: number): number | null => {
    const w =
      viewProjection[3]! * base[0] +
      viewProjection[7]! * y +
      viewProjection[11]! * base[2] +
      viewProjection[15]!;
    if (!(w > 1e-9)) return null;
    const clipY =
      viewProjection[1]! * base[0] +
      viewProjection[5]! * y +
      viewProjection[9]! * base[2] +
      viewProjection[13]!;
    return clipY / w;
  };
  const feet = projectY(base[1]);
  const head = projectY(base[1] + height);
  if (feet === null || head === null) return null;
  return Math.abs(head - feet) / 2;
}

export function createAuraClashFightingRig(
  o: AuraClashFightingRigOptions = {}
): AuraCameraRig {
  const fraction = o.subjectHeightFraction ?? AURA_CLASH_SUBJECT_HEIGHT_FRACTION;
  const fovDeg = o.fovDeg ?? AURA_CLASH_FIGHTING_FOV_DEG;
  const pitchRad = (o.pitchDeg ?? 6) * DEG;
  const pad = o.separationPad ?? AURA_CLASH_SEPARATION_PAD;
  let smoothed: AuraVec3 | undefined;
  return {
    id: "aura-clash.fighting",
    continuous: true,
    reset: () => { smoothed = undefined; },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const p1 = ctx.subject(P1_NODE);
      const p2 = ctx.subject(P2_NODE);
      const a = p1?.position ?? [-1.45, 0, 0];
      const b = p2?.position ?? [1.45, 0, 0];
      // Midpoint, clamped to the stage so a transient body position can
      // never drag the frame past the arena wall.
      const midX = Math.max(
        -STAGE_HALF_WIDTH,
        Math.min(STAGE_HALF_WIDTH, (a[0] + b[0]) / 2)
      );
      const midY = Math.max(a[1], b[1]) + FIGHTER_TARGET_HEIGHT * 0.55;
      const midZ = (a[2] + b[2]) / 2;
      const separation = Math.abs(b[0] - a[0]);
      const { distance } = solveAuraClashFightingDistance({
        aspect: ctx.aspect,
        separation,
        fovDeg,
        subjectHeightFraction: fraction,
        separationPad: pad
      });
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
