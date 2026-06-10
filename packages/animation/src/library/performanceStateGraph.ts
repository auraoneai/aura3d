import { AnimationStateMachine, type AnimationState, type StateTransition } from "../AnimationStateMachine.js";
import { STANDARD_CLIP_IDS, type StandardClipId } from "./standardHumanoidClips.js";

export interface PerformanceStateGraphOptions {
  /** Default / resting state (must be one of the standard clip ids). Defaults to `"idle"`. */
  readonly idleState?: StandardClipId;
  /** Duration (seconds) of the one-shot performance states before they auto-return to idle. */
  readonly oneShotDuration?: number;
}

/**
 * Boolean/number state-machine parameters the studio sets per beat to drive the performance graph.
 * The looping conversational states (talk) are held while their flag is truthy; the one-shot states
 * (gesture/point/nod/react) are triggered by a truthy pulse that is consumed on entry and auto-return
 * to idle. Locomotion (walk/run) is driven by `isMoving` / `isRunning`, mirroring
 * {@link createLocomotionAnimationStateGraph} so the same parameters work for both.
 */
export const PERFORMANCE_GRAPH_PARAMETERS = {
  talk: "isSpeaking",
  gesture: "gesture",
  point: "point",
  nod: "nod",
  wave: "wave",
  react: "react",
  walk: "isMoving",
  run: "isRunning",
  sit: "sit",
  shrug: "shrug",
  cross_arms: "crossArms",
  salute: "salute",
  shake_head: "shakeHead"
} as const satisfies Partial<Record<StandardClipId, string>>;

function trigger(
  to: StandardClipId,
  parameter: string,
  priority: number,
  consume = false,
  expected: boolean = true
): StateTransition {
  return {
    to,
    priority,
    label: `${parameter}->${to}`,
    ...(consume ? { consumeParameters: [parameter] } : {}),
    condition: (parameters) => {
      const value = parameters[parameter];
      if (expected !== true) return value !== true && !truthy(value);
      return truthy(value);
    }
  };
}

function truthy(value: number | boolean | string | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

/**
 * State graph over the 14 standard performance clip ids ({@link STANDARD_CLIP_IDS}) with `idle` as the
 * default state. The studio requests a state per beat and the machine crossfades via the inertialized
 * {@link AnimationStateMachine.stateBlend}.
 *
 * Topology:
 *  - `idle` (default) can go to any performance or locomotion state.
 *  - `talk` is a held loop (while `isSpeaking`) that returns to idle when the flag clears; from talk
 *    you can still fire one-shots and start moving.
 *  - `gesture` / `point` / `nod` / `wave` / `react` / `shrug` / `salute` / `shake_head` are one-shots
 *    that auto-return to idle on completion.
 *  - `sit` and `cross_arms` are held loops that return to idle when their flag clears.
 *  - `walk` <-> `run` <-> `idle` form the locomotion blend (`isMoving` / `isRunning`).
 *
 * Priorities: locomotion-stop/one-shots take precedence so a requested beat wins over the held loop.
 */
export function createPerformanceStateGraph(options: PerformanceStateGraphOptions = {}): AnimationStateMachine {
  const idle = options.idleState ?? "idle";
  const oneShot = options.oneShotDuration ?? 0.6;
  const P = PERFORMANCE_GRAPH_PARAMETERS;

  const toTalk = trigger("talk", P.talk, 30);
  const toWalk = trigger("walk", P.walk, 40);
  const toRun = trigger("run", P.run, 60);
  const toGesture = trigger("gesture", P.gesture, 80, true);
  const toPoint = trigger("point", P.point, 80, true);
  const toNod = trigger("nod", P.nod, 80, true);
  const toWave = trigger("wave", P.wave, 80, true);
  const toReact = trigger("react", P.react, 90, true);
  const toShrug = trigger("shrug", P.shrug, 80, true);
  const toSalute = trigger("salute", P.salute, 80, true);
  const toShakeHead = trigger("shake_head", P.shake_head, 80, true);
  const toSit = trigger("sit", P.sit, 35);
  const toCrossArms = trigger("cross_arms", P.cross_arms, 35);

  const states: readonly AnimationState[] = [
    {
      name: idle,
      transitions: [toReact, toShakeHead, toSalute, toShrug, toGesture, toPoint, toNod, toWave, toCrossArms, toSit, toRun, toWalk, toTalk]
    },
    {
      name: "talk",
      transitions: [
        toReact,
        toShakeHead,
        toSalute,
        toShrug,
        toGesture,
        toPoint,
        toNod,
        toWave,
        toRun,
        toWalk,
        trigger(idle, P.talk, 0, false, false)
      ]
    },
    { name: "gesture", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "point", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "nod", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "wave", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "react", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "shrug", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "salute", duration: oneShot, oneShot: true, onComplete: idle },
    { name: "shake_head", duration: oneShot, oneShot: true, onComplete: idle },
    // Held loops: stay in the state while the flag is truthy, return to idle when it
    // clears. One-shots/locomotion keep higher priority so a requested beat wins.
    {
      name: "sit",
      transitions: [
        toReact,
        toShakeHead,
        toSalute,
        toShrug,
        toGesture,
        toPoint,
        toNod,
        toWave,
        toRun,
        toWalk,
        trigger(idle, P.sit, 0, false, false)
      ]
    },
    {
      name: "cross_arms",
      transitions: [
        toReact,
        toShakeHead,
        toSalute,
        toShrug,
        toGesture,
        toPoint,
        toNod,
        toWave,
        toRun,
        toWalk,
        trigger(idle, P.cross_arms, 0, false, false)
      ]
    },
    {
      name: "walk",
      transitions: [toRun, trigger(idle, P.walk, 0, false, false)]
    },
    {
      name: "run",
      transitions: [trigger("walk", P.run, 0, false, false), trigger(idle, P.walk, 0, false, false)]
    }
  ];

  return new AnimationStateMachine(states, idle);
}

/** The full set of state names the performance graph exposes (equals the standard clip vocabulary). */
export const PERFORMANCE_GRAPH_STATES: readonly StandardClipId[] = STANDARD_CLIP_IDS;
