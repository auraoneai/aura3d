import { join } from "@gltf-transform/functions";
import { recordStep } from "./common.js";

/** §6.3 step 3a — merge primitives that share a material within a node subtree. */
export const stepJoin = recordStep("join", async (doc, ctx) => {
  if (!ctx.profile.joinAllowed) return;
  await doc.transform(join());
});
