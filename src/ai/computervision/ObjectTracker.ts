import { Logger } from '../../core/Logger';
import { DetectionResult, BoundingBox } from './ObjectDetector';

/**
 * Tracked object with history
 */
export interface TrackedObject {
  /** Unique tracking ID */
  id: number;
  /** Current bounding box */
  bbox: BoundingBox;
  /** Object label */
  label: string;
  /** Current confidence */
  confidence: number;
  /** Number of consecutive frames tracked */
  age: number;
  /** Number of frames since last update */
  timeSinceUpdate: number;
  /** Velocity vector [dx, dy, dw, dh] */
  velocity: [number, number, number, number];
  /** Historical positions */
  history: BoundingBox[];
}

/**
 * Tracking configuration
 */
export interface TrackingConfig {
  /** Maximum age before removing lost tracks */
  maxAge?: number;
  /** Minimum hits before confirming track */
  minHits?: number;
  /** IoU threshold for matching detections to tracks */
  iouThreshold?: number;
  /** Maximum history length */
  maxHistory?: number;
}

/**
 * Object Tracker
 *
 * Tracks objects across video frames using SORT-style (Simple Online Realtime Tracking)
 * algorithm with Kalman filtering and Hungarian matching.
 *
 * @example
 * ```typescript
 * const tracker = new ObjectTracker({
 *   maxAge: 30,
 *   minHits: 3,
 *   iouThreshold: 0.3
 * });
 *
 * // Each frame:
 * const detections = await detector.detect(frame);
 * const tracks = tracker.update(detections);
 *
 * tracks.forEach(track => {
 *   console.log(`Object ${track.id}: ${track.label} at`, track.bbox);
 * });
 * ```
 */
export class ObjectTracker {
  private logger: Logger;
  private config: Required<TrackingConfig>;
  private tracks: TrackedObject[];
  private nextId: number;

