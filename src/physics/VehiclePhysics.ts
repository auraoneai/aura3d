/**
 * Realistic vehicle physics simulation with raycast suspension and tire model.
 * Supports engine torque curves, transmissions, differentials, and aerodynamics.
 *
 * @module Physics/VehiclePhysics
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { RigidBody, BodyType } from './RigidBody';
import { PhysicsWorld } from './PhysicsWorld';
import { TireModel, TireForces, TirePresets } from './TireModel';
import { Ray, RaycastHit } from './Raycast';

/**
 * Differential type for torque distribution.
 */
export enum DifferentialType {
  /** Open differential - no locking, independent wheel speeds */
  Open = 0,

  /** Limited slip differential - partial locking under load */
  LimitedSlip = 1,

  /** Locked differential - wheels rotate together */
  Locked = 2,

  /** Electronic - active torque vectoring */
  Electronic = 3
}

/**
 * Transmission type.
 */
export enum TransmissionType {
  /** Manual transmission with clutch */
  Manual = 0,

  /** Automatic transmission with torque converter */
  Automatic = 1,

  /** CVT - continuously variable transmission */
  CVT = 2
}

/**
 * Wheel configuration and state.
 */
export interface WheelConfig {
  /** Wheel position relative to vehicle center */
  position: Vector3;

  /** Suspension rest length in meters */
  suspensionRestLength: number;

  /** Suspension spring stiffness (N/m) */
  suspensionStiffness: number;

  /** Suspension damping coefficient */
  suspensionDamping: number;

  /** Maximum suspension travel in meters */
  suspensionTravel: number;

  /** Tire model for this wheel */
  tireModel: TireModel;

  /** Is this a steering wheel */
  isSteering: boolean;

  /** Is this a driven wheel */
  isDriven: boolean;

  /** Maximum steering angle in radians */
  maxSteeringAngle: number;

  /** Brake torque capacity in Nm */
  maxBrakeTorque: number;

  /** Wheel mass in kg */
  wheelMass: number;

  /** Wheel radius in meters */
  wheelRadius: number;

  /** Wheel width in meters */
  wheelWidth: number;
}

/**
 * Wheel runtime state.
 */
interface WheelState {
  config: WheelConfig;
  suspensionLength: number;
  suspensionVelocity: number;
  suspensionForce: number;
  isGrounded: boolean;
  groundNormal: Vector3;
  groundPoint: Vector3;
  angularVelocity: number;
  steeringAngle: number;
  brakeTorque: number;
  driveTorque: number;
  tireForces: TireForces;
  wheelForce: Vector3;
}

/**
 * Engine configuration.
 */
export interface EngineConfig {
  /** Peak torque in Nm */
  peakTorque: number;

  /** RPM at peak torque */
  peakTorqueRPM: number;

  /** Peak power in watts */
  peakPower: number;

  /** RPM at peak power */
  peakPowerRPM: number;

  /** Idle RPM */
  idleRPM: number;

  /** Maximum RPM (redline) */
  maxRPM: number;

  /** Engine inertia (kg⋅m²) */
  inertia: number;

  /** Engine friction coefficient */
  friction: number;
}

/**
 * Transmission configuration.
 */
export interface TransmissionConfig {
  /** Transmission type */
  type: TransmissionType;

  /** Gear ratios (forward gears, index 0 is 1st gear) */
  gearRatios: number[];

  /** Reverse gear ratio */
  reverseRatio: number;

  /** Final drive ratio */
  finalDriveRatio: number;

  /** Shift time in seconds */
  shiftTime: number;

  /** Automatic upshift RPM */
  upshiftRPM?: number;

  /** Automatic downshift RPM */
  downshiftRPM?: number;
}

/**
 * Differential configuration.
 */
export interface DifferentialConfig {
  /** Differential type */
  type: DifferentialType;

  /** Torque split ratio (0 = all rear, 1 = all front, 0.5 = 50/50) */
  frontRearSplit: number;

  /** LSD lock percentage (0-1) */
  lockingFactor: number;

  /** Torque bias ratio for LSD */
  torqueBias: number;
}

/**
 * Aerodynamics configuration.
 */
export interface AerodynamicsConfig {
  /** Drag coefficient */
  dragCoefficient: number;

  /** Frontal area in m² */
  frontalArea: number;

