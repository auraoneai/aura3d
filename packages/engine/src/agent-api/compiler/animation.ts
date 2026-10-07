// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// Lane 06 (PRD-06 T0.1–T0.3): `dispatchActorAnimation` and `rejectEmptyAnimationPose`
// are the lane-owned dispatch + empty-pose guard; `applyProductionActorAnimation` gains
// the A3D_QR_ANIMATION-gated `clipSamples` blend path (C-19 §5.2). Flag-off behaviour is
// byte-identical to the carve.

import type { AnimationPose } from "@aura3d/animation";
import type { AuraAnimationSpec, AuraModelNode, ProductionRuntimeActorEntry } from "../nodes/types.js";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../RuntimeNodeHandle.js";
import { resolveProductionActorAnimationSeconds } from "../compiler/actors.js";
import { productionRenderErrorMessage } from "../compiler/observations.js";
import { isModelTransformAnimationClip } from "../sceneMath.js";
import type { Mat4 } from "@aura3d/scene";
import type { AuraDegradation } from "../../contracts/compiler.js";
import { ANIMATION_EMPTY_POSE, consumePendingEmptyPoseRejection, qrAnimationFlags, rejectEmptyAnimationPose } from "../app/actorAnimationHandle.js";

export { rejectEmptyAnimationPose } from "../app/actorAnimationHandle.js";

/**
 * T1.8 (PRD-06 §10) — C-36 `clip-apply-failed` degradations recorded when a
 * clip cannot resolve or fails to apply. Queued here because the runtime
 * render path has no `SceneCompileContext`; PRD-15 drains this list through
 * `ctx.degrade` (same seam as `takeWorldEnvDegradations`).
 */
const pendingClipApplyDegradations: Omit<AuraDegradation, "frame">[] = [];
export function takeClipApplyDegradations(): Omit<AuraDegradation, "frame">[] {
  return pendingClipApplyDegradations.splice(0, pendingClipApplyDegradations.length);
}

/** Under 3.1 defaults (flag on) a fuzzy-resolution miss is an error; under 3.0 it keeps the legacy first-clip fallback. */
const clipNameResolveOptions = (): { readonly fallback: "error" | "first" } => ({
  fallback: qrAnimationFlags().on("A3D_QR_ANIMATION") ? "error" : "first"
});

const recordClipApplyFailure = (nodeId: string | undefined, message: string, cause?: unknown): void => {
  pendingClipApplyDegradations.push({ code: "clip-apply-failed", nodeId, message, cause });
};

/**
 * T0.1 — the actor-animation dispatch that `compiler/renderInput.ts` routes
 * through (PRD-15 call site, wired via qr-request). Rejects stored empty poses
 * ({bones:{}} produced by bound controllers, E2) before they can suppress clip
 * playback (E1), then applies a live pose or falls through to clip dispatch.
 */
