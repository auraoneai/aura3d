/**
 * @fileoverview Multi-agent crowd simulation with local avoidance.
 * Implements RVO (Reciprocal Velocity Obstacles) for collision-free movement.
 * @module ai/CrowdManager
 */

import { Vector3 } from '../math/Vector3';
import { NavAgent } from './NavAgent';
import { NavMesh } from './NavMesh';

/**
 * Agent priority for conflict resolution.
 * Higher priority agents get preference in avoidance.
 */
export type AgentPriority = number;

/**
 * Standard priority levels.
 */
export const AgentPriorities = {
  LOWEST: 0,
  LOW: 25,
  NORMAL: 50,
  HIGH: 75,
  HIGHEST: 100,
} as const;

/**
 * Crowd agent wrapper with additional crowd simulation data.
 * Extends NavAgent with crowd-specific properties.
 */
export class CrowdAgent {
  /** Reference to navigation agent */
  readonly agent: NavAgent;

  /** Unique agent ID within crowd */
  readonly id: number;

  /** Agent priority for avoidance */
  priority: AgentPriority;

  /** Desired velocity (before avoidance) */
  desiredVelocity: Vector3;

  /** Preferred velocity (after avoidance) */
  preferredVelocity: Vector3;

  /** Neighbors within avoidance radius */
  neighbors: CrowdAgent[];

  /** Maximum avoidance radius */
  avoidanceRadius: number;

  /** Time horizon for velocity obstacles */
  timeHorizon: number;

  /** Whether agent participates in crowd simulation */
  enabled: boolean;

  /** Formation slot (if in formation) */
  formationSlot: number;

  /** Formation offset from leader */
  formationOffset: Vector3 | null;

  private static nextId = 0;

  /**
   * Creates a new crowd agent.
   *
   * @param agent - Navigation agent to wrap
   * @param priority - Agent priority
   */
  constructor(agent: NavAgent, priority: AgentPriority = AgentPriorities.NORMAL) {
    this.agent = agent;
    this.id = CrowdAgent.nextId++;
    this.priority = priority;
    this.desiredVelocity = new Vector3();
    this.preferredVelocity = new Vector3();
    this.neighbors = [];
    this.avoidanceRadius = 5.0;
    this.timeHorizon = 2.5;
    this.enabled = true;
    this.formationSlot = -1;
    this.formationOffset = null;
  }

  /**
   * Gets agent position.
   */
  get position(): Vector3 {
    return this.agent.position;
  }

  /**
   * Gets agent velocity.
   */
  get velocity(): Vector3 {
    return this.agent.velocity;
  }

  /**
   * Gets agent radius.
   */
  get radius(): number {
    return this.agent.radius;
  }

  /**
   * Gets agent maximum speed.
   */
  get maxSpeed(): number {
    return this.agent.maxSpeed;
  }
}

/**
 * Formation configuration.
 */
export interface Formation {
  /** Formation leader agent */
  leader: CrowdAgent;

  /** Formation type */
  type: FormationType;

  /** Agents in formation (excluding leader) */
  members: CrowdAgent[];

  /** Spacing between agents */
  spacing: number;

  /** Formation rotation offset */
  rotation: number;
}

/**
 * Formation types.
 */
export enum FormationType {
  /** Line formation behind leader */
  LINE = 'line',
  /** V-shaped wedge formation */
  WEDGE = 'wedge',
  /** Circle around leader */
  CIRCLE = 'circle',
  /** Box/square formation */
  BOX = 'box',
  /** Two columns */
  COLUMN = 'column',
}