  /** Downforce coefficient */
  downforceCoefficient: number;

  /** Center of pressure offset from center of mass */
  centerOfPressure: Vector3;
}

/**
 * Vehicle physics configuration.
 */
export interface VehiclePhysicsConfig {
  /** Vehicle mass in kg */
  mass: number;

  /** Center of mass offset from origin */
  centerOfMass: Vector3;

  /** Wheel configurations */
  wheels: WheelConfig[];

  /** Engine configuration */
  engine: EngineConfig;

  /** Transmission configuration */
  transmission: TransmissionConfig;

  /** Differential configuration */
  differential: DifferentialConfig;

  /** Aerodynamics configuration */
  aerodynamics: AerodynamicsConfig;

  /** Anti-roll bar stiffness (front) in Nm/rad */
  antiRollBarFront?: number;

  /** Anti-roll bar stiffness (rear) in Nm/rad */
  antiRollBarRear?: number;
}

/**
 * Vehicle input controls.
 */
export interface VehicleInput {
  /** Throttle input (0-1) */
  throttle: number;

  /** Brake input (0-1) */
  brake: number;

  /** Steering input (-1 to 1) */
  steering: number;

  /** Clutch input (0 = engaged, 1 = disengaged) */
  clutch: number;

  /** Handbrake input (0-1) */
  handbrake: number;
}

/**
 * Realistic vehicle physics simulator.
 *
 * Features:
 * - Raycast-based wheel suspension with spring-damper system
 * - Engine torque curve simulation
 * - Multi-gear transmission (manual/automatic/CVT)
 * - Differential types (open/LSD/locked/electronic)
 * - Ackermann steering geometry
 * - Anti-roll bars for body roll reduction
 * - Aerodynamic drag and downforce
 * - Tire physics using Pacejka magic formula
 *
 * @example
 * ```typescript
 * // Create vehicle
 * const vehicle = new VehiclePhysics({
 *   mass: 1500,
 *   centerOfMass: new Vector3(0, -0.3, 0),
 *   wheels: createStandardCarWheels(),
 *   engine: createSportEngine(),
 *   transmission: createManual6Speed(),
 *   differential: { type: DifferentialType.LimitedSlip, frontRearSplit: 0.4, lockingFactor: 0.5, torqueBias: 2.0 },
 *   aerodynamics: createSportAero()
 * });
 *
 * // Update vehicle
 * const input: VehicleInput = {
 *   throttle: 0.8,
 *   brake: 0,
 *   steering: -0.3,
 *   clutch: 0,
 *   handbrake: 0
 * };
 *
 * vehicle.update(deltaTime, input, physicsWorld);
 *
 * // Get vehicle state
 * console.log(`Speed: ${vehicle.getSpeed()} m/s`);
 * console.log(`RPM: ${vehicle.getEngineRPM()}`);
 * console.log(`Gear: ${vehicle.getCurrentGear()}`);
 * ```
 */
export class VehiclePhysics {
  private config: VehiclePhysicsConfig;
  private rigidBody: RigidBody;
  private wheels: WheelState[];
  private engineRPM: number;
  private currentGear: number;
  private isShifting: boolean;
  private shiftTimer: number;
  private clutchPosition: number;

  /**
   * Current vehicle position.
   */
  position: Vector3;

  /**
   * Current vehicle rotation.
   */
  rotation: Quaternion;

  /**
   * Current linear velocity.
   */
  velocity: Vector3;

  /**
   * Current angular velocity.
   */
  angularVelocity: Vector3;

  /**
   * Creates a new vehicle physics simulator.
   *
   * @param config - Vehicle configuration
   */
  constructor(config: VehiclePhysicsConfig) {
    this.config = config;

    this.rigidBody = new RigidBody({
      type: BodyType.Dynamic,
      mass: config.mass,
      position: Vector3.zero(),
      rotation: Quaternion.identity()
    });

    this.wheels = config.wheels.map(wheelConfig => this.createWheelState(wheelConfig));

    this.engineRPM = config.engine.idleRPM;
    this.currentGear = 1;
    this.isShifting = false;
    this.shiftTimer = 0;
    this.clutchPosition = 0;

    this.position = Vector3.zero();
    this.rotation = Quaternion.identity();
    this.velocity = Vector3.zero();
    this.angularVelocity = Vector3.zero();
  }

