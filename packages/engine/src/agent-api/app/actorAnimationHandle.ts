// Lane 06 (PRD-06 T0.1–T0.3) — actor-animation handle plumbing for the Quality
// Rebuild. CONTRACTS.md §3.2: `app/runtimeNodes.ts` is a PRD-15 file, so the
// empty-pose guard and the lane flag read live here; lane 15 wires the
// `setAnimationPose` call site through `setActorRuntimeAnimationPose` and the
// app's resolved flags through `setQrAnimationFlags` (qr-request filed). Until
// those land, `dispatchActorAnimation` in `compiler/animation.ts` enforces the
// same rejection on the render side, and flags resolve from URL/env per §5.2.

import type { AnimationPose } from "@aura3d/animation";
import { createBoneMask } from "@aura3d/animation/lanes";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { AuraRuntimeNodeAnimationPoseBindingMetadata } from "../RuntimeNodeHandle.js";
import {
  StubActorAnimationApi,
  type AuraActorAnimationApi,
  type AuraActorAnimationStateSnapshot,
  type AuraBoneMaskSpec,
  type AuraBoneSocket,
  type AuraResolvedClipInfo
} from "../../contracts/animation.js";
import type { AuraRuntimeNodeHandle } from "../index.js";
import type { TypedGLBActor } from "../../production-runtime/TypedGLBActor.js";

let overrideQrAnimationFlags: QrFlags | undefined;
let lazyQrAnimationFlags: QrFlags | undefined;

const EMPTY_QR_FLAGS: QrFlags = { values: {}, on: () => false };

/**
 * Install the app's resolved flags (CONTRACTS.md §5.2 source 1). Called by the
 * app-side wiring (PRD-15 seam) once it exists, and by tests. `undefined`
 * restores the lazy URL/env resolution.
 */
export function setQrAnimationFlags(flags: QrFlags | undefined): void {
  overrideQrAnimationFlags = flags;
}

/** Reset both the installed flags and the lazily resolved cache (tests). */
export function resetQrAnimationFlags(): void {
  overrideQrAnimationFlags = undefined;
  lazyQrAnimationFlags = undefined;
}

/**
 * Lane-06 flag read: the app's resolved flags when installed, else URL
 * `?a3d-qr=` then the `A3D_QR`/`A3D_QR_ANIMATION` environment — sources 3–4 of
 * the §5.2 chain, the highest sources reachable without the app seam.
 */
export function qrAnimationFlags(): QrFlags {
  if (overrideQrAnimationFlags) return overrideQrAnimationFlags;
  lazyQrAnimationFlags ??= resolveQrFlags({
    url: typeof location !== "undefined" ? location.href : undefined,
    env: typeof process !== "undefined" ? process.env : undefined
  });
  return lazyQrAnimationFlags;
}

/** Warning code emitted through `runtimeWarnings` for a rejected empty pose (T0.2). */
export const ANIMATION_EMPTY_POSE = "ANIMATION_EMPTY_POSE";

function nonEmptyRecord(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length > 0;
}

/**
 * T0.2 — a pose with zero bones and zero morph targets can never move a rig,
 * but while stored it suppresses clip playback entirely (E1/E2). Returns the
 * pose unchanged when it carries at least one bone or one morph weight, else
 * `undefined`. A morph-only pose is still a real pose. Pure: no cloning, no
 * side effects, no flag read — callers decide when the guard applies.
 */
export function rejectEmptyAnimationPose(pose: AnimationPose | undefined | null): AnimationPose | undefined {
  if (pose === null || pose === undefined || typeof pose !== "object") return undefined;
  const bones = (pose as { readonly bones?: unknown }).bones;
  const morphTargets = (pose as { readonly morphTargets?: unknown }).morphTargets;
  return nonEmptyRecord(bones) || nonEmptyRecord(morphTargets) ? pose : undefined;
}

// Warn-once-per-node bookkeeping for rejected poses (T0.2). `emptyPoseWarned`
// is the dedup set; `emptyPosePending` holds rejections not yet consumed by a
// render pass, which `dispatchActorAnimation` drains into `runtimeWarnings`.
const emptyPoseWarned = new Set<string>();
const emptyPosePending = new Set<string>();

/**
 * True (once) when {@link setActorRuntimeAnimationPose} rejected an empty pose
 * for this node since the last render pass consumed it. Dispatch checks this so
 * the `ANIMATION_EMPTY_POSE` warning lands in `runtimeWarnings` — the channel
 * callers and the C-36 degradation report read.
 */
export function consumePendingEmptyPoseRejection(nodeId: string | undefined): boolean {
  if (nodeId === undefined || !emptyPosePending.has(nodeId)) return false;
  emptyPosePending.delete(nodeId);
  return true;
}

/** Test seam: clears warn-once state between runs. */
export function resetEmptyPoseRejections(): void {
  emptyPoseWarned.clear();
  emptyPosePending.clear();
}

export interface RuntimeAnimationPoseHandleLike {
  setAnimationPose(pose: AnimationPose | undefined, metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata): unknown;
}

