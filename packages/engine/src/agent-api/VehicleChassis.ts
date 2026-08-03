/**
 * Reusable vehicle chassis: contact, suspension, attitude and wheel visuals.
 *
 * ## The defects this addresses
 *
 * Turbo Drift Circuit drove a 2D kinematic point (`game.racing`) and then pinned
 * the car's rendered Y to a single literal, `TRACK_SURFACE_Y`. That has three
 * visible consequences:
 *
 * 1. **The car sinks into the tarmac.** A model grounded on a frozen plane cannot
 *    respond to the surface it is actually over. There is no contact model, so
 *    there is nothing to hold the tyres on the road.
 * 2. **No suspension.** The chassis never pitches under braking, never rolls in a
 *    corner, and the wheels never travel. A car that stays perfectly level at
 *    111 km/h reads as a sprite sliding on a plane, which is what it is.
 * 3. **Wheels do not turn or steer.** Nothing derived wheel spin from speed or
 *    wheel yaw from steering input.
 *
 * This module is the reusable answer. It takes a planar vehicle state -- position,
 * heading, speed, steering, lateral slip -- plus a surface query, and produces the
 * full 3D pose a renderer needs: chassis height from four independent contact
 * points, pitch and roll from load transfer, per-wheel suspension travel, wheel
 * spin and steer angles, and a contact report that states whether every tyre is
 * on the ground.
 *
 * It is pure: no renderer, no DOM, no asset loading. That makes vehicle behaviour
 * unit-testable, which is the only way "the car is grounded" becomes a fact rather
 * than an opinion about a screenshot.
 */

export type VehicleVec3 = readonly [number, number, number];

/** Surface sample under one contact point. */
export interface VehicleSurfaceSample {
  /** World Y of the surface at the queried point. */
  readonly height: number;
  /** Surface normal. Defaults to world up when a track is flat. */
  readonly normal?: VehicleVec3 | undefined;
  /** Grip multiplier, 1 on tarmac and lower off-track. */
  readonly grip?: number | undefined;
}

/**
 * Surface the vehicle drives on.
 *
 * A route supplies this from its own track topology. Because the chassis asks the
 * surface for a height at each wheel rather than being told one number, swapping
 * the track asset cannot leave the car buried: there is no frozen plane to be
 * wrong about.
 */
export interface VehicleSurface {
  sample(x: number, z: number): VehicleSurfaceSample;
}

/** Flat surface at a fixed height, for prototypes and tests. */
export function flatVehicleSurface(height = 0, grip = 1): VehicleSurface {
  return { sample: () => ({ height, normal: [0, 1, 0], grip }) };
}

export interface VehicleChassisSpec {
  /** Distance between front and rear axles, world units. */
  readonly wheelbase: number;
  /** Distance between left and right wheels, world units. */
  readonly trackWidth: number;
  /** Rolling radius of a wheel, world units. Drives visual spin rate. */
  readonly wheelRadius: number;
  /**
   * Ride height: distance from the wheel contact patch to the chassis origin at
   * rest. Derived from the asset's own bounds by the caller, never guessed.
   */
  readonly rideHeight: number;
  /** Suspension travel available above and below rest, world units. */
  readonly suspensionTravel?: number | undefined;
  /**
   * Spring stiffness as a normalized rate. Higher is firmer: the chassis resists
   * pitch and roll more and settles faster.
   */
  readonly springRate?: number | undefined;
  /** Damping ratio. 1 is critically damped; below 1 oscillates. */
  readonly dampingRatio?: number | undefined;
  /** Maximum steering angle at the front wheels, radians. */
  readonly maxSteerAngle?: number | undefined;
  /** Maximum chassis pitch under full braking or acceleration, radians. */
  readonly maxPitch?: number | undefined;
  /** Maximum chassis roll at full lateral load, radians. */
  readonly maxRoll?: number | undefined;
}

export interface VehiclePlanarState {
  /** World X of the chassis centre. */
  readonly x: number;
  /** World Z of the chassis centre. */
  readonly z: number;
  /** Heading in radians, measured so that heading 0 faces +X. */
  readonly heading: number;
  /** Forward speed in world units per second. */
  readonly speed: number;
  /** Steering input, -1..1. */
  readonly steer: number;
  /** Throttle input, 0..1. */
  readonly throttle?: number | undefined;
  /** Brake input, 0..1. */
  readonly brake?: number | undefined;
  /** Lateral slip, 0..1, used for roll and tyre scrub. */
  readonly slip?: number | undefined;
}

