import { decideTurboOpponentYield, turboBodyOnAsphalt } from "./passing-lane";

export interface TurboOpponentSnapshot {
  readonly progress: number;
  readonly speed: number;
  /** Heading in radians on the game plane; required by the reusable driver. */
  readonly heading: number;
  /** Position on the game plane; required by the reusable driver. */
  readonly position: { readonly x: number; readonly y: number };
  /** True while the car is outside the drivable road, so the driver can recover. */
  readonly offTrack: boolean;
  readonly trackOffset: number;
  /**
   * Signed distance from the racing line. Required, not optional: `trackOffset` is an
   * unsigned magnitude, so a controller reading only that cannot tell which way to
   * correct and drives itself into the track edge (this is defect 26, which was fixed
   * for the player and then found again here).
   */
  readonly signedTrackOffset: number;
  readonly lap: number;
  readonly checkpoint: number;
  readonly status: string;
  readonly frame: number;
}

export interface TurboOpponentInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly steer: number;
}

export interface TurboOpponentRacingState<TSnapshot extends TurboOpponentSnapshot> {
  snapshot(): TSnapshot;
  step(dt: number, input: TurboOpponentInput): TSnapshot;
  reset(progress?: number): TSnapshot;
  resolveContact?(position: { readonly x: number; readonly y: number }, options?: {
    readonly heading?: number;
    readonly speedMultiplier?: number;
    readonly driftMultiplier?: number;
  }): TSnapshot;
}

/**
 * Reusable driver the opponent delegates its decisions to.
 *
 * Structural, not nominal, so this module does not depend on the engine's concrete
 * driver type: the route wires in `createVehicleDriverAi`, and a test can wire in a
 * fake.
 */
export interface TurboOpponentDriver {
  decide(dt: number, state: {
    readonly progress: number;
    readonly speed: number;
    readonly heading: number;
    readonly signedTrackOffset: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly offTrack: boolean;
    readonly preferredSignedOffset?: number;
  }): { readonly throttle: number; readonly brake: number; readonly steer: number; readonly drift: boolean };
  /**
   * Whatever the driver reports about its own decision. Only `targetSpeed` is read here;
   * the rest is passed through to evidence untouched.
   *
   * Typed as an interface-compatible object rather than `Record<string, unknown>`: the
   * engine's `DriverTelemetry` has no index signature, so a `Record` parameter type
   * rejected the very driver this interface exists to accept.
   */
  telemetry(): { readonly targetSpeed?: number };
  reset(): void;
}

export interface TurboOpponentAiConfig {
  readonly startProgress: number;
  readonly maxSpeed: number;
  readonly cruiseRatio?: number;
  readonly catchUpStrength?: number;
  readonly legalPassingOffset?: number;
  readonly maxAsphaltOffset?: number;
  readonly bodyHalfWidth?: number;
  readonly visualAsphaltHalfWidth?: number;
  readonly yieldEnabled?: boolean;
  /** Seeded drama variance for late-race apex errors. */
  readonly dramaSeed?: number;
  /**
   * Proportional gain for returning to the racing line. Scale this with the route's
   * width: a gain tuned for a wide kart circuit under-corrects on a narrow one.
   */
  readonly steeringGain?: number;
  /**
   * Reusable driver that makes every decision.
   *
   * When supplied, this module becomes a thin state container and the driving model
   * lives in the engine. The route-local `decide` below is retained only as a
   * fallback for callers that have not migrated; it steers purely on present lateral
   * offset, which cannot turn into a corner before reaching it.
   */
  readonly driver?: TurboOpponentDriver;
}

export interface TurboOpponentAiEvidence {
  readonly controller: "route-local-deterministic-opponent-ai" | "aura-vehicle-driver-ai";
  /** Reusable driver telemetry: look-ahead, curvature, corner limit, recovery. */
  readonly driverTelemetry?: Record<string, unknown>;
  readonly independentFromPlayerPlacement: true;
  readonly decisionCount: number;
  readonly progress: number;
  readonly playerProgress: number;
  readonly signedPlayerGap: number;
  readonly separation: number;
  readonly targetSpeed: number;
  readonly input: TurboOpponentInput;
  readonly recentDecisions: readonly string[];
  readonly preferredSignedOffset: number;
  readonly yielding: boolean;
  readonly defending: boolean;
  readonly apexErrorSeconds: number;
  readonly offTrack: boolean;
  readonly signedTrackOffset: number;
  readonly onAsphalt: boolean;
  readonly onRoad: boolean;
  readonly bodyHalfWidth?: number;
  readonly outerEdge?: number;
  readonly visualAsphaltHalfWidth?: number;
}

export interface TurboOpponentAi<TSnapshot extends TurboOpponentSnapshot> {
  snapshot(): TSnapshot;
  step(dt: number, playerProgress: number, playerSignedOffset?: number): TSnapshot;
  reset(): TSnapshot;
  resolveContact(position: { readonly x: number; readonly y: number }, speedMultiplier?: number, heading?: number): TSnapshot;
  evidence(playerProgress: number): TurboOpponentAiEvidence;
}

