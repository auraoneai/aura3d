/**
 * @fileoverview AI system for ECS integration.
 * Manages AI components, navigation agents, and behavior trees.
 * @module ai/AISystem
 */

import { System, SystemContext, SystemPriorities } from '../ecs/System';
import { IComponent } from '../ecs/Component';
import { Entity } from '../ecs/Entity';
import { NavAgent, AgentState } from './NavAgent';
import { NavMesh } from './NavMesh';
import { Pathfinder } from './Pathfinding';
import { CrowdManager } from './CrowdManager';
import { BehaviorTree, NodeStatus } from './BehaviorTree';
import { StateMachine } from './StateMachine';
import { Perception } from './Perception';
import { Blackboard } from './Blackboard';

/**
 * AI component for entities.
 * Combines navigation, behavior, and perception.
 *
 * @example
 * ```typescript
 * const aiComponent = new AIComponent();
 * aiComponent.agent = new NavAgent(position);
 * aiComponent.blackboard = new Blackboard();
 * aiComponent.behaviorTree = new BehaviorTree(rootNode, aiComponent.blackboard);
 *
 * world.addComponent(entity, AIComponent, aiComponent);
 * ```
 */
export class AIComponent implements IComponent {
  /** Navigation agent for movement */
  agent: NavAgent | null;

  /** Behavior tree for decision making */
  behaviorTree: BehaviorTree | null;

  /** State machine for behavior control */
  stateMachine: StateMachine | null;

  /** Perception system for sensing */
  perception: Perception | null;

  /** Shared blackboard for data */
  blackboard: Blackboard;

  /** Whether AI is enabled */
  enabled: boolean;

  /** Debug visualization enabled */
  debugDraw: boolean;

  /**
   * Creates a new AI component.
   */
  constructor() {
    this.agent = null;
    this.behaviorTree = null;
    this.stateMachine = null;
    this.perception = null;
    this.blackboard = new Blackboard();
    this.enabled = true;
    this.debugDraw = false;
  }

  /**
   * Resets the AI component.
   */
  reset(): void {
    this.agent?.reset();
    this.behaviorTree?.reset();
    this.blackboard.clear();
    this.enabled = true;
  }

  /**
   * Serializes the AI component.
   */
  serialize(): object {
    return {
      enabled: this.enabled,
      blackboard: this.blackboard.snapshot(),
      agent: this.agent?.serialize(),
    };
  }

  /**
   * Deserializes the AI component.
   */
  deserialize(data: any): void {
    if (data.enabled !== undefined) {
      this.enabled = data.enabled;
    }
    if (data.blackboard) {
      this.blackboard.restore(data.blackboard);
    }
    if (data.agent && this.agent) {
      this.agent.deserialize(data.agent);
    }
  }
}

/**
 * AI system for processing AI components in the ECS.
 * Handles navigation agent updates, behavior tree ticking, and perception.
 *
 * @example
 * ```typescript
 * // Create AI system
 * const navMesh = new NavMesh();
 * const aiSystem = new AISystem(navMesh);
 *
 * // Add to world
 * world.addSystem(aiSystem);
 *
 * // System will automatically update AI components each frame
 * ```
 */
export class AISystem extends System {
  /** Navigation mesh for pathfinding */
  readonly navMesh: NavMesh;

  /** Pathfinder instance */
  readonly pathfinder: Pathfinder;

  /** Crowd manager for multi-agent coordination */
  readonly crowdManager: CrowdManager;

  /** Enable crowd simulation */
  enableCrowdSimulation: boolean;

  /** Enable perception updates */
  enablePerception: boolean;

  /** AI component query */
  readonly query = [AIComponent];

  /**
   * Creates a new AI system.
   *
   * @param navMesh - Navigation mesh
   * @param enableCrowdSimulation - Enable crowd simulation
   */
  constructor(navMesh: NavMesh, enableCrowdSimulation: boolean = true) {
    super({
      name: 'AISystem',
      priority: SystemPriorities.DEFAULT,
    });

    this.navMesh = navMesh;
    this.pathfinder = new Pathfinder(navMesh);
    this.crowdManager = new CrowdManager(navMesh);
    this.enableCrowdSimulation = enableCrowdSimulation;
    this.enablePerception = true;
  }

