/**
 * Core motion matching algorithm with feature-based pose search.
 * Implements real-time best-match pose selection with cost function optimization.
 * @module animation/MotionMatcher
 */

import { MotionDatabase, PoseEntry, SearchOptions } from './MotionDatabase';
import { PoseFeatures, MotionFeatureExtractor } from './MotionFeatures';
import { Skeleton } from './Skeleton';
import { Vector3 } from '../math/Vector3';

/**
 * Motion matching result with transition information.
 */
export interface MotionMatchResult {
  /** Best matching pose entry */
  pose: PoseEntry;
  /** Matching cost (lower is better) */
  cost: number;
  /** Whether a transition occurred */
  transitioned: boolean;
  /** Previous pose entry (if any) */
  previousPose?: PoseEntry;
  /** Blend weight for transition (0-1) */
  blendWeight: number;
}

/**
 * Motion matcher configuration.
 */
export interface MotionMatcherConfig {
  /** Motion database to search */
  database: MotionDatabase;
  /** Feature extractor (should match database) */
  featureExtractor: MotionFeatureExtractor;
  /** Transition blend duration (seconds) */
  transitionDuration?: number;
  /** Minimum time between searches (seconds, 0 = every frame) */
  searchInterval?: number;
  /** Inertia blending for smooth transitions */
  inertiaBlending?: boolean;
  /** Responsiveness (0-1, higher = more responsive, less smooth) */
  responsiveness?: number;
}

/**
 * Default matcher configuration.
 */
const DEFAULT_MATCHER_CONFIG = {
  transitionDuration: 0.2,
  searchInterval: 0.0,
  inertiaBlending: true,
  responsiveness: 0.7
};

/**
 * Core motion matching algorithm.
 * Searches motion database for best matching pose based on current state and desired trajectory.
 *
 * @example
 * ```typescript
 * const matcher = new MotionMatcher({
 *   database: motionDatabase,
 *   featureExtractor: featureExtractor,
 *   transitionDuration: 0.15,
 *   searchInterval: 0.0,
 *   responsiveness: 0.8
 * });
 *
 * // Update loop
 * function update(deltaTime: number) {
 *   // Get current features
 *   const currentFeatures = featureExtractor.extractPoseFeatures(
 *     skeleton,
 *     rootVelocity,
 *     trajectory
 *   );
 *
 *   // Find best match
 *   const result = matcher.match(currentFeatures, deltaTime, {
 *     tags: ['locomotion'],
 *     excludeClips: [jumpClipIndex]
 *   });
 *
 *   // Apply pose to skeleton
 *   if (result.transitioned) {
 *     console.log(`Transitioned to clip ${result.pose.clipIndex} at time ${result.pose.time}`);
 *   }
 *
 *   const pose = result.pose;
 *   const clip = database.getClip(pose.clipIndex)?.clip;
 *   if (clip) {
 *     clip.sample(skeleton, pose.time);
 *   }
 *
 *   // Blend during transition
 *   if (result.blendWeight < 1.0 && result.previousPose) {
 *     const prevClip = database.getClip(result.previousPose.clipIndex)?.clip;
 *     if (prevClip) {
 *       // Apply blend between previous and current pose
 *     }
 *   }
 * }
 * ```
 */
export class MotionMatcher {
  /**
   * Motion database for pose search.
   */
  private readonly database: MotionDatabase;

  /**
   * Feature extractor for query preparation.
   */
  private readonly featureExtractor: MotionFeatureExtractor;

  /**
   * Transition blend duration (seconds).
   */
  private readonly transitionDuration: number;

  /**
   * Minimum time between searches (seconds).
   */
  private readonly searchInterval: number;

  /**
   * Whether to use inertia blending.
   */
  private readonly inertiaBlending: boolean;

  /**
   * Responsiveness factor (0-1).
   */
  private readonly responsiveness: number;

  /**
   * Currently playing pose.
   */
  private currentPose: PoseEntry | null;

