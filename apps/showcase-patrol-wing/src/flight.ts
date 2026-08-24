/**
 * Patrol Wing authored flight model (PRD PW-05).
 *
 * This is AUTHORED motion, Gravity-Post wording: there is no aerodynamics,
 * lift, or stall-physics claim anywhere. Control rates are scaled by airspeed,
 * throttle maps to forward speed, gravity sag pulls the nose down below a
 * throttle floor, and a soft stall drops the nose with damped controls. Terrain
 * and ocean contact are crash rules evaluated against the same authored height
 * function that builds the island mesh (sky.ts).
 *
 * Deterministic by construction: fixed-step only, no wall clock, no random.
 * Identical input scripts produce identical trajectory hashes (unit-proven in
 * tests/unit/apps/patrol-wing-flight.test.ts).
 *
 * Body axes: +X forward (matches the authored patrolWingPlane.glb), +Y up,
 * +Z right wing. Rotation state is a quaternion; the visual Euler for the
 * runtime node comes from quatToEuler below.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export const FLIGHT_DT = 1 / 60;

/** Tuned feel constants (responsive arcade flight, crisp carving turns, honest stall). */
export const FLIGHT_CONSTANTS = {
  maxSpeed: 28,
  cruiseSpeed: 20,
  /** Below this airspeed the nose drops and controls mush out. */
  stallSpeed: 8.5,
  stallRecoverSpeed: 10.5,
  /** Throttle below this floor trades altitude for a gravity-sag sink. */
  throttleSagFloor: 0.34,
  pitchRate: 1.6,
  rollRate: 2.4,
  yawRate: 1.6,
  /** Banked-turn coupling: holding roll carves smoothly into the turn. */
  bankTurnCoupling: 1.6,
  throttleRate: 0.65,
  speedApproach: 1.35,
  sagGravity: 0.8,
  stallNoseDrop: 0.2,
  stallAuthority: 0.45,
  takeoffSpeed: 10.5,
  /** Wheel/prop clearance above the terrain height before contact counts. */
  groundClearance: 0.55,
  /** Landing tolerances (pad touchdown). */
  landingMaxSpeed: 6,
  landingMaxRoll: 0.3,
  landingMaxPitch: 0.35
} as const;

export interface FlightInput {
  /** S — nose up. */
  readonly pitchUp: boolean;
  /** W — nose down. */
  readonly pitchDown: boolean;
  /** A — left wing down. */
  readonly rollLeft: boolean;
  /** D — right wing down. */
  readonly rollRight: boolean;
  /** Q — nose left. */
  readonly yawLeft: boolean;
  /** E — nose right. */
  readonly yawRight: boolean;
  /** Shift. */
  readonly throttleUp: boolean;
  /** Ctrl. */
  readonly throttleDown: boolean;
}

export const NEUTRAL_INPUT: FlightInput = {
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
  yawLeft: false,
  yawRight: false,
  throttleUp: false,
  throttleDown: false
};

export type FlightGroundState = "preflight" | "airborne";

export type FlightOutcome = "none" | "crash-terrain" | "crash-ocean" | "pad-bounce" | "pad-touchdown";

export interface FlightFrame {
  readonly outcome: FlightOutcome;
  readonly stalled: boolean;
  readonly bounced: boolean;
}

// ---- quaternion helpers (deterministic, plain math) --------------------------

export function qIdentity(): Quat {
  return [0, 0, 0, 1];
}

export function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

export function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

export function qRotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2*cross(q.xyz, cross(q.xyz, v) + w*v)
  const [x, y, z, w] = q;
  const c1x = y * v[2] - z * v[1] + w * v[0];
  const c1y = z * v[0] - x * v[2] + w * v[1];
  const c1z = x * v[1] - y * v[0] + w * v[2];
  const c2x = y * c1z - z * c1y;
  const c2y = z * c1x - x * c1z;
  const c2z = x * c1y - y * c1x;
  return [v[0] + 2 * c2x, v[1] + 2 * c2y, v[2] + 2 * c2z];
}

export interface Euler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function quatToEuler(q: Quat): Euler {
  const [x, y, z, w] = q;
  const sinp = 2 * (w * x - y * z);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
  return {
    x: pitch,
    y: Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)),
    z: Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z))
  };
}

/** FNV-1a over a string, stable hex (same algorithm as the sibling routes). */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---- flight model ------------------------------------------------------------

export interface FlightStateSnapshot {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly euler: Euler;
  readonly forward: Vec3;
  readonly throttle: number;
  readonly speed: number;
  readonly stalled: boolean;
  readonly grounded: FlightGroundState;
  readonly sagVelocity: number;
}

export interface LandingContext {
  /** Pad center in world space. */
  readonly padCenter: Vec3;
  /** Pad surface Y. */
  readonly padY: number;
  /** Flat pad radius. */
  readonly padRadius: number;
}