  /**
   * Initializes the AI system.
   */
  override onInit(): void {
    console.log('AI System initialized');
  }

  /**
   * Updates all AI components.
   */
  update(context: SystemContext): void {
    const query = this.getQuery();

    // Collect all agents for crowd simulation
    if (this.enableCrowdSimulation) {
      this.updateCrowdSimulation(query, context.deltaTime);
    } else {
      // Update agents individually
      this.updateAgents(query, context.deltaTime);
    }

    // Update behavior trees and state machines
    this.updateBehaviors(query, context.deltaTime);

    // Update perception
    if (this.enablePerception) {
      this.updatePerception(query, context.deltaTime);
    }
  }

  /**
   * Updates navigation agents individually.
   * @private
   */
  private updateAgents(query: any, deltaTime: number): void {
    query.forEach((entity: Entity, components: IComponent[]) => {
      const ai = components[0] as AIComponent;

      if (!ai.enabled || !ai.agent) return;

      // Update agent
      ai.agent.update(deltaTime, this.navMesh, this.pathfinder);

      // Sync agent state to blackboard
      ai.blackboard.set('position', ai.agent.position.clone(), false);
      ai.blackboard.set('velocity', ai.agent.velocity.clone(), false);
      ai.blackboard.set('speed', ai.agent.getSpeed(), false);
      ai.blackboard.set('hasArrived', ai.agent.hasArrived(), false);
      ai.blackboard.set('isBlocked', ai.agent.isBlocked(), false);
    });
  }

  /**
   * Updates crowd simulation.
   * @private
   */
  private updateCrowdSimulation(query: any, deltaTime: number): void {
    // Update individual agents first
    this.updateAgents(query, deltaTime);

    // Then update crowd simulation for coordination
    this.crowdManager.update(deltaTime);
  }

  /**
   * Updates behavior trees and state machines.
   * @private
   */
  private updateBehaviors(query: any, deltaTime: number): void {
    query.forEach((entity: Entity, components: IComponent[]) => {
      const ai = components[0] as AIComponent;

      if (!ai.enabled) return;

      // Update behavior tree
      if (ai.behaviorTree) {
        const status = ai.behaviorTree.tick(deltaTime);

        // Store status in blackboard
        ai.blackboard.set('behaviorStatus', status, false);
      }

      // Update state machine
      if (ai.stateMachine) {
        ai.stateMachine.update(deltaTime);

        // Store current state in blackboard
        const currentState = ai.stateMachine.getCurrentStateId();
        ai.blackboard.set('currentState', currentState, false);
      }
    });
  }

  /**
   * Updates perception for all agents.
   * @private
   */
  private updatePerception(query: any, deltaTime: number): void {
    // Collect all entities with perception
    const perceivers: Array<{ entity: Entity; ai: AIComponent }> = [];

    query.forEach((entity: Entity, components: IComponent[]) => {
      const ai = components[0] as AIComponent;
      if (ai.enabled && ai.perception && ai.agent) {
        // Update perception position and direction
        ai.perception.position = ai.agent.position.clone();
        ai.perception.forward = ai.agent.heading.clone();

        perceivers.push({ entity, ai });
      }
    });

    // Update sight for each perceiver
    for (const { entity, ai } of perceivers) {
      if (!ai.perception) continue;

      // Collect potential targets (other entities)
      const potentialTargets: Entity[] = [];
      const targetPositions = new Map<Entity, any>();

      for (const { entity: otherEntity, ai: otherAI } of perceivers) {
        if (entity === otherEntity) continue;
        if (!otherAI.agent) continue;

        potentialTargets.push(otherEntity);
        targetPositions.set(otherEntity, otherAI.agent.position);
      }

      // Update sight
      ai.perception.updateSight(potentialTargets, targetPositions, deltaTime);

      // Update memory decay
      ai.perception.updateMemory(deltaTime);

      // Store best target in blackboard
      const bestTarget = ai.perception.getBestTarget();
      if (bestTarget) {
        ai.blackboard.set('target', bestTarget[0], false);
        ai.blackboard.set('targetPosition', bestTarget[1].lastSeenPosition.clone(), false);
        ai.blackboard.set('targetConfidence', bestTarget[1].confidence, false);
      } else {
        ai.blackboard.delete('target', false);
        ai.blackboard.delete('targetPosition', false);
        ai.blackboard.delete('targetConfidence', false);
      }
    }
  }

