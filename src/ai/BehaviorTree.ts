/**
 * @fileoverview Behavior tree implementation for AI decision making.
 * Provides composite, decorator, and leaf nodes with blackboard integration.
 * @module ai/BehaviorTree
 */

import { Blackboard } from './Blackboard';

/**
 * Node execution status.
 */
export enum NodeStatus {
  /** Node execution succeeded */
  SUCCESS = 'success',
  /** Node execution failed */
  FAILURE = 'failure',
  /** Node is still running (async) */
  RUNNING = 'running',
}

/**
 * Execution context passed to nodes.
 */
export interface BehaviorContext {
  /** Shared data storage */
  blackboard: Blackboard;
  /** Time elapsed since last tick */
  deltaTime: number;
  /** Current execution depth (for debugging) */
  depth: number;
  /** Abort signal for cancellation */
  abort?: boolean;
}

/**
 * Base class for all behavior tree nodes.
 *
 * @abstract
 */
export abstract class BehaviorNode {
  /** Human-readable node name */
  name: string;

  /** Current execution status */
  status: NodeStatus;

  /** Whether node is currently executing */
  isRunning: boolean;

  /**
   * Creates a new behavior node.
   *
   * @param name - Node name for debugging
   */
  constructor(name: string = 'Node') {
    this.name = name;
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
  }

  /**
   * Executes the node logic.
   * Must be implemented by subclasses.
   *
   * @param context - Execution context
   * @returns Execution status
   */
  abstract tick(context: BehaviorContext): NodeStatus;

  /**
   * Called when node starts executing.
   * Override for initialization logic.
   *
   * @param context - Execution context
   */
  onEnter?(context: BehaviorContext): void;

  /**
   * Called when node finishes executing.
   * Override for cleanup logic.
   *
   * @param context - Execution context
   */
  onExit?(context: BehaviorContext): void;

  /**
   * Resets node state.
   */
  reset(): void {
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
  }
}

/**
 * Action node - performs an action and returns success/failure.
 *
 * @example
 * ```typescript
 * const moveToTarget = new ActionNode('MoveToTarget', (context) => {
 *   const target = context.blackboard.get('target');
 *   const position = context.blackboard.get('position');
 *
 *   if (!target) return NodeStatus.FAILURE;
 *
 *   // Move toward target
 *   const direction = target.sub(position).normalize();
 *   position.addInPlace(direction.scale(5 * context.deltaTime));
 *
 *   // Check if reached
 *   if (position.distanceTo(target) < 1.0) {
 *     return NodeStatus.SUCCESS;
 *   }
 *
 *   return NodeStatus.RUNNING;
 * });
 * ```
 */
export class ActionNode extends BehaviorNode {
  private action: (context: BehaviorContext) => NodeStatus;

  /**
   * Creates a new action node.
   *
   * @param name - Node name
   * @param action - Action function
   */
  constructor(name: string, action: (context: BehaviorContext) => NodeStatus) {
    super(name);
    this.action = action;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.isRunning && this.onEnter) {
      this.onEnter(context);
    }

    this.isRunning = true;
    this.status = this.action(context);

    if (this.status !== NodeStatus.RUNNING) {
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
    }

    return this.status;
  }
}

/**
 * Condition node - evaluates a condition and returns success/failure.
 *
 * @example
 * ```typescript
 * const hasTarget = new ConditionNode('HasTarget', (context) => {
 *   return context.blackboard.has('target')
 *     ? NodeStatus.SUCCESS
 *     : NodeStatus.FAILURE;
 * });
 *
 * const healthLow = new ConditionNode('HealthLow', (context) => {
 *   const health = context.blackboard.get('health', 100);
 *   return health < 30 ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
 * });
 * ```
 */
export class ConditionNode extends BehaviorNode {
  private condition: (context: BehaviorContext) => boolean;

  /**
   * Creates a new condition node.
   *
   * @param name - Node name
   * @param condition - Condition function
   */
  constructor(name: string, condition: (context: BehaviorContext) => boolean) {
    super(name);
    this.condition = condition;
  }

  tick(context: BehaviorContext): NodeStatus {
    this.status = this.condition(context) ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    return this.status;
  }
}

