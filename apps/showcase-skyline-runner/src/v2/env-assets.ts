// apps/showcase-skyline-runner/src/v2/env-assets.ts — v2 shell environment assets.
// The k1-winter-dusk HDRI kit is not admitted yet (K1 is a T3.x lane), so the
// vendored pure-sky capture stands in as the IBL fill under the C-35 stays-in-review
// rule. Track via R-14-13.
import { defineAuraAssets } from "@aura3d/engine";
import hdrUrl from "../../assets/env/autumn_field_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  winterDuskHdr: {
    type: "texture",
    format: "hdr",
    url: hdrUrl,
    hash: "sha256-e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr",
      request: "R-14-13"
    }
  }
});
