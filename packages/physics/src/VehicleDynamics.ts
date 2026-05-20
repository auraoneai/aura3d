export interface ArcadeVehicleDynamicsInput {
  readonly elapsedSeconds: number;
  readonly throttle?: number;
  readonly brake?: number;
  readonly steer?: number;
  readonly handbrake?: boolean;
  readonly nitro?: boolean;
  readonly maxSpeedKph?: number;
  readonly acceleration?: number;
  readonly brakeForce?: number;
  readonly gripFactor?: number;
  readonly driftFactor?: number;
}

export interface ArcadeVehicleDynamicsSample {
  readonly speedKph: number;
  readonly rpm: number;
  readonly nitro: number;
  readonly steerAngle: number;
  readonly driftSlip: number;
  readonly grip: number;
  readonly wheelSpin: number;
  readonly suspensionCompression: readonly [number, number, number, number];
}

export type PacejkaTirePreset = "street" | "sport" | "racing" | "offroad";
export type RacingAiDifficulty = "easy" | "medium" | "hard";
export type DrivetrainDifferential = "open" | "limited-slip" | "locked" | "electronic";

export interface PacejkaTireCoefficients {
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
}

export interface PacejkaTireForceInput {
  readonly longitudinalVelocity: number;
  readonly lateralVelocity?: number;
  readonly angularVelocity: number;
  readonly normalForce: number;
  readonly steeringAngle?: number;
  readonly camberAngle?: number;
  readonly radius?: number;
  readonly width?: number;
  readonly maxLoad?: number;
  readonly loadSensitivity?: number;
  readonly rollingResistance?: number;
  readonly longitudinal?: PacejkaTireCoefficients | PacejkaTirePreset;
  readonly lateral?: PacejkaTireCoefficients | PacejkaTirePreset;
}

export interface PacejkaTireForceSample {
  readonly longitudinalForce: number;
  readonly lateralForce: number;
  readonly combinedForce: number;
  readonly slipRatio: number;
  readonly slipAngle: number;
  readonly aligningTorque: number;
  readonly optimalSlipRatio: number;
  readonly optimalSlipAngle: number;
  readonly preset: {
    readonly longitudinal: PacejkaTirePreset | "custom";
    readonly lateral: PacejkaTirePreset | "custom";
  };
}

export interface RacingAiDriverInput {
  readonly difficulty?: RacingAiDifficulty;
  readonly elapsedSeconds: number;
  readonly progress: number;
  readonly speedKph: number;
  readonly targetSpeedKph?: number;
  readonly trackCurvature?: number;
  readonly opponentDistance?: number;
  readonly opponentAhead?: boolean;
  readonly playerGapSeconds?: number;
}

export interface RacingAiDriverSample {
  readonly difficulty: RacingAiDifficulty;
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly targetSpeedKph: number;
  readonly lookaheadDistance: number;
  readonly reactionTime: number;
  readonly aggressiveness: number;
  readonly overtaking: boolean;
  readonly overtakeOffset: number;
  readonly rubberbandBoost: number;
}

export interface VehicleDrivetrainInput {
  readonly speedKph: number;
  readonly throttle?: number;
  readonly clutch?: number;
  readonly gearRatios?: readonly number[];
  readonly finalDriveRatio?: number;
  readonly idleRpm?: number;
  readonly maxRpm?: number;
  readonly peakTorque?: number;
  readonly peakTorqueRpm?: number;
  readonly upshiftRpm?: number;
  readonly downshiftRpm?: number;
  readonly differential?: DrivetrainDifferential;
  readonly frontRearSplit?: number;
  readonly lockingFactor?: number;
  readonly dragCoefficient?: number;
  readonly frontalArea?: number;
  readonly downforceCoefficient?: number;
}

export interface VehicleDrivetrainSample {
  readonly gear: number;
  readonly gearRatio: number;
  readonly engineRpm: number;
  readonly engineTorque: number;
  readonly wheelTorque: number;
  readonly frontTorque: number;
  readonly rearTorque: number;
  readonly dragForce: number;
  readonly downforce: number;
  readonly shiftState: "hold" | "upshift" | "downshift";
  readonly differential: DrivetrainDifferential;
}

