/**
 * @fileoverview Decision tree implementation for AI decision making.
 * Implements decision tree with nodes, branches, and actions.
 * @module ai/planning/DecisionTree
 */

import { Logger } from '../../core/Logger';

/**
 * Decision node types.
 */
export enum NodeType {
  /** Condition/decision node */
  DECISION = 'decision',
  /** Action/leaf node */
  ACTION = 'action',
}

/**
 * Decision tree node.
 */
export interface DecisionNode {
  /** Node type */
  type: NodeType;
  /** Node name/ID */
  name: string;
  /** Condition function (for decision nodes) */
  condition?: (context: any) => boolean;
  /** Action function (for action nodes) */
  action?: (context: any) => void;
  /** True branch (for decision nodes) */
  trueBranch?: DecisionNode;
  /** False branch (for decision nodes) */
  falseBranch?: DecisionNode;
  /** Parent node */
  parent?: DecisionNode;
}

/**
 * Decision tree statistics.
 */
export interface DecisionTreeStats {
  /** Total nodes in tree */
  totalNodes: number;
  /** Decision nodes count */
  decisionNodes: number;
  /** Action nodes count */
  actionNodes: number;
  /** Maximum depth */
  maxDepth: number;
  /** Average depth */
  averageDepth: number;
}

/**
 * Decision tree for AI.
 * Implements hierarchical decision making through a tree of conditions and actions.
 *
 * @example
 * ```typescript
 * const tree = new DecisionTree();
 *
 * // Build tree
 * const root = tree.createDecision(
 *   'IsEnemyVisible',
 *   (ctx) => ctx.canSeeEnemy
 * );
 *
 * const attackDecision = tree.createDecision(
 *   'HasWeapon',
 *   (ctx) => ctx.hasWeapon
 * );
 *
 * const attack = tree.createAction(
 *   'Attack',
 *   (ctx) => ctx.agent.attack(ctx.enemy)
 * );
 *
 * const flee = tree.createAction(
 *   'Flee',
 *   (ctx) => ctx.agent.flee()
 * );
 *
 * const patrol = tree.createAction(
 *   'Patrol',
 *   (ctx) => ctx.agent.patrol()
 * );
 *
 * tree.setBranches(root, attackDecision, patrol);
 * tree.setBranches(attackDecision, attack, flee);
 *
 * tree.setRoot(root);
 *
 * // Traverse tree
 * const context = {
 *   canSeeEnemy: true,
 *   hasWeapon: true,
 *   agent: agent,
 *   enemy: enemy
 * };
 *
 * const action = tree.traverse(context);
 * console.log('Selected action:', action.name);
 * ```
 */
export class DecisionTree {
  /** Root node of the tree */
  private root: DecisionNode | null;

  /** Logger instance */
  private logger: Logger;

  /**
   * Creates a new decision tree.
   */
  constructor() {
    this.root = null;
    this.logger = new Logger('DecisionTree');
  }

  /**
   * Creates a decision node.
   *
   * @param name - Node name
   * @param condition - Condition function
   * @returns New decision node
   *
   * @example
   * ```typescript
   * const healthCheck = tree.createDecision(
   *   'IsHealthLow',
   *   (ctx) => ctx.agent.health < ctx.agent.maxHealth * 0.3
   * );
   * ```
   */
  createDecision(name: string, condition: (context: any) => boolean): DecisionNode {
    return {
      type: NodeType.DECISION,
      name,
      condition,
    };
  }

  /**
   * Creates an action node.
   *
   * @param name - Node name
   * @param action - Action function
   * @returns New action node
   *
   * @example
   * ```typescript
   * const healAction = tree.createAction(
   *   'Heal',
   *   (ctx) => ctx.agent.heal()
   * );
   * ```
   */
  createAction(name: string, action: (context: any) => void): DecisionNode {
    return {
      type: NodeType.ACTION,
      name,
      action,
    };
  }

