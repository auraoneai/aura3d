import {
  AIR_LOW,
  AIR_PICKUP,
  AIR_REGEN,
  BASE_SPEED_ACCEL,
  BASE_SPEED_MAX,
  BASE_SPEED_START,
  BOOST_AIR_DRAIN,
  BOOST_FX_REARM_S,
  BOOST_SPEED_MULT,
  CEILING,
  CRASH_X_LIMIT,
  DIVE_ACCEL,
  DIVE_TERMINAL,
  FALL_TERMINAL,
  GROUND_HOLD_TIME,
  HOP_AIR_COST,
  HOP_VELOCITY,
  HOVER_HEIGHT,
  LANE_SPRING,
  LANE_SPRING_ROLLING,
  PLAYER_BOX,
  POWERUP_SECONDS,
  RAMP_MIN_LAUNCH,
  ROCKET_ALTITUDE,
  ROCKET_SECONDS,
  ROCKET_SPEED_MULT,
  ROLL_AIR_COST,
  ROLL_IFRAME,
  ROLL_SECONDS,
  SOFT_GRAVITY_FACTOR,
  TAKEOFF_VELOCITY,
  THRUST_ACCEL,
  THRUST_AIR_DRAIN,
  laneX,
  emptyInput,
  type InputFrame,
  type PickupKind
} from "./constants";
import { TAU, Vector3, clamp, damp, easeInOutCubic } from "./math";

export type PlayerEventName =
  | "boost"
  | "airLow"
  | "rocketStart"
  | "rocketEnd"
  | "thrust"
  | "thrustEnd"
  | "stumble"
  | "crash"
  | "hop"
  | "rampLaunch"
  | "roll"
  | "land";

export interface PlayerEnv {
  difficulty: number;
  supportHeight(x: number, z: number, y: number): number;
}

export interface PlayerBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const IDLE_INPUT: InputFrame = Object.freeze(emptyInput()) as InputFrame;

/** The player's roadster: lane-based freeway driving with cold-gas thruster flight, barrel rolls, ramp launches and roof running. */
export class Player {
  onEvent: (name: PlayerEventName, payload?: Record<string, unknown>) => void = () => {};
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** Render-facing transforms (pitch/bank on the pivot, yaw on the mesh, landing squash). */
  readonly pivot = { rotation: { x: 0, y: 0, z: 0 }, position: { y: 0 } };
  readonly mesh = { rotation: { y: 0 } };
  readonly squashGroup = { scale: { x: 1, y: 1, z: 1 } };

  lane = 2;
  targetLane = 2;
  prevLane = 2;
  baseSpeed = BASE_SPEED_START;
  speed = BASE_SPEED_START;
  air = 100;
  grounded = true;
  supportY = 0;
  rolling = false;
  rollDir = 0;
  rollT = 0;
  rollCombo = 0;
  flipping = false;
  flipT = 0;
  rocketTimer = 0;
  shieldTimer = 0;
  magnetTimer = 0;
  multiplierTimer = 0;
  graceTimer = 0;
  boosting = false;
  thrusting = false;
  diving = false;
  alive = true;
  airTime = 0;
  distance = 0;
  shakePulse = 0;
  groundBelow = 0;
  speedLinesAmount = 0;

