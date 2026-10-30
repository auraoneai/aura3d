/**
 * GU47 RH47-10: CC0 surface detail for the custom GLSL road and terrain (ambientCG Asphalt033, Rock063, Rock064, 1K-JPG,
 * packed by `tools/pack-detail.mjs` into one 512 px map each: R = luminance detail around 0.5, G/B = NormalGL x/y).
 * Provenance and sha256 per file: `assets/detail/detail.json`; attribution: `assets/ATTRIBUTION.md`.
 *
 * Engine limits (see the lane report): custom-material asset textures load with a clamp, linear, un-mipmapped sampler, so the
 * shaders wrap with `fract` and fade each scale out by its texel footprint (no moire at distance); they are not part of
 * `texturedMaterials`, so the QA hook's 58-texture count is unchanged.
 */
import { defineAuraAssets } from "@aura3d/engine";

const meta = (id: string) => ({ license: `CC0-1.0, ambientCG ${id} (https://ambientcg.com/a/${id}), packed detail map` });

export const DETAIL_ASSETS = defineAuraAssets({
  asphalt: { type: "texture", format: "jpg", url: new URL("../assets/detail/asphalt.jpg", import.meta.url).pathname, hash: "sha256-1741470a34547c75b4fabd12cf67a6b239babfd5b1d43496086bcb13c7305ddb", metadata: meta("Asphalt033") },
  limestone: { type: "texture", format: "jpg", url: new URL("../assets/detail/limestone.jpg", import.meta.url).pathname, hash: "sha256-95894966dd52e060731eda59fdfe31735bcf861cee31667955b85f1c9573e172", metadata: meta("Rock063") },
  sandstone: { type: "texture", format: "jpg", url: new URL("../assets/detail/sandstone.jpg", import.meta.url).pathname, hash: "sha256-0110b19402f211078dfdd187a24f458260b6b03909bf444bc6cffe308bd1f52e", metadata: meta("Rock064") }
});

export type DetailKey = keyof typeof DETAIL_ASSETS;

/** Near and far tile sizes in metres: the near scale gives the grain beside the car, the far one the mid-distance break-up. */
export const DETAIL_TILES = { road: [3, 40], rock: [5, 70] } as const;
/** Packed map size in texels (the footprint fade is measured in these). */
export const DETAIL_TEXELS = 512;
