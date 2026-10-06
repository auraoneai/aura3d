/**
 * C-13 — post graph (rendering side, CONTRACTS.md). Provider: PRD 03. Flag: A3D_QR_POST.
 */

import type { RegistryEntry } from "./core";
import { createRegistry } from "./core";
import type { FrameContributorContext } from "./frameGraph";
import type { AuraToneMappingOperatorLike } from "./output";

export type PostSpace = "linear-hdr" | "display";
export type PostInsertAt = "after-depth" | "before-taa" | "after-taa" | "before-tonemap" | "after-tonemap";
export interface PostPassDescriptor extends RegistryEntry {
  readonly id: string;                         // "<prdNN>.<name>"
  readonly insertAt: PostInsertAt;
  readonly space: PostSpace;                   // must be "linear-hdr" unless insertAt === "after-tonemap"
  readonly inputs: readonly ("color" | "depth" | "velocity" | "normal" | "reactive")[];
  readonly fragment: { readonly glsl: string; readonly wgsl?: string };
  readonly uniforms?: (frame: FrameContributorContext) => Readonly<Record<string, number | readonly number[]>>;
  readonly enabled?: (frame: FrameContributorContext) => boolean;
  readonly gpuOnly: true;                      // CPU passes are rejected: POSTPROCESS_PASS_NOT_GPU:<id>
}

const postPasses = createRegistry<PostPassDescriptor>("postPasses");

export function registerPostPass(pass: PostPassDescriptor): () => void {
  if (pass.gpuOnly !== true) throw new Error(`POSTPROCESS_PASS_NOT_GPU:${pass.id}`);
  return postPasses.register(pass);
}

export function registeredPostPasses(): readonly PostPassDescriptor[] {
  return postPasses.all();
}

export interface PostGraphReport { readonly stages: readonly { readonly name: string; readonly format: string; readonly width: number; readonly height: number; readonly gpuMs?: number }[]; readonly skipped: readonly { readonly name: string; readonly reason: string }[]; }
export interface PostPipelineOptions {
  readonly antiAliasing: "msaa" | "taa" | "smaa" | "fxaa" | "off"; readonly renderScale?: number;
  readonly depthRange: { readonly near: number; readonly far: number; readonly projection: "perspective" | "orthographic" };
  readonly ao?: unknown; readonly ssr?: unknown; readonly godRays?: unknown; readonly taa?: unknown; readonly dof?: unknown; readonly motionBlur?: unknown;
  readonly exposure: number; readonly bloom?: unknown; readonly toneMapping: AuraToneMappingOperatorLike;
  readonly grade?: unknown; readonly lut?: unknown; readonly vignette?: unknown; readonly filmGrain?: unknown; readonly chromaticAberration?: unknown;
  readonly dither: boolean; readonly backgroundPassthrough?: boolean; readonly customPasses?: readonly PostPassDescriptor[];
} // `unknown` members are typed by PRD 03 in post/PostGraph.ts (GtaoOptions, BloomOptionsV2, TaaOptions, DofOptions, MotionBlurOptions, ColorGradeOptionsV2, LutTexture3D) — adding the concrete types is an allowed additive CCR.
// RendererPostProcessOptions (Renderer.ts:378) additions (PR 0a): pipeline?: "v2" | "legacy"; v2?: PostPipelineOptions
// RenderDevice.executePostGraph?(source: SceneTargets, options: PostPipelineOptions, output: RenderTarget | null): PostGraphReport  (optional member, PR 0a)
