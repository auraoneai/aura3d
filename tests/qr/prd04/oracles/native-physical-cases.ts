/**
 * Independent, executable CPU-reference case inventory.
 *
 * These inputs are chosen for the domains documented by the clean reference
 * modules. Every category has both an interior sample and a supported boundary
 * sample. The inventory itself does not choose a renderer function or a
 * tolerance: native-physical-numeric-harness.ts maps each sample to a
 * production shader function with an explicit f32 tolerance, or records a
 * documented model-difference contract, and owns the conformance gate.
 *
 * Physical models and numerical integrations coexist with material heuristics:
 * `model` records that distinction rather than treating a shared category name
 * as evidence that two formulas have the same semantics. The multiple-scattering
 * closure is explicitly an approximation, not a full microscopic random walk.
 */
import { dCharlie, iblSheenBRDF, sheenDirect, vNeubelt } from "./native-reference-sheen";
import { anisotropyAlphaT, dGGXAnisotropic, vGGXAnisotropic } from "./native-reference-anisotropy";
import {
  applyIorToRoughness,
  clearcoatFccCompose,
  evalIridescence,
  iorToF0,
  specIorSpecularColor,
  specIorSpecularF90,
  volumeAttenuation,
  volumeTransmissionRay,
  type TransmissionRay,
} from "./native-reference-optics";
import {
  brdfGGXMultiscatter,
  computeSpecularOcclusion,
  environmentBRDF,
  multiscatteringMulti,
  multiscatteringSingle,
} from "./native-reference-environment-clean";

export const PHYSICAL_CATEGORIES = [
  "dCharlie",
  "vNeubelt",
  "iblSheenBRDF",
  "dGGXAnisotropic",
  "vGGXAnisotropic",
  "evalIridescence",
  "computeSpecularOcclusion",
  "applyIorToRoughness",
  "volumeAttenuation",
  "iorToF0",
  "specIorSpecularColor",
  "specIorSpecularF90",
  "clearcoatFccCompose",
  "environmentBRDF",
  "multiscatteringSingle",
  "multiscatteringMulti",
  "sheenDirect",
  "brdfGGXMultiscatter",
  "anisotropyAlphaT",
  "volumeTransmissionRay",
] as const;

export type PhysicalCategory = (typeof PHYSICAL_CATEGORIES)[number];
export type PhysicalModel = "physical-model" | "physical-approximation" | "material-convention" | "heuristic";
export type PhysicalOutput = number | readonly number[] | { readonly f0: number; readonly f90: number } | TransmissionRay;
export type CaseKind = "normal" | "boundary";

export interface PhysicalCaseSample {
  readonly id: string;
  readonly kind: CaseKind;
  /** Ordered arguments to the named reference, or the documented wrapper. */
  readonly input: readonly unknown[];
  evaluate(): PhysicalOutput;
}

export interface PhysicalCase {
  readonly category: PhysicalCategory;
  readonly model: PhysicalModel;
  /** Mapping and tolerance are assigned per sample by native-physical-numeric-harness.ts. */
  readonly rendererMapping: "per-sample-in-harness";
  readonly tolerance: "per-sample-in-harness";
  readonly samples: readonly PhysicalCaseSample[];
}

interface SampleInput<Args extends unknown[]> {
  readonly id: string;
  readonly kind: CaseKind;
  readonly input: readonly [...Args];
}

/** Enforce each input tuple against the evaluator's actual parameter types. */
function defineCase<Category extends PhysicalCategory, Args extends unknown[], Output extends PhysicalOutput>(
  category: Category,
  model: PhysicalModel,
  reference: (...args: Args) => Output,
  inputs: readonly SampleInput<Args>[],
) {
  return {
    category,
    model,
    rendererMapping: "per-sample-in-harness" as const,
    tolerance: "per-sample-in-harness" as const,
    samples: inputs.map(({ id, kind, input }) => ({
      id,
      kind,
      input,
      evaluate: () => reference(...input),
    })),
  };
}

