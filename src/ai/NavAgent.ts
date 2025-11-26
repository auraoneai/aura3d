/**
 * @fileoverview Navigation agent component for pathfinding and steering.
 * Provides path following, obstacle avoidance, and movement behaviors.
 * @module ai/NavAgent
 */

import { Vector3 } from '../math/Vector3';
import { IComponent } from '../ecs/Component';
import { Pathfinder, Path, PathStatus } from './Pathfinding';
import { NavMesh, NavAreaType } from './NavMesh';

/**
 * Agent movement state.
 */
export enum AgentState {
  /** Agent is idle */
  IDLE = 'idle',
  /** Agent is moving along path */
  MOVING = 'moving',
  /** Agent has reached destination */
  ARRIVED = 'arrived',
  /** Agent is stuck or blocked */
  BLOCKED = 'blocked',
}

/**
 * Steering behavior types.
 */
export enum SteeringBehavior {
  /** Direct movement to target */
  SEEK = 'seek',
  /** Move away from target */
  FLEE = 'flee',
  /** Arrive at target with deceleration */
  ARRIVE = 'arrive',
  /** Follow path waypoints */
  FOLLOW_PATH = 'follow_path',
  /** Avoid obstacles */
  AVOID_OBSTACLES = 'avoid_obstacles',
}

/**
 * Navigation agent component for autonomous movement.
 * Handles pathfinding, path following, and steering behaviors.
 *
 * @example
 * ```typescript
 * // Create agent
 * const agent = new NavAgent();
 * agent.maxSpeed = 5.0;
 * agent.acceleration = 10.0;
 * agent.radius = 0.5;
 *
 * // Set destination
 * agent.setDestination(new Vector3(100, 0, 50));
 *
 * // Update each frame
 * const deltaTime = 0.016;
 * agent.update(deltaTime, navMesh, pathfinder);
 *
 * // Check state
 * if (agent.state === AgentState.ARRIVED) {
 *   console.log('Agent reached destination');
 * }
 * ```
 */
export class NavAgent implements IComponent {
  // Movement properties
  /** Current position */
  position: Vector3;

  /** Current velocity */
  velocity: Vector3;

  /** Current heading direction */
  heading: Vector3;

  /** Maximum movement speed */
  maxSpeed: number;

  /** Acceleration rate */
  acceleration: number;

  /** Angular turning speed (radians/second) */
  angularSpeed: number;

  /** Agent radius for collision */
  radius: number;

  /** Agent height */
  height: number;

  // Pathfinding properties
  /** Current path being followed */
  currentPath: Path | null;

  /** Index of current waypoint */
  waypointIndex: number;

  /** Distance threshold to reach waypoint */
  waypointRadius: number;

  /** Distance threshold to reach final destination */
  arrivalRadius: number;

  /** Current movement state */
  state: AgentState;

  // Steering properties
  /** Active steering behavior */
  behavior: SteeringBehavior;

  /** Slowing radius for arrival behavior */
  slowingRadius: number;

  /** Enable obstacle avoidance */
  avoidObstacles: boolean;

  /** Obstacle avoidance lookahead distance */
  avoidanceDistance: number;

  // Area filtering
  /** Allowed navigation area types */
  allowedAreas: Set<NavAreaType>;

  /** Whether agent is currently grounded */
  isGrounded: boolean;

  /** Whether agent can move */
  enabled: boolean;

  // Debug
  /** Target destination position */
  destination: Vector3 | null;

  /**
   * Creates a new navigation agent.
   *
   * @param position - Initial position
   */
  constructor(position: Vector3 = new Vector3()) {
    this.position = position.clone();
    this.velocity = new Vector3();
    this.heading = new Vector3(0, 0, 1);

    this.maxSpeed = 5.0;
    this.acceleration = 10.0;
    this.angularSpeed = Math.PI * 2; // 360 degrees/sec
    this.radius = 0.5;
    this.height = 2.0;

    this.currentPath = null;
    this.waypointIndex = 0;
    this.waypointRadius = 0.5;
    this.arrivalRadius = 0.1;
    this.state = AgentState.IDLE;

    this.behavior = SteeringBehavior.FOLLOW_PATH;
    this.slowingRadius = 2.0;
    this.avoidObstacles = true;
    this.avoidanceDistance = 3.0;

    this.allowedAreas = new Set([0, 1, 2]); // Walkable, Road, Grass
    this.isGrounded = false;
    this.enabled = true;

    this.destination = null;
  }

