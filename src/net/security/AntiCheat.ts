import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Player movement data for validation
 */
export interface MovementData {
  /** Current position */
  position: Vector3;
  /** Previous position */
  previousPosition: Vector3;
  /** Time delta (seconds) */
  deltaTime: number;
  /** Player velocity */
  velocity?: Vector3;
  /** Is player on ground */
  isGrounded?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Is the data valid */
  valid: boolean;
  /** Violation type if invalid */
  violation?: string;
  /** Severity level (1-10) */
  severity?: number;
  /** Additional details */
  details?: string;
}

/**
 * Player violation record
 */
export interface ViolationRecord {
  /** Player ID */
  playerId: string;
  /** Violation type */
  type: string;
  /** Timestamp */
  timestamp: number;
  /** Severity (1-10) */
  severity: number;
  /** Details */
  details: string;
}

/**
 * Anti-cheat configuration
 */
export interface AntiCheatConfig {
  /** Maximum movement speed (units/second) */
  maxSpeed?: number;
  /** Maximum acceleration (units/second²) */
  maxAcceleration?: number;
  /** Maximum vertical speed (units/second) */
  maxVerticalSpeed?: number;
  /** Gravity acceleration (units/second²) */
  gravity?: number;
  /** Position tolerance for teleport detection */
  teleportThreshold?: number;
  /** Time window for rate limiting (ms) */
  rateLimitWindow?: number;
  /** Maximum actions per window */
  maxActionsPerWindow?: number;
  /** Enable position validation */
  validatePosition?: boolean;
  /** Enable speed validation */
  validateSpeed?: boolean;
  /** Enable rate limiting */
  enableRateLimit?: boolean;
  /** Auto-ban after X severe violations */
  autoBanThreshold?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Anti-cheat validation system for preventing cheating.
 * Validates player movement, speed, and actions.
 *
 * @example
 * ```typescript
 * const antiCheat = new AntiCheat({
 *   maxSpeed: 10,
 *   validatePosition: true,
 *   validateSpeed: true
 * });
 *
 * // Validate player movement
 * const result = antiCheat.validateMovement('player1', {
 *   position: new Vector3(10, 0, 5),
 *   previousPosition: new Vector3(9, 0, 5),
 *   deltaTime: 0.016
 * });
 *
 * if (!result.valid) {
 *   console.log('Cheat detected:', result.violation);
 * }
 * ```
 */
export class AntiCheat {
  private readonly config: Required<AntiCheatConfig>;
  private readonly logger: Logger;
  private readonly violations: Map<string, ViolationRecord[]> = new Map();
  private readonly actionTimestamps: Map<string, number[]> = new Map();
  private readonly lastPositions: Map<string, Vector3> = new Map();
  private readonly lastVelocities: Map<string, Vector3> = new Map();

  constructor(config: AntiCheatConfig = {}) {
    this.config = {
      maxSpeed: config.maxSpeed ?? 10.0,
      maxAcceleration: config.maxAcceleration ?? 50.0,
      maxVerticalSpeed: config.maxVerticalSpeed ?? 15.0,
      gravity: config.gravity ?? 9.81,
      teleportThreshold: config.teleportThreshold ?? 20.0,
      rateLimitWindow: config.rateLimitWindow ?? 1000,
      maxActionsPerWindow: config.maxActionsPerWindow ?? 60,
      validatePosition: config.validatePosition ?? true,
      validateSpeed: config.validateSpeed ?? true,
      enableRateLimit: config.enableRateLimit ?? true,
      autoBanThreshold: config.autoBanThreshold ?? 10,
      debug: config.debug ?? false
    };
    this.logger = new Logger('AntiCheat');
  }

  /**
   * Validate player movement
   *
   * @param playerId - Player ID
   * @param movement - Movement data
   * @returns Validation result
   */
  public validateMovement(playerId: string, movement: MovementData): ValidationResult {
    if (!this.config.validatePosition && !this.config.validateSpeed) {
      return { valid: true };
    }

    const results: ValidationResult[] = [];

    // Validate speed
    if (this.config.validateSpeed) {
      results.push(this.validateSpeed(playerId, movement));
    }

    // Validate position (teleport detection)
    if (this.config.validatePosition) {
      results.push(this.validatePosition(playerId, movement));
    }

    // Validate acceleration
    results.push(this.validateAcceleration(playerId, movement));

    // Validate vertical movement (gravity/jump)
    results.push(this.validateVerticalMovement(playerId, movement));

    // Find most severe violation
    const invalid = results.find(r => !r.valid);
    if (invalid) {
      this.recordViolation(playerId, invalid);
      return invalid;
    }

    // Update tracking data
    this.lastPositions.set(playerId, movement.position.clone());
    if (movement.velocity) {
      this.lastVelocities.set(playerId, movement.velocity.clone());
    }

    return { valid: true };
  }