export interface VehicleEffectEmitterInput {
  readonly speedKph: number;
  readonly throttle?: number;
  readonly steer?: number;
  readonly handbrake?: boolean;
  readonly nitroActive?: boolean;
  readonly wheelOnGround?: readonly [boolean, boolean, boolean, boolean];
}

export interface VehicleEffectEmitterSample {
  readonly tireSmokeRates: readonly [number, number, number, number];
  readonly totalTireSmokeRate: number;
  readonly nitroFlameRate: number;
  readonly visibleEffectEmitters: number;
  readonly smokeReason: "none" | "handbrake" | "launch-wheelspin" | "high-speed-steer";
}

export interface VehicleDamageInput {
  readonly health?: number;
  readonly impactSpeedKph?: number;
  readonly collisionSeverity?: number;
  readonly repair?: number;
}

export interface VehicleDamageSample {
  readonly health: number;
  readonly damage: number;
  readonly impactDamage: number;
  readonly visualDamageLevel: "none" | "scratched" | "dented" | "critical";
  readonly disabled: boolean;
}

export function sampleArcadeVehicleDynamics(input: ArcadeVehicleDynamicsInput): ArcadeVehicleDynamicsSample {
  const elapsed = finiteNonNegative(input.elapsedSeconds, "elapsedSeconds");
  const throttle = clamp(input.throttle ?? 1, -1, 1);
  const brake = clamp(input.brake ?? 0, 0, 1);
  const steer = clamp(input.steer ?? 0, -1, 1);
  const maxSpeedKph = positive(input.maxSpeedKph ?? 220, "maxSpeedKph");
  const acceleration = positive(input.acceleration ?? 9.5, "acceleration");
  const brakeForce = positive(input.brakeForce ?? 14, "brakeForce");
  const gripFactor = clamp(input.gripFactor ?? 0.82, 0, 1);
  const driftFactor = clamp(input.driftFactor ?? 0.36, 0, 1);
  const maxSpeedMps = maxSpeedKph / 3.6;
  const accelerationCurve = 1 - Math.exp(-elapsed * acceleration / Math.max(1, maxSpeedMps));
  const braking = Math.min(maxSpeedMps, brakeForce * brake * Math.min(elapsed, 4));
  const nitroAvailable = Math.max(0, 100 - elapsed * 10.5);
  const nitroBoost = input.nitro === true && nitroAvailable > 0 ? 1.18 : 1;
  const signedSpeedMps = clamp((maxSpeedMps * accelerationCurve * throttle * nitroBoost) - braking, -maxSpeedMps * 0.32, maxSpeedMps * nitroBoost);
  const speedRatio = Math.min(1, Math.abs(signedSpeedMps) / maxSpeedMps);
  const highSpeedSteerLimit = 1 - speedRatio * 0.55;
  const steerAngle = steer * 0.62 * highSpeedSteerLimit;
  const handbrakeSlip = input.handbrake === true ? driftFactor * (0.45 + speedRatio * 0.55) : 0;
  const steeringSlip = Math.abs(steer) * speedRatio * (1 - gripFactor) * 0.75;
  const driftSlip = clamp(handbrakeSlip + steeringSlip, 0, 1);
  const grip = clamp(gripFactor * (1 - driftSlip * 0.62), 0, 1);
  const rpm = 1000 + speedRatio * 6100 + (input.nitro === true ? 650 : 0) + driftSlip * 450;
  const wheelSpin = elapsed * Math.abs(signedSpeedMps) * (1 + driftSlip * 1.8);
  const suspensionCompression = suspensionFor(steer, speedRatio, driftSlip);
  return {
    speedKph: Number((signedSpeedMps * 3.6).toFixed(3)),
    rpm: Number(rpm.toFixed(3)),
    nitro: Number(nitroAvailable.toFixed(3)),
    steerAngle: Number(steerAngle.toFixed(5)),
    driftSlip: Number(driftSlip.toFixed(5)),
    grip: Number(grip.toFixed(5)),
    wheelSpin: Number(wheelSpin.toFixed(5)),
    suspensionCompression
  };
}

