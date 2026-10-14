// apps/showcase-blockfall-reactor/src/v2/env-assets.ts — route-local asset refs.
// Vendored 1k studio HDRI drives the arcade-room IBL floor at low intensity:
// its interior sources are the closest vendored map to the k2-arcade-interior
// target until T3.x admits the K2 environment set (stand-in R-14-13).
import { defineAuraAssets } from "@aura3d/engine";
import studioHdrUrl from "../../assets/env/studio_small_08_1k.hdr?url";

export const envAssets = defineAuraAssets({
  arcadeInteriorHdr: {
    type: "texture",
    format: "hdr",
    url: studioHdrUrl,
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"
    }
  }
});
