/**
 * @fileoverview Crowd simulation manager with local avoidance and formations.
 * Manages multiple agents with collision avoidance and group behaviors.
 * @module ai/navigation/CrowdManager
 */

import { Vector3 } from '../../math/Vector3';
import { NavAgent } from './NavAgent';
import { NavMesh } from './NavMesh';
import { PathFinder } from './PathFinder';
import { ObstacleAvoidance, ObstacleAgent } from './ObstacleAvoidance';
import { Logger } from '../../core/Logger';

const logger = Logger.create('CrowdManager');

/**
 * Agent priority levels.
 */
export const AgentPriority = {
  LOWEST: 0,
  LOW: 25,
  NORMAL: 50,
  HIGH: 75,
  HIGHEST: 100,
} as const;

/**
 * Crowd agent wrapper with avoidance data.
 */
export class CrowdAgent {
  readonly id: number;
  readonly agent: NavAgent;
  priority: number;
  desiredVelocity: Vector3;
  neighbors: CrowdAgent[];
  avoidanceRadius: number;
  enabled: boolean;
  formationId: number;

  private static nextId = 0;

  constructor(agent: NavAgent, priority: number = AgentPriority.NORMAL) {
    this.id = CrowdAgent.nextId++;
    this.agent = agent;
    this.priority = priority;
    this.desiredVelocity = new Vector3();
    this.neighbors = [];
    this.avoidanceRadius = 5.0;
    this.enabled = true;
    this.formationId = -1;
  }

  get position(): Vector3 {
    return this.agent.position;
  }

  get velocity(): Vector3 {
    return this.agent.velocity;
  }

  get radius(): number {
    return this.agent.radius;
  }

  get maxSpeed(): number {
    return this.agent.maxSpeed;
  }
}

/**
 * Formation types.
 */
export enum FormationType {
  LINE = 'line',
  WEDGE = 'wedge',
  CIRCLE = 'circle',
  BOX = 'box',
  COLUMN = 'column',
}

/**
 * Formation configuration.
 */
export interface Formation {
  id: number;
  leader: CrowdAgent;
  members: CrowdAgent[];
  type: FormationType;
  spacing: number;
  rotation: number;
}

/**
 * Crowd manager configuration.
 */
export interface CrowdManagerConfig {
  enableAvoidance: boolean;
  enableFormations: boolean;
  maxNeighbors: number;
  neighborRadius: number;
  separationWeight: number;
  cohesionWeight: number;
  alignmentWeight: number;
}

/**
 * Default crowd manager configuration.
 */
export const DefaultCrowdManagerConfig: CrowdManagerConfig = {
  enableAvoidance: true,
  enableFormations: true,
  maxNeighbors: 10,
  neighborRadius: 5.0,
  separationWeight: 2.0,
  cohesionWeight: 1.0,
  alignmentWeight: 1.0,
};

/**
 * Crowd simulation manager for coordinating multiple agents.
 * Handles local avoidance, formations, and group behaviors.
 * Optimized for 1000+ agents @ 60 FPS.
 */
export class CrowdManager {
  private navMesh: NavMesh;
  private pathFinder: PathFinder;
  private obstacleAvoidance: ObstacleAvoidance;
  private config: CrowdManagerConfig;

  private agents: CrowdAgent[] = [];
  private formations: Formation[] = [];
  private spatialGrid: Map<string, CrowdAgent[]>;
  private gridCellSize: number;

  private static nextFormationId = 0;

  constructor(
    navMesh: NavMesh,
    pathFinder: PathFinder,
    config: Partial<CrowdManagerConfig> = {},
    gridCellSize: number = 10.0
  ) {
    this.navMesh = navMesh;
    this.pathFinder = pathFinder;
    this.obstacleAvoidance = new ObstacleAvoidance();
    this.config = { ...DefaultCrowdManagerConfig, ...config };
    this.spatialGrid = new Map();
    this.gridCellSize = gridCellSize;
  }

  /**
   * Adds agent to crowd.
   */
  addAgent(agent: NavAgent, priority: number = AgentPriority.NORMAL): CrowdAgent {
    const crowdAgent = new CrowdAgent(agent, priority);
    this.agents.push(crowdAgent);

    logger.debug('Agent added to crowd', {
      id: crowdAgent.id,
      priority,
      totalAgents: this.agents.length
    });

    return crowdAgent;
  }

  /**
   * Removes agent from crowd.
   */
  removeAgent(crowdAgent: CrowdAgent): boolean {
    const index = this.agents.indexOf(crowdAgent);
    if (index === -1) return false;

    this.agents.splice(index, 1);

    for (const formation of this.formations) {
      const memberIndex = formation.members.indexOf(crowdAgent);
      if (memberIndex !== -1) {
        formation.members.splice(memberIndex, 1);
      }
    }

    logger.debug('Agent removed from crowd', {
      id: crowdAgent.id,
      remainingAgents: this.agents.length
    });

    return true;
  }

  /**
   * Updates crowd simulation.
   * Handles neighbor finding, avoidance, formations, and agent updates.
   */
  update(deltaTime: number): void {
    if (this.agents.length === 0) return;

    const startTime = performance.now();

    this.updateSpatialGrid();
    this.updateNeighbors();

    if (this.config.enableFormations) {
      this.updateFormations();
    }

    for (const agent of this.agents) {
      if (!agent.enabled) continue;
      agent.desiredVelocity = agent.agent.velocity.clone();
    }

    if (this.config.enableAvoidance) {
      this.computeAvoidanceVelocities();
    }

    for (const agent of this.agents) {
      if (!agent.enabled) continue;
      agent.agent.update(deltaTime, this.navMesh);
    }

    const updateTime = performance.now() - startTime;

    if (updateTime > 16.0) {
      logger.warn('Crowd update exceeded frame budget', {
        updateTimeMs: updateTime.toFixed(2),
        agentCount: this.agents.length
      });
    }
  }

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

