/**
 * Platform - Multiple platform types for platformer gameplay
 *
 * Platform Types:
 * - StaticPlatform: Fixed platform
 * - MovingPlatform: Moves along a path
 * - RotatingPlatform: Rotates around axis
 * - FallingPlatform: Falls after player steps on it
 * - BouncyPlatform: Bounces player upward
 * - DisappearingPlatform: Disappears and reappears on timer
 */

import { Vector3 } from 'g3d';
import { Quaternion } from 'g3d';
import { PhysicsWorld } from 'g3d';
import { RigidBody, BodyType } from 'g3d';
import { BoxShape } from 'g3d';

/**
 * Platform type enumeration
 */
export enum PlatformType {
  Static = 'static',
  Moving = 'moving',
  Rotating = 'rotating',
  Falling = 'falling',
  Bouncy = 'bouncy',
  Disappearing = 'disappearing'
}

/**
 * Base platform class
 */
export abstract class Platform {
  protected physicsWorld: PhysicsWorld;
  protected rigidBody: RigidBody;
  public position: Vector3;
  public rotation: Quaternion;
  public size: Vector3;
  public type: PlatformType;

  constructor(
    physicsWorld: PhysicsWorld,
    position: Vector3,
    size: Vector3,
    type: PlatformType
  ) {
    this.physicsWorld = physicsWorld;
    this.position = position.clone();
    this.rotation = Quaternion.identity();
    this.size = size.clone();
    this.type = type;

    this.rigidBody = new RigidBody({
      type: BodyType.Static,
      position: this.position,
      rotation: this.rotation,
      mass: 0
    });

    const boxShape = new BoxShape(this.size);
    this.rigidBody.addCollider(boxShape);

    this.physicsWorld.addRigidBody(this.rigidBody);
  }

  abstract update(dt: number): void;

  destroy(): void {
    this.physicsWorld.removeRigidBody(this.rigidBody);
  }
}

/**
 * Static platform - doesn't move
 */
export class StaticPlatform extends Platform {
  constructor(physicsWorld: PhysicsWorld, position: Vector3, size: Vector3) {
    super(physicsWorld, position, size, PlatformType.Static);
  }

  update(dt: number): void {
    // Static platforms don't update
  }
}

/**
 * Moving platform - moves along a path
 */
export class MovingPlatform extends Platform {
  private waypoints: Vector3[];
  private currentWaypointIndex: number = 0;
  private speed: number = 2.0;
  private isReversing: boolean = false;
  private loopPath: boolean = true;

  constructor(
    physicsWorld: PhysicsWorld,
    startPosition: Vector3,
    size: Vector3,
    waypoints: Vector3[],
    speed: number = 2.0,
    loopPath: boolean = true
  ) {
    super(physicsWorld, startPosition, size, PlatformType.Moving);

    this.waypoints = [startPosition.clone(), ...waypoints];
    this.speed = speed;
    this.loopPath = loopPath;

    this.rigidBody.type = BodyType.Kinematic;
  }

  update(dt: number): void {
    if (this.waypoints.length < 2) {
      return;
    }

    const targetWaypoint = this.waypoints[this.currentWaypointIndex];
    const direction = targetWaypoint.sub(this.position);
    const distance = direction.length();

    if (distance < 0.1) {
      this.advanceWaypoint();
      return;
    }

    const moveAmount = Math.min(this.speed * dt, distance);
    const movement = direction.normalize().scale(moveAmount);

    this.position = this.position.add(movement);
    this.rigidBody.position = this.position.clone();
  }

  private advanceWaypoint(): void {
    if (this.loopPath) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
    } else {
      if (!this.isReversing) {
        this.currentWaypointIndex++;
        if (this.currentWaypointIndex >= this.waypoints.length) {
          this.currentWaypointIndex = this.waypoints.length - 2;
          this.isReversing = true;
        }
      } else {
        this.currentWaypointIndex--;
        if (this.currentWaypointIndex < 0) {
          this.currentWaypointIndex = 1;
          this.isReversing = false;
        }
      }
    }
  }
}

/**
 * Rotating platform - rotates around an axis
 */
export class RotatingPlatform extends Platform {
  private rotationAxis: Vector3;
  private rotationSpeed: number;
  private currentAngle: number = 0;

  constructor(
    physicsWorld: PhysicsWorld,
    position: Vector3,
    size: Vector3,
    rotationAxis: Vector3 = new Vector3(0, 1, 0),
    rotationSpeed: number = 1.0
  ) {
    super(physicsWorld, position, size, PlatformType.Rotating);

    this.rotationAxis = rotationAxis.normalize();
    this.rotationSpeed = rotationSpeed;

    this.rigidBody.type = BodyType.Kinematic;
  }

