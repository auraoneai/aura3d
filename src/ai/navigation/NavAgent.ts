/**
 * @fileoverview Navigation agent with steering behaviors and path following.
 * Provides autonomous movement with obstacle avoidance integration.
 * @module ai/navigation/NavAgent
 */

import { Vector3 } from '../../math/Vector3';
import { NavMesh } from './NavMesh';
import { PathFinder, NavigationPath, PathStatus } from './PathFinder';
import { Logger } from '../../core/Logger';

const logger = Logger.create('NavAgent');

/**
 * Agent movement state.
 */
export enum AgentState {
  IDLE = 'idle',
  MOVING = 'moving',
  ARRIVED = 'arrived',
  BLOCKED = 'blocked',
  PAUSED = 'paused',
}

/**
 * Steering behavior modes.
 */
export enum SteeringMode {
  SEEK = 'seek',
  FLEE = 'flee',
  ARRIVE = 'arrive',
  PURSUE = 'pursue',
  EVADE = 'evade',
  WANDER = 'wander',
}

/**
 * Navigation agent configuration.
 */
export interface NavAgentConfig {
  maxSpeed: number;
  maxAcceleration: number;
  radius: number;
  height: number;
  waypointRadius: number;
  arrivalRadius: number;
  slowingRadius: number;
  avoidanceEnabled: boolean;
}

/**
 * Default agent configuration.
 */
export const DefaultNavAgentConfig: NavAgentConfig = {
  maxSpeed: 5.0,
  maxAcceleration: 10.0,
  radius: 0.5,
  height: 2.0,
  waypointRadius: 0.5,
  arrivalRadius: 0.1,
  slowingRadius: 2.0,
  avoidanceEnabled: true,
};

/**
 * Navigation agent for autonomous movement along paths.
 * Integrates pathfinding, steering, and obstacle avoidance.
 */
export class NavAgent {
  position: Vector3;
  velocity: Vector3;
  heading: Vector3;

  maxSpeed: number;
  maxAcceleration: number;
  radius: number;
  height: number;

  currentPath: NavigationPath | null;
  waypointIndex: number;

  waypointRadius: number;
  arrivalRadius: number;
  slowingRadius: number;

  state: AgentState;
  steeringMode: SteeringMode;

  avoidanceEnabled: boolean;
  avoidanceWeight: number;

  enabled: boolean;

  destination: Vector3 | null;

  userData: any;

  constructor(position: Vector3 = new Vector3(), config: Partial<NavAgentConfig> = {}) {
    const finalConfig = { ...DefaultNavAgentConfig, ...config };

    this.position = position.clone();
    this.velocity = new Vector3();
    this.heading = new Vector3(0, 0, 1);

    this.maxSpeed = finalConfig.maxSpeed;
    this.maxAcceleration = finalConfig.maxAcceleration;
    this.radius = finalConfig.radius;
    this.height = finalConfig.height;

    this.currentPath = null;
    this.waypointIndex = 0;

    this.waypointRadius = finalConfig.waypointRadius;
    this.arrivalRadius = finalConfig.arrivalRadius;
    this.slowingRadius = finalConfig.slowingRadius;

    this.state = AgentState.IDLE;
    this.steeringMode = SteeringMode.ARRIVE;

    this.avoidanceEnabled = finalConfig.avoidanceEnabled;
    this.avoidanceWeight = 2.0;

    this.enabled = true;
    this.destination = null;
    this.userData = null;
  }

  /**
   * Sets destination and computes path using pathfinder.
   */
  setDestination(destination: Vector3, pathfinder: PathFinder): boolean {
    this.destination = destination.clone();

    const path = pathfinder.findPath(this.position, destination);

    if (path.status === PathStatus.SUCCESS || path.status === PathStatus.PARTIAL) {
      this.currentPath = path;
      this.waypointIndex = 0;
      this.state = AgentState.MOVING;

      logger.trace('Agent destination set', {
        status: path.status,
        waypointCount: path.waypoints.length,
        length: path.length.toFixed(2)
      });

      return true;
    }

    this.currentPath = null;
    this.state = AgentState.BLOCKED;
    logger.warn('Failed to find path to destination', { destination });
    return false;
  }

  /**
   * Updates agent movement for the current frame.
   */
  update(deltaTime: number, navMesh: NavMesh): void {
    if (!this.enabled || this.state === AgentState.IDLE || this.state === AgentState.PAUSED) {
      return;
    }

    if (this.currentPath && this.state === AgentState.MOVING) {
      this.followPath(deltaTime);
    }

    const steering = this.calculateSteering();
    this.applyForce(steering, deltaTime);

    this.position.addInPlace(this.velocity.scale(deltaTime));

    if (this.velocity.lengthSquared() > 0.001) {
      this.heading = this.velocity.normalize();
    }

    this.constrainToNavMesh(navMesh);
  }

  private followPath(deltaTime: number): void {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      this.state = AgentState.ARRIVED;
      this.velocity = new Vector3();
      return;
    }

    const waypoint = this.currentPath.waypoints[this.waypointIndex];
    const distance = this.position.distanceTo(waypoint);

