/**
 * @fileoverview HTN task definitions for hierarchical planning.
 * Implements compound and primitive tasks for HTN planner.
 * @module ai/planning/HTNTask
 */

import { WorldState } from './WorldState';
import { Logger } from '../../core/Logger';

/**
 * Task types.
 */
export enum TaskType {
  /** Primitive task (executable action) */
  PRIMITIVE = 'primitive',
  /** Compound task (decomposable into subtasks) */
  COMPOUND = 'compound',
}

/**
 * Task execution result.
 */
export enum TaskResult {
  /** Task completed successfully */
  SUCCESS = 'success',
  /** Task is still running */
  RUNNING = 'running',
  /** Task failed */
  FAILURE = 'failure',
}

/**
 * Task method (decomposition rule for compound tasks).
 */
export interface TaskMethod {
  /** Method name */
  name: string;
  /** Preconditions for this method */
  preconditions: WorldState;
  /** Subtasks to execute */
  subtasks: HTNTask[];
  /** Priority (higher = preferred) */
  priority: number;
  /** Custom precondition check */
  checkPreconditions?: (state: WorldState, context: any) => boolean;
}

/**
 * HTN Task base interface.
 * Represents a task in the Hierarchical Task Network.
 *
 * @example
 * ```typescript
 * // Primitive task
 * const moveTask = new HTNTask('MoveTo', TaskType.PRIMITIVE);
 * moveTask.onExecute = (state, context) => {
 *   return agent.moveTo(target) ? TaskResult.SUCCESS : TaskResult.RUNNING;
 * };
 *
 * // Compound task
 * const attackTask = new HTNTask('AttackEnemy', TaskType.COMPOUND);
 * attackTask.addMethod({
 *   name: 'RangedAttack',
 *   preconditions: WorldState.fromObject({ hasRangedWeapon: true }),
 *   subtasks: [aimTask, shootTask],
 *   priority: 10
 * });
 * attackTask.addMethod({
 *   name: 'MeleeAttack',
 *   preconditions: WorldState.fromObject({ hasMeleeWeapon: true }),
 *   subtasks: [moveCloseTask, swingTask],
 *   priority: 5
 * });
 * ```
 */
export class HTNTask {
  /** Task name */
  readonly name: string;

  /** Task type */
  readonly type: TaskType;

  /** Task methods (for compound tasks) */
  private methods: TaskMethod[];

  /** Execution callback (for primitive tasks) */
  onExecute?: (state: WorldState, context: any) => TaskResult;

  /** Effects applied on success (for primitive tasks) */
  effects: WorldState;

  /** Preconditions for primitive tasks */
  preconditions: WorldState;

  /** Task start callback */
  onStart?: (state: WorldState, context: any) => void;

  /** Task complete callback */
  onComplete?: (state: WorldState, context: any, result: TaskResult) => void;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new HTN task.
   *
   * @param name - Task name
   * @param type - Task type
   */
  constructor(name: string, type: TaskType) {
    this.name = name;
    this.type = type;
    this.methods = [];
    this.effects = new WorldState();
    this.preconditions = new WorldState();
    this.logger = new Logger(`HTNTask:${name}`);
  }

