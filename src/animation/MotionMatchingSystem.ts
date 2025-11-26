/**
 * High-level motion matching system for real-time character animation.
 * Integrates trajectory generation, pose matching, and animation playback.
 * @module animation/MotionMatchingSystem
 */

import { Skeleton } from './Skeleton';
import { AnimationClip } from './AnimationClip';
import { MotionDatabase, DatabaseConfig, SearchOptions } from './MotionDatabase';
import { MotionMatcher, MotionMatcherConfig, MotionMatchResult } from './MotionMatcher';
import { MotionFeatureExtractor, FeatureConfig, PoseFeatures } from './MotionFeatures';
import { TrajectoryGenerator, PlayerInput, PathWaypoint, TrajectoryConfig } from './TrajectoryGenerator';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

/**
 * Motion matching system configuration.
 */
export interface MotionMatchingConfig {
  /** Skeleton to animate */
  skeleton: Skeleton;
  /** Animation clips for motion database */
  clips: AnimationClip[];
  /** Sample rate for database (FPS) */
  sampleRate?: number;
  /** Feature extraction configuration */
  featureConfig?: FeatureConfig;
  /** Trajectory generation configuration */
  trajectoryConfig?: TrajectoryConfig;
  /** Transition blend duration (seconds) */
  transitionDuration?: number;
  /** Update rate (seconds, 0 = every frame) */
  updateRate?: number;
  /** Tags for clips (same length as clips array) */
  clipTags?: string[][];
  /** Whether clips are loopable */
  loopable?: boolean[];
  /** Responsiveness (0-1, higher = more responsive) */
  responsiveness?: number;
}

/**
 * Motion matching system state.
 */
export interface MotionMatchingState {
  /** Current root position */
  rootPosition: Vector3;
  /** Current root rotation */
  rootRotation: Quaternion;
  /** Current root velocity */
  rootVelocity: Vector3;
  /** Current pose index in database */
  currentPoseIndex: number;
  /** Whether system is active */
  active: boolean;
}

/**
 * Motion matching statistics for debugging and profiling.
 */
export interface MotionMatchingStats {
  /** Total poses in database */
  databaseSize: number;
  /** Last search time (milliseconds) */
  lastSearchTime: number;
  /** Last matching cost */
  lastMatchingCost: number;
  /** Current clip index */
  currentClipIndex: number;
  /** Current clip time */
  currentClipTime: number;
  /** Transition progress (0-1) */
  transitionProgress: number;
  /** Is transitioning */
  isTransitioning: boolean;
  /** Updates per second */
  updatesPerSecond: number;
}

/**
 * High-level motion matching animation system.
 * Provides complete motion matching pipeline: input → trajectory → database search → pose application.
 *
 * @example
 * ```typescript
 * // Create motion matching system
 * const motionMatching = new MotionMatchingSystem({
 *   skeleton: characterSkeleton,
 *   clips: [idleClip, walkClip, runClip, jumpClip],
 *   sampleRate: 30,
 *   featureConfig: {
 *     featureBones: [0, 1, 2, 3, 4, 5], // Root, spine, head, hands, feet
 *     trajectoryTimes: [0.2, 0.4, 0.6],
 *     includeVelocities: true
 *   },
 *   trajectoryConfig: {
 *     predictionTimes: [0.2, 0.4, 0.6],
 *     smoothing: 0.85,
 *     maxSpeed: 6.0
 *   },
 *   transitionDuration: 0.15,
 *   updateRate: 0.0, // Update every frame
 *   clipTags: [
 *     ['idle'],
 *     ['locomotion', 'walk'],
 *     ['locomotion', 'run'],
 *     ['action', 'jump']
 *   ],
 *   responsiveness: 0.8
 * });
 *
 * console.log(`System ready with ${motionMatching.getDatabaseSize()} poses`);
 *
 * // Update loop
 * function update(deltaTime: number) {
 *   // Get player input
 *   const input: PlayerInput = {
 *     moveDirection: getInputDirection(),
 *     facingDirection: getCameraForward(),
 *     speed: isRunning ? 1.0 : 0.5
 *   };
 *
 *   // Update motion matching
 *   motionMatching.updateFromInput(input, deltaTime);
 *
 *   // Skeleton is automatically updated with best matching pose
 *   renderer.render(character);
 *
 *   // Debug info
 *   const stats = motionMatching.getStats();
 *   console.log(`Clip: ${stats.currentClipIndex}, Cost: ${stats.lastMatchingCost.toFixed(3)}`);
 * }
 *
 * // Or update from navigation path
 * const path = navigationSystem.findPath(currentPos, targetPos);
 * motionMatching.updateFromPath(path, deltaTime);
 *
 * // Performance monitoring
 * const stats = motionMatching.getStats();
 * if (stats.lastSearchTime > 1.0) {
 *   console.warn('Motion matching search is slow!');
 * }
 * ```
 */
