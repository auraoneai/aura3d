/**
 * @fileoverview Path following with smoothing, lookahead, and speed control.
 * Provides advanced path following behaviors for smooth agent movement.
 * @module ai/navigation/PathFollower
 */

import { Vector3 } from '../../math/Vector3';
import { NavigationPath } from './PathFinder';
import { Logger } from '../../core/Logger';

const logger = Logger.create('PathFollower');

/**
 * Path following configuration.
 */
export interface PathFollowerConfig {
  lookaheadDistance: number;
  pathOffset: number;
  arrivalDistance: number;
  slowingDistance: number;
  smoothingIterations: number;
  smoothingFactor: number;
}

/**
 * Default path follower configuration.
 */
export const DefaultPathFollowerConfig: PathFollowerConfig = {
  lookaheadDistance: 2.0,
  pathOffset: 0.0,
  arrivalDistance: 0.5,
  slowingDistance: 3.0,
  smoothingIterations: 3,
  smoothingFactor: 0.5,
};

/**
 * Path follower with advanced smoothing and speed control.
 * Provides lookahead-based steering and adaptive speed modulation.
 */
export class PathFollower {
  private config: PathFollowerConfig;
  private currentPath: NavigationPath | null = null;
  private smoothedPath: Vector3[] = [];
  private currentSegment: number = 0;
  private pathPosition: number = 0;

  constructor(config: Partial<PathFollowerConfig> = {}) {
    this.config = { ...DefaultPathFollowerConfig, ...config };
  }

  /**
   * Sets a new path to follow.
   */
  setPath(path: NavigationPath): void {
    this.currentPath = path;
    this.smoothedPath = this.smoothPath(path.waypoints);
    this.currentSegment = 0;
    this.pathPosition = 0;

    logger.debug('Path set for following', {
      originalWaypoints: path.waypoints.length,
      smoothedWaypoints: this.smoothedPath.length
    });
  }

  /**
   * Gets steering direction for current position along path.
   */
  getSteering(position: Vector3, currentSpeed: number, maxSpeed: number): {
    direction: Vector3;
    targetSpeed: number;
  } {
    if (!this.currentPath || this.smoothedPath.length < 2) {
      return { direction: new Vector3(), targetSpeed: 0 };
    }

    const closestPoint = this.findClosestPointOnPath(position);
    const lookaheadPoint = this.findLookaheadPoint(closestPoint, this.config.lookaheadDistance);

    const direction = lookaheadPoint.sub(position).normalize();

    const distanceToEnd = this.getDistanceToEnd(closestPoint);
    const targetSpeed = this.calculateTargetSpeed(distanceToEnd, maxSpeed);

    return { direction, targetSpeed };
  }

  /**
   * Smooths path waypoints using Catmull-Rom spline interpolation.
   */
  private smoothPath(waypoints: Vector3[]): Vector3[] {
    if (waypoints.length < 3) return waypoints;

    let smoothed = [...waypoints];

    for (let iter = 0; iter < this.config.smoothingIterations; iter++) {
      const newPath: Vector3[] = [smoothed[0]];

      for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const next = smoothed[i + 1];

        const smoothPoint = new Vector3(
          curr.x + (prev!.x - curr.x + next!.x - curr.x) * this.config.smoothingFactor * 0.5,
          curr.y + (prev!.y - curr.y + next!.y - curr.y) * this.config.smoothingFactor * 0.5,
          curr.z + (prev!.z - curr.z + next!.z - curr.z) * this.config.smoothingFactor * 0.5
        );

        newPath.push(smoothPoint);
      }

      newPath.push(smoothed[smoothed.length - 1]);
      smoothed = newPath;
    }

