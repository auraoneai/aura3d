/**
 * C-05 — output surface (engine side, CONTRACTS.md). Provider: PRD 01. Flag: A3D_QR_CORE.
 */

import type { AuraToneMappingOperatorLike } from "@aura3d/rendering/contracts";
import type { AuraAutoExposureOptions, AuraPostPresetId } from "./post";

export type AuraToneMappingOperator = AuraToneMappingOperatorLike;
export interface AuraOutputOptions {
  readonly toneMapping?: AuraToneMappingOperator;
  readonly exposure?: number;                                    // linear multiplier, default 1
  readonly dither?: boolean;                                     // default true
  readonly backgroundPassthrough?: boolean;                      // background excluded from tone map when true
  readonly autoExposure?: false | AuraAutoExposureOptions;       // semantics C-13
  readonly preset?: AuraPostPresetId;                            // semantics C-13
}
export interface AuraOutputOverlay { readonly flash?: readonly [number, number, number, number]; readonly vignette?: readonly [number, number, number, number]; readonly shape?: readonly [number, number]; readonly fade?: readonly [number, number, number, number]; }
export interface AuraOutputSurface {
  setOutput(output: Partial<AuraOutputOptions>): void;
  setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  onRendererError(listener: (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
}
export interface AuraOutputDiagnostics { readonly toneMapping: AuraToneMappingOperator; readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto"; readonly autoEv?: number }; readonly dithering: boolean; readonly targetFormat: "rgba16f" | "r11g11b10f" | "rgba8"; readonly degraded?: "rgba8-no-float-target"; }
// SceneBuilder: scene().background(color: AuraColor, o?: { toneMapped?: boolean }) | background({ environment: true; blurriness?: number; intensity?: number })   (environment form: C-09)