export type VehicleWheelId = "front-left" | "front-right" | "rear-left" | "rear-right";

export interface VehicleWheelPose {
  readonly id: VehicleWheelId;
  /** World position of the wheel centre. */
  readonly position: VehicleVec3;
  /** Steering angle applied to this wheel, radians. Zero for rear wheels. */
  readonly steerAngle: number;
  /** Accumulated rolling rotation, radians. */
  readonly spin: number;
  /** Suspension compression, 0 at full extension and 1 at full compression. */
  readonly compression: number;
  /** True when this wheel's contact patch is on the surface. */
  readonly grounded: boolean;
  /** Distance from the contact patch to the surface. Zero when grounded. */
  readonly contactGap: number;
}

export interface VehiclePose {
  /** Chassis origin in world space, at the height the suspension resolves to. */
  readonly position: VehicleVec3;
  /** Euler rotation: pitch on X, yaw on Y, roll on Z. */
  readonly rotation: VehicleVec3;
  readonly wheels: readonly VehicleWheelPose[];
  /** Height of the lowest contact patch above the surface. */
  readonly contactGap: number;
  /** True when every wheel is on the ground. */
  readonly grounded: boolean;
  /** Mean suspension compression across all four wheels. */
  readonly averageCompression: number;
}

export interface VehicleChassisTelemetry {
  readonly speed: number;
  readonly speedKph: number;
  readonly pitch: number;
  readonly roll: number;
  readonly steerAngle: number;
  readonly wheelSpinRate: number;
  readonly groundedWheels: number;
  readonly maxContactGap: number;
  readonly averageCompression: number;
  readonly surfaceGrip: number;
}

export interface VehicleChassis {
  readonly kind: "aura-vehicle-chassis";
  readonly spec: Required<Omit<VehicleChassisSpec, never>>;
  /** Advance suspension and wheel state, returning the resolved 3D pose. */
  step(dt: number, state: VehiclePlanarState): VehiclePose;
  /** Most recent pose without advancing. */
  pose(): VehiclePose;
  telemetry(): VehicleChassisTelemetry;
  /** Return to rest at a planar state, clearing suspension and spin history. */
  reset(state: VehiclePlanarState): VehiclePose;
}

const WHEEL_LAYOUT: readonly { readonly id: VehicleWheelId; readonly forward: number; readonly lateral: number; readonly steered: boolean }[] = [
  { id: "front-left", forward: 0.5, lateral: -0.5, steered: true },
  { id: "front-right", forward: 0.5, lateral: 0.5, steered: true },
  { id: "rear-left", forward: -0.5, lateral: -0.5, steered: false },
  { id: "rear-right", forward: -0.5, lateral: 0.5, steered: false }
];

/**
 * Create a vehicle chassis.
 *
 * `rideHeight` and `wheelRadius` should be derived from the vehicle asset's own
 * bounds. That is the difference between this and the constant it replaces: the
 * caller states a proportion of a measured asset, not a number that happened to
 * look right once.
 */
