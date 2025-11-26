/**
 * Tire physics model using Pacejka Magic Formula.
 * Calculates longitudinal and lateral tire forces for realistic vehicle handling.
 *
 * @module Physics/TireModel
 */

import { Vector3 } from '../math/Vector3';

/**
 * Pacejka Magic Formula coefficients.
 * These define the tire's force characteristics.
 */
export interface PacejkaCoefficients {
  /** Shape factor (stiffness) */
  B: number;

  /** Shape factor (peak value) */
  C: number;

  /** Peak factor (maximum force) */
  D: number;

  /** Curvature factor */
  E: number;
}

/**
 * Tire force output in local tire coordinates.
 */
export interface TireForces {
  /** Longitudinal force (along rolling direction) */
  longitudinal: number;

  /** Lateral force (perpendicular to rolling direction) */
  lateral: number;

  /** Combined force magnitude */
  combined: number;

  /** Slip angle in radians */
  slipAngle: number;

  /** Slip ratio (0-1) */
  slipRatio: number;
}

/**
 * Tire preset configurations for different tire types.
 */
export class TirePresets {
  /**
   * Street tire - comfortable, moderate grip.
   * Good for daily driving and mild performance.
   */
  static street(): PacejkaCoefficients {
    return {
      B: 10.0,
      C: 1.9,
      D: 1.0,
      E: 0.97
    };
  }

  /**
   * Sport tire - high grip, responsive.
   * Optimized for spirited street driving and track days.
   */
  static sport(): PacejkaCoefficients {
    return {
      B: 12.0,
      C: 2.0,
      D: 1.3,
      E: 0.95
    };
  }

  /**
   * Racing slick - maximum grip, stiff.
   * Designed for dry track conditions with optimal temperature.
   */
  static racing(): PacejkaCoefficients {
    return {
      B: 14.0,
      C: 2.1,
      D: 1.6,
      E: 0.90
    };
  }

  /**
   * Off-road tire - soft, forgiving.
   * Better performance on loose surfaces like dirt and gravel.
   */
  static offroad(): PacejkaCoefficients {
    return {
      B: 7.0,
      C: 1.7,
      D: 0.9,
      E: 1.0
    };
  }
}

/**
 * Tire physics model using Pacejka Magic Formula.
 *
 * The Magic Formula is an empirical model that accurately represents
 * tire force characteristics across the full range of slip conditions.
 *
 * Formula: F = D * sin(C * atan(B * x - E * (B * x - atan(B * x))))
 *
 * Where:
 * - B: Stiffness factor
 * - C: Shape factor
 * - D: Peak value
 * - E: Curvature factor
 * - x: Slip ratio or slip angle
 *
 * @example
 * ```typescript
 * // Create racing tire model
 * const tire = new TireModel({
 *   longitudinal: TirePresets.racing(),
 *   lateral: TirePresets.racing(),
 *   maxLoad: 5000,
 *   radius: 0.33
 * });
 *
 * // Calculate forces
 * const wheelVelocity = new Vector3(20, 0, 0);
 * const wheelAngularVelocity = 60.0;
 * const normalForce = 4500;
 * const steeringAngle = 0.1;
 *
 * const forces = tire.calculateForces(
 *   wheelVelocity,
 *   wheelAngularVelocity,
 *   normalForce,
 *   steeringAngle
 * );
 *
 * console.log(`Lateral force: ${forces.lateral} N`);
 * console.log(`Longitudinal force: ${forces.longitudinal} N`);
 * ```
 */
export class TireModel {
  /**
   * Longitudinal (driving/braking) force coefficients.
   */
  longitudinal: PacejkaCoefficients;

  /**
   * Lateral (cornering) force coefficients.
   */
  lateral: PacejkaCoefficients;

  /**
   * Maximum tire load capacity in Newtons.
   */
  maxLoad: number;

  /**
   * Tire radius in meters.
   */
  radius: number;

  /**
   * Tire width in meters.
   */
  width: number;

  /**
   * Load sensitivity factor (affects grip vs load).
   */
  loadSensitivity: number;