  /**
   * Validate movement speed
   */
  private validateSpeed(playerId: string, movement: MovementData): ValidationResult {
    const distance = movement.position.distanceTo(movement.previousPosition);
    const speed = distance / movement.deltaTime;

    if (speed > this.config.maxSpeed * 1.5) { // 50% tolerance
      return {
        valid: false,
        violation: 'speed',
        severity: 8,
        details: `Speed ${speed.toFixed(2)} exceeds maximum ${this.config.maxSpeed}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate position (teleport detection)
   */
  private validatePosition(playerId: string, movement: MovementData): ValidationResult {
    const distance = movement.position.distanceTo(movement.previousPosition);

    if (distance > this.config.teleportThreshold) {
      return {
        valid: false,
        violation: 'teleport',
        severity: 10,
        details: `Teleport detected: ${distance.toFixed(2)} units`
      };
    }

    return { valid: true };
  }

  /**
   * Validate acceleration
   */
  private validateAcceleration(playerId: string, movement: MovementData): ValidationResult {
    if (!movement.velocity) {
      return { valid: true };
    }

    const lastVelocity = this.lastVelocities.get(playerId);
    if (!lastVelocity) {
      return { valid: true };
    }

    const velocityChange = movement.velocity.clone().sub(lastVelocity);
    const acceleration = velocityChange.length() / movement.deltaTime;

    if (acceleration > this.config.maxAcceleration) {
      return {
        valid: false,
        violation: 'acceleration',
        severity: 7,
        details: `Acceleration ${acceleration.toFixed(2)} exceeds maximum ${this.config.maxAcceleration}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate vertical movement (gravity/jump)
   */
  private validateVerticalMovement(
    playerId: string,
    movement: MovementData
  ): ValidationResult {
    const verticalDistance = Math.abs(
      movement.position.y - movement.previousPosition.y
    );
    const verticalSpeed = verticalDistance / movement.deltaTime;

    if (verticalSpeed > this.config.maxVerticalSpeed) {
      return {
        valid: false,
        violation: 'vertical_speed',
        severity: 6,
        details: `Vertical speed ${verticalSpeed.toFixed(2)} exceeds maximum ${this.config.maxVerticalSpeed}`
      };
    }

    // Check for flying (sustained upward movement without being grounded)
    if (movement.isGrounded === false) {
      const lastPos = this.lastPositions.get(playerId);
      if (lastPos && movement.position.y > lastPos.y) {
        const upwardTime = movement.deltaTime;
        const expectedFall = 0.5 * this.config.gravity * upwardTime * upwardTime;

        if (movement.position.y - lastPos.y > expectedFall * 2) {
          return {
            valid: false,
            violation: 'flying',
            severity: 9,
            details: 'Sustained upward movement without jumping'
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate action rate (prevent spam)
   *
   * @param playerId - Player ID
   * @param actionType - Type of action
   * @returns Validation result
   */
  public validateActionRate(playerId: string, actionType: string): ValidationResult {
    if (!this.config.enableRateLimit) {
      return { valid: true };
    }

    const key = `${playerId}_${actionType}`;
    const now = performance.now();
    const timestamps = this.actionTimestamps.get(key) || [];

    // Remove old timestamps outside the window
    const windowStart = now - this.config.rateLimitWindow;
    const recentTimestamps = timestamps.filter(t => t >= windowStart);

    // Check if rate limit exceeded
    if (recentTimestamps.length >= this.config.maxActionsPerWindow) {
      const violation: ValidationResult = {
        valid: false,
        violation: 'rate_limit',
        severity: 5,
        details: `Too many ${actionType} actions: ${recentTimestamps.length} in ${this.config.rateLimitWindow}ms`
      };

      this.recordViolation(playerId, violation);
      return violation;
    }

    // Record this action
    recentTimestamps.push(now);
    this.actionTimestamps.set(key, recentTimestamps);

    return { valid: true };
  }

  /**
   * Validate game state value (e.g., health, ammo)
   *
   * @param playerId - Player ID
   * @param stateName - Name of the stat
   * @param value - Current value
   * @param min - Minimum valid value
   * @param max - Maximum valid value
   * @returns Validation result
   */
  public validateStatValue(
    playerId: string,
    stateName: string,
    value: number,
    min: number,
    max: number
  ): ValidationResult {
    if (value < min || value > max) {
      const violation: ValidationResult = {
        valid: false,
        violation: 'invalid_stat',
        severity: 8,
        details: `${stateName} value ${value} outside valid range [${min}, ${max}]`
      };

      this.recordViolation(playerId, violation);
      return violation;
    }

    return { valid: true };
  }

  /**
   * Record a violation
   */
  private recordViolation(playerId: string, result: ValidationResult): void {
    if (!result.violation || !result.severity) {
      return;
    }

    const record: ViolationRecord = {
      playerId,
      type: result.violation,
      timestamp: performance.now(),
      severity: result.severity,
      details: result.details || ''
    };

    const violations = this.violations.get(playerId) || [];
    violations.push(record);
    this.violations.set(playerId, violations);

    if (this.config.debug) {
      this.logger.warn(
        `Violation for ${playerId}: ${result.violation} (severity ${result.severity})`
      );
    }

    // Check for auto-ban
    const severeViolations = violations.filter(v => v.severity >= 8);
    if (severeViolations.length >= this.config.autoBanThreshold) {
      this.logger.error(
        `Player ${playerId} exceeded auto-ban threshold (${severeViolations.length} severe violations)`
      );
    }
  }

  /**
   * Get violations for a player
   *
   * @param playerId - Player ID
   * @returns Array of violation records
   */
  public getViolations(playerId: string): ViolationRecord[] {
    return [...(this.violations.get(playerId) || [])];
  }

  /**
   * Get violation count for a player
   *
   * @param playerId - Player ID
   * @param minSeverity - Minimum severity to count
   * @returns Number of violations
   */
  public getViolationCount(playerId: string, minSeverity: number = 0): number {
    const violations = this.violations.get(playerId) || [];
    return violations.filter(v => v.severity >= minSeverity).length;
  }

  /**
   * Clear violations for a player
   *
   * @param playerId - Player ID
   */
  public clearViolations(playerId: string): void {
    this.violations.delete(playerId);
    this.actionTimestamps.clear();
    this.lastPositions.delete(playerId);
    this.lastVelocities.delete(playerId);

    if (this.config.debug) {
      this.logger.debug(`Cleared violations for ${playerId}`);
    }
  }

  /**
   * Check if player should be banned
   *
   * @param playerId - Player ID
   * @returns True if player has too many severe violations
   */
  public shouldBan(playerId: string): boolean {
    return this.getViolationCount(playerId, 8) >= this.config.autoBanThreshold;
  }

  /**
   * Get trust score for a player (0-100)
   *
   * @param playerId - Player ID
   * @returns Trust score
   */
  public getTrustScore(playerId: string): number {
    const violations = this.violations.get(playerId) || [];

    if (violations.length === 0) {
      return 100;
    }

    // Calculate weighted violation score
    let violationScore = 0;
    for (const violation of violations) {
      violationScore += violation.severity;
    }

    // Normalize to 0-100 (lower is worse)
    const maxScore = this.config.autoBanThreshold * 10;
    const score = Math.max(0, 100 - (violationScore / maxScore) * 100);

    return Math.round(score);
  }

  /**
   * Reset tracking for a player (on respawn, etc.)
   *
   * @param playerId - Player ID
   */
  public resetPlayerTracking(playerId: string): void {
    this.lastPositions.delete(playerId);
    this.lastVelocities.delete(playerId);

    if (this.config.debug) {
      this.logger.debug(`Reset tracking for ${playerId}`);
    }
  }

  /**
   * Update anti-cheat configuration
   *
   * @param updates - Configuration updates
   */
  public updateConfig(updates: Partial<AntiCheatConfig>): void {
    Object.assign(this.config, updates);

    if (this.config.debug) {
      this.logger.debug('Anti-cheat configuration updated', updates);
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): AntiCheatConfig {
    return { ...this.config };
  }

  /**
   * Get anti-cheat statistics
   */
  public getStats(): {
    totalViolations: number;
    playersWithViolations: number;
    severeViolations: number;
    playersBanned: number;
    averageTrustScore: number;
  } {
    let totalViolations = 0;
    let severeViolations = 0;
    let playersBanned = 0;
    let totalTrustScore = 0;

    for (const [playerId, violations] of this.violations) {
      totalViolations += violations.length;
      severeViolations += violations.filter(v => v.severity >= 8).length;

      if (this.shouldBan(playerId)) {
        playersBanned++;
      }

      totalTrustScore += this.getTrustScore(playerId);
    }

    const playerCount = this.violations.size;

    return {
      totalViolations,
      playersWithViolations: playerCount,
      severeViolations,
      playersBanned,
      averageTrustScore: playerCount > 0 ? totalTrustScore / playerCount : 100
    };
  }

  /**
   * Clear all data
   */
  public clear(): void {
    this.violations.clear();
    this.actionTimestamps.clear();
    this.lastPositions.clear();
    this.lastVelocities.clear();

    if (this.config.debug) {
      this.logger.debug('Anti-cheat data cleared');
    }
  }
}
