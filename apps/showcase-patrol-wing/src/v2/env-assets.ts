// apps/showcase-patrol-wing/src/v2/env-assets.ts — route-local asset refs.
// Vendored 1k golden-field HDRI drives the patrol IBL floor at low intensity:
// its warm low-sun gradient is the closest vendored map to the
// k1-sunset-ocean target until T3.x admits the K1 environment set.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/autumn_field_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  sunsetOceanHdr: {
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
