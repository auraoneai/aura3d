// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// Lane 06 (PRD-06 T0.1–T0.3): `dispatchActorAnimation` and `rejectEmptyAnimationPose`
// are the lane-owned dispatch + empty-pose guard; `applyProductionActorAnimation` gains
// the A3D_QR_ANIMATION-gated `clipSamples` blend path (C-19 §5.2). Flag-off behaviour is
// byte-identical to the carve.

import type { AnimationPose } from "@aura3d/animation";
import { createBoneMask } from "@aura3d/animation/lanes";
import type { PoseAction } from "@aura3d/animation/lanes";
import type { AuraAnimationSpec, AuraModelNode, AuraRuntimeNodeRegistry, ProductionRuntimeActorEntry } from "../nodes/types.js";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../RuntimeNodeHandle.js";
import type { TypedGLBActor } from "../../production-runtime/TypedGLBActor.js";
import { resolveProductionActorAnimationSeconds } from "../compiler/actors.js";
import { productionRenderErrorMessage } from "../compiler/observations.js";
import { isModelTransformAnimationClip } from "../sceneMath.js";
import type { Mat4 } from "@aura3d/scene";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraDegradation, SceneCompileContext } from "../../contracts/compiler.js";
import type { AuraCreateAppAnimationOptions } from "../../contracts/animation.js";
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

/**
 * T1.10 (C-19) — per-node `animation.fallback` overrides the ambient resolve
 * policy under the lane flag; flag-off keeps the ambient 3.0 `first`.
 */
const resolveClipNameOptionsForSpec = (spec: AuraAnimationSpec): { readonly fallback: "error" | "first" } =>
  spec.fallback !== undefined && qrAnimationFlags().on("A3D_QR_ANIMATION")
    ? { fallback: spec.fallback }
    : clipNameResolveOptions();

/** C-19 `animation.mask` → bind-order Float32Array over the runtime skeleton. */
type AnimationRuntimeWithMask = { skeletonJointNames?: () => readonly string[] };
const animationMaskForRuntime = (runtime: AnimationRuntimeWithMask, spec: AuraAnimationSpec["mask"]): Float32Array | undefined => {
  if (spec === undefined || typeof runtime.skeletonJointNames !== "function") return undefined;
  return createBoneMask(spec, { jointNames: runtime.skeletonJointNames() });
};

const recordClipApplyFailure = (nodeId: string | undefined, message: string, cause?: unknown): void => {
  pendingClipApplyDegradations.push({ code: "clip-apply-failed", nodeId, message, cause });
};

/**
 * T1.9 (PRD-06 §10) — the per-actor stateful animation state under 3.1
 * (`mixer` + `baseAction` on the entry's animation state). Keyed on the actor
 * instance via WeakMap because `ProductionRuntimeActorEntry` is rebuilt every
 * frame; entries die with the actor.
 */
type ProductionActorPoseState = {
  baseAction: PoseAction | null;
  /** The resolved `node.animation.clip` the mixer currently drives. */
  activeClip: string | null;
  /** Render time (ms) at the last mixer step — per-actor dt derives from it. */
  lastTimeMs: number | undefined;
};

let productionActorPoseStates = new WeakMap<TypedGLBActor, ProductionActorPoseState>();

/** Test seam — WeakMap has no clear; reassigning drops every actor's state. */
export function resetProductionActorPoseStates(): void {
  productionActorPoseStates = new WeakMap();
}

/**
 * C-23 seam — `app.time.scale` for per-actor dt composition. The production
 * render path does not receive the `AuraApp`, so the app/time lane installs
 * the provider (tests may too); it defaults to 1 until prd08's `app.time`
 * integration wires it.
 */
let actorAnimationAppTimeScale: (() => number) | undefined;
export function setActorAnimationAppTimeScale(provider: (() => number) | undefined): void {
  actorAnimationAppTimeScale = provider;
}

/**
 * C-23 `handle.timeScale` — read structurally (the member lands with prd08's
 * C-37 extension); defaults to 1 until the handle carries it. 0 freezes the
 * actor's clip time (hit-stop scope).
 */