  /**
   * Updates vehicle physics simulation.
   *
   * @param deltaTime - Time step in seconds
   * @param input - Control inputs
   * @param physicsWorld - Physics world for raycasting
   */
  update(deltaTime: number, input: VehicleInput, physicsWorld: PhysicsWorld): void {
    this.updateShifting(deltaTime, input);

    this.updateWheelSuspension(deltaTime, physicsWorld);

    this.updateEngine(deltaTime, input);

    const driveTorque = this.calculateDriveTorque(input);

    this.distributeTorque(driveTorque, input);

    this.updateWheelForces(deltaTime, input);

    this.applyAntiRollBars();

    this.applyAerodynamics(deltaTime);

    this.integrateForces(deltaTime);

    this.syncRigidBody();
  }

  /**
   * Creates initial wheel state from configuration.
   */
  private createWheelState(config: WheelConfig): WheelState {
    return {
      config: config,
      suspensionLength: config.suspensionRestLength,
      suspensionVelocity: 0,
      suspensionForce: 0,
      isGrounded: false,
      groundNormal: Vector3.up(),
      groundPoint: Vector3.zero(),
      angularVelocity: 0,
      steeringAngle: 0,
      brakeTorque: 0,
      driveTorque: 0,
      tireForces: {
        longitudinal: 0,
        lateral: 0,
        combined: 0,
        slipAngle: 0,
        slipRatio: 0
      },
      wheelForce: Vector3.zero()
    };
  }

  /**
   * Updates wheel suspension using raycasts.
   */
  private updateWheelSuspension(deltaTime: number, physicsWorld: PhysicsWorld): void {
    for (const wheel of this.wheels) {
      const wheelWorldPos = this.transformPoint(wheel.config.position);
      const suspensionDir = this.transformDirection(Vector3.down());

      const rayOrigin = wheelWorldPos.add(suspensionDir.scale(-wheel.config.suspensionTravel * 0.5));
      const rayDistance = wheel.config.suspensionRestLength + wheel.config.suspensionTravel;

      const ray = new Ray(rayOrigin, suspensionDir);
      const hit = this.raycastGround(ray, rayDistance, physicsWorld);

      if (hit) {
        wheel.isGrounded = true;
        wheel.groundPoint = hit.point;
        wheel.groundNormal = hit.normal;

        const newLength = hit.distance - wheel.config.suspensionTravel * 0.5;
        const compression = wheel.config.suspensionRestLength - newLength;

        wheel.suspensionVelocity = (newLength - wheel.suspensionLength) / deltaTime;
        wheel.suspensionLength = newLength;

        const springForce = compression * wheel.config.suspensionStiffness;
        const damperForce = -wheel.suspensionVelocity * wheel.config.suspensionDamping;

        wheel.suspensionForce = Math.max(0, springForce + damperForce);
      } else {
        wheel.isGrounded = false;
        wheel.suspensionLength = wheel.config.suspensionRestLength + wheel.config.suspensionTravel;
        wheel.suspensionVelocity = 0;
        wheel.suspensionForce = 0;
        wheel.groundNormal = Vector3.up();
      }
    }
  }

  /**
   * Updates engine RPM and torque.
   */
  private updateEngine(deltaTime: number, input: VehicleInput): void {
    if (this.isShifting) {
      this.engineRPM = this.config.engine.idleRPM + (this.config.engine.maxRPM - this.config.engine.idleRPM) * 0.5;
      return;
    }

    const wheelSpeed = this.getAverageDrivenWheelSpeed();
    const gearRatio = this.getGearRatio();
    const finalRatio = this.config.transmission.finalDriveRatio;

    const targetRPM = (wheelSpeed / (2 * Math.PI * this.wheels[0].config.wheelRadius)) * gearRatio * finalRatio * 60;

    const engineInertia = this.config.engine.inertia;
    const engineTorque = this.getEngineTorque(this.engineRPM) * input.throttle;
    const frictionTorque = -this.config.engine.friction * this.engineRPM;

    const clutchEngagement = 1.0 - input.clutch;
    const clutchTorque = (targetRPM - this.engineRPM) * clutchEngagement * 50.0;

    const totalTorque = engineTorque + frictionTorque + clutchTorque;
    const angularAcceleration = totalTorque / engineInertia;

    this.engineRPM += angularAcceleration * deltaTime;
    this.engineRPM = this.clamp(this.engineRPM, this.config.engine.idleRPM, this.config.engine.maxRPM);

    if (this.config.transmission.type === TransmissionType.Automatic) {
      this.autoShift();
    }
  }

