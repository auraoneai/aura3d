/**
 * @fileoverview Composite behavior tree nodes that manage multiple children.
 * Includes Sequence, Selector, Parallel, Random Selector, and Priority Selector nodes.
 * @module ai/behavior/BTComposite
 */

import { BTNode, NodeStatus } from './BTNode';
import type { BehaviorContext } from './BehaviorTree';

/**
 * Base class for composite nodes that have multiple children.
 * Provides common functionality for managing child nodes.
 *
 * @abstract
 */
export abstract class BTComposite extends BTNode {
  /** Child nodes executed by this composite */
  readonly children: BTNode[];

  /** Index of currently executing child */
  protected currentIndex: number;

  /**
   * Creates a new composite node.
   *
   * @param name - Node name
   * @param children - Child nodes
   */
  constructor(name: string, children: BTNode[] = []) {
    super(name);
    this.children = children;
    this.currentIndex = 0;
  }

  /**
   * Adds a child node.
   *
   * @param child - Child node to add
   * @returns This composite for chaining
   */
  addChild(child: BTNode): this {
    this.children.push(child);
    return this;
  }

  /**
   * Removes a child node.
   *
   * @param child - Child node to remove
   * @returns True if child was removed
   */
  removeChild(child: BTNode): boolean {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      return true;
    }
    return false;
  }

  override reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const child of this.children) {
      child.reset();
    }
  }

  override abort(context: BehaviorContext): void {
    for (const child of this.children) {
      if (child.isRunning) {
        child.abort(context);
      }
    }
    super.abort(context);
  }

  override getChildren(): BTNode[] {
    return this.children;
  }

  override clone(): BTNode {
    const cloned = super.clone() as BTComposite;
    (cloned as { children: BTNode[] }).children = this.children.map((child) => child.clone());
    return cloned;
  }
}

/**
 * Sequence node - executes children in order until one fails.
 * Returns SUCCESS if all children succeed, FAILURE if any fails.
 * Similar to logical AND operation.
 *
 * @example
 * ```typescript
 * const attackSequence = new BTSequence('AttackSequence', [
 *   new BTCondition('HasTarget', (ctx) => ctx.blackboard.has('target')),
 *   new BTAction('MoveInRange', moveToTargetAction),
 *   new BTAction('Attack', attackAction),
 * ]);
 * ```
 */
export class BTSequence extends BTComposite {
  /**
   * Creates a new sequence node.
   *
   * @param name - Node name
   * @param children - Child nodes to execute in sequence
   */
  constructor(name: string = 'Sequence', children: BTNode[] = []) {
    super(name, children);
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.currentIndex = 0;
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick(context);

      if (status === NodeStatus.FAILURE) {
        this.status = NodeStatus.FAILURE;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.FAILURE;
      }

      if (status === NodeStatus.RUNNING) {
        this.status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }

      // Child succeeded, move to next
      this.currentIndex++;
    }

    // All children succeeded
    this.status = NodeStatus.SUCCESS;
    this.isRunning = false;
    if (this.onExit) {
      this.onExit(context);
    }
    return NodeStatus.SUCCESS;
  }
}

/**
 * Selector node - executes children until one succeeds.
 * Returns SUCCESS if any child succeeds, FAILURE if all fail.
 * Similar to logical OR operation.
 *
 * @example
 * ```typescript
 * const attackOrFlee = new BTSelector('AttackOrFlee', [
 *   new BTSequence('TryAttack', [
 *     new BTCondition('HealthHigh', healthHighCondition),
 *     new BTAction('Attack', attackAction),
 *   ]),
 *   new BTAction('Flee', fleeAction),
 * ]);
 * ```
 */
export class BTSelector extends BTComposite {
  /**
   * Creates a new selector node.
   *
   * @param name - Node name
   * @param children - Child nodes to try in order
   */
  constructor(name: string = 'Selector', children: BTNode[] = []) {
    super(name, children);
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.currentIndex = 0;
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }

      if (status === NodeStatus.RUNNING) {
        this.status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }

      // Child failed, try next
      this.currentIndex++;
    }

    // All children failed
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
    if (this.onExit) {
      this.onExit(context);
    }
    return NodeStatus.FAILURE;
  }
}

/**
 * Parallel execution policy for parallel nodes.
 */
export enum ParallelPolicy {
  /** Succeed if at least one child succeeds */
  REQUIRE_ONE = 'require_one',
  /** Succeed only if all children succeed */
  REQUIRE_ALL = 'require_all',
}

/**
 * Parallel node - executes all children simultaneously.
 * Success/failure behavior determined by policy.
 *
 * @example
 * ```typescript
 * const patrolAndWatch = new BTParallel(
 *   'PatrolAndWatch',
 *   [
 *     new BTAction('Patrol', patrolAction),
 *     new BTAction('WatchForEnemies', watchAction),
 *   ],
 *   ParallelPolicy.REQUIRE_ALL
 * );
 * ```
 */
export class BTParallel extends BTComposite {
  /** Success/failure policy */
  private readonly policy: ParallelPolicy;

  /**
   * Creates a new parallel node.
   *
   * @param name - Node name
   * @param children - Child nodes to execute in parallel
   * @param policy - Success/failure policy
   */
  constructor(
    name: string = 'Parallel',
    children: BTNode[] = [],
    policy: ParallelPolicy = ParallelPolicy.REQUIRE_ONE
  ) {
    super(name, children);
    this.policy = policy;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    let successCount = 0;
    let failureCount = 0;
    let runningCount = 0;

    // Tick all children
    for (const child of this.children) {
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) {
        successCount++;
      } else if (status === NodeStatus.FAILURE) {
        failureCount++;
      } else if (status === NodeStatus.RUNNING) {
        runningCount++;
      }
    }

