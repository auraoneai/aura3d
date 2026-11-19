/**
 * Humanoid clip player: plays canonical humanoid clips (`HumanoidClip`, from `aura3d animation generate`, `aura3d
 * animation import` or `encodeHumanoidClip`) on any rigged humanoid through its `HumanoidDriver`, with cross-fades,
 * mirrored clips, code poses, explicit clip time or a playback rate, and no root motion.
 *
 * Moved from the games' `apps/showcase-port-shared/idol/motion.ts` (`createMotionAnimator`), which now re-exports this
 * module; the maths is unchanged.
 *
 * ```ts
 * const anim = createHumanoidAnimator(MOTION_CLIPS);
 * anim.update(dt, { clip: "Run", time });       // explicit clip time (see humanoidLocomotionTime / humanoidEventTime)
 * anim.update(dt, { clip: "Idle", rate: 1 });   // free-running at a playback rate
 * anim.update(dt, { pose: canonicalPose });     // a code pose, blended like a clip
 * handle.setAnimationPose(driver.pose(pose));   // object-form bone transforms for the model handle
 * ```
 */
import { blendHumanoidPoses, mirrorHumanoidPose, sampleHumanoidClip, type HumanoidClip, type HumanoidPoseInput } from "./humanoid.js";

/** A named set of canonical clips, for example a game's generated `MOTION_CLIPS`. */
export type HumanoidClipSet = Readonly<Record<string, HumanoidClip>>;

/**
 * What {@link HumanoidAnimator.update} should play this frame: a clip from the set, or a canonical pose built in code.
 *
 * Clip requests:
 * - `clip`: name of the clip in the set.
 * - `time`: explicit clip time in seconds. When set, `rate` is ignored and the animator's clock is overwritten.
 * - `rate`: playback rate when `time` is omitted (default `1`); the clock advances by `dt * rate`.
 * - `loop`: wrap (`true`) or clamp (`false`) the clip time. Default: the clip's `meta.loop` (`1` loops, `0` clamps),
 *   looping when the clip has no `meta.loop`.
 * - `mirror`: play the left-right mirror of the clip ({@link mirrorHumanoidPose}). A mirrored clip is a separate
 *   source, so switching `mirror` cross-fades.
 * - `fade`: cross-fade length in seconds when this request changes the source (default `0.18`).
 *
 * Pose requests:
 * - `pose`: the canonical pose to output.
 * - `key`: identity of the pose source (default `"code"`). Changing the key cross-fades; changing the pose under the
 *   same key does not.
 * - `fade`: as above.
 */
export type HumanoidMotionRequest<N extends string = string> =
  | { readonly clip: N; readonly time?: number; readonly rate?: number; readonly loop?: boolean; readonly mirror?: boolean; readonly fade?: number }
  | { readonly pose: HumanoidPoseInput; readonly key?: string; readonly fade?: number };

/** A stateful clip player for one body. Create one per character. */
export interface HumanoidAnimator<N extends string = string> {
  /** Source playing now: the clip name (`"Run"`), a mirrored clip (`"Run~m"`) or a code pose (`"pose:<key>"`). Empty before the first update. */
  readonly current: string;
  /** Clip time in seconds of the current source (unwrapped: looping is applied when sampling). `0` after a source change. */
  readonly time: number;
  /**
   * Advance one frame and return the canonical pose to draw.
   *
   * A change of source (clip, mirrored clip or code-pose key) restarts the clock at `0` and blends from the last
   * returned pose over `fade` seconds; the very first source has nothing to blend from and shows at full weight.
   * Root motion is never applied: the caller moves the body node.
   *
   * @param dt - Real frame time in seconds. Non-finite values count as `0`; values are clamped to `0..0.25`.
   * @param req - What to play this frame.
   * @returns The canonical pose; pass it to `driver.pose(...)` and then `handle.setAnimationPose(...)`.
   */
  update(dt: number, req: HumanoidMotionRequest<N>): HumanoidPoseInput;
}

/**
 * Create a humanoid clip player over a set of canonical clips.
 *
 * @param clips - The clips this animator may play, keyed by name.
 * @returns A {@link HumanoidAnimator}; its state (current source, clock, cross-fade) is private to it.
 *
 * @example
 * ```ts
 * const driver = await loadIdolHumanoid(heroUrl);
 * const anim = createHumanoidAnimator(MOTION_CLIPS);
 * app.onFrame(({ dt }) => {
 *   const pose = anim.update(dt, { clip: "Run", time: humanoidLocomotionTime(MOTION_CLIPS.Run, distance, hipHeight) });
 *   hero.setAnimationPose(driver.pose(pose));
 * });
 * ```
 */
export function createHumanoidAnimator<N extends string>(clips: Readonly<Record<N, HumanoidClip>>): HumanoidAnimator<N> {
  let current = "";
  let time = 0;
  let last: HumanoidPoseInput | undefined;
  let from: HumanoidPoseInput | undefined;
  let fadeLeft = 0, fadeLen = 0;
  return {
    get current() { return current; },
    get time() { return time; },
    update(dt, req) {
      const step = Math.max(0, Math.min(0.25, Number.isFinite(dt) ? dt : 0));
      const key = "clip" in req ? `${req.clip}${req.mirror ? "~m" : ""}` : `pose:${req.key ?? "code"}`;
      if (key !== current) {
        from = last;
        fadeLen = fadeLeft = from ? Math.max(0, req.fade ?? 0.18) : 0;
        current = key;
        time = 0;
      } else {
        fadeLeft = Math.max(0, fadeLeft - step);
      }
      let pose: HumanoidPoseInput;
      if ("clip" in req) {
        const clip = clips[req.clip];
        time = req.time !== undefined ? req.time : time + step * (req.rate ?? 1);
        const loop = req.loop ?? Number(clip.meta?.loop ?? 1) === 1;
        pose = sampleHumanoidClip(clip, time, { loop });
        if (req.mirror) pose = mirrorHumanoidPose(pose);
      } else {
        pose = req.pose;
      }
      if (from && fadeLeft > 0 && fadeLen > 0) pose = blendHumanoidPoses(from, pose, 1 - fadeLeft / fadeLen);
      last = pose;
      return pose;
    }
  };
}