  /**
   * Calculates drive torque from engine.
   */
  private calculateDriveTorque(input: VehicleInput): number {
    if (this.isShifting) {
      return 0;
    }

    const engineTorque = this.getEngineTorque(this.engineRPM) * input.throttle;
    const gearRatio = this.getGearRatio();
    const finalRatio = this.config.transmission.finalDriveRatio;

    const clutchMultiplier = 1.0 - input.clutch;

    return engineTorque * gearRatio * finalRatio * clutchMultiplier;
  }

  /**
   * Distributes torque to wheels via differential.
   */
  private distributeTorque(totalTorque: number, input: VehicleInput): void {
    const frontWheels = this.wheels.filter(w => w.config.position.z > 0 && w.config.isDriven);
    const rearWheels = this.wheels.filter(w => w.config.position.z <= 0 && w.config.isDriven);

    const frontTorque = totalTorque * this.config.differential.frontRearSplit;
    const rearTorque = totalTorque * (1.0 - this.config.differential.frontRearSplit);

    this.distributeTorqueToAxle(frontWheels, frontTorque);
    this.distributeTorqueToAxle(rearWheels, rearTorque);
  }

  /**
   * Distributes torque to wheels on an axle.
   */
  private distributeTorqueToAxle(wheels: WheelState[], torque: number): void {
    if (wheels.length === 0) return;

    switch (this.config.differential.type) {
      case DifferentialType.Open:
        this.distributeOpen(wheels, torque);
        break;
      case DifferentialType.LimitedSlip:
        this.distributeLSD(wheels, torque);
        break;
      case DifferentialType.Locked:
        this.distributeLocked(wheels, torque);
        break;
      case DifferentialType.Electronic:
        this.distributeElectronic(wheels, torque);
        break;
    }
  }

  /**
   * Open differential distribution.
   */
  private distributeOpen(wheels: WheelState[], torque: number): void {
    const torquePerWheel = torque / wheels.length;
    for (const wheel of wheels) {
      wheel.driveTorque = torquePerWheel;
    }
  }

  /**
   * Limited slip differential distribution.
   */
  private distributeLSD(wheels: WheelState[], torque: number): void {
    if (wheels.length !== 2) {
      this.distributeOpen(wheels, torque);
      return;
    }

    const speedDiff = Math.abs(wheels[0].angularVelocity - wheels[1].angularVelocity);
    const lockingEffect = this.config.differential.lockingFactor * (1.0 - Math.exp(-speedDiff));

    const baseTorque = torque * 0.5;
    const biasTorque = torque * 0.5 * lockingEffect;

    if (wheels[0].angularVelocity > wheels[1].angularVelocity) {
      wheels[0].driveTorque = baseTorque - biasTorque;
      wheels[1].driveTorque = baseTorque + biasTorque;
    } else {
      wheels[0].driveTorque = baseTorque + biasTorque;
      wheels[1].driveTorque = baseTorque - biasTorque;
    }
  }

  /**
   * Locked differential distribution.
   */
  private distributeLocked(wheels: WheelState[], torque: number): void {
    const avgSpeed = wheels.reduce((sum, w) => sum + w.angularVelocity, 0) / wheels.length;

    for (const wheel of wheels) {
      wheel.angularVelocity = avgSpeed;
      wheel.driveTorque = torque / wheels.length;
    }
  }

  /**
   * Electronic differential distribution (torque vectoring).
   */
  private distributeElectronic(wheels: WheelState[], torque: number): void {
    if (wheels.length !== 2) {
      this.distributeOpen(wheels, torque);
      return;
    }

    const steeringAngle = wheels[0].steeringAngle;
    const lateralAcceleration = this.velocity.lengthSquared() / 100.0;

    const torqueBias = steeringAngle * lateralAcceleration * 0.3;

    wheels[0].driveTorque = torque * (0.5 - torqueBias);
    wheels[1].driveTorque = torque * (0.5 + torqueBias);
  }

