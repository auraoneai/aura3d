/**
 * C-03 — MaterialFeature lobe registry (CONTRACTS.md). Provider: PRD 04.
 * File: packages/rendering/src/contracts/materialLobes.ts.
 */

import type { RegistryEntry, QrFlags } from "./core";
import type { MaterialExtensionFeature, ProgramFeatures } from "./program";
import type { AuraQualityTierSettings } from "./quality";
import type { UniformValue } from "../RenderDevice";
import type { Texture } from "../Texture";

export type MaterialLobeId =
  | "base" | "clearcoat" | "sheen" | "iridescence" | "anisotropy" | "transmission" | "volume"
  | "specular" | "ior" | "dispersion" | "emissive-strength" | "unlit" | `${"prd04" | "prd10" | "prd07"}.${string}`;
export interface MaterialLobe extends RegistryEntry {
  readonly id: MaterialLobeId;
  /** Return the extension feature for this material or undefined when the lobe is inactive. */
  feature(material: MaterialLobeInput): MaterialExtensionFeature | undefined;
  readonly chunks: { readonly pars: string; readonly fragment: string; readonly ibl?: string };  // chunk names (C-02)
  readonly samplerSlots: readonly string[];          // counted by the PRD 02 sampler budget (C-12)
  bind(material: MaterialLobeInput, set: (uniform: string, value: UniformValue) => void): void;
  readonly glTFExtension?: string;                   // e.g. "KHR_materials_clearcoat"
}
export interface MaterialLobeInput { readonly parameters: Readonly<Record<string, unknown>>; readonly textures: Readonly<Record<string, Texture | undefined>>; }
export interface MaterialFeatureContext { readonly flags: QrFlags; readonly tier: AuraQualityTierSettings; }
/** Implemented by every Material subclass (abstract in Material.ts, PRD 01). */
export interface ProgramFeatureSource {
  programFeatures(ctx: MaterialFeatureContext): Omit<ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage">;
}

import { createRegistry } from "./core";

const materialLobeRegistry = createRegistry<MaterialLobe>("materialLobes");

/** Registry is real in PR 0a: lobes store and validate; they have no render effect until the C-02 generator is real. */
export function registerMaterialLobe(lobe: MaterialLobe): () => void {
  return materialLobeRegistry.register(lobe);
}
export function materialLobes(flags: QrFlags): readonly MaterialLobe[] {
  return materialLobeRegistry.active(flags);
}
