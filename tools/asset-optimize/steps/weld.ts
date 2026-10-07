import { weld } from "@gltf-transform/functions";
import { recordStep } from "./common.js";

/** §6.3 step 1 — merge bitwise-identical vertices; required before simplify. */
export const stepWeld = recordStep("weld", async (doc) => {
  await doc.transform(weld());
});
