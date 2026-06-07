export {
  AnimationStateMachine as AnimationStateGraph,
  AnimationStateMachine,
  type AnimationState,
  type AnimationStateMachineGraphSnapshot,
  type AnimationStateMachineGraphState,
  type AnimationStateMachineGraphTransition,
  type StateTransition
} from "./AnimationStateMachine.js";

import { AnimationStateMachine, type AnimationState } from "./AnimationStateMachine.js";

export interface CartoonAnimationStateGraphOptions {
  readonly idleState?: string;
}

export interface CartoonAnimationStateGraphSample {
  readonly frame: number;
  readonly state: string;
}

export function createCartoonAnimationStateGraph(options: CartoonAnimationStateGraphOptions = {}): AnimationStateMachine {
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

export function sampleCartoonAnimationStateGraph(
  graph: AnimationStateMachine,
  inputs: readonly Readonly<Record<string, number | boolean | string>>[],
  delta = 1 / 30
): readonly CartoonAnimationStateGraphSample[] {
  return inputs.map((parameters, frame) => {
    for (const [key, value] of Object.entries(parameters)) graph.setParameter(key, value);
    return { frame, state: graph.update(delta) };
  });
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