export function sampleVehicleDamage(input: VehicleDamageInput): VehicleDamageSample {
  const health = clamp(finiteNonNegative(input.health ?? 100, "health"), 0, 100);
  const impactSpeedKph = finiteNonNegative(input.impactSpeedKph ?? 0, "impactSpeedKph");
  const collisionSeverity = clamp(input.collisionSeverity ?? 0, 0, 1);
  const repair = clamp(input.repair ?? 0, 0, 100);
  const impactDamage = Math.max(0, (impactSpeedKph - 18) * 0.34 * collisionSeverity);
  const nextHealth = clamp(health - impactDamage + repair, 0, 100);
  const damage = 100 - nextHealth;
  return {
    health: Number(nextHealth.toFixed(3)),
    damage: Number(damage.toFixed(3)),
    impactDamage: Number(impactDamage.toFixed(3)),
    visualDamageLevel: damage >= 72 ? "critical" : damage >= 42 ? "dented" : damage > 0 ? "scratched" : "none",
    disabled: nextHealth <= 0
  };
}

export function sampleVehicleEffectEmitters(input: VehicleEffectEmitterInput): VehicleEffectEmitterSample {
  const speedKph = finiteNonNegative(input.speedKph, "speedKph");
  const throttle = clamp(input.throttle ?? 0, -1, 1);
  const steer = clamp(input.steer ?? 0, -1, 1);
  const wheelOnGround = input.wheelOnGround ?? [true, true, true, true];
  const smokeReason = input.handbrake === true
    ? "handbrake"
    : Math.abs(throttle) > 0.7 && speedKph < 30
      ? "launch-wheelspin"
      : Math.abs(steer) > 0.7 && speedKph > 50
        ? "high-speed-steer"
        : "none";
  const baseSmokeRate = smokeReason === "none" ? 0 : smokeReason === "handbrake" ? 64 : smokeReason === "launch-wheelspin" ? 46 : 38;
  const tireSmokeRates = wheelOnGround.map((onGround, index) => {
    const rearBias = index >= 2 ? 1.18 : 0.86;
    return onGround ? Number((baseSmokeRate * rearBias).toFixed(3)) : 0;
  }) as [number, number, number, number];
  const nitroFlameRate = input.nitroActive === true ? Number((160 + Math.abs(throttle) * 80).toFixed(3)) : 0;
  const totalTireSmokeRate = Number(tireSmokeRates.reduce((sum, rate) => sum + rate, 0).toFixed(3));
  return {
    tireSmokeRates,
    totalTireSmokeRate,
    nitroFlameRate,
    visibleEffectEmitters: tireSmokeRates.filter((rate) => rate > 0).length + (nitroFlameRate > 0 ? 1 : 0),
    smokeReason
  };
}

