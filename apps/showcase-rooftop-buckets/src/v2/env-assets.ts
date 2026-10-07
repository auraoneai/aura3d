// apps/showcase-rooftop-buckets/src/v2/env-assets.ts — route-local asset refs.
// Golden-hour field HDRI vendored into the app bundle (fixtures/ is lane-15
// owned and not part of the route build) via the vite `?url` pipeline.
// §6.9.6: late sun on the roof — the HDRI feeds glass/PBR reflections only.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/autumn_field_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  goldenHourHdr: {
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
