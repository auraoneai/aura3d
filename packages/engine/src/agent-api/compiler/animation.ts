// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAnimationSpec, AuraModelNode, ProductionRuntimeActorEntry } from "../index.js";
import { isModelTransformAnimationClip, productionRenderErrorMessage, resolveProductionActorAnimationSeconds } from "../index.js";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../RuntimeNodeHandle.js";
import type { Mat4 } from "@aura3d/scene";

export function applyProductionActorAnimation(
  entry: ProductionRuntimeActorEntry,
  node: AuraModelNode,
  animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined,
  time: number,
  runtimeWarnings: Set<string>,
  modelMatrix: readonly number[],
  refreshAfterMovement: () => void
): void {
  const animation = node.animation;
  if (!animation?.clip || isModelTransformAnimationClip(animation.clip)) return;
  const clipName = entry.actor.animation.resolveClipName(animation.clip);
  if (!clipName) {
    runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" has no clips for requested animation "${animation.clip}".`);
    return;
  }
  try {
    const binding = animationBinding?.rootMotion;
    if (binding && animationBinding) {
      const observed = animationBinding.rootMotionSamples ?? [{
        playbackId: animationBinding.playbackId ?? clipName, clipName,
        time: animationBinding.rootMotionTime ?? 0, weight: 1,
        loop: animationBinding.loop ?? animation.loop ?? true, additive: false
      }];
      if (observed.length === 0) { entry.rootMotionCursors = undefined; return; }
      const cursors = entry.rootMotionCursors ?? new Map<string, number>();
      const samples = observed.map(sample => {
        if (!Number.isFinite(sample.time) || sample.time < 0) throw new Error("Root motion requires a finite nonnegative unwrapped controller time.");
        const previous = cursors.get(sample.playbackId);
        return { clipName: sample.clipName, target: binding.target,
          fromTime: previous === undefined ? 0 : Math.min(previous, sample.time),
          toTime: sample.time, weight: sample.weight, loop: sample.loop, additive: sample.additive };
      });
      const commitCursors = () => { entry.rootMotionCursors = new Map(observed.map(sample => [sample.playbackId, sample.time])); };
      const result = entry.actor.playRootMotionClips(samples, {
        worldFromLocal: [...modelMatrix] as Mat4,
        move: requested => {
          if (samples.every(sample => sample.fromTime === sample.toTime)) return [0, 0, 0];
          const accepted = binding.move(requested);
          // Advance cursors before pose/IK work: retrying a failed pose cannot move twice.
          commitCursors();
          refreshAfterMovement();
          return accepted;
        }
      });
      commitCursors();
      binding.onSample?.(result.motion);
    } else {
      entry.rootMotionCursors = undefined;
      entry.actor.playClip(clipName, resolveProductionActorAnimationSeconds(animation, animationBinding, time));
    }
  } catch (error) {
    runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply clip "${clipName}": ${productionRenderErrorMessage(error)}`);
  }
}

export function resolveAnimationSeconds(animation: AuraAnimationSpec | undefined, time: number): number {
  if (!animation) return time / 1000;
  const startTime = animation.startTime ?? 0;
  const duration = animation.duration ?? 0;
  const rawSeconds = Math.max(0, time / 1000 - startTime);
  if (animation.captureTime !== undefined) {
    const phase = Math.max(0, animation.captureTime);
    if (animation.loop !== false) {
      const liveSeconds = phase + rawSeconds;
      return duration > 0 ? liveSeconds % duration : liveSeconds;
    }
    return phase;
  }
  if (duration <= 0) return rawSeconds;
  return animation.loop === false ? Math.min(rawSeconds, duration) : rawSeconds % duration;
}