export function sampleVehicleDrivetrain(input: VehicleDrivetrainInput): VehicleDrivetrainSample {
  const speedKph = finiteNonNegative(input.speedKph, "speedKph");
  const throttle = clamp(input.throttle ?? 1, 0, 1);
  const clutch = clamp(input.clutch ?? 1, 0, 1);
  const gearRatios = validateGearRatios(input.gearRatios ?? [3.42, 2.21, 1.52, 1.14, 0.89, 0.71]);
  const finalDriveRatio = positive(input.finalDriveRatio ?? 3.55, "finalDriveRatio");
  const idleRpm = positive(input.idleRpm ?? 950, "idleRpm");
  const maxRpm = Math.max(idleRpm + 1, positive(input.maxRpm ?? 7200, "maxRpm"));
  const peakTorque = positive(input.peakTorque ?? 420, "peakTorque");
  const peakTorqueRpm = clamp(positive(input.peakTorqueRpm ?? 4200, "peakTorqueRpm"), idleRpm, maxRpm);
  const upshiftRpm = clamp(input.upshiftRpm ?? maxRpm * 0.86, idleRpm, maxRpm);
  const downshiftRpm = clamp(input.downshiftRpm ?? peakTorqueRpm * 0.55, idleRpm, upshiftRpm);
  const differential = input.differential ?? "limited-slip";
  const frontRearSplit = clamp(input.frontRearSplit ?? 0.42, 0, 1);
  const lockingFactor = clamp(input.lockingFactor ?? 0.35, 0, 1);
  const dragCoefficient = positive(input.dragCoefficient ?? 0.32, "dragCoefficient");
  const frontalArea = positive(input.frontalArea ?? 2.1, "frontalArea");
  const downforceCoefficient = finiteNonNegative(input.downforceCoefficient ?? 0.58, "downforceCoefficient");
  const speedMps = speedKph / 3.6;
  const wheelRadius = 0.34;
  const wheelRpm = speedMps <= 0 ? 0 : (speedMps / (Math.PI * 2 * wheelRadius)) * 60;
  const selected = selectAutomaticGear(gearRatios, wheelRpm, finalDriveRatio, idleRpm, maxRpm, upshiftRpm, downshiftRpm);
  const engineRpm = clamp(Math.max(idleRpm, wheelRpm * selected.ratio * finalDriveRatio), idleRpm, maxRpm);
  const engineTorque = engineTorqueAt(engineRpm, peakTorque, peakTorqueRpm, idleRpm, maxRpm) * throttle;
  const differentialEfficiency = differential === "open"
    ? 0.92
    : differential === "limited-slip"
      ? 0.95 + lockingFactor * 0.025
      : differential === "locked"
        ? 0.96 + lockingFactor * 0.02
        : 0.94 + lockingFactor * 0.04;
  const wheelTorque = engineTorque * selected.ratio * finalDriveRatio * clutch * differentialEfficiency;
  const torqueBias = differential === "open"
    ? 0
    : differential === "limited-slip"
      ? lockingFactor * 0.04
      : differential === "locked"
        ? lockingFactor * 0.02
        : lockingFactor * 0.06;
  const frontSplit = clamp(frontRearSplit - torqueBias, 0, 1);
  const dragForce = 0.5 * 1.225 * dragCoefficient * frontalArea * speedMps * speedMps;
  const downforce = 0.5 * 1.225 * downforceCoefficient * frontalArea * speedMps * speedMps;
  return {
    gear: selected.gear,
    gearRatio: Number(selected.ratio.toFixed(4)),
    engineRpm: Number(engineRpm.toFixed(3)),
    engineTorque: Number(engineTorque.toFixed(3)),
    wheelTorque: Number(wheelTorque.toFixed(3)),
    frontTorque: Number((wheelTorque * frontSplit).toFixed(3)),
    rearTorque: Number((wheelTorque * (1 - frontSplit)).toFixed(3)),
    dragForce: Number(dragForce.toFixed(3)),
    downforce: Number(downforce.toFixed(3)),
    shiftState: selected.shiftState,
    differential
  };
}

