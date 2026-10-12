/**
 * PRD 11 pixel wiring (A3D_QR_TIERS): the per-app live C-27 tier the renderer
 * consumes each frame — forward programs, frame contributors, the shadow
 * bridge and the pixel-ratio cap. The engine `quality` extension binds its
 * controller to the app's resolved QrFlags object (the same object
 * `Renderer.create({ qrFlags })` binds to the device), so two apps on one page
 * never read each other's tier. Dependency-free so the renderer's static
 * import graph does not pull in the controller.
 *
 * Returns `undefined` with `A3D_QR_TIERS` off or no controller bound, so every
 * `?? QUALITY_TIERS.high` fallback keeps flag-off rendering byte-identical.
 */
import type { AuraQualityTier, AuraQualityTierSettings } from "../contracts/quality";

export interface LiveQualityTierSource {
  readonly tier: AuraQualityTier;
  readonly settings: AuraQualityTierSettings;
}

const sourcesByFlags = new WeakMap<object, LiveQualityTierSource>();

/** Binds `source` to `flags`; the returned disposer unbinds it (if still bound). */
export function bindLiveQualityTier(flags: object, source: LiveQualityTierSource): () => void {
  sourcesByFlags.set(flags, source);
  return () => {
    if (sourcesByFlags.get(flags) === source) sourcesByFlags.delete(flags);
  };
}

export function prd11LiveQualityTier(
  flags: { on(name: string): boolean } | undefined | null
): LiveQualityTierSource | undefined {
  if (!flags || !flags.on("A3D_QR_TIERS")) return undefined;
  const source = sourcesByFlags.get(flags);
  return source ? { tier: source.tier, settings: source.settings } : undefined;
}