  /**
   * Camber sensitivity (degrees of camber affect).
   */
  camberSensitivity: number;

  /**
   * Rolling resistance coefficient.
   */
  rollingResistance: number;

  /**
   * Creates a new tire model.
   *
   * @param options - Tire configuration
   */
  constructor(options: {
    longitudinal?: PacejkaCoefficients;
    lateral?: PacejkaCoefficients;
    maxLoad?: number;
    radius?: number;
    width?: number;
    loadSensitivity?: number;
    camberSensitivity?: number;
    rollingResistance?: number;
  } = {}) {
    this.longitudinal = options.longitudinal ?? TirePresets.street();
    this.lateral = options.lateral ?? TirePresets.street();
    this.maxLoad = options.maxLoad ?? 5000.0;
    this.radius = options.radius ?? 0.33;
    this.width = options.width ?? 0.225;
    this.loadSensitivity = options.loadSensitivity ?? 1.0;
    this.camberSensitivity = options.camberSensitivity ?? 0.1;
    this.rollingResistance = options.rollingResistance ?? 0.015;
  }

  /**
   * Calculates tire forces based on current wheel state.
   *
   * @param wheelVelocity - Wheel velocity in local tire space (forward = X)
   * @param wheelAngularVelocity - Wheel angular velocity in rad/s
   * @param normalForce - Normal force pressing tire to ground (N)
   * @param steeringAngle - Steering angle in radians
   * @param camberAngle - Camber angle in radians (default: 0)
   * @returns Calculated tire forces
   */
  calculateForces(
    wheelVelocity: Vector3,
    wheelAngularVelocity: number,
    normalForce: number,
    steeringAngle: number,
    camberAngle: number = 0
  ): TireForces {
    if (normalForce <= 0) {
      return {
        longitudinal: 0,
        lateral: 0,
        combined: 0,
        slipAngle: 0,
        slipRatio: 0
      };
    }

    const loadFactor = this.calculateLoadFactor(normalForce);

    const slipRatio = this.calculateSlipRatio(wheelVelocity.x, wheelAngularVelocity);
    const slipAngle = this.calculateSlipAngle(wheelVelocity, steeringAngle);

    const longitudinalForce = this.calculateLongitudinalForce(
      slipRatio,
      normalForce,
      loadFactor,
      camberAngle
    );

    const lateralForce = this.calculateLateralForce(
      slipAngle,
      normalForce,
      loadFactor,
      camberAngle
    );

    const combinedForces = this.combinedSlip(
      longitudinalForce,
      lateralForce,
      slipRatio,
      slipAngle
    );

    return {
      longitudinal: combinedForces.longitudinal,
      lateral: combinedForces.lateral,
      combined: Math.sqrt(
        combinedForces.longitudinal * combinedForces.longitudinal +
        combinedForces.lateral * combinedForces.lateral
      ),
      slipAngle: slipAngle,
      slipRatio: slipRatio
    };
  }

  /**
   * Calculates slip ratio from wheel velocity and angular velocity.
   *
   * Slip ratio = (V_wheel - V_ground) / max(V_wheel, V_ground)
   *
   * @param longitudinalVelocity - Forward velocity (m/s)
   * @param angularVelocity - Wheel rotation speed (rad/s)
   * @returns Slip ratio (-1 to 1)
   */
  private calculateSlipRatio(longitudinalVelocity: number, angularVelocity: number): number {
    const wheelCircumferentialVelocity = angularVelocity * this.radius;
    const groundVelocity = longitudinalVelocity;

    const velocityThreshold = 0.1;
    if (Math.abs(groundVelocity) < velocityThreshold && Math.abs(wheelCircumferentialVelocity) < velocityThreshold) {
      return 0;
    }

    const denominator = Math.max(Math.abs(wheelCircumferentialVelocity), Math.abs(groundVelocity));
    if (denominator < 0.01) {
      return 0;
    }

    const slipRatio = (wheelCircumferentialVelocity - groundVelocity) / denominator;
    return this.clamp(slipRatio, -1.0, 1.0);
  }