/**
 * Authored six-axis flight. Step with a fixed dt (FLIGHT_DT) for determinism;
 * the route's frame loop always steps whole fixed frames.
 */
export class FlightModel {
  private positionValue: Vec3;
  private rotationValue: Quat;
  private throttleValue = 0;
  private speedValue = 0;
  private sagVelocityValue = 0;
  private stalledValue = false;
  private groundedValue: FlightGroundState;
  private bounceArmed = true;
  private readonly trajectory: string[] = [];

  constructor(
    initial: { position: Vec3; headingYaw: number; grounded?: FlightGroundState; throttle?: number; speed?: number }
  ) {
    this.positionValue = [...initial.position] as Vec3;
    this.rotationValue = qFromAxisAngle([0, 1, 0], initial.headingYaw);
    this.groundedValue = initial.grounded ?? "preflight";
    this.throttleValue = initial.throttle ?? 0;
    this.speedValue = initial.speed ?? 0;
  }

  get position(): Vec3 {
    return this.positionValue;
  }

  get rotation(): Quat {
    return this.rotationValue;
  }

  get euler(): Euler {
    return quatToEuler(this.rotationValue);
  }

  get forward(): Vec3 {
    return qRotate(this.rotationValue, [1, 0, 0]);
  }

  get up(): Vec3 {
    return qRotate(this.rotationValue, [0, 1, 0]);
  }

  get right(): Vec3 {
    return qRotate(this.rotationValue, [0, 0, 1]);
  }

  get throttle(): number {
    return this.throttleValue;
  }

  get speed(): number {
    return this.speedValue;
  }

  get stalled(): boolean {
    return this.stalledValue;
  }

  get grounded(): FlightGroundState {
    return this.groundedValue;
  }

  get sagVelocity(): number {
    return this.sagVelocityValue;
  }

  /** Roll angle (bank) in radians, positive = right wing down. */
  get bank(): number {
    const right = this.right;
    return Math.atan2(-right[1], Math.hypot(right[0], right[2]));
  }

  snapshot(): FlightStateSnapshot {
    return {
      position: this.positionValue,
      rotation: this.rotationValue,
      euler: this.euler,
      forward: this.forward,
      throttle: this.throttleValue,
      speed: this.speedValue,
      stalled: this.stalledValue,
      grounded: this.groundedValue,
      sagVelocity: this.sagVelocityValue
    };
  }

  /**
   * Advance one fixed step. `terrainHeight(x, z)` returns the authored island
   * height (ocean = 0). `landing` supplies pad geometry; without it every pad
   * contact is a terrain crash.
   */
  step(
    input: FlightInput,
    dt: number,
    terrainHeight: (x: number, z: number) => number,
    landing?: LandingContext
  ): FlightFrame {
    const c = FLIGHT_CONSTANTS;

    // Throttle.
    if (input.throttleUp) {
      this.throttleValue = Math.min(1, this.throttleValue + c.throttleRate * dt);
    } else if (input.throttleDown) {
      this.throttleValue = Math.max(0, this.throttleValue - c.throttleRate * 2 * dt);
    } else {
      this.throttleValue = Math.max(0, this.throttleValue - c.throttleRate * 0.4 * dt);
    }

    // Airspeed chases throttle * max speed.
    const targetSpeed = this.throttleValue * c.maxSpeed;
    const climbDrag = this.forward[1] > 0 ? this.forward[1] * 2.8 : this.forward[1] * 1.5;
    this.speedValue += (targetSpeed - this.speedValue) * Math.min(1, dt * c.speedApproach) - climbDrag * dt;
    if (this.speedValue < 0) this.speedValue = 0;

    // Stall bookkeeping.
    if (this.groundedValue === "airborne") {
      if (this.speedValue < c.stallSpeed) this.stalledValue = true;
      else if (this.speedValue > c.stallRecoverSpeed) this.stalledValue = false;
    } else {
      this.stalledValue = false;
    }

    // Control authority scales with airspeed; stall damps it further.
    const authority =
      clamp((this.speedValue - 3) / 13, 0, 1.15) * (this.stalledValue ? c.stallAuthority : 1);

    // Body-frame angular rates.
    let pitch = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
    if (pitch > 0 && this.forward[1] > 0.52) pitch = 0;
    if (pitch < 0 && this.forward[1] < -0.85) pitch = 0;

    let roll = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);
    if (roll > 0 && this.bank > 0.95) roll = 0;
    if (roll < 0 && this.bank < -0.95) roll = 0;

    const yaw = (input.yawLeft ? 1 : 0) - (input.yawRight ? 1 : 0);

    // Banked-turn coupling: bank angle feeds yaw so a rolled plane carves smoothly into the turn.
    const bankAngle = this.bank;
    const bankTurn = -Math.sin(bankAngle) * c.bankTurnCoupling;

