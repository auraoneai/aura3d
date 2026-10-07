// apps/showcase-vault-breakers/src/v2/env-assets.ts — route-local asset refs.
// Evening-city HDRI vendored into the app bundle (fixtures/ is lane-15 owned
// and not part of the route build) via the vite `?url` pipeline. §6.9.5: the
// arcade sits in a dark room; the HDRI feeds reflections on chrome/cabinet
// only — never a background or a light source.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/kloppenheim_06_puresky_1k.hdr?url";

export const envAssets = defineAuraAssets({
  arcadeEveningHdr: {
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
