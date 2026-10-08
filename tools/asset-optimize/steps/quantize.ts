import { quantize } from "@gltf-transform/functions";
import { recordStep } from "./common.js";

/**
 * §6.3 step 8 — KHR_mesh_quantization: positions 14-bit static meshes only
 * (skinned positions stay float), normals 10-bit, UVs 12-bit only when all
 * TEXCOORD values lie in [0,1], tangents 8-bit.
 */
export const stepQuantize = recordStep("quantize", async (doc, ctx) => {
  if (!ctx.profile.geometry.quantize) return;
  const hasSkin = doc.getRoot().listSkins().length > 0;

  // UV range check across every TEXCOORD accessor.
  let uvInUnitRange = true;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (!semantic.startsWith("TEXCOORD")) continue;
        const arr = prim.getAttribute(semantic)?.getArray();
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < 0 || arr[i] > 1) { uvInUnitRange = false; break; }
        }
      }
    }
  }

  // Skinned POSITION must stay float: restrict the pattern to non-POSITION
  // semantics when the document has skins.
  await doc.transform(
    quantize({
      pattern: hasSkin ? /^(?!POSITION|JOINTS|WEIGHTS).*/ : undefined,
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: uvInUnitRange ? 12 : undefined,
      quantizeGeneric: 12
    })
  );
  if (hasSkin) ctx.flags.push("quantize-positions-float-skinned");
});