    if (pitch !== 0) {
      const dqp = qFromAxisAngle(this.right, pitch * c.pitchRate * authority * dt);
      this.rotationValue = qMul(dqp, this.rotationValue);
    }
    if (roll !== 0) {
      const dqr = qFromAxisAngle(this.forward, roll * c.rollRate * authority * dt);
      this.rotationValue = qMul(dqr, this.rotationValue);
    }
    if (yaw !== 0 || (this.groundedValue === "airborne" && bankTurn !== 0)) {
      const yawTotal = (yaw + (this.groundedValue === "airborne" ? bankTurn : 0)) * c.yawRate * dt;
      const dqy = qFromAxisAngle([0, 1, 0], yawTotal);
      this.rotationValue = qMul(dqy, this.rotationValue);
    }
    // Soft stall: the nose drops gently on its own while controls are mushy.
    if (this.stalledValue && this.forward[1] > -0.15) {
      const dqs = qFromAxisAngle(this.right, -c.stallNoseDrop * dt);
      this.rotationValue = qMul(dqs, this.rotationValue);
    }

    // Gravity sag: throttle floor + gentle bank angle compensation.
    const bankLiftLoss = Math.max(0, 1 - Math.cos(this.bank)) * 1.5;
    const sagAccel =
      this.groundedValue === "airborne"
        ? Math.max(0, c.throttleSagFloor - this.throttleValue) * c.sagGravity + bankLiftLoss
        : 0;
    this.sagVelocityValue += sagAccel * dt;
    this.sagVelocityValue *= 1 - Math.min(1, dt * 1.25);

    const forward = this.forward;
    const p = this.positionValue;

    if (this.groundedValue === "preflight") {
      // Rolling takeoff: no translation until lift-off speed, then airborne.
      if (this.speedValue >= c.takeoffSpeed) {
        this.groundedValue = "airborne";
        this.positionValue = [p[0], p[1] + 0.35, p[2]];
        this.sagVelocityValue = 0;
      }
      return { outcome: "none", stalled: false, bounced: false };
    }

    const nextX = p[0] + forward[0] * this.speedValue * dt;
    const nextY = p[1] + forward[1] * this.speedValue * dt - this.sagVelocityValue * dt;
    const nextZ = p[2] + forward[2] * this.speedValue * dt;
    this.positionValue = [nextX, nextY, nextZ];

    this.pushTrajectory();

    // Crash / landing rules against the authored terrain height.
    const ground = terrainHeight(nextX, nextZ);
    const contactY = ground + c.groundClearance;
    if (nextY <= contactY) {
      if (landing) {
        const dx = nextX - landing.padCenter[0];
        const dz = nextZ - landing.padCenter[2];
        const withinPad = Math.hypot(dx, dz) <= landing.padRadius + 0.35 && nextY <= landing.padY + 1.4;
        // Attitude checks use the model's own axes (heading-independent):
        // bank from the right wing, pitch from the forward vector's climb.
        const wingsLevel = Math.abs(this.bank) <= c.landingMaxRoll;
        const climbAngle = Math.asin(clamp(this.forward[1], -1, 1));
        const noseLevel = Math.abs(climbAngle) <= c.landingMaxPitch;
        if (withinPad) {
          if (this.speedValue <= c.landingMaxSpeed && wingsLevel && noseLevel) {
            this.positionValue = [nextX, landing.padY + 0.42, nextZ];
            return { outcome: "pad-touchdown", stalled: false, bounced: false };
          }
          if (this.bounceArmed) {
            // Authored bounce: a hot or tilted pad contact shoves the plane
            // back up with a hull scrape (documented authored behavior).
            this.bounceArmed = false;
            this.positionValue = [nextX, landing.padY + 1.1, nextZ];
            this.sagVelocityValue = -3.4;
            this.throttleValue = Math.max(this.throttleValue, 0.45);
            this.speedValue = Math.max(this.speedValue, c.landingMaxSpeed + 2);
            return { outcome: "pad-bounce", stalled: false, bounced: true };
          }
          return { outcome: "crash-terrain", stalled: this.stalledValue, bounced: false };
        }
      }
      return {
        outcome: ground <= 0.01 ? "crash-ocean" : "crash-terrain",
        stalled: this.stalledValue,
        bounced: false
      };
    }

    // Clear of the ground: re-arm the bounce for the next pad contact.
    if (nextY > contactY + 0.6) this.bounceArmed = true;
    return { outcome: "none", stalled: this.stalledValue, bounced: false };
  }

  /** Quantized trajectory log for determinism proofs (mm precision). */
  private pushTrajectory(): void {
    const q = (value: number): string => String(Math.round(value * 1000));
    const [x, y, z] = this.positionValue;
    this.trajectory.push(`${q(x)},${q(y)},${q(z)}`);
    if (this.trajectory.length > 20000) this.trajectory.shift();
  }

  /** FNV-1a hash over the recorded quantized trajectory. */
  trajectoryHash(): string {
    return hashString(this.trajectory.join("|"));
  }

  trajectoryFrameCount(): number {
    return this.trajectory.length;
  }
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