const actorHandleTimeScale = (runtimeNodes: AuraRuntimeNodeRegistry | undefined, nodeId: string | undefined): number => {
  if (runtimeNodes === undefined || nodeId === undefined) return 1;
  const handle = runtimeNodes.get(nodeId) as { readonly timeScale?: number } | undefined;
  const scale = handle?.timeScale;
  return typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
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
  refreshAfterMovement: () => void,
  runtimeNodes?: AuraRuntimeNodeRegistry
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
  applyProductionActorAnimation(entry, node, state.animationBinding, time, runtimeWarnings, modelMatrix, refreshAfterMovement, runtimeNodes);
}

export function applyProductionActorAnimation(
  entry: ProductionRuntimeActorEntry,
  node: AuraModelNode,
  animationBinding: AuraRuntimeNodeAnimationBindingMetadata | undefined,
  time: number,
  runtimeWarnings: Set<string>,
  modelMatrix: readonly number[],
  refreshAfterMovement: () => void,
  runtimeNodes?: AuraRuntimeNodeRegistry
): void {
  const animation = node.animation;
  // T4.2 — a bound controller that publishes clip samples (C-19 §5.2, e.g.
  // `characterAnimation`) drives `applyClips` directly, with no
  // `node.animation.clip` required. Hoisted above the clip gate so the
  // samples-only binding reaches the actor; flag-off keeps this unreachable.
  {
    const clipSamples = qrAnimationFlags().on("A3D_QR_ANIMATION")
      ? resolveRuntimeBindingClipSamples(entry, animationBinding, runtimeWarnings)
      : undefined;
    if (clipSamples && clipSamples.length > 0) {
      // Pose constraints (ik/look-at/spring) solve in the frame this
      // modelMatrix maps to: install the live provider before applyClips so
      // world-space targets land correctly under node translate/rotate.
      entry.actor.animation.setPoseConstraintModelMatrix(() => modelMatrix);
      entry.actor.animation.applyClips(clipSamples);
      return;
    }
  }
  if (!animation?.clip || isModelTransformAnimationClip(animation.clip)) return;
  const clipName = entry.actor.animation.resolveClipName(animation.clip, resolveClipNameOptionsForSpec(animation));
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
      // T3.7 (PRD-06 §6.8) — C-19 `play(clip, {rootMotion: AuraRootMotionSpec})`
      // on the spec path: `node.animation.rootMotion` as a spec object removes the
      // authored delta from the pose (the runtime samples the root track at t=0)
      // and either integrates it into the node transform (`mode: "apply"`) or
      // only reports it (`"extract-only"`, recorded on `entry.rootMotionReport`
      // until CCR-06-3 lands a consumer). Axes mask the applied delta; "yaw"
      // extracts the root rotation track's Y-rotation. Flag-off or a binding
      // root-motion path keeps the existing clip playback byte-identical.
      const specRootMotion = animation.rootMotion;
      if (
        specRootMotion !== undefined && specRootMotion !== false &&
        qrAnimationFlags().on("A3D_QR_ANIMATION") &&
        typeof entry.actor.playRootMotionClips === "function" &&
        typeof entry.actor.animation?.rootMotionTargetFor === "function"
      ) {
        const seconds = resolveProductionActorAnimationSeconds(animation, animationBinding, time);
        const runtimeId = (node.runtime as { readonly id?: string } | undefined)?.id;
        const runtimeNode = runtimeId !== undefined ? runtimeNodes?.get(runtimeId) : undefined;
        const playbackId = `root-motion:${runtimeId ?? entry.actor.id}:${clipName}`;
        const cursors = entry.rootMotionCursors ?? new Map<string, number>();
        const previous = cursors.get(playbackId);
        const fromTime = previous === undefined ? 0 : Math.min(previous, seconds);
        const loop = animation.loop ?? true;
        const axes = specRootMotion.axes;
        const includeAxis = (axis: "x" | "y" | "z" | "yaw") => axes === undefined || axes.includes(axis);
        const yawDelta = includeAxis("yaw") && typeof entry.actor.animation.rootMotionYawDelta === "function"
          ? entry.actor.animation.rootMotionYawDelta(clipName, specRootMotion.bone, fromTime, seconds, loop)
          : 0;
        const commitCursors = () => {
          entry.rootMotionCursors = new Map(cursors);
          entry.rootMotionCursors.set(playbackId, seconds);
        };
        const result = entry.actor.playRootMotionClips([{
          clipName,
          target: entry.actor.animation.rootMotionTargetFor(clipName, specRootMotion.bone),
          fromTime,
          toTime: seconds,
          weight: 1,
          loop,
          additive: false
        }], {
          worldFromLocal: [...modelMatrix] as Mat4,
          move: requested => {
            if (fromTime === seconds) return [0, 0, 0] as const;
            const masked: readonly [number, number, number] = [
              includeAxis("x") ? requested[0] : 0,
              includeAxis("y") ? requested[1] : 0,
              includeAxis("z") ? requested[2] : 0
            ];
            if (specRootMotion.mode === "extract-only") {
              // Report-only: nothing integrates, but the cursor still advances.
              commitCursors();
              return [0, 0, 0] as const;
            }
            if (runtimeNode && typeof runtimeNode.translate === "function") {
              runtimeNode.translate(masked[0], masked[1], masked[2]);
              if (yawDelta !== 0 && typeof runtimeNode.setRotation === "function") {
                const rotation = runtimeNode.rotation;
                runtimeNode.setRotation(rotation[0], rotation[1] + yawDelta, rotation[2]);
              }
            } else {
              // No mutable runtime node: fold into the node's model matrix
              // (applied in renderInput before foot planting and draw).
              const offset = entry.rootMotionOffset ?? [0, 0, 0];
              entry.rootMotionOffset = [offset[0] + masked[0], offset[1] + masked[1], offset[2] + masked[2]];
              entry.rootMotionYaw = (entry.rootMotionYaw ?? 0) + yawDelta;
            }
            // Advance cursors before the refresh/re-pose so a failed apply
            // cannot move the node twice (carved-path semantics).
            commitCursors();
            refreshAfterMovement();
            return masked;
          }
        });
        commitCursors();
        entry.rootMotionReport = {
          requested: result.motion.requested,
          accepted: result.motion.accepted,
          rejected: result.motion.rejected,
          ...(yawDelta !== 0 ? { yawDelta } : {})
        };
        return;
      }
      entry.rootMotionCursors = undefined;
      // T0.3's clip-samples dispatch moved to the top of this function (T4.2):
      // bound samples reach `applyClips` even without `node.animation.clip`.
      // What remains is the single-clip path for bindings that did not publish
      // samples — flag-gated PoseMixer when available, else legacy clip play.
      if (
        qrAnimationFlags().on("A3D_QR_ANIMATION") &&
        !animation.rootMotion &&
        typeof entry.actor.animation.mixer === "function" &&
        typeof entry.actor.animation.applyPoseMixer === "function"
      ) {
        // T1.9 — stateful per-actor PoseMixer for `node.animation.clip` skinned
        // clips under 3.1. `clip` change → `crossFadeTo(new, crossFade ?? 0.2,
        // {warp})`; `speed` → `setEffectiveTimeScale`; per-actor dt is
        // `rawDt * app.time.scale * handle.timeScale` (C-23, both stub 1
        // today); `restPoseReset` defaults to true. T1.10 (C-19) adds the
        // spec fields: `layer`/`weight`/`mask`/`blendMode`/`additiveReference`.
        const runtime = entry.actor.animation;
        let state = productionActorPoseStates.get(entry.actor);
        if (state === undefined) {
          state = { baseAction: null, activeClip: null, lastTimeMs: undefined };
          productionActorPoseStates.set(entry.actor, state);
        }
        if (state.activeClip !== clipName || state.baseAction === null || !state.baseAction.playing) {
          const fadeSeconds = animation.crossFade === false ? 0 : animation.crossFade ?? 0.2;
          const additiveWanted = animation.blendMode === "additive";
          const effectiveClipName = additiveWanted && typeof runtime.ensureAdditiveClip === "function"
            ? runtime.ensureAdditiveClip(clipName, animation.additiveReference)
            : clipName;
          const mixer = runtime.mixer();
          if (animation.layer !== undefined) {
            // C-19 `animation.layer` — the clip joins a named layer; when the
            // clip changes the old layer action fades out over `crossFade`.
            mixer.stopLayer(animation.layer, fadeSeconds);
            state.baseAction = mixer.playLayer(animation.layer, effectiveClipName, {
              weight: animation.weight,
              blendMode: animation.blendMode,
              additive: additiveWanted,
              mask: animationMaskForRuntime(runtime, animation.mask)
            });
            if (fadeSeconds > 0) state.baseAction.fadeIn(fadeSeconds);
          } else {
            state.baseAction = mixer.crossFadeTo(effectiveClipName, fadeSeconds, {
              warp: animation.warp === true,
              transition: animation.transition,
              syncGroup: animation.syncGroup,
              additive: additiveWanted,
              weight: animation.weight
            });
          }
          if (animation.loop === false) {
            state.baseAction.setLoop("once", 1);
            state.baseAction.clampWhenFinished = true;
          }
          const startTime = animation.startTime;
          if (startTime !== undefined && Number.isFinite(startTime) && startTime > 0) {
            state.baseAction.time = Math.min(startTime, state.baseAction.clip.duration);
          }
          state.activeClip = clipName;
        }
        state.baseAction?.setEffectiveTimeScale(animation.speed ?? 1);
        const rawDt = state.lastTimeMs === undefined ? 0 : Math.max(0, (time - state.lastTimeMs) / 1000);
        state.lastTimeMs = time;
        const appScale = actorAnimationAppTimeScale?.() ?? 1;
        const scaledDt = rawDt * appScale * actorHandleTimeScale(runtimeNodes, (node.runtime as { readonly id?: string } | undefined)?.id);
        // Same modelMatrix install as the applyClips dispatch: pose
        // constraints (ik.add / lookAt) solve against world-space targets.
        runtime.setPoseConstraintModelMatrix?.(() => modelMatrix);
        runtime.applyPoseMixer(scaledDt, { label: clipName, restPoseReset: animation.restPoseReset ?? true });
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
 * T3.7 (PRD-06 §6.8) — folds a spec-level root-motion transform into the node's
 * model matrix for apply-mode `animation.rootMotion` on nodes with no mutable
 * runtime handle: `rootMotionYaw` rotates the basis about world Y at the node
 * origin, `rootMotionOffset` adds the accumulated world-space displacement.
 * Applied right after `createModelMatrix` so foot planting and draw see the
 * moved transform in the same frame.
 */
export function applySpecRootMotionTransform(entry: ProductionRuntimeActorEntry, modelMatrix: number[]): void {
  const yaw = entry.rootMotionYaw ?? 0;
  if (yaw !== 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const column of [0, 4, 8]) {
      const x = modelMatrix[column]!;
      const z = modelMatrix[column + 2]!;
      modelMatrix[column] = c * x + s * z;
      modelMatrix[column + 2] = -s * x + c * z;
    }
  }
  const offset = entry.rootMotionOffset;
  if (offset !== undefined) {
    modelMatrix[12] = modelMatrix[12]! + offset[0];
    modelMatrix[13] = modelMatrix[13]! + offset[1];
    modelMatrix[14] = modelMatrix[14]! + offset[2];
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

/* ------------------------------------------------------------------------ */
/* T0.19 (PRD-06) — C-38 `animation?: AuraCreateAppAnimationOptions`          */
/* resolution. Lane 15 owns the app-options seam; this is the pure resolver   */
/* it calls (`resolvePrd06Options(ctx, appOptions)`), mirroring the §5.2      */
/* precedence: options first, then flag/ctx defaults.                          */
/* ------------------------------------------------------------------------ */

/** Resolved PRD-06 app options: every member concrete after resolution. */
export interface Prd06ResolvedOptions {
  /** `animation.strict` (post-CCR-06-1) else the compile ctx strict mode. */
  readonly strict: boolean;
  /** Clip-authoring defaults era: `"3.1"` under `A3D_QR_ANIMATION`, `"3.0"` off. */
  readonly defaults: "3.0" | "3.1";
  /** `animation.mixer` else `A3D_QR_ANIMATION_POSE_MIXER` ("pose" on / "legacy" off). */
  readonly mixer: "pose" | "legacy";
  /** `animation.tier` else the compile ctx quality tier. */
  readonly tier: AuraQualityTier;
}

export function resolvePrd06Options(
  ctx: Pick<SceneCompileContext, "strict" | "quality" | "flags">,
  appOptions?: AuraCreateAppAnimationOptions
): Prd06ResolvedOptions {
  const flags = ctx.flags ?? qrAnimationFlags();
  return {
    strict: appOptions?.strict ?? ctx.strict,
    defaults: appOptions?.defaults ?? (flags.on("A3D_QR_ANIMATION") ? "3.1" : "3.0"),
    mixer: appOptions?.mixer ?? (flags.on("A3D_QR_ANIMATION_POSE_MIXER") ? "pose" : "legacy"),
    tier: appOptions?.tier ?? ctx.quality.tier
  };
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
