/**
 * GU47 WP-35 CD-18 camera beats for Cumulus Dash, as pure functions (unit-tested; world.ts applies them):
 *
 * - Title flyover: a 7 s letterboxed rail that starts high on the sun side of the runner, looking past the runner into the
 *   antisolar sky (storm towers and the rainbow), then sweeps down to the title orbit. Skipped on reduced motion (a cut).
 * - Trauma: impacts feed the camera controller's trauma layer (`app.camera.shake`) instead of the old sine offsets;
 *   reduced motion adds nothing.
 * - Launch FOV kick: +6 deg on the controller's `fovKick` layer for 0.4 s; reduced motion: none.
 */
export type V3 = readonly [number, number, number];

export const TITLE_FLYOVER_SECONDS = 7;
export const LAUNCH_FOV_KICK_DEG = 6;
export const LAUNCH_FOV_KICK_HOLD_S = 0.4;
/** Trauma per unit of the game's `impact` rise (impact 0.6 on a hit, 0.2 on a stumble). */
export const TRAUMA_PER_IMPACT = 0.75;

export interface FlyoverPose { readonly eye: V3; readonly look: V3; readonly fov: number; readonly bars: number }

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** The flyover pose `t` seconds into the title, or null when it is over or reduced motion is on. */
export function titleFlyover(t: number, hero: V3, sunDir: V3, reducedMotion: boolean): FlyoverPose | null {
  if (reducedMotion || !(t >= 0) || t >= TITLE_FLYOVER_SECONDS) return null;
  const l = Math.hypot(sunDir[0], sunDir[2]) || 1;
  const u: V3 = [sunDir[0] / l, 0, sunDir[2] / l];
  const v: V3 = [-u[2], 0, u[0]];
  const k = ease(t / TITLE_FLYOVER_SECONDS);
  const along = mix(46, 8, k), side = mix(-18, 3.5, k), up = mix(22, 2.6, k);
  const eye: V3 = [hero[0] + u[0] * along + v[0] * side, hero[1] + up, hero[2] + u[2] * along + v[2] * side];
  const past = mix(30, 0, k), lift = mix(8, 1.2, k);
  const look: V3 = [hero[0] - u[0] * past, hero[1] + lift, hero[2] - u[2] * past];
  const bars = t < TITLE_FLYOVER_SECONDS - 1 ? 1 : Math.max(0, TITLE_FLYOVER_SECONDS - t);
  return { eye, look, fov: mix(58, 40, k), bars };
}

/**
 * GU47 phase 3: the storm row's title hold after the flyover (and the whole title on reduced motion). The eye stays on the
 * sun side of the runner, low, looking past the runner into the antisolar sky, so the title frame always carries the
 * look's signature (rainbow arc, storm towers, rain curtains) with the runner front-lit in the lower third. A slow sway
 * (none on reduced motion) replaces the old full orbit, which spent most of its loop looking down the track.
 */
export function titleHold(clock: number, hero: V3, sunDir: V3, reducedMotion: boolean): { eye: V3; look: V3; fov: number } {
  const l = Math.hypot(sunDir[0], sunDir[2]) || 1;
  const u: V3 = [sunDir[0] / l, 0, sunDir[2] / l];
  const v: V3 = [-u[2], 0, u[0]];
  const sway = reducedMotion ? 0 : Math.sin(clock * 0.15);
  const along = 8.4, side = 3.5 + 1.1 * sway, up = 2.4;
  const eye: V3 = [hero[0] + u[0] * along + v[0] * side, hero[1] + up, hero[2] + u[2] * along + v[2] * side];
  const look: V3 = [hero[0] - u[0] * 6 + v[0] * 0.6 * sway, hero[1] + 1.6, hero[2] - u[2] * 6 + v[2] * 0.6 * sway];
  return { eye, look, fov: 40 };
}

/** Trauma to add this frame for an impact that rose from `before` to `now` (0 on reduced motion or no rise). */
export function traumaFor(before: number, now: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return Math.max(0, now - before) * TRAUMA_PER_IMPACT;
}

/** The launch FOV kick target `sinceLaunch` seconds after a launch (0 once the hold is over or on reduced motion). */
export function launchFovKick(sinceLaunch: number, reducedMotion: boolean): number {
  if (reducedMotion || !(sinceLaunch >= 0) || sinceLaunch >= LAUNCH_FOV_KICK_HOLD_S) return 0;
  return LAUNCH_FOV_KICK_DEG;
}
