/**
 * AIDriver.ts - AI Racing Driver
 *
 * Complete AI racing system with:
 * - Path following along racing line
 * - Rubber-banding for competitive racing
 * - Overtaking logic
 * - Collision avoidance
 * - Difficulty levels (Easy, Medium, Hard)
 */

import { Vector3, Quaternion } from 'g3d';
import { Vehicle } from './Vehicle';
import { Track } from './Track';

export enum AIDifficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard'
}

interface DifficultySettings {
  targetSpeedFactor: number;
  steerSmoothing: number;
  reactionTime: number;
  aggressiveness: number;
  rubberbandStrength: number;
}

export class AIDriver {
  private vehicle: Vehicle;
  private track: Track;
  private difficulty: AIDifficulty;
  private settings: DifficultySettings;

  // Path following
  private currentRacingLineIndex: number = 0;
  private targetPoint: Vector3;
  private lookaheadDistance: number = 20;

  // Control outputs
  private throttleInput: number = 0;
  private brakeInput: number = 0;
  private steerInput: number = 0;

  // State
  private reactionTimer: number = 0;
  private isOvertaking: boolean = false;
  private overtakeTimer: number = 0;

  // Rubber-banding (keeps AI competitive)
  private rubberbandTarget?: Vehicle;

  constructor(vehicle: Vehicle, track: Track, difficulty: AIDifficulty = AIDifficulty.Medium) {
    this.vehicle = vehicle;
    this.track = track;
    this.difficulty = difficulty;
    this.targetPoint = new Vector3();

    // Set difficulty parameters
    this.settings = this.getDifficultySettings(difficulty);
  }

  /**
   * Get difficulty settings
   */
  private getDifficultySettings(difficulty: AIDifficulty): DifficultySettings {
    switch (difficulty) {
      case AIDifficulty.Easy:
        return {
          targetSpeedFactor: 0.7,
          steerSmoothing: 0.3,
          reactionTime: 0.3,
          aggressiveness: 0.3,
          rubberbandStrength: 0.5
        };

      case AIDifficulty.Medium:
        return {
          targetSpeedFactor: 0.85,
          steerSmoothing: 0.5,
          reactionTime: 0.15,
          aggressiveness: 0.6,
          rubberbandStrength: 0.3
        };

      case AIDifficulty.Hard:
        return {
          targetSpeedFactor: 0.95,
          steerSmoothing: 0.7,
          reactionTime: 0.05,
          aggressiveness: 0.9,
          rubberbandStrength: 0.1
        };
    }
  }

  /**
   * Set rubber-band target (usually player vehicle)
   */
  public setRubberbandTarget(target: Vehicle): void {
    this.rubberbandTarget = target;
  }

  /**
   * Update AI driver
   */
  public update(deltaTime: number, otherVehicles: Vehicle[]): void {
    // Update reaction timer
    this.reactionTimer += deltaTime;

    // Only update controls after reaction time
    if (this.reactionTimer < this.settings.reactionTime) {
      return;
    }
    this.reactionTimer = 0;

    // Find current position on racing line
    this.updateRacingLinePosition();

    // Calculate target point with lookahead
    this.updateTargetPoint();

    // Check for obstacles and adjust
    this.checkForObstacles(otherVehicles);

    // Calculate steering
    this.calculateSteering(deltaTime);

    // Calculate throttle and braking
    this.calculateThrottle(deltaTime);

    // Apply rubber-banding
    this.applyRubberBanding();

    // Apply controls to vehicle
    this.vehicle.setControls(
      this.throttleInput,
      this.brakeInput,
      this.steerInput,
      false, // No handbrake for AI
      false  // No nitro for AI (keeps it fair)
    );
  }

  /**
   * Update current position on racing line
   */
  private updateRacingLinePosition(): void {
    const position = this.vehicle.getStats().position;
    const closest = this.track.getClosestRacingLinePoint(position);
    this.currentRacingLineIndex = closest.index;
  }

  /**
   * Update target point with lookahead
   */
  private updateTargetPoint(): void {
    const stats = this.vehicle.getStats();
    const speed = stats.speed;

    // Dynamic lookahead based on speed
    this.lookaheadDistance = 15 + (speed / 10);

    // Adjust for overtaking
    if (this.isOvertaking) {
      this.lookaheadDistance *= 0.7;
    }

    this.targetPoint = this.track.getRacingLinePointAhead(
      this.currentRacingLineIndex,
      this.lookaheadDistance
    );
  }

  /**
   * Check for obstacles (other vehicles)
   */
  private checkForObstacles(otherVehicles: Vehicle[]): void {
    const position = this.vehicle.getStats().position;
    const rotation = this.vehicle.getStats().rotation;
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);

    // Reset overtaking state
    this.overtakeTimer -= 0.016;
    if (this.overtakeTimer <= 0) {
      this.isOvertaking = false;
    }