  /**
   * Calculates slip angle from wheel velocity and steering.
   *
   * Slip angle is the angle between the tire's heading and its actual velocity.
   *
   * @param wheelVelocity - Velocity in wheel local space
   * @param steeringAngle - Steering angle in radians
   * @returns Slip angle in radians
   */
  private calculateSlipAngle(wheelVelocity: Vector3, steeringAngle: number): number {
    const vx = wheelVelocity.x;
    const vz = wheelVelocity.z;

    if (Math.abs(vx) < 0.1) {
      return 0;
    }

    const velocityAngle = Math.atan2(vz, vx);
    const slipAngle = velocityAngle - steeringAngle;

    const maxSlipAngle = Math.PI * 0.4;
    return this.clamp(slipAngle, -maxSlipAngle, maxSlipAngle);
  }

  /**
   * Calculates load factor affecting tire grip.
   *
   * @param normalForce - Normal force in Newtons
   * @returns Load factor (normalized)
   */
  private calculateLoadFactor(normalForce: number): number {
    const normalizedLoad = normalForce / this.maxLoad;
    const loadFactor = Math.pow(normalizedLoad, this.loadSensitivity);
    return Math.max(0.1, Math.min(1.5, loadFactor));
  }

  /**
   * Calculates longitudinal force using Pacejka formula.
   *
   * @param slipRatio - Slip ratio
   * @param normalForce - Normal force
   * @param loadFactor - Load factor
   * @param camberAngle - Camber angle
   * @returns Longitudinal force in Newtons
   */
  private calculateLongitudinalForce(
    slipRatio: number,
    normalForce: number,
    loadFactor: number,
    camberAngle: number
  ): number {
    const coeff = this.longitudinal;
    const force = this.pacejkaFormula(slipRatio, coeff.B, coeff.C, coeff.D, coeff.E);

    const camberEffect = 1.0 - Math.abs(camberAngle) * this.camberSensitivity;
    const scaledForce = force * normalForce * loadFactor * camberEffect;

    if (Math.abs(slipRatio) < 0.01) {
      const rollingResistanceForce = -Math.sign(slipRatio) * normalForce * this.rollingResistance;
      return scaledForce + rollingResistanceForce;
    }

    return scaledForce;
  }

  /**
   * Calculates lateral force using Pacejka formula.
   *
   * @param slipAngle - Slip angle in radians
   * @param normalForce - Normal force
   * @param loadFactor - Load factor
   * @param camberAngle - Camber angle
   * @returns Lateral force in Newtons
   */
  private calculateLateralForce(
    slipAngle: number,
    normalForce: number,
    loadFactor: number,
    camberAngle: number
  ): number {
    const coeff = this.lateral;

    const slipAngleDeg = slipAngle * (180.0 / Math.PI);

    const force = this.pacejkaFormula(slipAngleDeg, coeff.B, coeff.C, coeff.D, coeff.E);

    const camberEffect = 1.0 + camberAngle * this.camberSensitivity;
    const scaledForce = force * normalForce * loadFactor * camberEffect;

    return scaledForce;
  }

  /**
   * Pacejka Magic Formula.
   *
   * F = D * sin(C * atan(B * x - E * (B * x - atan(B * x))))
   *
   * @param x - Input (slip ratio or slip angle)
   * @param B - Stiffness factor
   * @param C - Shape factor
   * @param D - Peak value
   * @param E - Curvature factor
   * @returns Normalized force (-1 to 1)
   */
  private pacejkaFormula(x: number, B: number, C: number, D: number, E: number): number {
    const Bx = B * x;
    const atanBx = Math.atan(Bx);
    const inner = Bx - E * (Bx - atanBx);
    const force = D * Math.sin(C * Math.atan(inner));

    return force;
  }