export function createTurboOpponentAi<TSnapshot extends TurboOpponentSnapshot>(
  state: TurboOpponentRacingState<TSnapshot>,
  config: TurboOpponentAiConfig
): TurboOpponentAi<TSnapshot> {
  const cruiseRatio = config.cruiseRatio ?? 0.78;
  const catchUpStrength = config.catchUpStrength ?? 0.2;
  const steeringGain = config.steeringGain ?? 1.7;
  let snapshot = state.snapshot();
  let elapsed = 0;
  let decisionCount = 0;
  let lastInput: TurboOpponentInput = { throttle: false, brake: false, steer: 0 };
  let lastTargetSpeed = config.maxSpeed * cruiseRatio;
  let lastPreferredSignedOffset = 0;
  let lastYielding = false;
  let lastDefending = false;
  let apexErrorSeconds = 0;
  const dramaSeed = config.dramaSeed ?? 20260817;
  const recentDecisions: string[] = [];

  function decide(playerProgress: number): TurboOpponentInput {
    const signedPlayerGap = wrappedGap(playerProgress, snapshot.progress);
    const paceAdjustment = clamp(signedPlayerGap * catchUpStrength, -0.12, 0.16);
    lastTargetSpeed = config.maxSpeed * clamp(cruiseRatio + paceAdjustment, 0.62, 0.94);
    const steeringCorrection = -snapshot.signedTrackOffset * steeringGain;
    const racingLineVariation = Math.sin(elapsed * 0.82) * 0.075;
    return {
      throttle: Math.abs(snapshot.speed) < lastTargetSpeed - 0.025,
      brake: Math.abs(snapshot.speed) > lastTargetSpeed + 0.1,
      // Full lock must be reachable. The previous +/-0.72 clamp existed to keep the AI
      // looking smooth on a wide kart circuit, but on a real circuit it cannot get
      // through a 95-degree hairpin and the car stalls against the outside wall.
      steer: round(clamp(steeringCorrection + racingLineVariation, -1, 1))
    };
  }

  function remember(input: TurboOpponentInput): void {
    if (
      input.throttle === lastInput.throttle &&
      input.brake === lastInput.brake &&
      Math.abs(input.steer - lastInput.steer) < 0.015
    ) return;
    decisionCount += 1;
    const mode = input.brake ? "brake" : input.throttle ? "throttle" : "coast";
    recentDecisions.push(`${mode}:steer=${input.steer.toFixed(3)}:target=${lastTargetSpeed.toFixed(3)}`);
    if (recentDecisions.length > 8) recentDecisions.shift();
  }

  /**
   * Decide via the reusable engine driver when one is supplied.
   *
   * The driver samples the racing line ahead of the car and sets a target speed from
   * the curvature it is about to meet, so it turns into corners and brakes for them.
   * The route-local fallback cannot: it only nulls present lateral offset.
   */
  function decideWithDriver(dt: number, driver: TurboOpponentDriver, playerSignedOffset = 0, playerProgress = 0): TurboOpponentInput {
    const wrappedPlayerGap = wrappedGap(playerProgress, snapshot.progress);
    const lateRace = snapshot.lap >= 3 || playerProgress > 0.55;
    const yieldDecision = config.yieldEnabled === false
      ? {
        preferredSignedOffset: 0,
        passingSide: "left" as const,
        yielding: false,
        mode: "racing-line" as const
      }
      : decideTurboOpponentYield({
        wrappedPlayerGap,
        playerSignedOffset,
        opponentSignedOffset: snapshot.signedTrackOffset,
        legalPassingOffset: config.legalPassingOffset ?? 0.06,
        ...(config.maxAsphaltOffset === undefined ? {} : { maxAsphaltOffset: config.maxAsphaltOffset })
      });
    let preferredSignedOffset = yieldDecision.preferredSignedOffset;
    lastYielding = yieldDecision.yielding;
    // Defend the inside whenever the player is close, ahead or a touch behind.
    // The yield decision labels the whole side-by-side/defensive window "yielding",
    // so gating this on !yielding made the defense branch unreachable and the rival
    // never actually defended the inside line.
    lastDefending = lateRace
      && wrappedPlayerGap > -0.06
      && wrappedPlayerGap < 0.018;
    if (lastDefending) {
      // Defend the inside: commit harder toward the apex side than a simple racing
      // line so the player must work around the rival. The defensive speed dip below
      // trades a touch of pace for the line so a sharp driver can still undercut.
      const defendSide: "left" | "right" = playerSignedOffset > 0.008 ? "right" : "left";
      const cap = config.maxAsphaltOffset ?? Math.abs(preferredSignedOffset);
      preferredSignedOffset = defendSide === "left" ? cap * 0.52 : -cap * 0.52;
    }

    const driverTelemetry = config.driver?.telemetry() ?? {};
    const lookAheadCurvature = Number((driverTelemetry as { readonly upcomingCurvature?: number }).upcomingCurvature ?? 0);
    const missedApex = lateRace
      && Math.abs(lookAheadCurvature) > 0.55
      && Math.abs(snapshot.signedTrackOffset) > (config.legalPassingOffset ?? 0.06) * 0.85
      && Math.abs(snapshot.speed) > config.maxSpeed * 0.62;
    if (missedApex) {
      const seeded = seededUnit(dramaSeed, snapshot.progress, snapshot.lap);
      apexErrorSeconds = Math.max(apexErrorSeconds, 0.12 + seeded * 0.22);
    } else {
      apexErrorSeconds = Math.max(0, apexErrorSeconds - dt);
    }

    lastPreferredSignedOffset = preferredSignedOffset;
    const decision = driver.decide(dt, {
      progress: snapshot.progress,
      speed: snapshot.speed,
      heading: snapshot.heading,
      signedTrackOffset: snapshot.signedTrackOffset,
      position: snapshot.position,
      offTrack: snapshot.offTrack,
      preferredSignedOffset
    });
    const telemetryTarget = Number(driver.telemetry().targetSpeed ?? lastTargetSpeed);
    const apexPenalty = apexErrorSeconds > 0 ? Math.max(0.55, 1 - apexErrorSeconds * 1.8) : 1;
    // Late-race defense costs a little pace while holding the inside line, which is
    // what makes a human overtake possible rather than a blocking wall.
    const defenseDip = lastDefending ? 0.94 : 1;
    lastTargetSpeed = telemetryTarget * apexPenalty * defenseDip;
    const speedShortfall = Math.abs(snapshot.speed) < lastTargetSpeed - 0.025;
    return {
      throttle: speedShortfall && decision.throttle > 0.08,
      brake: !speedShortfall && (decision.brake > 0.08 || apexErrorSeconds > 0.08),
      steer: round(decision.steer)
    };
  }

  return {
    snapshot: () => snapshot,
    resolveContact(position, speedMultiplier = 0.55, heading) {
      if (!state.resolveContact) return snapshot;
      snapshot = state.resolveContact(position, {
        speedMultiplier,
        heading,
        driftMultiplier: 0.35
      });
      return snapshot;
    },
    step(dt, playerProgress, playerSignedOffset = 0) {
      elapsed += Math.max(0, dt);
      const input = config.driver
        ? decideWithDriver(dt, config.driver, playerSignedOffset, playerProgress)
        : decide(playerProgress);
      remember(input);
      lastInput = input;
      snapshot = state.step(dt, input);
      return snapshot;
    },
    reset() {
      elapsed = 0;
      decisionCount = 0;
      lastInput = { throttle: false, brake: false, steer: 0 };
      lastTargetSpeed = config.maxSpeed * cruiseRatio;
      lastPreferredSignedOffset = 0;
      lastYielding = false;
      lastDefending = false;
      apexErrorSeconds = 0;
      recentDecisions.length = 0;
      config.driver?.reset();
      snapshot = state.reset(config.startProgress);
      return snapshot;
    },
    evidence(playerProgress) {
      const signedPlayerGap = wrappedGap(playerProgress, snapshot.progress);
      return {
        controller: config.driver ? "aura-vehicle-driver-ai" : "route-local-deterministic-opponent-ai",
        ...(config.driver ? { driverTelemetry: config.driver.telemetry() } : {}),
        independentFromPlayerPlacement: true,
        decisionCount,
        progress: round(snapshot.progress),
        playerProgress: round(playerProgress),
        signedPlayerGap: round(signedPlayerGap),
        separation: round(Math.abs(signedPlayerGap)),
        targetSpeed: round(lastTargetSpeed),
        input: lastInput,
        recentDecisions: recentDecisions.slice(),
        preferredSignedOffset: round(lastPreferredSignedOffset),
        yielding: lastYielding,
        defending: lastDefending,
        apexErrorSeconds: round(apexErrorSeconds),
        offTrack: snapshot.offTrack,
        signedTrackOffset: round(snapshot.signedTrackOffset),
        onAsphalt: config.bodyHalfWidth !== undefined && config.visualAsphaltHalfWidth !== undefined
          ? turboBodyOnAsphalt({
            signedTrackOffset: snapshot.signedTrackOffset,
            bodyHalfWidth: config.bodyHalfWidth,
            visualAsphaltHalfWidth: config.visualAsphaltHalfWidth
          })
          : snapshot.offTrack !== true,
        // onRoad is the grey-asphalt body check when widths are known. !offTrack
        // alone stays true on the kerb/verge and must not be used as on-asphalt.
        onRoad: config.bodyHalfWidth !== undefined && config.visualAsphaltHalfWidth !== undefined
          ? turboBodyOnAsphalt({
            signedTrackOffset: snapshot.signedTrackOffset,
            bodyHalfWidth: config.bodyHalfWidth,
            visualAsphaltHalfWidth: config.visualAsphaltHalfWidth
          })
          : snapshot.offTrack !== true
      };
    }
  };
}

function wrappedGap(a: number, b: number): number {
  let gap = a - b;
  while (gap > 0.5) gap -= 1;
  while (gap < -0.5) gap += 1;
  return gap;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function seededUnit(seed: number, progress: number, lap: number): number {
  const mixed = Math.sin(seed * 0.017 + progress * 41.3 + lap * 7.9) * 43758.5453;
  return mixed - Math.floor(mixed);
}
