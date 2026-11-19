/**
 * IRON CROWN cinematics (GU47 WP-15 IC47-C1, the signature's "letterboxed intro and K.O. cinematics").
 *
 * Camera-only: the shots read the fighters' positions and the bout phase and never write gameplay state. They play
 * inside the existing phase windows (intro 1.35 s, K.O. 1.7 s, bout end), so round pacing and the sim stay as they
 * are (PRD D8). Shots:
 * - intro: a venue dolly, then a close-up on each fighter (three shots, skippable: any input ends the intro);
 * - K.O.: an orbit around the pair;
 * - bout end: a low hero shot on the winner.
 * Letterbox bars (LETTERBOX_BAR of the viewport each) frame every shot. Reduced motion: the same shots as static cuts
 * (no dolly, no orbit travel).
 *
 * Pure functions: tests drive them without an app.
 */
import type { AuraVec3 } from "@aura3d/engine";

export type CinematicPhase = "attract" | "intro" | "fight" | "ko" | "roundEnd" | "boutEnd";

export interface CinematicInput {
  readonly phase: CinematicPhase;
  /** Seconds since the phase began (camera clock). */
  readonly t: number;
  readonly p1: AuraVec3;
  readonly p2: AuraVec3;
  /** The bout winner's position at bout end, `null` on a draw. */
  readonly winner: AuraVec3 | null;
  readonly reducedMotion: boolean;
}

export interface CinematicShot {
  readonly name: "venue-dolly" | "p1-closeup" | "p2-closeup" | "ko-orbit" | "win-hero";
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
}

/**
 * IC47-C2: the fight lens. fov 40 (the tight end of 40-45, so the pair stays large) with the lens lowered (lift 0.6 m above the rig, was 0.82) and aimed a
 * little higher (0.78 m, was 0.72), so the pair reads taller in frame. The FOV kick on dash and special is the feel
 * preset's punch (main.ts feel table: dash 1.1 deg, special 2.6 deg). Bounding-box share is measured in phase 2.
 */
export const FIGHT_LENS = { fov: 43, lift: 0.68, aim: 0.84 } as const;

export interface FightCameraFrameInput {
  readonly baseEye: AuraVec3;
  readonly baseTarget: AuraVec3;
  readonly p1: AuraVec3;
  readonly p2: AuraVec3;
  /** Viewport width / height (e.g. ~0.46 on 390x844 portrait, ~1.78 on 16:9 desktop). */
  readonly aspect: number;
  readonly fovKickDeg?: number;
}

/**
 * WP-09 live fight framing: tracks vertical jump height (`max(p1.y, p2.y)`) so airborne fighters never clip
 * behind the top HUD bar, and widens/pulls back cleanly on narrow portrait viewports (`390x844`).
 */
export function fightCameraFrame(input: FightCameraFrameInput): {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
} {
  const maxJumpY = Math.max(0, input.p1[1], input.p2[1]);
  const pairSpan = Math.abs(input.p1[0] - input.p2[0]);
  const safeAspect = Number.isFinite(input.aspect) && input.aspect > 0.2 ? input.aspect : 16 / 9;
  const portraitRatio = Math.max(0, 0.92 - safeAspect);
  const portraitPullback = portraitRatio > 0
    ? Math.min(3.5, portraitRatio * 4.4 + Math.max(0, pairSpan - 2.2) * 0.42)
    : 0;
  const jumpPullback = Math.min(1.35, maxJumpY * 0.65);
  const portraitFovBoost = portraitRatio > 0 ? Math.min(8, portraitRatio * 15.5) : 0;

  const eyeY = Math.min(input.baseEye[1], FIGHT_LENS.lift + 0.92) + maxJumpY * 0.48 + portraitRatio * 0.22;
  const aimY = Math.max(input.baseTarget[1], FIGHT_LENS.aim) + maxJumpY * 0.72 + portraitRatio * 0.08;
  const eyeZ = input.baseEye[2] + jumpPullback + portraitPullback;
  const fov = Math.max(30, Math.min(62, FIGHT_LENS.fov + portraitFovBoost + (input.fovKickDeg ?? 0)));

  return {
    position: [input.baseEye[0], eyeY, eyeZ],
    target: [input.baseTarget[0], aimY, input.baseTarget[2]],
    fov
  };
}

