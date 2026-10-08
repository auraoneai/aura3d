import { dedup, prune } from "@gltf-transform/functions";
import { recordStep } from "./common.js";

/** §6.3 step 2 — merge identical accessors/textures/materials, drop unused. */
export const stepDedup = recordStep("dedup", async (doc) => {
  await doc.transform(dedup(), prune());
});
