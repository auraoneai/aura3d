/**
 * V-1 slip-angle bicycle vehicle model (PRD-08 §6.9) — pure, deterministic,
 * integrated at the loop's `fixedDt` by the caller (one `step(dt)` per
 * substep).
 *
 * State: `{ x, z, heading, vLong, vLat, yawRate }`. Slip angles
 * `αf = atan2(vLat + a·r, |vLong|) − δ`, `αr = atan2(vLat − b·r, |vLong|)`;
 * Pacejka-lite lateral force `F = −μ·N·sin(C·atan(B·α))` (B 8, C 1.4);
 * handbrake scales rear μ by 0.45; drift when `|αr| > 0.12 rad`; quadratic
 * aero drag `cD·v²` + rolling `cR·v`; torque table over speed (default peaks
 * at 0.6·maxSpeed); speed-dependent steering lock `δmax(v) = δ0/(1+v/vRef)`;
 * counter-steer assist damps yaw rate toward the kinematic rate.
 *
 * Below |vLong| < 1.5 u/s slip angles are undefined (atan2 near-zero
 * denominator), so the model blends linearly to the kinematic bicycle
 * (`r = vLong·tan δ / (a+b)`, `vLat → 0`) between 0.5 and 1.5 u/s.
 */

export interface BicycleTyreParams {
  /** Friction multiplier (default 1). */
  readonly mu?: number;
  /** Pacejka stiffness factor (default 8). */
  readonly B?: number;
  /** Pacejka shape factor (default 1.4). */
  readonly C?: number;
}

export interface BicycleModelOptions {
  readonly mass?: number;            // kg, default 1200
  readonly cgToFront?: number;       // a, m — default 1.2
  readonly cgToRear?: number;        // b, m — default 1.4
  readonly yawInertia?: number;      // Iz — default mass·a·b
  readonly maxSteer?: number;        // δ0 rad — default 0.6
  readonly steerReferenceSpeed?: number; // vRef — default 18
  readonly tyre?: BicycleTyreParams;
  readonly handbrakeRearGrip?: number;   // default 0.45
  readonly dragCoefficient?: number;     // cD — default 0.004 · mass-normalised below
  readonly rollingResistance?: number;   // cR — default 12 N·s/m equivalent
  /** Torque curve: [speedFraction 0..1, forceFraction 0..1] pairs. */
  readonly torqueCurve?: readonly (readonly [number, number])[];
  /** Counter-steer assist 0..1 — damps yaw toward the kinematic rate. */
  readonly steerAssist?: number;
  readonly maxSpeed?: number;        // u/s — default 60
  readonly maxForce?: number;        // engine force N — default 9000
  readonly brakeForce?: number;      // N — default 12000
  readonly wheelRadius?: number;     // m — default 0.35
  readonly gravity?: number;         // default 9.81
}

export interface BicycleModelInput {
  readonly steer?: number;     // −1..1 (positive = left/counter-clockwise)
  readonly throttle?: number;  // 0..1
  readonly brake?: number;     // 0..1
  readonly handbrake?: boolean;
}

export interface BicycleModelState {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly vLong: number;
  readonly vLat: number;
  readonly yawRate: number;
  readonly steer: number;
  readonly slipAngle: number;   // body slip atan2(vLat, |vLong|)
  readonly rearSlipAngle: number;
  readonly drifting: boolean;
  readonly wheelSpin: number;   // rad/s
  readonly rpm: number;         // normalised 0..1 over maxSpeed
  readonly lateralG: number;
}

/**
 * Default torque table — peaks at 0.6·maxSpeed per §6.9. The last point is
 * calibrated so engine force equals default drag (cD·v² + cR·v) at
 * v = maxSpeed, giving a top speed within ~2 % of `maxSpeed`.
 */
const DEFAULT_TORQUE_CURVE: readonly (readonly [number, number])[] = [
  [0, 0.55],
  [0.3, 0.85],
  [0.6, 1],
  [0.85, 0.7],
  [1, 0.32]
];

const GRAVITY = 9.81;
const LOW_SPEED_MIN = 0.5;
const LOW_SPEED_MAX = 1.5;
const DRIFT_SLIP_RAD = 0.12;

