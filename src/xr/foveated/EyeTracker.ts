/**
 * G3D 5.0 Eye Tracker
 *
 * Eye tracking integration for WebXR with gaze position detection,
 * fixation/saccade detection, smoothing filters, and fallback strategies.
 *
 * @example
 * ```typescript
 * const eyeTracker = new EyeTracker({
 *   smoothing: 0.3,
 *   fixationThreshold: 0.02,
 *   fallbackToHead: true
 * });
 *
 * // In XR frame loop
 * function onXRFrame(time, frame) {
 *   const gaze = eyeTracker.getGazePosition(frame);
 *   console.log('Gaze at:', gaze.normalized); // (0-1, 0-1)
 *   console.log('Direction:', gaze.direction);
 *
 *   if (eyeTracker.isFixating()) {
 *     console.log('User is fixating on a point');
 *   }
 * }
 * ```
 */

/**
 * Eye tracking options
 */
export interface EyeTrackerOptions {
  /** Smoothing factor (0 = no smoothing, 1 = maximum smoothing) */
  smoothing?: number;

  /** Fixation detection threshold in radians */
  fixationThreshold?: number;

  /** Minimum fixation duration in milliseconds */
  fixationDuration?: number;

  /** Saccade detection threshold in radians/ms */
  saccadeThreshold?: number;

  /** Fallback to head direction when eye tracking unavailable */
  fallbackToHead?: boolean;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Gaze position information
 */
export interface GazePosition {
  /** Normalized screen coordinates (0-1, 0-1) */
  normalized: { x: number; y: number };

  /** Gaze direction vector */
  direction: { x: number; y: number; z: number };

  /** Gaze origin point */
  origin: { x: number; y: number; z: number };

  /** Confidence (0-1, 1 = high confidence) */
  confidence: number;

  /** Is using eye tracking (false = fallback to head) */
  isEyeTracked: boolean;

  /** Timestamp */
  timestamp: number;
}

/**
 * Fixation state
 */
export interface FixationState {
  /** Is currently fixating */
  isFixating: boolean;

  /** Fixation duration in milliseconds */
  duration: number;

  /** Fixation center point */
  center: { x: number; y: number } | null;

  /** Fixation start time */
  startTime: number;
}

/**
 * Saccade detection result
 */
export interface SaccadeState {
  /** Is currently in saccade */
  isSaccade: boolean;

  /** Saccade velocity in radians/ms */
  velocity: number;

  /** Saccade start position */
  startPosition: { x: number; y: number } | null;

  /** Saccade end position */
  endPosition: { x: number; y: number } | null;
}

/**
 * Eye Tracker
 *
 * Provides eye tracking functionality with gaze detection, smoothing,
 * fixation/saccade detection, and fallback to head tracking.
 */
export class EyeTracker {
  private options: Required<EyeTrackerOptions>;

  private currentGaze: GazePosition | null = null;
  private previousGaze: GazePosition | null = null;

  private smoothedGaze: { x: number; y: number } = { x: 0.5, y: 0.5 };

  private fixationState: FixationState = {
    isFixating: false,
    duration: 0,
    center: null,
    startTime: 0
  };

  private saccadeState: SaccadeState = {
    isSaccade: false,
    velocity: 0,
    startPosition: null,
    endPosition: null
  };

  private isSupported: boolean = false;
  private lastUpdateTime: number = 0;

  /**
   * Creates a new Eye Tracker
   *
   * @param options - Eye tracker options
   */
  constructor(options: EyeTrackerOptions = {}) {
    this.options = {
      smoothing: options.smoothing ?? 0.3,
      fixationThreshold: options.fixationThreshold ?? 0.02, // ~1.15 degrees
      fixationDuration: options.fixationDuration ?? 100, // 100ms
      saccadeThreshold: options.saccadeThreshold ?? 0.5, // radians/ms
      fallbackToHead: options.fallbackToHead ?? true,
      debug: options.debug ?? false
    };
  }

  /**
   * Gets the current gaze position from XR frame
   *
   * @param frame - Current XR frame
   * @param referenceSpace - XR reference space
   * @returns Gaze position information
   */
  getGazePosition(frame: XRFrame, referenceSpace?: XRReferenceSpace): GazePosition {
    const now = performance.now();
    const deltaTime = this.lastUpdateTime > 0 ? now - this.lastUpdateTime : 0;
    this.lastUpdateTime = now;

    // Store previous gaze
    if (this.currentGaze) {
      this.previousGaze = { ...this.currentGaze };
    }

    // Try to get eye tracking data
    const eyeGaze = this.getEyeTrackingData(frame, referenceSpace);

    if (eyeGaze) {
      // Eye tracking available
      this.isSupported = true;
      this.currentGaze = eyeGaze;
    } else if (this.options.fallbackToHead && referenceSpace) {
      // Fallback to head tracking
      this.currentGaze = this.getHeadTrackingData(frame, referenceSpace);
    } else {
      // No tracking available, return center
      this.currentGaze = {
        normalized: { x: 0.5, y: 0.5 },
        direction: { x: 0, y: 0, z: -1 },
        origin: { x: 0, y: 0, z: 0 },
        confidence: 0,
        isEyeTracked: false,
        timestamp: now
      };
    }

    // Apply smoothing
    this.applySmoothing(this.currentGaze);

    // Update fixation and saccade detection
    this.updateFixationDetection(deltaTime);
    this.updateSaccadeDetection(deltaTime);

    return {
      ...this.currentGaze,
      normalized: { ...this.smoothedGaze }
    };
  }

