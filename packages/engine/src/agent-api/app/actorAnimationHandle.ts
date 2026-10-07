// Lane 06 (PRD-06 T0.1–T0.3) — actor-animation handle plumbing for the Quality
// Rebuild. CONTRACTS.md §3.2: `app/runtimeNodes.ts` is a PRD-15 file, so the
// empty-pose guard and the lane flag read live here; lane 15 wires the
// `setAnimationPose` call site through `setActorRuntimeAnimationPose` and the
// app's resolved flags through `setQrAnimationFlags` (qr-request filed). Until
// those land, `dispatchActorAnimation` in `compiler/animation.ts` enforces the
// same rejection on the render side, and flags resolve from URL/env per §5.2.

import type { AnimationPose } from "@aura3d/animation";
import type { GLTFSceneAnimationApplyResult } from "@aura3d/assets/gltf-runtime";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { AuraRuntimeNodeAnimationBindingMetadata, AuraRuntimeNodeAnimationPoseBindingMetadata } from "../RuntimeNodeHandle.js";
import { StubActorAnimationApi, type AuraActorAnimationApi, type AuraActorAnimationStateSnapshot, type AuraAnimationDiagnostics, type AuraBoneSocket, type AuraResolvedClipInfo } from "../../contracts/animation.js";
import type { AuraRuntimeNodeHandle } from "../index.js";

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

/* ------------------------------------------------------------------------ */
/* T0.18 (PRD-06) — C-19 `animationState()` + the `socket()` bone lookup and   */
/* the C-31 `animation` diagnostics rows. The `prd06.animation` TypedGLBActor  */
/* extension publishes, per actor id, the runtime's last apply result and a   */
/* bone→world-matrix lookup; the handle-side api merges those with the        */
/* node's bound-clip samples. `bones?` per-bone samples stay with CCR-06-4 —  */
/* until then callers read bones through `socket(bone)`.                      */
/* ------------------------------------------------------------------------ */

/** Latest `apply*` result from the loaded actor's animation runtime. */
export type ActorAnimationApplySource = () => GLTFSceneAnimationApplyResult | null | undefined;

/** Bone name → the scene node's current world matrix (a fresh copy each call). */
export type ActorBoneMatrixSource = (bone: string) => readonly number[] | Float32Array | null | undefined;

const actorAnimationApplySources = new Map<string, ActorAnimationApplySource>();
const actorBoneMatrixSources = new Map<string, ActorBoneMatrixSource>();

function registerSource<T>(map: Map<string, T>, actorId: string, source: T): () => void {
  map.set(actorId, source);
  return () => {
    if (map.get(actorId) === source) map.delete(actorId);
  };
}

/** Registered from the `prd06.animation` actor extension's `onLoad`. */
export function registerActorAnimationApplySource(actorId: string, source: ActorAnimationApplySource): () => void {
  return registerSource(actorAnimationApplySources, actorId, source);
}

/** Registered from the `prd06.animation` actor extension's `onLoad`. */
export function registerActorBoneMatrixSource(actorId: string, source: ActorBoneMatrixSource): () => void {
  return registerSource(actorBoneMatrixSources, actorId, source);
}

/** Test seam: drop every state source between specs. */
export function resetActorAnimationStateSources(): void {
  actorAnimationApplySources.clear();
  actorBoneMatrixSources.clear();
}

/**
 * C-31 `animation` section collect (T0.18): one row per actor with a published
 * apply source. Fields the runtime does not yet instrument — mixerMs,
 * constraintsMs, springsMs, paletteBytes, cpuMs — report 0 and stay listed in
 * `diagnosticOnly.prd06.ts` until Phase 1+ wires them.
 */
export function collectPrd06AnimationDiagnostics(): AuraAnimationDiagnostics {
  const actors = [...actorAnimationApplySources.entries()].map(([id, source]) => {
    const apply = source() ?? null;
    return {
      id,
      activeClip: apply?.clipName ?? null,
      tracksApplied: apply?.tracksApplied ?? 0,
      activeActions: apply?.blendedClipCount ?? (apply ? 1 : 0),
      mixerMs: 0,
      constraintsMs: 0,
      springsMs: 0,
      paletteBytes: 0,
      morphActive: apply?.morphWeightTracksApplied ?? 0,
      morphDropped: apply?.missingTargets.length ?? 0,
      cpuMs: 0
    };
  });
  return { actors };
}

interface RuntimeNodeHandleAnimationSnapshot {
  readonly animation?: { readonly clip?: string };
  readonly animationBinding?: AuraRuntimeNodeAnimationBindingMetadata & {
    readonly clipSamples?: readonly {
      readonly clipName: string;
      readonly localTime: number;
      readonly weight: number;
      readonly layer?: string;
    }[];
  };
}

/**
 * The `prd06.animation` C-37 extension's `create` factory. Everything besides
 * `resolveAnimationClips`, `animationState` and `socket` keeps the PR 0a stub
 * semantics until T1.x.
 */
export function createPrd06ActorAnimationApi(handle: AuraRuntimeNodeHandle): AuraActorAnimationApi {
  return new (class extends StubActorAnimationApi {
    constructor() {
      super(handle);
    }
    override resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]> {
      if (handle.kind !== "model") {
        return Promise.resolve([]);
      }
      return resolveAnimationClipsForNode(handle.id);
    }
    override animationState(): AuraActorAnimationStateSnapshot | undefined {
      if (handle.kind !== "model") return undefined;
      const snapshot = handle.snapshot() as RuntimeNodeHandleAnimationSnapshot | undefined;
      const binding = snapshot?.animationBinding;
      const lastApply = actorAnimationApplySources.get(handle.id)?.() ?? null;
      const activeActions = (binding?.clipSamples ?? []).map((sample) => ({
        clip: sample.clipName,
        layer: sample.layer ?? "base",
        weight: sample.weight,
        time: sample.localTime
      }));
      const activeClip = lastApply?.clipName ?? binding?.activeClipId ?? snapshot?.animation?.clip ?? null;
      if (activeClip === null && activeActions.length === 0 && lastApply === null) return undefined;
      return {
        activeClip,
        tracksApplied: lastApply?.tracksApplied ?? 0,
        activeActions,
        timeScale: binding?.speed ?? 1
      };
    }
    override socket(bone: string): AuraBoneSocket {
      const matrix = (): Float32Array | null => {
        const value = actorBoneMatrixSources.get(handle.id)?.(bone);
        return value ? Float32Array.from(value).subarray(0, 16) : null;
      };
      return {
        bone,
        worldMatrix: (out?: Float32Array) => {
          const current = matrix();
          if (!current) return out ?? new Float32Array(16);
          if (out) {
            out.set(current);
            return out;
          }
          return current;
        },
        get valid() {
          return matrix() !== null;
        }
      };
    }
  })();
}

/** Test seam: drop every resolver/waiter between specs. */
export function resetActorClipInfoSources(): void {
  actorClipInfoSources.clear();
  actorClipInfoWaiters.clear();
}
