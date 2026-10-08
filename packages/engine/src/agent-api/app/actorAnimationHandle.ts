// Lane 06 (PRD-06 T0.1–T0.3) — actor-animation handle plumbing for the Quality
// Rebuild. CONTRACTS.md §3.2: `app/runtimeNodes.ts` is a PRD-15 file, so the
// empty-pose guard and the lane flag read live here; lane 15 wires the
// `setAnimationPose` call site through `setActorRuntimeAnimationPose` and the
// app's resolved flags through `setQrAnimationFlags` (qr-request filed). Until
// those land, `dispatchActorAnimation` in `compiler/animation.ts` enforces the
// same rejection on the render side, and flags resolve from URL/env per §5.2.

import type { AnimationPose } from "@aura3d/animation";
import {
  addPrd06ActorConstraint,
  addPrd06ActorSpringBones,
  clearPrd06ActorConstraints,
  clearPrd06ActorSpringBones,
  type Prd06ConstraintSpec,
  type Prd06SpringBonesSpec
} from "../../production-runtime/actor/TypedGLBActorAnimation.js";
import { createBoneMask, type AuraHumanoidBoneMap } from "@aura3d/animation/lanes";
import type { GLTFSceneAnimationApplyResult } from "@aura3d/assets/gltf-runtime";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { AuraRuntimeNodeAnimationBindingMetadata, AuraRuntimeNodeAnimationPoseBindingMetadata } from "../RuntimeNodeHandle.js";
import {
  StubActorAnimationApi,
  type AuraActorAnimationApi,
  type AuraActorAnimationStateSnapshot,
  type AuraAnimationDiagnostics,
  type AuraBoneMaskSpec,
  type AuraBoneSocket,
  type AuraResolvedClipInfo
} from "../../contracts/animation.js";
import type { AuraApp, AuraRuntimeNodeHandle } from "../index.js";
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

/** T3.6 — C-19 code, warn-once per (nodeId, bone) when the actor is loaded. */
export const ANIMATION_SOCKET_UNKNOWN_BONE = "ANIMATION_SOCKET_UNKNOWN_BONE";
const socketUnknownBoneWarned = new Set<string>();

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
  socketUnknownBoneWarned.clear();
}

/**
 * C-31 `animation` section collect (T0.18): one row per actor with a published
 * apply source. `phaseTimings` (PRD-06 §9.8) flows from the pose paths —
 * `applyClips`/`applyPoseMixer` instrument mixer, constraint, spring, palette
 * and whole-call cpuMs; legacy applies report 0.
 */
