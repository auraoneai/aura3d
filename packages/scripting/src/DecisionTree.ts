export type DecisionTreeNodeType = "decision" | "action";

export interface DecisionTreeContext {
  readonly values?: Record<string, number | boolean | string | undefined>;
}

export interface DecisionTreeStats {
  readonly totalNodes: number;
  readonly decisionNodes: number;
  readonly actionNodes: number;
  readonly maxDepth: number;
  readonly averageActionDepth: number;
}

export interface DecisionTreeDecision {
  readonly action: string;
  readonly path: readonly string[];
  readonly executed: boolean;
}

export type DecisionCondition = (context: DecisionTreeContext) => boolean;
export type DecisionAction = (context: DecisionTreeContext) => void;

export interface DecisionTreeNode {
  readonly type: DecisionTreeNodeType;
  readonly name: string;
  condition?: DecisionCondition;
  action?: DecisionAction;
  trueBranch?: DecisionTreeNode;
  falseBranch?: DecisionTreeNode;
  parent?: DecisionTreeNode;
}

export class DecisionTree {
  private root: DecisionTreeNode | undefined;

  createDecision(name: string, condition: DecisionCondition): DecisionTreeNode {
    assertName(name);
    return { type: "decision", name, condition };
  }

  createAction(name: string, action: DecisionAction = () => undefined): DecisionTreeNode {
    assertName(name);
    return { type: "action", name, action };
  }

  setBranches(node: DecisionTreeNode, trueBranch: DecisionTreeNode, falseBranch: DecisionTreeNode): void {
    if (node.type !== "decision") throw new Error(`Cannot set branches on action node: ${node.name}`);
    node.trueBranch = trueBranch;
    node.falseBranch = falseBranch;
    trueBranch.parent = node;
    falseBranch.parent = node;
  }

  setRoot(node: DecisionTreeNode): void {
    this.root = node;
  }

  getRoot(): DecisionTreeNode | undefined {
    return this.root;
  }

  decide(context: DecisionTreeContext, maxDepth = 32): DecisionTreeDecision {
    const action = this.traverse(context, maxDepth);
    if (!action?.action) return { action: "none", path: this.getTraversalPath(context, maxDepth), executed: false };
    action.action(context);
    return { action: action.name, path: this.getTraversalPath(context, maxDepth), executed: true };
  }

  traverse(context: DecisionTreeContext, maxDepth = 32): DecisionTreeNode | undefined {
    if (!this.root || maxDepth < 1) return undefined;
    let current: DecisionTreeNode | undefined = this.root;
    let depth = 0;
    while (current && depth < maxDepth) {
      depth += 1;
      if (current.type === "action") return current;
      if (!current.condition) return undefined;
      current = current.condition(context) ? current.trueBranch : current.falseBranch;
    }
    return undefined;
  }

  getTraversalPath(context: DecisionTreeContext, maxDepth = 32): readonly string[] {
    if (!this.root || maxDepth < 1) return [];
    const path: string[] = [];
    let current: DecisionTreeNode | undefined = this.root;
    let depth = 0;
    while (current && depth < maxDepth) {
      depth += 1;
      path.push(current.name);
      if (current.type === "action") break;
      if (!current.condition) break;
      current = current.condition(context) ? current.trueBranch : current.falseBranch;
    }
    return path;
  }

  validate(): boolean {
    return this.root ? validateNode(this.root) : false;
  }

  getStats(): DecisionTreeStats {
    if (!this.root) return { totalNodes: 0, decisionNodes: 0, actionNodes: 0, maxDepth: 0, averageActionDepth: 0 };
    const stats = { totalNodes: 0, decisionNodes: 0, actionNodes: 0, actionDepths: [] as number[] };
    collectStats(this.root, 0, stats);
    const maxDepth = stats.actionDepths.length > 0 ? Math.max(...stats.actionDepths) : 0;
    const averageActionDepth = stats.actionDepths.length > 0
      ? stats.actionDepths.reduce((sum, depth) => sum + depth, 0) / stats.actionDepths.length
      : 0;
    return {
      totalNodes: stats.totalNodes,
      decisionNodes: stats.decisionNodes,
      actionNodes: stats.actionNodes,
      maxDepth,
      averageActionDepth: Number(averageActionDepth.toFixed(3))
    };
  }

  clone(): DecisionTree {
    const tree = new DecisionTree();
    if (this.root) tree.setRoot(cloneNode(this.root));
    return tree;
  }
}

function validateNode(node: DecisionTreeNode): boolean {
  if (node.type === "action") return typeof node.action === "function";
  return typeof node.condition === "function" && Boolean(node.trueBranch) && Boolean(node.falseBranch) && validateNode(node.trueBranch!) && validateNode(node.falseBranch!);
}

function collectStats(
  node: DecisionTreeNode,
  depth: number,
  stats: { totalNodes: number; decisionNodes: number; actionNodes: number; actionDepths: number[] }
): void {
  stats.totalNodes += 1;
  if (node.type === "action") {
    stats.actionNodes += 1;
    stats.actionDepths.push(depth);
    return;
  }
  stats.decisionNodes += 1;
  if (node.trueBranch) collectStats(node.trueBranch, depth + 1, stats);
  if (node.falseBranch) collectStats(node.falseBranch, depth + 1, stats);
}

function cloneNode(node: DecisionTreeNode): DecisionTreeNode {
  const cloned: DecisionTreeNode = { type: node.type, name: node.name, condition: node.condition, action: node.action };
  if (node.trueBranch) {
    cloned.trueBranch = cloneNode(node.trueBranch);
    cloned.trueBranch.parent = cloned;
  }
  if (node.falseBranch) {
    cloned.falseBranch = cloneNode(node.falseBranch);
    cloned.falseBranch.parent = cloned;
  }
  return cloned;
}

function assertName(name: string): void {
  if (name.trim().length === 0) throw new Error("Decision tree node name cannot be empty.");
}
