// apps/showcase-gravity-post/src/v2/env-assets.ts — route-local asset refs.
// Vendored 1k deep-space HDRI drives the IBL floor for the system board (the
// K1 deep-space skybox remains a K-series stand-in until T3.x lands, R-14-13).
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/data_galaxy_deep_space_1k.hdr?url";

export const envAssets = defineAuraAssets({
  deepSpaceDomeHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-abbab6e3a136126aa88932440b4242d53def7b1b0ca83b0701f547f085fbeab2",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr"
    }
  }
});