export interface SetActorRuntimeAnimationPoseOptions {
  /** Runtime node id — keys the warn-once `ANIMATION_EMPTY_POSE` report. */
  readonly nodeId?: string;
  /** Strict mode (C-19 `animation.strict`, else `A3D_QR_STRICT`): throws instead of clearing. */
  readonly strict?: boolean;
  /**
   * C-36 degradation hook (PRD-15 `ctx.degrade` seam): invoked once per node
   * with `pose-apply-failed` semantics when a pose is rejected non-strictly.
   */
  readonly onRejected?: (nodeId: string | undefined) => void;
}

/**
 * T0.2 interim guard for the runtime-node pose path. With `A3D_QR_ANIMATION`
 * off it stores the pose verbatim — byte-identical to today's `setAnimationPose`.
 * With it on, a zero-bone/zero-morph pose is rejected: stores `undefined`
 * (clearing any previously bound pose so clip playback resumes), records the
 * once-per-node `ANIMATION_EMPTY_POSE` warning for the next render pass, calls
 * `onRejected` (the C-36 `pose-apply-failed` degradation seam), and throws
 * `ANIMATION_EMPTY_POSE` under strict. Returns whether a pose was stored.
 */
export function setActorRuntimeAnimationPose(
  handle: RuntimeAnimationPoseHandleLike,
  pose: AnimationPose | undefined,
  metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata,
  options: SetActorRuntimeAnimationPoseOptions = {}
): boolean {
  if (!qrAnimationFlags().on("A3D_QR_ANIMATION")) {
    handle.setAnimationPose(pose, metadata);
    return true;
  }
  const accepted = rejectEmptyAnimationPose(pose);
  if (accepted !== undefined || pose === undefined || pose === null) {
    handle.setAnimationPose(accepted, accepted ? metadata : undefined);
    return accepted !== undefined;
  }
  const strict = options.strict ?? qrAnimationFlags().on("A3D_QR_STRICT");
  if (strict) {
    const error = new Error(`ANIMATION_EMPTY_POSE: runtime node "${options.nodeId ?? "unknown"}" rejected an animation pose with 0 bones and 0 morph targets.`);
    error.name = ANIMATION_EMPTY_POSE;
    throw error;
  }
  handle.setAnimationPose(undefined, undefined);
  if (options.nodeId !== undefined && !emptyPoseWarned.has(options.nodeId)) {
    emptyPoseWarned.add(options.nodeId);
    emptyPosePending.add(options.nodeId);
    options.onRejected?.(options.nodeId);
  }
  return false;
}

/** Test seam for flag states that never reach the app (empty overrides). */
export const QR_EMPTY_FLAGS: QrFlags = EMPTY_QR_FLAGS;

/* ------------------------------------------------------------------------ */
/* T0.6 (PRD-06) — the `prd06.animation` node-handle extension's               */
/* `resolveAnimationClips()`. The lane's TypedGLBActor extension publishes a   */
/* clip-info source per actor id (== the runtime node id) at load; bindings    */
/* resolve once the source lands, and `[]` for non-model nodes.               */
/* ------------------------------------------------------------------------ */

export type ActorClipInfoSource = () => readonly AuraResolvedClipInfo[];

interface ActorClipInfoWaiter {
  readonly resolve: (infos: readonly AuraResolvedClipInfo[]) => void;
  readonly reject: (error: unknown) => void;
}

const actorClipInfoSources = new Map<string, ActorClipInfoSource>();
const actorClipInfoWaiters = new Map<string, ActorClipInfoWaiter[]>();

/**
 * Called by the `prd06.animation` TypedGLBActor extension's `onLoad`
 * (`packages/engine/src/lanes/prd06.ts`) with the loaded actor's clip source.
 * Returns the disposer invoked from the extension's `dispose`.
 */
export function registerActorClipInfoSource(actorId: string, source: ActorClipInfoSource): () => void {
  actorClipInfoSources.set(actorId, source);
  const waiters = actorClipInfoWaiters.get(actorId);
  if (waiters) {
    actorClipInfoWaiters.delete(actorId);
    let infos: readonly AuraResolvedClipInfo[] = [];
    let error: unknown;
    try {
      infos = source();
    } catch (caught) {
      error = caught;
    }
    for (const waiter of waiters) {
      if (error !== undefined) waiter.reject(error);
      else waiter.resolve(infos);
    }
  }
  return () => {
    if (actorClipInfoSources.get(actorId) === source) {
      actorClipInfoSources.delete(actorId);
    }
  };
}