/**
 * Sequence node - executes children in order until one fails.
 * Returns SUCCESS if all children succeed.
 *
 * @example
 * ```typescript
 * const attackSequence = new SequenceNode('AttackSequence', [
 *   new ConditionNode('HasTarget', ...),
 *   new ActionNode('MoveInRange', ...),
 *   new ActionNode('Attack', ...),
 * ]);
 * ```
 */
export class SequenceNode extends BehaviorNode {
  readonly children: BehaviorNode[];
  private currentIndex: number;

  /**
   * Creates a new sequence node.
   *
   * @param name - Node name
   * @param children - Child nodes
   */
  constructor(name: string, children: BehaviorNode[] = []) {
    super(name);
    this.children = children;
    this.currentIndex = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.isRunning) {
      this.currentIndex = 0;
      this.isRunning = true;
    }

    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick(context);

      if (status === NodeStatus.FAILURE) {
        this.reset();
        return NodeStatus.FAILURE;
      }

      if (status === NodeStatus.RUNNING) {
        return NodeStatus.RUNNING;
      }

      // Child succeeded, move to next
      this.currentIndex++;
    }

    // All children succeeded
    this.reset();
    return NodeStatus.SUCCESS;
  }

  override reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * Selector node - executes children until one succeeds.
 * Returns SUCCESS if any child succeeds, FAILURE if all fail.
 *
 * @example
 * ```typescript
 * const attackOrFlee = new SelectorNode('AttackOrFlee', [
 *   new SequenceNode('TryAttack', [
 *     new ConditionNode('HealthHigh', ...),
 *     new ActionNode('Attack', ...),
 *   ]),
 *   new ActionNode('Flee', ...),
 * ]);
 * ```
 */
export class SelectorNode extends BehaviorNode {
  readonly children: BehaviorNode[];
  private currentIndex: number;

  /**
   * Creates a new selector node.
   *
   * @param name - Node name
   * @param children - Child nodes
   */
  constructor(name: string, children: BehaviorNode[] = []) {
    super(name);
    this.children = children;
    this.currentIndex = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.isRunning) {
      this.currentIndex = 0;
      this.isRunning = true;
    }

    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) {
        this.reset();
        return NodeStatus.SUCCESS;
      }

      if (status === NodeStatus.RUNNING) {
        return NodeStatus.RUNNING;
      }

      // Child failed, try next
      this.currentIndex++;
    }

    // All children failed
    this.reset();
    return NodeStatus.FAILURE;
  }

  override reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * Parallel node - executes all children simultaneously.
 * Various success/failure policies available.
 *
 * @example
 * ```typescript
 * const patrolAndWatch = new ParallelNode(
 *   'PatrolAndWatch',
 *   [
 *     new ActionNode('Patrol', ...),
 *     new ActionNode('WatchForEnemies', ...),
 *   ],
 *   ParallelPolicy.REQUIRE_ALL
 * );
 * ```
 */
export class ParallelNode extends BehaviorNode {
  readonly children: BehaviorNode[];
  private policy: ParallelPolicy;

  /**
   * Creates a new parallel node.
   *
   * @param name - Node name
   * @param children - Child nodes
   * @param policy - Success/failure policy
   */
  constructor(
    name: string,
    children: BehaviorNode[] = [],
    policy: ParallelPolicy = ParallelPolicy.REQUIRE_ONE
  ) {
    super(name);
    this.children = children;
    this.policy = policy;
  }

  tick(context: BehaviorContext): NodeStatus {
    let successCount = 0;
    let failureCount = 0;
    let runningCount = 0;

    for (const child of this.children) {
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) successCount++;
      else if (status === NodeStatus.FAILURE) failureCount++;
      else if (status === NodeStatus.RUNNING) runningCount++;
    }

    // Check policy
    if (this.policy === ParallelPolicy.REQUIRE_ALL) {
      if (failureCount > 0) return NodeStatus.FAILURE;
      if (successCount === this.children.length) return NodeStatus.SUCCESS;
    } else if (this.policy === ParallelPolicy.REQUIRE_ONE) {
      if (successCount > 0) return NodeStatus.SUCCESS;
      if (failureCount === this.children.length) return NodeStatus.FAILURE;
    }