  /**
   * Sets branches for a decision node.
   *
   * @param node - Decision node
   * @param trueBranch - True branch node
   * @param falseBranch - False branch node
   *
   * @example
   * ```typescript
   * tree.setBranches(decisionNode, trueAction, falseAction);
   * ```
   */
  setBranches(
    node: DecisionNode,
    trueBranch: DecisionNode,
    falseBranch: DecisionNode
  ): void {
    if (node.type !== NodeType.DECISION) {
      this.logger.warn('Cannot set branches on action node');
      return;
    }

    node.trueBranch = trueBranch;
    node.falseBranch = falseBranch;
    trueBranch.parent = node;
    falseBranch.parent = node;
  }

  /**
   * Sets the root node of the tree.
   *
   * @param node - Root node
   */
  setRoot(node: DecisionNode): void {
    this.root = node;
  }

  /**
   * Gets the root node.
   *
   * @returns Root node or null
   */
  getRoot(): DecisionNode | null {
    return this.root;
  }

  /**
   * Traverses the tree and returns the selected action node.
   *
   * @param context - Decision context
   * @param maxDepth - Maximum traversal depth
   * @returns Action node or null
   *
   * @example
   * ```typescript
   * const action = tree.traverse(context);
   * if (action && action.action) {
   *   action.action(context);
   * }
   * ```
   */
  traverse(context: any, maxDepth: number = 100): DecisionNode | null {
    if (!this.root) {
      this.logger.warn('Tree has no root node');
      return null;
    }

    let current = this.root;
    let depth = 0;

    while (current && depth < maxDepth) {
      depth++;

      if (current.type === NodeType.ACTION) {
        return current;
      }

      if (current.type === NodeType.DECISION) {
        if (!current.condition) {
          this.logger.warn(`Decision node ${current.name} has no condition`);
          return null;
        }

        try {
          const result = current.condition(context);

          if (result) {
            if (!current.trueBranch) {
              this.logger.warn(`Decision node ${current.name} has no true branch`);
              return null;
            }
            current = current.trueBranch;
          } else {
            if (!current.falseBranch) {
              this.logger.warn(`Decision node ${current.name} has no false branch`);
              return null;
            }
            current = current.falseBranch;
          }
        } catch (error) {
          this.logger.error(`Error evaluating condition for ${current.name}:`, error);
          return null;
        }
      }
    }

    if (depth >= maxDepth) {
      this.logger.warn('Max traversal depth reached');
    }

    return null;
  }

  /**
   * Traverses the tree and executes the selected action.
   *
   * @param context - Decision context
   * @returns True if action was executed
   *
   * @example
   * ```typescript
   * if (tree.execute(context)) {
   *   console.log('Action executed successfully');
   * }
   * ```
   */
  execute(context: any): boolean {
    const actionNode = this.traverse(context);

    if (!actionNode || !actionNode.action) {
      return false;
    }

    try {
      actionNode.action(context);
      return true;
    } catch (error) {
      this.logger.error(`Error executing action ${actionNode.name}:`, error);
      return false;
    }
  }