export class MotionMatchingSystem {
  /**
   * Skeleton being animated.
   */
  private readonly skeleton: Skeleton;

  /**
   * Motion database for pose search.
   */
  private readonly database: MotionDatabase;

  /**
   * Motion matcher for pose selection.
   */
  private readonly matcher: MotionMatcher;

  /**
   * Feature extractor for pose analysis.
   */
  private readonly featureExtractor: MotionFeatureExtractor;

  /**
   * Trajectory generator for input processing.
   */
  private readonly trajectoryGenerator: TrajectoryGenerator;

  /**
   * Update rate (seconds between updates).
   */
  private readonly updateRate: number;

  /**
   * Current system state.
   */
  private state: MotionMatchingState;

  /**
   * Time since last update.
   */
  private timeSinceLastUpdate: number;

  /**
   * Performance statistics.
   */
  private stats: MotionMatchingStats;

  /**
   * Frame counter for FPS calculation.
   */
  private frameCount: number;

  /**
   * Time accumulator for FPS calculation.
   */
  private fpsTimer: number;

  /**
   * Creates a motion matching system.
   *
   * @param config - System configuration
   *
   * @example
   * ```typescript
   * const system = new MotionMatchingSystem({
   *   skeleton: skeleton,
   *   clips: animationClips,
   *   sampleRate: 30,
   *   updateRate: 0.0,
   *   transitionDuration: 0.2
   * });
   * ```
   */
  constructor(config: MotionMatchingConfig) {
    this.skeleton = config.skeleton;
    this.updateRate = config.updateRate ?? 0.0;

    this.featureExtractor = new MotionFeatureExtractor(config.featureConfig);

    const databaseConfig: DatabaseConfig = {
      skeleton: config.skeleton,
      clips: config.clips,
      sampleRate: config.sampleRate,
      featureConfig: config.featureConfig,
      clipTags: config.clipTags,
      loopable: config.loopable
    };

    this.database = new MotionDatabase(databaseConfig);

    const matcherConfig: MotionMatcherConfig = {
      database: this.database,
      featureExtractor: this.featureExtractor,
      transitionDuration: config.transitionDuration ?? 0.2,
      searchInterval: this.updateRate,
      responsiveness: config.responsiveness ?? 0.7
    };

    this.matcher = new MotionMatcher(matcherConfig);

    this.trajectoryGenerator = new TrajectoryGenerator(config.trajectoryConfig);

    this.state = {
      rootPosition: Vector3.zero(),
      rootRotation: Quaternion.identity(),
      rootVelocity: Vector3.zero(),
      currentPoseIndex: 0,
      active: true
    };

    this.timeSinceLastUpdate = 0;
    this.frameCount = 0;
    this.fpsTimer = 0;

    this.stats = {
      databaseSize: this.database.getPoseCount(),
      lastSearchTime: 0,
      lastMatchingCost: 0,
      currentClipIndex: 0,
      currentClipTime: 0,
      transitionProgress: 0,
      isTransitioning: false,
      updatesPerSecond: 0
    };
  }

  /**
   * Updates the system from player input.
   *
   * @param input - Player input state
   * @param deltaTime - Time since last frame (seconds)
   * @param searchOptions - Optional search constraints
   * @returns Motion match result
   *
   * @example
   * ```typescript
   * const input: PlayerInput = {
   *   moveDirection: new Vector3(1, 0, 0).normalize(),
   *   facingDirection: new Vector3(1, 0, 0).normalize(),
   *   speed: 1.0
   * };
   * const result = system.updateFromInput(input, 0.016);
   * ```
   */
  updateFromInput(
    input: PlayerInput,
    deltaTime: number,
    searchOptions: SearchOptions = {}
  ): MotionMatchResult {
    if (!this.state.active) {
      return this.createEmptyResult();
    }

    const trajectory = this.trajectoryGenerator.generateFromInput(
      this.state.rootPosition,
      input
    );

    return this.updateInternal(trajectory, deltaTime, searchOptions);
  }