/**
 * Crowd simulation manager for coordinating multiple agents.
 * Implements local avoidance using RVO/ORCA algorithms.
 *
 * @example
 * ```typescript
 * const crowd = new CrowdManager(navMesh);
 *
 * // Add agents
 * const agent1 = new NavAgent(new Vector3(0, 0, 0));
 * const agent2 = new NavAgent(new Vector3(10, 0, 0));
 * const crowdAgent1 = crowd.addAgent(agent1);
 * const crowdAgent2 = crowd.addAgent(agent2);
 *
 * // Update simulation
 * const deltaTime = 0.016;
 * crowd.update(deltaTime);
 *
 * // Create formation
 * const formation = crowd.createFormation(
 *   crowdAgent1,
 *   [crowdAgent2],
 *   FormationType.WEDGE
 * );
 * ```
 */
export class CrowdManager {
  /** Navigation mesh for constraint */
  readonly navMesh: NavMesh;

  /** All managed agents */
  readonly agents: CrowdAgent[];

  /** Active formations */
  readonly formations: Formation[];

  /** Enable local avoidance */
  enableAvoidance: boolean;

  /** Enable density-based slowdown */
  enableDensityControl: boolean;

  /** Maximum agents to consider for avoidance per agent */
  maxNeighbors: number;

  /** Neighbor query radius */
  neighborRadius: number;

  /** Density slowdown threshold (agents per square unit) */
  densityThreshold: number;

  /** Spatial grid for efficient neighbor queries */
  private spatialGrid: Map<string, CrowdAgent[]>;
  private gridCellSize: number;

  /**
   * Creates a new crowd manager.
   *
   * @param navMesh - Navigation mesh for agents
   * @param gridCellSize - Spatial grid cell size
   */
  constructor(navMesh: NavMesh, gridCellSize: number = 5.0) {
    this.navMesh = navMesh;
    this.agents = [];
    this.formations = [];
    this.enableAvoidance = true;
    this.enableDensityControl = true;
    this.maxNeighbors = 10;
    this.neighborRadius = 5.0;
    this.densityThreshold = 2.0;
    this.spatialGrid = new Map();
    this.gridCellSize = gridCellSize;
  }

  /**
   * Adds an agent to the crowd.
   *
   * @param agent - Navigation agent to add
   * @param priority - Agent priority
   * @returns Crowd agent wrapper
   *
   * @example
   * ```typescript
   * const navAgent = new NavAgent(new Vector3(0, 0, 0));
   * const crowdAgent = crowd.addAgent(navAgent, AgentPriorities.HIGH);
   * ```
   */
  addAgent(agent: NavAgent, priority: AgentPriority = AgentPriorities.NORMAL): CrowdAgent {
    const crowdAgent = new CrowdAgent(agent, priority);
    this.agents.push(crowdAgent);
    return crowdAgent;
  }

  /**
   * Removes an agent from the crowd.
   *
   * @param agent - Crowd agent to remove
   * @returns True if agent was removed
   */
  removeAgent(agent: CrowdAgent): boolean {
    const index = this.agents.indexOf(agent);
    if (index === -1) return false;

    this.agents.splice(index, 1);

    // Remove from any formations
    for (const formation of this.formations) {
      const memberIndex = formation.members.indexOf(agent);
      if (memberIndex !== -1) {
        formation.members.splice(memberIndex, 1);
      }
    }

    return true;
  }

