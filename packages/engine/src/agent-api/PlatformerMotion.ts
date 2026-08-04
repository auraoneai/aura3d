/**
 * Reusable platformer motion tuning and level solvability.
 *
 * ## The defects this addresses
 *
 * Skyline Runner's jump was reported as unnatural, floaty, and unreliable to land,
 * with a world that read as disconnected floating strips and a session that ended in
 * about half a minute. Those are not four unrelated complaints; three of them follow
 * from one number.
 *
 * The level ships `jumpVelocity: 7.4` and inherits the kit default `gravity: -22`.
 * That gives an apex of `v^2 / 2g = 1.245` world units and an airtime of
 * `2v / g = 0.673` seconds. The level's platforms step up by at most **0.36** units
 * and are separated by gaps of at most **0.30** units. So every jump rises about
 * 3.5x higher than the tallest step it needs to clear and travels well past the
 * widest gap, with the character spending two thirds of a second in the air on a
 * course whose obstacles need a fraction of that. The character therefore appears to
 * float above the level rather than move through it, landings arrive long after the
 * player expects them, and because the apex dwarfs the platform spacing the platforms
 * read as unrelated strips rather than as a connected route.
 *
 * The engine defect is that nothing related jump tuning to level geometry, so a level
 * could ship physically inconsistent with its own platforms and every gate would pass:
 * the level is *solvable* (an over-powered jump clears everything), the screenshots
 * look fine, and no metric compares apex to step height.
 *
 * This module closes that gap. {@link solvePlatformerMotion} derives gravity, jump
 * velocity and move speed from what a level actually asks the player to do, and
 * {@link validatePlatformerMotion} reports when a level's tuning is inconsistent with
 * its geometry -- both over-powered (floaty) and under-powered (unclearable).
 *
 * Pure and dependency-free.
 */

export interface PlatformerPlatformLike {
  readonly id?: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height?: number | undefined;
}

export interface PlatformerGeometryFacts {
  /** Largest upward step between consecutive platforms, in world units. */
  readonly maxRise: number;
  /** Largest horizontal gap between consecutive platforms, in world units. */
  readonly maxGap: number;
  /** Total horizontal span of the course. */
  readonly courseLength: number;
  /** Narrowest platform, which bounds how precise a landing must be. */
  readonly minPlatformWidth: number;
  readonly platformCount: number;
}

/**
 * Measure what a level asks the player to do.
 *
 * Consecutive platforms are taken in x order, which matches how a side-scrolling
 * course is traversed. Gaps are measured edge to edge and rises top to top.
 */
export function measurePlatformerGeometry(platforms: readonly PlatformerPlatformLike[]): PlatformerGeometryFacts {
  if (platforms.length === 0) {
    return { maxRise: 0, maxGap: 0, courseLength: 0, minPlatformWidth: 0, platformCount: 0 };
  }
  const ordered = [...platforms].sort((a, b) => a.x - b.x);
  let maxRise = 0;
  let maxGap = 0;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index]!;
    const to = ordered[index + 1]!;
    const topFrom = from.y + (from.height ?? 0);
    const topTo = to.y + (to.height ?? 0);
    maxRise = Math.max(maxRise, topTo - topFrom);
    maxGap = Math.max(maxGap, to.x - (from.x + from.width));
  }
  const start = Math.min(...ordered.map((platform) => platform.x));
  const end = Math.max(...ordered.map((platform) => platform.x + platform.width));
  return {
    maxRise: round(maxRise),
    maxGap: round(Math.max(0, maxGap)),
    courseLength: round(end - start),
    minPlatformWidth: round(Math.min(...ordered.map((platform) => platform.width))),
    platformCount: ordered.length
  };
}

