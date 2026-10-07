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
import {
  createPrd06ActorAnimationApi,
  registerActorClipInfoSource,
  registerPrd06AnimationActor
} from "../agent-api/app/actorAnimationHandle.js";

// T0.9a: `validateClipMap` ships for templates/games through the lane barrel
// (exported from `@aura3d/engine` via `lanes/index.js`).
export * from "../agent-api/GameCharacterAnimation.js";

registerNodeHandleExtension({
  id: "prd06.animation",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  member: "animation",
  appliesTo: ["model"],
  create: (handle) => createPrd06ActorAnimationApi(handle)
});

const actorClipInfoDisposers = new Map<string, () => void>();

registerTypedGLBActorExtension({
  id: "prd06.animation",
  owner: "prd06",
  flag: "A3D_QR_ANIMATION",
  onLoad: (actor) => {
    actorClipInfoDisposers.set(
      actor.id,
      registerActorClipInfoSource(actor.id, () => actor.animation.resolvedClipInfos())
    );
    actorClipInfoDisposers.set(`${actor.id}:actor`, registerPrd06AnimationActor(actor));
  },
  dispose: (actor) => {
    for (const key of [actor.id, `${actor.id}:actor`]) {
      actorClipInfoDisposers.get(key)?.();
      actorClipInfoDisposers.delete(key);
    }
  }
});
