/**
 * PRD-06 T2.7 — WGSL twin registration for the three deform chunks. Kept in a
 * leaf module (no scene/engine imports) so `tools/wgsl-validate/emit-twins.ts`
 * can register them without pulling the lane's runtime graph.
 */

import { registerWgslTwin } from "../../program/chunks/manifest.js";
import { A3D_PRD06_SKINNING_COMMON_WGSL } from "./skinning.wgsl.js";
import { A3D_PRD06_MORPH_TEXTURE_WGSL } from "./morph.wgsl.js";
import { A3D_PRD06_DEFORM_WGSL } from "./deform.wgsl.js";

let registered = false;

/** Record the prd06 WGSL twins in the C-02 manifest. Idempotent. */
export function registerPrd06WgslTwins(): void {
  if (registered) return;
  registered = true;
  registerWgslTwin({ chunkName: "a3d_prd06_skinning_common", owner: "prd06", wgsl: A3D_PRD06_SKINNING_COMMON_WGSL });
  registerWgslTwin({ chunkName: "a3d_prd06_morph_texture", owner: "prd06", wgsl: A3D_PRD06_MORPH_TEXTURE_WGSL });
  registerWgslTwin({ chunkName: "a3d_prd06_deform", owner: "prd06", wgsl: A3D_PRD06_DEFORM_WGSL });
}