  /**
   * Updates crowd simulation for the current frame.
   *
   * @param deltaTime - Time elapsed since last update
   *
   * @example
   * ```typescript
   * function gameLoop(deltaTime: number) {
   *   crowd.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (this.agents.length === 0) return;

    // Update spatial grid
    this.updateSpatialGrid();

    // Find neighbors for each agent
    this.updateNeighbors();

    // Update formations
    this.updateFormations(deltaTime);

    // Compute desired velocities
    for (const agent of this.agents) {
      if (!agent.enabled) continue;
      agent.desiredVelocity = agent.agent.velocity.clone();
    }

    // Apply local avoidance
    if (this.enableAvoidance) {
      this.computeAvoidanceVelocities();
    }

    // Apply density control
    if (this.enableDensityControl) {
      this.applyDensityControl();
    }

    // Apply preferred velocities to agents
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      // Blend preferred velocity with current velocity
      const blend = 0.5; // Smoothing factor
      agent.agent.velocity = agent.agent.velocity
        .scale(1 - blend)
        .add(agent.preferredVelocity.scale(blend));
    }
  }

  /**
   * Updates the spatial grid for efficient neighbor queries.
   * @private
   */
  private updateSpatialGrid(): void {
    this.spatialGrid.clear();

    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      const key = this.getGridKey(agent.position);
      const cell = this.spatialGrid.get(key) || [];
      cell.push(agent);
      this.spatialGrid.set(key, cell);
    }
  }

  /**
   * Updates neighbor lists for each agent.
   * @private
   */
  private updateNeighbors(): void {
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      agent.neighbors = this.queryNeighbors(agent, this.neighborRadius);

      // Limit to max neighbors, sorted by distance
      if (agent.neighbors.length > this.maxNeighbors) {
        agent.neighbors.sort((a, b) => {
          const distA = agent.position.distanceToSquared(a.position);
          const distB = agent.position.distanceToSquared(b.position);
          return distA - distB;
        });
        agent.neighbors.length = this.maxNeighbors;
      }
    }
  }

  /**
   * Queries neighbors within radius of an agent.
   * @private
   */
  private queryNeighbors(agent: CrowdAgent, radius: number): CrowdAgent[] {
    const neighbors: CrowdAgent[] = [];
    const gridKeys = this.getGridKeysInRadius(agent.position, radius);

    for (const key of gridKeys) {
      const cell = this.spatialGrid.get(key);
      if (!cell) continue;

      for (const other of cell) {
        if (other === agent) continue;
        if (!other.enabled) continue;

        const distSq = agent.position.distanceToSquared(other.position);
        if (distSq <= radius * radius) {
          neighbors.push(other);
        }
      }
    }

    return neighbors;
  }

  /**
   * Computes avoidance velocities using RVO algorithm.
   * @private
   */
  private computeAvoidanceVelocities(): void {
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      // Start with desired velocity
      let newVelocity = agent.desiredVelocity.clone();

      // Compute velocity obstacles from neighbors
      for (const neighbor of agent.neighbors) {
        const avoidance = this.computeRVO(agent, neighbor);
        newVelocity.addInPlace(avoidance);
      }

      // Clamp to max speed
      const speed = newVelocity.length();
      if (speed > agent.maxSpeed) {
        newVelocity = newVelocity.normalize().scale(agent.maxSpeed);
      }

      agent.preferredVelocity = newVelocity;
    }
  }

  /**
   * Computes RVO avoidance vector between two agents.
   * Simplified implementation of Reciprocal Velocity Obstacles.
   * @private
   */
  private computeRVO(agent: CrowdAgent, neighbor: CrowdAgent): Vector3 {
    const toNeighbor = neighbor.position.sub(agent.position);
    const distance = toNeighbor.length();

    if (distance < 0.001) {
      // Agents at same position, push apart
      return new Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    }

    const minDist = agent.radius + neighbor.radius;

    // If too close, push away
    if (distance < minDist) {
      const pushForce = (minDist - distance) / minDist;
      return toNeighbor.normalize().scale(-pushForce * agent.maxSpeed * 0.5);
    }

    // Predict future collision
    const relativeVelocity = agent.velocity.sub(neighbor.velocity);
    const timeToCollision = this.computeTimeToCollision(
      agent.position,
      neighbor.position,
      agent.velocity,
      neighbor.velocity,
      minDist
    );

    if (timeToCollision > 0 && timeToCollision < agent.timeHorizon) {
      // Compute avoidance direction
      const avoidanceDir = toNeighbor.normalize();

      // Perpendicular direction (prefer right)
      const perpDir = new Vector3(-avoidanceDir.z, 0, avoidanceDir.x);

      // Choose direction based on velocity
      if (relativeVelocity.dot(perpDir) < 0) {
        perpDir.scaleInPlace(-1);
      }

      // Avoidance strength decreases with time to collision
      const strength = 1.0 - (timeToCollision / agent.timeHorizon);

      // Factor in priorities
      const priorityFactor = this.computePriorityFactor(agent, neighbor);

      return perpDir.scale(agent.maxSpeed * strength * 0.3 * priorityFactor);
    }

    return new Vector3();
  }

  /**
   * Computes time to collision between two agents.
   * @private
   */
  private computeTimeToCollision(
    pos1: Vector3,
    pos2: Vector3,
    vel1: Vector3,
    vel2: Vector3,
    minDist: number
  ): number {
    const relPos = pos1.sub(pos2);
    const relVel = vel1.sub(vel2);

    const a = relVel.dot(relVel);
    const b = 2 * relPos.dot(relVel);
    const c = relPos.dot(relPos) - minDist * minDist;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0 || Math.abs(a) < 0.001) {
      return -1; // No collision
    }

    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t > 0 ? t : -1;
  }

  /**
   * Computes priority factor for avoidance.
   * Higher priority agents get less avoidance.
   * @private
   */
  private computePriorityFactor(agent: CrowdAgent, neighbor: CrowdAgent): number {
    const priorityDiff = neighbor.priority - agent.priority;
    return 0.5 + (priorityDiff / 100) * 0.5; // Range: 0.0 to 1.0
  }

  /**
   * Applies density-based slowdown.
   * @private
   */
  private applyDensityControl(): void {
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      const density = this.computeLocalDensity(agent);

      if (density > this.densityThreshold) {
        const slowdown = Math.max(0.3, 1.0 - (density - this.densityThreshold) * 0.2);
        agent.preferredVelocity.scaleInPlace(slowdown);
      }
    }
  }

  /**
   * Computes local crowd density around an agent.
   * @private
   */
  private computeLocalDensity(agent: CrowdAgent): number {
    const radius = 3.0;
    const area = Math.PI * radius * radius;
    return agent.neighbors.length / area;
  }

  /**
   * Creates a formation with a leader and members.
   *
   * @param leader - Formation leader
   * @param members - Formation members
   * @param type - Formation type
   * @param spacing - Spacing between agents
   * @returns Formation object
   *
   * @example
   * ```typescript
   * const formation = crowd.createFormation(
   *   leaderAgent,
   *   [agent1, agent2, agent3],
   *   FormationType.WEDGE,
   *   2.0
   * );
   * ```
   */
  createFormation(
    leader: CrowdAgent,
    members: CrowdAgent[],
    type: FormationType = FormationType.LINE,
    spacing: number = 2.0
  ): Formation {
    const formation: Formation = {
      leader,
      type,
      members,
      spacing,
      rotation: 0,
    };

    this.formations.push(formation);
    this.updateFormationSlots(formation);
    return formation;
  }

  /**
   * Removes a formation.
   *
   * @param formation - Formation to remove
   * @returns True if formation was removed
   */
  removeFormation(formation: Formation): boolean {
    const index = this.formations.indexOf(formation);
    if (index === -1) return false;

    // Clear formation slots
    for (const member of formation.members) {
      member.formationSlot = -1;
      member.formationOffset = null;
    }

    this.formations.splice(index, 1);
    return true;
  }

  /**
   * Updates all formations.
   * @private
   */
  private updateFormations(deltaTime: number): void {
    for (const formation of this.formations) {
      this.updateFormationSlots(formation);
      this.applyFormationMovement(formation);
    }
  }

  /**
   * Updates formation slot positions.
   * @private
   */
  private updateFormationSlots(formation: Formation): void {
    const leaderPos = formation.leader.position;
    const leaderHeading = formation.leader.agent.heading;

    for (let i = 0; i < formation.members.length; i++) {
      const member = formation.members[i]!;
      member.formationSlot = i;

      // Calculate formation offset based on type
      const offset = this.calculateFormationOffset(formation, i);

      // Rotate offset by leader heading
      const angle = Math.atan2(leaderHeading.x, leaderHeading.z) + formation.rotation;
      const rotatedOffset = new Vector3(
        offset.x * Math.cos(angle) - offset.z * Math.sin(angle),
        offset.y,
        offset.x * Math.sin(angle) + offset.z * Math.cos(angle)
      );

      member.formationOffset = rotatedOffset;
    }
  }

  /**
   * Calculates formation offset for a slot.
   * @private
   */
  private calculateFormationOffset(formation: Formation, slotIndex: number): Vector3 {
    const spacing = formation.spacing;

    switch (formation.type) {
      case FormationType.LINE:
        return new Vector3(0, 0, -(slotIndex + 1) * spacing);

      case FormationType.WEDGE: {
        const row = Math.floor(Math.sqrt(slotIndex + 1));
        const col = slotIndex - row * (row - 1);
        const side = col % 2 === 0 ? 1 : -1;
        return new Vector3(side * Math.floor(col / 2) * spacing, 0, -row * spacing);
      }

      case FormationType.CIRCLE: {
        const angle = (slotIndex / formation.members.length) * Math.PI * 2;
        const radius = spacing * 2;
        return new Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
      }

      case FormationType.BOX: {
        const side = Math.ceil(Math.sqrt(formation.members.length));
        const row = Math.floor(slotIndex / side);
        const col = slotIndex % side;
        return new Vector3(
          (col - side / 2) * spacing,
          0,
          -(row + 1) * spacing
        );
      }

      case FormationType.COLUMN: {
        const col = slotIndex % 2;
        const row = Math.floor(slotIndex / 2);
        return new Vector3(
          (col - 0.5) * spacing,
          0,
          -(row + 1) * spacing
        );
      }

      default:
        return new Vector3();
    }
  }

  /**
   * Applies formation movement to members.
   * @private
   */
  private applyFormationMovement(formation: Formation): void {
    const leaderPos = formation.leader.position;

    for (const member of formation.members) {
      if (!member.formationOffset || !member.enabled) continue;

      const targetPos = leaderPos.add(member.formationOffset);
      const toTarget = targetPos.sub(member.position);
      const distance = toTarget.length();

      if (distance > 0.5) {
        // Move toward formation position
        const desiredVelocity = toTarget.normalize().scale(member.maxSpeed);
        member.desiredVelocity = desiredVelocity;
      } else {
        // Match leader velocity
        member.desiredVelocity = formation.leader.velocity.clone();
      }
    }
  }

  /**
   * Gets the grid key for a position.
   * @private
   */
  private getGridKey(position: Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

  /**
   * Gets all grid keys within a radius.
   * @private
   */
  private getGridKeysInRadius(position: Vector3, radius: number): string[] {
    const keys: string[] = [];
    const cells = Math.ceil(radius / this.gridCellSize);
    const centerX = Math.floor(position.x / this.gridCellSize);
    const centerZ = Math.floor(position.z / this.gridCellSize);

    for (let x = centerX - cells; x <= centerX + cells; x++) {
      for (let z = centerZ - cells; z <= centerZ + cells; z++) {
        keys.push(`${x},${z}`);
      }
    }

    return keys;
  }

  /**
   * Gets statistics about the crowd.
   */
  getStats(): {
    agentCount: number;
    formationCount: number;
    averageDensity: number;
  } {
    let totalDensity = 0;
    for (const agent of this.agents) {
      if (agent.enabled) {
        totalDensity += this.computeLocalDensity(agent);
      }
    }

    return {
      agentCount: this.agents.length,
      formationCount: this.formations.length,
      averageDensity: this.agents.length > 0 ? totalDensity / this.agents.length : 0,
    };
  }

  /**
   * Clears all agents and formations.
   */
  clear(): void {
    this.agents.length = 0;
    this.formations.length = 0;
    this.spatialGrid.clear();
  }
}
