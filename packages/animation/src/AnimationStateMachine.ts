import { DEFAULT_INERTIALIZATION_HALF_LIFE, inertializedTransitionWeight } from "./Inertialization.js";

export type StateTransition = {
  readonly to: string;
  readonly label?: string;
  readonly priority?: number;
  readonly exitTime?: number;
  readonly consumeParameters?: readonly string[];
  readonly condition: (parameters: Readonly<Record<string, number | boolean | string>>) => boolean;
};

export type AnimationState = {
  readonly name: string;
  readonly duration?: number;
  readonly oneShot?: boolean;
  readonly terminal?: boolean;
  readonly onComplete?: string;
  readonly completedParameter?: string;
  readonly resetParametersOnEnter?: readonly string[];
  readonly transitions?: readonly StateTransition[];
};

export type AnimationStateMachineGraphState = {
  readonly name: string;
  readonly current: boolean;
  readonly transitionCount: number;
  readonly duration?: number;
  readonly oneShot?: boolean;
  readonly terminal?: boolean;
  readonly completed?: boolean;
  readonly onComplete?: string;
};

export type AnimationStateMachineGraphTransition = {
  readonly from: string;
  readonly to: string;
  readonly index: number;
  readonly priority: number;
  readonly label: string;
  readonly exitTime?: number;
  readonly consumeParameters?: readonly string[];
};

export type AnimationStateMachineGraphSnapshot = {
  readonly currentState: string;
  readonly stateTime: number;
  readonly parameters: Readonly<Record<string, number | boolean | string>>;
  readonly states: readonly AnimationStateMachineGraphState[];
  readonly transitions: readonly AnimationStateMachineGraphTransition[];
};

/** Inertialized blend between the previously-active state and the current state. */
export type AnimationStateBlend = {
  /** State exited at the last transition (equals `to` when no transition is in flight). */
  readonly from: string;
  /** Currently-active state. */
  readonly to: string;
  /** [fromWeight, toWeight], summing to 1; fromWeight decays critically-damped after a switch. */
  readonly weights: readonly [number, number];
  /** Seconds since the last state change. */
  readonly elapsed: number;
  /** True once the previous state has effectively faded out. */
  readonly done: boolean;
};

export class AnimationStateMachine {
  readonly states = new Map<string, AnimationState>();
  readonly parameters: Record<string, number | boolean | string> = {};
  currentState: string;
  stateTime = 0;
  /** State active immediately before the most recent transition (for inertialized blending). */
  previousState: string;
  /** Seconds since the most recent state change. */
  transitionElapsed = Number.POSITIVE_INFINITY;
  /** Half-life (seconds) of the inertialized state-transition blend. */
  transitionHalfLife = DEFAULT_INERTIALIZATION_HALF_LIFE;