  /**
   * Sets a new destination and computes path.
   *
   * @param destination - Target position
   * @param pathfinder - Pathfinder instance
   * @param navMesh - Navigation mesh
   * @returns True if path was found
   *
   * @example
   * ```typescript
   * const success = agent.setDestination(
   *   new Vector3(100, 0, 50),
   *   pathfinder,
   *   navMesh
   * );
   *
   * if (success) {
   *   console.log('Path found, agent will move');
   * }
   * ```
   */
  setDestination(
    destination: Vector3,
    pathfinder: Pathfinder,
    navMesh: NavMesh
  ): boolean {
    this.destination = destination.clone();

    // Find path
    const path = pathfinder.findPath(this.position, destination);

    if (path.status === PathStatus.SUCCESS || path.status === PathStatus.PARTIAL) {
      this.currentPath = path;
      this.waypointIndex = 0;
      this.state = AgentState.MOVING;
      return true;
    }

    this.currentPath = null;
    this.state = AgentState.BLOCKED;
    return false;
  }

  /**
   * Updates agent movement for the current frame.
   *
   * @param deltaTime - Time elapsed since last update
   * @param navMesh - Navigation mesh
   * @param pathfinder - Pathfinder (optional, for path recomputation)
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   agent.update(deltaTime, navMesh, pathfinder);
   *
   *   // Apply position to entity
   *   entity.position.copy(agent.position);
   *   entity.rotation = agent.getRotation();
   * }
   * ```
   */
  update(deltaTime: number, navMesh: NavMesh, pathfinder?: Pathfinder): void {
    if (!this.enabled || this.state === AgentState.IDLE) {
      return;
    }

    // Follow current path
    if (this.currentPath && this.state === AgentState.MOVING) {
      this.followPath(deltaTime);
    }

    // Apply steering forces
    const steering = this.calculateSteering(deltaTime, navMesh);
    this.applyForce(steering, deltaTime);

    // Update position
    this.position.addInPlace(this.velocity.scale(deltaTime));

    // Update heading
    if (this.velocity.lengthSquared() > 0.001) {
      this.heading = this.velocity.normalize();
    }

    // Constrain to navmesh
    this.constrainToNavMesh(navMesh);
  }

  /**
   * Follows the current path by seeking waypoints.
   * @private
   */
  private followPath(deltaTime: number): void {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      this.state = AgentState.ARRIVED;
      this.velocity = new Vector3();
      return;
    }

    const waypoint = this.currentPath.waypoints[this.waypointIndex];
    const distance = this.position.distanceTo(waypoint);

    // Check if reached waypoint
    const threshold = this.waypointIndex === this.currentPath.waypoints.length - 1
      ? this.arrivalRadius
      : this.waypointRadius;

