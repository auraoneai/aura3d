export {
  AnimationStateMachine as AnimationStateGraph,
  AnimationStateMachine,
  type AnimationState,
  type AnimationStateBlend,
  type AnimationStateMachineGraphSnapshot,
  type AnimationStateMachineGraphState,
  type AnimationStateMachineGraphTransition,
  type StateTransition
} from "./AnimationStateMachine.js";

import { AnimationStateMachine, type AnimationState } from "./AnimationStateMachine.js";

export interface AnimationAnimationStateGraphOptions {
  readonly idleState?: string;
}

export interface AnimationAnimationStateGraphSample {
  readonly frame: number;
  readonly state: string;
}

export function createAnimationAnimationStateGraph(options: AnimationAnimationStateGraphOptions = {}): AnimationStateMachine {
  const idle = options.idleState ?? "idle";
  const states: readonly AnimationState[] = [
    {
      name: idle,
      transitions: [
        transition("speak", "isSpeaking", 50),
        transition("gesture", "gesture", 40, ["gesture"]),
        transition("walk", "isWalking", 30),
        transition("action", "action", 60, ["action"]),
        transition("listen", "isListening", 20)
      ]
    },
    { name: "listen", transitions: [transition("speak", "isSpeaking", 50), transition(idle, "isListening", 0, undefined, false)] },
    { name: "speak", transitions: [transition("gesture", "gesture", 60, ["gesture"]), transition(idle, "isSpeaking", 0, undefined, false)] },
    { name: "gesture", duration: 0.4, oneShot: true, onComplete: idle },
    { name: "walk", transitions: [transition(idle, "isWalking", 0, undefined, false), transition("action", "action", 60, ["action"])] },
    { name: "action", duration: 0.5, oneShot: true, onComplete: idle }
  ];
  return new AnimationStateMachine(states, idle);
}

export function sampleAnimationAnimationStateGraph(
  graph: AnimationStateMachine,
  inputs: readonly Readonly<Record<string, number | boolean | string>>[],
  delta = 1 / 30
): readonly AnimationAnimationStateGraphSample[] {
  return inputs.map((parameters, frame) => {
    for (const [key, value] of Object.entries(parameters)) graph.setParameter(key, value);
    return { frame, state: graph.update(delta) };
  });
}

export interface LocomotionAnimationStateGraphOptions {
  readonly idleState?: string;
}

/**
 * Reusable locomotion state graph (idle <-> walk <-> run) for character-controller and
 * Animation Studio templates. Parameters: `isMoving` (walk), `isRunning` (run). Mirrors
 * {@link createAnimationAnimationStateGraph} so both share the deterministic state-machine core.
 */
export function createLocomotionAnimationStateGraph(options: LocomotionAnimationStateGraphOptions = {}): AnimationStateMachine {
  const idle = options.idleState ?? "idle";
  const states: readonly AnimationState[] = [
    {
      name: idle,
      transitions: [transition("run", "isRunning", 60), transition("walk", "isMoving", 40)]
    },
    {
      name: "walk",
      transitions: [transition("run", "isRunning", 60), transition(idle, "isMoving", 0, undefined, false)]
    },
    {
      name: "run",
      transitions: [transition("walk", "isRunning", 0, undefined, false), transition(idle, "isMoving", 0, undefined, false)]
    }
  ];
  return new AnimationStateMachine(states, idle);
}

function transition(
  to: string,
  parameter: string,
  priority: number,
  consumeParameters?: readonly string[],
  expected = true
) {
  return {
    to,
    priority,
    label: `${parameter}->${to}`,
    consumeParameters,
    condition: (parameters: Readonly<Record<string, number | boolean | string>>) => {
      const value = parameters[parameter];
      if (expected !== true) return value === expected;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.trim().length > 0;
      if (typeof value === "number") return value > 0;
      return false;
    }
  };
}
