/**
 * @fileoverview Goal-Oriented Action Planning with A* search.
 * Implements GOAP planning algorithm for AI decision making.
 * @module ai/planning/GOAPPlanner
 */

import { WorldState } from './WorldState';
import { GOAPAction, ActionResult } from './GOAPAction';
import { Logger } from '../../core/Logger';

/**
 * Plan node for A* search.
 */
interface PlanNode {
  /** Current state */
  state: WorldState;
  /** Action that led to this node */
  action: GOAPAction | null;
  /** Parent node */
  parent: PlanNode | null;
  /** Cost from start (g) */
  g: number;
  /** Heuristic cost to goal (h) */
  h: number;
  /** Total cost (f = g + h) */
  f: number;
}

/**
 * Planning result.
 */
export interface Plan {
  /** Planned actions */
  actions: GOAPAction[];
  /** Total plan cost */
  cost: number;
  /** Goal that was planned for */
  goal: WorldState;
  /** Whether plan is valid */
  valid: boolean;
}

/**
 * GOAP planner configuration.
 */
export interface GOAPPlannerConfig {
  /** Maximum planning iterations */
  maxIterations: number;
  /** Maximum plan length */
  maxPlanLength: number;
  /** Heuristic weight (higher = more greedy) */
  heuristicWeight: number;
  /** Enable debug logging */
  debugLogging: boolean;
}

/**
 * Default GOAP planner configuration.
 */
export const DefaultGOAPPlannerConfig: GOAPPlannerConfig = {
  maxIterations: 1000,
  maxPlanLength: 10,
  heuristicWeight: 1.0,
  debugLogging: false,
};

/**
 * Planning statistics.
 */
export interface PlanningStats {
  /** Nodes explored */
  nodesExplored: number;
  /** Planning time in milliseconds */
  planningTimeMs: number;
  /** Plan length */
  planLength: number;
  /** Plan cost */
  planCost: number;
  /** Whether planning succeeded */
  success: boolean;
}

/**
 * Goal-Oriented Action Planner.
 * Plans sequences of actions to achieve goals using A* search.
 *
 * @example
 * ```typescript
 * const planner = new GOAPPlanner();
 *
 * // Define actions
 * const pickupWeapon = GOAPAction.create(
 *   'PickupWeapon',
 *   5.0,
 *   { nearWeapon: true, hasWeapon: false },
 *   { hasWeapon: true }
 * );
 *
 * const attackEnemy = GOAPAction.create(
 *   'AttackEnemy',
 *   10.0,
 *   { hasWeapon: true, enemyAlive: true },
 *   { enemyAlive: false }
 * );
 *
 * const actions = [pickupWeapon, attackEnemy];
 *
 * // Current state
 * const currentState = WorldState.fromObject({
 *   nearWeapon: true,
 *   hasWeapon: false,
 *   enemyAlive: true
 * });
 *
 * // Goal state
 * const goal = WorldState.fromObject({
 *   enemyAlive: false
 * });
 *
 * // Plan
 * const plan = planner.plan(currentState, goal, actions);
 *
 * if (plan.valid) {
 *   console.log('Plan found:');
 *   plan.actions.forEach(a => console.log('-', a.name));
 * }
 * ```
 */
export class GOAPPlanner {
  /** Planner configuration */
  private config: GOAPPlannerConfig;

  /** Logger instance */
  private logger: Logger;

  /** Last planning statistics */
  private lastStats: PlanningStats | null;

  /**
   * Creates a new GOAP planner.
   *
   * @param config - Planner configuration
   */
  constructor(config: GOAPPlannerConfig = DefaultGOAPPlannerConfig) {
    this.config = { ...config };
    this.logger = new Logger('GOAPPlanner');
    this.lastStats = null;
  }

  /**
   * Plans a sequence of actions to achieve a goal.
   *
   * @param currentState - Current world state
   * @param goal - Goal state to achieve
   * @param availableActions - Available actions
   * @param context - Execution context for action checks
   * @returns The plan
   *
   * @example
   * ```typescript
   * const plan = planner.plan(
   *   currentState,
   *   goalState,
   *   allActions,
   *   agentContext
   * );
   *
   * if (plan.valid) {
   *   executePlan(plan);
   * } else {
   *   console.log('No valid plan found');
   * }
   * ```
   */
  plan(
    currentState: WorldState,
    goal: WorldState,
    availableActions: GOAPAction[],
    context?: any
  ): Plan {
    const startTime = performance.now();

    if (this.config.debugLogging) {
      this.logger.debug('Planning started');
      this.logger.debug('Current:', currentState.toString());
      this.logger.debug('Goal:', goal.toString());
    }

    // Check if goal is already satisfied
    if (currentState.satisfies(goal)) {
      const emptyPlan: Plan = {
        actions: [],
        cost: 0,
        goal,
        valid: true,
      };

      this.lastStats = {
        nodesExplored: 0,
        planningTimeMs: performance.now() - startTime,
        planLength: 0,
        planCost: 0,
        success: true,
      };

      return emptyPlan;
    }

    // Filter enabled actions
    const actions = availableActions.filter(a => a.enabled);

    // A* search
    const result = this.aStar(currentState, goal, actions, context);

    const planningTime = performance.now() - startTime;

    this.lastStats = {
      nodesExplored: result.nodesExplored,
      planningTimeMs: planningTime,
      planLength: result.plan.actions.length,
      planCost: result.plan.cost,
      success: result.plan.valid,
    };

    if (this.config.debugLogging) {
      if (result.plan.valid) {
        this.logger.debug(`Plan found in ${planningTime.toFixed(2)}ms:`);
        result.plan.actions.forEach((a, i) => {
          this.logger.debug(`  ${i + 1}. ${a.name} (cost: ${a.cost})`);
        });
        this.logger.debug(`Total cost: ${result.plan.cost}`);
      } else {
        this.logger.debug(`No plan found (${planningTime.toFixed(2)}ms)`);
      }
    }

    return result.plan;
  }

