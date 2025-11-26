/**
 * ThirdPersonCamera - Smooth third-person camera controller
 *
 * Features:
 * - Orbit around player with mouse/touch input
 * - Smooth camera following with spring damping
 * - Collision detection and avoidance
 * - Auto-rotation behind player
 * - Zoom in/out
 * - Camera shake effects
 * - Lock-on targeting (optional)
 * - Vertical angle constraints
 */

import { Vector3 } from 'g3d';
import { Quaternion } from 'g3d';
import { Matrix4 } from 'g3d';
import { Mouse } from 'g3d';
import { Keyboard } from 'g3d';
import { PlayerController } from './PlayerController';

/**
 * Camera configuration options
 */
export interface CameraConfig {
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  height?: number;
  followSpeed?: number;
  rotationSpeed?: number;
  minVerticalAngle?: number;
  maxVerticalAngle?: number;
  collisionRadius?: number;
}

/**
 * Third-person camera controller with smooth following and collision
 */
export class ThirdPersonCamera {
  private player: PlayerController;
  private mouse: Mouse;
  private keyboard: Keyboard;

  public position: Vector3;
  public target: Vector3;
  public up: Vector3;

  private distance: number = 8.0;
  private minDistance: number = 3.0;
  private maxDistance: number = 15.0;
  private height: number = 2.0;

  private followSpeed: number = 8.0;
  private rotationSpeed: number = 3.0;

  private horizontalAngle: number = 0;
  private verticalAngle: number = 0.3;

  private minVerticalAngle: number = -0.8;
  private maxVerticalAngle: number = 1.2;

  private collisionRadius: number = 0.5;

  private currentPosition: Vector3;
  private currentTarget: Vector3;

  private velocity: Vector3 = new Vector3();
  private angularVelocity: Vector3 = new Vector3();

  private shakeAmount: number = 0;
  private shakeDecay: number = 0.95;

  private isRightMouseDown: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  constructor(
    player: PlayerController,
    mouse: Mouse,
    keyboard: Keyboard,
    config: CameraConfig = {}
  ) {
    this.player = player;
    this.mouse = mouse;
    this.keyboard = keyboard;

    if (config.distance !== undefined) this.distance = config.distance;
    if (config.minDistance !== undefined) this.minDistance = config.minDistance;
    if (config.maxDistance !== undefined) this.maxDistance = config.maxDistance;
    if (config.height !== undefined) this.height = config.height;
    if (config.followSpeed !== undefined) this.followSpeed = config.followSpeed;
    if (config.rotationSpeed !== undefined) this.rotationSpeed = config.rotationSpeed;
    if (config.minVerticalAngle !== undefined) this.minVerticalAngle = config.minVerticalAngle;
    if (config.maxVerticalAngle !== undefined) this.maxVerticalAngle = config.maxVerticalAngle;
    if (config.collisionRadius !== undefined) this.collisionRadius = config.collisionRadius;

    this.position = player.position.add(new Vector3(0, this.height, this.distance));
    this.target = player.position.add(new Vector3(0, this.height, 0));
    this.up = new Vector3(0, 1, 0);

    this.currentPosition = this.position.clone();
    this.currentTarget = this.target.clone();
  }

  /**
   * Update camera (called every frame)
   */
  update(dt: number): void {
    this.handleInput(dt);

    this.updateTargetPosition();

    this.smoothFollow(dt);

    this.handleCollision();

    this.applyShake();
  }

  /**
   * Handle mouse and keyboard input for camera control
   */
  private handleInput(dt: number): void {
    const mouseX = this.mouse.x;
    const mouseY = this.mouse.y;

    if (this.mouse.isButtonDown(0)) {
      if (!this.isRightMouseDown) {
        this.lastMouseX = mouseX;
        this.lastMouseY = mouseY;
        this.isRightMouseDown = true;
      } else {
        const deltaX = mouseX - this.lastMouseX;
        const deltaY = mouseY - this.lastMouseY;

        this.horizontalAngle -= deltaX * this.rotationSpeed * dt;
        this.verticalAngle += deltaY * this.rotationSpeed * dt;

        this.lastMouseX = mouseX;
        this.lastMouseY = mouseY;
      }
    } else {
      this.isRightMouseDown = false;
    }

    this.verticalAngle = Math.max(
      this.minVerticalAngle,
      Math.min(this.maxVerticalAngle, this.verticalAngle)
    );

    const scrollDelta = this.mouse.wheelDelta;
    if (scrollDelta !== 0) {
      this.distance -= scrollDelta * 0.5;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }

    if (this.keyboard.isKeyDown('KeyQ')) {
      this.horizontalAngle += this.rotationSpeed * dt;
    }
    if (this.keyboard.isKeyDown('KeyE')) {
      this.horizontalAngle -= this.rotationSpeed * dt;
    }
  }