/** Shot starts inside the 1.35 s intro (seconds). */
export const INTRO_SHOTS = { dolly: 0, p1: 0.55, p2: 0.95 } as const;
/** The intro's length today (main.ts phase machine); C1's acceptance caps it at 4.0 s. */
export const INTRO_SECONDS = 1.35;
/** K.O. orbit: radians per second and the radius around the pair. */
export const KO_ORBIT = { start: -0.55, rate: 0.5, radius: 5.4, height: 2.1 } as const;

const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function closeUp(name: "p1-closeup" | "p2-closeup", subject: AuraVec3, side: 1 | -1): CinematicShot {
  // Three-quarter front, lens slightly below the face, looking up a little at the fighter.
  return {
    name,
    position: [subject[0] + side * 0.95, 1.35, subject[2] + 2.7],
    target: [subject[0], 1.42, subject[2]],
    fov: 34
  };
}

/** The cinematic shot for this frame, or `null` when the fighting rig frames the pair. */
export function cinematicShot(input: CinematicInput): CinematicShot | null {
  const mid: AuraVec3 = [(input.p1[0] + input.p2[0]) / 2, 0, (input.p1[2] + input.p2[2]) / 2];
  if (input.phase === "intro") {
    if (input.t < INTRO_SHOTS.p1) {
      const k = input.reducedMotion ? 1 : smooth(input.t / INTRO_SHOTS.p1);
      return {
        name: "venue-dolly",
        position: [mid[0], lerp(3.9, 2.5, k), lerp(12.5, 8.6, k)],
        target: [mid[0], lerp(1.9, 1.2, k), mid[2]],
        fov: 44
      };
    }
    // P1 fights from the left, so its close-up is framed from its outer (left) side; the rival's from the right.
    if (input.t < INTRO_SHOTS.p2) return closeUp("p1-closeup", input.p1, -1);
    return closeUp("p2-closeup", input.p2, 1);
  }
  if (input.phase === "ko") {
    const angle = KO_ORBIT.start + (input.reducedMotion ? 0 : input.t * KO_ORBIT.rate);
    return {
      name: "ko-orbit",
      position: [mid[0] + Math.sin(angle) * KO_ORBIT.radius, KO_ORBIT.height, mid[2] + Math.cos(angle) * KO_ORBIT.radius],
      target: [mid[0], 1.0, mid[2]],
      fov: 42
    };
  }
  if (input.phase === "boutEnd" && input.winner) {
    const w = input.winner;
    // Aim at the body's middle (1.15 m, still above the 0.85 m lens: a low shot looking up). Aimed at the chest (1.5 m)
    // the 1280x720 frame cut the winner at the knees (real-GPU bout-end frame); main.ts then dollies it back across the
    // floor until the whole body fits inside the letterbox (cinematicLandscapeSafe / fitDollyFactor).
    return { name: "win-hero", position: [w[0] + 0.6, 0.85, w[2] + 3.1], target: [w[0], WIN_SHOT_AIM_Y, w[2]], fov: 36 };
  }
  return null;
}

/** Aim height (m) of the win hero shot: the winner's middle, so head and feet both fit the letterboxed frame. */
export const WIN_SHOT_AIM_Y = 1.15;

/** Letterbox bars are shown while the camera performs (intro, K.O. and bout end). */
export function letterboxWanted(phase: CinematicPhase, hasWinner: boolean): boolean {
  return phase === "intro" || phase === "ko" || (phase === "boutEnd" && hasWinner);
}

/** The camera's phase clock: resets when the phase changes, else advances by dt. */
export function createCinematicClock() {
  let phase: CinematicPhase | null = null;
  let t = 0;
  return {
    tick(next: CinematicPhase, dt: number): number {
      if (next !== phase) {
        phase = next;
        t = 0;
      } else {
        t += Math.max(0, dt);
      }
      return t;
    }
  };
}

