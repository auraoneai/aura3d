// apps/showcase-neon-swarm/src/v2/env-assets.ts — vendored environment HDRI.
// Vendored 1k studio HDRI drives the night-plaza IBL floor at low intensity
// (the K1 night-city key remains a K-series stand-in until T3.x lands it).
import { defineAuraAssets } from "@aura3d/engine";
import studioHdrUrl from "../../assets/env/studio_small_08_1k.hdr?url";

export const envAssets = defineAuraAssets({
  nightPlazaHdr: {
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
