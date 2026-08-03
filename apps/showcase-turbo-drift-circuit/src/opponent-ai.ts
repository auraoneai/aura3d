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
  }): { readonly throttle: number; readonly brake: number; readonly steer: number; readonly drift: boolean };
  telemetry(): Record<string, unknown>;
  reset(): void;
}

export interface TurboOpponentAiConfig {
  readonly startProgress: number;
  readonly maxSpeed: number;
  readonly cruiseRatio?: number;
  readonly catchUpStrength?: number;
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
}

export interface TurboOpponentAi<TSnapshot extends TurboOpponentSnapshot> {
  snapshot(): TSnapshot;
  step(dt: number, playerProgress: number): TSnapshot;
  reset(): TSnapshot;
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
  function decideWithDriver(dt: number, driver: TurboOpponentDriver): TurboOpponentInput {
    const decision = driver.decide(dt, {
      progress: snapshot.progress,
      speed: snapshot.speed,
      heading: snapshot.heading,
      signedTrackOffset: snapshot.signedTrackOffset,
      position: snapshot.position,
      offTrack: snapshot.offTrack
    });
    lastTargetSpeed = Number((driver.telemetry().targetSpeed as number | undefined) ?? lastTargetSpeed);
    return {
      // The racing kit takes boolean throttle/brake; a proportional decision is
      // applied above a deadband so light corrections do not chatter the pedals.
      throttle: decision.throttle > 0.08,
      brake: decision.brake > 0.08,
      steer: round(decision.steer)
    };
  }

  return {
    snapshot: () => snapshot,
    step(dt, playerProgress) {
      elapsed += Math.max(0, dt);
      const input = config.driver ? decideWithDriver(dt, config.driver) : decide(playerProgress);
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
        recentDecisions: recentDecisions.slice()
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