export interface PlatformerMotionRequest {
  /**
   * Time from leaving the ground to the apex, in seconds.
   *
   * This is the parameter that decides how a jump *feels*, and it is a genuine design
   * value rather than something to derive: platformers land between roughly 0.22s
   * (snappy, arcade) and 0.42s (floaty, deliberate). Everything else follows from it
   * plus the level's geometry.
   */
  readonly riseSeconds?: number | undefined;
  /**
   * Headroom above the tallest step the jump must clear, as a multiple of that step.
   *
   * 1.0 would only just reach the next platform, which leaves no margin for a slightly
   * late input. Around 1.6 reads as comfortable without floating.
   */
  readonly apexHeadroom?: number | undefined;
  /**
   * Horizontal margin over the widest gap, as a multiple of that gap.
   *
   * Above 1 the player can clear the widest gap without a frame-perfect jump.
   */
  readonly gapMargin?: number | undefined;
  /** Minimum apex, so a level with no rises still has a usable jump. */
  readonly minApex?: number | undefined;
  /**
   * Jump height in world units, declared by the developer.
   *
   * **Prefer this over relying on the geometry-derived apex.** When present it is
   * authoritative: apex comes from intent and the level is then *validated* against it,
   * rather than the jump being sized by whatever the level happens to contain.
   *
   * The defect this fixes: apex was `max(minApex, maxRise * apexHeadroom)`, and `maxRise`
   * is the step-up between *consecutive* platforms. On a near-level course maxRise
   * collapses, so apex fell to `minApex` and the character barely left the ground. The
   * solver was optimising for "can technically reach the next platform" rather than "is a
   * usable jump", and it had no notion of clearing anything that was not the immediate
   * next platform.
   */
  readonly jumpHeight?: number | undefined;
  /**
   * Named feel, an alternative to stating a height and rise time separately.
   *
   * `snappy` is a fast, low, tightly controlled jump. `floaty` hangs. `responsive` is the
   * middle ground most platformers use.
   */
  readonly feel?: PlatformerFeel | undefined;
  /**
   * Throw instead of silently shrinking the jump when intent cannot clear the level.
   *
   * Default true. Silent degradation is how the barely-there jump shipped: the solver
   * quietly produced a number that satisfied its own constraint and no gate compared it
   * to anything a player would notice.
   */
  readonly strict?: boolean | undefined;
  /**
   * Character height in world units, used to scale a `feel` preset.
   *
   * A jump is read relative to the character: clearing twice your own height feels the
   * same whether the character is 0.5 or 5 units tall, and a fixed apex does not.
   */
  readonly characterHeight?: number | undefined;
  /**
   * Target session length in seconds, used to derive move speed from course length.
   *
   * A course is only as long as the time it takes to cross; deriving speed from an
   * intended duration is how a level gets a session length on purpose rather than by
   * accident. Skyline's 16.6-unit course at 1.15 units/second crosses in 14 seconds,
   * which is why the session felt like it ended arbitrarily.
   */
  readonly targetSessionSeconds?: number | undefined;
  /**
   * Fraction of the session spent traversing rather than jumping, retrying and
   * exploring. Below 1 because a player does not walk the course in a straight line.
   */
  readonly traversalFraction?: number | undefined;
}

export interface PlatformerMotionSolution {
  readonly kind: "aura-platformer-motion";
  /** Gravity, negative (downward), in world units per second squared. */
  readonly gravity: number;
  /** Initial upward velocity of a full jump. */
  readonly jumpVelocity: number;
  /** Horizontal move speed. */
  readonly moveSpeed: number;
  /** Apex height above the takeoff surface. */
  readonly apex: number;
  /** Total airtime of a full jump, rise plus fall. */
  readonly airtime: number;
  /** Horizontal distance covered during a full jump at `moveSpeed`. */
  readonly jumpReach: number;
  /** Coyote time in milliseconds, scaled to airtime. */
  readonly coyoteMs: number;
  /** Jump buffer in milliseconds, scaled to airtime. */
  readonly jumpBufferMs: number;
  /** Terminal fall speed, so a long drop does not accelerate without limit. */
  readonly terminalVelocity: number;
  /**
   * Gravity multiplier applied while descending.
   *
   * Above 1 the fall is faster than the rise. A symmetric parabola is physically pure and
   * feels floaty, because the player spends as long falling — with no control authority
   * left — as rising. Asymmetric gravity is the single largest contributor to a jump
   * feeling responsive.
   */
  readonly fallGravityMultiplier: number;
  /** Gravity multiplier near the apex, below 1, which produces hang time. */
  readonly apexGravityMultiplier: number;
  /** Vertical speed below which the apex-hang reduction applies. */
  readonly apexHangThreshold: number;
  /**
   * Minimum apex when the jump button is released immediately.
   *
   * Variable jump height is what separates a hop from a full jump. Without it every jump
   * is the same height and the player has no fine control.
   */
  readonly shortHopApex: number;
  /** Upward velocity retained when the button is released early. */
  readonly releaseVelocityScale: number;
  /** Geometry the solution was derived from. */
  readonly geometry: PlatformerGeometryFacts;
  /** Estimated time to traverse the course at `moveSpeed`. */
  readonly traversalSeconds: number;
  /** Estimated full session length including jumping and retries. */
  readonly estimatedSessionSeconds: number;
}