// These wrappers supply an independently integrated basis for each scattering
// result. They accept physical surface inputs rather than inventing LUT values.
// This grid improves convergence at these chosen examples, but by itself is
// not a quadrature error bound or an agreement tolerance for a renderer.
const integration = { polarSamples: 384, azimuthSamples: 768 } as const;
function singleScattering(noV: number, roughness: number, f0: number, f90: number): number {
  return multiscatteringSingle(environmentBRDF(noV, roughness, integration), f0, f90);
}
function multipleScattering(noV: number, roughness: number, f0: number, f90: number): number {
  return multiscatteringMulti(environmentBRDF(noV, roughness, integration), f0, f90);
}
function totalScattering(noV: number, roughness: number, f0: number, f90: number): number {
  return brdfGGXMultiscatter(environmentBRDF(noV, roughness, integration), f0, f90);
}

// Visibility is supplied as a directional field, not inferred from scalar AO.
// The vector is the upper-hemisphere light direction in the reference frame.
const directionalVisibility = (direction: readonly [number, number, number]): number =>
  Math.max(0, Math.min(1, 0.35 + 0.65 * direction[2]));
const noVisibility = (_direction: readonly [number, number, number]): number => 0;

export const PHYSICAL_CASES = [
  defineCase("dCharlie", "physical-model", dCharlie, [
    { id: "sloped-half-vector", kind: "normal", input: [0.6, 0.72] },
    { id: "normal-half-vector", kind: "boundary", input: [1, 1] },
  ]),
  defineCase("vNeubelt", "physical-model", vNeubelt, [
    { id: "oblique-light-and-view", kind: "normal", input: [0.3, 0.82] },
    { id: "grazing-light", kind: "boundary", input: [0, 1] },
  ]),
  defineCase("iblSheenBRDF", "physical-model", iblSheenBRDF, [
    { id: "oblique-view", kind: "normal", input: [0.37, 0.64, { order: 64 }] },
    { id: "normal-view-max-roughness", kind: "boundary", input: [1, 1, { order: 64 }] },
  ]),
  defineCase("dGGXAnisotropic", "physical-model", dGGXAnisotropic, [
    { id: "unequal-slope-widths", kind: "normal", input: [0.36, 0.8, 0.48, 0.64, 0.6] },
    { id: "horizon-half-vector", kind: "boundary", input: [1, 1, 1, 0, 0] },
  ]),
  defineCase("vGGXAnisotropic", "physical-model", vGGXAnisotropic, [
    { id: "unequal-slopes-and-directions", kind: "normal", input: [0.36, 0.8, 0.6, 0, 0.8, 0, 0.8, 0.6] },
    { id: "one-horizon-direction", kind: "boundary", input: [1, 1, 1, 0, 0, 0, 0, 1] },
  ]),
  defineCase("evalIridescence", "physical-model", evalIridescence, [
    { id: "three-monochromatic-samples", kind: "normal", input: [{
      cosThetaIncident: 0.72,
      filmThicknessNm: 325,
      samples: [
        { wavelengthNm: 475, incidentIor: 1, filmIor: 1.32, substrateIor: 1.52 },
        { wavelengthNm: 545, incidentIor: 1, filmIor: 1.32, substrateIor: 1.52 },
        { wavelengthNm: 635, incidentIor: 1, filmIor: 1.32, substrateIor: 1.52 },
      ],
    }] },
    { id: "zero-film-thickness", kind: "boundary", input: [{
      cosThetaIncident: 1,
      filmThicknessNm: 0,
      samples: [{ wavelengthNm: 550, incidentIor: 1, filmIor: 1.35, substrateIor: 1.5 }],
    }] },
  ]),
  defineCase("computeSpecularOcclusion", "physical-model", computeSpecularOcclusion, [
    { id: "partially-visible-directional-field", kind: "normal", input: [0.58, 0.63, 0.08, 1, directionalVisibility, integration] },
    { id: "fully-occluded", kind: "boundary", input: [1, 1, 0.08, 1, noVisibility, integration] },
  ]),
  defineCase("applyIorToRoughness", "heuristic", applyIorToRoughness, [
    { id: "dielectric-roughness-remap", kind: "normal", input: [0.62, 1.45, 1.5, 1] },
    { id: "smooth-endpoint", kind: "boundary", input: [0, 1.5, 1.5, 1] },
  ]),
  defineCase("volumeAttenuation", "physical-model", volumeAttenuation, [
    { id: "finite-absorbing-path", kind: "normal", input: [2.4, [0.9, 0.6, 0.3], 4.5] },
    { id: "zero-length-path", kind: "boundary", input: [0, [0, 0.3, 1], 1] },
  ]),
  defineCase("iorToF0", "physical-model", iorToF0, [
    { id: "dielectric-interface", kind: "normal", input: [1.47, 1] },
    { id: "matched-indices", kind: "boundary", input: [1, 1] },
  ]),
  defineCase("specIorSpecularColor", "heuristic", specIorSpecularColor, [
    { id: "tinted-dielectric", kind: "normal", input: [1.47, [0.9, 0.7, 0.55], 0.82, 1] },
    { id: "zero-specular-factor", kind: "boundary", input: [1.5, [0, 1, 0.5], 0, 1] },
  ]),
  defineCase("specIorSpecularF90", "heuristic", specIorSpecularF90, [
    { id: "partial-specular-factor", kind: "normal", input: [0.65] },
    { id: "zero-specular-factor", kind: "boundary", input: [0] },
  ]),
  defineCase("clearcoatFccCompose", "heuristic", clearcoatFccCompose, [
    { id: "partial-coverage", kind: "normal", input: [[0.5, 0.3, 0.1], [0.12, 0.1, 0.08], 0.65, 0.04] },
    { id: "no-coat", kind: "boundary", input: [[0.5, 0.3, 0.1], [0.12, 0.1, 0.08], 0, 0.04] },
  ]),
  defineCase("environmentBRDF", "physical-model", environmentBRDF, [
    { id: "oblique-view-and-roughness", kind: "normal", input: [0.58, 0.63, integration] },
    { id: "normal-view-max-roughness", kind: "boundary", input: [1, 1, integration] },
  ]),
  defineCase("multiscatteringSingle", "physical-model", singleScattering, [
    { id: "dielectric-single", kind: "normal", input: [0.58, 0.63, 0.08, 1] },
    { id: "zero-reflectance", kind: "boundary", input: [1, 1, 0, 0] },
  ]),
  defineCase("multiscatteringMulti", "physical-approximation", multipleScattering, [
    { id: "dielectric-multiple", kind: "normal", input: [0.58, 0.63, 0.08, 1] },
    { id: "zero-reflectance", kind: "boundary", input: [1, 1, 0, 0] },
  ]),
  defineCase("sheenDirect", "physical-model", sheenDirect, [
    { id: "oblique-light-and-view", kind: "normal", input: [{ noL: 0.4, noV: 0.7, cosDeltaPhi: 0.2, roughness: 0.68 }] },
    { id: "normal-light-and-view", kind: "boundary", input: [{ noL: 1, noV: 1, cosDeltaPhi: 1, roughness: 1 }] },
  ]),
  defineCase("brdfGGXMultiscatter", "physical-approximation", totalScattering, [
    { id: "dielectric-total", kind: "normal", input: [0.58, 0.63, 0.08, 1] },
    { id: "zero-reflectance", kind: "boundary", input: [1, 1, 0, 0] },
  ]),
  defineCase("anisotropyAlphaT", "material-convention", anisotropyAlphaT, [
    { id: "partial-strength", kind: "normal", input: [0.3, 0.65] },
    { id: "maximum-strength", kind: "boundary", input: [0, 1] },
  ]),
  defineCase("volumeTransmissionRay", "physical-model", volumeTransmissionRay, [
    { id: "oblique-slab", kind: "normal", input: [[0.6, 0, -0.8], [0, 0, 1], 1, 1.45, 2.5] },
    { id: "zero-thickness", kind: "boundary", input: [[0, 0, -1], [0, 0, 1], 1, 1.5, 0] },
  ]),
] as const satisfies readonly PhysicalCase[];