    const threshold = this.waypointIndex === this.currentPath.waypoints.length - 1
      ? this.arrivalRadius
      : this.waypointRadius;

    if (distance < threshold) {
      this.waypointIndex++;

      if (this.waypointIndex >= this.currentPath.waypoints.length) {
        this.state = AgentState.ARRIVED;
        this.velocity = new Vector3();
        logger.trace('Agent arrived at destination');
      }
    }
  }

  private calculateSteering(): Vector3 {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      return new Vector3();
    }

    const waypoint = this.currentPath.waypoints[this.waypointIndex];
    const isLastWaypoint = this.waypointIndex === this.currentPath.waypoints.length - 1;

    let steering: Vector3;

    switch (this.steeringMode) {
      case SteeringMode.ARRIVE:
        steering = isLastWaypoint ? this.arrive(waypoint) : this.seek(waypoint);
        break;
      case SteeringMode.SEEK:
        steering = this.seek(waypoint);
        break;
      case SteeringMode.FLEE:
        steering = this.flee(waypoint);
        break;
      default:
        steering = this.seek(waypoint);
    }

    return steering;
  }

  private seek(target: Vector3): Vector3 {
    const desired = target.sub(this.position).normalize().scale(this.maxSpeed);
    return desired.sub(this.velocity);
  }

  private flee(target: Vector3): Vector3 {
    const desired = this.position.sub(target).normalize().scale(this.maxSpeed);
    return desired.sub(this.velocity);
  }

  private arrive(target: Vector3): Vector3 {
    const toTarget = target.sub(this.position);
    const distance = toTarget.length();

    if (distance < 0.001) {
      return new Vector3();
    }

    let desiredSpeed = this.maxSpeed;

    if (distance < this.slowingRadius) {
      desiredSpeed = this.maxSpeed * (distance / this.slowingRadius);
    }

    const desired = toTarget.normalize().scale(desiredSpeed);
    return desired.sub(this.velocity);
  }

  private applyForce(force: Vector3, deltaTime: number): void {
    const maxForce = this.maxAcceleration * deltaTime;

    if (force.lengthSquared() > maxForce * maxForce) {
      force = force.normalize().scale(maxForce);
    }

    this.velocity.addInPlace(force);

    const speed = this.velocity.length();
    if (speed > this.maxSpeed) {
      this.velocity = this.velocity.normalize().scale(this.maxSpeed);
    }
  }

  private constrainToNavMesh(navMesh: NavMesh): void {
    const poly = navMesh.findNearestPolygon(this.position, this.radius);

    if (poly) {
      const closestPoint = poly.closestPointOnPolygon(this.position);

      if (this.position.distanceTo(closestPoint) > 0.1) {
        this.position = closestPoint;
      }
    } else {
      this.state = AgentState.BLOCKED;
      logger.warn('Agent off navmesh', { position: this.position });
    }
  }

  /**
   * Stops the agent and clears path.
   */
  stop(): void {
    this.velocity = new Vector3();
    this.state = AgentState.IDLE;
    this.currentPath = null;
    this.destination = null;
  }

  /**
   * Pauses agent movement without clearing path.
   */
  pause(): void {
    this.velocity = new Vector3();
    this.state = AgentState.PAUSED;
  }

  /**
   * Resumes agent movement.
   */
  resume(): void {
    if (this.currentPath) {
      this.state = AgentState.MOVING;
    }
  }

  /**
   * Teleports agent to new position.
   */
  teleport(position: Vector3, navMesh: NavMesh): boolean {
    const poly = navMesh.findNearestPolygon(position, this.radius);
    if (!poly) return false;

    this.position = position.clone();
    this.velocity = new Vector3();
    this.stop();
    return true;
  }

  /**
   * Gets current speed.
   */
  getSpeed(): number {
    return this.velocity.length();
  }

  /**
   * Gets distance to destination.
   */
  getDistanceToDestination(): number {
    if (!this.destination) return 0;
    return this.position.distanceTo(this.destination);
  }

  /**
   * Gets remaining path length.
   */
  getRemainingPathLength(): number {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      return 0;
    }

    let length = this.position.distanceTo(this.currentPath.waypoints[this.waypointIndex]);

    for (let i = this.waypointIndex; i < this.currentPath.waypoints.length - 1; i++) {
      length += this.currentPath.waypoints[i].distanceTo(
        this.currentPath.waypoints[i + 1]
      );
    }

    return length;
  }

  /**
   * Gets current waypoint target.
   */
  getCurrentWaypoint(): Vector3 | null {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      return null;
    }
    return this.currentPath.waypoints[this.waypointIndex];
  }

  /**
   * Checks if agent has arrived.
   */
  hasArrived(): boolean {
    return this.state === AgentState.ARRIVED;
  }

  /**
   * Checks if agent is blocked.
   */
  isBlocked(): boolean {
    return this.state === AgentState.BLOCKED;
  }

  /**
   * Gets rotation angle from heading.
   */
  getRotationAngle(): number {
    return Math.atan2(this.heading.x, this.heading.z);
  }
}