export function sampleRacingAiDriver(input: RacingAiDriverInput): RacingAiDriverSample {
  const elapsed = finiteNonNegative(input.elapsedSeconds, "elapsedSeconds");
  const progress = clamp(finite(input.progress, "progress"), 0, 1);
  const speedKph = finiteNonNegative(input.speedKph, "speedKph");
  const targetSpeedKph = positive(input.targetSpeedKph ?? 220, "targetSpeedKph");
  const curvature = clamp(input.trackCurvature ?? 0, -1, 1);
  const opponentDistance = input.opponentDistance === undefined ? Number.POSITIVE_INFINITY : finiteNonNegative(input.opponentDistance, "opponentDistance");
  const playerGapSeconds = finite(input.playerGapSeconds ?? 0, "playerGapSeconds");
  const difficulty = input.difficulty ?? "medium";
  const settings = racingAiSettings(difficulty);
  const rubberbandBoost = clamp((-playerGapSeconds) * settings.rubberbandStrength * 0.08, -0.08, 0.18);
  const desiredSpeed = targetSpeedKph * settings.targetSpeedFactor * (1 - Math.abs(curvature) * 0.24) * (1 + rubberbandBoost);
  const speedError = desiredSpeed - speedKph;
  const overtaking = input.opponentAhead === true && opponentDistance < 22 && settings.aggressiveness >= 0.55;
  const deterministicSide = Math.sin((progress + elapsed * 0.13) * Math.PI * 6) >= 0 ? 1 : -1;
  const overtakeOffset = overtaking ? deterministicSide * (0.28 + settings.aggressiveness * 0.18) : 0;
  const racingLineSteer = Math.sin(progress * Math.PI * 2) * 0.18 + curvature * 0.62;
  const rawSteer = racingLineSteer + overtakeOffset;
  const steer = clamp(rawSteer * settings.steerSmoothing, -1, 1);
  return {
    difficulty,
    throttle: Number(clamp(speedError / 48 + 0.5, 0, 1).toFixed(4)),
    brake: Number(clamp(-speedError / 38 + Math.abs(curvature) * 0.18, 0, 1).toFixed(4)),
    steer: Number(steer.toFixed(4)),
    targetSpeedKph: Number(desiredSpeed.toFixed(3)),
    lookaheadDistance: Number((15 + speedKph / 10 + (overtaking ? -4 : 0)).toFixed(3)),
    reactionTime: settings.reactionTime,
    aggressiveness: settings.aggressiveness,
    overtaking,
    overtakeOffset: Number(overtakeOffset.toFixed(4)),
    rubberbandBoost: Number(rubberbandBoost.toFixed(4))
  };
}

export function samplePacejkaTireForces(input: PacejkaTireForceInput): PacejkaTireForceSample {
  const normalForce = finiteNonNegative(input.normalForce, "normalForce");
  const longitudinalVelocity = finite(input.longitudinalVelocity, "longitudinalVelocity");
  const lateralVelocity = finite(input.lateralVelocity ?? 0, "lateralVelocity");
  const angularVelocity = finite(input.angularVelocity, "angularVelocity");
  const steeringAngle = finite(input.steeringAngle ?? 0, "steeringAngle");
  const camberAngle = finite(input.camberAngle ?? 0, "camberAngle");
  const radius = positive(input.radius ?? 0.33, "radius");
  const width = positive(input.width ?? 0.225, "width");
  const maxLoad = positive(input.maxLoad ?? 5000, "maxLoad");
  const loadSensitivity = positive(input.loadSensitivity ?? 1, "loadSensitivity");
  const rollingResistance = clamp(input.rollingResistance ?? 0.015, 0, 1);
  const longitudinal = coefficients(input.longitudinal ?? "sport");
  const lateral = coefficients(input.lateral ?? "sport");
  if (normalForce === 0) {
    return {
      longitudinalForce: 0,
      lateralForce: 0,
      combinedForce: 0,
      slipRatio: 0,
      slipAngle: 0,
      aligningTorque: 0,
      optimalSlipRatio: optimalSlipRatio(longitudinal.value),
      optimalSlipAngle: optimalSlipAngle(lateral.value),
      preset: { longitudinal: longitudinal.preset, lateral: lateral.preset }
    };
  }

  const slipRatio = tireSlipRatio(longitudinalVelocity, angularVelocity, radius);
  const slipAngle = tireSlipAngle(longitudinalVelocity, lateralVelocity, steeringAngle);
  const loadFactor = clamp(Math.pow(normalForce / maxLoad, loadSensitivity), 0.1, 1.5);
  const camberGrip = clamp(1 - Math.abs(camberAngle) * 0.1, 0.75, 1.08);
  const longitudinalPure = pacejka(slipRatio, longitudinal.value) * normalForce * loadFactor * camberGrip
    - Math.sign(longitudinalVelocity) * normalForce * rollingResistance;
  const lateralPure = pacejka(slipAngle * 180 / Math.PI, lateral.value) * normalForce * loadFactor * clamp(1 + camberAngle * 0.1, 0.75, 1.15);
  const slipMagnitude = Math.hypot(Math.abs(slipRatio), Math.abs(slipAngle));
  const longitudinalScale = slipMagnitude < 0.001 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((Math.abs(slipAngle) / slipMagnitude) * 0.9, 2)));
  const lateralScale = slipMagnitude < 0.001 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((Math.abs(slipRatio) / slipMagnitude) * 0.9, 2)));
  const longitudinalForce = longitudinalPure * longitudinalScale;
  const lateralForce = lateralPure * lateralScale;
  const pneumaticTrail = width * 0.5;
  const torqueCoeff = -pneumaticTrail * clamp(1 - Math.abs(slipAngle * 180 / Math.PI) / 20, 0, 1);
  const aligningTorque = clamp(lateralForce * torqueCoeff, -normalForce * width, normalForce * width);
  return {
    longitudinalForce: Number(longitudinalForce.toFixed(3)),
    lateralForce: Number(lateralForce.toFixed(3)),
    combinedForce: Number(Math.hypot(longitudinalForce, lateralForce).toFixed(3)),
    slipRatio: Number(slipRatio.toFixed(5)),
    slipAngle: Number(slipAngle.toFixed(5)),
    aligningTorque: Number(aligningTorque.toFixed(3)),
    optimalSlipRatio: Number(optimalSlipRatio(longitudinal.value).toFixed(5)),
    optimalSlipAngle: Number(optimalSlipAngle(lateral.value).toFixed(5)),
    preset: { longitudinal: longitudinal.preset, lateral: lateral.preset }
  };
}