  /**
   * Updates the system from a navigation path.
   *
   * @param path - Navigation path waypoints
   * @param deltaTime - Time since last frame (seconds)
   * @param searchOptions - Optional search constraints
   * @returns Motion match result
   *
   * @example
   * ```typescript
   * const path = [
   *   { position: new Vector3(5, 0, 0), direction: Vector3.forward() },
   *   { position: new Vector3(10, 0, 5), direction: Vector3.right() }
   * ];
   * system.updateFromPath(path, deltaTime);
   * ```
   */
  updateFromPath(
    path: PathWaypoint[],
    deltaTime: number,
    searchOptions: SearchOptions = {}
  ): MotionMatchResult {
    if (!this.state.active) {
      return this.createEmptyResult();
    }

    const trajectory = this.trajectoryGenerator.generateFromPath(
      this.state.rootPosition,
      path
    );

    return this.updateInternal(trajectory, deltaTime, searchOptions);
  }

  /**
   * Updates the system with a pre-computed trajectory.
   *
   * @param trajectory - Future trajectory samples
   * @param deltaTime - Time since last frame (seconds)
   * @param searchOptions - Optional search constraints
   * @returns Motion match result
   *
   * @example
   * ```typescript
   * const trajectory = customTrajectoryGenerator.generate();
   * system.updateFromTrajectory(trajectory, deltaTime);
   * ```
   */
  updateFromTrajectory(
    trajectory: Array<{ position: Vector3; direction: Vector3 }>,
    deltaTime: number,
    searchOptions: SearchOptions = {}
  ): MotionMatchResult {
    if (!this.state.active) {
      return this.createEmptyResult();
    }

    return this.updateInternal(trajectory, deltaTime, searchOptions);
  }

  /**
   * Gets the skeleton being animated.
   *
   * @returns Skeleton instance
   *
   * @example
   * ```typescript
   * const skeleton = system.getSkeleton();
   * const rootBone = skeleton.getBone('root');
   * ```
   */
  getSkeleton(): Skeleton {
    return this.skeleton;
  }

  /**
   * Gets the motion database.
   *
   * @returns Motion database instance
   *
   * @example
   * ```typescript
   * const database = system.getDatabase();
   * const pose = database.getPose(42);
   * ```
   */
  getDatabase(): MotionDatabase {
    return this.database;
  }

  /**
   * Gets the total number of poses in the database.
   *
   * @returns Pose count
   *
   * @example
   * ```typescript
   * console.log(`Database has ${system.getDatabaseSize()} poses`);
   * ```
   */
  getDatabaseSize(): number {
    return this.database.getPoseCount();
  }

  /**
   * Gets current system state.
   *
   * @returns Current state
   *
   * @example
   * ```typescript
   * const state = system.getState();
   * console.log(`Position: ${state.rootPosition}`);
   * ```
   */
  getState(): Readonly<MotionMatchingState> {
    return this.state;
  }

  /**
   * Gets performance and debug statistics.
   *
   * @returns Current statistics
   *
   * @example
   * ```typescript
   * const stats = system.getStats();
   * console.log(`Search time: ${stats.lastSearchTime.toFixed(2)}ms`);
   * console.log(`Matching cost: ${stats.lastMatchingCost.toFixed(3)}`);
   * ```
   */
  getStats(): Readonly<MotionMatchingStats> {
    return this.stats;
  }

  /**
   * Sets the root position (for teleporting).
   *
   * @param position - New root position
   *
   * @example
   * ```typescript
   * system.setRootPosition(new Vector3(10, 0, 5));
   * ```
   */
  setRootPosition(position: Vector3): void {
    this.state.rootPosition = position.clone();
    this.trajectoryGenerator.reset();
  }

  /**
   * Sets the root rotation.
   *
   * @param rotation - New root rotation
   *
   * @example
   * ```typescript
   * system.setRootRotation(Quaternion.fromAxisAngle(Vector3.up(), Math.PI));
   * ```
   */
  setRootRotation(rotation: Quaternion): void {
    this.state.rootRotation = rotation.clone();
  }

  /**
   * Activates or deactivates the system.
   *
   * @param active - Whether system should be active
   *
   * @example
   * ```typescript
   * system.setActive(false); // Pause motion matching
   * ```
   */
  setActive(active: boolean): void {
    this.state.active = active;
  }