/**
 * Derive platformer motion from a level's own geometry.
 *
 * The apex is sized to the tallest step the player must clear, not chosen freely, so a
 * jump cannot overshoot the level by 3.5x. Gravity then follows from the apex and the
 * chosen rise time, and jump velocity from gravity and rise time. Move speed is sized
 * so the jump clears the widest gap and the course takes a chosen amount of time.
 */
/** Named jump feels, as (riseSeconds, apexScale, fallMultiplier) triples. */
export type PlatformerFeel = "snappy" | "responsive" | "floaty";

interface FeelProfile {
  readonly riseSeconds: number;
  /** Apex as a multiple of character height, when no explicit jumpHeight is given. */
  readonly apexPerHeight: number;
  /**
   * Gravity multiplier applied on the way down.
   *
   * Above 1 the fall is faster than the rise. Every platformer that feels good does this:
   * a symmetric parabola reads as floating because the player spends as long descending
   * (when they have no control authority left) as ascending. 1.0 is the physically pure
   * but least pleasant choice.
   */
  readonly fallMultiplier: number;
  /** Fraction of rise time near the apex where gravity is reduced, giving hang time. */
  readonly apexHangFraction: number;
}

const FEEL_PROFILES: Readonly<Record<PlatformerFeel, FeelProfile>> = {
  snappy: { riseSeconds: 0.24, apexPerHeight: 1.6, fallMultiplier: 1.9, apexHangFraction: 0.08 },
  responsive: { riseSeconds: 0.32, apexPerHeight: 2.0, fallMultiplier: 1.6, apexHangFraction: 0.14 },
  floaty: { riseSeconds: 0.46, apexPerHeight: 2.4, fallMultiplier: 1.15, apexHangFraction: 0.22 }
};

export function platformerFeelProfile(feel: PlatformerFeel): FeelProfile {
  const profile = FEEL_PROFILES[feel];
  if (!profile) throw new Error(`Unknown platformer feel "${feel}". Use snappy, responsive or floaty.`);
  return profile;
}

