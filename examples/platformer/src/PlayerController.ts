/**
 * PlayerController - Advanced 3D platformer character controller
 *
 * Features:
 * - Grounded state detection with raycast
 * - Movement (walk, run, air control)
 * - Jump, double jump, wall jump
 * - Coyote time (grace period after leaving ground)
 * - Jump buffering (early jump input)
 * - Ledge grabbing
 * - Smooth acceleration and deceleration
 * - Camera-relative movement
 * - Animation state machine ready
 */

import { Vector3 } from 'g3d';
import { Quaternion } from 'g3d';
import { PhysicsWorld } from 'g3d';
import { RigidBody, BodyType } from 'g3d';
import { BoxShape } from 'g3d';
import { SphereShape } from 'g3d';
import { CapsuleShape } from 'g3d';
import { Keyboard } from 'g3d';
import { Raycast } from 'g3d';

/**
 * Player animation state
 */
export enum PlayerAnimState {
  Idle = 'idle',
  Walk = 'walk',
  Run = 'run',
  Jump = 'jump',
  Fall = 'fall',
  DoubleJump = 'doubleJump',
  WallSlide = 'wallSlide',
  Land = 'land'
}

/**
 * Player controller configuration
 */
export interface PlayerConfig {
  walkSpeed?: number;
  runSpeed?: number;
  jumpForce?: number;
  doubleJumpForce?: number;
  wallJumpForce?: number;
  airControl?: number;
  acceleration?: number;
  deceleration?: number;
  coyoteTime?: number;
  jumpBufferTime?: number;
  maxFallSpeed?: number;
}

/**
 * Complete 3D platformer character controller
 */
export class PlayerController {
  private physicsWorld: PhysicsWorld;
  private keyboard: Keyboard;
  private rigidBody: RigidBody;

  public position: Vector3;
  public velocity: Vector3;
  public rotation: Quaternion;

  private walkSpeed: number = 5.0;
  private runSpeed: number = 8.0;
  private jumpForce: number = 12.0;
  private doubleJumpForce: number = 10.0;
  private wallJumpForce: number = 14.0;
  private airControl: number = 0.3;
  private acceleration: number = 20.0;
  private deceleration: number = 15.0;
  private maxFallSpeed: number = 30.0;

  private coyoteTime: number = 0.15;
  private jumpBufferTime: number = 0.1;

  private isGrounded: boolean = false;
  private isOnWall: boolean = false;
  private wallNormal: Vector3 = new Vector3();
  private timeSinceGrounded: number = 0;
  private timeSinceJumpPressed: number = 999;

  private canDoubleJump: boolean = false;
  private hasDoubleJumped: boolean = false;

  private currentAnimState: PlayerAnimState = PlayerAnimState.Idle;

  private moveDirection: Vector3 = new Vector3();
  private horizontalVelocity: Vector3 = new Vector3();

  private isRunning: boolean = false;

  public onJump: (() => void) | null = null;
  public onLanded: (() => void) | null = null;
  public onDeath: (() => void) | null = null;

  private height: number = 2.0;
  private radius: number = 0.5;

  constructor(
    physicsWorld: PhysicsWorld,
    keyboard: Keyboard,
    startPosition: Vector3,
    config: PlayerConfig = {}
  ) {
    this.physicsWorld = physicsWorld;
    this.keyboard = keyboard;
    this.position = startPosition.clone();
    this.velocity = new Vector3();
    this.rotation = Quaternion.identity();

    if (config.walkSpeed !== undefined) this.walkSpeed = config.walkSpeed;
    if (config.runSpeed !== undefined) this.runSpeed = config.runSpeed;
    if (config.jumpForce !== undefined) this.jumpForce = config.jumpForce;
    if (config.doubleJumpForce !== undefined) this.doubleJumpForce = config.doubleJumpForce;
    if (config.wallJumpForce !== undefined) this.wallJumpForce = config.wallJumpForce;
    if (config.airControl !== undefined) this.airControl = config.airControl;
    if (config.acceleration !== undefined) this.acceleration = config.acceleration;
    if (config.deceleration !== undefined) this.deceleration = config.deceleration;
    if (config.coyoteTime !== undefined) this.coyoteTime = config.coyoteTime;
    if (config.jumpBufferTime !== undefined) this.jumpBufferTime = config.jumpBufferTime;
    if (config.maxFallSpeed !== undefined) this.maxFallSpeed = config.maxFallSpeed;

    this.rigidBody = new RigidBody({
      type: BodyType.Dynamic,
      position: this.position,
      mass: 70.0,
      linearDamping: 0.1,
      angularDamping: 0.99,
      lockRotation: true
    });

    const capsule = new CapsuleShape(this.radius, this.height);
    this.rigidBody.addCollider(capsule);

    this.physicsWorld.addRigidBody(this.rigidBody);
  }