    return NodeStatus.RUNNING;
  }

  override reset(): void {
    super.reset();
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * Parallel node success/failure policy.
 */
export enum ParallelPolicy {
  /** Succeed if at least one child succeeds */
  REQUIRE_ONE = 'require_one',
  /** Succeed only if all children succeed */
  REQUIRE_ALL = 'require_all',
}

/**
 * Inverter decorator - inverts child status (SUCCESS <-> FAILURE).
 *
 * @example
 * ```typescript
 * const notHasTarget = new InverterNode(
 *   'NotHasTarget',
 *   new ConditionNode('HasTarget', ...)
 * );
 * ```
 */
export class InverterNode extends BehaviorNode {
  readonly child: BehaviorNode;

  constructor(name: string, child: BehaviorNode) {
    super(name);
    this.child = child;
  }

  tick(context: BehaviorContext): NodeStatus {
    const status = this.child.tick(context);

    if (status === NodeStatus.SUCCESS) return NodeStatus.FAILURE;
    if (status === NodeStatus.FAILURE) return NodeStatus.SUCCESS;
    return NodeStatus.RUNNING;
  }

  override reset(): void {
    super.reset();
    this.child.reset();
  }
}

/**
 * Repeater decorator - repeats child execution N times or infinitely.
 *
 * @example
 * ```typescript
 * // Repeat 5 times
 * const repeat5 = new RepeaterNode('Repeat5', child, 5);
 *
 * // Repeat forever
 * const repeatForever = new RepeaterNode('RepeatForever', child, -1);
 * ```
 */
export class RepeaterNode extends BehaviorNode {
  readonly child: BehaviorNode;
  private maxRepeats: number;
  private currentRepeat: number;

  /**
   * Creates a new repeater node.
   *
   * @param name - Node name
   * @param child - Child node
   * @param maxRepeats - Max repetitions (-1 for infinite)
   */
  constructor(name: string, child: BehaviorNode, maxRepeats: number = -1) {
    super(name);
    this.child = child;
    this.maxRepeats = maxRepeats;
    this.currentRepeat = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (this.maxRepeats >= 0 && this.currentRepeat >= this.maxRepeats) {
      return NodeStatus.SUCCESS;
    }

    const status = this.child.tick(context);

    if (status !== NodeStatus.RUNNING) {
      this.child.reset();
      this.currentRepeat++;

      // Check if should continue
      if (this.maxRepeats >= 0 && this.currentRepeat >= this.maxRepeats) {
        this.currentRepeat = 0;
        return NodeStatus.SUCCESS;
      }

      return NodeStatus.RUNNING;
    }

    return NodeStatus.RUNNING;
  }

  override reset(): void {
    super.reset();
    this.currentRepeat = 0;
    this.child.reset();
  }
}

/**
 * Succeeder decorator - always returns SUCCESS.
 *
 * @example
 * ```typescript
 * const tryAttack = new SucceederNode('TryAttack', attackAction);
 * ```
 */
export class SucceederNode extends BehaviorNode {
  readonly child: BehaviorNode;

  constructor(name: string, child: BehaviorNode) {
    super(name);
    this.child = child;
  }

  tick(context: BehaviorContext): NodeStatus {
    const status = this.child.tick(context);
    return status === NodeStatus.RUNNING ? NodeStatus.RUNNING : NodeStatus.SUCCESS;
  }

  override reset(): void {
    super.reset();
    this.child.reset();
  }
}

/**
 * Limiter decorator - limits child execution rate.
 *
 * @example
 * ```typescript
 * // Only execute every 2 seconds
 * const limitedAttack = new LimiterNode('LimitedAttack', attackAction, 2.0);
 * ```
 */
export class LimiterNode extends BehaviorNode {
  readonly child: BehaviorNode;
  private cooldown: number;
  private lastExecutionTime: number;

  /**
   * Creates a new limiter node.
   *
   * @param name - Node name
   * @param child - Child node
   * @param cooldown - Cooldown in seconds
   */
  constructor(name: string, child: BehaviorNode, cooldown: number) {
    super(name);
    this.child = child;
    this.cooldown = cooldown;
    this.lastExecutionTime = -cooldown;
  }

  tick(context: BehaviorContext): NodeStatus {
    const now = Date.now() / 1000;
    const elapsed = now - this.lastExecutionTime;

    if (elapsed < this.cooldown) {
      return NodeStatus.FAILURE;
    }

    this.lastExecutionTime = now;
    return this.child.tick(context);
  }

  override reset(): void {
    super.reset();
    this.child.reset();
  }
}

/**
 * Wait decorator - waits for duration before executing child.
 *
 * @example
 * ```typescript
 * const waitAndAttack = new WaitNode('WaitAndAttack', attackAction, 1.0);
 * ```
 */
export class WaitNode extends BehaviorNode {
  readonly child: BehaviorNode;
  private duration: number;
  private elapsed: number;

  constructor(name: string, child: BehaviorNode, duration: number) {
    super(name);
    this.child = child;
    this.duration = duration;
    this.elapsed = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    this.elapsed += context.deltaTime;

    if (this.elapsed < this.duration) {
      return NodeStatus.RUNNING;
    }

    return this.child.tick(context);
  }

  override reset(): void {
    super.reset();
    this.elapsed = 0;
    this.child.reset();
  }
}

/**
 * Behavior tree for AI decision making.
 * Executes a tree of nodes to control agent behavior.
 *
 * @example
 * ```typescript
 * // Create blackboard
 * const blackboard = new Blackboard();
 * blackboard.set('health', 100);
 * blackboard.set('position', new Vector3());
 *
 * // Build behavior tree
 * const tree = new BehaviorTree(
 *   new SelectorNode('Root', [
 *     // If health low, flee
 *     new SequenceNode('FleeWhenHurt', [
 *       new ConditionNode('HealthLow', (ctx) =>
 *         ctx.blackboard.get('health') < 30 ? NodeStatus.SUCCESS : NodeStatus.FAILURE
 *       ),
 *       new ActionNode('Flee', (ctx) => {
 *         // Flee logic...
 *         return NodeStatus.SUCCESS;
 *       }),
 *     ]),
 *     // Otherwise, attack
 *     new SequenceNode('Attack', [
 *       new ConditionNode('HasTarget', ...),
 *       new ActionNode('MoveToTarget', ...),
 *       new ActionNode('AttackTarget', ...),
 *     ]),
 *   ]),
 *   blackboard
 * );
 *
 * // Update each frame
 * const status = tree.tick(0.016);
 * ```
 */
export class BehaviorTree {
  /** Root node of the tree */
  readonly root: BehaviorNode;

  /** Shared blackboard */
  readonly blackboard: Blackboard;

  /** Whether tree is currently executing */
  isRunning: boolean;

  /** Tree execution status */
  status: NodeStatus;

  /**
   * Creates a new behavior tree.
   *
   * @param root - Root node
   * @param blackboard - Shared blackboard
   */
  constructor(root: BehaviorNode, blackboard: Blackboard = new Blackboard()) {
    this.root = root;
    this.blackboard = blackboard;
    this.isRunning = false;
    this.status = NodeStatus.FAILURE;
  }

  /**
   * Executes one tick of the behavior tree.
   *
   * @param deltaTime - Time since last tick
   * @returns Execution status
   */
  tick(deltaTime: number): NodeStatus {
    const context: BehaviorContext = {
      blackboard: this.blackboard,
      deltaTime,
      depth: 0,
    };

    this.isRunning = true;
    this.status = this.root.tick(context);
    this.isRunning = this.status === NodeStatus.RUNNING;

    return this.status;
  }

  /**
   * Resets the entire tree.
   */
  reset(): void {
    this.root.reset();
    this.isRunning = false;
    this.status = NodeStatus.FAILURE;
  }

  /**
   * Gets a debug string representation of the tree.
   */
  toString(node: BehaviorNode = this.root, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let result = `${prefix}${node.name} [${node.status}]\n`;

    if ('children' in node) {
      const composite = node as SequenceNode | SelectorNode | ParallelNode;
      for (const child of composite.children) {
        result += this.toString(child, indent + 1);
      }
    } else if ('child' in node) {
      const decorator = node as InverterNode | RepeaterNode;
      result += this.toString(decorator.child, indent + 1);
    }

    return result;
  }
}