export function solvePlatformerMotion(
  platforms: readonly PlatformerPlatformLike[],
  request: PlatformerMotionRequest = {}
): PlatformerMotionSolution {
  const geometry = measurePlatformerGeometry(platforms);
  const feel = request.feel ? platformerFeelProfile(request.feel) : undefined;
  const riseSeconds = clampPositive(request.riseSeconds ?? feel?.riseSeconds ?? 0.3, 0.08, 1);
  const apexHeadroom = clampPositive(request.apexHeadroom ?? 1.6, 1, 6);
  const gapMargin = clampPositive(request.gapMargin ?? 1.45, 1, 4);
  const minApex = Math.max(0.05, request.minApex ?? 0.4);
  const strict = request.strict ?? true;

  /*
   * Apex comes from intent when intent was expressed, and is validated against the level.
   *
   * The old rule was `max(minApex, maxRise * apexHeadroom)` — geometry-derived, with the
   * level dictating the jump. `maxRise` is the step-up between consecutive platforms, so a
   * near-level course collapsed it and the apex fell to `minApex`: the reported
   * barely-there jump. It also could not express "I want to be able to jump over that",
   * because nothing but the immediate next platform entered the calculation.
   *
   * Order of precedence: an explicit `jumpHeight`, then a `feel` preset scaled by
   * character height, then the geometry-derived value as a backwards-compatible fallback.
   * In every case the result must still clear the tallest step in the level, which is the
   * validation the previous model got for free by construction and now has to assert.
   */
  const geometryApex = Math.max(minApex, geometry.maxRise * apexHeadroom);
  const intentApex = request.jumpHeight !== undefined
    ? Math.max(0.01, request.jumpHeight)
    : feel
      ? Math.max(minApex, feel.apexPerHeight * Math.max(0.1, request.characterHeight ?? 0.5))
      : undefined;
  const requestedApex = intentApex ?? geometryApex;

  /*
   * Validation: can the declared jump actually clear the level?
   *
   * A jump must out-reach the tallest step, with a little margin, or there is a platform
   * the player cannot get onto. Reported by name rather than silently corrected, because a
   * level the character cannot traverse is a level-design bug and the developer is the only
   * one who can decide whether to lower the platform or raise the jump.
   */
  const unclearableRises: string[] = [];
  const requiredRiseClearance = geometry.maxRise * 1.05;
  if (geometry.maxRise > 0 && requestedApex < requiredRiseClearance) {
    unclearableRises.push(
      `tallest step is ${round(geometry.maxRise)} units but the declared jump apex is ` +
      `${round(requestedApex)}; needs at least ${round(requiredRiseClearance)}`
    );
  }
  if (strict && unclearableRises.length > 0) {
    throw new Error(
      "solvePlatformerMotion: the declared jump cannot clear this level.\n" +
      unclearableRises.map((line) => `  - ${line}`).join("\n") +
      "\nRaise jumpHeight, lower the platform, or pass { strict: false } to accept a " +
      "level with unreachable geometry."
    );
  }
  // Non-strict callers get a jump that at least clears the level rather than a broken one.
  const apex = strict ? requestedApex : Math.max(requestedApex, requiredRiseClearance);
  // Projectile motion: apex = v^2 / 2g and riseSeconds = v / g, so g = 2 * apex / t^2.
  const gravityMagnitude = (2 * apex) / (riseSeconds * riseSeconds);
  const jumpVelocity = gravityMagnitude * riseSeconds;
  const airtime = 2 * riseSeconds;

  /*
   * Move speed has two requirements, and the larger wins.
   *
   * It must be fast enough that a full jump clears the widest gap with margin, and it
   * should cross the course in roughly the intended session time. Taking the maximum
   * means a level with a wide gap is never made unclearable by a slow target pace.
   */
  const speedForGap = geometry.maxGap > 0 ? (geometry.maxGap * gapMargin) / airtime : 0;
  const targetSessionSeconds = Math.max(1, request.targetSessionSeconds ?? 0);
  const traversalFraction = clampPositive(request.traversalFraction ?? 0.45, 0.1, 1);
  const speedForSession = targetSessionSeconds > 1 && geometry.courseLength > 0
    ? geometry.courseLength / (targetSessionSeconds * traversalFraction)
    : 0;
  const moveSpeed = Math.max(0.5, speedForGap, speedForSession);

  const traversalSeconds = moveSpeed > 0 ? geometry.courseLength / moveSpeed : 0;

  return {
    kind: "aura-platformer-motion",
    gravity: -round(gravityMagnitude),
    jumpVelocity: round(jumpVelocity),
    moveSpeed: round(moveSpeed),
    apex: round(apex),
    airtime: round(airtime),
    jumpReach: round(moveSpeed * airtime),
    // Coyote time and jump buffer are fractions of airtime rather than fixed
    // milliseconds: a snappy jump needs a shorter grace window than a floaty one, and a
    // fixed 110ms window is a large fraction of a 0.44s jump but a small one of 0.9s.
    coyoteMs: Math.round(airtime * 1000 * 0.18),
    jumpBufferMs: Math.round(airtime * 1000 * 0.22),
    // Terminal velocity caps a long fall at roughly twice takeoff speed, which keeps a
    // drop readable instead of becoming an instant teleport downward.
    terminalVelocity: -round(jumpVelocity * 2),
    fallGravityMultiplier: round(feel?.fallMultiplier ?? 1.6),
    // Reduced gravity in a window either side of the apex. 0.55 is enough to read as
    // hang time without making the arc feel weightless.
    apexGravityMultiplier: 0.55,
    apexHangThreshold: round(jumpVelocity * (feel?.apexHangFraction ?? 0.14)),
    // A short hop reaches ~40% of full apex, which is a usable distinction without making
    // the tap-jump useless for clearing anything.
    shortHopApex: round(apex * 0.4),
    releaseVelocityScale: 0.45,
    geometry,
    traversalSeconds: round(traversalSeconds),
    estimatedSessionSeconds: round(traversalSeconds / traversalFraction)
  };
}

export interface PlatformerMotionCheck {
  readonly id: string;
  readonly description: string;
  readonly passes: boolean;
  readonly detail: string;
}

export interface PlatformerMotionReport {
  readonly schema: "aura3d-platformer-motion-invariants/1.0";
  readonly geometry: PlatformerGeometryFacts;
  readonly measured: {
    readonly apex: number;
    readonly airtime: number;
    readonly jumpReach: number;
    readonly apexToRiseRatio: number;
    readonly reachToGapRatio: number;
  };
  readonly checks: readonly PlatformerMotionCheck[];
  readonly passes: boolean;
}

/**
 * Check that a level's motion tuning is consistent with its geometry.
 *
 * This is the check that was missing. A level can be perfectly solvable and still feel
 * wrong: an over-powered jump clears every obstacle, so solvability passes, while the
 * character visibly floats. Both directions are failures.
 */
