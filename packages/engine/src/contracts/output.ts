/**
 * C-05 — output surface (engine side, CONTRACTS.md). Provider: PRD 01. Flag: A3D_QR_CORE.
 */

import type { AuraToneMappingOperatorLike, OutputPassOptions } from "@aura3d/rendering/contracts";
import type { AuraAutoExposureOptions, AuraPostPresetId } from "./post";

export type AuraToneMappingOperator = AuraToneMappingOperatorLike;
export interface AuraOutputOptions {
  readonly toneMapping?: AuraToneMappingOperator;
  readonly exposure?: number;                                    // linear multiplier, default 1
  readonly dither?: boolean;                                     // default true
  readonly backgroundPassthrough?: boolean;                      // background excluded from tone map when true
  readonly autoExposure?: false | AuraAutoExposureOptions;       // semantics C-13
  readonly preset?: AuraPostPresetId;                            // semantics C-13
  /** Requested canvas color space; the active space may fall back to sRGB. */
  readonly outputColorSpace?: OutputPassOptions["outputColorSpace"];
  /** Output alpha association. Defaults to opaque and must match the presentation surface. */
  readonly alphaMode?: OutputPassOptions["alphaMode"];
  /**
   * Explicit caller warranty required for alpha-preserving output: the input
   * to OutputPass is scene-linear premultiplied RGB with opacity in alpha,
   * including the clear, all draws, and intermediate post stages. The output
   * alpha mode and a background coverage tag do not establish this warranty:
   * the compiler's clear alpha can denote tone-map coverage, not opacity.
   * Opaque output instead uses the legacy coverage contract.
   */
  readonly inputAlphaMode?: OutputPassOptions["inputAlphaMode"];
}
export interface AuraOutputOverlay { readonly flash?: readonly [number, number, number, number]; readonly vignette?: readonly [number, number, number, number]; readonly shape?: readonly [number, number]; readonly fade?: readonly [number, number, number, number]; }
export interface AuraOutputSurface {
  setOutput(output: Partial<AuraOutputOptions>): void;
  setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  onRendererError(listener: (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
}
export interface AuraOutputDiagnostics {
  readonly toneMapping: AuraToneMappingOperator;
  readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto"; readonly autoEv?: number };
  readonly dithering: boolean;
  readonly targetFormat: "rgba16f" | "r11g11b10f" | "rgba8";
  readonly degraded?: "rgba8-no-float-target" | "hdr-msaa-mrt-unsupported" | "hdr-msaa-depth-unsupported";
}
// SceneBuilder: scene().background(color: AuraColor, o?: { toneMapped?: boolean }) | background({ environment: true; blurriness?: number; intensity?: number })   (environment form: C-09)
