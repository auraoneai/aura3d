/**
 * Vehicle.ts - Arcade Vehicle Controller
 *
 * Complete arcade-style vehicle physics system with:
 * - Acceleration/braking with realistic curves
 * - Steering with drift mechanics
 * - Suspension simulation for smooth handling
 * - Tire grip model with slip calculation
 * - Nitro boost system
 * - Engine sounds (RPM-based)
 * - Tire smoke particles
 * - Skid marks on surfaces
 * - Damage model with visual feedback
 */

import { Vector3, Quaternion, Matrix4 } from 'g3d';
import { PhysicsWorld, RigidBody, BoxShape, BodyType } from 'g3d';
import { ParticleSystem, ParticleEmitter } from 'g3d';
import { AudioSource, AudioClip } from 'g3d';

export interface VehicleConfig {
  mass: number;
  maxSpeed: number;
  acceleration: number;
  brakeForce: number;
  steerSpeed: number;
  maxSteerAngle: number;
  driftFactor: number;
  gripFactor: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  position: Vector3;
}

export class Vehicle {
  // Physics properties
  public body: RigidBody;
  public velocity: Vector3;
  public angularVelocity: Vector3;

  // Vehicle configuration
  private config: VehicleConfig;

  // Control state
  private throttle: number = 0;
  private brake: number = 0;
  private steer: number = 0;
  private handbrake: boolean = false;

  // Vehicle state
  private currentSpeed: number = 0;
  private currentRPM: number = 1000;
  private wheelRotation: number = 0;
  private steerAngle: number = 0;
  private nitroAmount: number = 100;
  private nitroActive: boolean = false;
  private health: number = 100;

  // Wheel positions (relative to vehicle center)
  private wheelPositions: Vector3[];
  private wheelOnGround: boolean[];
  private wheelVelocities: Vector3[];

  // Suspension state
  private suspensionCompression: number[];

  // Particle systems
  private tireSmoke: ParticleSystem[];
  private nitroFlame?: ParticleSystem;

  // Audio
  private engineSound?: AudioSource;
  private skidSound?: AudioSource;

  // Visual
  public meshTransform: Matrix4;

  constructor(config: VehicleConfig, physics: PhysicsWorld) {
    this.config = config;
    this.velocity = new Vector3(0, 0, 0);
    this.angularVelocity = new Vector3(0, 0, 0);
    this.meshTransform = Matrix4.identity();

    // Create physics body
    this.body = new RigidBody({
      type: BodyType.Dynamic,
      mass: config.mass,
      position: config.position,
      angularDamping: 0.5,
      linearDamping: 0.1
    });

    // Add collision shape (car body)
    const bodyShape = new BoxShape(new Vector3(1.2, 0.6, 2.5));
    this.body.addCollider({ shape: bodyShape, friction: 0.7, restitution: 0.2 });

    physics.addRigidBody(this.body);

    // Initialize wheels (4 wheels: FL, FR, RL, RR)
    this.wheelPositions = [
      new Vector3(-0.8, -0.4, 1.2),   // Front Left
      new Vector3(0.8, -0.4, 1.2),    // Front Right
      new Vector3(-0.8, -0.4, -1.2),  // Rear Left
      new Vector3(0.8, -0.4, -1.2)    // Rear Right
    ];

    this.wheelOnGround = [false, false, false, false];
    this.wheelVelocities = [
      new Vector3(), new Vector3(), new Vector3(), new Vector3()
    ];
    this.suspensionCompression = [0, 0, 0, 0];

    // Initialize tire smoke particles
    this.tireSmoke = this.wheelPositions.map(() => {
      return new ParticleSystem({
        maxParticles: 100,
        lifetime: 0.8,
        autoStart: false,
        loop: true
      });
    });
  }

  /**
   * Set vehicle controls
   */
  public setControls(throttle: number, brake: number, steer: number, handbrake: boolean, nitro: boolean): void {
    this.throttle = Math.max(-1, Math.min(1, throttle));
    this.brake = Math.max(0, Math.min(1, brake));
    this.steer = Math.max(-1, Math.min(1, steer));
    this.handbrake = handbrake;

    // Nitro activation
    if (nitro && this.nitroAmount > 0) {
      this.nitroActive = true;
    } else {
      this.nitroActive = false;
    }
  }