  /**
   * Gets eye tracking data from frame
   *
   * @param frame - XR frame
   * @param referenceSpace - Reference space
   * @returns Eye tracking gaze or null
   */
  private getEyeTrackingData(
    frame: XRFrame,
    referenceSpace?: XRReferenceSpace
  ): GazePosition | null {
    // Check for eye tracking support
    // Note: WebXR eye tracking is still experimental
    if (!referenceSpace) return null;

    try {
      // Try to access eye tracking via input sources
      for (const source of frame.session.inputSources) {
        if (source.targetRayMode === 'gaze') {
          const pose = frame.getPose(source.targetRaySpace, referenceSpace);
          if (!pose) continue;

          const transform = pose.transform;
          const direction = this.transformToDirection(transform);
          const screenPos = this.directionToScreen(direction);

          return {
            normalized: screenPos,
            direction,
            origin: {
              x: transform.position.x,
              y: transform.position.y,
              z: transform.position.z
            },
            confidence: 1.0,
            isEyeTracked: true,
            timestamp: performance.now()
          };
        }
      }
    } catch (error) {
      if (this.options.debug) {
        console.warn('Eye tracking error:', error);
      }
    }

    return null;
  }

  /**
   * Gets head tracking data as fallback
   *
   * @param frame - XR frame
   * @param referenceSpace - Reference space
   * @returns Head tracking gaze
   */
  private getHeadTrackingData(
    frame: XRFrame,
    referenceSpace: XRReferenceSpace
  ): GazePosition {
    const viewerPose = frame.getViewerPose(referenceSpace);

    if (!viewerPose) {
      // Return center if no pose available
      return {
        normalized: { x: 0.5, y: 0.5 },
        direction: { x: 0, y: 0, z: -1 },
        origin: { x: 0, y: 0, z: 0 },
        confidence: 0,
        isEyeTracked: false,
        timestamp: performance.now()
      };
    }

    // Use the first view (left eye) for head direction
    const view = viewerPose.views[0];
    const transform = view.transform;
    const direction = this.transformToDirection(transform);
    const screenPos = this.directionToScreen(direction);

    return {
      normalized: screenPos,
      direction,
      origin: {
        x: transform.position.x,
        y: transform.position.y,
        z: transform.position.z
      },
      confidence: 0.5, // Lower confidence for head tracking
      isEyeTracked: false,
      timestamp: performance.now()
    };
  }

  /**
   * Converts transform to direction vector
   *
   * @param transform - XR rigid transform
   * @returns Direction vector
   */
  private transformToDirection(transform: XRRigidTransform): { x: number; y: number; z: number } {
    // Transform forward vector (0, 0, -1) by orientation quaternion
    const q = transform.orientation;
    const x = 0;
    const y = 0;
    const z = -1;

    // Quaternion rotation
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;

    return {
      x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
    };
  }

