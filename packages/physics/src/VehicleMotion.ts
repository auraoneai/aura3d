import {
  samplePacejkaTireForces,
  tirePeakCorneringStiffness,
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
  /**
   * Gravitational acceleration expressed in the same length unit as `wheelbase` and the
   * positions this integrator reports, per second squared. Defaults to `9.81`.
   *
   * This exists because gravity is the only place a force model silently assumes a length
   * unit. Every corner speed this model can hold is bounded by `sqrt(mu * gravity * radius)`,
   * so hardcoding 9.81 does not mean "SI" — it means "one world unit is one metre", and it
   * makes the integrator unusable for any route authored at another scale. A circuit authored
   * in game units where one unit is 0.352 scene units has an effective gravity of
   * `9.81 / 0.352`, and with 9.81 assumed instead the same geometry demands roughly 2.8x the
   * lateral grip that physically exists. The car then understeers off the outside of every
   * corner, which reads as "the physics is broken" when the real fault is that the caller was
   * never given a way to state its units.
   *
   * Pass `sceneGravity / sceneUnitsPerWorldUnit` to run in authored units.
   */
  readonly gravity?: number | undefined;
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

const DEFAULT_GRAVITY = 9.81;
/*
 * Yaw velocity damping, in reciprocal seconds.
 *
 * Chosen to reproduce the previous behaviour's intent at its implicit 60 Hz timestep
 * (0.985 per 1/60 s => -ln(0.985) * 60), now expressed so the decay is a property of
 * elapsed simulated time rather than of call frequency.
 */
const YAW_DAMPING_RATE = -Math.log(0.985) * 60;

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
  /**
   * The current state, including the derived tyre and load diagnostics from the last step.
   *
   * This returns the full sample rather than the bare pose: a caller reading `state()` before
   * its first `step()` still needs `lateralG`, `frontLoad` and the slip angles to drive a HUD
   * or a camera, and narrowing the return type forced route code to either cast or duplicate
   * the derived maths locally.
   */
  state(): VehicleMotionSample;
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
  const GRAVITY = positive(spec.gravity, DEFAULT_GRAVITY);

  const resolved = {
    mass, wheelbase, frontWeightBias, centreOfMassHeight, maxSteerAngle,
    driveForce, brakeForce, tirePreset, dragCoefficient, rollingResistance, yawInertia,
    gravity: GRAVITY
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

  /*
   * Previous substep's longitudinal acceleration, used to resolve the implicit
   * load-transfer relationship above. Reset with the rest of the state.
   */
  let lastForwardAccel = 0;

  /*
   * Substepping, because a tyre is a stiff spring and explicit Euler is only conditionally
   * stable against one.
   *
   * A cornering tyre's lateral force responds steeply to slip angle. The stiffer that
   * response and the lighter the car, the shorter the timestep the integrator needs before
   * the yaw/slip feedback loop stops converging. At a 1/60 s frame this model demonstrably
   * crossed that threshold: holding a constant steering input, yaw came out at **-4.279
   * rad/s**, the opposite direction to the steer, while the same second of simulated time at
   * dt/2 or finer converged to **+0.5 rad/s**. See `vehicle-timestep-convergence.test.ts`.
   *
   * That is the mechanism behind the yaw-rate chatter in the traces, and it is why the model
   * previously needed a kinematic ceiling and a lateral decay factor to look plausible — both
   * of which were suppressing a numerical artefact rather than modelling a car.
   *
   * The cap is chosen from the physics rather than picked: the lateral relaxation time is
   * roughly `mass / (2 * corneringStiffness)`, and the yaw time constant scales with
   * `sqrt(yawInertia / (stiffness * wheelbase^2))`. Taking a fraction of the smaller keeps
   * the integration inside its stable region for any mass, wheelbase and tyre the caller
   * configures, instead of assuming a 1200 kg saloon at 60 Hz.
   */
  const peakLateralStiffness = tirePeakCorneringStiffness(tirePreset) * Math.max(1, mass * GRAVITY);
  const lateralTimeConstant = mass / Math.max(1e-6, 2 * peakLateralStiffness);
  const yawTimeConstant = Math.sqrt(yawInertia / Math.max(1e-6, peakLateralStiffness * wheelbase * wheelbase));
  /*
   * The factor on the smaller time constant is 1.0, measured rather than guessed. Sweeping it
   * against the convergence suite, results are identical to four decimals from 0.25 up to 4.0;
   * the first divergence appears at 8.0 (grip 8 yaw collapses 3.66 -> 1.11 rad/s) and grip 4
   * follows at 16.0. Sitting at 1.0 keeps a 4-8x margin below the observed stability boundary.
   *
   * That margin is not free, and the cost is why the number matters: an over-conservative 0.25
   * spent 252us per simulated frame on a single car, enough to blow a 16ms frame budget on its
   * own and enough to time out the suite. At 1.0 the same frame costs 67us for identical output.
   */
  const maxStableStep = clamp(Math.min(lateralTimeConstant, yawTimeConstant), 1e-4, 1 / 60);

  function resolveSample(dt: number, input: VehicleMotionInput): VehicleMotionSample {
    const frame = clamp(dt, 1e-4, 0.1);
    /*
     * Grip raises the tyre's peak force, so it shortens the stable step too. A route asking
     * for 4 g needs proportionally finer integration than one asking for 1 g.
     */
    const gripDemand = Math.sqrt(clamp(input.grip ?? 1, 0.05, 8));
    const substepCount = Math.max(1, Math.min(64, Math.ceil((frame / maxStableStep) * gripDemand)));
    for (let index = 0; index < substepCount; index += 1) {
      integrate(frame / substepCount, input);
    }
    return last;
  }

  function integrate(step: number, input: VehicleMotionInput): VehicleMotionSample {
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
    /*
     * Load transfer follows the acceleration the car is *actually* undergoing.
     *
     * This used throttle and brake demand: `(throttle * driveForce - brake * brakeForce) / mass`.
     * That is not what pitches a car. A car at its top speed with the throttle pinned is not
     * accelerating at all — drag and rolling resistance cancel the drive force — so it sits
     * level, yet the demand-based formula claimed full-throttle weight transfer forever.
     *
     * The consequence was severe and permanent. On the test car, holding full throttle at
     * terminal velocity reported a front axle load of **1.66 N against a rear load of 8.15 N**,
     * a 17.7 m/s^2 transfer that no longer existed. With almost no vertical load the front
     * tyre could not generate lateral force, so it ran at **0.62 rad (35 degrees) of slip** —
     * far past the peak of the Magic Formula curve — and the car understeered straight on at
     * any speed. That is the "car will not turn" symptom, and it got worse the faster you went,
     * because faster meant more throttle held for longer.
     *
     * Longitudinal force depends on the traction limit, which depends on rear load, which
     * depends on this transfer, so the relationship is implicit. Resolving it with the previous
     * substep's measured acceleration is both stable and physically honest: real load transfer
     * lags the tyre forces through the suspension anyway, and at substep resolution that lag is
     * well under a millisecond.
     */
    const transfer = (centreOfMassHeight / wheelbase) * mass * lastForwardAccel;
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
    /*
     * Lateral velocity *at each axle*, which is what sets that axle's slip angle. A yawing
     * car sweeps its front axle one way and its rear the other, which is why the two axles
     * slip differently and why understeer and oversteer are distinguishable at all.
     *
     * These are handed to the tyre model as velocities, not as angles. The model derives
     * slip itself; passing it a precomputed slip angle in its `steeringAngle` parameter
     * counted slip twice (proven in `vehicle-lateral-stability.test.ts`).
     */
    const frontAxleLateral = lateral + current.yawRate * frontAxle;
    const rearAxleLateral = lateral - current.yawRate * rearAxle;

    // Drive slip: how much the driven wheels are over-spinning relative to the road.
    const tractionLimit = rearLoad * grip * 1.1;
    const requestedDrive = throttle * driveForce;
    const wheelspin = requestedDrive > tractionLimit && Math.abs(speed) < 40;
    const slipRatio = tractionLimit > 0 ? clamp((requestedDrive - tractionLimit) / tractionLimit, -1, 1) : 0;

    const frontTire = samplePacejkaTireForces({
      normalForce: Math.max(1, frontLoad),
      maxLoad: ratedTireLoad,
      longitudinalVelocity: Math.abs(forwardSpeed),
      lateralVelocity: frontAxleLateral,
      angularVelocity: Math.abs(forwardSpeed) / 0.32,
      radius: 0.32,
      // The steered roadwheel angle. Only the front axle is steered.
      steeringAngle: steer * Math.sign(forwardSpeed),
      lateral: tirePreset,
      longitudinal: tirePreset
    });
    const rearTire = samplePacejkaTireForces({
      normalForce: Math.max(1, rearLoad),
      maxLoad: ratedTireLoad,
      longitudinalVelocity: Math.abs(forwardSpeed),
      lateralVelocity: rearAxleLateral,
      angularVelocity: (Math.abs(forwardSpeed) / 0.32) * (1 + Math.abs(slipRatio)),
      radius: 0.32,
      steeringAngle: 0,
      lateral: tirePreset,
      longitudinal: tirePreset
    });
    const frontSlipAngle = frontTire.slipAngle;
    const rearSlipAngle = rearTire.slipAngle;

    // Handbrake destroys rear lateral grip, which is what makes a drift initiate.
    const rearGripScale = handbrake ? 0.25 : 1;
    /*
     * A tyre resists its own slip. `samplePacejkaTireForces` reports force with the sign of
     * the slip that produced it, so the force acting on the body is the negation. Adding it
     * unnegated — which is what this integrator used to do — made the tyre drive the car
     * deeper into its slide, and lateral velocity then grew without bound.
     */
    const frontLateral = -frontTire.lateralForce * grip;
    const rearLateral = -rearTire.lateralForce * grip * rearGripScale;

    // Longitudinal: drive limited by traction, minus brake, drag and rolling resistance.
    const drive = Math.min(requestedDrive, tractionLimit);
    const braking = brake * brakeForce * Math.sign(speed || 1);
    const drag = dragCoefficient * speed * Math.abs(speed);
    const rolling = rollingResistance * mass * GRAVITY * Math.sign(speed || 0);
    /*
     * Braking, drag and rolling resistance are dissipative: they oppose motion, so they can
     * remove the car's momentum but must never become a source of it. Integrating them
     * unconditionally lets the resisting force overshoot through zero and accelerate the car
     * backwards. Under full brake on flat ground the car did not settle: it oscillated between
     * 0 and -0.15 m/s every other frame, creeping -0.26 m along x while visibly stopped. The
     * pre-existing `never reverses the car under braking` test missed this because it sampled
     * after an even number of frames, landing on the 0 half of the oscillation; the regression
     * test `stays at rest under continuous braking instead of jittering backwards` asserts
     * every frame and fails without this clamp.
     *
     * Clamping the resisting impulse to the momentum actually available this step fixes it at
     * the source, for any resisting force and any timestep, rather than special-casing brake.
     * `drive` is excluded because engine force is a genuine source and may legitimately pull
     * the car through zero into reverse.
     */
    const resisting = braking + drag + rolling;
    const maxResisting = Math.abs(speed) * mass / step;
    const clampedResisting = Math.sign(resisting) * Math.min(Math.abs(resisting), maxResisting + Math.abs(drive));
    const forwardAccel = (drive - clampedResisting) / mass;
    lastForwardAccel = forwardAccel;
    // Lateral acceleration includes the centripetal term from yaw.
    const lateralAccel = (frontLateral + rearLateral) / mass - current.yawRate * speed;
    const yawMoment = frontLateral * frontAxle - rearLateral * rearAxle;
    const yawAccel = yawMoment / yawInertia;

    let nextSpeed = speed + forwardAccel * step;
    /*
     * The resisting-impulse clamp above keeps dissipative forces from reversing the car, so the
     * previous `Math.sign(nextSpeed) !== Math.sign(speed)` guard is gone: it silently skipped
     * `speed === 0` (Math.sign(0) is 0, never unequal to itself under the old ordering) which is
     * exactly the state the car settles into under braking, and it also clobbered legitimate
     * throttle-into-reverse transitions.
     */
    /*
     * No artificial decay factor here. The previous 0.96-per-step bleed existed to hide the
     * sign defect above: the tyre pushed the slide outward and a blanket multiplier dragged
     * it back, and the two balanced at a permanent, physically meaningless sideways drift.
     * With the tyre restoring correctly, lateral damping is the tyre's job.
     */
    const nextLateral = lateral + lateralAccel * step;
    /*
     * Yaw is bounded by what the steered geometry can actually produce.
     *
     * `yawAccel` comes from the tyre moment, and with no ceiling it integrates without limit: a
     * high-grip tyre generates a large moment, which produces more yaw, which increases slip angle,
     * which generates more moment. Measured on a racing route asking for ~4 g of grip, the car reached
     * **-55 rad/z of yaw at 24.5 g lateral** — spinning on the spot rather than cornering, which made
     * the vehicle undrivable and looked like a wiring error in the consumer.
     *
     * The bicycle model gives the kinematic bound: a car travelling at `v` with roadwheel angle `delta`
     * and wheelbase `L` turns at `v * tan(delta) / L`. Real cars exceed it slightly in a slide, so the
     * cap allows 1.6x before clamping, which leaves oversteer expressible while keeping the result a
     * cornering vehicle rather than a spinning point.
     *
     * This is a bound, not a substitute: yaw still *comes from* tyre forces, so understeer, oversteer
     * and load transfer are unaffected below the limit.
     */
    const kinematicYaw = Math.abs(nextSpeed) * Math.abs(Math.tan(steer)) / Math.max(1e-6, wheelbase);
    const yawCeiling = Math.max(0.05, kinematicYaw * 1.6);
    /*
     * Yaw damping as a rate, not a per-call multiplier.
     *
     * This was `* 0.985` applied once per `step()`. A fixed per-call factor makes the
     * physics depend on how often it is called: under substepping it compounds
     * (0.985^64 = 0.38, so a frame would shed 62% of its yaw), and even without
     * substepping a 30 fps client and a 120 fps client got different handling from
     * identical input. Expressed as a time constant, the decay over a given span of
     * simulated time is the same at any timestep.
     */
    const unboundedYaw = (current.yawRate + yawAccel * step) * Math.exp(-YAW_DAMPING_RATE * step);
    const nextYaw = clamp(unboundedYaw, -yawCeiling, yawCeiling);

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
      /*
       * Lateral g is the acceleration the car actually undergoes, which is the tyre
       * force divided by mass.
       *
       * This previously reported `lateralAccel`, the rate of change of *body-frame
       * lateral velocity*. Those differ by the centripetal term, and in a steady
       * corner — exactly when a caller asks "how many g is it pulling?" — the
       * body-frame derivative is approximately **zero** by definition, because the
       * tyre force and the centripetal term are in balance. So a car holding a
       * perfectly good 1 g corner reported 0.004 g, and any consumer using this to
       * drive tyre squeal, camera shake or a grip readout saw nothing at the moment
       * there was most to show.
       */
      lateralG: Math.abs(frontLateral + rearLateral) / mass / GRAVITY
    };
    return last;
  }

  return {
    kind: "aura-vehicle-motion",
    spec: resolved,
    step: resolveSample,
    state: () => ({ ...last, ...current }),
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
