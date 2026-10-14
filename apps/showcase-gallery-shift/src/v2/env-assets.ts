// apps/showcase-gallery-shift/src/v2/env-assets.ts — route-local asset refs.
// The vendored studio HDRI reads as the gallery's enclosed interior dome at low
// intensity until the K1 environment set admits k1-gallery-interior (stand-in
// R-14-13).
import { defineAuraAssets } from "@aura3d/engine";
import studioHdrUrl from "../../assets/env/studio_small_08_1k.hdr?url";

export const envAssets = defineAuraAssets({
  galleryDomeHdr: {
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
