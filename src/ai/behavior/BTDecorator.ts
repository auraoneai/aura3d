/**
 * @fileoverview Decorator behavior tree nodes that modify child behavior.
 * Includes Inverter, Repeater, RepeatUntilFail, Cooldown, TimeLimit, ForceSuccess/Failure.
 * @module ai/behavior/BTDecorator
 */

import { BTNode, NodeStatus } from './BTNode';
import type { BehaviorContext } from './BehaviorTree';

/**
 * Base class for decorator nodes that have a single child.
 * Decorators modify the behavior of their child node.
 *
 * @abstract
 */
export abstract class BTDecorator extends BTNode {
  /** Child node being decorated */
  readonly child: BTNode;

  /**
   * Creates a new decorator node.
   *
   * @param name - Node name
   * @param child - Child node to decorate
   */
  constructor(name: string, child: BTNode) {
    super(name);
    this.child = child;
  }

  override reset(): void {
    super.reset();
    this.child.reset();
  }

  override abort(context: BehaviorContext): void {
    if (this.child.isRunning) {
      this.child.abort(context);
    }
    super.abort(context);
  }

  override getChildren(): BTNode[] {
    return [this.child];
  }

  override clone(): BTNode {
    const cloned = super.clone() as BTDecorator;
    (cloned as { child: BTNode }).child = this.child.clone();
    return cloned;
  }
}

/**
 * Inverter decorator - inverts child status (SUCCESS <-> FAILURE).
 * RUNNING status passes through unchanged.
 *
 * @example
 * ```typescript
 * const notHasTarget = new BTInverter(
 *   'NotHasTarget',
 *   new BTCondition('HasTarget', hasTargetCondition)
 * );
 * ```
 */
export class BTInverter extends BTDecorator {
  /**
   * Creates a new inverter node.
   *
   * @param name - Node name
   * @param child - Child node to invert
   */
  constructor(name: string = 'Inverter', child: BTNode) {
    super(name, child);
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const status = this.child.tick(context);

    if (status === NodeStatus.SUCCESS) {
      this.status = NodeStatus.FAILURE;
      return NodeStatus.FAILURE;
    }

    if (status === NodeStatus.FAILURE) {
      this.status = NodeStatus.SUCCESS;
      return NodeStatus.SUCCESS;
    }

    this.status = NodeStatus.RUNNING;
    return NodeStatus.RUNNING;
  }
}

/**
 * Repeater decorator - repeats child execution N times or infinitely.
 * Returns RUNNING until all repetitions complete, then returns SUCCESS.
 *
 * @example
 * ```typescript
 * // Repeat 5 times
 * const repeat5 = new BTRepeater('Repeat5', child, 5);
 *
 * // Repeat forever
 * const repeatForever = new BTRepeater('RepeatForever', child, -1);
 * ```
 */
export class BTRepeater extends BTDecorator {
  /** Maximum number of repetitions (-1 for infinite) */
  private readonly maxRepeats: number;

  /** Current repetition count */
  private currentRepeat: number;

  /**
   * Creates a new repeater node.
   *
   * @param name - Node name
   * @param child - Child node to repeat
   * @param maxRepeats - Max repetitions (-1 for infinite)
   */
  constructor(name: string = 'Repeater', child: BTNode, maxRepeats: number = -1) {
    super(name, child);
    this.maxRepeats = maxRepeats;
    this.currentRepeat = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.currentRepeat = 0;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    // Check if max repeats reached
    if (this.maxRepeats >= 0 && this.currentRepeat >= this.maxRepeats) {
      this.status = NodeStatus.SUCCESS;
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
      return NodeStatus.SUCCESS;
    }

    const status = this.child.tick(context);

    if (status !== NodeStatus.RUNNING) {
      // Child completed, reset it and increment counter
      this.child.reset();
      this.currentRepeat++;

      // Check if we've completed all repeats
      if (this.maxRepeats >= 0 && this.currentRepeat >= this.maxRepeats) {
        this.status = NodeStatus.SUCCESS;
        this.isRunning = false;
        if (this.onExit) {
          this.onExit(context);
        }
        return NodeStatus.SUCCESS;
      }

      // Continue running
      this.status = NodeStatus.RUNNING;
      return NodeStatus.RUNNING;
    }

    this.status = NodeStatus.RUNNING;
    return NodeStatus.RUNNING;
  }

