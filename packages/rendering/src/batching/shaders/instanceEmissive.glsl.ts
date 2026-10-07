/**
 * PRD 11 Phase 3 — `a3d_prd11_instance_emissive` chunks + `prd11.instanceEmissive`
 * feature (§6.6): per-instance emissive colour rides a third instanced
 * attribute (`a_instanceEmissive`) so members of one batch may carry
 * different emissive signatures without splitting the draw.
 *
 * The legacy path cannot express this (no `u_instanceEmissive` plumbing in
 * `aura3d/instanced-pbr`), so the feature only activates on the generated
 * C-02 program path — exactly the constraint the planner encodes by counting
 * `emissive-varies` members out of merged batches.
 */

import { registerShaderChunk, registerShaderFeature } from "../../contracts/program";
import type { RenderItem } from "../../contracts/renderItem";
import { registerWgslTwin } from "../../program/chunks/manifest";
import { PRD11_INSTANCE_EMISSIVE_VTX_WGSL, PRD11_INSTANCE_EMISSIVE_FRAG_WGSL } from "../../program/chunks/instanceEmissive.wgsl";

export const PRD11_INSTANCE_EMISSIVE_VTX_CHUNK = "a3d_prd11_instance_emissive_vtx";
export const PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK = "a3d_prd11_instance_emissive_frag";
export const PRD11_INSTANCE_EMISSIVE_FEATURE = "prd11.instanceEmissive";

const VTX_GLSL = /* glsl */ `
#ifdef A3D_PRD11_INSTANCE_EMISSIVE
in vec3 a_instanceEmissive;
out vec3 v_a3dInstanceEmissive;
#endif
`;

const FRAG_GLSL = /* glsl */ `
#ifdef A3D_PRD11_INSTANCE_EMISSIVE
in vec3 v_a3dInstanceEmissive;
#endif
`;

let registered = false;

export function registerPrd11InstanceEmissiveShader(): void {
  if (registered) return;
  registered = true;
  registerShaderChunk({
    name: PRD11_INSTANCE_EMISSIVE_VTX_CHUNK,
    owner: "prd11",
    glsl: VTX_GLSL,
    wgsl: PRD11_INSTANCE_EMISSIVE_VTX_WGSL,
    stage: "vertex"
  });
  registerWgslTwin({ chunkName: PRD11_INSTANCE_EMISSIVE_VTX_CHUNK, owner: "prd11", wgsl: PRD11_INSTANCE_EMISSIVE_VTX_WGSL });
  registerShaderChunk({
    name: PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK,
    owner: "prd11",
    glsl: FRAG_GLSL,
    wgsl: PRD11_INSTANCE_EMISSIVE_FRAG_WGSL,
    stage: "fragment"
  });
  registerWgslTwin({ chunkName: PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK, owner: "prd11", wgsl: PRD11_INSTANCE_EMISSIVE_FRAG_WGSL });
  registerShaderFeature({
    id: PRD11_INSTANCE_EMISSIVE_FEATURE,
    owner: "prd11",
    flag: "A3D_QR_TIERS_BATCHING",
    select: (input) => emissiveLength(input.item) > 0 ? true : undefined,
    defines: () => ({ A3D_PRD11_INSTANCE_EMISSIVE: true }),
    chunks: [PRD11_INSTANCE_EMISSIVE_VTX_CHUNK, PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK],
    hooks: ["vertex:pars", "fragment:pars"]
  });
}

function emissiveLength(item: RenderItem): number {
  return item.instanceEmissive?.length ?? 0;
}
