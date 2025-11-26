/**
 * G3D 5.0 Gaze-Based LOD Manager
 *
 * Level of Detail (LOD) management based on eye gaze position.
 * Renders objects at gaze center with high detail, and peripheral objects
 * at lower detail for performance optimization.
 *
 * @example
 * ```typescript
 * const lodManager = new GazeBasedLOD({
 *   highDetailRadius: 0.2,
 *   mediumDetailRadius: 0.5,
 *   transitionSpeed: 0.1
 * });
 *
 * // Register objects with LOD levels
 * lodManager.registerObject(mesh, {
 *   high: highDetailMesh,
 *   medium: mediumDetailMesh,
 *   low: lowDetailMesh
 * });
 *
 * // In render loop
 * const gaze = eyeTracker.getGazePosition(frame);
 * lodManager.update(gaze, camera);
 *
 * // Get current LOD for object
 * const lod = lodManager.getLOD(mesh);
 * ```
 */

/**
 * LOD level
 */
export type LODLevel = 'high' | 'medium' | 'low' | 'culled';

/**
 * LOD configuration for an object
 */
export interface LODConfig {
  /** High detail mesh/model */
  high: any;

  /** Medium detail mesh/model */
  medium: any;

  /** Low detail mesh/model */
  low: any;

  /** Optional culled state (null = don't render) */
  culled?: null;
}

/**
 * Gaze-based LOD options
 */
export interface GazeBasedLODOptions {
  /** Radius for high detail (0-1, screen space) */
  highDetailRadius?: number;

  /** Radius for medium detail (0-1, screen space) */
  mediumDetailRadius?: number;

  /** Radius for low detail (beyond this = culled) */
  lowDetailRadius?: number;

  /** LOD transition speed (0-1, higher = faster) */
  transitionSpeed?: number;

  /** Enable smooth transitions */
  smoothTransitions?: boolean;

  /** Performance budget (max objects per frame) */
  performanceBudget?: number;

  /** Priority-based updates */
  priorityBased?: boolean;

  /** Enable distance-based fallback */
  distanceFallback?: boolean;

  /** Debug visualization */
  debug?: boolean;
}

/**
 * Object LOD state
 */
interface ObjectLODState {
  /** Object identifier */
  object: any;

  /** LOD configuration */
  config: LODConfig;

  /** Current LOD level */
  currentLOD: LODLevel;

  /** Target LOD level */
  targetLOD: LODLevel;

  /** Transition progress (0-1) */
  transitionProgress: number;

  /** Screen position (0-1) */
  screenPosition: { x: number; y: number } | null;

  /** Distance from gaze */
  gazeDistance: number;

  /** Distance from camera */
  cameraDistance: number;

  /** Update priority */
  priority: number;

  /** Last update frame */
  lastUpdate: number;
}

/**
 * Camera interface (minimal)
 */
interface Camera {
  position: { x: number; y: number; z: number };
  projectionMatrix: Float32Array | number[];
  viewMatrix: Float32Array | number[];
}

/**
 * Gaze-Based LOD Manager
 *
 * Manages level of detail based on eye gaze position for optimal performance.
 */
export class GazeBasedLOD {
  private options: Required<GazeBasedLODOptions>;

  private objects: Map<any, ObjectLODState> = new Map();

  private gazePosition: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private camera: Camera | null = null;

  private frameCount: number = 0;
  private updateQueue: ObjectLODState[] = [];

  private stats = {
    highDetailCount: 0,
    mediumDetailCount: 0,
    lowDetailCount: 0,
    culledCount: 0,
    transitionsPerFrame: 0
  };

  /**
   * Creates a new Gaze-Based LOD Manager
   *
   * @param options - LOD options
   */
  constructor(options: GazeBasedLODOptions = {}) {
    this.options = {
      highDetailRadius: options.highDetailRadius ?? 0.2,
      mediumDetailRadius: options.mediumDetailRadius ?? 0.5,
      lowDetailRadius: options.lowDetailRadius ?? 0.8,
      transitionSpeed: options.transitionSpeed ?? 0.1,
      smoothTransitions: options.smoothTransitions ?? true,
      performanceBudget: options.performanceBudget ?? 100,
      priorityBased: options.priorityBased ?? true,
      distanceFallback: options.distanceFallback ?? true,
      debug: options.debug ?? false
    };
  }

  /**
   * Registers an object with LOD configuration
   *
   * @param object - Object to manage
   * @param config - LOD configuration
   */
  registerObject(object: any, config: LODConfig): void {
    const state: ObjectLODState = {
      object,
      config,
      currentLOD: 'medium',
      targetLOD: 'medium',
      transitionProgress: 1.0,
      screenPosition: null,
      gazeDistance: 1.0,
      cameraDistance: 0,
      priority: 0,
      lastUpdate: 0
    };

    this.objects.set(object, state);
  }

