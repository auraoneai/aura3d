/**
 * @module AI
 * @description
 * Comprehensive AI and navigation system for the G3D engine.
 *
 * This module provides production-ready AI capabilities including:
 *
 * **Navigation:**
 * - NavMesh: Polygon-based navigation meshes with area types and costs
 * - Pathfinding: A* pathfinding with string pulling and path smoothing
 * - NavAgent: Path following agents with steering behaviors
 * - CrowdManager: Multi-agent coordination with RVO local avoidance
 *
 * **Behavior:**
 * - BehaviorTree: Hierarchical behavior trees with composite and decorator nodes
 * - StateMachine: Finite state machines with transitions and hierarchical states
 * - Blackboard: Shared data storage with change notifications
 *
 * **Perception:**
 * - Perception: Sight and hearing sensing with memory decay
 * - Target tracking with confidence levels
 * - Stimulus processing (sight, sound, damage)
 *
 * **Integration:**
 * - AISystem: ECS integration for AI components
 * - Efficient updates for 100+ agents
 * - Performance-optimized with spatial partitioning
 *
 * @example
 * ```typescript
 * import {
 *   NavMesh,
 *   Pathfinder,
 *   NavAgent,
 *   BehaviorTree,
 *   ActionNode,
 *   SelectorNode,
 *   ConditionNode,
 *   Blackboard,
 *   AISystem,
 * } from './ai';
 *
 * // Create navigation mesh
 * const navMesh = new NavMesh();
 * await navMesh.bake(geometry, config);
 *
 * // Create pathfinder
 * const pathfinder = new Pathfinder(navMesh);
 *
 * // Create navigation agent
 * const agent = new NavAgent(startPos);
 * agent.setDestination(targetPos, pathfinder, navMesh);
 *
 * // Create behavior tree
 * const blackboard = new Blackboard();
 * const tree = new BehaviorTree(
 *   new SelectorNode('Root', [
 *     new SequenceNode('Attack', [
 *       new ConditionNode('HasTarget', (ctx) =>
 *         ctx.blackboard.has('target') ? NodeStatus.SUCCESS : NodeStatus.FAILURE
 *       ),
 *       new ActionNode('MoveToTarget', (ctx) => {
 *         // Move logic...
 *         return NodeStatus.SUCCESS;
 *       }),
 *     ]),
 *     new ActionNode('Patrol', (ctx) => {
 *       // Patrol logic...
 *       return NodeStatus.SUCCESS;
 *     }),
 *   ]),
 *   blackboard
 * );
 *
 * // Update each frame
 * agent.update(deltaTime, navMesh, pathfinder);
 * tree.tick(deltaTime);
 * ```
 */

// Navigation mesh
export {
  NavMesh,
  NavPolygon,
  NavLink,
  NavLinkType,
  NavAreaTypes,
  NavAreaCosts,
  DefaultNavMeshConfig,
} from './NavMesh';

export type {
  NavAreaType,
  NavMeshConfig,
} from './NavMesh';

// Pathfinding
export {
  Pathfinder,
  PathStatus,
} from './Pathfinding';

export type {
  Path,
} from './Pathfinding';

// Navigation agent
export {
  NavAgent,
  AgentState,
  SteeringBehavior,
} from './NavAgent';

// Crowd simulation
export {
  CrowdManager,
  CrowdAgent,
  FormationType,
  AgentPriorities,
} from './CrowdManager';

export type {
  Formation,
  AgentPriority,
} from './CrowdManager';

// Behavior tree
export {
  BehaviorTree,
  BehaviorNode,
  NodeStatus,
  ActionNode,
  ConditionNode,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  ParallelPolicy,
  InverterNode,
  RepeaterNode,
  SucceederNode,
  LimiterNode,
  WaitNode,
} from './BehaviorTree';

export type {
  BehaviorContext,
} from './BehaviorTree';

// Blackboard
export {
  Blackboard,
} from './Blackboard';

export type {
  BlackboardValue,
  BlackboardChangeEvent,
} from './Blackboard';

// State machine
export {
  StateMachine,
  State,
} from './StateMachine';

export type {
  StateTransition,
  AIAITransitionCondition,
} from './StateMachine';

// Perception
export {
  Perception,
  StimulusType,
  DefaultPerceptionConfig,
} from './Perception';

export type {
  PerceptionMemory,
  Stimulus,
  PerceptionConfig,
  SightConfig,
  HearingConfig,
} from './Perception';

// ECS integration
export {
  AISystem,
  AIComponent,
  createBasicAI,
  createAIWithBehavior,
  createAIWithPerception,
} from './AISystem';

// Phase D: Advanced Navigation
export * from './navigation';

// Phase D: Behavior Tree System
export * from './behavior';

// Phase D: Finite State Machines
// Note: fsm exports a type ComparisonOperator that conflicts with behavior's enum ComparisonOperator
// Users should import directly from './ai/fsm' if they need the FSM version
export {
  StateMachine as FSMStateMachine,
  State as FSMState,
  Transition as FSMTransition,
  StateCondition,
  HierarchicalFSM,
} from './fsm';
export type { LogicalOperator } from './fsm';

// Phase D: Steering Behaviors
// Note: Some exports conflict with earlier modules, so they're renamed with 'Steering' prefix
export {
  SteeringBehavior as SteeringBehaviorBase,
  Arrive,
  Flee,
  Pursuit,
  Evade,
  Wander,
  Seek,
  Flock,
  Formation as SteeringFormation,
  FormationType as SteeringFormationType,
  ObstacleAvoidance as SteeringObstacleAvoidance,
  WallAvoidance,
  SteeringPipeline,
  BlendMode,
  Deceleration,
} from './steering';
export type { Neighbor, FormationSlot, Obstacle, Wall } from './steering';

// Phase D: Perception System
export * from './Perception';

// Phase D: Planning (GOAP, HTN, UtilityAI)
export * from './planning';

// Phase D: ML/Neural AI
export * from './ml';

// Phase D: Computer Vision
export * from './computervision';

// Phase D: Cultural AI
export * from './cultural';

// Phase D: L-Systems
export * from './lsystem';

// Phase D: Balancing System
export * from './balancing';

// Phase D: Smart Systems
export * from './smart';