  /**
   * Converts direction vector to screen coordinates
   *
   * @param direction - Direction vector
   * @returns Screen coordinates (0-1)
   */
  private directionToScreen(direction: { x: number; y: number; z: number }): { x: number; y: number } {
    // Assuming a standard FOV and mapping direction to screen
    // This is simplified - real implementation would use projection matrix

    const fov = Math.PI / 2; // 90 degrees FOV
    const halfFov = fov / 2;

    // Calculate angles
    const angleX = Math.atan2(direction.x, -direction.z);
    const angleY = Math.atan2(direction.y, -direction.z);

    // Map to 0-1 range
    const x = 0.5 + (angleX / halfFov) * 0.5;
    const y = 0.5 - (angleY / halfFov) * 0.5; // Invert Y

    // Clamp to 0-1
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  /**
   * Applies exponential smoothing to gaze position
   *
   * @param gaze - Current gaze position
   */
  private applySmoothing(gaze: GazePosition): void {
    const alpha = 1 - this.options.smoothing;

    this.smoothedGaze.x = alpha * gaze.normalized.x + (1 - alpha) * this.smoothedGaze.x;
    this.smoothedGaze.y = alpha * gaze.normalized.y + (1 - alpha) * this.smoothedGaze.y;
  }

  /**
   * Updates fixation detection
   *
   * @param deltaTime - Time since last update in milliseconds
   */
  private updateFixationDetection(deltaTime: number): void {
    if (!this.currentGaze) return;

    const current = this.currentGaze.normalized;

    if (this.fixationState.isFixating) {
      // Check if still fixating
      const center = this.fixationState.center!;
      const distance = this.calculateDistance(current, center);

      if (distance < this.options.fixationThreshold) {
        // Still fixating
        this.fixationState.duration += deltaTime;
      } else {
        // Fixation ended
        this.fixationState.isFixating = false;
        this.fixationState.duration = 0;
        this.fixationState.center = null;
      }
    } else {
      // Check if starting fixation
      if (this.previousGaze) {
        const prev = this.previousGaze.normalized;
        const distance = this.calculateDistance(current, prev);

        if (distance < this.options.fixationThreshold) {
          // Potential fixation start
          if (this.fixationState.startTime === 0) {
            this.fixationState.startTime = performance.now();
            this.fixationState.center = { ...current };
          } else {
            const duration = performance.now() - this.fixationState.startTime;

            if (duration >= this.options.fixationDuration) {
              // Fixation confirmed
              this.fixationState.isFixating = true;
              this.fixationState.duration = duration;
            }
          }
        } else {
          // Movement detected, reset
          this.fixationState.startTime = 0;
          this.fixationState.center = null;
        }
      }
    }
  }

  /**
   * Updates saccade detection
   *
   * @param deltaTime - Time since last update in milliseconds
   */
  private updateSaccadeDetection(deltaTime: number): void {
    if (!this.currentGaze || !this.previousGaze || deltaTime === 0) {
      this.saccadeState.isSaccade = false;
      return;
    }

    const current = this.currentGaze.normalized;
    const prev = this.previousGaze.normalized;

    const distance = this.calculateDistance(current, prev);
    const velocity = distance / deltaTime;

    if (velocity > this.options.saccadeThreshold) {
      // Saccade detected
      if (!this.saccadeState.isSaccade) {
        this.saccadeState.startPosition = { ...prev };
      }

      this.saccadeState.isSaccade = true;
      this.saccadeState.velocity = velocity;
      this.saccadeState.endPosition = { ...current };

      // Reset fixation during saccade
      this.fixationState.isFixating = false;
      this.fixationState.duration = 0;
      this.fixationState.startTime = 0;
    } else {
      if (this.saccadeState.isSaccade) {
        // Saccade ended
        if (this.options.debug) {
          console.log('Saccade completed:', this.saccadeState);
        }
      }

      this.saccadeState.isSaccade = false;
      this.saccadeState.velocity = 0;
      this.saccadeState.startPosition = null;
      this.saccadeState.endPosition = null;
    }
  }

  /**
   * Calculates Euclidean distance between two points
   *
   * @param a - First point
   * @param b - Second point
   * @returns Distance
   */
  private calculateDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Checks if user is currently fixating
   *
   * @returns True if fixating
   */
  isFixating(): boolean {
    return this.fixationState.isFixating;
  }

  /**
   * Gets current fixation state
   *
   * @returns Fixation state
   */
  getFixationState(): FixationState {
    return { ...this.fixationState };
  }

  /**
   * Checks if user is currently in saccade
   *
   * @returns True if in saccade
   */
  isSaccade(): boolean {
    return this.saccadeState.isSaccade;
  }

  /**
   * Gets current saccade state
   *
   * @returns Saccade state
   */
  getSaccadeState(): SaccadeState {
    return { ...this.saccadeState };
  }

  /**
   * Checks if eye tracking is supported and active
   *
   * @returns True if eye tracking is available
   */
  isEyeTrackingSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Gets the raw (unsmoothed) gaze position
   *
   * @returns Current gaze or null
   */
  getRawGaze(): GazePosition | null {
    return this.currentGaze;
  }

  /**
   * Gets the smoothed gaze position
   *
   * @returns Smoothed gaze coordinates
   */
  getSmoothedGaze(): { x: number; y: number } {
    return { ...this.smoothedGaze };
  }

  /**
   * Resets the eye tracker state
   */
  reset(): void {
    this.currentGaze = null;
    this.previousGaze = null;
    this.smoothedGaze = { x: 0.5, y: 0.5 };

    this.fixationState = {
      isFixating: false,
      duration: 0,
      center: null,
      startTime: 0
    };

    this.saccadeState = {
      isSaccade: false,
      velocity: 0,
      startPosition: null,
      endPosition: null
    };

    this.lastUpdateTime = 0;
  }
}