export function createVehicleChassis(spec: VehicleChassisSpec, surface: VehicleSurface): VehicleChassis {
  const resolved = {
    wheelbase: positive(spec.wheelbase, 1),
    trackWidth: positive(spec.trackWidth, 0.8),
    wheelRadius: positive(spec.wheelRadius, 0.15),
    rideHeight: positive(spec.rideHeight, 0.3),
    suspensionTravel: positive(spec.suspensionTravel ?? spec.rideHeight * 0.35, 0.05),
    springRate: positive(spec.springRate ?? 14, 1),
    dampingRatio: positive(spec.dampingRatio ?? 0.72, 0.05),
    maxSteerAngle: positive(spec.maxSteerAngle ?? 0.52, 0.05),
    /*
     * Attitude limits are capped by the suspension that has to produce them.
     *
     * Body pitch and roll are *consequences* of spring compression, not independent
     * rotations of a rigid body. Applying an attitude larger than the springs can
     * absorb rotates the chassis off its own wheels: at a 0.055 rad pitch over a
     * 0.66-unit wheelbase the front corners move 0.018 units, which exceeded the whole
     * 0.031-unit travel and lifted both front tyres into the air on a flat road. That
     * is the sinking defect's mirror image and just as wrong.
     *
     * The cap is the angle at which a corner's vertical displacement equals half the
     * available travel, leaving the other half for road surface.
     */
    maxPitch: Math.min(
      Math.max(0, spec.maxPitch ?? 0.055),
      attitudeLimitForTravel(spec.suspensionTravel ?? spec.rideHeight * 0.35, spec.wheelbase)
    ),
    maxRoll: Math.min(
      Math.max(0, spec.maxRoll ?? 0.085),
      attitudeLimitForTravel(spec.suspensionTravel ?? spec.rideHeight * 0.35, spec.trackWidth)
    )
  };

  // Per-wheel suspension state: current compression and its velocity.
  const compression = new Map<VehicleWheelId, { value: number; velocity: number }>();
  for (const wheel of WHEEL_LAYOUT) compression.set(wheel.id, { value: 0, velocity: 0 });
  let spin = 0;
  let pitch = 0;
  let roll = 0;
  let currentPose: VehiclePose | undefined;
  let telemetry: VehicleChassisTelemetry = {
    speed: 0, speedKph: 0, pitch: 0, roll: 0, steerAngle: 0,
    wheelSpinRate: 0, groundedWheels: 4, maxContactGap: 0, averageCompression: 0, surfaceGrip: 1
  };

  /** Wheel contact-patch position in world space for a planar state. */
  const wheelContactPoint = (state: VehiclePlanarState, wheel: typeof WHEEL_LAYOUT[number]): { readonly x: number; readonly z: number } => {
    const cos = Math.cos(state.heading);
    const sin = Math.sin(state.heading);
    const forward = wheel.forward * resolved.wheelbase;
    const lateral = wheel.lateral * resolved.trackWidth;
    return {
      // Heading 0 faces +X, so forward is (cos, sin) in XZ and lateral is its normal.
      x: state.x + cos * forward - sin * lateral,
      z: state.z + sin * forward + cos * lateral
    };
  };

  const resolvePose = (dt: number, state: VehiclePlanarState, settleImmediately: boolean): VehiclePose => {
    const step = Math.max(0, Math.min(0.1, dt));
    const throttle = clamp01(state.throttle ?? 0);
    const brake = clamp01(state.brake ?? 0);
    const slip = clamp01(state.slip ?? 0);
    const steerInput = clamp(state.steer ?? 0, -1, 1);

    /*
     * The wheels own the road; the springs own the body.
     *
     * Two earlier orderings were wrong in opposite directions, and both reproduce a
     * version of the reported defect:
     *
     * 1. Place each wheel on its own surface sample and average -- the contact gap
     *    becomes self-referential, so a car could drive over a cliff and still report
     *    itself grounded.
     * 2. Rotate the body to a target pitch/roll and hang wheels from it -- the rotation
     *    consumes more travel than exists (0.018 units of corner rise against 0.031
     *    units of travel), lifting the front tyres off a flat road.
     *
     * The physical arrangement is that a wheel rests on the surface beneath it, and the
     * spring above it sets how far the body's corner floats over that wheel. Load
     * transfer therefore *lowers a corner of the body* rather than raising a wheel, and
     * the body's pitch and roll are read back from the four corner heights. Wheels stay
     * on the ground by construction, and the attitude is always one the suspension can
     * actually support.
     */
    const longitudinalLoad = brake - throttle;
    const speedFactor = Math.min(1, Math.abs(state.speed) / 12);
    const lateralLoad = clamp(steerInput * speedFactor + steerInput * slip * 0.5, -1, 1);
    // Fraction of available travel that load transfer may consume, leaving headroom.
    const loadTravelShare = 0.5;

    const samples = WHEEL_LAYOUT.map((wheel) => {
      const point = wheelContactPoint(state, wheel);
      const sample = surface.sample(point.x, point.z);
      return { wheel, point, sample };
    });
    const meanGrip = samples.reduce((sum, entry) => sum + (entry.sample.grip ?? 1), 0) / samples.length;

    const cornerHeights: number[] = [];
    const wheels: VehicleWheelPose[] = samples.map(({ wheel, point, sample }) => {
      const spring = compression.get(wheel.id) ?? { value: 0.5, velocity: 0 };
      /*
       * Target compression from load transfer. A front wheel (`forward > 0`) compresses
       * under braking; an outside wheel compresses in a corner. 0.5 is rest.
       */
      const target = clamp01(0.5 + (
        wheel.forward * longitudinalLoad
        + wheel.lateral * lateralLoad
      ) * loadTravelShare);

      if (settleImmediately) {
        spring.value = target;
        spring.velocity = 0;
      } else {
        // Explicit spring-damper integration so the damping behaviour is visible.
        const acceleration = (target - spring.value) * resolved.springRate
          - spring.velocity * 2 * resolved.dampingRatio * Math.sqrt(resolved.springRate);
        spring.velocity += acceleration * step;
        spring.value = clamp01(spring.value + spring.velocity * step);
      }
      compression.set(wheel.id, spring);

      /*
       * The wheel rests on its own surface. This is unconditional: a tyre cannot be
       * inside the road, and on a driveable surface it should not be above it either.
       */
      const wheelCentreY = sample.height + resolved.wheelRadius;
      // The body's corner floats above that wheel by ride height, less compression.
      const cornerY = wheelCentreY - resolved.wheelRadius + resolved.rideHeight
        - (spring.value - 0.5) * resolved.suspensionTravel;
      cornerHeights.push(cornerY);
      return {
        id: wheel.id,
        position: [point.x, wheelCentreY, point.z] as VehicleVec3,
        steerAngle: wheel.steered ? steerInput * resolved.maxSteerAngle : 0,
        spin,
        compression: spring.value,
        // A wheel is grounded when its surface is reachable within suspension travel.
        // A hole deeper than the travel leaves the wheel hanging, which is correct.
        grounded: true,
        contactGap: 0
      };
    });

    /*
     * A wheel over a drop deeper than the suspension can reach is not grounded.
     *
     * Measured against the body: if a corner would have to sit further above its wheel
     * than ride height plus full travel, the wheel has run out of extension and hangs.
     */
    const bodyY = cornerHeights.reduce((sum, value) => sum + value, 0) / cornerHeights.length;
    const maxReach = resolved.rideHeight + resolved.suspensionTravel * 0.5;
    const resolvedWheels: VehicleWheelPose[] = wheels.map((wheel, index) => {
      const sample = samples[index]!.sample;
      const requiredDrop = bodyY - sample.height;
      if (requiredDrop <= maxReach) return wheel;
      // Out of travel: the wheel stays at its fullest extension below the body and
      // reports the gap to the surface it cannot reach.
      const hangingCentreY = bodyY - maxReach + resolved.wheelRadius;
      return {
        ...wheel,
        position: [wheel.position[0], hangingCentreY, wheel.position[2]] as VehicleVec3,
        compression: 0,
        grounded: false,
        contactGap: requiredDrop - maxReach
      };
    });

    /*
     * Read the body's attitude back from the four corner heights.
     *
     * Front corners lower than rear means the nose has dropped, which is pitch. Left
     * lower than right is roll. Derived rather than imposed, so the attitude can only
     * be one the springs produced.
     */
    const cornerBy = (id: VehicleWheelId) => {
      const index = WHEEL_LAYOUT.findIndex((wheel) => wheel.id === id);
      return cornerHeights[index] ?? bodyY;
    };
    const frontHeight = (cornerBy("front-left") + cornerBy("front-right")) / 2;
    const rearHeight = (cornerBy("rear-left") + cornerBy("rear-right")) / 2;
    const leftHeight = (cornerBy("front-left") + cornerBy("rear-left")) / 2;
    const rightHeight = (cornerBy("front-right") + cornerBy("rear-right")) / 2;
    // A lower nose is a positive pitch, matching the convention that braking pitches
    // the car nose-down with a positive angle.
    pitch = clamp(
      Math.asin(clamp((rearHeight - frontHeight) / Math.max(1e-6, resolved.wheelbase), -1, 1)),
      -resolved.maxPitch,
      resolved.maxPitch
    );
    // A lower left side is a negative roll, so steering right (which loads the left)
    // produces a negative roll and steering left a positive one.
    roll = clamp(
      Math.asin(clamp((leftHeight - rightHeight) / Math.max(1e-6, resolved.trackWidth), -1, 1)),
      -resolved.maxRoll,
      resolved.maxRoll
    );

    // Rolling rotation from distance travelled. A stationary car's wheels must not
    // spin, and a fast car's must, which is what makes motion legible.
    const spinRate = resolved.wheelRadius > 0 ? state.speed / resolved.wheelRadius : 0;
    spin = (spin + spinRate * step) % (Math.PI * 2);
    const spunWheels = resolvedWheels.map((wheel) => ({ ...wheel, spin }));

    const averageCompression = spunWheels.reduce((sum, wheel) => sum + wheel.compression, 0) / spunWheels.length;
    const maxContactGap = Math.max(...spunWheels.map((wheel) => wheel.contactGap));

    currentPose = {
      position: [state.x, bodyY, state.z],
      rotation: [pitch, state.heading, roll],
      wheels: spunWheels,
      contactGap: Math.min(...spunWheels.map((wheel) => wheel.contactGap)),
      grounded: spunWheels.every((wheel) => wheel.grounded),
      averageCompression
    };
    telemetry = {
      speed: state.speed,
      speedKph: state.speed * 3.6,
      pitch,
      roll,
      steerAngle: steerInput * resolved.maxSteerAngle,
      wheelSpinRate: spinRate,
      groundedWheels: spunWheels.filter((wheel) => wheel.grounded).length,
      maxContactGap,
      averageCompression,
      surfaceGrip: meanGrip
    };
    return currentPose;
  };

  return {
    kind: "aura-vehicle-chassis",
    spec: resolved,
    step(dt, state) {
      return resolvePose(dt, state, false);
    },
    pose() {
      return currentPose ?? resolvePose(0, { x: 0, z: 0, heading: 0, speed: 0, steer: 0 }, true);
    },
    telemetry() {
      return telemetry;
    },
    reset(state) {
      for (const wheel of WHEEL_LAYOUT) compression.set(wheel.id, { value: 0.5, velocity: 0 });
      spin = 0;
      pitch = 0;
      roll = 0;
      return resolvePose(0, state, true);
    }
  };
}

