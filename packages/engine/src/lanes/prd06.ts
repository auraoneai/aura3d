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
 */

import { registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
import { registerTypedGLBActorExtension } from "../production-runtime/actor/extensions.js";
import { registerDiagnosticsSection } from "../contracts/diagnostics.js";
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage } from "../contracts/compiler.js";
import type { TypedGLBActor } from "../production-runtime/TypedGLBActor.js";
import type { SceneNode } from "@aura3d/scene";
import {
  collectPrd06AnimationDiagnostics,
  createPrd06ActorAnimationApi,
  registerActorAnimationApplySource,
  registerActorBoneMatrixSource,
  registerActorClipInfoSource
} from "../agent-api/app/actorAnimationHandle.js";
import { PRD06_DIAGNOSTIC_ONLY_FIELDS, PRD06_OPTION_COVERAGE } from "../agent-api/compiler/diagnosticOnly.prd06.js";

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
  create: (handle) => createPrd06ActorAnimationApi(handle)
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
  onLoad: (actor) => {
    actorClipInfoDisposers.set(
      actor.id,
      registerActorClipInfoSource(actor.id, () => actor.animation.resolvedClipInfos())
    );
    actorAnimationStateDisposers.set(actor.id, [
      registerActorAnimationApplySource(actor.id, () => actor.animation.snapshot().lastApply),
      registerActorBoneMatrixSource(actor.id, createActorBoneMatrixLookup(actor))
    ]);
  },
  dispose: (actor) => {
    actorClipInfoDisposers.get(actor.id)?.();
    actorClipInfoDisposers.delete(actor.id);
    for (const disposeSource of actorAnimationStateDisposers.get(actor.id) ?? []) disposeSource();
    actorAnimationStateDisposers.delete(actor.id);
  }
});