  /**
   * Unregisters an object
   *
   * @param object - Object to remove
   */
  unregisterObject(object: any): void {
    this.objects.delete(object);
  }

  /**
   * Updates LOD for all objects
   *
   * @param gazePosition - Current gaze position (0-1)
   * @param camera - Camera object
   */
  update(gazePosition: { x: number; y: number }, camera: Camera): void {
    this.gazePosition = gazePosition;
    this.camera = camera;
    this.frameCount++;

    // Reset stats
    this.stats = {
      highDetailCount: 0,
      mediumDetailCount: 0,
      lowDetailCount: 0,
      culledCount: 0,
      transitionsPerFrame: 0
    };

    // Update all objects
    this.updateQueue = Array.from(this.objects.values());

    // Calculate priorities
    if (this.options.priorityBased) {
      this.calculatePriorities();
      this.updateQueue.sort((a, b) => b.priority - a.priority);
    }

    // Update objects within budget
    const budget = this.options.performanceBudget;
    const objectsToUpdate = this.updateQueue.slice(0, budget);

    objectsToUpdate.forEach(state => {
      this.updateObjectLOD(state);
    });

    // Update statistics
    this.updateStatistics();
  }

  /**
   * Calculates update priority for each object
   */
  private calculatePriorities(): void {
    this.updateQueue.forEach(state => {
      let priority = 0;

      // Higher priority for objects near gaze
      priority += (1 - state.gazeDistance) * 100;

      // Higher priority for objects needing transitions
      if (state.currentLOD !== state.targetLOD) {
        priority += 50;
      }

      // Higher priority for closer objects
      if (state.cameraDistance > 0) {
        priority += (1 / state.cameraDistance) * 10;
      }

      // Lower priority for recently updated objects
      const framesSinceUpdate = this.frameCount - state.lastUpdate;
      if (framesSinceUpdate < 10) {
        priority *= 0.5;
      }

      state.priority = priority;
    });
  }

  /**
   * Updates LOD for a single object
   *
   * @param state - Object LOD state
   */
  private updateObjectLOD(state: ObjectLODState): void {
    // Calculate screen position
    state.screenPosition = this.projectToScreen(state.object, this.camera!);

    if (!state.screenPosition) {
      state.targetLOD = 'culled';
      return;
    }

    // Calculate distance from gaze
    const dx = state.screenPosition.x - this.gazePosition.x;
    const dy = state.screenPosition.y - this.gazePosition.y;
    state.gazeDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate camera distance
    state.cameraDistance = this.calculateCameraDistance(state.object, this.camera!);

    // Determine target LOD based on gaze distance
    state.targetLOD = this.determineLODLevel(state.gazeDistance, state.cameraDistance);

    // Handle transitions
    if (this.options.smoothTransitions) {
      this.updateTransition(state);
    } else {
      state.currentLOD = state.targetLOD;
      state.transitionProgress = 1.0;
    }

    state.lastUpdate = this.frameCount;
  }

  /**
   * Determines LOD level based on distances
   *
   * @param gazeDistance - Distance from gaze (0-1)
   * @param cameraDistance - Distance from camera
   * @returns LOD level
   */
  private determineLODLevel(gazeDistance: number, cameraDistance: number): LODLevel {
    // Gaze-based LOD
    if (gazeDistance < this.options.highDetailRadius) {
      return 'high';
    } else if (gazeDistance < this.options.mediumDetailRadius) {
      return 'medium';
    } else if (gazeDistance < this.options.lowDetailRadius) {
      return 'low';
    } else {
      return 'culled';
    }

    // Optional: Distance-based fallback for very far objects
    if (this.options.distanceFallback && cameraDistance > 100) {
      return 'culled';
    }
  }

  /**
   * Updates LOD transition
   *
   * @param state - Object state
   */
  private updateTransition(state: ObjectLODState): void {
    if (state.currentLOD === state.targetLOD) {
      state.transitionProgress = 1.0;
      return;
    }

    // Advance transition
    state.transitionProgress += this.options.transitionSpeed;

    if (state.transitionProgress >= 1.0) {
      // Transition complete
      state.currentLOD = state.targetLOD;
      state.transitionProgress = 1.0;
    }

    this.stats.transitionsPerFrame++;
  }