    // Evaluate policy
    if (this.policy === ParallelPolicy.REQUIRE_ALL) {
      // Fail if any child failed
      if (failureCount > 0) {
        this.status = NodeStatus.FAILURE;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.FAILURE;
      }

      // Succeed if all children succeeded
      if (successCount === this.children.length) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }
    } else if (this.policy === ParallelPolicy.REQUIRE_ONE) {
      // Succeed if any child succeeded
      if (successCount > 0) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }

      // Fail if all children failed
      if (failureCount === this.children.length) {
        this.status = NodeStatus.FAILURE;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.FAILURE;
      }
    }

    // Still running
    this.status = NodeStatus.RUNNING;
    return NodeStatus.RUNNING;
  }

  override reset(): void {
    super.reset();
    // Reset all children in parallel nodes
    for (const child of this.children) {
      child.reset();
    }
  }
}

/**
 * Random selector node - executes children in random order until one succeeds.
 * Shuffles children on each execution start.
 *
 * @example
 * ```typescript
 * const randomBehavior = new BTRandomSelector('RandomBehavior', [
 *   new BTAction('Dance', danceAction),
 *   new BTAction('Jump', jumpAction),
 *   new BTAction('Spin', spinAction),
 * ]);
 * ```
 */
export class BTRandomSelector extends BTComposite {
  /** Shuffled indices for random selection */
  private shuffledIndices: number[];

  /**
   * Creates a new random selector node.
   *
   * @param name - Node name
   * @param children - Child nodes to try in random order
   */
  constructor(name: string = 'RandomSelector', children: BTNode[] = []) {
    super(name, children);
    this.shuffledIndices = [];
  }

  /**
   * Shuffles the children indices using Fisher-Yates algorithm.
   * @private
   */
  private shuffleIndices(): void {
    this.shuffledIndices = Array.from({ length: this.children.length }, (_, i) => i);

    for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledIndices[i], this.shuffledIndices[j]] = [
        this.shuffledIndices[j],
        this.shuffledIndices[i],
      ];
    }
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.currentIndex = 0;
      this.shuffleIndices();
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    while (this.currentIndex < this.children.length) {
      const childIndex = this.shuffledIndices[this.currentIndex];
      const child = this.children[childIndex];
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }

      if (status === NodeStatus.RUNNING) {
        this.status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }

      // Child failed, try next
      this.currentIndex++;
    }

    // All children failed
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
    if (this.onExit) {
      this.onExit(context);
    }
    return NodeStatus.FAILURE;
  }
}

/**
 * Priority selector node - executes children based on priority values.
 * Higher priority children are tried first. Priorities can be dynamic.
 *
 * @example
 * ```typescript
 * const priorityBehavior = new BTPrioritySelector('PriorityBehavior');
 * priorityBehavior.addChildWithPriority(fleeAction, () => health < 20 ? 100 : 0);
 * priorityBehavior.addChildWithPriority(attackAction, () => hasTarget ? 50 : 0);
 * priorityBehavior.addChildWithPriority(patrolAction, () => 10);
 * ```
 */
export class BTPrioritySelector extends BTComposite {
  /** Priority function for each child */
  private priorities: Map<BTNode, (context: BehaviorContext) => number>;

  /** Sorted children by priority (cached) */
  private sortedChildren: BTNode[];

  /** Whether to re-sort on each tick */
  private dynamicPriorities: boolean;

  /**
   * Creates a new priority selector node.
   *
   * @param name - Node name
   * @param dynamicPriorities - Whether to re-evaluate priorities each tick
   */
  constructor(name: string = 'PrioritySelector', dynamicPriorities: boolean = true) {
    super(name, []);
    this.priorities = new Map();
    this.sortedChildren = [];
    this.dynamicPriorities = dynamicPriorities;
  }

  /**
   * Adds a child with a priority function.
   *
   * @param child - Child node
   * @param priority - Priority value or function
   * @returns This selector for chaining
   */
  addChildWithPriority(child: BTNode, priority: number | ((context: BehaviorContext) => number)): this {
    this.children.push(child);
    const priorityFn = typeof priority === 'number' ? () => priority : priority;
    this.priorities.set(child, priorityFn);
    return this;
  }

  /**
   * Sorts children by priority.
   * @private
   */
  private sortChildren(context: BehaviorContext): void {
    this.sortedChildren = [...this.children].sort((a, b) => {
      const priorityA = this.priorities.get(a)?.(context) ?? 0;
      const priorityB = this.priorities.get(b)?.(context) ?? 0;
      return priorityB - priorityA; // Descending order
    });
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.currentIndex = 0;
      this.sortChildren(context);
      this.isRunning = true;
      if (this.onEnter) {
        this.onEnter(context);
      }
    } else if (this.dynamicPriorities) {
      // Re-sort on each tick for dynamic priorities
      this.sortChildren(context);
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    while (this.currentIndex < this.sortedChildren.length) {
      const child = this.sortedChildren[this.currentIndex]!;
      const status = child.tick(context);

      if (status === NodeStatus.SUCCESS) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }

      if (status === NodeStatus.RUNNING) {
        this.status = NodeStatus.RUNNING;
        return NodeStatus.RUNNING;
      }

      // Child failed, try next
      this.currentIndex++;
    }

    // All children failed
    this.status = NodeStatus.FAILURE;
    this.isRunning = false;
    if (this.onExit) {
      this.onExit(context);
    }
    return NodeStatus.FAILURE;
  }

  override clone(): BTNode {
    const cloned = super.clone() as BTPrioritySelector;
    (cloned as { priorities: Map<BTNode, (context: BehaviorContext) => number> }).priorities = new Map(
      this.priorities
    );
    return cloned;
  }
}
