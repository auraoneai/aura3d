/**
 * Lane prd06 barrel — owned by lane 06 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here.
 *
 * Registered so far (all flag-gated; inert while `A3D_QR_ANIMATION` is off):
 * - C-37 node-handle extension `animation` (T0.6): `resolveAnimationClips`
 *   resolves real GLB clip infos after the actor loads; every other C-19 member
 *   keeps PR 0a stub semantics until T0.18/T1.10.
 * - TypedGLBActor extension `prd06.animation` (T0.6): publishes the loaded
 *   actor's clip-info source (`entry.actor.animation.resolvedClipInfos()`) into
 *   the handle-side registry so pending bindings can resolve.
 * - T0.18 (from qr/prd06-animation-state): `animationState()`/`socket()`
 *   sources + the C-31 `prd06.animation-diagnostics` section; T0.19's
 *   diagnosticOnly + option-coverage rows.
 * - T1.11: installs the `A3D_QR_ANIMATION_POSE_MIXER` provider for the
 *   `@aura3d/animation` facade (AnimationMixer/AnimationController).
 */

import { registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
import { registerTypedGLBActorExtension } from "../production-runtime/actor/extensions.js";
import { releaseMorphScratchGeometry, releaseMorphTargetTexture, skinningPaletteCache, paletteKeyOf } from "@aura3d/rendering";
import type { RenderItem } from "@aura3d/rendering";
import { setPoseMixerBlendFlagProvider } from "@aura3d/animation/lanes";
import { registerDiagnosticsSection } from "../contracts/diagnostics.js";
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage } from "../contracts/compiler.js";
import type { TypedGLBActor } from "../production-runtime/TypedGLBActor.js";
import type { SceneNode } from "@aura3d/scene";
import {
  collectPrd06AnimationDiagnostics,
  createPrd06ActorAnimationApi,
  qrAnimationFlags,
  registerActorAnimationApplySource,
  registerActorBoneMatrixSource,
  registerActorClipInfoSource,
  registerPrd06AnimationActor
} from "../agent-api/app/actorAnimationHandle.js";
import { PRD06_DIAGNOSTIC_ONLY_FIELDS, PRD06_OPTION_COVERAGE } from "../agent-api/compiler/diagnosticOnly.prd06.js";
import { beginPrd06ShaderWarmup, disposePrd06ShaderWarmup, filterPrd06ShaderWarmupItems, setPrd06ShaderWarmupCompiler, type Prd06ShaderWarmupCompiler } from "../production-runtime/actor/TypedGLBActorAnimation.js";
import { createPrd06ProgramCacheWarmup, type Prd06ShaderWarmupOptions } from "@aura3d/rendering";
import { collectTypedGLBActorRenderItems } from "../production-runtime/TypedGLBActor.js";

// T1.11 (PRD-06 §10): `@aura3d/animation` cannot import the engine's flag
// machinery, so the lane installs the `A3D_QR_ANIMATION_POSE_MIXER` read here
// (sub-flag off = legacy blend math unchanged, even while `A3D_QR_ANIMATION`
// is on). The `animation.mixer: "pose"` app option composes into the same
// resolved flag upstream.
setPoseMixerBlendFlagProvider(() => qrAnimationFlags().on("A3D_QR_ANIMATION_POSE_MIXER"));

// T0.9a: `validateClipMap` ships for templates/games through the lane barrel
// (exported from `@aura3d/engine` via `lanes/index.js`).
export * from "../agent-api/GameCharacterAnimation.js";

// T0.19 — merge the lane's C-36 diagnostic-only record + option-coverage rows.
Object.assign(
  DIAGNOSTIC_ONLY_FIELDS as Record<string, { readonly reason: string; readonly ownerPrd: number }>,
  PRD06_DIAGNOSTIC_ONLY_FIELDS
);
registerOptionCoverage(PRD06_OPTION_COVERAGE);

// T0.18 — C-31 `animation` diagnostics section (the registry's `active(flags)`
// gate keeps it inert while `A3D_QR_ANIMATION` is off).
registerDiagnosticsSection({
  id: "prd06.animation-diagnostics",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  key: "animation",
  collect: () => collectPrd06AnimationDiagnostics()
});

registerNodeHandleExtension({
  id: "prd06.animation",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  member: "animation",
  appliesTo: ["model"],
  create: (handle, app) => createPrd06ActorAnimationApi(handle, app)
});

/**
 * T0.18 — the bone→world-matrix lookup behind `handle.animation.socket(bone)`:
 * snapshot the actor's scene nodes by name once, then read the live
 * `transform.worldMatrix` on each call (it re-writes every applied frame).
 */
function createActorBoneMatrixLookup(actor: TypedGLBActor): (bone: string) => Float32Array | null {
  const nodesByName = new Map<string, SceneNode>();
  actor.pipeline.resources.scene.traverse((node) => {
    if (node.name && !nodesByName.has(node.name)) nodesByName.set(node.name, node);
  });
  return (bone: string) => {
    const node = nodesByName.get(bone);
    return node ? Float32Array.from(node.transform.worldMatrix) : null;
  };
}