export function dispatchActorAnimation(
  entry: ProductionRuntimeActorEntry,
  state: {
    readonly animationPose?: AnimationPose;
    readonly animationPoseTime?: number;
    readonly animationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
  },
  node: AuraModelNode,
  time: number,
  runtimeWarnings: Set<string>,
  modelMatrix: readonly number[],
  refreshAfterMovement: () => void
): void {
  const animationPose = rejectEmptyAnimationPose(state.animationPose);
  if (state.animationPose !== undefined && animationPose === undefined) {
    runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" received an empty animation pose (0 bones, 0 morph targets); falling back to clip playback.`);
  }
  // T0.2 — surface the once-per-node rejection recorded by
  // `setActorRuntimeAnimationPose` (warn through the render-time warnings set).
  const nodeId = (node.runtime as { readonly id?: string } | undefined)?.id;
  if (consumePendingEmptyPoseRejection(nodeId)) {
    runtimeWarnings.add(`${ANIMATION_EMPTY_POSE}: typed GLB actor "${entry.actor.id}" (node "${nodeId}") rejected an animation pose with 0 bones and 0 morph targets; falling back to clip playback.`);
  }
  if (animationPose) {
    try {
      entry.actor.applyRetargetedPose(animationPose, state.animationPoseTime ?? time);
      entry.rootMotionCursors = undefined;
    } catch (error) {
      runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply bound pose: ${productionRenderErrorMessage(error)}`);
    }
    return;
  }
  applyProductionActorAnimation(entry, node, state.animationBinding, time, runtimeWarnings, modelMatrix, refreshAfterMovement);
}

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
  const clipName = entry.actor.animation.resolveClipName(animation.clip, clipNameResolveOptions());
  if (!clipName) {
    const available = entry.actor.animation.clipNames();
    const message = `ANIMATION_CLIP_NOT_FOUND: typed GLB actor "${entry.actor.id}" has no clip named "${animation.clip}". Available clips: ${available.length > 0 ? available.join(", ") : "(none)"}.`;
    runtimeWarnings.add(message);
    recordClipApplyFailure((node.runtime as { readonly id?: string } | undefined)?.id, `clip "${animation.clip}" did not resolve on actor "${entry.actor.id}" (available: ${available.length > 0 ? available.join(", ") : "none"})`);
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
      // T0.3 — when the bound controller published clip samples (C-19 §5.2) and the
      // lane flag is on, drive the GLB blend directly so retimed/weighted playback
      // reaches the actor instead of a single unweighted clip. Flag-off keeps the
      // single-clip path byte-identical.
      const clipSamples = qrAnimationFlags().on("A3D_QR_ANIMATION")
        ? resolveRuntimeBindingClipSamples(entry, animationBinding, runtimeWarnings)
        : undefined;
      if (clipSamples && clipSamples.length > 0) {
        entry.actor.animation.applyClips(clipSamples);
      } else {
        entry.actor.playClip(clipName, resolveProductionActorAnimationSeconds(animation, animationBinding, time));
      }
    }
  } catch (error) {
    runtimeWarnings.add(`Typed GLB actor "${entry.actor.id}" failed to apply clip "${clipName}": ${productionRenderErrorMessage(error)}`);
    recordClipApplyFailure((node.runtime as { readonly id?: string } | undefined)?.id, `clip "${clipName}" failed to apply on actor "${entry.actor.id}"`, error);
  }
}

/**
 * T0.3 — the `clipSamples` field the controller writes onto runtime-node animation
 * bindings (CCR-06-5; the field lands on `AuraRuntimeNodeAnimationBindingMetadata`
 * via lane 15). Read structurally until the contract type carries it.
 */
interface RuntimeBindingClipSample {
  readonly clipName: string;
  readonly localTime: number;
  readonly weight: number;
  readonly additive?: boolean;
  readonly mask?: { readonly include?: readonly string[]; readonly exclude?: readonly string[] };
}

function resolveRuntimeBindingClipSamples(
  entry: ProductionRuntimeActorEntry,
  animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined,
  runtimeWarnings: Set<string>
): Parameters<ProductionRuntimeActorEntry["actor"]["animation"]["applyClips"]>[0] | undefined {
  const samples = (animationBinding as { readonly clipSamples?: readonly RuntimeBindingClipSample[] } | undefined)?.clipSamples;
  if (!samples || samples.length === 0) return undefined;
  const mapped: { clipName: string; time: number; weight?: number; additive?: boolean; mask?: { include?: readonly string[]; exclude?: readonly string[] } }[] = [];
  for (const sample of samples) {
    const resolvedName = entry.actor.animation.resolveClipName(sample.clipName, clipNameResolveOptions());
    if (!resolvedName) {
      const available = entry.actor.animation.clipNames();
      runtimeWarnings.add(`ANIMATION_CLIP_NOT_FOUND: typed GLB actor "${entry.actor.id}" has no clip named "${sample.clipName}" for bound clip sample. Available clips: ${available.length > 0 ? available.join(", ") : "(none)"}.`);
      recordClipApplyFailure(undefined, `bound clip sample "${sample.clipName}" did not resolve on actor "${entry.actor.id}" (available: ${available.length > 0 ? available.join(", ") : "none"})`);
      continue;
    }
    const mask = sample.mask && ((sample.mask.include?.length ?? 0) > 0 || (sample.mask.exclude?.length ?? 0) > 0)
      ? { include: sample.mask.include, exclude: sample.mask.exclude }
      : undefined;
    mapped.push({ clipName: resolvedName, time: Math.max(0, sample.localTime), weight: sample.weight, additive: sample.additive, mask });
  }
  return mapped.length > 0 ? mapped : undefined;
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