  /**
   * Gets the path taken during traversal.
   *
   * @param context - Decision context
   * @returns Array of node names in traversal order
   *
   * @example
   * ```typescript
   * const path = tree.getTraversalPath(context);
   * console.log('Decision path:', path.join(' -> '));
   * ```
   */
  getTraversalPath(context: any, maxDepth: number = 100): string[] {
    if (!this.root) {
      return [];
    }

    const path: string[] = [];
    let current = this.root;
    let depth = 0;

    while (current && depth < maxDepth) {
      depth++;
      path.push(current.name);

      if (current.type === NodeType.ACTION) {
        break;
      }

      if (current.type === NodeType.DECISION && current.condition) {
        try {
          const result = current.condition(context);
          current = result ? current.trueBranch! : current.falseBranch!;
        } catch (error) {
          break;
        }
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * Validates the tree structure.
   *
   * @returns True if tree is valid
   */
  validate(): boolean {
    if (!this.root) {
      this.logger.warn('Tree has no root');
      return false;
    }

    return this.validateNode(this.root);
  }

  /**
   * Validates a node recursively.
   * @private
   */
  private validateNode(node: DecisionNode): boolean {
    if (node.type === NodeType.DECISION) {
      if (!node.condition) {
        this.logger.warn(`Decision node ${node.name} has no condition`);
        return false;
      }

      if (!node.trueBranch || !node.falseBranch) {
        this.logger.warn(`Decision node ${node.name} is missing branches`);
        return false;
      }

      return this.validateNode(node.trueBranch) && this.validateNode(node.falseBranch);
    }

    if (node.type === NodeType.ACTION) {
      if (!node.action) {
        this.logger.warn(`Action node ${node.name} has no action`);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Gets tree statistics.
   *
   * @returns Tree statistics
   */
  getStats(): DecisionTreeStats {
    if (!this.root) {
      return {
        totalNodes: 0,
        decisionNodes: 0,
        actionNodes: 0,
        maxDepth: 0,
        averageDepth: 0,
      };
    }

    const stats = {
      totalNodes: 0,
      decisionNodes: 0,
      actionNodes: 0,
      depths: [] as number[],
    };

    this.collectStats(this.root, 0, stats);

    const maxDepth = stats.depths.length > 0 ? Math.max(...stats.depths) : 0;
    const averageDepth = stats.depths.length > 0
      ? stats.depths.reduce((a, b) => a + b, 0) / stats.depths.length
      : 0;

    return {
      totalNodes: stats.totalNodes,
      decisionNodes: stats.decisionNodes,
      actionNodes: stats.actionNodes,
      maxDepth,
      averageDepth,
    };
  }

  /**
   * Collects statistics recursively.
   * @private
   */
  private collectStats(
    node: DecisionNode,
    depth: number,
    stats: {
      totalNodes: number;
      decisionNodes: number;
      actionNodes: number;
      depths: number[];
    }
  ): void {
    stats.totalNodes++;

    if (node.type === NodeType.DECISION) {
      stats.decisionNodes++;
      if (node.trueBranch) {
        this.collectStats(node.trueBranch, depth + 1, stats);
      }
      if (node.falseBranch) {
        this.collectStats(node.falseBranch, depth + 1, stats);
      }
    } else {
      stats.actionNodes++;
      stats.depths.push(depth);
    }
  }

  /**
   * Clones the tree.
   *
   * @returns New tree with cloned nodes
   */
  clone(): DecisionTree {
    const tree = new DecisionTree();
    if (this.root) {
      tree.root = this.cloneNode(this.root);
    }
    return tree;
  }

  /**
   * Clones a node recursively.
   * @private
   */
  private cloneNode(node: DecisionNode): DecisionNode {
    const cloned: DecisionNode = {
      type: node.type,
      name: node.name,
      condition: node.condition,
      action: node.action,
    };

    if (node.trueBranch) {
      cloned.trueBranch = this.cloneNode(node.trueBranch);
      cloned.trueBranch.parent = cloned;
    }

    if (node.falseBranch) {
      cloned.falseBranch = this.cloneNode(node.falseBranch);
      cloned.falseBranch.parent = cloned;
    }

    return cloned;
  }

  /**
   * Prints the tree structure to console (for debugging).
   *
   * @param maxDepth - Maximum depth to print
   */
  print(maxDepth: number = 10): void {
    if (!this.root) {
      console.log('Empty tree');
      return;
    }

    this.printNode(this.root, 0, maxDepth);
  }

  /**
   * Prints a node recursively.
   * @private
   */
  private printNode(node: DecisionNode, depth: number, maxDepth: number): void {
    if (depth >= maxDepth) {
      return;
    }

    const indent = '  '.repeat(depth);
    const prefix = node.type === NodeType.DECISION ? '[?]' : '[!]';

    console.log(`${indent}${prefix} ${node.name}`);

    if (node.trueBranch) {
      console.log(`${indent}  TRUE:`);
      this.printNode(node.trueBranch, depth + 1, maxDepth);
    }

    if (node.falseBranch) {
      console.log(`${indent}  FALSE:`);
      this.printNode(node.falseBranch, depth + 1, maxDepth);
    }
  }
}
