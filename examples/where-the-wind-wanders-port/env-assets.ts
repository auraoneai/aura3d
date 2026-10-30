/**
 * WW47-L3: the GLBs' fill environment. kloppenheim_06 is the E-A catalogue HDRI (CC0, Poly Haven, served from the root
 * `public/hdri/` at `/hdri/kloppenheim_06_puresky_1k.hdr`); it lights the GLBs only (background off), the visible sky
 * is the painted dome. Its intensity is 0.55 at the first key and scales with the day (daylight.ts `envIntensity`).
 */
import { defineAuraAssets } from "@aura3d/engine";

export const ENV_ASSETS = defineAuraAssets({
  valleyIbl: { type: "texture", format: "hdr", url: "/hdri/kloppenheim_06_puresky_1k.hdr", metadata: { license: "CC0 1.0, Poly Haven kloppenheim_06_puresky (1k), E-A catalogue copy" } }
});

/** Environment node intensity; the daylight key's `envIntensity` is applied as a scale of this. */
export const VALLEY_IBL_INTENSITY = 0.55;