const actorClipInfoDisposers = new Map<string, () => void>();
const actorAnimationStateDisposers = new Map<string, (() => void)[]>();

registerTypedGLBActorExtension({
  id: "prd06.animation",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  onLoad: (actor, pipeline) => {
    actorClipInfoDisposers.set(
      actor.id,
      registerActorClipInfoSource(actor.id, () => actor.animation.resolvedClipInfos())
    );
    actorClipInfoDisposers.set(`${actor.id}:actor`, registerPrd06AnimationActor(actor));
    actorAnimationStateDisposers.set(actor.id, [
      registerActorAnimationApplySource(actor.id, () => actor.animation.snapshot().lastApply),
      registerActorBoneMatrixSource(actor.id, createActorBoneMatrixLookup(actor))
    ]);
    // T2.8 §9.7 — shader warm-up: precompile the skinned/morph programs and
    // withhold those items from collectRenderItems until linked.
    beginPrd06ShaderWarmup(actor, collectTypedGLBActorRenderItems(actor));
  },
  collectRenderItems: (actor, items) => filterPrd06ShaderWarmupItems(actor, items),
  dispose: (actor) => {
    disposePrd06ShaderWarmup(actor);
    // §16 S3 — actor teardown frees the C-18 palette textures its runtime
    // stamped plus the §8.2 morph array textures and CPU-morph scratch keyed
    // on each resolved render-item geometry (the lifecycle spec requires all
    // three counters to return to their pre-load values).
    actor.animation.dispose();
    for (const item of collectTypedGLBActorRenderItems(actor)) {
      releaseMorphTargetTexture(item.geometry);
      releaseMorphScratchGeometry(item.geometry);
    }
    for (const key of [actor.id, `${actor.id}:actor`]) {
      actorClipInfoDisposers.get(key)?.();
      actorClipInfoDisposers.delete(key);
    }
    for (const disposeSource of actorAnimationStateDisposers.get(actor.id) ?? []) disposeSource();
    actorAnimationStateDisposers.delete(actor.id);
  }
});

/* ------------------------------------------------------------ T2.5 §8.5 */

/**
 * C-14 velocity inputs (PRD-06 §8.5). `collectRenderItems` runs at the head of
 * each actor's render-item collection — after the previously presented
 * frame's passes. The palette cache's once-per-presented-frame rotation
 * (`beginFrame`: every key touched since the last call moves
 * `current`→`previous`) is owned by the present boundary —
 * `SkinningPaletteUploadManager.beginFrame()` in `ForwardPass.execute`.
 * Calling it per-actor here rotated N times per presented frame (once per
 * collect), overwriting `previous` with the just-uploaded `current` and
 * defeating the once-per-frame upload guard — so the extension only stamps.
 *
 * Items then carry the optional C-14 fields — inert until the post lane's
 * velocity pass is real:
 *   - `previousJointTexture` = the palette pair's `previous` texture (skinned
 *     items with a stamped `paletteKey` only)
 *   - `previousMorphWeights` = the item's weights as of the prior collect,
 *     snapshotted per-geometry (renderables reassign `morphWeights` each apply,
 *     so a Float32Array copy is the only stable previous-frame record)
 */
const previousMorphWeightsByGeometry = new WeakMap<RenderItem["geometry"], Float32Array>();

registerTypedGLBActorExtension({
  id: "prd06.velocity-inputs",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  collectRenderItems: (_actor, items) => {
    let stampedAll = items as RenderItem[];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      let stamped = item;
      const paletteKey = item.skinning ? paletteKeyOf(item.skinning) : null;
      if (item.skinning && paletteKey) {
        const palette = skinningPaletteCache.paletteUniformSet(paletteKey, item.skinning.jointCount);
        stamped = { ...stamped, previousJointTexture: palette.previous };
      }
      if (item.morphWeights && item.morphWeights.length > 0) {
        const previous = previousMorphWeightsByGeometry.get(item.geometry);
        if (previous) stamped = { ...stamped, previousMorphWeights: previous };
        previousMorphWeightsByGeometry.set(item.geometry, Float32Array.from(item.morphWeights));
      }
      if (stamped !== item) {
        if (stampedAll === items) stampedAll = items.slice();
        stampedAll[i] = stamped;
      }
    }
    return stampedAll;
  }
});

/* ------------------------------------------------------------ T2.8 §9.7 */

/**
 * T2.8 wiring: once a RenderDevice exists (app/bootstrap — lane-15's
 * createAuraApp owns the real call site), install the device-side half of the
 * warm-up seam: `rendererProgramCache(device, flags).precompile` over each
 * warm item's forward + depth (+ velocity) feature records. A no-op until
 * called; `passes` lets the app add velocity when its TAA path is on.
 */
export function installPrd06ShaderWarmup(options: Prd06ShaderWarmupOptions): void {
  setPrd06ShaderWarmupCompiler(createPrd06ProgramCacheWarmup(options));
}

export type { Prd06ShaderWarmupCompiler };
export { setPrd06ShaderWarmupCompiler };