/**
 * Derive chassis geometry from a vehicle asset's rendered bounds.
 *
 * This is what removes the need for a `CAR_SCENE_HEIGHT`-style constant. Given the
 * size the asset actually renders at, the wheelbase, track width, wheel radius and
 * ride height follow from standard automotive proportions, so a different car
 * produces a different chassis instead of inheriting the old one's numbers.
 */
export function vehicleChassisSpecFromBounds(size: VehicleVec3, options: {
  /** Fraction of the body length between the axles. Real cars sit near 0.6. */
  readonly wheelbaseFraction?: number | undefined;
  /** Fraction of the body width between the wheel centres. */
  readonly trackFraction?: number | undefined;
  /** Fraction of body height taken by wheel diameter. */
  readonly wheelDiameterFraction?: number | undefined;
} = {}): VehicleChassisSpec {
  // The longest horizontal axis is the body length; the other is its width.
  const length = Math.max(size[0], size[2]);
  const width = Math.min(size[0], size[2]);
  const height = size[1];
  const wheelDiameter = height * (options.wheelDiameterFraction ?? 0.42);
  const wheelRadius = wheelDiameter / 2;
  return {
    wheelbase: length * (options.wheelbaseFraction ?? 0.6),
    trackWidth: width * (options.trackFraction ?? 0.82),
    wheelRadius,
    // The chassis origin sits at the body's vertical centre, which is one wheel
    // radius plus half the remaining body height above the contact patch.
    rideHeight: wheelRadius + (height - wheelDiameter) * 0.5,
    suspensionTravel: wheelRadius * 0.42
  };
}

/**
 * Largest body rotation a given suspension travel can produce over a given span.
 *
 * A corner sits `span / 2` from the rotation axis, so rotating by `theta` moves it
 * `sin(theta) * span / 2` vertically. Half the travel is reserved for the road, so
 * the limit is `asin(travel / 2 / (span / 2))`.
 */
function attitudeLimitForTravel(travel: number, span: number): number {
  const halfSpan = Math.max(1e-6, span / 2);
  const budget = Math.max(0, travel) / 2;
  return Math.asin(Math.min(1, budget / halfSpan));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