  /**
   * Adds a method to a compound task.
   *
   * @param method - Task method
   *
   * @example
   * ```typescript
   * compoundTask.addMethod({
   *   name: 'MethodA',
   *   preconditions: WorldState.fromObject({ conditionA: true }),
   *   subtasks: [task1, task2],
   *   priority: 10
   * });
   * ```
   */
  addMethod(method: TaskMethod): void {
    if (this.type !== TaskType.COMPOUND) {
      this.logger.warn('Cannot add method to primitive task');
      return;
    }

    this.methods.push(method);
    // Sort by priority (highest first)
    this.methods.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Gets all methods for this task.
   *
   * @returns Array of methods
   */
  getMethods(): TaskMethod[] {
    return this.methods;
  }

  /**
   * Finds a satisfiable method for the given state.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns First satisfiable method or null
   */
  findSatisfiableMethod(state: WorldState, context: any): TaskMethod | null {
    if (this.type !== TaskType.COMPOUND) {
      return null;
    }

    for (const method of this.methods) {
      // Check custom preconditions if provided
      if (method.checkPreconditions) {
        if (method.checkPreconditions(state, context)) {
          return method;
        }
      } else {
        // Check state preconditions
        if (state.satisfies(method.preconditions)) {
          return method;
        }
      }
    }

    return null;
  }

  /**
   * Checks if task preconditions are met (for primitive tasks).
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns True if preconditions satisfied
   */
  checkPreconditions(state: WorldState, context?: any): boolean {
    if (this.type !== TaskType.PRIMITIVE) {
      return true;
    }

    return state.satisfies(this.preconditions);
  }

  /**
   * Executes a primitive task.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @returns Task result
   */
  execute(state: WorldState, context?: any): TaskResult {
    if (this.type !== TaskType.PRIMITIVE) {
      this.logger.warn('Cannot execute compound task directly');
      return TaskResult.FAILURE;
    }

    if (!this.onExecute) {
      this.logger.warn(`Task ${this.name} has no execution callback`);
      return TaskResult.FAILURE;
    }

    try {
      return this.onExecute(state, context);
    } catch (error) {
      this.logger.error(`Error executing task ${this.name}:`, error);
      return TaskResult.FAILURE;
    }
  }

  /**
   * Applies task effects to state (for primitive tasks).
   *
   * @param state - State to modify
   * @returns Modified state
   */
  applyEffects(state: WorldState): WorldState {
    const newState = state.clone();
    newState.apply(this.effects);
    return newState;
  }

  /**
   * Starts the task.
   *
   * @param state - Current world state
   * @param context - Execution context
   */
  start(state: WorldState, context?: any): void {
    if (this.onStart) {
      this.onStart(state, context);
    }
  }

  /**
   * Completes the task.
   *
   * @param state - Current world state
   * @param context - Execution context
   * @param result - Task result
   */
  complete(state: WorldState, context: any, result: TaskResult): void {
    if (this.onComplete) {
      this.onComplete(state, context, result);
    }
  }

  /**
   * Checks if this is a primitive task.
   *
   * @returns True if primitive
   */
  isPrimitive(): boolean {
    return this.type === TaskType.PRIMITIVE;
  }

  /**
   * Checks if this is a compound task.
   *
   * @returns True if compound
   */
  isCompound(): boolean {
    return this.type === TaskType.COMPOUND;
  }

  /**
   * Clones the task.
   *
   * @returns New task with copied data
   */
  clone(): HTNTask {
    const task = new HTNTask(this.name, this.type);

    if (this.type === TaskType.COMPOUND) {
      task.methods = this.methods.map(m => ({ ...m }));
    } else {
      task.preconditions = this.preconditions.clone();
      task.effects = this.effects.clone();
      task.onExecute = this.onExecute;
    }

    task.onStart = this.onStart;
    task.onComplete = this.onComplete;

    return task;
  }

  /**
   * Gets a string representation of the task.
   *
   * @returns String representation
   */
  toString(): string {
    if (this.type === TaskType.PRIMITIVE) {
      return `[P] ${this.name}`;
    } else {
      return `[C] ${this.name} (${this.methods.length} methods)`;
    }
  }

  /**
   * Creates a primitive task.
   *
   * @param name - Task name
   * @param preconditions - Task preconditions
   * @param effects - Task effects
   * @returns New primitive task
   *
   * @example
   * ```typescript
   * const pickupItem = HTNTask.primitive(
   *   'PickupItem',
   *   { nearItem: true, hasItem: false },
   *   { hasItem: true }
   * );
   * ```
   */
  static primitive(
    name: string,
    preconditions: Record<string, any> = {},
    effects: Record<string, any> = {}
  ): HTNTask {
    const task = new HTNTask(name, TaskType.PRIMITIVE);
    task.preconditions = WorldState.fromObject(preconditions);
    task.effects = WorldState.fromObject(effects);
    return task;
  }

  /**
   * Creates a compound task.
   *
   * @param name - Task name
   * @param methods - Task methods
   * @returns New compound task
   *
   * @example
   * ```typescript
   * const attack = HTNTask.compound('Attack', [
   *   {
   *     name: 'Ranged',
   *     preconditions: WorldState.fromObject({ hasGun: true }),
   *     subtasks: [aim, shoot],
   *     priority: 10
   *   },
   *   {
   *     name: 'Melee',
   *     preconditions: WorldState.fromObject({ hasSword: true }),
   *     subtasks: [approach, swing],
   *     priority: 5
   *   }
   * ]);
   * ```
   */
  static compound(name: string, methods: TaskMethod[] = []): HTNTask {
    const task = new HTNTask(name, TaskType.COMPOUND);
    methods.forEach(m => task.addMethod(m));
    return task;
  }
}