  update(dt: number): void {
    this.currentAngle += this.rotationSpeed * dt;

    this.rotation = Quaternion.fromAxisAngle(this.rotationAxis, this.currentAngle);
    this.rigidBody.rotation = this.rotation;
  }
}

/**
 * Falling platform - falls after player steps on it
 */
export class FallingPlatform extends Platform {
  private isTriggered: boolean = false;
  private fallDelay: number = 0.5;
  private fallTimer: number = 0;
  private isFalling: boolean = false;
  private resetTime: number = 3.0;
  private resetTimer: number = 0;
  private originalPosition: Vector3;

  constructor(
    physicsWorld: PhysicsWorld,
    position: Vector3,
    size: Vector3,
    fallDelay: number = 0.5
  ) {
    super(physicsWorld, position, size, PlatformType.Falling);

    this.fallDelay = fallDelay;
    this.originalPosition = position.clone();
  }

  update(dt: number): void {
    if (this.isTriggered && !this.isFalling) {
      this.fallTimer += dt;

      if (this.fallTimer >= this.fallDelay) {
        this.startFalling();
      }
    }

    if (this.isFalling) {
      this.position.y -= 10 * dt;
      this.rigidBody.position = this.position.clone();

      this.resetTimer += dt;

      if (this.resetTimer >= this.resetTime) {
        this.reset();
      }
    }
  }

  trigger(): void {
    if (!this.isTriggered) {
      this.isTriggered = true;
      this.fallTimer = 0;
    }
  }

  private startFalling(): void {
    this.isFalling = true;
    this.rigidBody.type = BodyType.Dynamic;
  }

  private reset(): void {
    this.position = this.originalPosition.clone();
    this.rigidBody.position = this.originalPosition.clone();
    this.rigidBody.velocity = new Vector3();
    this.rigidBody.type = BodyType.Static;
    this.isTriggered = false;
    this.isFalling = false;
    this.fallTimer = 0;
    this.resetTimer = 0;
  }
}

/**
 * Bouncy platform - bounces player upward
 */
export class BouncyPlatform extends Platform {
  public bounceForce: number = 20.0;
  private animationTimer: number = 0;
  private isCompressed: boolean = false;
  private compressionAmount: number = 0;

  constructor(
    physicsWorld: PhysicsWorld,
    position: Vector3,
    size: Vector3,
    bounceForce: number = 20.0
  ) {
    super(physicsWorld, position, size, PlatformType.Bouncy);

    this.bounceForce = bounceForce;
  }

  update(dt: number): void {
    if (this.isCompressed) {
      this.animationTimer += dt;

      if (this.animationTimer < 0.1) {
        this.compressionAmount = this.animationTimer / 0.1;
      } else if (this.animationTimer < 0.3) {
        this.compressionAmount = 1.0 - ((this.animationTimer - 0.1) / 0.2);
      } else {
        this.isCompressed = false;
        this.compressionAmount = 0;
        this.animationTimer = 0;
      }
    }
  }

  bounce(): void {
    this.isCompressed = true;
    this.animationTimer = 0;
  }

  getCompressionAmount(): number {
    return this.compressionAmount;
  }
}

/**
 * Disappearing platform - appears and disappears on timer
 */
export class DisappearingPlatform extends Platform {
  private visibleTime: number = 2.0;
  private hiddenTime: number = 1.5;
  private timer: number = 0;
  public isVisible: boolean = true;

  constructor(
    physicsWorld: PhysicsWorld,
    position: Vector3,
    size: Vector3,
    visibleTime: number = 2.0,
    hiddenTime: number = 1.5
  ) {
    super(physicsWorld, position, size, PlatformType.Disappearing);

    this.visibleTime = visibleTime;
    this.hiddenTime = hiddenTime;
  }

  update(dt: number): void {
    this.timer += dt;

    const cycleTime = this.visibleTime + this.hiddenTime;
    const timeInCycle = this.timer % cycleTime;

    const wasVisible = this.isVisible;
    this.isVisible = timeInCycle < this.visibleTime;

    if (wasVisible !== this.isVisible) {
      if (this.isVisible) {
        this.physicsWorld.addRigidBody(this.rigidBody);
      } else {
        this.physicsWorld.removeRigidBody(this.rigidBody);
      }
    }
  }

  getAlpha(): number {
    const cycleTime = this.visibleTime + this.hiddenTime;
    const timeInCycle = this.timer % cycleTime;

    if (!this.isVisible) {
      return 0.2;
    }

    const fadeTime = 0.3;

    if (timeInCycle < fadeTime) {
      return timeInCycle / fadeTime;
    } else if (timeInCycle > this.visibleTime - fadeTime) {
      return 1.0 - ((timeInCycle - (this.visibleTime - fadeTime)) / fadeTime);
    }

    return 1.0;
  }
}
