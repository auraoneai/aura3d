/**
 * Preprocessed motion database for fast pose matching.
 * Stores animation clips with extracted features and KD-tree indices.
 * @module animation/MotionDatabase
 */

import { AnimationClip } from './AnimationClip';
import { Skeleton } from './Skeleton';
import { KDTree } from './KDTree';
import { MotionFeatureExtractor, PoseFeatures, FeatureConfig } from './MotionFeatures';
import { Vector3 } from '../math/Vector3';
import { TrajectorySample } from './MotionFeatures';

/**
 * Single pose entry in the motion database.
 */
export interface PoseEntry {
  /** Index of the animation clip */
  clipIndex: number;
  /** Time within the clip (seconds) */
  time: number;
  /** Frame index within the clip */
  frameIndex: number;
  /** Extracted pose features */
  features: PoseFeatures;
  /** Flat feature vector for KD-tree */
  featureVector: Float32Array;
  /** Optional tags for filtering */
  tags?: string[];
}

/**
 * Animation clip metadata in database.
 */
export interface ClipMetadata {
  /** Animation clip */
  clip: AnimationClip;
  /** Clip name */
  name: string;
  /** Sample rate (FPS) */
  sampleRate: number;
  /** Total frames */
  frameCount: number;
  /** Optional tags for filtering */
  tags?: string[];
  /** Whether this clip can loop */
  loopable: boolean;
}

/**
 * Configuration for database building.
 */
export interface DatabaseConfig {
  /** Skeleton to extract poses from */
  skeleton: Skeleton;
  /** Animation clips to add to database */
  clips: AnimationClip[];
  /** Sample rate for pose extraction (FPS) */
  sampleRate?: number;
  /** Feature extraction configuration */
  featureConfig?: FeatureConfig;
  /** Tags for clips (same length as clips array) */
  clipTags?: string[][];
  /** Whether to mark clips as loopable */
  loopable?: boolean[];
}

/**
 * Database search options.
 */
export interface SearchOptions {
  /** Filter by tags (only return poses with these tags) */
  tags?: string[];
  /** Exclude specific clip indices */
  excludeClips?: number[];
  /** Maximum number of results to return */
  maxResults?: number;
  /** Minimum time between consecutive matches from same clip */
  minTimeBetweenMatches?: number;
}

/**
 * Preprocessed motion database for real-time pose matching.
 * Builds KD-tree from animation clips for O(log n) nearest neighbor search.
 *
 * @example
 * ```typescript
 * // Build database
 * const database = new MotionDatabase({
 *   skeleton: characterSkeleton,
 *   clips: [walkClip, runClip, jumpClip],
 *   sampleRate: 30,
 *   featureConfig: {
 *     featureBones: [0, 1, 2, 3, 4, 5],
 *     trajectoryTimes: [0.2, 0.4, 0.6],
 *     includeVelocities: true
 *   },
 *   clipTags: [
 *     ['locomotion', 'walk'],
 *     ['locomotion', 'run'],
 *     ['action', 'jump']
 *   ]
 * });
 *
 * console.log(`Database built with ${database.getPoseCount()} poses`);
 *
 * // Search for matching pose
 * const currentFeatures = extractor.extractPoseFeatures(skeleton, velocity, trajectory);
 * const match = database.search(currentFeatures);
 * console.log(`Best match: clip ${match.clipIndex}, time ${match.time}`);
 *
 * // Search with filtering
 * const locomotionMatch = database.search(currentFeatures, {
 *   tags: ['locomotion'],
 *   excludeClips: [currentClipIndex]
 * });
 *
 * // Serialize database
 * const data = database.serialize();
 * // Save to file or IndexedDB
 *
 * // Load database
 * const loaded = MotionDatabase.deserialize(data, skeleton);
 * ```
 */
export class MotionDatabase {
  /**
   * Feature extractor for pose processing.
   */
  private readonly featureExtractor: MotionFeatureExtractor;

  /**
   * KD-tree for fast nearest neighbor search.
   */
  private kdTree: KDTree | null;

  /**
   * All pose entries in the database.
   */
  private poses: PoseEntry[];

  /**
   * Clip metadata.
   */
  private clips: ClipMetadata[];

  /**
   * Skeleton used for pose extraction.
   */
  private readonly skeleton: Skeleton;