  private updateNeighbors(): void {
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      agent.neighbors = this.queryNeighbors(agent, this.config.neighborRadius);

      if (agent.neighbors.length > this.config.maxNeighbors) {
        agent.neighbors.sort((a, b) => {
          const distA = agent.position.distanceTo(a.position);
          const distB = agent.position.distanceTo(b.position);
          return distA - distB;
        });
        agent.neighbors.length = this.config.maxNeighbors;
      }
    }
  }

  private queryNeighbors(agent: CrowdAgent, radius: number): CrowdAgent[] {
    const neighbors: CrowdAgent[] = [];
    const gridKeys = this.getGridKeysInRadius(agent.position, radius);

    for (const key of gridKeys) {
      const cell = this.spatialGrid.get(key);
      if (!cell) continue;

      for (const other of cell) {
        if (other === agent || !other.enabled) continue;

        const distSq = agent.position.distanceTo(other.position) ** 2;
        if (distSq <= radius * radius) {
          neighbors.push(other);
        }
      }
    }

    return neighbors;
  }

  private computeAvoidanceVelocities(): void {
    for (const agent of this.agents) {
      if (!agent.enabled) continue;

      const obstacleAgent: ObstacleAgent = {
        position: agent.position,
        velocity: agent.velocity,
        radius: agent.radius,
        maxSpeed: agent.maxSpeed,
        priority: agent.priority
      };

      const neighborAgents: ObstacleAgent[] = agent.neighbors.map(n => ({
        position: n.position,
        velocity: n.velocity,
        radius: n.radius,
        maxSpeed: n.maxSpeed,
        priority: n.priority
      }));

      const safeVelocity = this.obstacleAvoidance.computeSafeVelocity(
        obstacleAgent,
        neighborAgents,
        [],
        agent.desiredVelocity
      );

      const blendFactor = 0.5;
      agent.agent.velocity = agent.agent.velocity
        .scale(1 - blendFactor)
        .add(safeVelocity.scale(blendFactor));
    }
  }

  /**
   * Creates formation with leader and members.
   */
  createFormation(
    leader: CrowdAgent,
    members: CrowdAgent[],
    type: FormationType = FormationType.LINE,
    spacing: number = 2.0
  ): Formation {
    const formation: Formation = {
      id: CrowdManager.nextFormationId++,
      leader,
      members,
      type,
      spacing,
      rotation: 0
    };

    for (const member of members) {
      member.formationId = formation.id;
    }

    this.formations.push(formation);

    logger.info('Formation created', {
      id: formation.id,
      type,
      memberCount: members.length
    });

    return formation;
  }

  /**
   * Removes formation.
   */
  removeFormation(formation: Formation): boolean {
    const index = this.formations.indexOf(formation);
    if (index === -1) return false;

    for (const member of formation.members) {
      member.formationId = -1;
    }

    this.formations.splice(index, 1);
    return true;
  }

  private updateFormations(): void {
    for (const formation of this.formations) {
      if (!formation.leader.enabled) continue;

      const leaderPos = formation.leader.position;
      const leaderHeading = formation.leader.agent.heading;

      for (let i = 0; i < formation.members.length; i++) {
        const member = formation.members[i];
        if (!member.enabled) continue;

        const offset = this.calculateFormationOffset(formation, i);
        const angle = Math.atan2(leaderHeading.x, leaderHeading.z) + formation.rotation;

        const rotatedOffset = new Vector3(
          offset.x * Math.cos(angle) - offset.z * Math.sin(angle),
          offset.y,
          offset.x * Math.sin(angle) + offset.z * Math.cos(angle)
        );

        const targetPos = leaderPos.add(rotatedOffset);
        const toTarget = targetPos.sub(member.position);
        const distance = toTarget.length();

        if (distance > 0.5) {
          member.desiredVelocity = toTarget.normalize().scale(member.maxSpeed);
        } else {
          member.desiredVelocity = formation.leader.velocity.clone();
        }
      }
    }
  }

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
        return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      }

      case FormationType.BOX: {
        const side = Math.ceil(Math.sqrt(formation.members.length));
        const row = Math.floor(slotIndex / side);
        const col = slotIndex % side;
        return new Vector3((col - side / 2) * spacing, 0, -(row + 1) * spacing);
      }

      case FormationType.COLUMN: {
        const col = slotIndex % 2;
        const row = Math.floor(slotIndex / 2);
        return new Vector3((col - 0.5) * spacing, 0, -(row + 1) * spacing);
      }

      default:
        return new Vector3();
    }
  }

  private getGridKey(position: Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

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
   * Gets crowd statistics.
   */
  getStats(): {
    agentCount: number;
    enabledAgentCount: number;
    formationCount: number;
    averageNeighbors: number;
  } {
    const enabledAgents = this.agents.filter(a => a.enabled);
    const totalNeighbors = enabledAgents.reduce((sum, a) => sum + a.neighbors.length, 0);

    return {
      agentCount: this.agents.length,
      enabledAgentCount: enabledAgents.length,
      formationCount: this.formations.length,
      averageNeighbors: enabledAgents.length > 0 ? totalNeighbors / enabledAgents.length : 0
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