function validateGearRatios(values: readonly number[]): readonly number[] {
  if (values.length === 0) {
    throw new RangeError("VehicleDynamics gearRatios must contain at least one ratio.");
  }
  return values.map((value, index) => positive(value, `gearRatios[${index}]`));
}

function selectAutomaticGear(
  gearRatios: readonly number[],
  wheelRpm: number,
  finalDriveRatio: number,
  idleRpm: number,
  maxRpm: number,
  upshiftRpm: number,
  downshiftRpm: number
): { readonly gear: number; readonly ratio: number; readonly shiftState: "hold" | "upshift" | "downshift" } {
  if (wheelRpm <= 1) return { gear: 1, ratio: gearRatios[0] ?? 1, shiftState: "hold" };
  let gearIndex = 0;
  let rpm = wheelRpm * (gearRatios[gearIndex] ?? 1) * finalDriveRatio;
  while (gearIndex < gearRatios.length - 1 && rpm > upshiftRpm) {
    gearIndex += 1;
    rpm = wheelRpm * (gearRatios[gearIndex] ?? 1) * finalDriveRatio;
  }
  while (gearIndex > 0 && rpm < downshiftRpm) {
    gearIndex -= 1;
    rpm = wheelRpm * (gearRatios[gearIndex] ?? 1) * finalDriveRatio;
  }
  const clampedRpm = clamp(rpm, idleRpm, maxRpm);
  return {
    gear: gearIndex + 1,
    ratio: gearRatios[gearIndex] ?? 1,
    shiftState: clampedRpm >= upshiftRpm && gearIndex < gearRatios.length - 1 ? "upshift" : clampedRpm <= downshiftRpm && gearIndex > 0 ? "downshift" : "hold"
  };
}

function engineTorqueAt(engineRpm: number, peakTorque: number, peakTorqueRpm: number, idleRpm: number, maxRpm: number): number {
  if (engineRpm <= peakTorqueRpm) {
    const t = clamp((engineRpm - idleRpm) / Math.max(1, peakTorqueRpm - idleRpm), 0, 1);
    return peakTorque * (0.8 + 0.2 * t);
  }
  const t = clamp((engineRpm - peakTorqueRpm) / Math.max(1, maxRpm - peakTorqueRpm), 0, 1);
  return peakTorque * (1 - 0.4 * t);
}

