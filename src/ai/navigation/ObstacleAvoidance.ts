/**
 * @fileoverview RVO/ORCA dynamic obstacle avoidance algorithm.
 * Provides collision-free velocity selection for multi-agent systems.
 * @module ai/navigation/ObstacleAvoidance
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.create('ObstacleAvoidance');

/**
 * Velocity obstacle for avoidance calculations.
 */
interface VelocityObstacle {
  apex: Vector3;
  leftBound: Vector3;
  rightBound: Vector3;
  minDistance: number;
}

/**
 * ORCA line constraint.
 */
interface ORCALine {
  point: Vector3;
  direction: Vector3;
}

/**
 * Agent data for obstacle avoidance.
 */
export interface ObstacleAgent {
  position: Vector3;
  velocity: Vector3;
  radius: number;
  maxSpeed: number;
  priority: number;
}

/**
 * Static obstacle for avoidance.
 */
export interface StaticObstacle {
  position: Vector3;
  radius: number;
}

/**
 * RVO/ORCA obstacle avoidance configuration.
 */
export interface ObstacleAvoidanceConfig {
  timeHorizon: number;
  timeHorizonObstacles: number;
  maxNeighbors: number;
  neighborDistance: number;
}

/**
 * Default obstacle avoidance configuration.
 */
export const DefaultObstacleAvoidanceConfig: ObstacleAvoidanceConfig = {
  timeHorizon: 2.5,
  timeHorizonObstacles: 2.0,
  maxNeighbors: 10,
  neighborDistance: 10.0,
};

/**
 * RVO/ORCA obstacle avoidance system.
 * Computes collision-free velocities for agents using velocity obstacles
 * and ORCA (Optimal Reciprocal Collision Avoidance) algorithm.
 */
export class ObstacleAvoidance {
  private config: ObstacleAvoidanceConfig;

  constructor(config: Partial<ObstacleAvoidanceConfig> = {}) {
    this.config = { ...DefaultObstacleAvoidanceConfig, ...config };
  }

  /**
   * Computes safe velocity for agent considering neighbors and obstacles.
   * Uses ORCA algorithm for reciprocal collision avoidance.
   */
  computeSafeVelocity(
    agent: ObstacleAgent,
    neighbors: ObstacleAgent[],
    obstacles: StaticObstacle[],
    preferredVelocity: Vector3
  ): Vector3 {
    const orcaLines = this.computeORCALines(agent, neighbors, obstacles);

    const newVelocity = this.linearProgram(orcaLines, agent.maxSpeed, preferredVelocity);

    logger.trace('Safe velocity computed', {
      agentPos: agent.position,
      neighborCount: neighbors.length,
      obstacleCount: obstacles.length
    });

    return newVelocity;
  }

  /**
   * Computes ORCA lines (velocity constraints) for an agent.
   */
  private computeORCALines(
    agent: ObstacleAgent,
    neighbors: ObstacleAgent[],
    obstacles: StaticObstacle[]
  ): ORCALine[] {
    const lines: ORCALine[] = [];

    for (const neighbor of neighbors) {
      const line = this.computeAgentORCALine(agent, neighbor);
      if (line) {
        lines.push(line);
      }
    }

    for (const obstacle of obstacles) {
      const line = this.computeObstacleORCALine(agent, obstacle);
      if (line) {
        lines.push(line);
      }
    }

    return lines;
  }

  /**
   * Computes ORCA line for agent-agent interaction.
   */
  private computeAgentORCALine(agent: ObstacleAgent, neighbor: ObstacleAgent): ORCALine | null {
    const relativePosition = neighbor.position.sub(agent.position);
    const relativeVelocity = agent.velocity.sub(neighbor.velocity);
    const distSq = relativePosition.lengthSquared();
    const combinedRadius = agent.radius + neighbor.radius;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    let line: ORCALine;

    if (distSq > combinedRadiusSq) {
      const w = relativeVelocity.sub(relativePosition.scale(1 / this.config.timeHorizon));
      const wLengthSq = w.lengthSquared();

      const dotProduct = w.dot(relativePosition);

      if (dotProduct < 0 && dotProduct * dotProduct > combinedRadiusSq * wLengthSq) {
        const wLength = Math.sqrt(wLengthSq);
        const unitW = w.scale(1 / wLength);

        const direction = new Vector3(unitW.z, unitW.y, -unitW.x);
        const u = unitW.scale(combinedRadius / this.config.timeHorizon - wLength);

        line = {
          point: agent.velocity.add(u.scale(0.5)),
          direction: direction
        };
      } else {
        const leg = Math.sqrt(distSq - combinedRadiusSq);

        if (this.det(relativePosition, w) > 0) {
          const direction = new Vector3(
            relativePosition.x * leg - relativePosition.z * combinedRadius,
            0,
            relativePosition.x * combinedRadius + relativePosition.z * leg
          ).scale(1 / distSq);

          line = {
            point: agent.velocity.add(relativeVelocity.scale(0.5)),
            direction: direction
          };
        } else {
          const direction = new Vector3(
            relativePosition.x * leg + relativePosition.z * combinedRadius,
            0,
            -relativePosition.x * combinedRadius + relativePosition.z * leg
          ).scale(-1 / distSq);

          line = {
            point: agent.velocity.add(relativeVelocity.scale(0.5)),
            direction: direction
          };
        }
      }
    } else {
      const w = relativeVelocity.sub(relativePosition.scale(1 / deltaTime));
      const wLength = w.length();
      const unitW = w.scale(1 / wLength);

      const direction = new Vector3(unitW.z, unitW.y, -unitW.x);
      const u = unitW.scale(combinedRadius / deltaTime - wLength);

      line = {
        point: agent.velocity.add(u.scale(0.5)),
        direction: direction
      };
    }

    return line;
  }

