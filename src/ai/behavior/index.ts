/**
 * @fileoverview Behavior Tree System for G3D 5.0
 * Complete implementation of behavior trees for AI decision making.
 *
 * Features:
 * - Full behavior tree node types (composites, decorators, actions, conditions)
 * - High performance execution (1000+ trees @ 60 FPS)
 * - Tick scheduling (manual, fixed-rate, event-based)
 * - Hot-reloading support
 * - JSON serialization/deserialization
 * - Hierarchical blackboard with scopes
 * - Debug visualization support
 *
 * @module ai/behavior
 *
 * @example
 * ```typescript
 * import {
 *   BehaviorTree,
 *   Blackboard,
 *   BTSelector,
 *   BTSequence,
 *   BTAction,
 *   BTCondition,
 *   BTCompare,
 *   ComparisonOperator,
 *   NodeStatus,
 * } from './ai/behavior';
 *
 * // Create blackboard
 * const blackboard = new Blackboard('agent');
 * blackboard.set('health', 100);
 * blackboard.set('hasEnemy', false);
 *
 * // Build behavior tree
 * const tree = new BehaviorTree(
 *   new BTSelector('Root', [
 *     // Flee if health low
 *     new BTSequence('FleeWhenHurt', [
 *       new BTCompare('HealthLow', 'health', ComparisonOperator.LESS_THAN, 30),
 *       new BTAction('Flee', (ctx) => {
 *         console.log('Fleeing!');
 *         return NodeStatus.SUCCESS;
 *       }),
 *     ]),
 *     // Attack if enemy present
 *     new BTSequence('AttackEnemy', [
 *       new BTCondition('HasEnemy', (ctx) => ctx.blackboard.get('hasEnemy')),
 *       new BTAction('Attack', (ctx) => {
 *         console.log('Attacking!');
 *         return NodeStatus.SUCCESS;
 *       }),
 *     ]),
 *     // Otherwise patrol
 *     new BTAction('Patrol', (ctx) => {
 *       console.log('Patrolling...');
 *       return NodeStatus.RUNNING;
 *     }),
 *   ]),
 *   blackboard
 * );
 *
 * // Tick the tree each frame
 * function update(deltaTime: number) {
 *   const status = tree.tick(deltaTime);
 *   console.log('Tree status:', status);
 * }
 * ```
 */

// Core types
export { BTNode, NodeStatus } from './BTNode';
export { BehaviorTree, BehaviorTreeManager, TreeEvent, TickMode } from './BehaviorTree';
export { Blackboard } from './Blackboard';

export type { NodeVisitor } from './BTNode';
export type { BehaviorContext, TreeStats } from './BehaviorTree';
export type { BlackboardValue, BlackboardChangeEvent, BlackboardObserver } from './Blackboard';

// Composite nodes
export {
  BTComposite,
  BTSequence,
  BTSelector,
  BTParallel,
  BTRandomSelector,
  BTPrioritySelector,
  ParallelPolicy,
} from './BTComposite';

// Decorator nodes
export {
  BTDecorator,
  BTInverter,
  BTRepeater,
  BTRepeatUntilFail,
  BTCooldown,
  BTTimeLimit,
  BTForceSuccess,
  BTForceFailure,
  BTWait,
  BTUntilSuccess,
} from './BTDecorator';

// Action nodes
export {
  BTAction,
  BTIdle,
  BTWaitAction,
  BTLog,
  BTSetBlackboard,
  BTClearBlackboard,
} from './BTAction';

export type {
  ActionFunction,
  AsyncActionFunction,
} from './BTAction';

// Condition nodes
export {
  BTCondition,
  BTHasKey,
  BTCompare,
  BTIsTrue,
  BTIsFalse,
  BTRandom,
  BTInRange,
  BTAlways,
  BTNever,
  ComparisonOperator,
} from './BTCondition';

export type {
  ConditionFunction,
} from './BTCondition';

// Serialization
export { BTSerializer } from './BTSerializer';

export type { SerializedNode, SerializedTree } from './BTSerializer';
