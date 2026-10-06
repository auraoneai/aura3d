// PR 0b-3 seam (CONTRACTS.md §3.6) — lane-05 LOD selection extension for TypedGLBActor.
// File: packages/engine/src/production-runtime/actor/TypedGLBActorLod.ts — owner lane 05.
//
// Registers `prd05.typed-glb-actor-lod` against the extension registry. The extension is
// flag-gated, so importing this module alone changes nothing; PRD 05 fills in real LOD
// selection under `prd05.actor-lod`.

import { registerTypedGLBActorExtension } from "./extensions";

registerTypedGLBActorExtension({
  id: "prd05.typed-glb-actor-lod",
  owner: "05",
  flag: "A3D_QR_ASSETS_LOD",
  collectRenderItems: (_actor, items) => [...items]
});