  /**
   * Previous pose (for blending).
   */
  private previousPose: PoseEntry | null;

  /**
   * Time since last search (seconds).
   */
  private timeSinceLastSearch: number;

  /**
   * Transition progress (0-1).
   */
  private transitionProgress: number;

  /**
   * Whether currently in transition.
   */
  private inTransition: boolean;

  /**
   * Accumulated matching costs for debugging.
   */
  private lastMatchingCost: number;

  /**
   * Creates a motion matcher.
   *
   * @param config - Matcher configuration
   *
   * @example
   * ```typescript
   * const matcher = new MotionMatcher({
   *   database: database,
   *   featureExtractor: extractor,
   *   transitionDuration: 0.2,
   *   responsiveness: 0.75
   * });
   * ```
   */
  constructor(config: MotionMatcherConfig) {
    this.database = config.database;
    this.featureExtractor = config.featureExtractor;

    const fullConfig = { ...DEFAULT_MATCHER_CONFIG, ...config };
    this.transitionDuration = fullConfig.transitionDuration;
    this.searchInterval = fullConfig.searchInterval;
    this.inertiaBlending = fullConfig.inertiaBlending;
    this.responsiveness = fullConfig.responsiveness;

    this.currentPose = null;
    this.previousPose = null;
    this.timeSinceLastSearch = 0;
    this.transitionProgress = 1.0;
    this.inTransition = false;
    this.lastMatchingCost = 0;
  }

  /**
   * Finds the best matching pose for given features.
   *
   * @param queryFeatures - Current pose features and desired trajectory
   * @param deltaTime - Time since last frame (seconds)
   * @param searchOptions - Optional search constraints
   * @returns Motion match result with transition info
   *
   * @example
   * ```typescript
   * const result = matcher.match(currentFeatures, 0.016, {
   *   tags: ['locomotion'],
   *   excludeClips: [currentClipIndex]
   * });
   *
   * if (result.transitioned) {
   *   console.log('New pose selected');
   * }
   * ```
   */
  match(
    queryFeatures: PoseFeatures,
    deltaTime: number,
    searchOptions: SearchOptions = {}
  ): MotionMatchResult {
    this.timeSinceLastSearch += deltaTime;

    const shouldSearch = this.timeSinceLastSearch >= this.searchInterval;

    if (shouldSearch) {
      const newPose = this.searchBestPose(queryFeatures, searchOptions);

      if (this.shouldTransition(newPose)) {
        this.initiateTransition(newPose);
      }

      this.timeSinceLastSearch = 0;
    }

    this.updateTransition(deltaTime);

    if (!this.currentPose) {
      const initialPose = this.database.getPose(0);
      if (!initialPose) {
        throw new Error('Motion database is empty');
      }
      this.currentPose = initialPose;
    }

    return {
      pose: this.currentPose,
      cost: this.lastMatchingCost,
      transitioned: this.inTransition && this.transitionProgress < 0.01,
      previousPose: this.previousPose ?? undefined,
      blendWeight: this.getBlendWeight()
    };
  }

  /**
   * Gets the current pose being played.
   *
   * @returns Current pose entry or null if not initialized
   *
   * @example
   * ```typescript
   * const currentPose = matcher.getCurrentPose();
   * if (currentPose) {
   *   console.log(`Playing clip ${currentPose.clipIndex} at ${currentPose.time}s`);
   * }
   * ```
   */
  getCurrentPose(): PoseEntry | null {
    return this.currentPose;
  }

  /**
   * Gets the last matching cost (for debugging).
   *
   * @returns Last matching cost value
   *
   * @example
   * ```typescript
   * console.log(`Matching quality: ${matcher.getLastMatchingCost()}`);
   * ```
   */
  getLastMatchingCost(): number {
    return this.lastMatchingCost;
  }