    for (const other of otherVehicles) {
      if (other === this.vehicle) continue;

      const otherPos = other.getStats().position;
      const toOther = otherPos.sub(position);
      const distance = toOther.length();

      // Check if vehicle is in front
      const dotProduct = toOther.normalize().dot(forward);

      if (distance < 15 && dotProduct > 0.7) {
        // Vehicle ahead - initiate overtaking
        this.initiateOvertake(otherPos, rotation);
        break;
      }
    }
  }

  /**
   * Initiate overtaking maneuver
   */
  private initiateOvertake(obstaclePos: Vector3, rotation: Quaternion): void {
    if (this.settings.aggressiveness < Math.random()) {
      return; // Not aggressive enough to overtake
    }

    this.isOvertaking = true;
    this.overtakeTimer = 2.0;

    // Offset target point to the side
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
    const offset = right.scale(5 * (Math.random() > 0.5 ? 1 : -1));
    this.targetPoint = this.targetPoint.add(offset);
  }

  /**
   * Calculate steering input
   */
  private calculateSteering(deltaTime: number): void {
    const position = this.vehicle.getStats().position;
    const rotation = this.vehicle.getStats().rotation;
    const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);

    // Vector to target
    const toTarget = this.targetPoint.sub(position);
    toTarget.y = 0; // Ignore vertical
    const targetDir = toTarget.normalize();

    // Calculate steering angle
    const forwardDot = targetDir.dot(forward);
    const rightDot = targetDir.dot(right);

    // Steer based on right dot (positive = right, negative = left)
    let steer = rightDot;

    // Reduce steering at high speeds for stability
    const speed = this.vehicle.getStats().speed;
    const speedFactor = Math.min(speed / 100, 1.0);
    steer *= (1.0 - speedFactor * 0.5);

    // Apply smoothing
    this.steerInput += (steer - this.steerInput) * this.settings.steerSmoothing;

    // Clamp
    this.steerInput = Math.max(-1, Math.min(1, this.steerInput));
  }

  /**
   * Calculate throttle and brake
   */
  private calculateThrottle(deltaTime: number): void {
    const stats = this.vehicle.getStats();
    const speed = stats.speed;

    // Get track curvature at current position
    const curvature = this.estimateCurvature();

    // Calculate target speed based on curvature
    const maxSpeed = 200 * this.settings.targetSpeedFactor;
    const cornerSpeed = 120 * this.settings.targetSpeedFactor;

    const targetSpeed = maxSpeed - (curvature * (maxSpeed - cornerSpeed));

    if (speed < targetSpeed) {
      // Accelerate
      this.throttleInput = 1.0;
      this.brakeInput = 0;
    } else {
      // Brake or coast
      this.throttleInput = 0;

      const speedDiff = speed - targetSpeed;
      if (speedDiff > 20) {
        this.brakeInput = Math.min(speedDiff / 50, 1.0);
      } else {
        this.brakeInput = 0;
      }
    }

    // If overtaking, be more aggressive
    if (this.isOvertaking) {
      this.throttleInput = 1.0;
      this.brakeInput *= 0.5;
    }
  }

  /**
   * Estimate track curvature ahead
   */
  private estimateCurvature(): number {
    // Get several points ahead and calculate average turn angle
    const point1 = this.track.getRacingLinePointAhead(this.currentRacingLineIndex, 10);
    const point2 = this.track.getRacingLinePointAhead(this.currentRacingLineIndex, 20);
    const point3 = this.track.getRacingLinePointAhead(this.currentRacingLineIndex, 30);

    const dir1 = point2.sub(point1).normalize();
    const dir2 = point3.sub(point2).normalize();

    const angle = Math.acos(Math.max(-1, Math.min(1, dir1.dot(dir2))));
    return angle;
  }

  /**
   * Apply rubber-banding to keep race competitive
   */
  private applyRubberBanding(): void {
    if (!this.rubberbandTarget) return;

    const targetSpeed = this.rubberbandTarget.getStats().speed;
    const mySpeed = this.vehicle.getStats().speed;

    const speedDiff = mySpeed - targetSpeed;

    // If AI is too far ahead, slow down
    if (speedDiff > 20) {
      const slowFactor = this.settings.rubberbandStrength;
      this.throttleInput *= (1.0 - slowFactor);
    }
    // If AI is too far behind, speed up
    else if (speedDiff < -20) {
      const boostFactor = this.settings.rubberbandStrength;
      this.throttleInput = Math.min(1.0, this.throttleInput + boostFactor);
    }
  }

  /**
   * Reset AI state
   */
  public reset(): void {
    this.throttleInput = 0;
    this.brakeInput = 0;
    this.steerInput = 0;
    this.isOvertaking = false;
    this.overtakeTimer = 0;
    this.reactionTimer = 0;
    this.currentRacingLineIndex = 0;
  }

  /**
   * Get AI state for debugging
   */
  public getState() {
    return {
      throttle: this.throttleInput,
      brake: this.brakeInput,
      steer: this.steerInput,
      isOvertaking: this.isOvertaking,
      targetPoint: this.targetPoint,
      racingLineIndex: this.currentRacingLineIndex
    };
  }
}