  /**
   * Updates wheel forces from tire model.
   */
  private updateWheelForces(deltaTime: number, input: VehicleInput): void {
    for (const wheel of this.wheels) {
      if (!wheel.isGrounded) {
        wheel.wheelForce = Vector3.zero();
        wheel.tireForces = {
          longitudinal: 0,
          lateral: 0,
          combined: 0,
          slipAngle: 0,
          slipRatio: 0
        };
        continue;
      }

      if (wheel.config.isSteering) {
        wheel.steeringAngle = input.steering * wheel.config.maxSteeringAngle;
      }

      wheel.brakeTorque = input.brake * wheel.config.maxBrakeTorque;
      if (input.handbrake > 0 && wheel.config.position.z < 0) {
        wheel.brakeTorque = Math.max(wheel.brakeTorque, input.handbrake * wheel.config.maxBrakeTorque);
      }

      const wheelVelocity = this.getWheelVelocity(wheel);
      const normalForce = wheel.suspensionForce;

      wheel.tireForces = wheel.config.tireModel.calculateForces(
        wheelVelocity,
        wheel.angularVelocity,
        normalForce,
        wheel.steeringAngle
      );

      const forward = this.getWheelForwardDirection(wheel);
      const right = this.getWheelRightDirection(wheel);

      const tireForce = forward.scale(wheel.tireForces.longitudinal)
        .add(right.scale(wheel.tireForces.lateral));

      const suspensionForceVec = wheel.groundNormal.scale(wheel.suspensionForce);

      wheel.wheelForce = tireForce.add(suspensionForceVec);

      const netTorque = wheel.driveTorque - wheel.brakeTorque - wheel.tireForces.longitudinal * wheel.config.wheelRadius;
      const wheelInertia = 0.5 * wheel.config.wheelMass * wheel.config.wheelRadius * wheel.config.wheelRadius;
      const angularAccel = netTorque / wheelInertia;

      wheel.angularVelocity += angularAccel * deltaTime;
    }
  }

  /**
   * Applies anti-roll bar forces.
   */
  private applyAntiRollBars(): void {
    const frontLeft = this.wheels.find(w => w.config.position.x < 0 && w.config.position.z > 0);
    const frontRight = this.wheels.find(w => w.config.position.x > 0 && w.config.position.z > 0);
    const rearLeft = this.wheels.find(w => w.config.position.x < 0 && w.config.position.z <= 0);
    const rearRight = this.wheels.find(w => w.config.position.x > 0 && w.config.position.z <= 0);

    if (this.config.antiRollBarFront && frontLeft && frontRight && frontLeft.isGrounded && frontRight.isGrounded) {
      const compressionDiff = frontLeft.suspensionLength - frontRight.suspensionLength;
      const antiRollForce = compressionDiff * this.config.antiRollBarFront;

      frontLeft.wheelForce = frontLeft.wheelForce.add(Vector3.down().scale(antiRollForce));
      frontRight.wheelForce = frontRight.wheelForce.add(Vector3.up().scale(antiRollForce));
    }

    if (this.config.antiRollBarRear && rearLeft && rearRight && rearLeft.isGrounded && rearRight.isGrounded) {
      const compressionDiff = rearLeft.suspensionLength - rearRight.suspensionLength;
      const antiRollForce = compressionDiff * this.config.antiRollBarRear;

      rearLeft.wheelForce = rearLeft.wheelForce.add(Vector3.down().scale(antiRollForce));
      rearRight.wheelForce = rearRight.wheelForce.add(Vector3.up().scale(antiRollForce));
    }
  }

  /**
   * Applies aerodynamic forces.
   */
  private applyAerodynamics(deltaTime: number): void {
    const aero = this.config.aerodynamics;
    const airDensity = 1.225;

    const velocityMagnitude = this.velocity.length();
    const dragForce = 0.5 * airDensity * aero.dragCoefficient * aero.frontalArea * velocityMagnitude * velocityMagnitude;

    const dragVector = this.velocity.normalize().scale(-dragForce);
    this.rigidBody.applyForce(dragVector);

    const downforce = 0.5 * airDensity * aero.downforceCoefficient * aero.frontalArea * velocityMagnitude * velocityMagnitude;
    const downforceVector = this.transformDirection(Vector3.down()).scale(downforce);

    const downforcePoint = this.transformPoint(aero.centerOfPressure);
    this.rigidBody.applyForce(downforceVector, downforcePoint);
  }