export function validatePlatformerMotion(
  platforms: readonly PlatformerPlatformLike[],
  motion: { readonly gravity: number; readonly jumpVelocity: number; readonly moveSpeed: number },
  limits: {
    /** Maximum apex as a multiple of the tallest step. Above this the jump floats. */
    readonly maxApexToRiseRatio?: number | undefined;
    /** Minimum apex as a multiple of the tallest step. Below this a step is unclearable. */
    readonly minApexToRiseRatio?: number | undefined;
    /** Maximum jump reach as a multiple of the widest gap. */
    readonly maxReachToGapRatio?: number | undefined;
    /** Minimum jump reach as a multiple of the widest gap. */
    readonly minReachToGapRatio?: number | undefined;
    /** Maximum airtime in seconds before a jump reads as floaty regardless of ratios. */
    readonly maxAirtimeSeconds?: number | undefined;
  } = {}
): PlatformerMotionReport {
  const geometry = measurePlatformerGeometry(platforms);
  const gravityMagnitude = Math.abs(motion.gravity);
  const apex = gravityMagnitude > 0 ? (motion.jumpVelocity * motion.jumpVelocity) / (2 * gravityMagnitude) : 0;
  const airtime = gravityMagnitude > 0 ? (2 * motion.jumpVelocity) / gravityMagnitude : 0;
  const jumpReach = motion.moveSpeed * airtime;
  const apexToRiseRatio = geometry.maxRise > 0 ? apex / geometry.maxRise : Number.POSITIVE_INFINITY;
  const reachToGapRatio = geometry.maxGap > 0 ? jumpReach / geometry.maxGap : Number.POSITIVE_INFINITY;

  const maxApexRatio = limits.maxApexToRiseRatio ?? 2.6;
  const minApexRatio = limits.minApexToRiseRatio ?? 1.15;
  const maxReachRatio = limits.maxReachToGapRatio ?? 3.2;
  const minReachRatio = limits.minReachToGapRatio ?? 1.1;
  const maxAirtime = limits.maxAirtimeSeconds ?? 0.95;

  const checks: PlatformerMotionCheck[] = [
    {
      id: "jump-clears-tallest-step",
      description: `jump apex must exceed the tallest step by at least ${minApexRatio}x`,
      passes: !Number.isFinite(apexToRiseRatio) || apexToRiseRatio >= minApexRatio,
      detail: `apex ${round(apex)} vs tallest step ${geometry.maxRise} (ratio ${roundRatio(apexToRiseRatio)})`
    },
    {
      id: "jump-not-floaty",
      description: `jump apex must not exceed the tallest step by more than ${maxApexRatio}x`,
      // An infinite ratio means the level has no rises at all, where any apex is fine.
      passes: !Number.isFinite(apexToRiseRatio) || apexToRiseRatio <= maxApexRatio,
      detail: `apex ${round(apex)} vs tallest step ${geometry.maxRise} (ratio ${roundRatio(apexToRiseRatio)})`
    },
    {
      id: "jump-clears-widest-gap",
      description: `horizontal jump reach must exceed the widest gap by at least ${minReachRatio}x`,
      passes: !Number.isFinite(reachToGapRatio) || reachToGapRatio >= minReachRatio,
      detail: `reach ${round(jumpReach)} vs widest gap ${geometry.maxGap} (ratio ${roundRatio(reachToGapRatio)})`
    },
    {
      id: "jump-reach-proportionate",
      description: `horizontal jump reach must not exceed the widest gap by more than ${maxReachRatio}x`,
      passes: !Number.isFinite(reachToGapRatio) || reachToGapRatio <= maxReachRatio,
      detail: `reach ${round(jumpReach)} vs widest gap ${geometry.maxGap} (ratio ${roundRatio(reachToGapRatio)})`
    },
    {
      id: "airtime-readable",
      description: `total airtime must stay under ${maxAirtime}s so a jump reads as a jump`,
      passes: airtime <= maxAirtime,
      detail: `airtime ${round(airtime)}s`
    },
    {
      id: "landing-precision-achievable",
      description: "jump reach must not exceed the narrowest platform by so much that landing is a guess",
      // A reach far larger than the target platform means the player cannot choose where
      // to land, only whether to jump.
      passes: geometry.minPlatformWidth <= 0 || jumpReach <= geometry.minPlatformWidth * 4,
      detail: `reach ${round(jumpReach)} vs narrowest platform ${geometry.minPlatformWidth}`
    }
  ];

  return {
    schema: "aura3d-platformer-motion-invariants/1.0",
    geometry,
    measured: {
      apex: round(apex),
      airtime: round(airtime),
      jumpReach: round(jumpReach),
      apexToRiseRatio: roundRatio(apexToRiseRatio),
      reachToGapRatio: roundRatio(reachToGapRatio)
    },
    checks,
    passes: checks.every((check) => check.passes)
  };
}

function clampPositive(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function roundRatio(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : Number.POSITIVE_INFINITY;
}