export class BicycleModel {
  private readonly o;
  private x = 0;
  private z = 0;
  private heading = 0;
  private vLong = 0;
  private vLat = 0;
  private yawRate = 0;
  private steerAmount = 0;
  private slipAngleValue = 0;
  private rearSlipValue = 0;
  private driftingValue = false;
  private lateralGValue = 0;

  constructor(options: BicycleModelOptions = {}) {
    const mass = options.mass ?? 1200;
    const a = options.cgToFront ?? 1.2;
    const b = options.cgToRear ?? 1.4;
    this.o = {
      mass,
      a,
      b,
      Iz: options.yawInertia ?? mass * a * b,
      maxSteer: options.maxSteer ?? 0.6,
      vRef: options.steerReferenceSpeed ?? 18,
      mu: options.tyre?.mu ?? 1,
      B: options.tyre?.B ?? 8,
      C: options.tyre?.C ?? 1.4,
      handbrakeRearGrip: options.handbrakeRearGrip ?? 0.45,
      dragCoefficient: options.dragCoefficient ?? 0.6,
      rollingResistance: options.rollingResistance ?? 12,
      torqueCurve: options.torqueCurve ?? DEFAULT_TORQUE_CURVE,
      steerAssist: Math.max(0, Math.min(1, options.steerAssist ?? 0)),
      maxSpeed: Math.max(1e-3, options.maxSpeed ?? 60),
      maxForce: options.maxForce ?? 9000,
      brakeForce: options.brakeForce ?? 12000,
      wheelRadius: options.wheelRadius ?? 0.35,
      gravity: options.gravity ?? GRAVITY
    };
  }

  get state(): BicycleModelState {
    return this.snapshot();
  }