  /**
   * Checks if currently in transition.
   *
   * @returns True if transitioning between poses
   *
   * @example
   * ```typescript
   * if (matcher.isTransitioning()) {
   *   console.log('Blending between poses');
   * }
   * ```
   */
  isTransitioning(): boolean {
    return this.inTransition;
  }

  /**
   * Gets transition progress (0-1).
   *
   * @returns Transition progress (0 = just started, 1 = complete)
   *
   * @example
   * ```typescript
   * const progress = matcher.getTransitionProgress();
   * console.log(`Transition ${Math.floor(progress * 100)}% complete`);
   * ```
   */
  getTransitionProgress(): number {
    return this.transitionProgress;
  }

  /**
   * Forces an immediate transition to a specific pose.
   *
   * @param poseIndex - Index of pose to transition to
   *
   * @example
   * ```typescript
   * matcher.forcePose(jumpStartPoseIndex);
   * ```
   */
  forcePose(poseIndex: number): void {
    const pose = this.database.getPose(poseIndex);
    if (!pose) {
      throw new Error(`Invalid pose index: ${poseIndex}`);
    }

    this.initiateTransition(pose);
  }

  /**
   * Resets the matcher state.
   *
   * @example
   * ```typescript
   * character.teleport(newPosition);
   * matcher.reset();
   * ```
   */
  reset(): void {
    this.currentPose = null;
    this.previousPose = null;
    this.timeSinceLastSearch = 0;
    this.transitionProgress = 1.0;
    this.inTransition = false;
    this.lastMatchingCost = 0;
  }

  /**
   * Searches database for best matching pose.
   * @private
   */
  private searchBestPose(
    queryFeatures: PoseFeatures,
    searchOptions: SearchOptions
  ): PoseEntry {
    const pose = this.database.search(queryFeatures, searchOptions);

    const queryVector = this.featureExtractor.featuresToVector(queryFeatures);
    this.lastMatchingCost = this.featureExtractor.computeMatchingCost(
      queryVector,
      pose.featureVector
    );

    return pose;
  }

  /**
   * Determines if a transition to a new pose should occur.
   * @private
   */
  private shouldTransition(newPose: PoseEntry): boolean {
    if (!this.currentPose) {
      return true;
    }

    if (newPose.clipIndex !== this.currentPose.clipIndex) {
      return true;
    }

    const timeDiff = Math.abs(newPose.time - this.currentPose.time);
    if (timeDiff > 0.2) {
      return true;
    }

    return false;
  }

  /**
   * Initiates a transition to a new pose.
   * @private
   */
  private initiateTransition(newPose: PoseEntry): void {
    this.previousPose = this.currentPose;
    this.currentPose = newPose;
    this.transitionProgress = 0;
    this.inTransition = true;
  }

  /**
   * Updates transition state.
   * @private
   */
  private updateTransition(deltaTime: number): void {
    if (!this.inTransition) {
      return;
    }

    if (this.transitionDuration > 0) {
      this.transitionProgress += deltaTime / this.transitionDuration;
    } else {
      this.transitionProgress = 1.0;
    }

    if (this.transitionProgress >= 1.0) {
      this.transitionProgress = 1.0;
      this.inTransition = false;
      this.previousPose = null;
    }
  }

  /**
   * Gets current blend weight for transitions.
   * @private
   */
  private getBlendWeight(): number {
    if (!this.inTransition) {
      return 1.0;
    }

    let t = this.transitionProgress;

    if (this.inertiaBlending) {
      t = this.applyInertiaBlending(t);
    }

    t = Math.max(0, Math.min(1, t));

    return t;
  }

  /**
   * Applies inertia blending curve for smoother transitions.
   * @private
   */
  private applyInertiaBlending(t: number): number {
    const responsiveness = this.responsiveness;

    const a = 2.0 - responsiveness;
    const b = responsiveness - 1.0;

    if (t < 0.5) {
      return Math.pow(2 * t, a) / 2;
    } else {
      return 1 - Math.pow(2 * (1 - t), a) / 2;
    }
  }
}
