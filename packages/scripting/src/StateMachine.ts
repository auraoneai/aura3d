import { Blackboard, type BlackboardValue } from "./BehaviorTree";

export type StateTransitionCondition = (blackboard: Blackboard) => boolean;

export interface StateTransition {
  readonly targetState: string;
  readonly condition: StateTransitionCondition;
  readonly priority: number;
  readonly name: string;
}

export interface StateMachineSnapshot {
  readonly running: boolean;
  readonly currentState: string;
  readonly previousState: string;
  readonly tickCount: number;
  readonly transitionCount: number;
  readonly history: readonly string[];
  readonly trace: readonly string[];
}

export class State {
  readonly transitions: StateTransition[] = [];
  onEnter?: (blackboard: Blackboard) => void;
  onUpdate?: (deltaSeconds: number, blackboard: Blackboard) => void;
  onExit?: (blackboard: Blackboard) => void;

  constructor(readonly id: string, readonly name = id) {}

  addTransition(targetState: string, condition: StateTransitionCondition, priority = 0, name = `${this.id}->${targetState}`): this {
    this.transitions.push({ targetState, condition, priority, name });
    this.transitions.sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name));
    return this;
  }
}

export class StateMachine {
  private readonly states = new Map<string, State>();
  private readonly history: string[] = [];
  private readonly maxHistorySize: number;
  private current?: State;
  private previous?: State;
  private running = false;
  private tickCounter = 0;
  private transitionCounter = 0;
  private lastTrace: string[] = [];

  constructor(readonly blackboard = new Blackboard(), options: { readonly maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 12;
  }

  addState(state: State): this {
    if (this.states.has(state.id)) throw new Error(`State already registered: ${state.id}`);
    this.states.set(state.id, state);
    return this;
  }

  getState(id: string): State | undefined {
    return this.states.get(id);
  }

  start(stateId: string): StateMachineSnapshot {
    const state = this.requireState(stateId);
    this.running = true;
    this.current = state;
    this.previous = undefined;
    this.lastTrace = [`enter:${state.id}`];
    state.onEnter?.(this.blackboard);
    return this.snapshot();
  }

  stop(): StateMachineSnapshot {
    if (this.current) {
      this.current.onExit?.(this.blackboard);
      this.lastTrace = [`exit:${this.current.id}`, "stop"];
    } else {
      this.lastTrace = ["stop"];
    }
    this.running = false;
    this.previous = this.current;
    this.current = undefined;
    return this.snapshot();
  }

  update(deltaSeconds: number): StateMachineSnapshot {
    this.tickCounter += 1;
    this.lastTrace = [];
    if (!this.running || !this.current) {
      this.lastTrace.push("idle");
      return this.snapshot();
    }

    this.current.onUpdate?.(Math.max(0, deltaSeconds), this.blackboard);
    this.lastTrace.push(`update:${this.current.id}`);
    const transition = this.current.transitions.find((entry) => entry.condition(this.blackboard));
    if (transition) {
      this.transitionTo(transition);
    }
    return this.snapshot();
  }

  set(key: string, value: BlackboardValue): void {
    this.blackboard.set(key, value);
  }

  snapshot(): StateMachineSnapshot {
    return {
      running: this.running,
      currentState: this.current?.id ?? "none",
      previousState: this.previous?.id ?? "none",
      tickCount: this.tickCounter,
      transitionCount: this.transitionCounter,
      history: [...this.history],
      trace: [...this.lastTrace]
    };
  }

  private transitionTo(transition: StateTransition): void {
    if (!this.current) return;
    const from = this.current;
    const to = this.requireState(transition.targetState);
    from.onExit?.(this.blackboard);
    this.previous = from;
    this.current = to;
    this.transitionCounter += 1;
    this.history.push(`${from.id}->${to.id}`);
    while (this.history.length > this.maxHistorySize) this.history.shift();
    this.lastTrace.push(`transition:${transition.name}`);
    to.onEnter?.(this.blackboard);
    this.lastTrace.push(`enter:${to.id}`);
  }

  private requireState(id: string): State {
    const state = this.states.get(id);
    if (!state) throw new Error(`State is not registered: ${id}`);
    return state;
  }
}
