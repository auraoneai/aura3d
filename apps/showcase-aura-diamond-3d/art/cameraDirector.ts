/**
 * Aura Diamond 3D broadcast camera director (GU47 DIA-C1, DIA-P2). Four sequences between plays: the park intro rail,
 * the batter walk-up, the home-run sequence with letterbox bars, and the half-inning wide. Live play keeps the batting and
 * pitching cameras: a sequence ends the moment the game turns interactive (windup, pitch, batted ball, pitch selection),
 * and any key or tap skips it. Pure math (no engine, no DOM) on wall-clock seconds; it never touches the sim.
 *
 * Reduced motion (PRD 6.3): the intro and the half-inning wide are skipped, the walk-up and the home run become a held
 * cut of their key framing.
 */
import { fenceRadius, type ParkSpec, type Vec3 } from "../src/rules";

export type ShotKind = "intro" | "walkup" | "homerun" | "half";

export interface CamPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly fov: number;
}

export interface Shot {
  readonly kind: ShotKind;
  /** Seconds. */
  readonly duration: number;
  /** Letterbox bars (the home-run sequence). */
  readonly bars: boolean;
  /** Depth of field in this shot (DIA-P2: walk-up and home run, High tier). */
  readonly dof: boolean;
  /** Key framings the pose is eased through (2 or 3). */
  readonly keys: readonly CamPose[];
}

/** Higher plays over lower; an equal or lower kind waits for the running shot to end (it is dropped). */
export const SHOT_PRIORITY: Readonly<Record<ShotKind, number>> = { walkup: 1, intro: 2, half: 3, homerun: 4 };

/** Batter's box (the batter stands on the third-base side of the plate). */
const BATTER: Vec3 = [-0.6, 1.15, 0.4];

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pose at u in [0, 1] eased through the shot's keys. */
export function shotPose(shot: Shot, u: number): CamPose {
  const keys = shot.keys;
  if (keys.length === 1) return keys[0]!;
  const span = keys.length - 1;
  const x = Math.min(span - 1e-9, Math.max(0, u * span));
  const i = Math.floor(x);
  const t = smooth(x - i);
  const a = keys[i]!;
  const b = keys[i + 1]!;
  return { eye: mix(a.eye, b.eye, t), target: mix(a.target, b.target, t), fov: a.fov + (b.fov - a.fov) * t };
}

/** Park intro rail: over the left-centre wall, down across the outfield, to the high-home view before the first pitch. */
export function introShot(park: ParkSpec): Shot {
  const deep = fenceRadius(park, 0) * 0.82;
  return {
    kind: "intro",
    duration: 3.6,
    bars: false,
    dof: false,
    keys: [
      { eye: [-park.fenceCorner * 0.45, 30, -deep], target: [0, 1, -8], fov: 52 },
      { eye: [park.fenceCorner * 0.22, 17, -24], target: [0, 1, -4], fov: 46 },
      { eye: [0, 9, 18], target: [0, 1.2, -12], fov: 42 }
    ]
  };
}

/** Batter walk-up: low three-quarter shot from the first-base side, pushing in on the batter. */
export function walkupShot(): Shot {
  return {
    kind: "walkup",
    duration: 1.6,
    bars: false,
    dof: true,
    keys: [
      { eye: [6.4, 2.1, 5.6], target: BATTER, fov: 30 },
      { eye: [4.8, 1.9, 4.0], target: [BATTER[0], BATTER[1] + 0.1, BATTER[2]], fov: 27 }
    ]
  };
}

/** Home run: high behind the plate on the ball's line, then dolly out toward where it landed. At most 4.5 s. */
export function homeRunShot(park: ParkSpec, landPos: Vec3): Shot {
  const r = Math.hypot(landPos[0], landPos[2]) || 1;
  const dir: Vec3 = [landPos[0] / r, 0, landPos[2] / r];
  const wall = fenceRadius(park, (Math.atan2(dir[0], -dir[2]) * 180) / Math.PI);
  const reach = Math.min(r, wall) * 0.42;
  return {
    kind: "homerun",
    duration: 3.2,
    bars: true,
    dof: true,
    keys: [
      { eye: [dir[0] * -6, 13, 20], target: [dir[0] * wall * 0.6, 8, dir[2] * wall * 0.6], fov: 44 },
      { eye: [dir[0] * reach, 11, dir[2] * reach + 6], target: [dir[0] * wall, 7, dir[2] * wall], fov: 38 }
    ]
  };
}

/** Half-inning wide: the whole diamond from high behind home, drifting across. */
export function halfInningShot(): Shot {
  return {
    kind: "half",
    duration: 2.2,
    bars: false,
    dof: false,
    keys: [
      { eye: [-7, 22, 30], target: [0, 0, -30], fov: 50 },
      { eye: [7, 21, 29], target: [0, 0, -30], fov: 48 }
    ]
  };
}

export interface DirectorFrame {
  readonly kind: ShotKind;
  readonly pose: CamPose;
  /** Letterbox coverage 0..1 (eased in and out). */
  readonly bars: number;
  readonly dof: boolean;
}

export class CameraDirector {
  private shot: Shot | null = null;
  private start = 0;
  private held: CamPose | null = null;
  /** Shots started since the page loaded, per kind (QA evidence: >= 4 per match). */
  readonly played: Record<ShotKind, number> = { intro: 0, walkup: 0, homerun: 0, half: 0 };

  constructor(private readonly reducedMotion: boolean) {}

  get active(): ShotKind | null {
    return this.shot?.kind ?? null;
  }

  /** Starts `shot` at `now` (seconds) unless a higher-priority shot is running. Returns whether it plays. */
  play(shot: Shot, now: number): boolean {
    if (this.shot && SHOT_PRIORITY[this.shot.kind] >= SHOT_PRIORITY[shot.kind]) return false;
    if (this.reducedMotion && (shot.kind === "intro" || shot.kind === "half")) return false;
    this.shot = shot;
    this.start = now;
    this.held = this.reducedMotion ? shotPose(shot, 0.5) : null;
    this.played[shot.kind] += 1;
    return true;
  }

  skip(): void {
    this.shot = null;
    this.held = null;
  }

  /** This frame's framing, or null (the game's own camera). `interactive` ends any shot at once. */
  update(now: number, interactive: boolean): DirectorFrame | null {
    const shot = this.shot;
    if (!shot) return null;
    const u = (now - this.start) / shot.duration;
    if (interactive || u >= 1 || u < 0) {
      this.skip();
      return null;
    }
    const pose = this.held ?? shotPose(shot, u);
    const edge = 0.12;
    const bars = !shot.bars ? 0 : this.reducedMotion ? 1 : smooth(Math.min(u / edge, (1 - u) / edge, 1));
    return { kind: shot.kind, pose, bars, dof: shot.dof };
  }
}