  _laneVel = 0;
  _groundHold = 0;
  _rollQueued = 0;
  _rollIframe = 0;
  _airLowFired = false;
  /** Boost as the player sees and hears it: on while boosting and for BOOST_FX_REARM_S after (presentation only). */
  boostVisual = false;
  _boostOffFor = Number.POSITIVE_INFINITY;
  _prevSupport = 0;
  _climbRate = 0;
  _climbTime = 0;
  _stumble = 0;
  _stumbleDir = 0;
  _edgeBump = 0;
  _squash = 0;
  _squashVel = 0;
  _landBurn = 0;
  _rearPlume = 0;
  _sidePlumeL = 0;
  _sidePlumeR = 0;
  _downPlume = 0;
  _bank = 0;
  _yaw = 0;
  _pitch = 0;
  _time = 0;
  _brake = 0;
  _launched = false;
  _crashBounces = 0;
  _crashSpeed = 0;
  private tumbleAng = new Vector3();
  private tumbleVel = new Vector3();
  private bounds_: PlayerBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.lane = this.targetLane = this.prevLane = 2;
    this.position.set(laneX(2), 0, 0);
    this.velocity.set(0, 0, -BASE_SPEED_START);
    this.baseSpeed = BASE_SPEED_START;
    this.speed = BASE_SPEED_START;
    this.air = 100;
    this.grounded = true;
    this.supportY = 0;
    this.rolling = false;
    this.rollDir = 0;
    this.rollT = 0;
    this.rollCombo = 0;
    this._rollQueued = 0;
    this._rollIframe = 0;
    this.flipping = false;
    this.flipT = 0;
    this.rocketTimer = 0;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.multiplierTimer = 0;
    this.graceTimer = 0;
    this.boosting = false;
    this.thrusting = false;
    this.diving = false;
    this.alive = true;
    this.airTime = 0;
    this.distance = 0;
    this.shakePulse = 0;
    this.groundBelow = 0;
    this.speedLinesAmount = 0;
    this._laneVel = 0;
    this._groundHold = 0;
    this._airLowFired = false;
    this.boostVisual = false;
    this._boostOffFor = Number.POSITIVE_INFINITY;
    this._prevSupport = 0;
    this._climbRate = 0;
    this._climbTime = 0;
    this._stumble = 0;
    this._stumbleDir = 0;
    this._edgeBump = 0;
    this._squash = 0;
    this._squashVel = 0;
    this._landBurn = 0;
    this._rearPlume = 0;
    this._sidePlumeL = 0;
    this._sidePlumeR = 0;
    this._downPlume = 0;
    this._bank = 0;
    this._yaw = 0;
    this._pitch = 0;
    this._time = 0;
    this._brake = 0;
    this._launched = false;
    this.tumbleAng.set(0, 0, 0);
    this.tumbleVel.set(0, 0, 0);
    this._crashBounces = 0;
    this.pivot.rotation.x = this.pivot.rotation.y = this.pivot.rotation.z = 0;
    this.mesh.rotation.y = 0;
    this.squashGroup.scale.x = this.squashGroup.scale.y = this.squashGroup.scale.z = 1;
    this.syncPose(0);
    this.drivePlumes(0);
  }

  /** Immune to obstacles: rolling, just after a roll, rocket, shield or post-hit grace. */
  get invulnerable(): boolean {
    return this.rolling || this._rollIframe > 0 || this.rocketTimer > 0 || this.shieldTimer > 0 || this.graceTimer > 0;
  }

  bounds(): PlayerBounds {
    const b = this.bounds_;
    const p = this.position;
    b.minX = p.x - PLAYER_BOX.w / 2;
    b.maxX = p.x + PLAYER_BOX.w / 2;
    b.minY = p.y;
    b.maxY = p.y + PLAYER_BOX.h;
    b.minZ = p.z - PLAYER_BOX.l / 2;
    b.maxZ = p.z + PLAYER_BOX.l / 2;
    return b;
  }

  update(dt: number, input: InputFrame | undefined, env: PlayerEnv | undefined): void {
    if (!(dt > 0)) return;
    this._time += dt;
    const support = (y: number): number => (env && env.supportHeight && env.supportHeight(this.position.x, this.position.z, y)) || 0;
    if (!this.alive) {
      this.updateCrash(dt, env);
      this.syncPose(dt);
      this.drivePlumes(dt);
      this.speedLinesAmount = 0;
      this.groundBelow = support(this.position.y);
      return;
    }
    const inp = input || IDLE_INPUT;
    const difficulty = (env && env.difficulty) || 0;
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    this.multiplierTimer = Math.max(0, this.multiplierTimer - dt);
    this.graceTimer = Math.max(0, this.graceTimer - dt);
    this._rollIframe = Math.max(0, this._rollIframe - dt);
    this._stumble = Math.max(0, this._stumble - dt);
    this._edgeBump = Math.max(0, this._edgeBump - dt);
    if (this.rocketTimer > 0) {
      this.rocketTimer -= dt;
      if (this.rocketTimer <= 0) {
        this.rocketTimer = 0;
        this.graceTimer = Math.max(this.graceTimer, 1.2);
        this.emit("rocketEnd");
      }
    }
    const rocket = this.rocketTimer > 0;
    this.baseSpeed = Math.min(BASE_SPEED_MAX, this.baseSpeed + BASE_SPEED_ACCEL * dt);
    const difficultySpeed = 26 + 38 * clamp(difficulty, 0, 1);
    const cruise = Math.max(this.baseSpeed, difficultySpeed);
    const boostNow = !!inp.boost && this.air > 0 && !rocket;
    // Presentation only (the sim's boost state machine and every replayed value stay as recorded): with Shift held at
    // 0 air, regen re-arms boost every other frame. The boost sound, the shake pulse, the engine pitch and the speed
    // lines follow `boostVisual`, which bridges those gaps, so they no longer restart each frame (owner report
    // 2026-10-31: the car shook and the engine buzzed instead of staying in overdrive).
    if (boostNow && !this.boosting && this._boostOffFor >= BOOST_FX_REARM_S) {
      this.emit("boost");
      this.shakePulse = Math.max(this.shakePulse, 0.15);
    }
    this._boostOffFor = boostNow ? 0 : this._boostOffFor + dt;
    this.boostVisual = boostNow || this._boostOffFor < BOOST_FX_REARM_S;
    this.boosting = boostNow;
    if (this.boosting) this.air = Math.max(0, this.air - BOOST_AIR_DRAIN * dt);
    let speedMult = rocket ? ROCKET_SPEED_MULT : this.boosting ? BOOST_SPEED_MULT : 1;
    if (this._stumble > 0) speedMult *= 0.72;
    const targetSpeed = cruise * speedMult;
    this.speed = damp(this.speed, targetSpeed, targetSpeed > this.speed ? 2.2 : 5, dt);

    if (inp.left) this.changeLane(-1);
    if (inp.right) this.changeLane(1);
    const rollInput = inp.rollLeft ? -1 : inp.rollRight ? 1 : 0;
    if (rollInput) {
      if (this.rolling) {
        if (this.rollT > 0.5) this._rollQueued = rollInput;
      } else this.startRoll(rollInput);
    }
    if (this.rolling) {
      this.rollT += dt / ROLL_SECONDS;
      if (this.rollT >= 1) {
        this.rolling = false;
        this.rollT = 0;
        this._rollIframe = ROLL_IFRAME;
        if (this._rollQueued) {
          const queued = this._rollQueued;
          this._rollQueued = 0;
          this.startRoll(queued);
        } else this.rollDir = 0;
      }
    }

    const targetX = laneX(this.targetLane);
    const spring = this.rolling ? LANE_SPRING_ROLLING : LANE_SPRING;
    const x0 = this.position.x;
    const accel = spring * spring * (targetX - x0) - 2 * spring * this._laneVel;
    this._laneVel += accel * dt;
    this.position.x = x0 + this._laneVel * dt;
    if (this.lane !== this.targetLane && Math.abs(targetX - this.position.x) < 1.08) this.lane = this.targetLane;

    const y0 = this.position.y;
    let vy = this.velocity.y;
    const wasThrusting = this.thrusting;
    this.thrusting = false;
    let hopped = false;
    this.diving = !!inp.dive && !rocket;
    if (rocket) {
      const pull = 30 * (ROCKET_ALTITUDE - y0) - 9 * vy;
      vy += pull * dt;
      this.grounded = false;
      this.thrusting = true;
      this.air = Math.min(100, this.air + AIR_REGEN * dt);
    } else if (this.grounded) {
      const support0 = support(y0);
      if (inp.thrustPressed) {
        this.hop();
        hopped = true;
        vy = this.velocity.y;
      } else if (inp.thrust && this.air > 0) {
        this._groundHold += dt;
        if (this._groundHold > GROUND_HOLD_TIME) {
          this._groundHold = 0;
          this.takeoff(TAKEOFF_VELOCITY);
          vy = this.velocity.y;
        }
      } else this._groundHold = 0;
      if (this.grounded) {
        const climb = (support0 - this._prevSupport) / dt;
        if (support0 > this.supportY + 1e-3) {
          this._climbRate = climb;
          this._climbTime += dt;
          this.position.y = support0;
          this.supportY = support0;
          vy = 0;
        } else if (support0 < this.supportY - 0.05) {
          if (this._climbTime > 0.08 && this._climbRate > 2) this.rampLaunch();
          else {
            this.grounded = false;
            vy = 0;
          }
          if (!this._launched) this.velocity.y = 0;
          vy = this.velocity.y;
        } else {
          if (this._climbTime > 0.08 && this._climbRate > 2) {
            this.rampLaunch();
            vy = this.velocity.y;
          }
          if (this.grounded) {
            this.position.y = support0;
            this.supportY = support0;
            vy = 0;
          }
        }
        if (!(support0 > this.supportY - 1e-3 && support0 > this._prevSupport + 1e-3)) {
          this._climbTime = 0;
          this._climbRate = 0;
        }
        this._launched = false;
        this._prevSupport = support0;
        if (this.grounded) {
          this.airTime = 0;
          if (!this.boosting) this.air = Math.min(100, this.air + AIR_REGEN * dt);
        }
      }
    }

    if (!this.grounded && !rocket) {
      this.airTime += dt;
      if (inp.thrust && this.air > 0 && !this.diving && !hopped) {
        this.thrusting = true;
        this.air = Math.max(0, this.air - THRUST_AIR_DRAIN * dt);
        if (vy < TAKEOFF_VELOCITY) vy = Math.min(TAKEOFF_VELOCITY, vy + THRUST_ACCEL * dt);
        else {
          vy -= 30 * dt;
          if (vy < TAKEOFF_VELOCITY) vy = TAKEOFF_VELOCITY;
        }
        const headroom = CEILING - y0;
        if (headroom < 3) vy = Math.min(vy, Math.max(0, headroom) * 3);
      } else if (this.diving) vy = Math.max(DIVE_TERMINAL, vy - DIVE_ACCEL * dt);
      else {
        const gravity = Math.abs(vy) < 3.5 ? 30 * SOFT_GRAVITY_FACTOR : 30;
        vy = Math.max(FALL_TERMINAL, vy - gravity * dt);
      }
      const floor = support(y0);
      const clearance = y0 - floor;
      if (vy < -9 && clearance < 3.2 && !this.diving) {
        vy += 55 * dt;
        this._landBurn = Math.min(1, this._landBurn + dt * 8);
      }
      let ny = y0 + vy * dt;
      if (ny > CEILING) {
        ny = CEILING;
        vy = Math.min(vy, 0);
      }
      if (vy <= 0 && ny <= floor) {
        this.position.y = floor;
        this.land(floor, vy);
        vy = 0;
      } else this.position.y = ny;
    } else if (rocket) this.position.y = Math.min(CEILING, Math.max(0, y0 + vy * dt));

    if (this.position.y < 0) this.position.y = 0;
    this.velocity.y = vy;
    this.groundBelow = this.grounded ? this.supportY : support(this.position.y);
    if (this.thrusting && !wasThrusting && !rocket) this.emit("thrust");
    if (!this.thrusting && wasThrusting && !rocket) this.emit("thrustEnd");
    if (this.air < AIR_LOW && !this._airLowFired && !rocket) {
      this._airLowFired = true;
      this.emit("airLow");
    } else if (this.air > 30) this._airLowFired = false;
    this.position.z -= this.speed * dt;
    this.distance += this.speed * dt;
    this.velocity.x = this._laneVel;
    this.velocity.z = -this.speed;
    if (this.flipping) {
      this.flipT += dt / 0.7;
      if (this.flipT >= 1 || this.grounded) {
        this.flipping = false;
        this.flipT = 0;
      }
    }
    this.syncPose(dt);
    this.drivePlumes(dt);
    this.driveSpeedLines();
  }

  /** Side-swipe a vehicle: bounce back to `fromLane`, stumble and gain brief invulnerability. */
  scrape(fromLane?: number | null): void {
    if (!this.alive) return;
    const lane = clamp(fromLane == null ? this.lane : fromLane | 0, 0, 4);
    const side = Math.sign(this.position.x - laneX(lane)) || 1;
    this.targetLane = lane;
    this.lane = lane;
    this._laneVel = -side * 9;
    this._stumble = 0.55;
    this._stumbleDir = side;
    this.graceTimer = Math.max(this.graceTimer, 0.7);
    this.shakePulse = Math.max(this.shakePulse, 0.45);
    this._brake = 1;
    this.emit("stumble", { fromLane: lane });
  }

  crash(): void {
    if (!this.alive) return;
    this.alive = false;
    this.rolling = false;
    this.flipping = false;
    this.boosting = false;
    this.thrusting = false;
    this.rocketTimer = 0;
    this.grounded = false;
    this.velocity.set(this._laneVel * 0.4, Math.max(this.velocity.y, 0) + 8.5, -this.speed * 0.45);
    this._crashSpeed = this.speed * 0.45;
    this.speed = 0;
    const dir = this.position.x >= 0 ? -1 : 1;
    this.tumbleAng.set(this.pivot.rotation.x, this._yaw, this.pivot.rotation.z);
    this.tumbleVel.set(-7.5, 2.6 * dir, 9 * dir);
    this._crashBounces = 0;
    this.shakePulse = 1;
    this.emit("crash");
  }

  applyPickup(kind: PickupKind | string): void {
    switch (kind) {
      case "air":
        this.air = Math.min(100, this.air + AIR_PICKUP);
        break;
      case "magnet":
        this.magnetTimer = POWERUP_SECONDS.magnet;
        break;
      case "shield":
        this.shieldTimer = POWERUP_SECONDS.shield;
        break;
      case "multiplier":
        this.multiplierTimer = POWERUP_SECONDS.multiplier;
        break;
      case "rocket":
        if (this.rocketTimer <= 0) this.emit("rocketStart");
        this.rocketTimer = ROCKET_SECONDS;
        this.grounded = false;
        this.velocity.y = Math.max(this.velocity.y, 6);
        this.shakePulse = Math.max(this.shakePulse, 0.35);
        break;
    }
  }

  /** Scenario helper: place the car at a pose (lane, z, speed, height, roll, rocket, thrust). */
  setPose(pose: { lane?: number; z?: number; speed?: number; y?: number; vy?: number; grounded?: boolean; rollT?: number; rollDir?: number; rocket?: boolean; thrust?: boolean; groundBelow?: number } = {}): void {
    if (pose.lane != null) {
      this.lane = this.targetLane = this.prevLane = clamp(pose.lane | 0, 0, 4);
      this.position.x = laneX(this.lane);
      this._laneVel = 0;
    }
    if (pose.z != null) this.position.z = pose.z;
    if (pose.speed != null) this.speed = this.baseSpeed = pose.speed;
    if (pose.y != null) {
      this.position.y = Math.max(0, pose.y);
      this.grounded = pose.y <= 1e-3 || pose.grounded === true;
      this.supportY = this.grounded ? this.position.y : 0;
      this._prevSupport = this.supportY;
      this.velocity.y = pose.vy != null ? pose.vy : 0;
    }
    if (pose.rollT != null && pose.rollT > 0 && pose.rollT < 1) {
      this.rolling = true;
      this.rollT = pose.rollT;
      this.rollDir = pose.rollDir || 1;
    } else if (pose.rollT != null) {
      this.rolling = false;
      this.rollT = 0;
    }
    if (pose.rocket) {
      this.rocketTimer = ROCKET_SECONDS;
      this.grounded = false;
    } else if (pose.rocket === false) this.rocketTimer = 0;
    if (pose.thrust) {
      this._downPlume = 1;
      this.thrusting = true;
    }
    if (pose.groundBelow == null) {
      if (this.grounded) this.groundBelow = this.supportY;
    } else this.groundBelow = pose.groundBelow;
    this.syncPose(0);
    this.drivePlumes(0);
  }

  private changeLane(dir: number): void {
    const next = this.targetLane + dir;
    if (next < 0 || next >= 5) {
      this._edgeBump = 0.22;
      this._stumbleDir = dir;
      this._laneVel -= dir * 3;
    } else {
      this.prevLane = this.lane;
      this.targetLane = next;
    }
  }

  private hop(): void {
    this.air = Math.max(0, this.air - HOP_AIR_COST);
    this.takeoff(HOP_VELOCITY);
    this._squash = -0.16;
    this._squashVel = 0;
    this._downPlume = 1;
    this.emit("hop");
  }

  private takeoff(vy: number): void {
    this.grounded = false;
    this.velocity.y = vy;
    this.supportY = 0;
    this._climbTime = 0;
    this._climbRate = 0;
    this._groundHold = 0;
  }

  private rampLaunch(): void {
    const vy = Math.max(RAMP_MIN_LAUNCH, Math.min(this._climbRate, 16));
    this.takeoff(vy);
    this._launched = true;
    this.flipping = true;
    this.flipT = 0;
    this.shakePulse = Math.max(this.shakePulse, 0.3);
    this._squash = -0.12;
    this.emit("rampLaunch", { vy });
  }

  private startRoll(dir: number): void {
    if (this.air < ROLL_AIR_COST) {
      this.emit("airLow");
      return;
    }
    this.air -= ROLL_AIR_COST;
    this.rolling = true;
    this.rollDir = dir;
    this.rollT = 0;
    this.rollCombo = this.grounded ? 1 : this.rollCombo + 1;
    const lane = this.targetLane + dir;
    if (lane >= 0 && lane < 5) {
      this.prevLane = this.lane;
      this.targetLane = lane;
    }
    this.emit("roll", { dir, combo: this.rollCombo, grounded: this.grounded });
    if (this.grounded) this.takeoff(7.5);
    else if (this.velocity.y < 2) this.velocity.y = Math.max(this.velocity.y, 2);
    if (dir < 0) this._sidePlumeR = 1;
    else this._sidePlumeL = 1;
  }

  private land(y: number, vy: number): void {
    const impact = Math.min(1, -vy / 18);
    this.grounded = true;
    this.supportY = y;
    this._prevSupport = y;
    this._climbTime = 0;
    this._climbRate = 0;
    this._groundHold = 0;
    this._squash = 0.06 + impact * 0.2;
    this._squashVel = 0;
    this.flipping = false;
    this.flipT = 0;
    this._landBurn = Math.max(this._landBurn, 0.4 + impact * 0.6);
    this.shakePulse = Math.max(this.shakePulse, impact * 0.35);
    const combo = this.rollCombo;
    const airTime = this.airTime;
    this.rollCombo = 0;
    this.emit("land", { impact, y, roof: y > 0.3, combo, airTime });
  }

  private updateCrash(dt: number, env: PlayerEnv | undefined): void {
    const v = this.velocity;
    const p = this.position;
    v.y = Math.max(-30, v.y - 30 * dt);
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    p.x = clamp(p.x, -CRASH_X_LIMIT, CRASH_X_LIMIT);
    const floor = (env && env.supportHeight && env.supportHeight(p.x, p.z, p.y)) || 0;
    const ang = this.tumbleAng;
    const spin = this.tumbleVel;
    ang.x += spin.x * dt;
    ang.y += spin.y * dt;
    ang.z += spin.z * dt;
    if (p.y <= floor) {
      p.y = floor;
      if (v.y < -2 && this._crashBounces < 4) {
        v.y = -v.y * 0.42;
        this._crashBounces++;
        spin.multiplyScalar(0.6);
        v.x *= 0.7;
        v.z *= 0.75;
        this.shakePulse = Math.max(this.shakePulse, 0.3);
      } else {
        v.y = 0;
        v.x = damp(v.x, 0, 4, dt);
        v.z = damp(v.z, 0, 2.2, dt);
        spin.multiplyScalar(Math.exp(-5 * dt));
        const snapX = Math.round(ang.x / Math.PI) * Math.PI;
        const snapZ = Math.round(ang.z / Math.PI) * Math.PI;
        ang.x = damp(ang.x, snapX, 6, dt);
        ang.z = damp(ang.z, snapZ, 6, dt);
      }
    }
    this.speed = -v.z;
    this._landBurn = 0;
  }

  /** Derive banking, pitch, yaw, hover bob and landing squash from the physical state. */
  private syncPose(dt: number): void {
    const pivot = this.pivot;
    if (!this.alive) {
      pivot.rotation.x = this.tumbleAng.x;
      pivot.rotation.y = 0;
      pivot.rotation.z = this.tumbleAng.z;
      this.mesh.rotation.y = this.tumbleAng.y;
      this.squashGroup.scale.x = this.squashGroup.scale.y = this.squashGroup.scale.z = 1;
      return;
    }
    const step = dt > 0 ? dt : 1;
    const lv = this._laneVel;
    let bankTarget = clamp(-lv * 0.035, -0.38, 0.38);
    let yawTarget = clamp(-lv * 0.022, -0.22, 0.22);
    if (this._stumble > 0) {
      const k = this._stumble / 0.55;
      bankTarget += Math.sin(this._time * 38) * 0.16 * k;
      yawTarget += Math.sin(this._time * 27) * 0.12 * k * this._stumbleDir;
    }
    if (this._edgeBump > 0) bankTarget += Math.sin(this._edgeBump * 40) * 0.08 * this._stumbleDir;
    this._bank = dt > 0 ? damp(this._bank, bankTarget, 14, step) : bankTarget;
    this._yaw = dt > 0 ? damp(this._yaw, yawTarget, 12, step) : yawTarget;
    let pitchTarget = this.grounded ? 0 : clamp(this.velocity.y * 0.022, -0.42, 0.26);
    if (this.boosting && this.grounded) pitchTarget += 0.035;
    if (this.rocketTimer > 0) pitchTarget = 0.08 + clamp(this.velocity.y * 0.02, -0.1, 0.2);
    this._pitch = dt > 0 ? damp(this._pitch, pitchTarget, 8, step) : pitchTarget;
    let bank = this._bank;
    if (this.rolling) bank += easeInOutCubic(this.rollT) * TAU * -this.rollDir;
    let pitch = this._pitch;
    if (this.flipping) pitch += easeInOutCubic(this.flipT) * TAU;
    let bob = 0;
    if (this.grounded) bob = Math.sin(this._time * (9 + this.speed * 0.12)) * 0.012 + Math.sin(this._time * 23.7) * 6e-3;
    else if (this.thrusting || this.rocketTimer > 0) bob = Math.sin(this._time * 31) * 0.02;
    pivot.position.y = HOVER_HEIGHT + bob;
    pivot.rotation.x = pitch;
    pivot.rotation.y = 0;
    pivot.rotation.z = bank;
    this.mesh.rotation.y = this._yaw;
    if (dt > 0) {
      const spring = -260 * this._squash - 15 * this._squashVel;
      this._squashVel += spring * dt;
      this._squash += this._squashVel * dt;
    }
    const sq = clamp(this._squash, -0.25, 0.3);
    this.squashGroup.scale.x = 1 + sq * 0.45;
    this.squashGroup.scale.y = 1 - sq;
    this.squashGroup.scale.z = 1 + sq * 0.25;
    const braking = this._stumble > 0 || this.diving ? 1 : 0;
    this._brake = dt > 0 ? damp(this._brake, braking, 10, step) : braking;
  }

  private drivePlumes(dt: number): void {
    const step = dt > 0 ? dt : 1;
    const alive = this.alive;
    const rocket = this.rocketTimer > 0;
    const rearTarget = alive ? (rocket ? 1.35 : +!!this.boosting) : 0;
    this._rearPlume = dt > 0 ? damp(this._rearPlume, rearTarget, 12, step) : rearTarget;
    let downTarget = 0;
    if (alive) {
      if (this.thrusting) downTarget = rocket ? 0.6 : 1;
      if (!this.grounded && this.velocity.y > 1.5) downTarget = Math.max(downTarget, 0.9);
      downTarget = Math.max(downTarget, this._landBurn);
    }
    this._downPlume = dt > 0 ? damp(this._downPlume, downTarget, downTarget > this._downPlume ? 25 : 7, step) : downTarget;
    this._landBurn = Math.max(0, this._landBurn - (dt || 0) * 2.5);
    let left = 0;
    let right = 0;
    if (alive && this.rolling) {
      const level = this.rollT < 0.35 || this.rollT > 0.75 ? 1 : 0.35;
      if (this.rollDir < 0) right = level;
      else left = level;
    }
    if (alive && Math.abs(this._laneVel) > 6 && !this.grounded) {
      if (this._laneVel < 0) right = Math.max(right, 0.45);
      else left = Math.max(left, 0.45);
    }
    this._sidePlumeL = dt > 0 ? damp(this._sidePlumeL, left, left > this._sidePlumeL ? 30 : 9, step) : left;
    this._sidePlumeR = dt > 0 ? damp(this._sidePlumeR, right, right > this._sidePlumeR ? 30 : 9, step) : right;
  }

  private driveSpeedLines(): void {
    let amount = clamp((this.speed - 26) / 38, 0, 1) * 0.55;
    if (this.boosting) amount += 0.45;
    if (this.rocketTimer > 0) amount += 0.7;
    if (this.rolling) amount += 0.5 * Math.sin(this.rollT * Math.PI);
    this.speedLinesAmount = clamp(amount, 0, 1);
  }

  private emit(name: PlayerEventName, payload?: Record<string, unknown>): void {
    try {
      this.onEvent(name, payload);
    } catch (error) {
      console.error(error);
    }
  }
}

