// PR 0b-3 carve-out (CONTRACTS.md §3.6) — verbatim move from TypedGLBActor.ts; 0 changed logic lines.
// File: packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts — owner lane 06.
//
// Contents: the lastApply collection (the five animation methods plus the morph apply), the
// evidence builder (:357-390 on the map), and the material/morph key handling helpers.
// `createTypedGLBActorAnimationTrack` is the seam factory: the method bodies are verbatim,
// with the `animation`/`actor` free variables turned into parameters.

import type { Material, RenderItem } from "@aura3d/rendering";
import type {
  GLTFSceneAnimationApplyResult,
  GLTFSceneAnimationMaterialSink,
  GLTFSceneAnimationRuntime,
  GLTFScenePose,
  ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";
import type { TypedGLBActor, TypedGLBActorEvidence, TypedGLBActorMorphApplyResult } from "../TypedGLBActor";

/**
 * Builds the `resolveAnimationMaterial` adapter for animation-pointer `material:*` tracks from
 * a loaded pipeline's material library. First material wins on duplicate names; the library
 * keeps names individually addressable, so pointer tracks always drive a deterministic sink.
 */
export function createGLBActorAnimationMaterialResolver(
  resources: { readonly materialLibrary?: ReadonlyMap<string, Material> | undefined }
): (name: string) => GLTFSceneAnimationMaterialSink | undefined {
  const byName = new Map<string, Material>();
  for (const material of resources.materialLibrary?.values() ?? []) {
    if (!byName.has(material.name)) byName.set(material.name, material);
  }
  return (name: string) => {
    const material = byName.get(name);
    if (!material) return undefined;
    return {
      name: material.name,
      setAnimationParameter: (parameter, value) => material.setParameter(parameter, value)
    };
  };
}

export interface TypedGLBActorAnimationTrack {
  readonly lastApply: GLTFSceneAnimationApplyResult | null;
  readonly lastMorphApply: TypedGLBActorMorphApplyResult | undefined;
  playClip(name: string, time: number): GLTFSceneAnimationApplyResult;
  playRootMotionClip(
    name: string,
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClip"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClip"]>;
  playRootMotionClips(
    samples: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[0],
    options: Parameters<GLTFSceneAnimationRuntime["applyRootMotionClips"]>[1]
  ): ReturnType<GLTFSceneAnimationRuntime["applyRootMotionClips"]>;
  applyRetargetedPose(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  playRetargetedClip(pose: GLTFScenePose, time?: number): GLTFSceneAnimationApplyResult;
  applyMorphTargets(weights: Readonly<Record<string, number>>): TypedGLBActorMorphApplyResult;
}

/** lastApply collection — the animation-driving methods, verbatim from the actor literal. */
export function createTypedGLBActorAnimationTrack(
  animation: GLTFSceneAnimationRuntime,
  actor: TypedGLBActor
): TypedGLBActorAnimationTrack {
  let lastApply: GLTFSceneAnimationApplyResult | null = null;
  let lastMorphApply: TypedGLBActorMorphApplyResult | undefined;
  return {
    get lastApply() { return lastApply; },
    get lastMorphApply() { return lastMorphApply; },
    playClip(name, time) {
      lastApply = animation.applyClipByName(name, time);
      return lastApply;
    },
    playRootMotionClip(name, motionOptions) {
      const result = animation.applyRootMotionClip(name, motionOptions);
      lastApply = result.applyResult;
      return result;
    },
    playRootMotionClips(samples, motionOptions) {
      const result = animation.applyRootMotionClips(samples, motionOptions);
      lastApply = result.applyResult;
      return result;
    },
    applyRetargetedPose(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-pose", time);
      return lastApply;
    },
    playRetargetedClip(pose, time = 0) {
      lastApply = animation.applyPose(pose, "retargeted-clip", time);
      return lastApply;
    },
    applyMorphTargets(weights) {
      lastMorphApply = applyTypedGLBActorMorphTargets(actor, weights);
      return lastMorphApply;
    }
  };
}

export function createTypedGLBActorEvidence(
  actor: TypedGLBActor,
  lastApply: GLTFSceneAnimationApplyResult | null = null,
  lastMorphApply?: TypedGLBActorMorphApplyResult
): TypedGLBActorEvidence {
  const snapshot = actor.animation.snapshot();
  const renderItems = actor.collectRenderItems();
  const morphTargetCount = actor.pipeline.asset.meshes.reduce((total, mesh) => total + mesh.morphTargets.length, 0);
  return {
    kind: "aura-typed-glb-actor-evidence",
    id: actor.id,
    name: actor.name,
    url: actor.asset.url,
    ...(actor.asset.hash ? { assetHash: actor.asset.hash } : {}),
    ...(typeof actor.asset.sizeBytes === "number" ? { assetSizeBytes: actor.asset.sizeBytes } : {}),
    ...(actor.asset.bounds ? { bounds: actor.asset.bounds } : {}),
    clips: snapshot.clips,
    skinningBindingCount: snapshot.skinningBindingCount,
    morphTargetCount,
    renderItemCount: renderItems.length,
    skinnedRenderItemCount: renderItems.filter((item) => item.skinning).length,
    morphRenderItemCount: renderItems.filter((item) => item.morphTargets && item.morphTargets.length > 0).length,
    lastClip: lastApply?.clipName ?? null,
    lastTracksApplied: lastApply?.tracksApplied ?? 0,
    lastTransformTracksApplied: lastApply?.transformTracksApplied ?? 0,
    lastMaterialTracksApplied: lastApply?.materialTracksApplied ?? 0,
    lastLightTracksApplied: lastApply?.lightTracksApplied ?? 0,
    lastFootPlantingGroundedFeet: lastApply?.footPlanting?.groundedFeet ?? 0,
    lastFootPlantingTargetError: lastApply?.footPlanting?.averageTargetError ?? 0,
    lastFootPlantingHipOffset: lastApply?.footPlanting?.hipOffset ?? 0,
    lastFootPlantingMissingLegs: lastApply?.footPlanting ? [...lastApply.footPlanting.missingLegNodes] : [],
    lastFootPlantingFeet: lastApply?.footPlanting?.feet,
    lastFootPlantingSurfaces: lastApply?.footPlanting?.surfaces,
    lastFootPlantingDeformation: lastApply?.footPlanting?.legDeformation,
    footPlantingConfigured: lastApply?.footPlanting !== undefined,
    lastSkinningPalettesUpdated: lastApply?.skinningPalettesUpdated ?? 0,
    ...(lastMorphApply ? { lastMorphApply } : {}),
    missingTargets: lastApply?.missingTargets ?? [],
    warnings: [
      ...(snapshot.skinningBindingCount < 1 ? ["No skinning bindings were detected for this typed GLB actor."] : []),
      ...(snapshot.clips.length < 1 ? ["No animation clips were detected for this typed GLB actor."] : []),
      ...(morphTargetCount < 1 ? ["No morph targets were detected for this typed GLB actor."] : [])
    ],
    ...(actor.staticConsolidation ? { staticConsolidation: actor.staticConsolidation } : {})
  };
}

function applyTypedGLBActorMorphTargets(
  actor: TypedGLBActor,
  weights: Readonly<Record<string, number>>
): TypedGLBActorMorphApplyResult {
  const requested = normalizeTypedGLBActorMorphWeights(weights);
  const requestedTargets = [...requested.keys()];
  const appliedTargets = new Set<string>();
  const activeWeights: Record<string, number> = {};
  const missingTargets = new Set<string>();
  let affectedRenderableCount = 0;
  let appliedWeightCount = 0;

  const meshesByName = new Map(actor.pipeline.asset.meshes.map((mesh) => [mesh.name, mesh]));
  for (const { renderable } of actor.pipeline.resources.scene.collectRenderables()) {
    const mesh = meshesByName.get(renderable.geometry);
    if (!mesh || mesh.morphTargets.length === 0) continue;
    const nextWeights = mesh.morphTargets.map((target, index) => {
      const aliases = typedGLBActorMorphTargetAliases(mesh.name, target.name, index);
      for (const alias of aliases) {
        const weight = requested.get(alias);
        if (weight !== undefined) {
          appliedTargets.add(alias);
          activeWeights[alias] = weight;
          return weight;
        }
      }
      return 0;
    });
    renderable.morphWeights = nextWeights;
    affectedRenderableCount += 1;
    appliedWeightCount += nextWeights.filter((weight) => Math.abs(weight) > 0.000001).length;
  }

  for (const target of requestedTargets) {
    if (!appliedTargets.has(target)) missingTargets.add(target);
  }

  return {
    requestedTargets,
    appliedTargets: [...appliedTargets],
    missingTargets: [...missingTargets],
    activeWeights,
    affectedRenderableCount,
    appliedWeightCount
  };
}

function normalizeTypedGLBActorMorphWeights(weights: Readonly<Record<string, number>>): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const [name, weight] of Object.entries(weights)) {
    const target = name.trim();
    if (!target) continue;
    normalized.set(target, clampTypedGLBActorMorphWeight(weight));
  }
  return normalized;
}

function clampTypedGLBActorMorphWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  return Math.min(1, Math.max(0, weight));
}

function typedGLBActorMorphTargetAliases(
  meshName: string,
  targetName: string | undefined,
  targetIndex: number
): readonly string[] {
  const fallback = `target-${targetIndex}`;
  const numberedFallback = `${meshName}-morph-${targetIndex + 1}`;
  const aliases = new Set<string>([fallback, numberedFallback, `${meshName}.${fallback}`, `${meshName}:${fallback}`]);
  if (targetName && targetName.trim().length > 0) {
    const trimmed = targetName.trim();
    aliases.add(trimmed);
    aliases.add(`${meshName}.${trimmed}`);
    aliases.add(`${meshName}:${trimmed}`);
  }
  return [...aliases];
}

/* ------------------------------------------------------------ T2.8 §9.7 */

/**
 * Shader warm-up (PRD-06 §9.7). The `prd06.animation` extension's `onLoad`
 * starts compiling the forward + depth (+ velocity) programs for every
 * skinned/morph render item and keeps them out of `collectRenderItems` until
 * the compile resolves — the first visible frame never pays a program-link
 * hitch (research/09's depth-recompile stall).
 *
 * The actor layer has no device, so the compile itself runs through a seam:
 * whoever owns the device installs a {@link Prd06ShaderWarmupCompiler} —
 * `installPrd06ShaderWarmup(device, flags)` in `lanes/prd06.ts` routes through
 * C-02 `ProgramCacheLike.precompile` (which is the C-28 stub semantics:
 * resolves after a synchronous compile; `device.compileAsync` real parallel
 * compile is the GPU/tiers lane's). With no compiler installed the warm-up is
 * a no-op and nothing is withheld.
 */

