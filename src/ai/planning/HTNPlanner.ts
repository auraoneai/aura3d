/**
 * @fileoverview Hierarchical Task Network planner.
 * Implements HTN planning with task decomposition and method selection.
 * @module ai/planning/HTNPlanner
 */

import { WorldState } from './WorldState';
import { HTNTask, TaskType, TaskResult } from './HTNTask';
import { Logger } from '../../core/Logger';

/**
 * HTN plan.
 */
export interface HTNPlan {
  /** Planned primitive tasks */
  tasks: HTNTask[];
  /** Whether plan is valid */
  valid: boolean;
  /** Root task that was decomposed */
  rootTask: HTNTask;
}

/**
 * HTN planner configuration.
 */
export interface HTNPlannerConfig {
  /** Maximum decomposition depth */
  maxDepth: number;
  /** Maximum iterations */
  maxIterations: number;
  /** Enable debug logging */
  debugLogging: boolean;
}

/**
 * Default HTN planner configuration.
 */
export const DefaultHTNPlannerConfig: HTNPlannerConfig = {
  maxDepth: 20,
  maxIterations: 1000,
  debugLogging: false,
};

/**
 * HTN planning statistics.
 */
export interface HTNPlanningStats {
  /** Decompositions performed */
  decompositions: number;
  /** Planning time in milliseconds */
  planningTimeMs: number;
  /** Plan length (primitive tasks) */
  planLength: number;
  /** Maximum depth reached */
  maxDepthReached: number;
  /** Whether planning succeeded */
  success: boolean;
}

/**
 * Hierarchical Task Network Planner.
 * Plans by recursively decomposing compound tasks into primitive tasks.
 *
 * @example
 * ```typescript
 * const planner = new HTNPlanner();
 *
 * // Define primitive tasks
 * const moveTo = HTNTask.primitive('MoveTo',
 *   { atDestination: false },
 *   { atDestination: true }
 * );
 * moveTo.onExecute = (state, ctx) => {
 *   return agent.moveTo(ctx.destination) ? TaskResult.SUCCESS : TaskResult.RUNNING;
 * };
 *
 * const pickupWeapon = HTNTask.primitive('PickupWeapon',
 *   { nearWeapon: true, hasWeapon: false },
 *   { hasWeapon: true }
 * );
 *
 * const attack = HTNTask.primitive('Attack',
 *   { hasWeapon: true, enemyAlive: true },
 *   { enemyAlive: false }
 * );
 *
 * // Define compound task
 * const killEnemy = HTNTask.compound('KillEnemy', [
 *   {
 *     name: 'WithWeapon',
 *     preconditions: WorldState.fromObject({ hasWeapon: true }),
 *     subtasks: [attack],
 *     priority: 10
 *   },
 *   {
 *     name: 'GetWeaponFirst',
 *     preconditions: WorldState.fromObject({ hasWeapon: false, nearWeapon: true }),
 *     subtasks: [pickupWeapon, attack],
 *     priority: 5
 *   }
 * ]);
 *
 * // Plan
 * const state = WorldState.fromObject({
 *   hasWeapon: false,
 *   nearWeapon: true,
 *   enemyAlive: true
 * });
 *
 * const plan = planner.plan(killEnemy, state, context);
 *
 * if (plan.valid) {
 *   console.log('Plan:');
 *   plan.tasks.forEach(t => console.log('-', t.name));
 * }
 * ```
 */
export class HTNPlanner {
  /** Planner configuration */
  private config: HTNPlannerConfig;

  /** Logger instance */
  private logger: Logger;

  /** Last planning statistics */
  private lastStats: HTNPlanningStats | null;

  /**
   * Creates a new HTN planner.
   *
   * @param config - Planner configuration
   */
  constructor(config: HTNPlannerConfig = DefaultHTNPlannerConfig) {
    this.config = { ...config };
    this.logger = new Logger('HTNPlanner');
    this.lastStats = null;
  }