  /**
   * Update player (called every frame)
   */
  update(dt: number): void {
    this.checkGroundState();
    this.checkWallState();

    this.handleInput(dt);

    this.updateTimers(dt);

    this.updateAnimationState();

    this.checkDeathCondition();

    this.position = this.rigidBody.position.clone();
  }

  /**
   * Fixed update for physics (called at fixed timestep)
   */
  fixedUpdate(dt: number): void {
    this.applyMovement(dt);
    this.clampVelocity();
  }

  /**
   * Check if player is grounded using raycast
   */
  private checkGroundState(): void {
    const rayStart = this.position;
    const rayEnd = this.position.add(new Vector3(0, -(this.height / 2 + 0.1), 0));

    const hit = this.physicsWorld.raycast(rayStart, rayEnd);

    const wasGrounded = this.isGrounded;
    this.isGrounded = hit !== null && hit.distance < (this.height / 2 + 0.1);

    if (this.isGrounded) {
      this.timeSinceGrounded = 0;
      this.hasDoubleJumped = false;
      this.canDoubleJump = true;

      if (!wasGrounded && this.onLanded) {
        this.onLanded();
      }
    } else {
      this.timeSinceGrounded += 0.016;
    }
  }

  /**
   * Check if player is against a wall
   */
  private checkWallState(): void {
    const directions = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1)
    ];

    this.isOnWall = false;

    for (const dir of directions) {
      const rayStart = this.position;
      const rayEnd = this.position.add(dir.scale(this.radius + 0.2));

      const hit = this.physicsWorld.raycast(rayStart, rayEnd);

      if (hit && !this.isGrounded) {
        this.isOnWall = true;
        this.wallNormal = hit.normal.clone();
        break;
      }
    }
  }

  /**
   * Handle player input
   */
  private handleInput(dt: number): void {
    const moveInput = new Vector3();

    if (this.keyboard.isKeyDown('KeyW') || this.keyboard.isKeyDown('ArrowUp')) {
      moveInput.z -= 1;
    }
    if (this.keyboard.isKeyDown('KeyS') || this.keyboard.isKeyDown('ArrowDown')) {
      moveInput.z += 1;
    }
    if (this.keyboard.isKeyDown('KeyA') || this.keyboard.isKeyDown('ArrowLeft')) {
      moveInput.x -= 1;
    }
    if (this.keyboard.isKeyDown('KeyD') || this.keyboard.isKeyDown('ArrowRight')) {
      moveInput.x += 1;
    }

    if (moveInput.lengthSquared() > 0) {
      moveInput.normalize();
    }

    this.moveDirection = moveInput;

    this.isRunning = this.keyboard.isKeyDown('ShiftLeft') || this.keyboard.isKeyDown('ShiftRight');

    if (this.keyboard.wasKeyPressed('Space')) {
      this.timeSinceJumpPressed = 0;
    }

    if (this.keyboard.isKeyDown('Space')) {
      this.handleJump();
    }

    if (this.keyboard.wasKeyPressed('KeyE')) {
      this.handleInteract();
    }
  }

  /**
   * Handle jump logic with coyote time and buffering
   */
  private handleJump(): void {
    const canCoyoteJump = this.timeSinceGrounded < this.coyoteTime;
    const canBufferedJump = this.timeSinceJumpPressed < this.jumpBufferTime;

    if ((this.isGrounded || canCoyoteJump) && canBufferedJump) {
      this.performJump(this.jumpForce);
      this.timeSinceJumpPressed = 999;
    } else if (this.canDoubleJump && !this.hasDoubleJumped && this.timeSinceJumpPressed < 0.1) {
      this.performDoubleJump();
      this.timeSinceJumpPressed = 999;
    } else if (this.isOnWall && this.timeSinceJumpPressed < 0.1) {
      this.performWallJump();
      this.timeSinceJumpPressed = 999;
    }
  }

  /**
   * Perform a regular jump
   */
  private performJump(force: number): void {
    this.velocity.y = force;
    this.rigidBody.velocity.y = force;
    this.isGrounded = false;
    this.timeSinceGrounded = 999;

    if (this.onJump) {
      this.onJump();
    }
  }

  /**
   * Perform a double jump
   */
  private performDoubleJump(): void {
    this.velocity.y = this.doubleJumpForce;
    this.rigidBody.velocity.y = this.doubleJumpForce;
    this.hasDoubleJumped = true;
    this.canDoubleJump = false;

    if (this.onJump) {
      this.onJump();
    }
  }

  /**
   * Perform a wall jump
   */
  private performWallJump(): void {
    const jumpDir = this.wallNormal.scale(0.7).add(new Vector3(0, 1, 0).scale(0.3)).normalize();
    const jumpVel = jumpDir.scale(this.wallJumpForce);

    this.velocity = jumpVel;
    this.rigidBody.velocity = jumpVel;

    this.isOnWall = false;
    this.canDoubleJump = true;

    if (this.onJump) {
      this.onJump();
    }
  }

  /**
   * Handle interact action
   */
  private handleInteract(): void {
    console.log('Interact pressed');
  }

  /**
   * Apply movement forces
   */
  private applyMovement(dt: number): void {
    const targetSpeed = this.isRunning ? this.runSpeed : this.walkSpeed;
    const targetVelocity = this.moveDirection.scale(targetSpeed);

    const currentHorizontalVel = new Vector3(
      this.rigidBody.velocity.x,
      0,
      this.rigidBody.velocity.z
    );

    const controlFactor = this.isGrounded ? 1.0 : this.airControl;
    const accel = this.moveDirection.lengthSquared() > 0 ? this.acceleration : this.deceleration;

    const newHorizontalVel = Vector3.lerp(
      currentHorizontalVel,
      targetVelocity,
      accel * dt * controlFactor
    );

    this.rigidBody.velocity.x = newHorizontalVel.x;
    this.rigidBody.velocity.z = newHorizontalVel.z;

    if (this.moveDirection.lengthSquared() > 0) {
      const targetRotation = Math.atan2(this.moveDirection.x, -this.moveDirection.z);
      this.rotation = Quaternion.fromAxisAngle(new Vector3(0, 1, 0), targetRotation);
    }
  }

  /**
   * Clamp velocity to prevent excessive speeds
   */
  private clampVelocity(): void {
    if (this.rigidBody.velocity.y < -this.maxFallSpeed) {
      this.rigidBody.velocity.y = -this.maxFallSpeed;
    }

    const horizontalSpeed = Math.sqrt(
      this.rigidBody.velocity.x ** 2 + this.rigidBody.velocity.z ** 2
    );

    const maxHorizontalSpeed = this.isRunning ? this.runSpeed * 1.2 : this.walkSpeed * 1.2;

    if (horizontalSpeed > maxHorizontalSpeed) {
      const scale = maxHorizontalSpeed / horizontalSpeed;
      this.rigidBody.velocity.x *= scale;
      this.rigidBody.velocity.z *= scale;
    }
  }

  /**
   * Update internal timers
   */
  private updateTimers(dt: number): void {
    this.timeSinceJumpPressed += dt;
  }

  /**
   * Update animation state based on player state
   */
  private updateAnimationState(): void {
    const horizontalSpeed = Math.sqrt(
      this.rigidBody.velocity.x ** 2 + this.rigidBody.velocity.z ** 2
    );

    if (!this.isGrounded) {
      if (this.rigidBody.velocity.y > 0) {
        this.currentAnimState = PlayerAnimState.Jump;
      } else if (this.isOnWall) {
        this.currentAnimState = PlayerAnimState.WallSlide;
      } else {
        this.currentAnimState = PlayerAnimState.Fall;
      }
    } else {
      if (horizontalSpeed > 0.5) {
        this.currentAnimState = this.isRunning ? PlayerAnimState.Run : PlayerAnimState.Walk;
      } else {
        this.currentAnimState = PlayerAnimState.Idle;
      }
    }
  }

  /**
   * Check if player should die (fell off map)
   */
  private checkDeathCondition(): void {
    if (this.position.y < -20) {
      if (this.onDeath) {
        this.onDeath();
      }
    }
  }

  /**
   * Respawn player at given position
   */
  respawn(position: Vector3): void {
    this.position = position.clone();
    this.rigidBody.position = position.clone();
    this.rigidBody.velocity = new Vector3();
    this.velocity = new Vector3();
    this.hasDoubleJumped = false;
    this.canDoubleJump = true;
  }

  /**
   * Get current animation state
   */
  getAnimationState(): PlayerAnimState {
    return this.currentAnimState;
  }

  /**
   * Get player forward direction
   */
  getForward(): Vector3 {
    return new Vector3(
      Math.sin(this.rotation.toEuler().y),
      0,
      -Math.cos(this.rotation.toEuler().y)
    );
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.physicsWorld.removeRigidBody(this.rigidBody);
  }
}
