// apps/showcase-bank-shot/src/v2/env-assets.ts — route-local asset refs.
// The pool-hall HDRI is vendored into the app bundle (fixtures/ is lane-15
// owned and not part of the route build) and referenced through the vite
// `?url` pipeline so the emitted dist carries the real .hdr bytes.
import { defineAuraAssets } from "@aura3d/engine";
import hdriUrl from "../../assets/env/studio_small_08_1k.hdr?url";

export const envAssets = defineAuraAssets({
  poolHallHdr: {
    type: "texture",
    format: "hdr",
    url: hdriUrl,
    hash: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba",
    metadata: {
      license: "polyhaven cc0",
      sourcePath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"
    }
  }
});
