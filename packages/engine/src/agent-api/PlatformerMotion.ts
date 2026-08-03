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
export function solvePlatformerMotion(
  platforms: readonly PlatformerPlatformLike[],
  request: PlatformerMotionRequest = {}
): PlatformerMotionSolution {
  const geometry = measurePlatformerGeometry(platforms);
  const riseSeconds = clampPositive(request.riseSeconds ?? 0.3, 0.08, 1);
  const apexHeadroom = clampPositive(request.apexHeadroom ?? 1.6, 1, 6);
  const gapMargin = clampPositive(request.gapMargin ?? 1.45, 1, 4);
  const minApex = Math.max(0.05, request.minApex ?? 0.4);

  // Apex is the tallest step plus headroom, floored so a flat level still jumps.
  const apex = Math.max(minApex, geometry.maxRise * apexHeadroom);
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
