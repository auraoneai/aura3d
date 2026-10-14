// apps/aura-clash-showcase/src/v2/env-assets.ts — vendored environment map.
// Vendored so the ?url emits a hashed dist asset (hash-pinned for integrity,
// like the hero GLBs). K1 night-city HDRI stand-in (direction.standIns[]
// R-14-13): kloppenheim dusk reads as neon-rooftop dusk at low intensity.
import hdriUrl from "../../assets/env/kloppenheim_06_puresky_1k.hdr?url";
import { defineAuraAssets } from "@aura3d/engine";

export const envAssets = defineAuraAssets({
  nightCityHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr",
      standInFor: "k1-night-city",
      standInRequest: "R-14-13"
    }
  }
});