  override reset(): void {
    super.reset();
    this.currentRepeat = 0;
  }
}

/**
 * RepeatUntilFail decorator - repeats child until it returns FAILURE.
 * Returns SUCCESS when child fails.
 *
 * @example
 * ```typescript
 * const repeatUntilFail = new BTRepeatUntilFail(
 *   'RepeatUntilFail',
 *   new BTAction('TryAction', tryAction)
 * );
 * ```
 */
export class BTRepeatUntilFail extends BTDecorator {
  /**
   * Creates a new repeat-until-fail node.
   *
   * @param name - Node name
   * @param child - Child node to repeat
   */
  constructor(name: string = 'RepeatUntilFail', child: BTNode) {
    super(name, child);
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

    const status = this.child.tick(context);

    if (status === NodeStatus.FAILURE) {
      this.status = NodeStatus.SUCCESS;
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
      return NodeStatus.SUCCESS;
    }

    if (status === NodeStatus.SUCCESS) {
      // Child succeeded, reset and continue
      this.child.reset();
    }

    this.status = NodeStatus.RUNNING;
    return NodeStatus.RUNNING;
  }
}

/**
 * Cooldown decorator - limits child execution rate.
 * Returns FAILURE if cooldown is active, otherwise executes child.
 *
 * @example
 * ```typescript
 * // Only execute every 2 seconds
 * const cooldownAttack = new BTCooldown(
 *   'CooldownAttack',
 *   attackAction,
 *   2.0
 * );
 * ```
 */
export class BTCooldown extends BTDecorator {
  /** Cooldown duration in seconds */
  private readonly cooldownDuration: number;

  /** Timestamp of last execution */
  private lastExecutionTime: number;

  /**
   * Creates a new cooldown node.
   *
   * @param name - Node name
   * @param child - Child node
   * @param cooldownDuration - Cooldown in seconds
   */
  constructor(name: string = 'Cooldown', child: BTNode, cooldownDuration: number) {
    super(name, child);
    this.cooldownDuration = cooldownDuration;
    this.lastExecutionTime = -cooldownDuration;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const now = Date.now() / 1000;
    const elapsed = now - this.lastExecutionTime;

    if (elapsed < this.cooldownDuration) {
      this.status = NodeStatus.FAILURE;
      return NodeStatus.FAILURE;
    }

    const status = this.child.tick(context);

    // Update last execution time when child completes
    if (status !== NodeStatus.RUNNING) {
      this.lastExecutionTime = now;
    }

    this.status = status;
    return status;
  }

  override reset(): void {
    super.reset();
    // Don't reset cooldown timer on reset
  }

  /**
   * Resets the cooldown timer.
   */
  resetCooldown(): void {
    this.lastExecutionTime = -this.cooldownDuration;
  }
}

/**
 * TimeLimit decorator - limits child execution time.
 * Returns FAILURE if child doesn't complete within time limit.
 *
 * @example
 * ```typescript
 * // Must complete within 5 seconds
 * const timedAction = new BTTimeLimit(
 *   'TimedAction',
 *   longRunningAction,
 *   5.0
 * );
 * ```
 */
export class BTTimeLimit extends BTDecorator {
  /** Time limit in seconds */
  private readonly timeLimit: number;

  /** Timestamp when execution started */
  private startTime: number;

  /**
   * Creates a new time limit node.
   *
   * @param name - Node name
   * @param child - Child node
   * @param timeLimit - Time limit in seconds
   */
  constructor(name: string = 'TimeLimit', child: BTNode, timeLimit: number) {
    super(name, child);
    this.timeLimit = timeLimit;
    this.startTime = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.startTime = Date.now() / 1000;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const now = Date.now() / 1000;
    const elapsed = now - this.startTime;

    if (elapsed >= this.timeLimit) {
      // Time limit exceeded
      this.child.abort(context);
      this.status = NodeStatus.FAILURE;
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
      return NodeStatus.FAILURE;
    }

    const status = this.child.tick(context);

    if (status !== NodeStatus.RUNNING) {
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
    }

    this.status = status;
    return status;
  }