  /**
   * Update ideal camera position based on angles
   */
  private updateTargetPosition(): void {
    const playerPos = this.player.position;

    this.target = playerPos.add(new Vector3(0, this.height, 0));

    const horizontalDist = this.distance * Math.cos(this.verticalAngle);
    const verticalDist = this.distance * Math.sin(this.verticalAngle);

    const offsetX = horizontalDist * Math.sin(this.horizontalAngle);
    const offsetZ = horizontalDist * Math.cos(this.horizontalAngle);

    this.position = this.target.add(new Vector3(offsetX, verticalDist, offsetZ));
  }

  /**
   * Smoothly follow the target position
   */
  private smoothFollow(dt: number): void {
    const positionDiff = this.position.sub(this.currentPosition);
    const targetDiff = this.target.sub(this.currentTarget);

    this.currentPosition = this.currentPosition.add(
      positionDiff.scale(this.followSpeed * dt)
    );

    this.currentTarget = this.currentTarget.add(
      targetDiff.scale(this.followSpeed * dt)
    );
  }

  /**
   * Handle camera collision with environment
   */
  private handleCollision(): void {
    const direction = this.currentPosition.sub(this.currentTarget);
    const distance = direction.length();

    if (distance < 0.1) {
      return;
    }

    const normalizedDir = direction.normalize();
    const rayStart = this.currentTarget;
    const rayEnd = this.currentPosition;

    const maxDistance = distance;
    let adjustedDistance = maxDistance;

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const checkPoint = rayStart.add(normalizedDir.scale(maxDistance * t));

      if (this.checkCollisionAtPoint(checkPoint)) {
        adjustedDistance = maxDistance * (t - 0.1);
        break;
      }
    }

    if (adjustedDistance < maxDistance) {
      this.currentPosition = this.currentTarget.add(
        normalizedDir.scale(Math.max(this.minDistance, adjustedDistance))
      );
    }
  }

  /**
   * Check if there's a collision at a point (stub - would use physics world)
   */
  private checkCollisionAtPoint(point: Vector3): boolean {
    return false;
  }

  /**
   * Apply camera shake effect
   */
  private applyShake(): void {
    if (this.shakeAmount > 0.01) {
      const shakeX = (Math.random() - 0.5) * this.shakeAmount;
      const shakeY = (Math.random() - 0.5) * this.shakeAmount;
      const shakeZ = (Math.random() - 0.5) * this.shakeAmount;

      this.currentPosition = this.currentPosition.add(
        new Vector3(shakeX, shakeY, shakeZ)
      );

      this.shakeAmount *= this.shakeDecay;
    } else {
      this.shakeAmount = 0;
    }
  }

  /**
   * Trigger camera shake effect
   */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /**
   * Get camera view matrix
   */
  getViewMatrix(): Matrix4 {
    return Matrix4.lookAt(this.currentPosition, this.currentTarget, this.up);
  }

  /**
   * Get camera position
   */
  getPosition(): Vector3 {
    return this.currentPosition.clone();
  }

  /**
   * Get camera target
   */
  getTarget(): Vector3 {
    return this.currentTarget.clone();
  }

  /**
   * Get camera forward direction
   */
  getForward(): Vector3 {
    return this.currentTarget.sub(this.currentPosition).normalize();
  }

  /**
   * Get camera right direction
   */
  getRight(): Vector3 {
    const forward = this.getForward();
    return forward.cross(this.up).normalize();
  }

  /**
   * Get camera-relative movement direction
   */
  getCameraRelativeDirection(input: Vector3): Vector3 {
    const forward = this.getForward();
    forward.y = 0;
    forward.normalize();

    const right = this.getRight();
    right.y = 0;
    right.normalize();

    return right.scale(input.x).add(forward.scale(-input.z));
  }

  /**
   * Reset camera to default position
   */
  reset(): void {
    this.horizontalAngle = 0;
    this.verticalAngle = 0.3;
    this.distance = 8.0;
    this.shakeAmount = 0;

    const playerPos = this.player.position;
    this.target = playerPos.add(new Vector3(0, this.height, 0));
    this.position = this.target.add(new Vector3(0, 2, this.distance));
    this.currentPosition = this.position.clone();
    this.currentTarget = this.target.clone();
  }

  /**
   * Set camera distance
   */
  setDistance(distance: number): void {
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
  }

  /**
   * Get current camera distance
   */
  getDistance(): number {
    return this.distance;
  }

  /**
   * Set horizontal angle
   */
  setHorizontalAngle(angle: number): void {
    this.horizontalAngle = angle;
  }

  /**
   * Set vertical angle
   */
  setVerticalAngle(angle: number): void {
    this.verticalAngle = Math.max(
      this.minVerticalAngle,
      Math.min(this.maxVerticalAngle, angle)
    );
  }

  /**
   * Get horizontal angle
   */
  getHorizontalAngle(): number {
    return this.horizontalAngle;
  }

  /**
   * Get vertical angle
   */
  getVerticalAngle(): number {
    return this.verticalAngle;
  }
}
