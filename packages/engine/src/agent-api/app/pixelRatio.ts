/**
 * PRD-01 §6.9 app-side pixel ratio (Q-15-1). Under `A3D_QR_CORE` the canvas
 * backing ratio comes from the single §6.9 decision point
 * (`resolveCanvasPixelRatio`: explicit ?? min(devicePixelRatio, tier cap), no
 * [1, 2] clamp), and the legacy 320×220 backing minimum no longer applies.
 * Flag-off keeps the legacy chain byte-identical: explicit ?? quality-profile
 * value ?? the clamped device ratio. #1083 GPU: under core the production
 * profile's fixed 1.5 was used as the value, so DSF 1/2/3 all gave 1.5.
 */

import { resolveCanvasPixelRatio } from "@aura3d/rendering";
import { resolveTierSettings, type AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraCreateAppOptions } from "../nodes/types.js";

export interface AppPixelRatioInput {
  readonly flagOn: boolean;
  readonly option: AuraCreateAppOptions["pixelRatio"];
  /** Quality-profile pixel ratio (legacy value; ignored under the flag). */
  readonly profilePixelRatio: number | undefined;
  /** Tier cap (`appTierMaxPixelRatio(tier)`). */
  readonly maxPixelRatio: number;
  readonly devicePixelRatio: number;
  /** Legacy fallback when neither an explicit nor a profile ratio exists. */
  readonly legacyDevicePixelRatio: () => number;
}

export function explicitPixelRatio(option: AuraCreateAppOptions["pixelRatio"]): number | undefined {
  return typeof option === "number" ? option : option?.max ?? undefined;
}

export function resolveAppPixelRatio(input: AppPixelRatioInput): number {
  const explicit = explicitPixelRatio(input.option);
  if (!input.flagOn) return explicit ?? input.profilePixelRatio ?? input.legacyDevicePixelRatio();
  return resolveCanvasPixelRatio({ devicePixelRatio: input.devicePixelRatio, tier: { maxPixelRatio: input.maxPixelRatio }, explicit });
}

/** Legacy backing minimum (320×220) flag-off; 1×1 under the §6.9 policy. */
export function minimumBackingSize(flagOn: boolean): { readonly width: number; readonly height: number } {
  return flagOn ? { width: 1, height: 1 } : { width: 320, height: 220 };
}

/**
 * DPR cap of the mount tier — callers pass `resolveMountQuality(renderer).tier`
 * (default High → 2), the same tier the compile ctx uses. Takes the tier, not
 * the renderer options, so this module stays out of the compiler import cycle.
 */
export function appTierMaxPixelRatio(tier: AuraQualityTier): number {
  return resolveTierSettings(tier).maxPixelRatio;
}

export function currentDevicePixelRatio(): number {
  return typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
}