/** Resolves the loaded actor's clip infos; stays pending until it loads. */
export function resolveAnimationClipsForNode(nodeId: string): Promise<readonly AuraResolvedClipInfo[]> {
  const source = actorClipInfoSources.get(nodeId);
  if (source) {
    try {
      return Promise.resolve(source());
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return new Promise<readonly AuraResolvedClipInfo[]>((resolve, reject) => {
    const list = actorClipInfoWaiters.get(nodeId) ?? [];
    list.push({ resolve, reject });
    actorClipInfoWaiters.set(nodeId, list);
  });
}

/**
 * T1.10 (PRD-06 §10, C-19/C-37) — loaded actors keyed by node/handle id so the
 * `prd06.animation` handle extension can drive the per-actor `PoseMixer`.
 * The `prd06.animation` actor extension (lanes/prd06.ts) publishes on load and
 * unpublishes on dispose.
 */
const prd06AnimationActors = new Map<string, TypedGLBActor>();

export function registerPrd06AnimationActor(actor: TypedGLBActor): () => void {
  prd06AnimationActors.set(actor.id, actor);
  return () => {
    prd06AnimationActors.delete(actor.id);
  };
}

/** The mixer's synthesized additive key reports back as the authored clip name. */
const authoredClipName = (clipName: string): string => clipName.split("#additive:")[0]!;

/**
 * C-37 `prd06.animation` api: `resolveAnimationClips` (T0.9) plus the T1.10
 * mixer members — `crossFadeTo`/`playLayer`/`stopLayer`/`animationState`. Every
 * member degrades to the PR 0a stub when the lane flag is off, the actor has
 * not loaded, or the runtime predates the PoseMixer path.
 */
class Prd06ActorAnimationApi extends StubActorAnimationApi {
  constructor(private readonly nodeId: string, private readonly nodeHandle: AuraRuntimeNodeHandle) {
    super(nodeHandle);
  }

  private get actor(): TypedGLBActor | undefined {
    return prd06AnimationActors.get(this.nodeId);
  }

  private mixer() {
    if (!qrAnimationFlags().on("A3D_QR_ANIMATION")) return undefined;
    const runtime = this.actor?.animation;
    return runtime !== undefined && typeof runtime.mixer === "function" ? runtime.mixer() : undefined;
  }

  override crossFadeTo(clip: string, seconds: number, options?: { transition?: "crossfade" | "inertialize"; warp?: boolean }): this {
    const mixer = this.mixer();
    if (mixer === undefined) return super.crossFadeTo(clip, seconds, options);
    mixer.crossFadeTo(clip, seconds, {
      transition: options?.transition,
      warp: options?.warp === true
    });
    return this;
  }

  override playLayer(
    layer: string,
    clip: string,
    options?: { weight?: number; fadeIn?: number; mask?: AuraBoneMaskSpec; blendMode?: "override" | "additive" }
  ): this {
    const mixer = this.mixer();
    if (mixer === undefined) return super.playLayer(layer, clip, options);
    const runtime = this.actor!.animation;
    const mask = options?.mask !== undefined && typeof runtime.skeletonJointNames === "function"
      ? createBoneMask(options.mask, { jointNames: runtime.skeletonJointNames() })
      : undefined;
    const additiveWanted = options?.blendMode === "additive";
    const clipName = additiveWanted && typeof runtime.ensureAdditiveClip === "function"
      ? runtime.ensureAdditiveClip(clip)
      : clip;
    const action = mixer.playLayer(layer, clipName, {
      weight: options?.weight,
      blendMode: options?.blendMode,
      additive: additiveWanted,
      mask
    });
    if (options?.fadeIn !== undefined && options.fadeIn > 0) action.fadeIn(options.fadeIn);
    return this;
  }

  override stopLayer(layer: string, fadeOut?: number): this {
    const mixer = this.mixer();
    if (mixer === undefined) return super.stopLayer(layer, fadeOut);
    mixer.stopLayer(layer, fadeOut ?? 0);
    return this;
  }

  override resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]> {
    if (this.nodeHandle.kind !== "model") {
      return Promise.resolve([]);
    }
    return resolveAnimationClipsForNode(this.nodeId);
  }

  override animationState(): AuraActorAnimationStateSnapshot | undefined {
    const mixer = this.mixer();
    if (mixer === undefined) return super.animationState();
    const runtime = this.actor!.animation;
    const lastApply = typeof runtime.snapshot === "function" ? runtime.snapshot().lastApply : undefined;
    const base = mixer.baseAction();
    return {
      activeClip: base === null ? null : authoredClipName(base.clipName),
      tracksApplied: (lastApply?.transformTracksApplied ?? 0) + (lastApply?.morphWeightTracksApplied ?? 0),
      activeActions: mixer.activeActionEntries().map(({ action, layer }) => ({
        clip: authoredClipName(action.clipName),
        layer,
        weight: action.effectiveWeight,
        time: action.time
      })),
      timeScale: base?.timeScale ?? 1
    };
  }

  override socket(bone: string): AuraBoneSocket {
    return super.socket(bone);
  }
}

/**
 * The `prd06.animation` C-37 extension's `create` factory.
 */
export function createPrd06ActorAnimationApi(handle: AuraRuntimeNodeHandle): AuraActorAnimationApi {
  return new Prd06ActorAnimationApi(handle.id, handle);
}

/** Test seam: drop every resolver/waiter/actor between specs. */
export function resetActorClipInfoSources(): void {
  actorClipInfoSources.clear();
  actorClipInfoWaiters.clear();
  prd06AnimationActors.clear();
}