  constructor(states: readonly AnimationState[], initialState: string) {
    for (const state of states) {
      if (state.duration !== undefined && (!Number.isFinite(state.duration) || state.duration < 0)) {
        throw new Error(`State ${state.name} has invalid duration.`);
      }
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
    for (const state of this.states.values()) {
      if (state.onComplete !== undefined && !this.states.has(state.onComplete)) {
        throw new Error(`State ${state.name} completion target ${state.onComplete} does not exist.`);
      }
    }
    this.currentState = initialState;
    this.previousState = initialState;
    this.resetParametersForState(this.requireState(initialState));
  }

  setParameter(name: string, value: number | boolean | string): void {
    this.parameters[name] = value;
  }

  /**
   * Inertialized blend between {@link previousState} and {@link currentState}. The previous
   * state's weight decays critically-damped (zero initial slope, momentum-preserving) over
   * {@link transitionHalfLife}; consumers crossfade the two states' clips by these weights instead
   * of snapping or linearly ramping. Deterministic given the elapsed transition time.
   */
  stateBlend(halfLife = this.transitionHalfLife): AnimationStateBlend {
    const elapsed = this.transitionElapsed;
    if (this.previousState === this.currentState || !Number.isFinite(elapsed)) {
      return { from: this.currentState, to: this.currentState, weights: [0, 1], elapsed: Number.isFinite(elapsed) ? elapsed : 0, done: true };
    }
    const fromWeight = inertializedTransitionWeight(elapsed, halfLife);
    const done = fromWeight <= 1e-3;
    return {
      from: this.previousState,
      to: this.currentState,
      weights: [done ? 0 : fromWeight, done ? 1 : 1 - fromWeight],
      elapsed,
      done
    };
  }

  update(delta = 0): string {
    if (!Number.isFinite(delta) || delta < 0) {
      throw new Error("AnimationStateMachine delta must be finite and non-negative.");
    }
    this.stateTime += delta;
    this.transitionElapsed += delta;
    const state = this.requireState(this.currentState);

    if (isStateComplete(state, this.stateTime)) {
      if (state.completedParameter) {
        this.parameters[state.completedParameter] = true;
      }
      if (state.onComplete) {
        this.transitionTo(state.onComplete);
        return this.currentState;
      }
      if (state.terminal || state.oneShot) {
        return this.currentState;
      }
    }

    if (state.terminal || state.oneShot) {
      return this.currentState;
    }

    const transition = [...(state.transitions ?? [])]
      .filter((candidate) => candidate.condition(this.parameters))
      .filter((candidate) => candidate.exitTime === undefined || this.stateTime >= candidate.exitTime)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.to.localeCompare(b.to))[0];
    if (transition) {
      if (!this.states.has(transition.to)) {
        throw new Error(`Transition target ${transition.to} does not exist.`);
      }
      consumeParameters(this.parameters, transition.consumeParameters);
      this.transitionTo(transition.to);
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
        transitionCount: stateTransitions.length,
        ...(state.duration === undefined ? {} : { duration: state.duration }),
        ...(state.oneShot ? { oneShot: true } : {}),
        ...(state.terminal ? { terminal: true } : {}),
        ...(state.name === this.currentState && isStateComplete(state, this.stateTime) ? { completed: true } : {}),
        ...(state.onComplete === undefined ? {} : { onComplete: state.onComplete })
      });
      stateTransitions.forEach((transition, index) => {
        transitions.push({
          from: state.name,
          to: transition.to,
          index,
          priority: transition.priority ?? 0,
          label: transition.label ?? `${state.name}->${transition.to}`,
          ...(transition.exitTime === undefined ? {} : { exitTime: transition.exitTime }),
          ...(transition.consumeParameters === undefined || transition.consumeParameters.length === 0
            ? {}
            : { consumeParameters: [...transition.consumeParameters] })
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

  private requireState(name: string): AnimationState {
    const state = this.states.get(name);
    if (!state) {
      throw new Error(`Current state ${name} does not exist.`);
    }
    return state;
  }

  private transitionTo(name: string): void {
    const state = this.requireState(name);
    this.previousState = this.currentState;
    this.currentState = name;
    this.stateTime = 0;
    this.transitionElapsed = this.previousState === name ? Number.POSITIVE_INFINITY : 0;
    this.resetParametersForState(state);
  }

  private resetParametersForState(state: AnimationState): void {
    consumeParameters(this.parameters, state.resetParametersOnEnter);
  }
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function isStateComplete(state: AnimationState, stateTime: number): boolean {
  return state.duration !== undefined && stateTime >= state.duration;
}

function consumeParameters(
  parameters: Record<string, number | boolean | string>,
  names: readonly string[] | undefined
): void {
  for (const name of names ?? []) {
    const value = parameters[name];
    if (typeof value === "boolean") {
      parameters[name] = false;
    } else if (typeof value === "number") {
      parameters[name] = 0;
    } else if (typeof value === "string") {
      parameters[name] = "";
    }
  }
}