export type Prd06ShaderWarmupCompiler = (items: readonly RenderItem[]) => Promise<void> | void;

let activeShaderWarmupCompiler: Prd06ShaderWarmupCompiler | null = null;

export function setPrd06ShaderWarmupCompiler(compiler: Prd06ShaderWarmupCompiler | null): void {
  activeShaderWarmupCompiler = compiler;
}

export function prd06ShaderWarmupCompiler(): Prd06ShaderWarmupCompiler | null {
  return activeShaderWarmupCompiler;
}

interface Prd06ShaderWarmupState {
  pending: Promise<void>;
  ready: boolean;
}

const shaderWarmupByActor = new WeakMap<TypedGLBActor, Prd06ShaderWarmupState>();

/** Items whose programs the warm-up covers — the skinned/morph set. */
function prd06WarmupItem(item: RenderItem): boolean {
  return item.skinning !== undefined || item.morphWeights !== undefined;
}

/**
 * Begin the warm-up for `actor` over `items` (the load-time collect; the
 * extension resolves them through `collectTypedGLBActorRenderItems` so the
 * list is the raw set, not extension-transformed).
 */
export function beginPrd06ShaderWarmup(actor: TypedGLBActor, items: readonly RenderItem[]): void {
  const compiler = activeShaderWarmupCompiler;
  const warm = items.filter(prd06WarmupItem);
  const state: Prd06ShaderWarmupState = { pending: Promise.resolve(), ready: true };
  if (compiler && warm.length > 0) {
    state.ready = false;
    try {
      state.pending = Promise.resolve(compiler(warm)).then(() => {
        state.ready = true;
      });
    } catch (error) {
      state.pending = Promise.reject(error);
      // A synchronously-throwing compiler degrades to "no warm-up" rather than
      // withholding the actor's items forever — the next collect draws them.
      state.ready = true;
    }
  }
  shaderWarmupByActor.set(actor, state);
}

/**
 * Withhold the actor's skinned/morph items while the warm-up is unresolved.
 * Static items pass through immediately; when every compile has resolved (or
 * no compiler is installed) the actor's full set is returned as-is. A
 * synchronous-compile stub resolves on the first microtask, so at most one
 * presented frame is withheld.
 */
export function filterPrd06ShaderWarmupItems(actor: TypedGLBActor, items: readonly RenderItem[]): RenderItem[] {
  const state = shaderWarmupByActor.get(actor);
  if (!state || state.ready) return items as RenderItem[];
  return items.filter((item) => !prd06WarmupItem(item));
}

export function disposePrd06ShaderWarmup(actor: TypedGLBActor): void {
  shaderWarmupByActor.delete(actor);
}