  /**
   * Resets the system to initial state.
   *
   * @example
   * ```typescript
   * character.respawn();
   * system.reset();
   * ```
   */
  reset(): void {
    this.matcher.reset();
    this.trajectoryGenerator.reset();
    this.state.rootPosition = Vector3.zero();
    this.state.rootRotation = Quaternion.identity();
    this.state.rootVelocity = Vector3.zero();
    this.state.currentPoseIndex = 0;
    this.timeSinceLastUpdate = 0;
  }

  /**
   * Forces a transition to a specific pose.
   *
   * @param poseIndex - Index of pose to transition to
   *
   * @example
   * ```typescript
   * system.forcePose(jumpStartPoseIndex);
   * ```
   */
  forcePose(poseIndex: number): void {
    this.matcher.forcePose(poseIndex);
  }

  /**
   * Internal update implementation.
   * @private
   */
  private updateInternal(
    trajectory: Array<{ position: Vector3; direction: Vector3 }>,
    deltaTime: number,
    searchOptions: SearchOptions
  ): MotionMatchResult {
    this.timeSinceLastUpdate += deltaTime;

    if (this.timeSinceLastUpdate < this.updateRate) {
      return this.createEmptyResult();
    }

    const startTime = performance.now();

    const features: PoseFeatures = this.featureExtractor.extractPoseFeatures(
      this.skeleton,
      this.state.rootVelocity,
      trajectory
    );

    const result = this.matcher.match(features, deltaTime, searchOptions);

    this.applyPoseToSkeleton(result);

    this.updateState(result, deltaTime);

    const endTime = performance.now();
    this.stats.lastSearchTime = endTime - startTime;
    this.stats.lastMatchingCost = result.cost;
    this.stats.currentClipIndex = result.pose.clipIndex;
    this.stats.currentClipTime = result.pose.time;
    this.stats.transitionProgress = this.matcher.getTransitionProgress();
    this.stats.isTransitioning = this.matcher.isTransitioning();

    this.frameCount++;
    this.fpsTimer += deltaTime;
    if (this.fpsTimer >= 1.0) {
      this.stats.updatesPerSecond = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    this.timeSinceLastUpdate = 0;

    return result;
  }

  /**
   * Applies matched pose to skeleton.
   * @private
   */
  private applyPoseToSkeleton(result: MotionMatchResult): void {
    const pose = result.pose;
    const clip = this.database.getClip(pose.clipIndex);

    if (!clip) {
      return;
    }

    for (const channel of clip.clip.getAllChannels()) {
      const value = channel.track.evaluate(pose.time);
      if (channel.type === 'position' && value) {
        this.skeleton.setBonePosition(channel.target, value);
      } else if (channel.type === 'rotation' && value) {
        this.skeleton.setBoneRotation(channel.target, value);
      } else if (channel.type === 'scale' && value) {
        this.skeleton.setBoneScale(channel.target, value);
      }
    }

    if (result.blendWeight < 1.0 && result.previousPose) {
      const prevClip = this.database.getClip(result.previousPose.clipIndex);
      if (prevClip) {
        const blendWeight = result.blendWeight;
      }
    }

    this.skeleton.update();
  }

  /**
   * Updates internal state.
   * @private
   */
  private updateState(result: MotionMatchResult, deltaTime: number): void {
    const rootBone = this.skeleton.getBoneByIndex(0);
    if (rootBone) {
      const worldMatrix = this.skeleton.getWorldMatrix(rootBone.name);
      if (worldMatrix) {
        const newPosition = worldMatrix.getPosition();
        this.state.rootVelocity = newPosition.sub(this.state.rootPosition).scale(1.0 / deltaTime);
        this.state.rootPosition = newPosition;
        this.state.rootRotation = rootBone.rotation.clone();
      }
    }

    this.state.currentPoseIndex = this.database.getPoseCount() > 0 ?
      result.pose.frameIndex : 0;
  }

  /**
   * Creates an empty result for when system is inactive.
   * @private
   */
  private createEmptyResult(): MotionMatchResult {
    const emptyPose = this.database.getPose(0);
    if (!emptyPose) {
      throw new Error('Database is empty');
    }

    return {
      pose: emptyPose,
      cost: 0,
      transitioned: false,
      blendWeight: 1.0
    };
  }
}
