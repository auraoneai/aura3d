/**
 * GU47 WP-21 camera and HUD motion (BZ-15, BZ-16, BZ-17): presentation only, computed from read-only sim values, never
 * fed back (PRD D8). Every function takes the reduced-motion flag and returns the still value under it (PRD §6.3).
 */

/** BZ-16: the elevator descent between floors (letterbox bars), seconds; 0 under reduced motion (a plain cut). */
export const BZ_DESCENT_SECONDS = 2.5;
export const descentSeconds = (reducedMotion: boolean): number => (reducedMotion ? 0 : BZ_DESCENT_SECONDS);

/** BZ-16: death roll to 12 degrees over 0.6 s (radians), 0 under reduced motion. */
export const BZ_DEATH_ROLL_DEG = 12;
export function deathRoll(secondsSinceDeath: number, reducedMotion: boolean): number {
  if (reducedMotion || !(secondsSinceDeath > 0)) return 0;
  const t = Math.min(1, secondsSinceDeath / 0.6);
  const ease = 1 - (1 - t) * (1 - t);
  return (BZ_DEATH_ROLL_DEG * Math.PI / 180) * ease;
}
/** BZ-16: the fade to black after death (0..1 opacity), a hard 0.6 hold under reduced motion. */
export function deathFade(secondsSinceDeath: number, reducedMotion: boolean): number {
  if (!(secondsSinceDeath > 0)) return 0;
  if (reducedMotion) return 0.6;
  return Math.min(0.85, Math.max(0, (secondsSinceDeath - 0.3) / 1.4) * 0.85);
}

/**
 * BZ-17: screen angle of the damage arc in degrees (0 = top of the screen = straight ahead, clockwise positive), from
 * the player's position and yaw (forward = (sin yaw, -cos yaw), the sim's convention) to the attacker.
 */
export function damageArcDeg(player: { readonly x: number; readonly z: number; readonly yaw: number }, from: { readonly x: number; readonly z: number }): number {
  const world = Math.atan2(from.x - player.x, -(from.z - player.z));
  let d = ((world - player.yaw) * 180) / Math.PI;
  d = ((d % 360) + 540) % 360 - 180;
  return d;
}

/** BZ-15: viewmodel sway (metres, side and up) from the turn rate; 0 under reduced motion. */
export function viewmodelSway(turnRate: number, timeSeconds: number, moving: number, reducedMotion: boolean): readonly [number, number] {
  if (reducedMotion) return [0, 0];
  const lag = Math.max(-0.04, Math.min(0.04, -turnRate * 0.012));
  return [lag + Math.sin(timeSeconds * 4.5) * 0.006 * moving, Math.abs(Math.cos(timeSeconds * 4.5)) * 0.004 * moving];
}

/** BZ-15: reload dip (metres down) over the reload time left, 0 under reduced motion. */
export function reloadDip(reloadLeft: number, reloadTotal: number, reducedMotion: boolean): number {
  if (reducedMotion || !(reloadLeft > 0) || !(reloadTotal > 0)) return 0;
  const k = 1 - reloadLeft / reloadTotal;
  return Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * 0.16;
}

/** BZ-15: a door slides sideways into the wall along its frame axis (x/z change, y constant). */
export function doorOffset(open: number, alongX: boolean, cell: number): readonly [number, number] {
  const o = Math.max(0, Math.min(1, open)) * cell * 0.94;
  return alongX ? [o, 0] : [0, o];
}