  /**
   * Sample rate for pose extraction (FPS).
   */
  private readonly sampleRate: number;

  /**
   * Last matched pose index (for avoiding immediate re-matching).
   */
  private lastMatchedPoseIndex: number;

  /**
   * Creates a motion database.
   *
   * @param config - Database configuration
   *
   * @example
   * ```typescript
   * const database = new MotionDatabase({
   *   skeleton: skeleton,
   *   clips: [clip1, clip2, clip3],
   *   sampleRate: 30,
   *   featureConfig: { featureBones: [0, 1, 2, 3] }
   * });
   * ```
   */
  constructor(config: DatabaseConfig) {
    this.skeleton = config.skeleton.clone();
    this.sampleRate = config.sampleRate ?? 30;
    this.featureExtractor = new MotionFeatureExtractor(config.featureConfig);
    this.poses = [];
    this.clips = [];
    this.kdTree = null;
    this.lastMatchedPoseIndex = -1;

    this.buildDatabase(config);
  }

  /**
   * Searches for the best matching pose.
   *
   * @param queryFeatures - Query pose features
   * @param options - Search options
   * @returns Best matching pose entry
   *
   * @example
   * ```typescript
   * const currentFeatures = extractor.extractPoseFeatures(skeleton, velocity, trajectory);
   * const match = database.search(currentFeatures, {
   *   tags: ['locomotion'],
   *   excludeClips: [currentClipIndex]
   * });
   * ```
   */
  search(queryFeatures: PoseFeatures, options: SearchOptions = {}): PoseEntry {
    if (!this.kdTree || this.poses.length === 0) {
      throw new Error('Motion database is empty');
    }

    const queryVector = this.featureExtractor.featuresToVector(queryFeatures);

    const maxResults = options.maxResults ?? 10;
    const candidates = this.kdTree.kNearest(queryVector, maxResults * 2);

    const filteredCandidates = this.filterCandidates(candidates, options);

    if (filteredCandidates.length === 0) {
      throw new Error('No matching poses found with given filters');
    }

    let bestIndex = filteredCandidates[0].index;
    let bestCost = this.featureExtractor.computeMatchingCost(
      queryVector,
      this.poses[bestIndex].featureVector
    );

    for (let i = 1; i < Math.min(filteredCandidates.length, maxResults); i++) {
      const candidateIndex = filteredCandidates[i].index;
      const cost = this.featureExtractor.computeMatchingCost(
        queryVector,
        this.poses[candidateIndex].featureVector
      );

      const transitionCost = this.computeTransitionCost(
        candidateIndex,
        this.lastMatchedPoseIndex
      );

      const totalCost = cost + transitionCost;

      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestIndex = candidateIndex;
      }
    }

