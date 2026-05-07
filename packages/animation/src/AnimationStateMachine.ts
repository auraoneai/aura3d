export type StateTransition = {
  readonly to: string;
  readonly label?: string;
  readonly priority?: number;
  readonly exitTime?: number;
  readonly condition: (parameters: Readonly<Record<string, number | boolean | string>>) => boolean;
};

export type AnimationState = {
  readonly name: string;
  readonly transitions?: readonly StateTransition[];
};

export type AnimationStateMachineGraphState = {
  readonly name: string;
  readonly current: boolean;
  readonly transitionCount: number;
};

export type AnimationStateMachineGraphTransition = {
  readonly from: string;
  readonly to: string;
  readonly index: number;
  readonly priority: number;
  readonly label: string;
  readonly exitTime?: number;
};

export type AnimationStateMachineGraphSnapshot = {
  readonly currentState: string;
  readonly stateTime: number;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
  readonly states: readonly AnimationStateMachineGraphState[];
  readonly transitions: readonly AnimationStateMachineGraphTransition[];
};

export class AnimationStateMachine {
  readonly states = new Map<string, AnimationState>();
  readonly parameters: Record<string, number | boolean | string> = {};
  currentState: string;
  stateTime = 0;

  constructor(states: readonly AnimationState[], initialState: string) {
    for (const state of states) {
      for (const transition of state.transitions ?? []) {
        if (transition.exitTime !== undefined && (!Number.isFinite(transition.exitTime) || transition.exitTime < 0)) {
          throw new Error(`Transition from ${state.name} to ${transition.to} has invalid exit time.`);
        }
      }
      this.states.set(state.name, state);
    }
    if (!this.states.has(initialState)) {
      throw new Error(`Initial state ${initialState} does not exist.`);
    }
    this.currentState = initialState;
  }

  setParameter(name: string, value: number | boolean | string): void {
    this.parameters[name] = value;
  }

  update(delta = 0): string {
    if (!Number.isFinite(delta) || delta < 0) {
      throw new Error("AnimationStateMachine delta must be finite and non-negative.");
    }
    this.stateTime += delta;
    const state = this.states.get(this.currentState);
    if (!state) {
      throw new Error(`Current state ${this.currentState} does not exist.`);
    }
    const transition = [...(state.transitions ?? [])]
      .filter((candidate) => candidate.condition(this.parameters))
      .filter((candidate) => candidate.exitTime === undefined || this.stateTime >= candidate.exitTime)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.to.localeCompare(b.to))[0];
    if (transition) {
      if (!this.states.has(transition.to)) {
        throw new Error(`Transition target ${transition.to} does not exist.`);
      }
      this.currentState = transition.to;
      this.stateTime = 0;
    }
    return this.currentState;
  }

  graphSnapshot(): AnimationStateMachineGraphSnapshot {
    const states: AnimationStateMachineGraphState[] = [];
    const transitions: AnimationStateMachineGraphTransition[] = [];
    for (const state of this.states.values()) {
      const stateTransitions = state.transitions ?? [];
      states.push({
        name: state.name,
        current: state.name === this.currentState,
        transitionCount: stateTransitions.length
      });
      stateTransitions.forEach((transition, index) => {
        transitions.push({
          from: state.name,
          to: transition.to,
          index,
          priority: transition.priority ?? 0,
          label: transition.label ?? `${state.name}->${transition.to}`,
          ...(transition.exitTime === undefined ? {} : { exitTime: transition.exitTime })
        });
      });
    }
    return {
      currentState: this.currentState,
      stateTime: this.stateTime,
      parameters: { ...this.parameters },
      states,
      transitions
    };
  }

  debugGraph(): string {
    const snapshot = this.graphSnapshot();
    const lines = [
      `AnimationStateMachine current=${snapshot.currentState} time=${formatNumber(snapshot.stateTime)}`
    ];
    for (const state of snapshot.states) {
      lines.push(`state ${state.name}${state.current ? " *" : ""} transitions=${state.transitionCount}`);
      for (const transition of snapshot.transitions.filter((candidate) => candidate.from === state.name)) {
        const exitTime = transition.exitTime === undefined ? "" : ` exit=${formatNumber(transition.exitTime)}`;
        lines.push(`  -> ${transition.to} priority=${transition.priority}${exitTime} label=${transition.label}`);
      }
    }
    return lines.join("\n");
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}
