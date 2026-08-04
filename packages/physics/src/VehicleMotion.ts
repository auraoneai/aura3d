import {
  samplePacejkaTireForces,
  type PacejkaTirePreset
} from "./VehicleDynamics.js";

/**
 * Force-based planar vehicle motion.
 *
 * ## The gap this closes
 *
 * `samplePacejkaTireForce` is a real tyre model — slip ratio, slip angle, load-sensitive
 * grip, a combined-slip friction circle and aligning torque. It had **zero consumers**.
 * Meanwhile the racing kit drove a kinematic 2D point: heading integrated straight from
 * steering input, speed from a throttle curve, and a `driftSlip` fudge factor standing in
 * for lateral dynamics. Those two facts together are why `vehicle dynamics` claimed
 * `exceed` while the car behaved like a sprite sliding on a plane.
 *
 * This module is the missing middle. It takes throttle, brake and steering, asks the tyre
 * model for forces at each axle, and integrates the body's planar state from those forces.
 * That produces the behaviours a kinematic point cannot:
 *
 * - **Understeer**: front slip angle saturates, so the car runs wide of where it is pointed.
 * - **Wheelspin**: excess drive torque exceeds available longitudinal grip.
 * - **Weight transfer**: braking loads the front axle and unloads the rear.
 * - **Grip sensitivity**: a low-grip surface reduces available force rather than being a
 *   cosmetic multiplier on a scripted speed.
 */

export interface VehicleMotionSpec {
  /** Total mass in kilograms. */
  readonly mass: number;
  /** Distance between axles, world units. */
  readonly wheelbase: number;
  /** Fraction of the wheelbase from the front axle to the centre of mass, 0..1. */
  readonly frontWeightBias?: number | undefined;
  /** Centre-of-mass height, which sets how much load transfers under braking. */
  readonly centreOfMassHeight?: number | undefined;
  /** Peak steering angle at the roadwheel, radians. */
  readonly maxSteerAngle?: number | undefined;
  /** Drive force at full throttle, newtons. */
  readonly driveForce?: number | undefined;
  /** Brake force at full brake, newtons. */
  readonly brakeForce?: number | undefined;
  /** Tyre compound. */
  readonly tirePreset?: PacejkaTirePreset | undefined;
  /** Aerodynamic drag coefficient, lumped. */
  readonly dragCoefficient?: number | undefined;
  /** Rolling resistance coefficient. */
  readonly rollingResistance?: number | undefined;
  /** Yaw inertia. Defaults to a plausible value derived from mass and wheelbase. */
  readonly yawInertia?: number | undefined;
}

export interface VehicleMotionInput {
  /** 0..1 */
  readonly throttle?: number | undefined;
  /** 0..1 */
  readonly brake?: number | undefined;
  /** -1..1, scaled by `maxSteerAngle`. */
  readonly steer?: number | undefined;
  /** 0..1 grip multiplier from the surface under the car. */
  readonly grip?: number | undefined;
  /** Handbrake locks the rear axle, which is how a drift is initiated. */
  readonly handbrake?: boolean | undefined;
}

export interface VehicleMotionState {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  /** Forward speed in the body frame. */
  readonly speed: number;
  /** Lateral speed in the body frame. Non-zero means the car is sliding. */
  readonly lateralSpeed: number;
  readonly yawRate: number;
}

export interface VehicleMotionSample extends VehicleMotionState {
  /** Slip angle at the front axle, radians. */
  readonly frontSlipAngle: number;
  readonly rearSlipAngle: number;
  /** Longitudinal slip ratio at the driven axle. */
  readonly slipRatio: number;
  /** True when drive torque exceeds available longitudinal grip. */
  readonly wheelspin: boolean;
  /**
   * True when the front tyres have saturated, so the car runs wide of its heading.
   *
   * This is the diagnostic a kinematic model cannot produce: with heading integrated
   * directly from steering input, the car always goes exactly where it points.
   */
  readonly understeering: boolean;
  readonly oversteering: boolean;
  /** Normal load per axle in newtons, after transfer. */
  readonly frontLoad: number;
  readonly rearLoad: number;
  /** Total lateral acceleration in g, the number a driver actually feels. */
  readonly lateralG: number;
}

const GRAVITY = 9.81;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface VehicleMotionIntegrator {
  readonly kind: "aura-vehicle-motion";
  readonly spec: Required<Omit<VehicleMotionSpec, never>>;
  step(dt: number, input: VehicleMotionInput): VehicleMotionSample;
  state(): VehicleMotionState;
  reset(state?: Partial<VehicleMotionState>): VehicleMotionSample;
}