/** IC47-P3: the post cue for this frame (applied through `app.post.setEffect` / `setEffectEnabled`). */
export interface CinematicPost {
  /** Depth of field on the performed shots only, focused on the shot's subject; `null` = off (the neutral fight). */
  readonly dof: { readonly focusDistance: number; readonly fStop: number } | null;
  /** Chromatic aberration intensity (0 = off). */
  readonly chromaticAberration: number;
  /** Vignette intensity (the venue's base plus the pulse). */
  readonly vignette: number;
}

/** Seconds a special or K.O. pulse lasts, and its peaks. */
export const POST_PULSE = { seconds: 0.4, chromaticAberration: 0.6, vignette: 0.18 } as const;

/**
 * The post cue: DOF focused on the subject while a shot plays (f/2.0 close-ups, f/4 elsewhere), and a chromatic
 * aberration plus vignette pulse that decays over POST_PULSE.seconds after a special or a K.O. (`pulseAge`: seconds
 * since the last one, Infinity when none). Reduced motion: no pulse (DOF still frames the shot, it does not move).
 */
export function cinematicPost(shot: CinematicShot | null, pulseAge: number, baseVignette: number, reducedMotion: boolean): CinematicPost {
  const dof = shot
    ? {
        focusDistance: Number(
          Math.hypot(shot.position[0] - shot.target[0], shot.position[1] - shot.target[1], shot.position[2] - shot.target[2]).toFixed(2)
        ),
        fStop: shot.name === "p1-closeup" || shot.name === "p2-closeup" || shot.name === "win-hero" ? 2 : 4
      }
    : null;
  const k = reducedMotion || !(pulseAge >= 0) || pulseAge >= POST_PULSE.seconds ? 0 : 1 - pulseAge / POST_PULSE.seconds;
  const pulse = Math.round(k * k * 100) / 100; // quantised so the runtime override only changes on a visible step
  return {
    dof,
    chromaticAberration: Number((pulse * POST_PULSE.chromaticAberration).toFixed(3)),
    vignette: Number((baseVignette + pulse * POST_PULSE.vignette).toFixed(3))
  };
}

/** IC47-H1: which HUD element slams in when the shot changes (synced to the C1 intro), `null` for none. */
export type HudSlam = "p1" | "p2" | "center";

/**
 * The P1 plate slams in on the P1 close-up, the P2 plate on the P2 close-up, and the round timer when the intro hands
 * over to the fight lens. Pure: main.ts feeds it the previous and current shot names each frame.
 */
export function hudSlamFor(prev: CinematicShot["name"] | null, next: CinematicShot["name"] | null): HudSlam | null {
  if (prev === next) return null;
  if (next === "p1-closeup") return "p1";
  if (next === "p2-closeup") return "p2";
  if (next === null && (prev === "venue-dolly" || prev === "p1-closeup" || prev === "p2-closeup")) return "center";
  return null;
}

/**
 * Portrait framing (owner: "390x844 Neo-Tokyo: the camera sits too close to a fighter"). On a narrow viewport the fight
 * lens, the intro close-ups, the K.O. orbit and the win shot cropped a fighter (the horizontal field of view on 390x844 is
 * under half the vertical one). `fitShotToFrame` dollies the camera along its own view line until every subject's full
 * body box (feet to head, with reach either side) projects inside the safe rectangle: inside the top HUD plates and the
 * bottom mode strip, with side margins. Camera only; the sim never reads it.
 */
export interface FrameSubject {
  /** Feet position (the kinematic body position; y is the jump height). */
  readonly position: AuraVec3;
  /** Standing height (m) of the fighter's model at its scale. */
  readonly height: number;
  /** Half-width (m) either side of the feet point; default FRAME_SUBJECT_BOX.halfWidth. */
  readonly reach?: number;
}