  snapshot(): BicycleModelState {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      vLong: this.vLong,
      vLat: this.vLat,
      yawRate: this.yawRate,
      steer: this.steerAmount,
      slipAngle: this.slipAngleValue,
      rearSlipAngle: this.rearSlipValue,
      drifting: this.driftingValue,
      wheelSpin: this.vLong / this.o.wheelRadius,
      rpm: Math.max(0, Math.min(1, Math.abs(this.vLong) / this.o.maxSpeed)),
      lateralG: this.lateralGValue
    };
  }

  reset(o?: { x?: number; z?: number; heading?: number }): void {
    this.x = o?.x ?? 0;
    this.z = o?.z ?? 0;
    this.heading = o?.heading ?? 0;
    this.vLong = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.steerAmount = 0;
    this.slipAngleValue = 0;
    this.rearSlipValue = 0;
    this.driftingValue = false;
    this.lateralGValue = 0;
  }

  /**
   * Scale the velocity state (contact resolution / collision constraint).
   * Pose is untouched; speeds never exceed `maxSpeed`.
   */
  scaleVelocity(scale: number): void {
    const s = Math.max(0, scale);
    const max = this.o.maxSpeed;
    this.vLong = Math.max(-max, Math.min(max, this.vLong * s));
    this.vLat = Math.max(-max, Math.min(max, this.vLat * s));
    this.yawRate *= s;
  }

  /** Set the velocity state directly (e.g. `reset({ speed })` adapters). */
  setVelocity(vLong: number, vLat = 0): void {
    const max = this.o.maxSpeed;
    this.vLong = Math.max(-max, Math.min(max, vLong));
    this.vLat = Math.max(-max, Math.min(max, vLat));
  }

  /** Clamp position/heading in place (contact corridor resolution). */
  setPoseState(o: { x?: number; z?: number; heading?: number }): void {
    this.x = o.x ?? this.x;
    this.z = o.z ?? this.z;
    this.heading = o.heading ?? this.heading;
  }

  /** One fixed step; call once per loop substep with the loop's fixedDt. */
  step(dt: number, input: BicycleModelInput = {}): BicycleModelState {
    if (dt <= 0) return this.snapshot();
    const o = this.o;
    const steer = Math.max(-1, Math.min(1, input.steer ?? 0));
    const throttle = Math.max(0, Math.min(1, input.throttle ?? 0));
    const brake = Math.max(0, Math.min(1, input.brake ?? 0));
    this.steerAmount = steer;

    // Speed-dependent steering lock: δmax(v) = δ0 / (1 + |v| / vRef)
    const speed = Math.abs(this.vLong);
    const steerMax = o.maxSteer / (1 + speed / o.vRef);
    const delta = steer * steerMax;

    // Longitudinal force: torque curve · throttle − brake − drag − rolling.
    const engine = this.torqueAt(speed / o.maxSpeed) * o.maxForce * throttle;
    const drag =
      o.dragCoefficient * this.vLong * speed + o.rollingResistance * this.vLong;
    const brakeForce = o.brakeForce * brake * Math.sign(this.vLong || 1);
    const aLong = (engine - brakeForce - drag) / o.mass;

    // Slip angles (dynamic regime).
    const vAbs = Math.max(Math.abs(this.vLong), 1e-4);
    const alphaF = Math.atan2(this.vLat + o.a * this.yawRate, vAbs) - delta;
    const alphaR = Math.atan2(this.vLat - o.b * this.yawRate, vAbs);
    const nFront = (o.mass * o.gravity * o.b) / (o.a + o.b);
    const nRear = (o.mass * o.gravity * o.a) / (o.a + o.b);
    const muR = o.mu * (input.handbrake ? o.handbrakeRearGrip : 1);
    const fFront = pacejka(alphaF, nFront, o.mu, o.B, o.C);
    const fRear = pacejka(alphaR, nRear, muR, o.B, o.C);

    // Dynamic-bicycle derivatives.
    const cosDelta = Math.cos(delta);
    const aLatDyn = (fFront * cosDelta + fRear) / o.mass - this.yawRate * this.vLong;
    const yawAccDyn = (o.a * fFront * cosDelta - o.b * fRear) / o.Iz;

    // Kinematic bicycle reference (low-speed fallback + counter-steer target).
    const yawRateKin = (this.vLong * Math.tan(delta)) / (o.a + o.b);

    // Low-speed blend between 0.5 and 1.5 u/s.
    const blend = Math.max(
      0,
      Math.min(1, (speed - LOW_SPEED_MIN) / (LOW_SPEED_MAX - LOW_SPEED_MIN))
    );

    const vLatNext = (this.vLat + aLatDyn * dt) * blend;
    const yawDynNext = this.yawRate + yawAccDyn * dt;
    // Low-speed blend: lerp dynamic integration with the kinematic bicycle.
    this.vLong += aLong * dt;
    this.vLat = vLatNext;
    this.yawRate = yawRateKin * (1 - blend) + yawDynNext * blend;
    // Counter-steer assist damps the yaw rate toward the kinematic target
    // (assist 1 = collapse excess rotation, e.g. drift recovery).
    if (o.steerAssist > 0) {
      this.yawRate += (yawRateKin - this.yawRate) * Math.min(1, o.steerAssist * 4 * dt);
    }
    this.heading += this.yawRate * dt;

    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    this.x += (this.vLong * sin - this.vLat * cos) * dt;
    this.z += (this.vLong * cos + this.vLat * sin) * dt;

    this.slipAngleValue = Math.atan2(this.vLat, vAbs);
    this.rearSlipValue = alphaR;
    this.driftingValue = Math.abs(alphaR) > DRIFT_SLIP_RAD;
    this.lateralGValue = (this.yawRate * this.vLong) / o.gravity;
    return this.snapshot();
  }

  private torqueAt(speedFraction: number): number {
    const curve = this.o.torqueCurve;
    const u = Math.max(0, Math.min(1, speedFraction));
    for (let i = 1; i < curve.length; i += 1) {
      const [x1, y1] = curve[i];
      if (u <= x1) {
        const [x0, y0] = curve[i - 1];
        const t = x1 - x0 <= 0 ? 1 : (u - x0) / (x1 - x0);
        return y0 + (y1 - y0) * t;
      }
    }
    return curve[curve.length - 1][1];
  }
}

/** Pacejka-lite lateral force: F = −μ·N·sin(C·atan(B·α)). */
function pacejka(alpha: number, normalLoad: number, mu: number, B: number, C: number): number {
  return -mu * normalLoad * Math.sin(C * Math.atan(B * alpha));
}

export function createBicycleModel(options: BicycleModelOptions = {}): BicycleModel {
  return new BicycleModel(options);
}
