// apps/showcase-siege-golf/src/v2/env-assets.ts — route-local asset refs.
// Vendored 1k golden-field HDRI drives the siege-course IBL floor at low
// intensity (the K1 golden-valley key remains a K-series stand-in until T3.x).
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/autumn_field_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  goldenValleyHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr"
    }
  }
});