/** Normalised device rectangle a subject must stay inside ([-1, 1], y up). */
export interface SafeFrame {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The portrait safe rectangle: the top HUD (health plates and clock) covers about the top 15% of a 390x844 frame and
 * the mode strip the bottom 5%; the sides keep a 6% margin. (Measured on real-GPU 390x844 frames.)
 */
export const PORTRAIT_SAFE_FRAME: SafeFrame = { left: -0.88, right: 0.88, top: 0.64, bottom: -0.86 };

/** Standing height (m) of a scale-1 fighter model (Kenji); a fighter's box is this times its `scale`. */
export const FIGHTER_FRAME_HEIGHT = 1.85;

/** The subject box beyond the feet point: reach either side (a strike, a raised knee, a fall) and body depth. */
export const FRAME_SUBJECT_BOX = { halfWidth: 0.75, halfDepth: 0.4, headroom: 0.1 } as const;

/** Viewports narrower than this are framed by `fitShotToFrame` (390x844 is 0.46; a landscape tablet is above 1). */
export const PORTRAIT_FIT_MAX_ASPECT = 1;

/** The camera's view of a world point in normalised device coordinates, `null` behind the near plane. */
export function projectNdc(eye: AuraVec3, target: AuraVec3, fovDeg: number, aspect: number, p: AuraVec3): readonly [number, number] | null {
  const fx = target[0] - eye[0];
  const fy = target[1] - eye[1];
  const fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f = [fx / fl, fy / fl, fz / fl] as const;
  // right = f x up(0,1,0); up' = right x f
  let rx = -f[2];
  let rz = f[0];
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * f[1];
  const uy = rz * f[0] - rx * f[2];
  const uz = rx * f[1];
  const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]] as const;
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (!(depth > 0.05)) return null;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const x = d[0] * rx + d[2] * rz;
  const y = d[0] * ux + d[1] * uy + d[2] * uz;
  return [x / (depth * t * aspect), y / (depth * t)];
}

/** The eight corners of a subject's body box. */
export function subjectCorners(s: FrameSubject): AuraVec3[] {
  const b = FRAME_SUBJECT_BOX;
  const [x, y, z] = s.position;
  const feet = Math.max(0, y);
  const top = feet + s.height + b.headroom;
  const out: AuraVec3[] = [];
  const hw = s.reach ?? b.halfWidth;
  for (const cx of [x - hw, x + hw]) for (const cy of [feet, top]) for (const cz of [z - b.halfDepth, z + b.halfDepth]) out.push([cx, cy, cz]);
  return out;
}

/** True when every subject corner projects inside the safe rectangle. */
export function subjectsInFrame(eye: AuraVec3, target: AuraVec3, fovDeg: number, aspect: number, subjects: readonly FrameSubject[], safe: SafeFrame = PORTRAIT_SAFE_FRAME): boolean {
  for (const s of subjects) {
    for (const c of subjectCorners(s)) {
      const n = projectNdc(eye, target, fovDeg, aspect, c);
      if (!n || n[0] < safe.left || n[0] > safe.right || n[1] > safe.top || n[1] < safe.bottom) return false;
    }
  }
  return true;
}

/**
 * The dolly factor along the camera's view line (eye = target + (eye0 - target) * k) that fits every subject: the
 * smallest k in [minK, maxK] whose frame holds them all (bisection; projection shrinks monotonically as k grows).
 * `minK < 1` lets the fight lens move in when the pair has room to spare; cinematic shots pass `minK = 1` (pull back only).
 */
