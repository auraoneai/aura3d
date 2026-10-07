import { draco, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { recordStep } from "./common.js";

/**
 * §6.3 step 9 — EXT_meshopt_compression (default, level "medium") or
 * KHR_draco_mesh_compression (`--geometry draco`, non-skinned static worlds
 * only). Meshopt keeps skin/morph attributes; draco is refused on skinned
 * docs per §6.2.
 */
export const stepCompress = recordStep("compress", async (doc, ctx) => {
  const hasSkin = doc.getRoot().listSkins().length > 0;
  const mode = ctx.geometryOverride ?? (ctx.profile.geometry.meshopt ? "meshopt" : "none");

  if (mode === "draco") {
    if (hasSkin || !ctx.profile.geometry.draco) {
      ctx.flags.push("compress-draco-refused");
      ctx.log("compress: draco refused (skinned or profile disallows) — meshopt instead");
      await MeshoptEncoder.ready;
      await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
      return;
    }
    // The draco3d encoder module is a registered io dependency (index.ts).
    await doc.transform(draco());
    return;
  }
  if (mode === "none") return;

  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
});