    if (distance < threshold) {
      this.waypointIndex++;

      // Check if reached final destination
      if (this.waypointIndex >= this.currentPath.waypoints.length) {
        this.state = AgentState.ARRIVED;
        this.velocity = new Vector3();
      }
    }
  }

  /**
   * Calculates steering force based on current behavior.
   * @private
   */
  private calculateSteering(deltaTime: number, navMesh: NavMesh): Vector3 {
    let steering = new Vector3();

    if (this.behavior === SteeringBehavior.FOLLOW_PATH && this.currentPath) {
      if (this.waypointIndex < this.currentPath.waypoints.length) {
        const waypoint = this.currentPath.waypoints[this.waypointIndex];
        const isLastWaypoint = this.waypointIndex === this.currentPath.waypoints.length - 1;

        if (isLastWaypoint) {
          steering = this.arrive(waypoint);
        } else {
          steering = this.seek(waypoint);
        }
      }
    } else if (this.behavior === SteeringBehavior.SEEK && this.destination) {
      steering = this.seek(this.destination);
    } else if (this.behavior === SteeringBehavior.ARRIVE && this.destination) {
      steering = this.arrive(this.destination);
    }

    // Add obstacle avoidance
    if (this.avoidObstacles) {
      const avoidance = this.calculateObstacleAvoidance(navMesh);
      steering.addInPlace(avoidance.scale(2.0)); // Higher weight for avoidance
    }

    return steering;
  }

  /**
   * Seek steering behavior - moves directly toward target.
   * @private
   */
  private seek(target: Vector3): Vector3 {
    const desired = target.sub(this.position).normalize().scale(this.maxSpeed);
    return desired.sub(this.velocity);
  }

  /**
   * Arrive steering behavior - decelerates when approaching target.
   * @private
   */
  private arrive(target: Vector3): Vector3 {
    const toTarget = target.sub(this.position);
    const distance = toTarget.length();

    if (distance < 0.001) {
      return new Vector3();
    }

    // Calculate desired velocity
    let desiredSpeed = this.maxSpeed;

    // Decelerate within slowing radius
    if (distance < this.slowingRadius) {
      desiredSpeed = this.maxSpeed * (distance / this.slowingRadius);
    }

    const desired = toTarget.normalize().scale(desiredSpeed);
    return desired.sub(this.velocity);
  }

  /**
   * Calculates obstacle avoidance force using raycasting.
   * @private
   */
  private calculateObstacleAvoidance(navMesh: NavMesh): Vector3 {
    // Simple avoidance: check if moving toward navmesh edge
    const ahead = this.position.add(this.velocity.normalize().scale(this.avoidanceDistance));
    const nearest = navMesh.findNearestPolygon(ahead, this.radius * 2);

    if (!nearest) {
      // Moving toward invalid area, steer away
      return this.velocity.normalize().scale(-this.maxSpeed);
    }

    return new Vector3();
  }

  /**
   * Applies steering force to velocity.
   * @private
   */
  private applyForce(force: Vector3, deltaTime: number): void {
    // Limit force by acceleration
    const maxForce = this.acceleration * deltaTime;
    if (force.lengthSquared() > maxForce * maxForce) {
      force = force.normalize().scale(maxForce);
    }

    // Update velocity
    this.velocity.addInPlace(force);

    // Limit speed
    const speed = this.velocity.length();
    if (speed > this.maxSpeed) {
      this.velocity = this.velocity.normalize().scale(this.maxSpeed);
    }
  }

  /**
   * Constrains agent position to navigation mesh.
   * @private
   */
  private constrainToNavMesh(navMesh: NavMesh): void {
    const poly = navMesh.findNearestPolygon(this.position, this.radius);

    if (poly) {
      // Project position onto polygon
      const projected = poly.projectPoint(this.position);

      // Keep some of the Y position for stairs/slopes
      this.position.x = projected.x;
      this.position.z = projected.z;
      this.position.y = projected.y;

      this.isGrounded = true;
    } else {
      this.isGrounded = false;
      this.state = AgentState.BLOCKED;
    }
  }

  /**
   * Stops the agent immediately.
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
    this.enabled = false;
  }

  /**
   * Resumes agent movement.
   */
  resume(): void {
    this.enabled = true;
    if (this.currentPath) {
      this.state = AgentState.MOVING;
    }
  }

  /**
   * Gets the current speed.
   */
  getSpeed(): number {
    return this.velocity.length();
  }

  /**
   * Gets the distance to destination.
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
   * Checks if agent has arrived at destination.
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
   * Gets current waypoint being targeted.
   */
  getCurrentWaypoint(): Vector3 | null {
    if (!this.currentPath || this.waypointIndex >= this.currentPath.waypoints.length) {
      return null;
    }
    return this.currentPath.waypoints[this.waypointIndex];
  }

  /**
   * Teleports agent to a new position.
   *
   * @param position - New position
   * @param navMesh - Navigation mesh to validate position
   * @returns True if position is valid
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
   * Gets rotation quaternion based on heading.
   * Returns angle in radians around Y axis.
   */
  getRotationAngle(): number {
    return Math.atan2(this.heading.x, this.heading.z);
  }

  /**
   * Serializes agent state.
   */
  serialize(): object {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
      heading: { x: this.heading.x, y: this.heading.y, z: this.heading.z },
      maxSpeed: this.maxSpeed,
      acceleration: this.acceleration,
      state: this.state,
      enabled: this.enabled,
    };
  }

  /**
   * Deserializes agent state.
   */
  deserialize(data: any): void {
    if (data.position) {
      this.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data.velocity) {
      this.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
    }
    if (data.heading) {
      this.heading.set(data.heading.x, data.heading.y, data.heading.z);
    }
    if (data.maxSpeed !== undefined) this.maxSpeed = data.maxSpeed;
    if (data.acceleration !== undefined) this.acceleration = data.acceleration;
    if (data.state !== undefined) this.state = data.state;
    if (data.enabled !== undefined) this.enabled = data.enabled;
  }

  /**
   * Resets agent to default state.
   */
  reset(): void {
    this.velocity = new Vector3();
    this.heading = new Vector3(0, 0, 1);
    this.state = AgentState.IDLE;
    this.currentPath = null;
    this.waypointIndex = 0;
    this.destination = null;
    this.enabled = true;
  }
}