  /**
   * Projects object to screen space
   *
   * @param object - Object to project
   * @param camera - Camera
   * @returns Screen position (0-1) or null if off-screen
   */
  private projectToScreen(object: any, camera: Camera): { x: number; y: number } | null {
    // This is simplified - real implementation would use proper matrix math
    // Assumes object has a position property

    if (!object.position) {
      return { x: 0.5, y: 0.5 }; // Fallback to center
    }

    const pos = object.position;

    // Simple projection (placeholder)
    // Real implementation would multiply by view-projection matrix
    const screenX = 0.5 + (pos.x - camera.position.x) * 0.1;
    const screenY = 0.5 + (pos.y - camera.position.y) * 0.1;

    // Check if on-screen
    if (screenX < 0 || screenX > 1 || screenY < 0 || screenY > 1) {
      return null; // Off-screen
    }

    return { x: screenX, y: screenY };
  }

  /**
   * Calculates distance from camera
   *
   * @param object - Object
   * @param camera - Camera
   * @returns Distance
   */
  private calculateCameraDistance(object: any, camera: Camera): number {
    if (!object.position) return 0;

    const dx = object.position.x - camera.position.x;
    const dy = object.position.y - camera.position.y;
    const dz = object.position.z - camera.position.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Updates statistics
   */
  private updateStatistics(): void {
    this.objects.forEach(state => {
      switch (state.currentLOD) {
        case 'high':
          this.stats.highDetailCount++;
          break;
        case 'medium':
          this.stats.mediumDetailCount++;
          break;
        case 'low':
          this.stats.lowDetailCount++;
          break;
        case 'culled':
          this.stats.culledCount++;
          break;
      }
    });
  }

  /**
   * Gets current LOD level for an object
   *
   * @param object - Object to query
   * @returns Current LOD level or null
   */
  getLOD(object: any): LODLevel | null {
    const state = this.objects.get(object);
    return state ? state.currentLOD : null;
  }

  /**
   * Gets current LOD mesh/model for an object
   *
   * @param object - Object to query
   * @returns LOD mesh/model or null
   */
  getLODMesh(object: any): any {
    const state = this.objects.get(object);
    if (!state) return null;

    const lod = state.currentLOD;

    switch (lod) {
      case 'high':
        return state.config.high;
      case 'medium':
        return state.config.medium;
      case 'low':
        return state.config.low;
      case 'culled':
        return state.config.culled || null;
      default:
        return null;
    }
  }

  /**
   * Gets transition progress for an object
   *
   * @param object - Object to query
   * @returns Transition progress (0-1)
   */
  getTransitionProgress(object: any): number {
    const state = this.objects.get(object);
    return state ? state.transitionProgress : 1.0;
  }

  /**
   * Forces LOD level for an object
   *
   * @param object - Object
   * @param level - LOD level to force
   */
  forceLOD(object: any, level: LODLevel): void {
    const state = this.objects.get(object);
    if (state) {
      state.currentLOD = level;
      state.targetLOD = level;
      state.transitionProgress = 1.0;
    }
  }

  /**
   * Gets all objects at a specific LOD level
   *
   * @param level - LOD level
   * @returns Array of objects
   */
  getObjectsAtLOD(level: LODLevel): any[] {
    const objects: any[] = [];

    this.objects.forEach(state => {
      if (state.currentLOD === level) {
        objects.push(state.object);
      }
    });

    return objects;
  }

  /**
   * Gets current statistics
   *
   * @returns LOD statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalObjects: this.objects.size,
      renderableObjects: this.stats.highDetailCount +
                        this.stats.mediumDetailCount +
                        this.stats.lowDetailCount
    };
  }

  /**
   * Estimates performance gain from LOD
   *
   * @param highDetailCost - Relative cost of high detail (default: 1.0)
   * @param mediumDetailCost - Relative cost of medium detail (default: 0.5)
   * @param lowDetailCost - Relative cost of low detail (default: 0.2)
   * @returns Performance gain percentage
   */
  estimatePerformanceGain(
    highDetailCost: number = 1.0,
    mediumDetailCost: number = 0.5,
    lowDetailCost: number = 0.2
  ): number {
    const totalObjects = this.objects.size;
    if (totalObjects === 0) return 0;

    // Cost if everything was high detail
    const maxCost = totalObjects * highDetailCost;

    // Actual cost with LOD
    const actualCost =
      this.stats.highDetailCount * highDetailCost +
      this.stats.mediumDetailCount * mediumDetailCost +
      this.stats.lowDetailCount * lowDetailCost;

    return ((maxCost - actualCost) / maxCost) * 100;
  }

  /**
   * Resets all objects to default LOD
   */
  reset(): void {
    this.objects.forEach(state => {
      state.currentLOD = 'medium';
      state.targetLOD = 'medium';
      state.transitionProgress = 1.0;
      state.lastUpdate = 0;
    });
  }

  /**
   * Clears all registered objects
   */
  clear(): void {
    this.objects.clear();
  }
}