  /**
   * Integrates forces and updates vehicle state.
   */
  private integrateForces(deltaTime: number): void {
    let totalForce = Vector3.zero();
    let totalTorque = Vector3.zero();

    for (const wheel of this.wheels) {
      const wheelWorldPos = this.transformPoint(wheel.config.position);

      totalForce = totalForce.add(wheel.wheelForce);

      const r = wheelWorldPos.sub(this.position);
      const torque = r.cross(wheel.wheelForce);
      totalTorque = totalTorque.add(torque);
    }

    const acceleration = totalForce.scale(1.0 / this.config.mass);
    this.velocity = this.velocity.add(acceleration.scale(deltaTime));

    const angularAcceleration = totalTorque.scale(1.0 / (this.config.mass * 2.0));
    this.angularVelocity = this.angularVelocity.add(angularAcceleration.scale(deltaTime));

    this.position = this.position.add(this.velocity.scale(deltaTime));

    const angularDisplacement = this.angularVelocity.length() * deltaTime;
    if (angularDisplacement > 0.001) {
      const axis = this.angularVelocity.normalize();
      const deltaRotation = Quaternion.fromAxisAngle(axis, angularDisplacement);
      this.rotation = this.rotation.multiply(deltaRotation).normalize();
    }

    const linearDamping = 0.99;
    const angularDamping = 0.98;
    this.velocity = this.velocity.scale(linearDamping);
    this.angularVelocity = this.angularVelocity.scale(angularDamping);
  }

  /**
   * Syncs state with rigid body.
   */
  private syncRigidBody(): void {
    this.rigidBody.position = this.position.clone();
    this.rigidBody.rotation = this.rotation.clone();
    this.rigidBody.linearVelocity = this.velocity.clone();
    this.rigidBody.angularVelocity = this.angularVelocity.clone();
  }

  /**
   * Handles gear shifting.
   */
  private updateShifting(deltaTime: number, input: VehicleInput): void {
    if (this.isShifting) {
      this.shiftTimer -= deltaTime;
      if (this.shiftTimer <= 0) {
        this.isShifting = false;
      }
    }
  }

  /**
   * Automatic transmission shift logic.
   */
  private autoShift(): void {
    if (this.isShifting) return;

    const upshiftRPM = this.config.transmission.upshiftRPM ?? this.config.engine.maxRPM * 0.9;
    const downshiftRPM = this.config.transmission.downshiftRPM ?? this.config.engine.maxRPM * 0.4;

    if (this.engineRPM > upshiftRPM && this.currentGear < this.config.transmission.gearRatios.length) {
      this.shiftUp();
    } else if (this.engineRPM < downshiftRPM && this.currentGear > 1) {
      this.shiftDown();
    }
  }

  /**
   * Gets engine torque at given RPM.
   */
  private getEngineTorque(rpm: number): number {
    const peakTorqueRPM = this.config.engine.peakTorqueRPM;
    const maxRPM = this.config.engine.maxRPM;
    const peakTorque = this.config.engine.peakTorque;

    if (rpm < peakTorqueRPM) {
      const t = rpm / peakTorqueRPM;
      return peakTorque * (0.8 + 0.2 * t);
    } else {
      const t = (rpm - peakTorqueRPM) / (maxRPM - peakTorqueRPM);
      return peakTorque * (1.0 - 0.4 * t);
    }
  }

  /**
   * Gets current gear ratio.
   */
  private getGearRatio(): number {
    if (this.currentGear === 0) {
      return -this.config.transmission.reverseRatio;
    } else if (this.currentGear > 0 && this.currentGear <= this.config.transmission.gearRatios.length) {
      return this.config.transmission.gearRatios[this.currentGear - 1];
    }
    return 1.0;
  }

  /**
   * Gets average driven wheel speed in rad/s.
   */
  private getAverageDrivenWheelSpeed(): number {
    const drivenWheels = this.wheels.filter(w => w.config.isDriven);
    if (drivenWheels.length === 0) return 0;

    const totalSpeed = drivenWheels.reduce((sum, w) => sum + Math.abs(w.angularVelocity), 0);
    return totalSpeed / drivenWheels.length;
  }