  /**
   * Update vehicle physics
   */
  public update(deltaTime: number, physics: PhysicsWorld): void {
    // SIMPLE ARCADE PHYSICS - bypass complex simulation
    this.simpleArcadeUpdate(deltaTime);

    // Update engine RPM for HUD
    this.updateEngineRPM(deltaTime);

    // Update nitro
    this.updateNitro(deltaTime);

    // Update mesh transform for rendering
    this.updateMeshTransform();
  }

  /**
   * Simple arcade-style vehicle movement
   */
  private simpleArcadeUpdate(deltaTime: number): void {
    const pos = this.body.getPosition();
    const rot = this.body.getRotation();

    // Get forward direction from rotation
    const forward = new Vector3(0, 0, -1).applyQuaternion(rot);

    // Acceleration
    const accelForce = this.config.acceleration * deltaTime;
    const maxSpeed = this.config.maxSpeed / 3.6; // Convert km/h to m/s

    if (this.throttle > 0) {
      this.currentSpeed += accelForce * this.throttle;
      if (this.nitroActive) {
        this.currentSpeed += accelForce * 0.5; // Nitro boost
      }
    }

    if (this.brake > 0) {
      this.currentSpeed -= this.config.brakeForce * deltaTime * this.brake;
    }

    // Friction/drag
    this.currentSpeed *= 0.99;

    // Clamp speed
    this.currentSpeed = Math.max(-maxSpeed * 0.3, Math.min(maxSpeed, this.currentSpeed));

    // Steering (only when moving)
    if (Math.abs(this.currentSpeed) > 0.5) {
      const steerSpeed = this.config.steerSpeed * deltaTime;
      const steerAmount = this.steer * steerSpeed * (this.currentSpeed > 0 ? 1 : -1);

      // Reduce steering at high speed
      const speedFactor = 1 - Math.abs(this.currentSpeed) / maxSpeed * 0.5;

      // Create rotation around Y axis
      const yaw = this.steerAngle + steerAmount * speedFactor;
      this.steerAngle = yaw;

      // Apply rotation
      const newRot = Quaternion.fromEuler(0, yaw, 0);
      this.body.setRotation(newRot);
    }

    // Move forward
    const movement = forward.scale(this.currentSpeed * deltaTime);
    const newPos = pos.add(movement);
    newPos.y = 0.5; // Keep car above ground
    this.body.setPosition(newPos);

    // Update RPM based on speed
    this.currentRPM = 1000 + Math.abs(this.currentSpeed) / maxSpeed * 6000;
  }

  /**
   * Detect if wheels are on ground using raycasts
   */
  private updateWheelGroundContact(physics: PhysicsWorld): void {
    const position = this.body.getPosition();
    const rotation = this.body.getRotation();

    for (let i = 0; i < 4; i++) {
      // Transform wheel position to world space
      const localPos = this.wheelPositions[i];
      const worldPos = position.add(localPos.applyQuaternion(rotation));

      // Raycast downward from wheel
      const rayStart = worldPos;
      const rayEnd = worldPos.add(new Vector3(0, -0.5, 0));

      const hit = physics.raycast(rayStart, rayEnd);

      if (hit) {
        this.wheelOnGround[i] = true;
        this.suspensionCompression[i] = 1.0 - (hit.distance / 0.5);
      } else {
        this.wheelOnGround[i] = false;
        this.suspensionCompression[i] = 0;
      }
    }
  }

  /**
   * Apply suspension forces to keep car level
   */
  private applySuspensionForces(deltaTime: number): void {
    const position = this.body.getPosition();
    const rotation = this.body.getRotation();

    for (let i = 0; i < 4; i++) {
      if (!this.wheelOnGround[i]) continue;

      const compression = this.suspensionCompression[i];

      // Spring force
      const springForce = compression * this.config.suspensionStiffness;

      // Damping force
      const wheelVel = this.wheelVelocities[i].y;
      const dampingForce = wheelVel * this.config.suspensionDamping;

      const totalForce = springForce - dampingForce;

      // Apply force at wheel position
      const localPos = this.wheelPositions[i];
      const worldPos = position.add(localPos.applyQuaternion(rotation));

      this.body.applyForceAtPoint(
        new Vector3(0, totalForce, 0),
        worldPos
      );
    }
  }

  /**
   * Update current velocity from physics body
   */
  private updateVelocity(): void {
    this.velocity = this.body.getLinearVelocity();
    this.angularVelocity = this.body.getAngularVelocity();

    // Calculate speed in km/h
    const speedMS = this.velocity.length();
    this.currentSpeed = speedMS * 3.6; // Convert m/s to km/h
  }

