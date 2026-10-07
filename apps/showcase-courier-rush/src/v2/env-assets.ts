// apps/showcase-courier-rush/src/v2/env-assets.ts — route-local asset refs.
// Dawn-overcast HDRI vendored into the app bundle (fixtures/ is lane-15
// owned and not part of the route build) via the vite `?url` pipeline.
// §6.9.7: early-rain dawn — the HDRI feeds wet-asphalt/PBR reflections only.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/kloppenheim_06_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  dawnOvercastHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr"
    }
  }
});