  /**
   * A* search algorithm for planning.
   * @private
   */
  private aStar(
    start: WorldState,
    goal: WorldState,
    actions: GOAPAction[],
    context: any
  ): { plan: Plan; nodesExplored: number } {
    const openSet: PlanNode[] = [];
    const closedSet = new Set<string>();

    // Create start node
    const startNode: PlanNode = {
      state: start,
      action: null,
      parent: null,
      g: 0,
      h: this.heuristic(start, goal),
      f: 0,
    };
    startNode.f = startNode.g + startNode.h * this.config.heuristicWeight;

    openSet.push(startNode);

    let nodesExplored = 0;
    let iterations = 0;

    while (openSet.length > 0 && iterations < this.config.maxIterations) {
      iterations++;

      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      // Check if goal reached
      if (current.state.satisfies(goal)) {
        const plan = this.reconstructPlan(current);
        return { plan, nodesExplored };
      }

      // Add to closed set
      const currentHash = current.state.hash();
      closedSet.add(currentHash);
      nodesExplored++;

      // Check plan length limit
      const depth = this.getDepth(current);
      if (depth >= this.config.maxPlanLength) {
        continue;
      }

      // Expand neighbors
      for (const action of actions) {
        // Check preconditions
        if (!action.checkPreconditions(current.state, context)) {
          continue;
        }

        // Apply action effects
        const newState = action.applyEffects(current.state);
        const newStateHash = newState.hash();

        // Skip if already explored
        if (closedSet.has(newStateHash)) {
          continue;
        }

        // Calculate costs
        const actionCost = action.calculateCost(current.state, context);
        const g = current.g + actionCost;
        const h = this.heuristic(newState, goal);
        const f = g + h * this.config.heuristicWeight;

        // Check if node is already in open set
        const existingIndex = openSet.findIndex(
          n => n.state.hash() === newStateHash
        );

        if (existingIndex !== -1) {
          // Update if better path found
          const existing = openSet[existingIndex]!;
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
            existing.action = action;
          }
        } else {
          // Add new node
          const newNode: PlanNode = {
            state: newState,
            action,
            parent: current,
            g,
            h,
            f,
          };
          openSet.push(newNode);
        }
      }
    }

    // No plan found
    const failedPlan: Plan = {
      actions: [],
      cost: 0,
      goal,
      valid: false,
    };

    return { plan: failedPlan, nodesExplored };
  }

  /**
   * Heuristic function for A* search.
   * Estimates cost to reach goal from state.
   * @private
   */
  private heuristic(state: WorldState, goal: WorldState): number {
    // Simple heuristic: number of unsatisfied goal conditions
    return state.distance(goal);
  }

  /**
   * Reconstructs plan from goal node.
   * @private
   */
  private reconstructPlan(node: PlanNode): Plan {
    const actions: GOAPAction[] = [];
    let totalCost = 0;
    let current: PlanNode | null = node;

    while (current && current.action) {
      actions.unshift(current.action);
      totalCost += current.action.cost;
      current = current.parent;
    }

    return {
      actions,
      cost: totalCost,
      goal: node.state,
      valid: true,
    };
  }

  /**
   * Gets depth of a node in the search tree.
   * @private
   */
  private getDepth(node: PlanNode): number {
    let depth = 0;
    let current: PlanNode | null = node;

    while (current && current.parent) {
      depth++;
      current = current.parent;
    }

    return depth;
  }

  /**
   * Checks if a plan is still valid.
   *
   * @param plan - Plan to check
   * @param currentState - Current world state
   * @param context - Execution context
   * @returns True if plan is valid
   */
  isPlanValid(plan: Plan, currentState: WorldState, context?: any): boolean {
    if (!plan.valid || plan.actions.length === 0) {
      return false;
    }

    let state = currentState.clone();

    for (const action of plan.actions) {
      // Check if action is enabled
      if (!action.enabled) {
        return false;
      }

      // Check preconditions
      if (!action.checkPreconditions(state, context)) {
        return false;
      }

      // Apply effects
      state = action.applyEffects(state);
    }

    // Check if final state satisfies goal
    return state.satisfies(plan.goal);
  }

  /**
   * Gets the last planning statistics.
   *
   * @returns Last planning stats or null
   */
  getLastStats(): PlanningStats | null {
    return this.lastStats;
  }

  /**
   * Gets planner configuration.
   *
   * @returns Current configuration
   */
  getConfig(): Readonly<GOAPPlannerConfig> {
    return this.config;
  }

  /**
   * Updates planner configuration.
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<GOAPPlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