  /**
   * Plans by decomposing a root task.
   *
   * @param rootTask - Root task to decompose
   * @param initialState - Initial world state
   * @param context - Execution context
   * @returns The plan
   *
   * @example
   * ```typescript
   * const plan = planner.plan(
   *   rootTask,
   *   currentState,
   *   agentContext
   * );
   *
   * if (plan.valid) {
   *   for (const task of plan.tasks) {
   *     const result = task.execute(currentState, context);
   *     if (result === TaskResult.SUCCESS) {
   *       currentState = task.applyEffects(currentState);
   *     }
   *   }
   * }
   * ```
   */
  plan(rootTask: HTNTask, initialState: WorldState, context: any): HTNPlan {
    const startTime = performance.now();

    if (this.config.debugLogging) {
      this.logger.debug('Planning started');
      this.logger.debug('Root task:', rootTask.name);
      this.logger.debug('Initial state:', initialState.toString());
    }

    const result = this.decompose(
      [rootTask],
      initialState,
      context,
      0,
      { decompositions: 0, maxDepth: 0 }
    );

    const planningTime = performance.now() - startTime;

    this.lastStats = {
      decompositions: result.stats.decompositions,
      planningTimeMs: planningTime,
      planLength: result.plan.length,
      maxDepthReached: result.stats.maxDepth,
      success: result.success,
    };

    if (this.config.debugLogging) {
      if (result.success) {
        this.logger.debug(`Plan found in ${planningTime.toFixed(2)}ms:`);
        result.plan.forEach((t, i) => {
          this.logger.debug(`  ${i + 1}. ${t.name}`);
        });
      } else {
        this.logger.debug(`Planning failed (${planningTime.toFixed(2)}ms)`);
      }
    }

    return {
      tasks: result.plan,
      valid: result.success,
      rootTask,
    };
  }

  /**
   * Recursively decomposes tasks.
   * @private
   */
  private decompose(
    tasks: HTNTask[],
    state: WorldState,
    context: any,
    depth: number,
    stats: { decompositions: number; maxDepth: number }
  ): { plan: HTNTask[]; success: boolean; stats: typeof stats } {
    // Update max depth
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    // Check depth limit
    if (depth >= this.config.maxDepth) {
      return { plan: [], success: false, stats };
    }

    // Check iteration limit
    if (stats.decompositions >= this.config.maxIterations) {
      return { plan: [], success: false, stats };
    }

    // Base case: no tasks left
    if (tasks.length === 0) {
      return { plan: [], success: true, stats };
    }

    const [currentTask, ...remainingTasks] = tasks;

    // Handle primitive task
    if (currentTask!.isPrimitive()) {
      // Check preconditions
      if (!currentTask!.checkPreconditions(state, context)) {
        return { plan: [], success: false, stats };
      }

      // Apply effects to state for next tasks
      const newState = currentTask!.applyEffects(state);

      // Recursively decompose remaining tasks
      const result = this.decompose(
        remainingTasks,
        newState,
        context,
        depth,
        stats
      );

      if (result.success) {
        return {
          plan: [currentTask!, ...result.plan],
          success: true,
          stats,
        };
      }

      return { plan: [], success: false, stats };
    }

    // Handle compound task
    stats.decompositions++;

    // Find a satisfiable method
    const method = currentTask!.findSatisfiableMethod(state, context);

    if (!method) {
      // No satisfiable method found
      return { plan: [], success: false, stats };
    }

    // Decompose with selected method's subtasks
    const newTasks = [...method.subtasks, ...remainingTasks];

    return this.decompose(
      newTasks,
      state,
      context,
      depth + 1,
      stats
    );
  }

  /**
   * Checks if a plan is still valid.
   *
   * @param plan - Plan to check
   * @param currentState - Current world state
   * @param context - Execution context
   * @returns True if plan is valid
   */
  isPlanValid(plan: HTNPlan, currentState: WorldState, context: any): boolean {
    if (!plan.valid || plan.tasks.length === 0) {
      return false;
    }

    let state = currentState.clone();

    for (const task of plan.tasks) {
      // Check preconditions
      if (!task.checkPreconditions(state, context)) {
        return false;
      }

      // Apply effects
      state = task.applyEffects(state);
    }

    return true;
  }

  /**
   * Replans from current state by decomposing remaining tasks.
   *
   * @param remainingTasks - Tasks that haven't been executed yet
   * @param currentState - Current world state
   * @param context - Execution context
   * @returns New plan
   */
  replan(
    remainingTasks: HTNTask[],
    currentState: WorldState,
    context: any
  ): HTNPlan {
    if (remainingTasks.length === 0) {
      return {
        tasks: [],
        valid: true,
        rootTask: new HTNTask('Empty', TaskType.PRIMITIVE),
      };
    }

    const startTime = performance.now();
    const rootTask = remainingTasks[0];

    const result = this.decompose(
      remainingTasks,
      currentState,
      context,
      0,
      { decompositions: 0, maxDepth: 0 }
    );

    const planningTime = performance.now() - startTime;

    this.lastStats = {
      decompositions: result.stats.decompositions,
      planningTimeMs: planningTime,
      planLength: result.plan.length,
      maxDepthReached: result.stats.maxDepth,
      success: result.success,
    };

    return {
      tasks: result.plan,
      valid: result.success,
      rootTask,
    };
  }

  /**
   * Gets the last planning statistics.
   *
   * @returns Last planning stats or null
   */
  getLastStats(): HTNPlanningStats | null {
    return this.lastStats;
  }

  /**
   * Gets planner configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<HTNPlannerConfig> {
    return this.config;
  }

  /**
   * Updates planner configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<HTNPlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