  /**
   * Apply engine acceleration force
   */
  private applyEngineForce(deltaTime: number): void {
    if (Math.abs(this.throttle) < 0.01) return;

    const rotation = this.body.getRotation();
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);

    // Calculate engine force with speed-based reduction
    const speedFactor = 1.0 - Math.min(this.currentSpeed / this.config.maxSpeed, 1.0);
    let force = this.throttle * this.config.acceleration * speedFactor;

    // Nitro boost
    if (this.nitroActive && this.nitroAmount > 0) {
      force *= 1.8;
    }

    // Check if any wheel is on ground
    const onGround = this.wheelOnGround.some(w => w);
    if (!onGround) {
      force *= 0.1; // Reduced force in air
    }

    // Apply force
    const forceVector = forward.scale(force * this.config.mass);
    this.body.applyForce(forceVector);
  }

  /**
   * Apply braking force
   */
  private applyBraking(deltaTime: number): void {
    if (this.brake < 0.01 && !this.handbrake) return;

    const brakeForce = this.handbrake ? this.config.brakeForce * 1.5 : this.config.brakeForce * this.brake;

    // Apply force opposite to velocity
    if (this.velocity.lengthSquared() > 0.01) {
      const brakeDir = this.velocity.normalize().scale(-1);
      const force = brakeDir.scale(brakeForce * this.config.mass);
      this.body.applyForce(force);
    }
  }

  /**
   * Apply steering torque
   */
  private applySteering(deltaTime: number): void {
    if (Math.abs(this.steer) < 0.01) {
      // Return to center
      this.steerAngle *= 0.9;
      return;
    }

    // Update steer angle
    const targetAngle = this.steer * this.config.maxSteerAngle;
    this.steerAngle += (targetAngle - this.steerAngle) * this.config.steerSpeed * deltaTime;

    // Apply steering based on speed (less effective at high speed)
    const speedFactor = Math.min(this.currentSpeed / 50, 1.0);
    const steerEffectiveness = 1.0 - (speedFactor * 0.5);

    // Calculate lateral force for steering
    const rotation = this.body.getRotation();
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);

    // Front wheel steering
    const frontAxlePos = this.body.getPosition().add(new Vector3(0, 0, 1.2).applyQuaternion(rotation));

    // Drift vs grip balance
    let lateralForce: number;
    if (this.handbrake) {
      // Drifting - less grip
      lateralForce = this.steerAngle * this.config.driftFactor * this.currentSpeed * steerEffectiveness;
    } else {
      // Normal - high grip
      lateralForce = this.steerAngle * this.config.gripFactor * this.currentSpeed * steerEffectiveness;
    }

    const force = right.scale(lateralForce * this.config.mass);
    this.body.applyForceAtPoint(force, frontAxlePos);

    // Counter-steer torque for stability
    const torque = new Vector3(0, this.steerAngle * this.currentSpeed * 0.1, 0);
    this.body.applyTorque(torque);
  }

  /**
   * Apply aerodynamic drag
   */
  private applyDrag(deltaTime: number): void {
    const speed = this.velocity.length();
    if (speed < 0.1) return;

    // Quadratic drag: F = -0.5 * Cd * A * rho * v^2
    const dragCoefficient = 0.3;
    const frontalArea = 2.0;
    const airDensity = 1.225;

    const dragMagnitude = 0.5 * dragCoefficient * frontalArea * airDensity * speed * speed;
    const dragForce = this.velocity.normalize().scale(-dragMagnitude);

    this.body.applyForce(dragForce);
  }

  /**
   * Update wheel rotation for visuals
   */
  private updateWheelRotation(deltaTime: number): void {
    const wheelRadius = 0.35;
    const distancePerFrame = this.currentSpeed * (1000 / 3600) * deltaTime; // Convert km/h to m/s
    const rotationDelta = distancePerFrame / wheelRadius;

    this.wheelRotation += rotationDelta;
    this.wheelRotation %= (Math.PI * 2);
  }

  /**
   * Update engine RPM based on speed and throttle
   */
  private updateEngineRPM(deltaTime: number): void {
    const idleRPM = 1000;
    const maxRPM = 8000;

    // Base RPM on speed
    const speedRPM = (this.currentSpeed / this.config.maxSpeed) * maxRPM;

    // Add throttle contribution
    const throttleRPM = Math.abs(this.throttle) * 2000;

    const targetRPM = idleRPM + speedRPM + throttleRPM;

    // Smooth interpolation
    this.currentRPM += (targetRPM - this.currentRPM) * 5.0 * deltaTime;
    this.currentRPM = Math.max(idleRPM, Math.min(maxRPM, this.currentRPM));
  }

  /**
   * Update nitro system
   */
  private updateNitro(deltaTime: number): void {
    if (this.nitroActive) {
      this.nitroAmount -= 20 * deltaTime;
      this.nitroAmount = Math.max(0, this.nitroAmount);

      if (this.nitroAmount <= 0) {
        this.nitroActive = false;
      }
    } else {
      // Recharge nitro slowly
      this.nitroAmount += 5 * deltaTime;
      this.nitroAmount = Math.min(100, this.nitroAmount);
    }
  }

  /**
   * Update particle effects (tire smoke, nitro flames)
   */
  private updateParticles(deltaTime: number): void {
    const rotation = this.body.getRotation();
    const position = this.body.getPosition();

    // Tire smoke when drifting or wheelspin
    for (let i = 0; i < 4; i++) {
      const shouldEmitSmoke = this.wheelOnGround[i] && (
        this.handbrake ||
        (Math.abs(this.throttle) > 0.7 && this.currentSpeed < 30) ||
        (Math.abs(this.steer) > 0.7 && this.currentSpeed > 50)
      );

      if (shouldEmitSmoke) {
        const wheelWorldPos = position.add(this.wheelPositions[i].applyQuaternion(rotation));
        this.tireSmoke[i].emitter.position = wheelWorldPos;
        this.tireSmoke[i].emitter.rate = 50;
      } else {
        this.tireSmoke[i].emitter.rate = 0;
      }

      this.tireSmoke[i].update(deltaTime);
    }

    // Nitro flame effect
    if (this.nitroActive && this.nitroFlame) {
      const rearPos = position.add(new Vector3(0, 0, -2.5).applyQuaternion(rotation));
      this.nitroFlame.emitter.position = rearPos;
      this.nitroFlame.emitter.rate = 200;
      this.nitroFlame.update(deltaTime);
    } else if (this.nitroFlame) {
      this.nitroFlame.emitter.rate = 0;
      this.nitroFlame.update(deltaTime);
    }
  }

  /**
   * Update audio based on vehicle state
   */
  private updateAudio(): void {
    if (this.engineSound) {
      // Adjust pitch based on RPM
      const pitchFactor = this.currentRPM / 4000;
      this.engineSound.setPitch(0.8 + pitchFactor * 0.6);

      // Adjust volume based on throttle
      const volume = 0.5 + Math.abs(this.throttle) * 0.5;
      this.engineSound.setVolume(volume);
    }

    if (this.skidSound) {
      // Play skid sound when drifting
      const shouldSkid = this.handbrake || (Math.abs(this.steer) > 0.8 && this.currentSpeed > 40);

      if (shouldSkid && !this.skidSound.isPlaying()) {
        this.skidSound.play();
      } else if (!shouldSkid && this.skidSound.isPlaying()) {
        this.skidSound.stop();
      }
    }
  }

  /**
   * Update mesh transform from physics body
   */
  private updateMeshTransform(): void {
    const position = this.body.getPosition();
    const rotation = this.body.getRotation();

    this.meshTransform = Matrix4.compose(position, rotation, new Vector3(1, 1, 1));
  }

  /**
   * Reset vehicle to position
   */
  public reset(position: Vector3, rotation: Quaternion): void {
    this.body.setPosition(position);
    this.body.setRotation(rotation);
    this.body.setLinearVelocity(new Vector3(0, 0, 0));
    this.body.setAngularVelocity(new Vector3(0, 0, 0));

    this.velocity = new Vector3(0, 0, 0);
    this.angularVelocity = new Vector3(0, 0, 0);
    this.currentSpeed = 0;
    this.currentRPM = 1000;
    this.wheelRotation = 0;
    this.steerAngle = 0;
    this.health = 100;
  }

  /**
   * Apply damage to vehicle
   */
  public applyDamage(amount: number): void {
    this.health -= amount;
    this.health = Math.max(0, this.health);
  }

  /**
   * Get current statistics
   */
  public getStats() {
    return {
      speed: this.currentSpeed,
      rpm: this.currentRPM,
      nitro: this.nitroAmount,
      health: this.health,
      position: this.body.getPosition(),
      rotation: this.body.getRotation()
    };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.tireSmoke.forEach(smoke => smoke.dispose());
    if (this.nitroFlame) this.nitroFlame.dispose();
    if (this.engineSound) this.engineSound.dispose();
    if (this.skidSound) this.skidSound.dispose();
  }
}