export function fitDollyFactor(
  eye: AuraVec3,
  target: AuraVec3,
  fovDeg: number,
  aspect: number,
  subjects: readonly FrameSubject[],
  opts: { readonly minK?: number; readonly maxK?: number; readonly safe?: SafeFrame; readonly keepHeight?: boolean } = {}
): number {
  const minK = opts.minK ?? 1;
  const maxK = opts.maxK ?? 4;
  const safe = opts.safe ?? PORTRAIT_SAFE_FRAME;
  const at = (k: number): AuraVec3 => dollyEye(eye, target, k, opts.keepHeight);
  if (subjectsInFrame(at(minK), target, fovDeg, aspect, subjects, safe)) return minK;
  if (!subjectsInFrame(at(maxK), target, fovDeg, aspect, subjects, safe)) return maxK;
  let lo = minK;
  let hi = maxK;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (subjectsInFrame(at(mid), target, fovDeg, aspect, subjects, safe)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * `fitDollyFactor` applied: the shot's eye moved along its view line, or (`keepHeight`) back across the floor at the
 * same height. Cinematic shots keep their height: the low win shot looks up at the winner, and dollying it back along its
 * line took the lens under the floor on 390x844 (real-GPU frame: an empty dark frame with the floor's underside).
 */
export function dollyEye(eye: AuraVec3, target: AuraVec3, k: number, keepHeight = false): AuraVec3 {
  return [target[0] + (eye[0] - target[0]) * k, keepHeight ? eye[1] : target[1] + (eye[1] - target[1]) * k, target[2] + (eye[2] - target[2]) * k];
}

/**
 * Portrait keeps the authored dolly, K.O. orbit and win shot (fitted by the dolly) but not the single-fighter close-ups:
 * at aspect 0.46 a close-up cannot hold the rival standing beside its subject (real-GPU intro frame: the rival cut in
 * half at the edge, "the camera sits too close to a fighter"), so the fight lens frames the pair through those beats.
 */
export function portraitKeepsShot(name: CinematicShot["name"]): boolean {
  return name !== "p1-closeup" && name !== "p2-closeup";
}

/** Half-width (m) the win shot keeps around the winner (victory step plus raised arms). */
export const WIN_SHOT_REACH = 1.5;

/** Which fighters a portrait shot must keep whole: the winner (wider box) on the win shot, else both. */
export function shotSubjects(name: CinematicShot["name"] | null, p1: FrameSubject, p2: FrameSubject, winner: FrameSubject | null): FrameSubject[] {
  // Close-ups keep both fighters whole too: on 390x844 the rival stands beside the close-up's subject and was cut in half
  // at the frame edge (real-GPU intro frame), which read as the camera sitting too close to a fighter.
  // The victory clip steps and raises the arms off the body point (real-GPU 390x844: the winner drifted ~0.6 m toward the
  // frame edge), so the win shot keeps a wider box around its subject.
  if (name === "win-hero" && winner) return [{ ...winner, reach: WIN_SHOT_REACH }];
  return [p1, p2];
}

/**
 * Portrait crane (m): the fight lens rises this much (eye and aim together, same tilt) before the dolly fit, so the pair
 * sits in the lower-middle of the tall frame with the venue above them, instead of floating mid-frame over a wide band
 * of empty mirror floor.
 */
export const PORTRAIT_CRANE_Y = 1.4;

/** The fight lens lifted by PORTRAIT_CRANE_Y (the portrait dolly then fits the pair from here). */
export function portraitFightBase(framed: { readonly position: AuraVec3; readonly target: AuraVec3 }): { readonly eye: AuraVec3; readonly target: AuraVec3 } {
  return {
    eye: [framed.position[0], framed.position[1] + PORTRAIT_CRANE_Y, framed.position[2]],
    target: [framed.target[0], framed.target[1] + PORTRAIT_CRANE_Y, framed.target[2]]
  };
}

/** Fight-lens dolly range in portrait: moves in to 0.55x when the pair has room, pulls back to 3.2x at most. */
export const PORTRAIT_FIGHT_DOLLY = { minK: 0.55, maxK: 3.2 } as const;

/** Cinematic shots in portrait hide the HUD plates behind the letterbox, so the bars (plus 2% of the frame) are the limit. */
export function cinematicPortraitSafe(letterboxBar: number): SafeFrame {
  const edge = 1 - 2 * letterboxBar - 0.04;
  return { ...PORTRAIT_SAFE_FRAME, top: Math.min(PORTRAIT_SAFE_FRAME.top, edge), bottom: Math.max(PORTRAIT_SAFE_FRAME.bottom, -edge) };
}

/**
 * Landscape (1280x720) safe rectangle for the shots that must hold a whole body: inside the letterbox bars with 3% of
 * the frame to spare top and bottom, 5% at the sides. The win shot is fitted to it (pull back only, same lens height),
 * so the winner reads head to feet (real-GPU frame: cut at the knees).
 */
export function cinematicLandscapeSafe(letterboxBar: number): SafeFrame {
  const edge = 1 - 2 * letterboxBar - 0.06;
  return { left: -0.9, right: 0.9, top: edge, bottom: -edge };
}

/** Landscape shots fitted to their subject box: the win shot (intro close-ups are tight by design; the orbit frames the pair). */
export function landscapeFitsShot(name: CinematicShot["name"]): boolean {
  return name === "win-hero";
}