  /**
   * Computes ORCA line for agent-obstacle interaction.
   */
  private computeObstacleORCALine(agent: ObstacleAgent, obstacle: StaticObstacle): ORCALine | null {
    const relativePosition = obstacle.position.sub(agent.position);
    const distSq = relativePosition.lengthSquared();
    const combinedRadius = agent.radius + obstacle.radius;
    const combinedRadiusSq = combinedRadius * combinedRadius;

    if (distSq > combinedRadiusSq) {
      const w = agent.velocity.sub(relativePosition.scale(1 / this.config.timeHorizonObstacles));
      const wLengthSq = w.lengthSquared();
      const dotProduct = w.dot(relativePosition);

      if (dotProduct < 0 && dotProduct * dotProduct > combinedRadiusSq * wLengthSq) {
        const wLength = Math.sqrt(wLengthSq);
        const unitW = w.scale(1 / wLength);
        const direction = new Vector3(unitW.z, unitW.y, -unitW.x);
        const u = unitW.scale(combinedRadius / this.config.timeHorizonObstacles - wLength);

        return {
          point: agent.velocity.add(u),
          direction: direction
        };
      }
    } else {
      const invTimeStep = 1 / this.config.timeHorizonObstacles;
      const w = agent.velocity.sub(relativePosition.scale(invTimeStep));
      const wLength = w.length();
      const unitW = w.scale(1 / wLength);
      const direction = new Vector3(unitW.z, unitW.y, -unitW.x);
      const u = unitW.scale(combinedRadius * invTimeStep - wLength);

      return {
        point: agent.velocity.add(u),
        direction: direction
      };
    }

    return null;
  }

  /**
   * Linear programming to find optimal velocity satisfying ORCA constraints.
   */
  private linearProgram(
    lines: ORCALine[],
    maxSpeed: number,
    preferredVelocity: Vector3
  ): Vector3 {
    if (lines.length === 0) {
      const speed = preferredVelocity.length();
      if (speed > maxSpeed) {
        return preferredVelocity.normalize().scale(maxSpeed);
      }
      return preferredVelocity;
    }

    let result = preferredVelocity;

    for (let i = 0; i < lines.length; i++) {
      if (this.det(lines[i].direction, lines[i].point.sub(result)) > 0) {
        const tempResult = result;
        result = this.linearProgram1(lines, i, maxSpeed, preferredVelocity);

        if (result.lengthSquared() > maxSpeed * maxSpeed) {
          result = this.linearProgram2(lines, i, maxSpeed, preferredVelocity);
        }
      }
    }

    return result;
  }

  /**
   * Linear programming step 1.
   */
  private linearProgram1(
    lines: ORCALine[],
    lineNo: number,
    maxSpeed: number,
    optVelocity: Vector3
  ): Vector3 {
    const line = lines[lineNo];
    const dotProduct = line.point.dot(line.direction);
    const discriminant = dotProduct * dotProduct + maxSpeed * maxSpeed - line.point.lengthSquared();

    if (discriminant < 0) {
      return line.point.add(line.direction.scale(dotProduct));
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    let tLeft = -dotProduct - sqrtDiscriminant;
    let tRight = -dotProduct + sqrtDiscriminant;

    for (let i = 0; i < lineNo; i++) {
      const denominator = this.det(line.direction, lines[i].direction);
      const numerator = this.det(lines[i].direction, line.point.sub(lines[i].point));

      if (Math.abs(denominator) <= 1e-6) {
        if (numerator < 0) {
          return new Vector3();
        }
        continue;
      }

      const t = numerator / denominator;

      if (denominator >= 0) {
        tRight = Math.min(tRight, t);
      } else {
        tLeft = Math.max(tLeft, t);
      }

      if (tLeft > tRight) {
        return new Vector3();
      }
    }

    const t = line.direction.dot(optVelocity.sub(line.point));

    if (t < tLeft) {
      return line.point.add(line.direction.scale(tLeft));
    } else if (t > tRight) {
      return line.point.add(line.direction.scale(tRight));
    } else {
      return line.point.add(line.direction.scale(t));
    }
  }

  /**
   * Linear programming step 2.
   */
  private linearProgram2(
    lines: ORCALine[],
    lineNo: number,
    maxSpeed: number,
    optVelocity: Vector3
  ): Vector3 {
    const line = lines[lineNo];
    const distance = line.point.dot(line.direction);

    return line.point.add(line.direction.scale(distance));
  }

  /**
   * 2D determinant for vector calculations.
   */
  private det(v1: Vector3, v2: Vector3): number {
    return v1.x * v2.z - v1.z * v2.x;
  }
}

const deltaTime = 0.016;