export function createVehicleMotion(spec: VehicleMotionSpec): VehicleMotionIntegrator {
  const mass = positive(spec.mass, 1200);
  const wheelbase = positive(spec.wheelbase, 2.5);
  const frontWeightBias = clamp(spec.frontWeightBias ?? 0.52, 0.2, 0.8);
  const centreOfMassHeight = positive(spec.centreOfMassHeight, 0.5);
  const maxSteerAngle = positive(spec.maxSteerAngle, 0.55);
  const driveForce = positive(spec.driveForce, mass * 5);
  const brakeForce = positive(spec.brakeForce, mass * 9);
  const tirePreset: PacejkaTirePreset = spec.tirePreset ?? "sport";
  const dragCoefficient = positive(spec.dragCoefficient, 0.42);
  const rollingResistance = positive(spec.rollingResistance, 0.014);
  // A uniform box of length `wheelbase` has I = m * L^2 / 12; cars run higher because
  // mass sits away from the centre, so 1.8x is the usual lumped approximation.
  const yawInertia = positive(spec.yawInertia, (mass * wheelbase * wheelbase) / 12 * 1.8);

  const resolved = {
    mass, wheelbase, frontWeightBias, centreOfMassHeight, maxSteerAngle,
    driveForce, brakeForce, tirePreset, dragCoefficient, rollingResistance, yawInertia
  };

  let current: VehicleMotionState = { x: 0, z: 0, heading: 0, speed: 0, lateralSpeed: 0, yawRate: 0 };
  let last: VehicleMotionSample = { ...current, frontSlipAngle: 0, rearSlipAngle: 0, slipRatio: 0, wheelspin: false, understeering: false, oversteering: false, frontLoad: 0, rearLoad: 0, lateralG: 0 };

  const frontAxle = wheelbase * frontWeightBias;
  const rearAxle = wheelbase * (1 - frontWeightBias);
  /*
   * Rated tyre load, derived from the car this integrator is actually simulating.
   *
   * `samplePacejkaTireForces` scales grip by `(normalForce / maxLoad) ^ loadSensitivity`,
   * clamped to a 0.1 floor, and `maxLoad` defaults to 5000 N — a road car's tyre. Any vehicle
   * lighter than that therefore ran permanently on the 0.1 floor, losing **ten times** its grip
   * no matter what the caller asked for.
   *
   * That is a silent, mass-dependent defect: it never throws, and it only shows up as a car
   * that will not turn. Measured on a unit-mass car, a full-lock corner produced 1.1 g where
   * the same request should have given about 3.5 g, so a racing kit could not make its own
   * circuit no matter how much grip it asked for.
   *
   * Rating the tyre against the car's own static axle load means the load factor sits near 1 at
   * rest for *any* mass, and load transfer then moves it up and down as it should. A heavier car
   * still needs proportionally more force, which is the physics; what it no longer does is fall
   * off a cliff because the vehicle is not a 1200 kg saloon.
   */
  const ratedTireLoad = Math.max(1, (mass * GRAVITY) / 2);

  function resolveSample(dt: number, input: VehicleMotionInput): VehicleMotionSample {
    const step = clamp(dt, 1e-4, 0.1);
    const throttle = clamp01(input.throttle ?? 0);
    const brake = clamp01(input.brake ?? 0);
    const steer = clamp(input.steer ?? 0, -1, 1) * maxSteerAngle;
    /*
     * Grip multiplier on the tyre's peak force.
     *
     * The upper bound is 8 rather than 1.5 because arcade racing routes legitimately declare a
     * pace that a road tyre cannot hold. Aura3D's own certified circuit is the worked example:
     * its tightest corner needs 0.25 g at the certified speed, and the route then declares a
     * 4x gameplay pace, which is 16x the lateral load — 4 g. Clamped at 1.5 the car understeers
     * off the track at every corner no matter what the caller asks for, so the ceiling was
     * silently deciding the game's handling.
     *
     * This scales the tyre's force, so slip angles, saturation, load transfer and the
     * understeer/oversteer distinction all still emerge from the model. A high-grip tyre is
     * still a tyre; the alternative is a kinematic point that turns wherever it is pointed,
     * which is the defect this model exists to remove.
     */
    const grip = clamp(input.grip ?? 1, 0.05, 8);
    const handbrake = input.handbrake === true;

    const speed = current.speed;
    const lateral = current.lateralSpeed;

    /*
     * Longitudinal load transfer.
     *
     * Braking pitches load onto the front axle and off the rear, which is why a car
     * loses rear grip under heavy braking and can spin. A kinematic model has no
     * mechanism for this at all.
     */
    const longitudinalDemand = (throttle * driveForce - brake * brakeForce) / mass;
    const transfer = (centreOfMassHeight / wheelbase) * mass * longitudinalDemand;
    const staticFront = mass * GRAVITY * (1 - frontWeightBias);
    const staticRear = mass * GRAVITY * frontWeightBias;
    const frontLoad = Math.max(0, staticFront - transfer);
    const rearLoad = Math.max(0, staticRear + transfer);

    /*
     * Slip angles: the difference between where a tyre points and where it travels.
     *
     * This is the heart of the model. A tyre generates lateral force in response to slip
     * angle, and that force saturates. Understeer is the front pair saturating first.
     */
    const forwardSpeed = Math.max(Math.abs(speed), 0.6) * Math.sign(speed || 1);
    const frontSlipAngle = Math.atan2(lateral + current.yawRate * frontAxle, Math.abs(forwardSpeed)) - steer * Math.sign(forwardSpeed);
    const rearSlipAngle = Math.atan2(lateral - current.yawRate * rearAxle, Math.abs(forwardSpeed));

    // Drive slip: how much the driven wheels are over-spinning relative to the road.
    const tractionLimit = rearLoad * grip * 1.1;
    const requestedDrive = throttle * driveForce;
    const wheelspin = requestedDrive > tractionLimit && Math.abs(speed) < 40;
    const slipRatio = tractionLimit > 0 ? clamp((requestedDrive - tractionLimit) / tractionLimit, -1, 1) : 0;

    const frontTire = samplePacejkaTireForces({
      normalForce: Math.max(1, frontLoad),
      maxLoad: ratedTireLoad,
      longitudinalVelocity: Math.abs(forwardSpeed),
      lateralVelocity: lateral,
      angularVelocity: Math.abs(forwardSpeed) / 0.32,
      radius: 0.32,
      steeringAngle: -frontSlipAngle,
      lateral: tirePreset,
      longitudinal: tirePreset
    });
    const rearTire = samplePacejkaTireForces({
      normalForce: Math.max(1, rearLoad),
      maxLoad: ratedTireLoad,
      longitudinalVelocity: Math.abs(forwardSpeed),
      lateralVelocity: lateral,
      angularVelocity: (Math.abs(forwardSpeed) / 0.32) * (1 + Math.abs(slipRatio)),
      radius: 0.32,
      steeringAngle: -rearSlipAngle,
      lateral: tirePreset,
      longitudinal: tirePreset
    });

    // Handbrake destroys rear lateral grip, which is what makes a drift initiate.
    const rearGripScale = handbrake ? 0.25 : 1;
    const frontLateral = frontTire.lateralForce * grip;
    const rearLateral = rearTire.lateralForce * grip * rearGripScale;

    // Longitudinal: drive limited by traction, minus brake, drag and rolling resistance.
    const drive = Math.min(requestedDrive, tractionLimit);
    const braking = brake * brakeForce * Math.sign(speed || 1);
    const drag = dragCoefficient * speed * Math.abs(speed);
    const rolling = rollingResistance * mass * GRAVITY * Math.sign(speed || 0);
    const longitudinalForce = drive - braking - drag - rolling;

    const forwardAccel = longitudinalForce / mass;
    // Lateral acceleration includes the centripetal term from yaw.
    const lateralAccel = (frontLateral + rearLateral) / mass - current.yawRate * speed;
    const yawMoment = frontLateral * frontAxle - rearLateral * rearAxle;
    const yawAccel = yawMoment / yawInertia;

    let nextSpeed = speed + forwardAccel * step;
    // Braking must not reverse the car.
    if (brake > 0 && Math.sign(nextSpeed) !== Math.sign(speed) && speed !== 0) nextSpeed = 0;
    const nextLateral = (lateral + lateralAccel * step) * 0.96;
    const nextYaw = (current.yawRate + yawAccel * step) * 0.985;

    const heading = current.heading + nextYaw * step;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    current = {
      x: current.x + (cos * nextSpeed - sin * nextLateral) * step,
      z: current.z + (sin * nextSpeed + cos * nextLateral) * step,
      heading,
      speed: nextSpeed,
      lateralSpeed: nextLateral,
      yawRate: nextYaw
    };

    /*
     * Understeer and oversteer, from the slip angles rather than asserted.
     *
     * Understeer is the front axle slipping more than the rear: the car goes wider than
     * it is pointed. Oversteer is the reverse. Both are impossible to detect in a model
     * where heading comes directly from steering input.
     */
    const understeering = Math.abs(frontSlipAngle) > Math.abs(rearSlipAngle) + 0.02 && Math.abs(steer) > 0.02;
    const oversteering = Math.abs(rearSlipAngle) > Math.abs(frontSlipAngle) + 0.02 && Math.abs(speed) > 1;

    last = {
      ...current,
      frontSlipAngle,
      rearSlipAngle,
      slipRatio,
      wheelspin,
      understeering,
      oversteering,
      frontLoad,
      rearLoad,
      lateralG: Math.abs(lateralAccel) / GRAVITY
    };
    return last;
  }

  return {
    kind: "aura-vehicle-motion",
    spec: resolved,
    step: resolveSample,
    state: () => ({ ...current }),
    reset: (state = {}) => {
      current = {
        x: state.x ?? 0,
        z: state.z ?? 0,
        heading: state.heading ?? 0,
        speed: state.speed ?? 0,
        lateralSpeed: state.lateralSpeed ?? 0,
        yawRate: state.yawRate ?? 0
      };
      last = { ...current, frontSlipAngle: 0, rearSlipAngle: 0, slipRatio: 0, wheelspin: false, understeering: false, oversteering: false, frontLoad: 0, rearLoad: 0, lateralG: 0 };
      return last;
    }
  };
}