    this.lastMatchedPoseIndex = bestIndex;
    return this.poses[bestIndex];
  }

  /**
   * Gets a pose entry by index.
   *
   * @param index - Pose index
   * @returns Pose entry
   *
   * @example
   * ```typescript
   * const pose = database.getPose(42);
   * console.log(`Pose from clip ${pose.clipIndex} at time ${pose.time}`);
   * ```
   */
  getPose(index: number): PoseEntry | undefined {
    return this.poses[index];
  }

  /**
   * Gets clip metadata by index.
   *
   * @param index - Clip index
   * @returns Clip metadata
   *
   * @example
   * ```typescript
   * const clip = database.getClip(0);
   * console.log(`Clip: ${clip.name}, ${clip.frameCount} frames`);
   * ```
   */
  getClip(index: number): ClipMetadata | undefined {
    return this.clips[index];
  }

  /**
   * Gets total number of poses in database.
   *
   * @returns Pose count
   *
   * @example
   * ```typescript
   * console.log(`Database has ${database.getPoseCount()} poses`);
   * ```
   */
  getPoseCount(): number {
    return this.poses.length;
  }

  /**
   * Gets total number of clips in database.
   *
   * @returns Clip count
   *
   * @example
   * ```typescript
   * console.log(`Database has ${database.getClipCount()} clips`);
   * ```
   */
  getClipCount(): number {
    return this.clips.length;
  }

  /**
   * Adds a new clip to the database and rebuilds the KD-tree.
   *
   * @param clip - Animation clip to add
   * @param tags - Optional tags for the clip
   * @param loopable - Whether the clip is loopable
   *
   * @example
   * ```typescript
   * database.addClip(newWalkClip, ['locomotion', 'walk'], true);
   * ```
   */
  addClip(clip: AnimationClip, tags?: string[], loopable: boolean = false): void {
    const clipIndex = this.clips.length;

    const metadata: ClipMetadata = {
      clip: clip,
      name: clip.name,
      sampleRate: this.sampleRate,
      frameCount: Math.floor(clip.duration * this.sampleRate),
      tags: tags,
      loopable: loopable
    };

    this.clips.push(metadata);

    this.extractPosesFromClip(clipIndex, metadata);

    this.rebuildKDTree();
  }

  /**
   * Serializes the database to binary format.
   *
   * @returns Serialized database
   *
   * @example
   * ```typescript
   * const data = database.serialize();
   * localStorage.setItem('motionDB', JSON.stringify(Array.from(new Uint8Array(data))));
   * ```
   */
  serialize(): ArrayBuffer {
    const encoder = new TextEncoder();

    const headerData = {
      sampleRate: this.sampleRate,
      clipCount: this.clips.length,
      poseCount: this.poses.length,
      featureVectorSize: this.featureExtractor.getFeatureVectorSize()
    };

    const headerJSON = JSON.stringify(headerData);
    const headerBytes = encoder.encode(headerJSON);
    const headerSize = headerBytes.length;

    const clipsJSON = JSON.stringify(this.clips.map(clip => ({
      name: clip.name,
      sampleRate: clip.sampleRate,
      frameCount: clip.frameCount,
      tags: clip.tags,
      loopable: clip.loopable
    })));
    const clipsBytes = encoder.encode(clipsJSON);
    const clipsSize = clipsBytes.length;

    const poseDataSize = this.poses.length * this.featureExtractor.getFeatureVectorSize() * 4;

    const totalSize = 8 + headerSize + clipsSize + poseDataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    view.setUint32(0, headerSize, true);
    view.setUint32(4, clipsSize, true);

    uint8View.set(headerBytes, 8);
    uint8View.set(clipsBytes, 8 + headerSize);

    let offset = 8 + headerSize + clipsSize;
    for (const pose of this.poses) {
      for (let i = 0; i < pose.featureVector.length; i++) {
        view.setFloat32(offset, pose.featureVector[i], true);
        offset += 4;
      }
    }

    return buffer;
  }

  /**
   * Deserializes a database from binary format.
   *
   * @param buffer - Serialized database
   * @param skeleton - Skeleton for pose extraction
   * @returns Deserialized database
   *
   * @example
   * ```typescript
   * const database = MotionDatabase.deserialize(savedData, skeleton);
   * ```
   */
  static deserialize(buffer: ArrayBuffer, skeleton: Skeleton): MotionDatabase {
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    const decoder = new TextDecoder();

    const headerSize = view.getUint32(0, true);
    const clipsSize = view.getUint32(4, true);

    const headerBytes = uint8View.slice(8, 8 + headerSize);
    const headerJSON = decoder.decode(headerBytes);
    const headerData = JSON.parse(headerJSON);

    const clipsBytes = uint8View.slice(8 + headerSize, 8 + headerSize + clipsSize);
    const clipsJSON = decoder.decode(clipsBytes);
    const clipsData = JSON.parse(clipsJSON);

    const database = new MotionDatabase({
      skeleton: skeleton,
      clips: [],
      sampleRate: headerData.sampleRate
    });

    database.clips = clipsData;

    let offset = 8 + headerSize + clipsSize;
    const featureVectorSize = headerData.featureVectorSize;

    for (let i = 0; i < headerData.poseCount; i++) {
      const featureVector = new Float32Array(featureVectorSize);
      for (let j = 0; j < featureVectorSize; j++) {
        featureVector[j] = view.getFloat32(offset, true);
        offset += 4;
      }

      const features = database.featureExtractor.vectorToFeatures(featureVector);

      const pose: PoseEntry = {
        clipIndex: 0,
        time: 0,
        frameIndex: i,
        features: features,
        featureVector: featureVector
      };

      database.poses.push(pose);
    }

    database.rebuildKDTree();

    return database;
  }

  /**
   * Builds the database from clips.
   * @private
   */
  private buildDatabase(config: DatabaseConfig): void {
    for (let i = 0; i < config.clips.length; i++) {
      const clip = config.clips[i];
      const tags = config.clipTags?.[i];
      const loopable = config.loopable?.[i] ?? false;

      const metadata: ClipMetadata = {
        clip: clip,
        name: clip.name,
        sampleRate: this.sampleRate,
        frameCount: Math.floor(clip.duration * this.sampleRate),
        tags: tags,
        loopable: loopable
      };

      this.clips.push(metadata);
      this.extractPosesFromClip(i, metadata);
    }

    this.rebuildKDTree();
  }

  /**
   * Extracts poses from a single clip.
   * @private
   */
  private extractPosesFromClip(clipIndex: number, metadata: ClipMetadata): void {
    const clip = metadata.clip;
    const frameCount = metadata.frameCount;
    const deltaTime = 1.0 / this.sampleRate;

    let previousFeatures: PoseFeatures | null = null;

    for (let frame = 0; frame < frameCount; frame++) {
      const time = frame * deltaTime;

      for (const channel of clip.getAllChannels()) {
        const value = channel.track.evaluate(time);
        if (channel.type === 'position' && value) {
          this.skeleton.setBonePosition(channel.target, value);
        } else if (channel.type === 'rotation' && value) {
          this.skeleton.setBoneRotation(channel.target, value);
        } else if (channel.type === 'scale' && value) {
          this.skeleton.setBoneScale(channel.target, value);
        }
      }
      this.skeleton.update();

      const trajectory: TrajectorySample[] = [];
      for (let i = 0; i < 3; i++) {
        trajectory.push({
          position: Vector3.zero(),
          direction: Vector3.forward()
        });
      }

      let features = this.featureExtractor.extractPoseFeatures(
        this.skeleton,
        Vector3.zero(),
        trajectory
      );

      if (previousFeatures) {
        features = this.featureExtractor.computeVelocities(
          features,
          previousFeatures,
          deltaTime
        );
      }

      const featureVector = this.featureExtractor.featuresToVector(features);

      const pose: PoseEntry = {
        clipIndex: clipIndex,
        time: time,
        frameIndex: frame,
        features: features,
        featureVector: featureVector,
        tags: metadata.tags
      };

      this.poses.push(pose);
      previousFeatures = features;
    }
  }

  /**
   * Rebuilds the KD-tree from current poses.
   * @private
   */
  private rebuildKDTree(): void {
    if (this.poses.length === 0) {
      this.kdTree = null;
      return;
    }

    const points = this.poses.map(pose => pose.featureVector);

    this.kdTree = new KDTree({
      points: points,
      dimensions: this.featureExtractor.getFeatureVectorSize()
    });
  }

  /**
   * Filters search candidates based on options.
   * @private
   */
  private filterCandidates(
    candidates: Array<{ index: number; distanceSq: number }>,
    options: SearchOptions
  ): Array<{ index: number; distanceSq: number }> {
    return candidates.filter(candidate => {
      const pose = this.poses[candidate.index];

      if (options.excludeClips && options.excludeClips.includes(pose.clipIndex)) {
        return false;
      }

      if (options.tags && options.tags.length > 0) {
        if (!pose.tags || !options.tags.some(tag => pose.tags!.includes(tag))) {
          return false;
        }
      }

      if (options.minTimeBetweenMatches && this.lastMatchedPoseIndex !== -1) {
        const lastPose = this.poses[this.lastMatchedPoseIndex];
        if (pose.clipIndex === lastPose.clipIndex) {
          const timeDiff = Math.abs(pose.time - lastPose.time);
          if (timeDiff < options.minTimeBetweenMatches) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Computes transition cost to avoid jittery switching.
   * @private
   */
  private computeTransitionCost(candidateIndex: number, lastIndex: number): number {
    if (lastIndex === -1) {
      return 0;
    }

    const candidate = this.poses[candidateIndex];
    const last = this.poses[lastIndex];

    if (candidate.clipIndex === last.clipIndex) {
      const timeDiff = Math.abs(candidate.time - last.time);
      if (timeDiff < 0.1) {
        return 0.1;
      }
    }

    return 0.5;
  }
}
