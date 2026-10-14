// apps/showcase-turbo-drift-circuit/src/v2/env-assets.ts — vendored HDRI (T2.2).
// K1 sunset HDRI as sky + IBL (§6.9.2): golden low sun aligned with the sole
// shadowed directional. The 1k puresky polyhaven file keeps the ~12 MB GPU
// budget while source panels keep the colour direction.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/kloppenheim_06_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  sunsetHdr: {
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