  /**
   * Combines longitudinal and lateral forces under combined slip.
   *
   * Uses ellipse-based combined slip model to handle simultaneous
   * braking/acceleration and cornering.
   *
   * @param longitudinalForce - Pure longitudinal force
   * @param lateralForce - Pure lateral force
   * @param slipRatio - Slip ratio
   * @param slipAngle - Slip angle
   * @returns Combined forces
   */
  private combinedSlip(
    longitudinalForce: number,
    lateralForce: number,
    slipRatio: number,
    slipAngle: number
  ): { longitudinal: number; lateral: number } {
    const slipRatioNorm = Math.abs(slipRatio);
    const slipAngleNorm = Math.abs(slipAngle);

    const totalSlip = Math.sqrt(slipRatioNorm * slipRatioNorm + slipAngleNorm * slipAngleNorm);

    if (totalSlip < 0.001) {
      return {
        longitudinal: longitudinalForce,
        lateral: lateralForce
      };
    }

    const maxForce = Math.sqrt(
      longitudinalForce * longitudinalForce + lateralForce * lateralForce
    );

    const alpha = slipRatioNorm / totalSlip;
    const beta = slipAngleNorm / totalSlip;

    const combinationFactor = 0.9;

    const longitudinalScale = Math.sqrt(1.0 - Math.pow(beta * combinationFactor, 2));
    const lateralScale = Math.sqrt(1.0 - Math.pow(alpha * combinationFactor, 2));

    return {
      longitudinal: longitudinalForce * longitudinalScale,
      lateral: lateralForce * lateralScale
    };
  }

  /**
   * Calculates aligning torque (self-centering moment).
   *
   * @param slipAngle - Slip angle in radians
   * @param normalForce - Normal force
   * @returns Aligning torque in Nm
   */
  calculateAligningTorque(slipAngle: number, normalForce: number): number {
    const slipAngleDeg = slipAngle * (180.0 / Math.PI);

    const pneumaticTrail = this.width * 0.5;

    const torqueCoeff = -pneumaticTrail * (1.0 - Math.abs(slipAngleDeg) / 20.0);

    const lateralForce = this.calculateLateralForce(slipAngle, normalForce, 1.0, 0);

    const torque = lateralForce * torqueCoeff;

    return this.clamp(torque, -normalForce * this.width, normalForce * this.width);
  }

  /**
   * Gets the maximum longitudinal force for a given normal load.
   *
   * @param normalForce - Normal force in Newtons
   * @returns Maximum force in Newtons
   */
  getMaxLongitudinalForce(normalForce: number): number {
    const loadFactor = this.calculateLoadFactor(normalForce);
    return this.longitudinal.D * normalForce * loadFactor;
  }

  /**
   * Gets the maximum lateral force for a given normal load.
   *
   * @param normalForce - Normal force in Newtons
   * @returns Maximum force in Newtons
   */
  getMaxLateralForce(normalForce: number): number {
    const loadFactor = this.calculateLoadFactor(normalForce);
    return this.lateral.D * normalForce * loadFactor;
  }

  /**
   * Gets the optimal slip ratio for maximum longitudinal force.
   *
   * @returns Optimal slip ratio
   */
  getOptimalSlipRatio(): number {
    const B = this.longitudinal.B;
    const C = this.longitudinal.C;
    const E = this.longitudinal.E;

    const optimalSlip = Math.tan(Math.PI / (2 * C)) / B;
    return Math.min(optimalSlip, 0.2);
  }

  /**
   * Gets the optimal slip angle for maximum lateral force.
   *
   * @returns Optimal slip angle in radians
   */
  getOptimalSlipAngle(): number {
    const B = this.lateral.B;
    const C = this.lateral.C;

    const optimalAngleDeg = Math.tan(Math.PI / (2 * C)) / B;
    const optimalAngleRad = optimalAngleDeg * (Math.PI / 180.0);

    return Math.min(optimalAngleRad, 0.3);
  }

  /**
   * Clamps a value between min and max.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Creates a copy of this tire model.
   *
   * @returns New tire model with same parameters
   */
  clone(): TireModel {
    return new TireModel({
      longitudinal: { ...this.longitudinal },
      lateral: { ...this.lateral },
      maxLoad: this.maxLoad,
      radius: this.radius,
      width: this.width,
      loadSensitivity: this.loadSensitivity,
      camberSensitivity: this.camberSensitivity,
      rollingResistance: this.rollingResistance
    });
  }
}