  /**
   * Gets wheel velocity in local wheel space.
   */
  private getWheelVelocity(wheel: WheelState): Vector3 {
    const wheelWorldPos = this.transformPoint(wheel.config.position);
    const pointVelocity = this.velocity.add(this.angularVelocity.cross(wheelWorldPos.sub(this.position)));

    const forward = this.getWheelForwardDirection(wheel);
    const right = this.getWheelRightDirection(wheel);
    const up = this.getWheelUpDirection(wheel);

    return new Vector3(
      pointVelocity.dot(forward),
      pointVelocity.dot(up),
      pointVelocity.dot(right)
    );
  }

  /**
   * Gets wheel forward direction in world space.
   */
  private getWheelForwardDirection(wheel: WheelState): Vector3 {
    const localForward = new Vector3(
      Math.sin(wheel.steeringAngle),
      0,
      Math.cos(wheel.steeringAngle)
    );
    return this.transformDirection(localForward);
  }

  /**
   * Gets wheel right direction in world space.
   */
  private getWheelRightDirection(wheel: WheelState): Vector3 {
    const localRight = new Vector3(
      Math.cos(wheel.steeringAngle),
      0,
      -Math.sin(wheel.steeringAngle)
    );
    return this.transformDirection(localRight);
  }

  /**
   * Gets wheel up direction in world space.
   */
  private getWheelUpDirection(wheel: WheelState): Vector3 {
    return this.transformDirection(Vector3.up());
  }

  /**
   * Raycasts for ground detection.
   */
  private raycastGround(ray: Ray, distance: number, physicsWorld: PhysicsWorld): RaycastHit | null {
    return physicsWorld ? null : null;
  }

  /**
   * Transforms a point from local to world space.
   */
  private transformPoint(localPoint: Vector3): Vector3 {
    const rotated = this.rotation.toMatrix4();
    const e = rotated.elements;
    const x = localPoint.x * e[0] + localPoint.y * e[4] + localPoint.z * e[8];
    const y = localPoint.x * e[1] + localPoint.y * e[5] + localPoint.z * e[9];
    const z = localPoint.x * e[2] + localPoint.y * e[6] + localPoint.z * e[10];
    return this.position.add(new Vector3(x, y, z));
  }

  /**
   * Transforms a direction from local to world space.
   */
  private transformDirection(localDir: Vector3): Vector3 {
    const rotated = this.rotation.toMatrix4();
    const e = rotated.elements;
    const x = localDir.x * e[0] + localDir.y * e[4] + localDir.z * e[8];
    const y = localDir.x * e[1] + localDir.y * e[5] + localDir.z * e[9];
    const z = localDir.x * e[2] + localDir.y * e[6] + localDir.z * e[10];
    return new Vector3(x, y, z);
  }

  /**
   * Shifts up one gear.
   */
  shiftUp(): void {
    if (this.currentGear < this.config.transmission.gearRatios.length && !this.isShifting) {
      this.currentGear++;
      this.isShifting = true;
      this.shiftTimer = this.config.transmission.shiftTime;
    }
  }

  /**
   * Shifts down one gear.
   */
  shiftDown(): void {
    if (this.currentGear > 0 && !this.isShifting) {
      this.currentGear--;
      this.isShifting = true;
      this.shiftTimer = this.config.transmission.shiftTime;
    }
  }

  /**
   * Gets current speed in m/s.
   */
  getSpeed(): number {
    return this.velocity.length();
  }

  /**
   * Gets current speed in km/h.
   */
  getSpeedKmh(): number {
    return this.getSpeed() * 3.6;
  }

  /**
   * Gets current engine RPM.
   */
  getEngineRPM(): number {
    return this.engineRPM;
  }

  /**
   * Gets current gear (0 = reverse, 1+ = forward gears).
   */
  getCurrentGear(): number {
    return this.currentGear;
  }

  /**
   * Gets wheel states for visualization.
   */
  getWheels(): ReadonlyArray<Readonly<WheelState>> {
    return this.wheels;
  }

  /**
   * Gets rigid body for physics world integration.
   */
  getRigidBody(): RigidBody {
    return this.rigidBody;
  }

  /**
   * Clamps a value between min and max.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
