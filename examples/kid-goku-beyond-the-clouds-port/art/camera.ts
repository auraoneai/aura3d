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
export function titleFlyover(t: number, hero: V3, sunDir: V3, reducedMotion: boolean, aspect = 16 / 9): FlyoverPose | null {
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
  // portrait: a taller frustum (+12 deg vertical) so the ridge and sky still read in the narrow frame
  return { eye, look, fov: mix(58, 40, k) + (aspect < 1 ? 12 : 0), bars };
}

/** Title orbit pose in course space (s, lateral, height above the road) after the flyover. */
export interface TitleOrbitPose { readonly eye: readonly [number, number, number]; readonly look: readonly [number, number, number]; readonly fov: number }
/** Least horizontal distance from the title orbit's eye to the kid (m). */
export const TITLE_ORBIT_MIN_DISTANCE = 6;
/**
 * The slow title orbit around the kid standing on the ride log (`base`: his feet height). It used to circle a point 4.4 m
 * off him on a 7.2 x 5 m ellipse, so once a lap the eye passed right over his head (portrait GPU QA: his hair filled the
 * frame). Now the ellipse is centred on him (7.5 m along, TITLE_ORBIT_MIN_DISTANCE across), and portrait widens the lens
 * so the kid stays about a quarter of the frame height with the ridge around him.
 */
export function titleOrbit(clock: number, s: number, lane: number, base: number, aspect: number): TitleOrbitPose {
  const a = clock * 0.18 + 0.2;
  return {
    eye: [s + 7.5 * Math.cos(a), lane + TITLE_ORBIT_MIN_DISTANCE * Math.sin(a), base + 2.4],
    look: [s + 0.2, lane, base + 1.2],
    fov: aspect < 1 ? 52 : 40
  };
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

/** What the playing chase camera needs from the run (world.ts fills it every frame). */
export interface ChaseInput {
  readonly s: number; readonly lane: number; readonly jump: number; readonly riding: boolean; readonly logLift: number;
  readonly aspect: number; readonly speed: number; readonly chase: boolean; readonly danger: number;
  /** Course distance where the ride log ends (0: no log) and the course length. */
  readonly log: number; readonly length: number;
}
export interface ChasePose { readonly eye: V3; readonly look: V3; readonly fov: number }

const lift3 = (f: { point: V3; up: V3 }, h: number): V3 => [f.point[0] + f.up[0] * h, f.point[1] + f.up[1] * h, f.point[2] + f.up[2] * h];
const smoothstep = (a: number, b: number, v: number): number => { const r = Math.max(0, Math.min(1, (v - a) / (b - a))); return r * r * (3 - 2 * r); };

/**
 * The playing chase camera, aspect-aware. Landscape: 7.4 m behind and 3.3 m up at 0.65 of the kid's lane, looking 7 m
 * ahead. Portrait (aspect < 1, horizontal fov only ~31 deg at the 62 deg vertical fov): the eye and aim stay right behind
 * the kid (0.9 of his lane), so a kid steering to the outer lanes stays in the narrow frame instead of sliding out of it,
 * and during the log ride the eye rises 2 m and pulls back 2.5 m (the log in frame, the kid on it still >= 10% of the
 * frame height: the old 4 m pull-back left him at 9.8%). Both stay over the road (|lateral| <= 4.6,
 * the road is 6.2 m wide each side), above the kid, so the eye is never inside the canyon walls or roadside rocks.
 */
export function chasePose(c: ChaseInput, frameAt: (s: number, lane: number) => { point: V3; up: V3 }): ChasePose {
  const portrait = c.aspect < 1;
  const follow = portrait ? 0.9 : 0.65;
  const portraitLog = portrait && c.log ? 1 - smoothstep(c.log - 12, c.log + 4, c.s) : 0;
  const back = frameAt(c.s - 7.4 - 2.5 * portraitLog, c.lane * follow);
  const ahead = frameAt(Math.min(c.length + 20, c.s + 7), c.lane * follow);
  const lift = 3.3 + c.jump * 0.35 + (c.riding ? 0.6 : 0) + c.logLift * 0.5 + 2.0 * portraitLog;
  let fov = portrait ? 62 : 55 + c.speed * 0.2;
  if (c.chase) fov += 3;
  fov += c.danger * 3;
  return { eye: lift3(back, lift), look: lift3(ahead, 1.5), fov };
}
