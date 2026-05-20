import { WorldState, type GOAPStateShape } from "./GOAP";

export type HTNTaskResult = "success" | "running" | "failure";
export type HTNTaskType = "primitive" | "compound";

export interface HTNTaskMethod {
  readonly name: string;
  readonly preconditions?: GOAPStateShape;
  readonly subtasks: readonly HTNTask[];
  readonly priority?: number;
  readonly check?: (state: WorldState, context: unknown) => boolean;
}

export interface HTNPrimitiveTaskOptions {
  readonly name: string;
  readonly preconditions?: GOAPStateShape;
  readonly effects?: GOAPStateShape;
  readonly execute?: (state: WorldState, context: unknown) => HTNTaskResult;
}

export interface HTNCompoundTaskOptions {
  readonly name: string;
  readonly methods?: readonly HTNTaskMethod[];
}

export interface HTNPlannerOptions {
  readonly maxDepth?: number;
  readonly maxIterations?: number;
}

export interface HTNPlan {
  readonly valid: boolean;
  readonly rootTask: string;
  readonly tasks: readonly string[];
  readonly methodTrace: readonly string[];
  readonly decompositions: number;
  readonly maxDepthReached: number;
  readonly iterations: number;
  readonly finalState: GOAPStateShape;
}

type DecomposeStats = {
  decompositions: number;
  iterations: number;
  maxDepthReached: number;
  methodTrace: string[];
};

type DecomposeResult = {
  readonly valid: boolean;
  readonly tasks: readonly HTNTask[];
  readonly state: WorldState;
};

export class HTNTask {
  readonly name: string;
  readonly type: HTNTaskType;
  readonly preconditions: GOAPStateShape;
  readonly effects: GOAPStateShape;
  private readonly methods: HTNTaskMethod[];
  private readonly executeCallback?: (state: WorldState, context: unknown) => HTNTaskResult;

  private constructor(options: {
    readonly name: string;
    readonly type: HTNTaskType;
    readonly preconditions?: GOAPStateShape;
    readonly effects?: GOAPStateShape;
    readonly methods?: readonly HTNTaskMethod[];
    readonly execute?: (state: WorldState, context: unknown) => HTNTaskResult;
  }) {
    if (options.name.trim().length === 0) throw new Error("HTN task name cannot be empty.");
    this.name = options.name;
    this.type = options.type;
    this.preconditions = options.preconditions ?? {};
    this.effects = options.effects ?? {};
    this.methods = [...(options.methods ?? [])].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.name.localeCompare(right.name));
    this.executeCallback = options.execute;
  }

  static primitive(options: HTNPrimitiveTaskOptions): HTNTask {
    return new HTNTask({ ...options, type: "primitive" });
  }

  static compound(options: HTNCompoundTaskOptions): HTNTask {
    return new HTNTask({ ...options, type: "compound" });
  }

  getMethods(): readonly HTNTaskMethod[] {
    return this.methods;
  }

  canRun(state: WorldState): boolean {
    return state.matches(this.preconditions);
  }

  applyEffects(state: WorldState): WorldState {
    return state.apply(this.effects);
  }

  execute(state: WorldState, context: unknown): HTNTaskResult {
    if (this.type !== "primitive") return "failure";
    return this.executeCallback?.(state, context) ?? "success";
  }
}

export class HTNPlanner {
  private readonly maxDepth: number;
  private readonly maxIterations: number;

  constructor(options: HTNPlannerOptions = {}) {
    this.maxDepth = options.maxDepth ?? 12;
    this.maxIterations = options.maxIterations ?? 128;
    if (!Number.isInteger(this.maxDepth) || this.maxDepth < 1) throw new RangeError("HTN maxDepth must be a positive integer.");
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1) throw new RangeError("HTN maxIterations must be a positive integer.");
  }

  plan(rootTask: HTNTask, initialState: WorldState, context: unknown = {}): HTNPlan {
    const stats: DecomposeStats = {
      decompositions: 0,
      iterations: 0,
      maxDepthReached: 0,
      methodTrace: []
    };
    const result = this.decompose([rootTask], initialState.clone(), context, 0, stats);
    return {
      valid: result.valid,
      rootTask: rootTask.name,
      tasks: result.tasks.map((task) => task.name),
      methodTrace: stats.methodTrace,
      decompositions: stats.decompositions,
      maxDepthReached: stats.maxDepthReached,
      iterations: stats.iterations,
      finalState: result.state.toObject()
    };
  }

  isPlanValid(plan: HTNPlan, rootTask: HTNTask, initialState: WorldState, context: unknown = {}): boolean {
    if (!plan.valid) return false;
    const nextPlan = this.plan(rootTask, initialState, context);
    return nextPlan.valid && nextPlan.tasks.join(">") === plan.tasks.join(">");
  }

  private decompose(tasks: readonly HTNTask[], state: WorldState, context: unknown, depth: number, stats: DecomposeStats): DecomposeResult {
    stats.maxDepthReached = Math.max(stats.maxDepthReached, depth);
    if (depth > this.maxDepth || stats.iterations >= this.maxIterations) {
      return { valid: false, tasks: [], state };
    }
    if (tasks.length === 0) {
      return { valid: true, tasks: [], state };
    }
    stats.iterations += 1;
    const [currentTask, ...remainingTasks] = tasks;
    if (!currentTask) return { valid: true, tasks: [], state };

    if (currentTask.type === "primitive") {
      if (!currentTask.canRun(state)) return { valid: false, tasks: [], state };
      const executed = currentTask.execute(state, context);
      if (executed === "failure") return { valid: false, tasks: [], state };
      const nextState = currentTask.applyEffects(state);
      const remainder = this.decompose(remainingTasks, nextState, context, depth, stats);
      return remainder.valid
        ? { valid: true, tasks: [currentTask, ...remainder.tasks], state: remainder.state }
        : { valid: false, tasks: [], state };
    }

    stats.decompositions += 1;
    for (const method of currentTask.getMethods()) {
      const preconditionsMet = method.check ? method.check(state, context) : state.matches(method.preconditions ?? {});
      if (!preconditionsMet) continue;
      const traceLength = stats.methodTrace.length;
      stats.methodTrace.push(`${currentTask.name}:${method.name}`);
      const result = this.decompose([...method.subtasks, ...remainingTasks], state, context, depth + 1, stats);
      if (result.valid) return result;
      stats.methodTrace.length = traceLength;
    }
    return { valid: false, tasks: [], state };
  }
}