/**
 * Alias of {@link createHumanoidAnimator}, the name the Aura3D showcase games used before 5.7.0.
 */
export const createMotionAnimator: typeof createHumanoidAnimator = createHumanoidAnimator;

/**
 * Ground speed (m/s) one loop of a locomotion clip represents on a body of this hip height, from the clip's baked
 * travel (`meta.groundSpeedHip`, else `meta.stanceSpeedHip`, in hip heights per second).
 *
 * @param clip - A locomotion clip.
 * @param bodyHipHeight - Rest hip height of the drawn body in metres (`driver.map.hipHeight` times the model scale).
 * @returns Metres per second; `0` when the clip carries no travel facts.
 */
export function humanoidClipGroundSpeed(clip: HumanoidClip, bodyHipHeight: number): number {
  return Number(clip.meta?.groundSpeedHip ?? clip.meta?.stanceSpeedHip ?? 0) * bodyHipHeight;
}

/**
 * Clip time for a locomotion loop driven by the distance travelled, so planted feet do not slide: one loop covers
 * `groundSpeed * duration` metres.
 *
 * @param clip - A locomotion clip with travel facts (see {@link humanoidClipGroundSpeed}).
 * @param metres - Distance the body has travelled (any sign; wraps per loop).
 * @param bodyHipHeight - Rest hip height of the drawn body in metres.
 * @returns Clip time in `[0, duration)`; `0` when the clip has no travel facts.
 */
export function humanoidLocomotionTime(clip: HumanoidClip, metres: number, bodyHipHeight: number): number {
  const speed = humanoidClipGroundSpeed(clip, bodyHipHeight);
  if (!(speed > 0)) return 0;
  const cycle = speed * clip.duration;
  return (((metres % cycle) + cycle) % cycle) / speed;
}

/**
 * Playback rate that matches a ground speed to a locomotion clip on a body of this hip height.
 *
 * @param clip - A locomotion clip with travel facts.
 * @param groundSpeed - The body's speed over the ground in m/s.
 * @param bodyHipHeight - Rest hip height of the drawn body in metres.
 * @returns The `rate` for {@link HumanoidMotionRequest}; `1` when the clip has no travel facts.
 */
export function humanoidLocomotionRate(clip: HumanoidClip, groundSpeed: number, bodyHipHeight: number): number {
  const speed = humanoidClipGroundSpeed(clip, bodyHipHeight);
  return speed > 0 ? groundSpeed / speed : 1;
}

/**
 * Clip time for an event clip whose key frame (`meta[keyField]`, for example `"footRPeakTime"`) must land on the game's
 * event: game progress `u` in 0..1 maps piecewise-linearly so that `u = eventFrac` hits the key frame.
 *
 * @param clip - The event clip (kick, swing, throw).
 * @param u - Game progress of the action, clamped to 0..1.
 * @param eventFrac - Fraction of the action at which the event (contact, release) happens, clamped to 0.001..0.999.
 * @param keyField - Name of the `meta` field holding the key-frame time in seconds; the window midpoint when absent.
 * @param window - Optional `[start, end]` seconds of the clip to use (default the whole clip).
 * @returns Clip time in seconds inside the window.
 */
export function humanoidEventTime(clip: HumanoidClip, u: number, eventFrac: number, keyField: string, window?: readonly [number, number]): number {
  const [a, b] = window ?? [0, clip.duration];
  const key = Math.max(a, Math.min(b, Number(clip.meta?.[keyField] ?? (a + b) / 2)));
  const x = Math.max(0, Math.min(1, u)), f = Math.max(1e-3, Math.min(1 - 1e-3, eventFrac));
  return x <= f ? a + (key - a) * (x / f) : key + (b - key) * ((x - f) / (1 - f));
}

/**
 * Clip time for a captured jump synced to a ballistic game jump. Height `y` and vertical speed `vy` under gravity `g`
 * (negative) give the jump's progress (take-off speed `v0 = sqrt(vy^2 - 2 g y)`), so the clip's take-off (`takeoff`
 * seconds) lands on the game's take-off and its apex (`meta.apexTime`, else half the duration) on the game's apex.
 *
 * @param clip - The jump clip.
 * @param y - Height above the take-off point in metres.
 * @param vy - Vertical speed in m/s (positive rising).
 * @param g - Gravity in m/s^2 (negative).
 * @param takeoff - Clip time of the take-off in seconds.
 * @returns Clip time in seconds, at most the clip duration.
 */
export function humanoidAirTime(clip: HumanoidClip, y: number, vy: number, g: number, takeoff: number): number {
  const apex = Number(clip.meta?.apexTime ?? clip.duration / 2);
  const v0 = Math.sqrt(Math.max(1e-6, vy * vy - 2 * g * Math.max(0, y)));
  const u = vy >= 0 ? 0.5 * (1 - vy / v0) : 0.5 + 0.5 * Math.min(1, -vy / v0);
  return Math.min(clip.duration, takeoff + (apex - takeoff) * 2 * u);
}