  override reset(): void {
    super.reset();
    this.startTime = 0;
  }
}

/**
 * ForceSuccess decorator - always returns SUCCESS.
 * Converts FAILURE to SUCCESS, passes through RUNNING.
 *
 * @example
 * ```typescript
 * const tryAttack = new BTForceSuccess(
 *   'TryAttack',
 *   attackAction
 * );
 * ```
 */
export class BTForceSuccess extends BTDecorator {
  /**
   * Creates a new force-success node.
   *
   * @param name - Node name
   * @param child - Child node
   */
  constructor(name: string = 'ForceSuccess', child: BTNode) {
    super(name, child);
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const status = this.child.tick(context);

    if (status === NodeStatus.RUNNING) {
      this.status = NodeStatus.RUNNING;
      return NodeStatus.RUNNING;
    }

    this.status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }
}

/**
 * ForceFailure decorator - always returns FAILURE.
 * Converts SUCCESS to FAILURE, passes through RUNNING.
 *
 * @example
 * ```typescript
 * const mustFail = new BTForceFailure(
 *   'MustFail',
 *   someAction
 * );
 * ```
 */
export class BTForceFailure extends BTDecorator {
  /**
   * Creates a new force-failure node.
   *
   * @param name - Node name
   * @param child - Child node
   */
  constructor(name: string = 'ForceFailure', child: BTNode) {
    super(name, child);
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    const status = this.child.tick(context);

    if (status === NodeStatus.RUNNING) {
      this.status = NodeStatus.RUNNING;
      return NodeStatus.RUNNING;
    }

    this.status = NodeStatus.FAILURE;
    return NodeStatus.FAILURE;
  }
}

/**
 * Wait decorator - waits for duration before executing child.
 * Returns RUNNING during wait, then executes child.
 *
 * @example
 * ```typescript
 * const waitAndAttack = new BTWait(
 *   'WaitAndAttack',
 *   attackAction,
 *   1.0
 * );
 * ```
 */
export class BTWait extends BTDecorator {
  /** Wait duration in seconds */
  private readonly duration: number;

  /** Elapsed time in seconds */
  private elapsed: number;

  /**
   * Creates a new wait node.
   *
   * @param name - Node name
   * @param child - Child node
   * @param duration - Wait duration in seconds
   */
  constructor(name: string = 'Wait', child: BTNode, duration: number) {
    super(name, child);
    this.duration = duration;
    this.elapsed = 0;
  }

  tick(context: BehaviorContext): NodeStatus {
    if (!this.enabled) {
      return NodeStatus.FAILURE;
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.elapsed = 0;
      if (this.onEnter) {
        this.onEnter(context);
      }
    }

    this.tickCount++;
    this.lastTickTime = Date.now();

    this.elapsed += context.deltaTime;

    if (this.elapsed < this.duration) {
      this.status = NodeStatus.RUNNING;
      return NodeStatus.RUNNING;
    }

    const status = this.child.tick(context);

    if (status !== NodeStatus.RUNNING) {
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
    }

    this.status = status;
    return status;
  }

  override reset(): void {
    super.reset();
    this.elapsed = 0;
  }
}

/**
 * UntilSuccess decorator - repeats child until it returns SUCCESS.
 * Returns SUCCESS when child succeeds, otherwise continues.
 *
 * @example
 * ```typescript
 * const untilSuccess = new BTUntilSuccess(
 *   'UntilSuccess',
 *   new BTAction('TryAction', tryAction)
 * );
 * ```
 */
export class BTUntilSuccess extends BTDecorator {
  /**
   * Creates a new until-success node.
   *
   * @param name - Node name
   * @param child - Child node to repeat
   */
  constructor(name: string = 'UntilSuccess', child: BTNode) {
    super(name, child);
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

    const status = this.child.tick(context);

    if (status === NodeStatus.SUCCESS) {
      this.status = NodeStatus.SUCCESS;
      this.isRunning = false;
      if (this.onExit) {
        this.onExit(context);
      }
      return NodeStatus.SUCCESS;
    }

    if (status === NodeStatus.FAILURE) {
      // Child failed, reset and continue
      this.child.reset();
    }

    this.status = NodeStatus.RUNNING;
    return NodeStatus.RUNNING;
  }
}
