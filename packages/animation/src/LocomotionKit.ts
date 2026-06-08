import { BlendTree1D, type BlendTreeWeight } from "./BlendTree.js";
import { createLocomotionAnimationStateGraph } from "./AnimationStateGraph.js";
import type { AnimationStateBlend, AnimationStateMachine } from "./AnimationStateMachine.js";
import type { FootIkRig } from "./FootIk.js";

/**
 * Composable locomotion kit: maps a scalar movement speed into a discrete locomotion state
 * (idle/walk/run) plus blended clip weights, using the real `BlendTree1D` and
 * `createLocomotionAnimationStateGraph` primitives. This is the deterministic, browser-free
 * core a `character-controller` template wires to a physics `CharacterController`, input, and
 * an `AnimationController` crossfade.
 */
export interface LocomotionKitOptions<TClipId extends string = string> {
  readonly idleClip: TClipId;
  readonly walkClip: TClipId;
  readonly runClip: TClipId;
  /** Speed at which the walk clip reaches full weight (default 1). */
  readonly walkSpeed?: number;
  /** Speed at which the run clip reaches full weight (default 4). */
  readonly runSpeed?: number;
  /** Speed above which the character is considered moving (default 0.05). */
  readonly movingThreshold?: number;
  /** Speed at/above which the character is considered running (default = runSpeed, so state stays coherent with the blend). */
  readonly runningThreshold?: number;
  /** Optional foot-IK rig so locomotion can ground feet on uneven terrain (no foot sliding). */
  readonly footIkRig?: FootIkRig;
}

export interface LocomotionKitSample<TClipId extends string = string> {
  readonly speed: number;
  readonly state: string;
  readonly moving: boolean;
  readonly running: boolean;
  readonly clipWeights: ReadonlyArray<{ readonly clip: TClipId; readonly weight: number }>;
  /**
   * Inertialized blend between the previously-active discrete state and the current one. When the
   * state graph switches (e.g. walk→run), the previous state's clip fades out on a critically-damped
   * curve instead of snapping — momentum-preserving idle↔walk↔run transitions.
   */
  readonly stateTransition: AnimationStateBlend;
}

export interface LocomotionKit<TClipId extends string = string> {
  readonly graph: AnimationStateMachine;
  /** Optional foot-IK rig hook; call `footIk.solveFootPlacement(...)` to ground feet. */
  readonly footIk: FootIkRig | undefined;
  /** Blend clip weights for a speed (sum ~= 1), independent of the discrete state graph. */
  blendWeights(speed: number): ReadonlyArray<BlendTreeWeight<TClipId>>;
  /** Advance the state graph and produce the full locomotion sample for a speed. */
  sample(speed: number, delta?: number): LocomotionKitSample<TClipId>;
}

export function createLocomotionKit<TClipId extends string = string>(options: LocomotionKitOptions<TClipId>): LocomotionKit<TClipId> {
  const walkSpeed = options.walkSpeed ?? 1;
  const runSpeed = options.runSpeed ?? 4;
  const movingThreshold = options.movingThreshold ?? 0.05;
  const runningThreshold = options.runningThreshold ?? runSpeed;

  const tree = new BlendTree1D<TClipId>([
    { value: options.idleClip, threshold: 0 },
    { value: options.walkClip, threshold: walkSpeed },
    { value: options.runClip, threshold: runSpeed }
  ]);
  const graph = createLocomotionAnimationStateGraph();

  return {
    graph,
    footIk: options.footIkRig,
    blendWeights(speed: number) {
      return tree.weights(Math.max(0, speed));
    },
    sample(speed: number, delta = 1 / 30): LocomotionKitSample<TClipId> {
      const clamped = Math.max(0, speed);
      const moving = clamped > movingThreshold;
      const running = clamped >= runningThreshold;
      graph.setParameter("isMoving", moving);
      graph.setParameter("isRunning", running);
      const state = graph.update(delta);
      return {
        speed: clamped,
        state,
        moving,
        running,
        clipWeights: tree.weights(clamped).map((weight) => ({ clip: weight.value, weight: weight.weight })),
        stateTransition: graph.stateBlend()
      };
    }
  };
}