  /**
   * Cleanup when system is destroyed.
   */
  override onDestroy(): void {
    this.crowdManager.clear();
    this.pathfinder.clearCache();
  }

  /**
   * Sets a destination for an agent.
   *
   * @param entity - Entity with AI component
   * @param destination - Target position
   * @returns True if path was found
   *
   * @example
   * ```typescript
   * const success = aiSystem.setAgentDestination(
   *   entity,
   *   new Vector3(100, 0, 50)
   * );
   * ```
   */
  setAgentDestination(entity: Entity, destination: any): boolean {
    const query = this.getQuery();
    const components = query.get(entity);
    if (!components) return false;

    const ai = components[0] as AIComponent;
    if (!ai.agent) return false;

    return ai.agent.setDestination(destination, this.pathfinder, this.navMesh);
  }

  /**
   * Stops an agent's movement.
   *
   * @param entity - Entity with AI component
   */
  stopAgent(entity: Entity): void {
    const query = this.getQuery();
    const components = query.get(entity);
    if (!components) return;

    const ai = components[0] as AIComponent;
    ai.agent?.stop();
  }

  /**
   * Gets statistics about the AI system.
   */
  getStats(): {
    agentCount: number;
    crowdStats: any;
    pathCacheSize: number;
  } {
    let agentCount = 0;
    const query = this.getQuery();

    query.forEach((entity: Entity, components: IComponent[]) => {
      const ai = components[0] as AIComponent;
      if (ai.enabled && ai.agent) {
        agentCount++;
      }
    });

    return {
      agentCount,
      crowdStats: this.crowdManager.getStats(),
      pathCacheSize: this.pathfinder.getCacheStats().size,
    };
  }
}

/**
 * Helper function to create a basic AI component with navigation.
 *
 * @param position - Initial position
 * @param maxSpeed - Maximum speed
 * @returns Configured AI component
 *
 * @example
 * ```typescript
 * const ai = createBasicAI(new Vector3(0, 0, 0), 5.0);
 * world.addComponent(entity, AIComponent, ai);
 * ```
 */
export function createBasicAI(position: any, maxSpeed: number = 5.0): AIComponent {
  const ai = new AIComponent();
  ai.agent = new NavAgent(position);
  ai.agent.maxSpeed = maxSpeed;
  return ai;
}

/**
 * Helper function to create an AI component with behavior tree.
 *
 * @param position - Initial position
 * @param behaviorTree - Behavior tree
 * @returns Configured AI component
 *
 * @example
 * ```typescript
 * const tree = new BehaviorTree(rootNode);
 * const ai = createAIWithBehavior(new Vector3(0, 0, 0), tree);
 * ```
 */
export function createAIWithBehavior(position: any, behaviorTree: BehaviorTree): AIComponent {
  const ai = createBasicAI(position);
  ai.behaviorTree = behaviorTree;
  return ai;
}

/**
 * Helper function to create an AI component with perception.
 *
 * @param position - Initial position
 * @param forward - Forward direction
 * @param sightRange - Sight range
 * @returns Configured AI component
 *
 * @example
 * ```typescript
 * const ai = createAIWithPerception(
 *   new Vector3(0, 0, 0),
 *   new Vector3(0, 0, 1),
 *   50.0
 * );
 * ```
 */
export function createAIWithPerception(
  position: any,
  forward: any,
  sightRange: number = 50.0
): AIComponent {
  const ai = createBasicAI(position);
  ai.perception = new Perception(position, forward);
  ai.perception.config.sight.range = sightRange;
  return ai;
}
