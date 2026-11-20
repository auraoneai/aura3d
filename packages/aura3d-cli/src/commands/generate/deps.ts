/**
 * Cross-package seams for the generation pipelines (REPORT.md "Work packages"):
 *   WP3 asset-post: normalizeGlb(input, output, opts), slimGlb(file, opts?), renderPreview(glbPath, outPng, opts?)
 *   WP1 animation-io: importClipsOntoRig(opts) → { ok, clips: {name, duration, channels, ...}[], output, skin?, failures }
 *
 * The pipelines take these through `GenerateDeps` so tests can inject them; `resolveGenerateDeps` binds the real
 * exports from ../asset-post and ../animation-io.
 */

import { importClipsOntoRig } from "../animation-io/index.js";
import type { ImportClipSource, ImportClipsOntoRigOptions, ImportClipsResult } from "../animation-io/index.js";
import { normalizeGlb, renderPreview, slimGlb } from "../asset-post/index.js";
import type { NormalizeGlbOptions, NormalizeGlbResult, NormalizeSize, RenderPreviewOptions, RenderPreviewResult, SlimGlbOptions, SlimGlbResult } from "../asset-post/index.js";

export type { ImportClipSource, ImportClipsOntoRigOptions, ImportClipsResult };
export type { NormalizeGlbOptions, NormalizeGlbResult, NormalizeSize, RenderPreviewOptions, RenderPreviewResult, SlimGlbOptions, SlimGlbResult };

/** The part of importClipsOntoRig's result the generate verbs use. */
export interface RetargetResult {
  readonly ok: boolean;
  readonly output: string;
  readonly clips: readonly { readonly name: string; readonly duration: number; readonly channels: number }[];
  readonly failures?: readonly string[];
  readonly warnings?: readonly string[];
  readonly skin?: unknown;
}

export interface GenerateDeps {
  normalizeGlb(input: string, output: string, opts: NormalizeGlbOptions): Promise<NormalizeGlbResult>;
  slimGlb(file: string, opts?: SlimGlbOptions): Promise<Pick<SlimGlbResult, "before" | "after"> & Partial<Pick<SlimGlbResult, "reencoded" | "skipped" | "written">>>;
  renderPreview(glbPath: string, outPng: string, opts?: RenderPreviewOptions): Promise<unknown>;
  importClipsOntoRig(opts: ImportClipsOntoRigOptions): Promise<RetargetResult>;
}

/** Bind the WP1/WP3 exports, letting tests (or callers) override any of them. */
export function resolveGenerateDeps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
  return {
    normalizeGlb: overrides.normalizeGlb ?? normalizeGlb,
    slimGlb: overrides.slimGlb ?? slimGlb,
    renderPreview: overrides.renderPreview ?? renderPreview,
    importClipsOntoRig: overrides.importClipsOntoRig ?? importClipsOntoRig
  };
}