function racingAiSettings(difficulty: RacingAiDifficulty): {
  readonly targetSpeedFactor: number;
  readonly steerSmoothing: number;
  readonly reactionTime: number;
  readonly aggressiveness: number;
  readonly rubberbandStrength: number;
} {
  switch (difficulty) {
    case "easy":
      return { targetSpeedFactor: 0.7, steerSmoothing: 0.3, reactionTime: 0.3, aggressiveness: 0.3, rubberbandStrength: 0.5 };
    case "hard":
      return { targetSpeedFactor: 0.95, steerSmoothing: 0.7, reactionTime: 0.05, aggressiveness: 0.9, rubberbandStrength: 0.1 };
    case "medium":
      return { targetSpeedFactor: 0.85, steerSmoothing: 0.5, reactionTime: 0.15, aggressiveness: 0.6, rubberbandStrength: 0.3 };
  }
}

function suspensionFor(steer: number, speedRatio: number, driftSlip: number): readonly [number, number, number, number] {
  const loadTransfer = steer * speedRatio * 0.18;
  const brakeDive = driftSlip * 0.08;
  return [
    clamp(Number((0.48 - loadTransfer + brakeDive).toFixed(5)), 0, 1),
    clamp(Number((0.48 + loadTransfer + brakeDive).toFixed(5)), 0, 1),
    clamp(Number((0.42 - loadTransfer * 0.55).toFixed(5)), 0, 1),
    clamp(Number((0.42 + loadTransfer * 0.55).toFixed(5)), 0, 1)
  ];
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`VehicleDynamics ${label} must be finite.`);
  }
  return value;
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`VehicleDynamics ${label} must be finite and non-negative.`);
  }
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`VehicleDynamics ${label} must be finite and positive.`);
  }
  return value;
}

function coefficients(value: PacejkaTireCoefficients | PacejkaTirePreset): { readonly preset: PacejkaTirePreset | "custom"; readonly value: PacejkaTireCoefficients } {
  if (typeof value !== "string") return { preset: "custom", value };
  switch (value) {
    case "street":
      return { preset: value, value: { b: 10, c: 1.9, d: 1, e: 0.97 } };
    case "sport":
      return { preset: value, value: { b: 12, c: 2, d: 1.3, e: 0.95 } };
    case "racing":
      return { preset: value, value: { b: 14, c: 2.1, d: 1.6, e: 0.9 } };
    case "offroad":
      return { preset: value, value: { b: 7, c: 1.7, d: 0.9, e: 1 } };
  }
}

function tireSlipRatio(longitudinalVelocity: number, angularVelocity: number, radius: number): number {
  const wheelVelocity = angularVelocity * radius;
  const denominator = Math.max(Math.abs(wheelVelocity), Math.abs(longitudinalVelocity));
  if (denominator < 0.1) return 0;
  return clamp((wheelVelocity - longitudinalVelocity) / denominator, -1, 1);
}

function tireSlipAngle(longitudinalVelocity: number, lateralVelocity: number, steeringAngle: number): number {
  if (Math.abs(longitudinalVelocity) < 0.1) return 0;
  return clamp(Math.atan2(lateralVelocity, longitudinalVelocity) - steeringAngle, -Math.PI * 0.4, Math.PI * 0.4);
}

function pacejka(slip: number, coeff: PacejkaTireCoefficients): number {
  const bx = coeff.b * slip;
  return coeff.d * Math.sin(coeff.c * Math.atan(bx - coeff.e * (bx - Math.atan(bx))));
}

function optimalSlipRatio(coeff: PacejkaTireCoefficients): number {
  return Math.min(Math.tan(Math.PI / (2 * coeff.c)) / coeff.b, 0.2);
}

function optimalSlipAngle(coeff: PacejkaTireCoefficients): number {
  return Math.min((Math.tan(Math.PI / (2 * coeff.c)) / coeff.b) * Math.PI / 180, 0.3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