export function collectPrd06AnimationDiagnostics(): AuraAnimationDiagnostics {
  const actors = [...actorAnimationApplySources.entries()].map(([id, source]) => {
    const apply = source() ?? null;
    const timings = apply?.phaseTimings;
    return {
      id,
      activeClip: apply?.clipName ?? null,
      tracksApplied: apply?.tracksApplied ?? 0,
      activeActions: apply?.blendedClipCount ?? (apply ? 1 : 0),
      mixerMs: timings?.mixerMs ?? 0,
      constraintsMs: timings?.constraintsMs ?? 0,
      springsMs: timings?.springsMs ?? 0,
      paletteBytes: timings?.paletteBytes ?? 0,
      morphActive: apply?.morphWeightTracksApplied ?? 0,
      morphDropped: apply?.missingTargets.length ?? 0,
      cpuMs: timings?.cpuMs ?? 0
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
 * T1.10 (PRD-06 §10, C-19/C-37) — loaded actors keyed by node/handle id so the
 * `prd06.animation` handle extension can drive the per-actor `PoseMixer`.
 * The `prd06.animation` actor extension (lanes/prd06.ts) publishes on load and
 * unpublishes on dispose. T0.18's apply/bone-matrix source registries (above)
 * feed `animationState()`/`socket()` reads on the same api.
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
  constructor(
    private readonly nodeId: string,
    private readonly nodeHandle: AuraRuntimeNodeHandle,
    private readonly app: AuraApp | undefined
  ) {
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
    if (mixer === undefined) {
      // T0.18's pre-mixer snapshot: binding clipSamples + the actor's lastApply.
      if (this.nodeHandle.kind !== "model") return undefined;
      if (typeof this.nodeHandle.snapshot !== "function") return super.animationState();
      const snapshot = this.nodeHandle.snapshot() as RuntimeNodeHandleAnimationSnapshot | undefined;
      const binding = snapshot?.animationBinding;
      const lastApply = actorAnimationApplySources.get(this.nodeId)?.() ?? null;
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
    const runtime = this.actor!.animation;
    const lastApply = typeof runtime.snapshot === "function" ? runtime.snapshot().lastApply : undefined;
    const base = mixer.baseAction();
    // T4.2 — `applyClips` bindings (characterAnimation) drive the pose
    // pipeline without registering mixer actions; report the published
    // clipSamples so the snapshot still describes what's playing.
    const mixerActions = mixer.activeActionEntries().map(({ action, layer }) => ({
      clip: authoredClipName(action.clipName),
      layer,
      weight: action.effectiveWeight,
      time: action.time
    }));
    let bindingSamples: { clip: string; layer: string; weight: number; time: number }[] = [];
    if (mixerActions.length === 0 && typeof this.nodeHandle.snapshot === "function") {
      const snapshot = this.nodeHandle.snapshot() as RuntimeNodeHandleAnimationSnapshot | undefined;
      bindingSamples = (snapshot?.animationBinding?.clipSamples ?? []).map((sample) => ({
        clip: sample.clipName,
        layer: sample.layer ?? "base",
        weight: sample.weight,
        time: sample.localTime
      }));
    }
    const activeActions = mixerActions.length > 0 ? mixerActions : bindingSamples;
    return {
      activeClip: base === null ? (lastApply?.clipName ?? null) : authoredClipName(base.clipName),
      tracksApplied: (lastApply?.transformTracksApplied ?? 0) + (lastApply?.morphWeightTracksApplied ?? 0),
      activeActions,
      timeScale: base?.timeScale ?? 1
    };
  }

  /**
   * T3.5 (PRD-06 §7.1, CCR-06-4) — `node.animation.ik`. `add` registers a
   * pose-space constraint evaluated post-mixer/pre-palette on the actor's
   * runtime and returns a disposer removing exactly that constraint;
   * `clear()` empties the list. Degrades to the no-op stub while the flag is
   * off or the actor is not loaded.
   */
  override readonly ik = {
    add: (spec: unknown): (() => void) => {
      const actor = this.actor;
      if (!qrAnimationFlags().on("A3D_QR_ANIMATION") || actor === undefined || actor.animation === undefined) {
        return () => { /* stub no-op */ };
      }
      return addPrd06ActorConstraint(actor, spec as Prd06ConstraintSpec, (ref) =>
        prd06ConstraintTargetPosition(actor, ref, this.app)
      );
    },
    clear: (): void => {
      const actor = this.actor;
      if (actor === undefined) return;
      clearPrd06ActorConstraints(actor);
    }
  };

  /**
   * T4.1 (PRD-06 §7.1, C-19) — `node.animation.springBones`. `add` compiles a
   * chain spec into a pose constraint that integrates at a fixed substep rate
   * after the mixer/IK constraints and aims each bone at its simulated child;
   * `clear()` removes this actor's spring registrations only. Degrades to the
   * no-op stub while the flag is off or the actor is not loaded.
   */
  override readonly springBones = {
    add: (spec: unknown): (() => void) => {
      const actor = this.actor;
      if (!qrAnimationFlags().on("A3D_QR_ANIMATION") || actor === undefined || actor.animation === undefined) {
        return () => { /* stub no-op */ };
      }
      return addPrd06ActorSpringBones(actor, spec as Prd06SpringBonesSpec);
    },
    clear: (): void => {
      const actor = this.actor;
      if (actor === undefined) return;
      clearPrd06ActorSpringBones(actor);
    }
  };

  /**
   * T3.8 (PRD-06 §7.2) — `node.animation.addClipsFrom(source)`: retarget-bake a
   * source skeleton's compiled clips onto this actor's skeleton (worker +
   * IndexedDB cache inside the runtime) and register them by clip name.
   * Resolves `[]` while the flag is off or the actor/runtime is not loaded.
   */
  override addClipsFrom(
    source: unknown,
    options?: { map?: unknown; hipsScale?: "leg-length" | number; fingers?: boolean }
  ): Promise<readonly string[]> {
    const actor = this.actor;
    const runtime = actor?.animation;
    if (!qrAnimationFlags().on("A3D_QR_ANIMATION") || runtime === undefined || typeof runtime.addClipsFrom !== "function") {
      return Promise.resolve([]);
    }
    return runtime.addClipsFrom(source as Parameters<typeof runtime.addClipsFrom>[0], {
      ...(options?.map !== undefined ? { map: options.map as AuraHumanoidBoneMap } : {}),
      ...(options?.hipsScale !== undefined ? { hipsScale: options.hipsScale } : {}),
      ...(options?.fingers !== undefined ? { fingers: options.fingers } : {})
    });
  }

  override socket(bone: string): AuraBoneSocket {
    // T0.18 — live `transform.worldMatrix` reads through the actor extension's
    // bone-matrix source (lanes/prd06.ts); `valid: false` until it loads.
    const matrix = (): Float32Array | null => {
      const value = actorBoneMatrixSources.get(this.nodeId)?.(bone);
      return value ? Float32Array.from(value).subarray(0, 16) : null;
    };
    // T3.6 — `valid: false` + `ANIMATION_SOCKET_UNKNOWN_BONE` once per
    // (node, bone), and only after the actor is loaded (pre-load calls stay
    // silent — the bone cannot be judged unknown yet).
    const warnUnknownOnce = (): void => {
      if (this.actor === undefined) return;
      const key = `${this.nodeId}:${bone}`;
      if (socketUnknownBoneWarned.has(key)) return;
      socketUnknownBoneWarned.add(key);
      if (typeof console !== "undefined") {
        console.warn(`${ANIMATION_SOCKET_UNKNOWN_BONE}: node "${this.nodeId}" has no bone "${bone}".`);
      }
    };
    const probe = (): Float32Array | null => {
      const current = matrix();
      if (current === null) warnUnknownOnce();
      return current;
    };
    return {
      bone,
      worldMatrix: (out?: Float32Array) => {
        const current = probe();
        if (!current) return out ?? new Float32Array(16);
        if (out) {
          out.set(current);
          return out;
        }
        return current;
      },
      get valid() {
        return probe() !== null;
      }
    };
  }
}

/**
 * T3.5 — resolve a constraint's non-literal target to a world position:
 * - `{ socket: bone }` → the live bone world matrix's translation column.
 * - `string` → a scene node id-or-name's world translation.
 */
function prd06ConstraintTargetPosition(
  actor: TypedGLBActor,
  ref: string | { readonly socket: string },
  app: AuraApp | undefined
): readonly [number, number, number] | null {
  if (typeof ref !== "string") {
    const matrix = actorBoneMatrixSources.get(actor.id)?.(ref.socket) ?? null;
    return matrix === null ? null : [matrix[12]!, matrix[13]!, matrix[14]!];
  }
  // App-level runtime nodes first: constraint targets live outside the
  // actor's GLB scene graph (e.g. a scripted look-target primitive), so the
  // registry — not `scene.traverse` — is where a name/id resolves.
  if (app !== undefined) {
    for (const handle of app.nodes.all()) {
      if (handle.id === ref || handle.name === ref) {
        return [handle.position[0], handle.position[1], handle.position[2]];
      }
    }
  }
  // Fallback: node names inside the actor's own glTF scene (target a mesh
  // or empties embedded in the model).
  let found: readonly [number, number, number] | null = null;
  actor.pipeline.resources.scene.traverse((node) => {
    if (found !== null) return;
    if (node.id === ref || node.name === ref) {
      const m = node.transform.worldMatrix;
      found = [m[12]!, m[13]!, m[14]!];
    }
  });
  return found;
}

/**
 * The `prd06.animation` C-37 extension's `create` factory.
 */
export function createPrd06ActorAnimationApi(handle: AuraRuntimeNodeHandle, app?: AuraApp): AuraActorAnimationApi {
  return new Prd06ActorAnimationApi(handle.id, handle, app);
}

/** Test seam: drop every resolver/waiter/actor between specs. */
export function resetActorClipInfoSources(): void {
  actorClipInfoSources.clear();
  actorClipInfoWaiters.clear();
  prd06AnimationActors.clear();
}
