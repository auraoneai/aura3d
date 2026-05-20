export type GOAPValue = string | number | boolean | null;
export type GOAPStateShape = Record<string, GOAPValue>;

export interface GOAPActionOptions {
  readonly name: string;
  readonly cost?: number;
  readonly preconditions?: GOAPStateShape;
  readonly effects: GOAPStateShape;
  readonly enabled?: boolean;
}

export interface GOAPPlannerOptions {
  readonly maxIterations?: number;
  readonly maxPlanLength?: number;
}

export interface GOAPPlan {
  readonly valid: boolean;
  readonly actions: readonly string[];
  readonly cost: number;
  readonly nodesExplored: number;
  readonly finalState: GOAPStateShape;
}

type PlanNode = {
  readonly state: WorldState;
  readonly actions: readonly string[];
  readonly cost: number;
};

export class WorldState {
  private readonly values = new Map<string, GOAPValue>();

  constructor(initial: GOAPStateShape = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  static from(initial: GOAPStateShape): WorldState {
    return new WorldState(initial);
  }

  set(key: string, value: GOAPValue): void {
    this.values.set(key, value);
  }

  get(key: string): GOAPValue | undefined {
    return this.values.get(key);
  }

  satisfies(goal: WorldState): boolean {
    return goal.entries().every(([key, value]) => this.values.get(key) === value);
  }

  matches(shape: GOAPStateShape): boolean {
    return Object.entries(shape).every(([key, value]) => this.values.get(key) === value);
  }

  apply(shape: GOAPStateShape): WorldState {
    const next = this.clone();
    for (const [key, value] of Object.entries(shape)) next.set(key, value);
    return next;
  }

  clone(): WorldState {
    return new WorldState(this.toObject());
  }

  entries(): readonly (readonly [string, GOAPValue])[] {
    return [...this.values.entries()].sort(([left], [right]) => left.localeCompare(right));
  }

  toObject(): GOAPStateShape {
    return Object.fromEntries(this.entries());
  }

  key(): string {
    return this.entries().map(([key, value]) => `${key}:${String(value)}`).join("|");
  }
}

export class GOAPAction {
  readonly name: string;
  readonly cost: number;
  readonly preconditions: GOAPStateShape;
  readonly effects: GOAPStateShape;
  enabled: boolean;

  constructor(options: GOAPActionOptions) {
    this.name = options.name;
    this.cost = options.cost ?? 1;
    this.preconditions = options.preconditions ?? {};
    this.effects = options.effects;
    this.enabled = options.enabled ?? true;
    if (!Number.isFinite(this.cost) || this.cost < 0) throw new RangeError("GOAP action cost must be a finite non-negative number.");
  }

  canRun(state: WorldState): boolean {
    return this.enabled && state.matches(this.preconditions);
  }

  apply(state: WorldState): WorldState {
    return state.apply(this.effects);
  }
}

export class GOAPPlanner {
  private readonly maxIterations: number;
  private readonly maxPlanLength: number;

  constructor(options: GOAPPlannerOptions = {}) {
    this.maxIterations = options.maxIterations ?? 128;
    this.maxPlanLength = options.maxPlanLength ?? 8;
  }

  plan(current: WorldState, goal: WorldState, actions: readonly GOAPAction[]): GOAPPlan {
    if (current.satisfies(goal)) {
      return { valid: true, actions: [], cost: 0, nodesExplored: 0, finalState: current.toObject() };
    }
    const enabledActions = actions.filter((action) => action.enabled).sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name));
    const open: PlanNode[] = [{ state: current, actions: [], cost: 0 }];
    const bestCostByState = new Map<string, number>([[current.key(), 0]]);
    let nodesExplored = 0;

    while (open.length > 0 && nodesExplored < this.maxIterations) {
      open.sort((left, right) => left.cost - right.cost || left.actions.join(",").localeCompare(right.actions.join(",")));
      const node = open.shift()!;
      nodesExplored += 1;
      if (node.state.satisfies(goal)) {
        return { valid: true, actions: node.actions, cost: round3(node.cost), nodesExplored, finalState: node.state.toObject() };
      }
      if (node.actions.length >= this.maxPlanLength) continue;

      for (const action of enabledActions) {
        if (!action.canRun(node.state)) continue;
        const nextState = action.apply(node.state);
        const nextCost = round3(node.cost + action.cost);
        const key = nextState.key();
        if ((bestCostByState.get(key) ?? Number.POSITIVE_INFINITY) <= nextCost) continue;
        bestCostByState.set(key, nextCost);
        open.push({ state: nextState, actions: [...node.actions, action.name], cost: nextCost });
      }
    }

    return { valid: false, actions: [], cost: 0, nodesExplored, finalState: current.toObject() };
  }
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
