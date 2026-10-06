// PR 0b-2 seam (CONTRACTS.md §3.5) — renderer-internal host bag shared by carved-out pipelines.
// File: packages/rendering/src/renderer/RendererHost.ts — owner lane 01.

import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { ShaderLibrary } from "../ShaderLibraryCore";
import type { FusedLdrPostProcessScratch } from "../PostProcessPass";
import type { RendererPostprocessPipeline } from "./PostprocessExecution";
import type { RendererShadowOrchestrator } from "./ShadowOrchestration";

export interface RendererHost {
  device: RenderDevice;
  width: number;
  height: number;
  readonly shaderLibrary: ShaderLibrary;
  readonly fusedLdrPostprocessScratch: FusedLdrPostProcessScratch;
  /**
   * Depth target reused by the renderer-owned shadow pass across frames.
   *
   * A new `ShadowPass` is constructed per frame, so letting the pass own its target reallocated
   * textures and re-ran `checkFramebufferStatus` every frame. Keyed by size so a shadow-size change
   * still reallocates exactly once.
   */
  shadowDepthTarget: RenderTarget | null;
  /** Monotonic submitted-frame counter for the C-01 frame context. */
  frameIndex: number;
  post: RendererPostprocessPipeline;
  shadows: RendererShadowOrchestrator;
}