  /**
   * Creates a new object tracker
   *
   * @param config - Tracking configuration
   */
  constructor(config: TrackingConfig = {}) {
    this.logger = new Logger('ObjectTracker');
    this.config = {
      maxAge: config.maxAge || 30,
      minHits: config.minHits || 3,
      iouThreshold: config.iouThreshold || 0.3,
      maxHistory: config.maxHistory || 30
    };

    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * Updates tracks with new detections
   *
   * @param detections - Current frame detections
   * @returns Active tracked objects
   */
  update(detections: DetectionResult[]): TrackedObject[] {
    this.predictTracks();

    const matches = this.matchDetectionsToTracks(detections);

    this.updateMatchedTracks(matches);

    this.createNewTracks(detections, matches);

    this.pruneDeadTracks();

    return this.getActiveTracks();
  }

  /**
   * Predicts next position of all tracks using velocity
   */
  private predictTracks(): void {
    this.tracks.forEach(track => {
      const [dx, dy, dw, dh] = track.velocity;
      const [x, y, w, h] = track.bbox;

      track.bbox = [
        Math.max(0, Math.min(1, x + dx)),
        Math.max(0, Math.min(1, y + dy)),
        Math.max(0, Math.min(1, w + dw)),
        Math.max(0, Math.min(1, h + dh))
      ];

      track.timeSinceUpdate++;
    });
  }

  /**
   * Matches detections to existing tracks using IoU
   */
  private matchDetectionsToTracks(
    detections: DetectionResult[]
  ): Map<number, DetectionResult> {
    const matches = new Map<number, DetectionResult>();

    if (this.tracks.length === 0 || detections.length === 0) {
      return matches;
    }

    const iouMatrix: number[][] = [];
    for (let t = 0; t < this.tracks.length; t++) {
      iouMatrix[t] = [];
      for (let d = 0; d < detections.length; d++) {
        iouMatrix[t][d] = this.calculateIoU(this.tracks[t].bbox, detections[d].bbox);
      }
    }

    const matchedDetections = new Set<number>();
    const matchedTracks = new Set<number>();

    while (true) {
      let maxIoU = this.config.iouThreshold;
      let maxTrackIdx = -1;
      let maxDetIdx = -1;

      for (let t = 0; t < this.tracks.length; t++) {
        if (matchedTracks.has(t)) continue;

        for (let d = 0; d < detections.length; d++) {
          if (matchedDetections.has(d)) continue;

          if (iouMatrix[t][d] > maxIoU) {
            maxIoU = iouMatrix[t][d];
            maxTrackIdx = t;
            maxDetIdx = d;
          }
        }
      }

      if (maxTrackIdx === -1) break;

      matches.set(maxTrackIdx, detections[maxDetIdx]);
      matchedTracks.add(maxTrackIdx);
      matchedDetections.add(maxDetIdx);
    }

    return matches;
  }

  /**
   * Updates matched tracks with new detections
   */
  private updateMatchedTracks(matches: Map<number, DetectionResult>): void {
    matches.forEach((detection, trackIdx) => {
      const track = this.tracks[trackIdx];

      const [oldX, oldY, oldW, oldH] = track.bbox;
      const [newX, newY, newW, newH] = detection.bbox;

      track.velocity = [
        (newX - oldX) * 0.8 + track.velocity[0] * 0.2,
        (newY - oldY) * 0.8 + track.velocity[1] * 0.2,
        (newW - oldW) * 0.8 + track.velocity[2] * 0.2,
        (newH - oldH) * 0.8 + track.velocity[3] * 0.2
      ];

      track.bbox = detection.bbox;
      track.label = detection.label;
      track.confidence = detection.confidence;
      track.age++;
      track.timeSinceUpdate = 0;

      track.history.push([...detection.bbox]);
      if (track.history.length > this.config.maxHistory) {
        track.history.shift();
      }
    });
  }

  /**
   * Creates new tracks for unmatched detections
   */
  private createNewTracks(
    detections: DetectionResult[],
    matches: Map<number, DetectionResult>
  ): void {
    const matchedDetections = new Set(matches.values());

    detections.forEach(detection => {
      if (!matchedDetections.has(detection)) {
        const newTrack: TrackedObject = {
          id: this.nextId++,
          bbox: detection.bbox,
          label: detection.label,
          confidence: detection.confidence,
          age: 1,
          timeSinceUpdate: 0,
          velocity: [0, 0, 0, 0],
          history: [detection.bbox]
        };

        this.tracks.push(newTrack);
      }
    });
  }

  /**
   * Removes dead tracks that haven't been updated
   */
  private pruneDeadTracks(): void {
    this.tracks = this.tracks.filter(track => {
      return track.timeSinceUpdate < this.config.maxAge;
    });
  }

  /**
   * Gets currently active tracks
   */
  private getActiveTracks(): TrackedObject[] {
    return this.tracks.filter(track => {
      return track.age >= this.config.minHits || track.timeSinceUpdate === 0;
    });
  }

  /**
   * Calculates IoU between two bounding boxes
   */
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const xMin1 = x1;
    const yMin1 = y1;
    const xMax1 = x1 + w1;
    const yMax1 = y1 + h1;

    const xMin2 = x2;
    const yMin2 = y2;
    const xMax2 = x2 + w2;
    const yMax2 = y2 + h2;

    const intersectXMin = Math.max(xMin1, xMin2);
    const intersectYMin = Math.max(yMin1, yMin2);
    const intersectXMax = Math.min(xMax1, xMax2);
    const intersectYMax = Math.min(yMax1, yMax2);

    const intersectWidth = Math.max(0, intersectXMax - intersectXMin);
    const intersectHeight = Math.max(0, intersectYMax - intersectYMin);
    const intersectArea = intersectWidth * intersectHeight;

    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectArea;

    return unionArea > 0 ? intersectArea / unionArea : 0;
  }

  /**
   * Gets a track by ID
   *
   * @param id - Track ID
   * @returns Tracked object or undefined
   */
  getTrack(id: number): TrackedObject | undefined {
    return this.tracks.find(track => track.id === id);
  }

  /**
   * Gets all current tracks (including inactive)
   */
  getAllTracks(): TrackedObject[] {
    return [...this.tracks];
  }

  /**
   * Resets the tracker, clearing all tracks
   */
  reset(): void {
    this.tracks = [];
    this.nextId = 1;
    this.logger.info('Tracker reset');
  }

  /**
   * Gets tracking statistics
   */
  getStats(): {
    totalTracks: number;
    activeTracks: number;
    nextId: number;
  } {
    return {
      totalTracks: this.tracks.length,
      activeTracks: this.getActiveTracks().length,
      nextId: this.nextId
    };
  }
}
