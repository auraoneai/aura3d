/**
 * C-05 — output: HDR target, tone mapping, exposure, background coverage, overlay
 * (CONTRACTS.md). Provider: PRD 01. Flag: A3D_QR_CORE.
 */

import type { RenderTarget } from "../RenderDevice";
import type { RenderDevice } from "../RenderDevice";

export type AuraToneMappingOperatorLike = "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral";
export interface OutputPassOptions { readonly toneMapping: AuraToneMappingOperatorLike; readonly exposure: number; readonly dithering: boolean; readonly backgroundCoverage: boolean; readonly overlay?: OutputOverlayUniforms; }
export interface OutputOverlayUniforms { readonly flash: readonly [number, number, number, number]; readonly vignette: readonly [number, number, number, number]; readonly shape: readonly [number, number]; readonly fade: readonly [number, number, number, number]; }
export interface OutputPassLike { execute(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions, output: RenderTarget | "canvas"): void; }

/**
 * Frozen as "aces" at PR 0 (PRD 03 :451/:680, PRD 01 :1020). It switches to "agx"
 * only in a separate PRD 01 PR linking PRD 12's ACES-vs-AgX A/B record.
 */
export const DEFAULT_TONE_MAPPING: AuraToneMappingOperatorLike = "aces";
export type HdrTargetFormat = "rgba16f" | "r11f_g11f_b10f" | "rgba8";

/**
 * PR 0a stub: "rgba16f" when the `hdr-render-targets` capability exists, else
 * "rgba8". Real (PRD 01) probes r11f_g11f_b10f as the middle rung.
 */
export function probeHdrTargetFormat(device: RenderDevice): HdrTargetFormat {
  const capabilities = device.info.capabilities ?? [];
  return capabilities.includes("hdr-render-targets") ? "rgba16f" : "rgba8";
}
