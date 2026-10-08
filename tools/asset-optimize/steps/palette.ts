import { palette } from "@gltf-transform/functions";
import { recordStep } from "./common.js";

/**
 * §6.3 step 3b — bake factor-only materials into a palette texture so
 * materials collapse to fewer draws. Only `world-chunk`/`prop-small`;
 * never for hero roles.
 */
export const stepPalette = recordStep("palette", async (doc, ctx) => {
  if (!ctx.profile.paletteAllowed) return;
  await doc.transform(palette());
});
