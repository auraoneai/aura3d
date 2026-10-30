/**
 * GD-18 operator-console bezel (GU47 WP-14): the remote operator's feed frame around the view. Corner brackets, a REC
 * dot, the camera label, a feed clock and link bars. Pure state here; main.ts writes it into `#opBezel` on the 10 Hz
 * HUD tick. Presentation only: it reads the sim clock and the camera mode, never writes them.
 *
 * Colours follow the identity: teal is the objective (beacon, hint, route), amber the warnings, the bezel itself is a
 * neutral feed white with a red REC dot. Reduced motion (PRD §6.3): the REC dot stays lit instead of blinking.
 */
import type { CameraMode } from "./rules";
import type { SkyId } from "./look";

export const CAM_LABELS: Readonly<Record<CameraMode, string>> = { 0: "CHASE", 1: "FAR CHASE", 2: "ROOF", 3: "BUMPER" };

/** Feed clock at the start of a shift, per sky (minutes after midnight): matches each row's time of day. */
export const FEED_CLOCK_START_MIN: Readonly<Record<SkyId, number>> = { golden: 19 * 60 + 42, noon: 12 * 60 + 10, fog: 7 * 60 + 35, night: 23 * 60 + 18 };

/** Link bars out of 4: the marine fog costs one bar. */
export const LINK_BARS: Readonly<Record<SkyId, number>> = { golden: 4, noon: 4, fog: 3, night: 4 };

export interface BezelState {
  readonly cam: string;
  readonly clock: string;
  readonly bars: number;
  readonly rec: boolean;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "HH:MM:SS" feed clock `simSeconds` into the shift (wraps at midnight). */
export function feedClock(sky: SkyId, simSeconds: number): string {
  const total = (FEED_CLOCK_START_MIN[sky] * 60 + Math.max(0, Math.floor(simSeconds))) % 86400;
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
}

export function bezelState(o: { readonly camMode: CameraMode; readonly sky: SkyId; readonly simSeconds: number; readonly motionOk: boolean }): BezelState {
  return {
    cam: `CAM ${o.camMode + 1} · ${CAM_LABELS[o.camMode]}`,
    clock: feedClock(o.sky, o.simSeconds),
    bars: LINK_BARS[o.sky],
    // 1 Hz blink: lit on the first half of every second; steady on reduced motion.
    rec: o.motionOk ? o.simSeconds - Math.floor(o.simSeconds) < 0.5 : true
  };
}
