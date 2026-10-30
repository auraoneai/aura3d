/**
 * GU47 WP-25 (lane g15) presentation directors for Craterline GP: camera feel (SO47-C1), sector light and haze
 * (SO47-L3, E2 nebula shift) and boost/menu post (SO47-P2, P3). Pure state machines over read-only race values, so
 * unit tests drive them without a renderer; `world.ts` applies their output through the engine handles.
 * Nothing here feeds back into the simulation (PRD D8).
 */
import { LOOKS, SECTORS, SECTOR_LERP_SECONDS, sectorAt, type LookRow, type OrbitLook, type SectorId, type SectorRow } from "./look";

const DEG = Math.PI / 180;
/** The sim clamps the player lean to +-0.24 rad (race.ts). */
const MAX_LEAN = 0.24;

export interface CameraFeelFrame {
  /** Degrees added to the base FOV. */
  readonly fovOffset: number;
  /** Camera roll in radians. */
  readonly roll: number;
  /** Downward punch in metres (hard landings). */
  readonly punch: number;
  /** Total kick energy (fov + roll + punch magnitudes); 0 under reduced motion. */
  readonly energy: number;
}

export interface CameraFeel {
  readonly baseFov: number;
  /** A landing; `hard` adds the punch. */
  landing(hard: boolean): void;
  update(dt: number, input: { readonly boosting: boolean; readonly lean: number; readonly racing: boolean }): CameraFeelFrame;
}

/** SO47-C1: base fov 64, boost +9 and landing +5 kicks, punch on hard landings, 2-degree lean roll; all 0 on reduced motion. */
export function createCameraFeel(look: OrbitLook, reducedMotion: boolean): CameraFeel {
  const cam = LOOKS[look].camera;
  const on = !reducedMotion;
  let boost = 0;
  let landing = 0;
  let punch = 0;
  return {
    baseFov: cam.baseFov,
    landing(hard) {
      if (!on) return;
      landing = 1;
      if (hard) punch = 1;
    },
    update(dt, input) {
      const k = 1 - Math.exp(-dt * 6);
      boost += ((input.boosting && input.racing ? 1 : 0) - boost) * k;
      landing *= Math.exp(-dt * 5);
      punch *= Math.exp(-dt * 9);
      if (!on) return { fovOffset: 0, roll: 0, punch: 0, energy: 0 };
      const fovOffset = boost * cam.boostKick + landing * cam.landingKick;
      const roll = input.racing ? Math.max(-1, Math.min(1, input.lean / MAX_LEAN)) * cam.leanRollDeg * DEG : 0;
      const p = punch * 0.18;
      return { fovOffset, roll, punch: p, energy: Math.abs(fovOffset) + Math.abs(roll) + Math.abs(p) };
    }
  };
}

export interface SectorFrame {
  readonly sector: SectorId;
  /** Set on the frame the sector changes: the row to lerp the key and haze to over SECTOR_LERP_SECONDS. */
  readonly changed: SectorRow | null;
  /** Nebula hue shift in turns, eased toward the sector's value. */
  readonly nebulaShift: number;
}

/** SO47-L3 / E2: follows the rider's sector; the gouache look only (the original look returns a fixed warm frame). */
export function createSectorDirector(look: OrbitLook): { update(s: number, dt: number): SectorFrame } {
  let current: SectorId | null = null;
  let shift = 0;
  return {
    update(s, dt) {
      if (look === "original") return { sector: "warm", changed: null, nebulaShift: 0 };
      const next = sectorAt(s);
      const changed = next !== current ? SECTORS[next] : null;
      if (current === null) shift = SECTORS[next].nebulaShift;
      current = next;
      const target = SECTORS[next].nebulaShift;
      shift += (target - shift) * Math.min(1, dt / SECTOR_LERP_SECONDS * 3);
      return { sector: next, changed, nebulaShift: shift };
    }
  };
}

export interface PostFrame {
  readonly motionBlur: number;
  readonly chromaticAberration: number;
  readonly depthOfField: boolean;
}

/**
 * SO47-P2 / P3: motion blur ramps 0..0.6 and CA sits at 0.0015 only while boosting or in zero-G (High tier, not
 * reduced motion); depth of field only in the menu and results.
 */
export function createPostDirector(row: LookRow, high: boolean, reducedMotion: boolean): { update(dt: number, input: { readonly boosting: boolean; readonly zeroG: boolean; readonly phase: string }): PostFrame } {
  const allowed = high && !reducedMotion && row.id === "gouache";
  let blur = 0;
  return {
    update(dt, input) {
      const target = allowed && input.boosting && input.phase === "racing" ? 0.6 : 0;
      blur += (target - blur) * (1 - Math.exp(-dt * 5));
      if (blur < 0.005) blur = target === 0 ? 0 : blur;
      const ca = allowed && input.phase === "racing" && (input.boosting || input.zeroG) ? 0.0015 : 0;
      const dof = high && row.id === "gouache" && (input.phase === "menu" || input.phase === "finished");
      return { motionBlur: Math.round(blur * 100) / 100, chromaticAberration: ca, depthOfField: dof };
    }
  };
}

export type CountdownShot = "planet" | "grid" | "chase";

/**
 * SO47-C2: the 3.2 s countdown (the sim's length; the PRD's 4 s would change the race clock) cuts planet wide ->
 * grid pan -> chase. Reduced motion skips straight to the chase (PRD §6.3: sequences become cuts or are skipped).
 */
export function countdownShot(remaining: number, reducedMotion: boolean): { readonly shot: CountdownShot; readonly progress: number } {
  if (reducedMotion) return { shot: "chase", progress: 1 };
  if (remaining > 2.2) return { shot: "planet", progress: Math.min(1, (3.2 - remaining) / 1.0) };
  if (remaining > 1.0) return { shot: "grid", progress: (2.2 - remaining) / 1.2 };
  return { shot: "chase", progress: 1 };
}

/** SO47-C2 results orbit: angle around the player from its forward axis, kept 56..124 degrees away from the chase (pi). */
export function resultsOrbitAngle(time: number, reducedMotion: boolean): number {
  return Math.PI / 2 + (reducedMotion ? 0 : 0.6 * Math.sin(time * 0.3));
}

/** Letterbox bars on during the countdown sequence and the results orbit (never under reduced motion). */
export function barsWanted(phase: string, remaining: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return false;
  return (phase === "countdown" && countdownShot(remaining, false).shot !== "chase") || phase === "finished";
}