    return this.subdividePath(smoothed, this.config.lookaheadDistance * 0.5);
  }

  /**
   * Subdivides path segments for smoother following.
   */
  private subdividePath(waypoints: Vector3[], maxSegmentLength: number): Vector3[] {
    const subdivided: Vector3[] = [waypoints[0]];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const start = waypoints[i]!;
      const end = waypoints[i + 1]!;
      const segmentLength = start.distanceTo(end);

      if (segmentLength > maxSegmentLength) {
        const subdivisions = Math.ceil(segmentLength / maxSegmentLength);

        for (let j = 1; j <= subdivisions; j++) {
          const t = j / subdivisions;
          const point = start.lerp(end, t);
          subdivided.push(point);
        }
      } else {
        subdivided.push(end);
      }
    }

    return subdivided;
  }

  /**
   * Finds closest point on path to given position.
   */
  private findClosestPointOnPath(position: Vector3): { point: Vector3; segmentIndex: number; t: number } {
    let closestPoint = this.smoothedPath[0];
    let closestSegment = 0;
    let closestT = 0;
    let minDistSq = position.distanceTo(closestPoint) ** 2;

    for (let i = 0; i < this.smoothedPath.length - 1; i++) {
      const a = this.smoothedPath[i];
      const b = this.smoothedPath[i + 1];

      const { point, t } = this.closestPointOnSegment(position, a, b);
      const distSq = position.distanceTo(point) ** 2;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        closestPoint = point;
        closestSegment = i;
        closestT = t;
      }
    }

    return { point: closestPoint, segmentIndex: closestSegment, t: closestT };
  }

  /**
   * Finds point on path at lookahead distance from current point.
   */
  private findLookaheadPoint(
    currentPoint: { point: Vector3; segmentIndex: number; t: number },
    lookaheadDistance: number
  ): Vector3 {
    let remainingDistance = lookaheadDistance;
    let segmentIndex = currentPoint.segmentIndex;
    let currentPos = currentPoint.point;

    while (segmentIndex < this.smoothedPath.length - 1 && remainingDistance > 0) {
      const segmentEnd = this.smoothedPath[segmentIndex + 1]!;
      const toEnd = segmentEnd.sub(currentPos);
      const segmentLength = toEnd.length();

      if (segmentLength >= remainingDistance) {
        return currentPos.add(toEnd.normalize().scale(remainingDistance));
      }

      remainingDistance -= segmentLength;
      currentPos = segmentEnd;
      segmentIndex++;
    }

    return this.smoothedPath[this.smoothedPath.length - 1];
  }

  /**
   * Calculates closest point on line segment to given point.
   */
  private closestPointOnSegment(
    point: Vector3,
    a: Vector3,
    b: Vector3
  ): { point: Vector3; t: number } {
    const ab = b.sub(a);
    const ap = point.sub(a);
    const abLenSq = ab.dot(ab);

    if (abLenSq < 1e-6) {
      return { point: a, t: 0 };
    }

    const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
    const closestPoint = a.add(ab.scale(t));

    return { point: closestPoint, t };
  }

  /**
   * Gets remaining distance to end of path.
   */
  private getDistanceToEnd(currentPoint: { point: Vector3; segmentIndex: number; t: number }): number {
    let distance = 0;

    const currentSegmentEnd = this.smoothedPath[currentPoint.segmentIndex + 1];
    if (currentSegmentEnd) {
      distance += currentPoint.point.distanceTo(currentSegmentEnd);
    }

    for (let i = currentPoint.segmentIndex + 1; i < this.smoothedPath.length - 1; i++) {
      distance += this.smoothedPath[i]!.distanceTo(this.smoothedPath[i + 1]!);
    }

    return distance;
  }

  /**
   * Calculates target speed based on distance to end.
   */
  private calculateTargetSpeed(distanceToEnd: number, maxSpeed: number): number {
    if (distanceToEnd < this.config.arrivalDistance) {
      return 0;
    }

    if (distanceToEnd < this.config.slowingDistance) {
      const slowdownFactor = (distanceToEnd - this.config.arrivalDistance) /
                            (this.config.slowingDistance - this.config.arrivalDistance);
      return maxSpeed * slowdownFactor;
    }

    return maxSpeed;
  }

  /**
   * Checks if path following is complete.
   */
  isComplete(position: Vector3): boolean {
    if (!this.currentPath || this.smoothedPath.length === 0) {
      return true;
    }

    const end = this.smoothedPath[this.smoothedPath.length - 1];
    return position.distanceTo(end) < this.config.arrivalDistance;
  }

  /**
   * Gets current path.
   */
  getPath(): NavigationPath | null {
    return this.currentPath;
  }

  /**
   * Gets smoothed waypoints.
   */
  getSmoothedWaypoints(): Vector3[] {
    return this.smoothedPath;
  }

  /**
   * Clears current path.
   */
  clear(): void {
    this.currentPath = null;
    this.smoothedPath = [];
    this.currentSegment = 0;
    this.pathPosition = 0;
  }
}
