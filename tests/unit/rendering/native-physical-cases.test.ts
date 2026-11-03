import { describe, expect, it } from "vitest";

import {
  PHYSICAL_CASES,
  PHYSICAL_CATEGORIES
} from "../../qr/prd04/oracles/native-physical-cases";
import {
  dCharlie,
  iblSheenBRDF,
  sheenDirect,
  vNeubelt
} from "../../qr/prd04/oracles/native-reference-sheen";
import {
  anisotropyAlphaT,
  dGGXAnisotropic,
  vGGXAnisotropic
} from "../../qr/prd04/oracles/native-reference-anisotropy";
import {
  applyIorToRoughness,
  clearcoatFccCompose,
  evalIridescence,
  iorToF0,
  specIorSpecularColor,
  specIorSpecularF90,
  volumeAttenuation,
  volumeTransmissionRay
} from "../../qr/prd04/oracles/native-reference-optics";
import {
  brdfGGXMultiscatter,
  computeSpecularOcclusion,
  environmentBRDF,
  multiscatteringMulti,
  multiscatteringSingle
} from "../../qr/prd04/oracles/native-reference-environment-clean";

const expectedCategories = [
  "dCharlie", "vNeubelt", "iblSheenBRDF", "dGGXAnisotropic", "vGGXAnisotropic",
  "evalIridescence", "computeSpecularOcclusion", "applyIorToRoughness", "volumeAttenuation",
  "iorToF0", "specIorSpecularColor", "specIorSpecularF90", "clearcoatFccCompose",
  "environmentBRDF", "multiscatteringSingle", "multiscatteringMulti", "sheenDirect",
  "brdfGGXMultiscatter", "anisotropyAlphaT", "volumeTransmissionRay"
] as const;
const materialHeuristics: readonly string[] = [
  "applyIorToRoughness", "specIorSpecularColor", "specIorSpecularF90", "clearcoatFccCompose"
];

/** Check every numerical leaf, not just the first channel of a vector or result. */
function expectFiniteLeaves(value: unknown, path: string): number {
  if (typeof value === "number") {
    expect(Number.isFinite(value), path).toBe(true);
    return 1;
  }
  if (value === null || typeof value !== "object") return 0;
  return Object.entries(value).reduce(
    (count, [key, child]) => count + expectFiniteLeaves(child, `${path}.${key}`),
    0
  );
}

/** Integrate f(L,V) NoL dω in incident-direction coordinates. */
function incidentHemisphereIntegral(noV: number, roughness: number, multiplier = 1): number {
  const elevationSteps = 128;
  const azimuthSteps = 256;
  let sum = 0;
  for (let elevation = 0; elevation < elevationSteps; elevation++) {
    const noL = (elevation + 0.5) / elevationSteps;
    for (let azimuth = 0; azimuth < azimuthSteps; azimuth++) {
      const phi = 2 * Math.PI * (azimuth + 0.5) / azimuthSteps;
      sum += multiplier * sheenDirect({ noL, noV, cosDeltaPhi: Math.cos(phi), roughness }) * noL;
    }
  }
  return sum * (2 * Math.PI) / (elevationSteps * azimuthSteps);
}

function relativeError(actual: number, reference: number): number {
  return Math.abs(actual - reference) / Math.max(Math.abs(reference), 1e-12);
}

/** Integrate isotropic GGX over incident directions, instead of half vectors. */
function incidentGgxBasis(noV: number, roughness: number): { f0: number; f90: number } {
  const alpha = roughness * roughness;
  const viewT = Math.sqrt(1 - noV * noV);
  const elevationSteps = 96;
  const azimuthSteps = 192;
  let f0 = 0;
  let f90 = 0;
  for (let elevation = 0; elevation < elevationSteps; elevation++) {
    const noL = (elevation + 0.5) / elevationSteps;
    const lightRadius = Math.sqrt(1 - noL * noL);
    for (let azimuth = 0; azimuth < azimuthSteps; azimuth++) {
      const phi = 2 * Math.PI * (azimuth + 0.5) / azimuthSteps;
      const lightT = lightRadius * Math.cos(phi);
      const lightB = lightRadius * Math.sin(phi);
      const halfLength = Math.hypot(viewT + lightT, lightB, noV + noL);
      const halfT = (viewT + lightT) / halfLength;
      const halfB = lightB / halfLength;
      const halfN = (noV + noL) / halfLength;
      const viewHalf = viewT * halfT + noV * halfN;
      const fresnelGrazingWeight = (1 - viewHalf) ** 5;
      const weightedBrdf = dGGXAnisotropic(alpha, alpha, halfT, halfB, halfN) *
        vGGXAnisotropic(alpha, alpha, lightT, lightB, noL, viewT, 0, noV) * noL;
      f0 += weightedBrdf * (1 - fresnelGrazingWeight);
      f90 += weightedBrdf * fresnelGrazingWeight;
    }
  }
  const weight = (2 * Math.PI) / (elevationSteps * azimuthSteps);
  return { f0: f0 * weight, f90: f90 * weight };
}

describe("independent physical CPU case inventory", () => {
  it("registers exactly the intended categories and exercises normal and boundary inputs", () => {
    expect([...PHYSICAL_CATEGORIES].sort()).toEqual([...expectedCategories].sort());
    expect(PHYSICAL_CASES.map(({ category }) => category).sort()).toEqual([...expectedCategories].sort());

    for (const entry of PHYSICAL_CASES) {
      expect(entry.rendererMapping, entry.category).toBe("per-sample-in-harness");
      expect(entry.tolerance, entry.category).toBe("per-sample-in-harness");
      expect(entry.model, entry.category).toBe(materialHeuristics.includes(entry.category)
        ? "heuristic"
        : entry.category === "anisotropyAlphaT" ? "material-convention"
        : entry.category === "multiscatteringMulti" || entry.category === "brdfGGXMultiscatter"
          ? "physical-approximation" : "physical-model");
      expect(entry.samples.length, entry.category).toBeGreaterThanOrEqual(2);
      expect(entry.samples.some(({ kind }) => kind === "normal"), entry.category).toBe(true);
      expect(entry.samples.some(({ kind }) => kind === "boundary"), entry.category).toBe(true);
      expect(new Set(entry.samples.map(({ id }) => id)).size, entry.category).toBe(entry.samples.length);
      const outputs: Array<{ kind: string; value: unknown }> = [];
      for (const sample of entry.samples) {
        const name = `${entry.category}/${sample.id}`;
        expect(expectFiniteLeaves(sample.input, `${name} input`), name).toBeGreaterThan(0);
        const value = sample.evaluate();
        expect(expectFiniteLeaves(value, `${name} output`), name).toBeGreaterThan(0);
        outputs.push({ kind: sample.kind, value });
      }
      expect(outputs.find(({ kind }) => kind === "normal")?.value, entry.category)
        .not.toEqual(outputs.find(({ kind }) => kind === "boundary")?.value);
    }
  });
});

describe("sheen and anisotropic microfacet CPU references", () => {
  it("respects Charlie and visibility endpoints and rejects their singular domains", () => {
    expect(dCharlie(0, 1)).toBeCloseTo(3 / (2 * Math.PI), 14);
    expect(dCharlie(1, 0.43)).toBe(0);
    expect(vNeubelt(1, 1)).toBe(0.25);
    expect(vNeubelt(0.26, 0.71)).toBeCloseTo(vNeubelt(0.71, 0.26), 15);
    expect(() => dCharlie(0.4, 0)).toThrow(RangeError);
    expect(() => vNeubelt(0, 0)).toThrow(RangeError);
    expect(() => sheenDirect({ noL: 0.5, noV: 0.4, cosDeltaPhi: 1.01, roughness: 0.6 })).toThrow(RangeError);
  });

  it("integrates directional sheen and detects a perturbed lobe", () => {
    // A 0.1% CPU integration check compares different integration coordinates;
    // it is not a renderer tolerance.  The negative control deliberately
    // scales the direct lobe and must be rejected for both angular cases.
    for (const { noV, roughness } of [
      { noV: 0.28, roughness: 0.64 },
      { noV: 0.78, roughness: 0.86 }
    ]) {
      const directionalAlbedo = iblSheenBRDF(noV, roughness, { order: 128 });
      const integratedDirect = incidentHemisphereIntegral(noV, roughness);
      const perturbedDirect = incidentHemisphereIntegral(noV, roughness, 1.08);
      expect(directionalAlbedo).toBeGreaterThan(0);
      expect(relativeError(integratedDirect, directionalAlbedo)).toBeLessThan(0.001);
      expect(relativeError(perturbedDirect, directionalAlbedo)).toBeGreaterThan(0.07);
      expect(relativeError(perturbedDirect, directionalAlbedo)).not.toBeLessThan(0.001);
    }
  });

  it("preserves directional reciprocity and the isotropic GGX normal limit", () => {
    const input = { noL: 0.31, noV: 0.69, cosDeltaPhi: -0.38, roughness: 0.72 };
    expect(sheenDirect(input)).toBeCloseTo(sheenDirect({ ...input, noL: input.noV, noV: input.noL }), 15);
    const alpha = 0.37;
    expect(dGGXAnisotropic(alpha, alpha, 0, 0, 1)).toBeCloseTo(1 / (Math.PI * alpha * alpha), 14);
    expect(vGGXAnisotropic(0.3, 0.8, 0, 0, 1, 0, 0, 1)).toBeCloseTo(0.25, 15);
    const visibility = vGGXAnisotropic(0.3, 0.8, 0.6, 0, 0.8, 0, 0.8, 0.6);
    expect(visibility).toBeCloseTo(vGGXAnisotropic(0.3, 0.8, 0, 0.8, 0.6, 0.6, 0, 0.8), 15);
    expect(dGGXAnisotropic(0.3, 0.8, 0, 0, -1)).toBe(0);
    expect(() => vGGXAnisotropic(0.3, 0.8, 1, 0, 0, 0, 1, 0)).toThrow(RangeError);
    expect(() => dGGXAnisotropic(0, 0.5, 0, 0, 1)).toThrow(RangeError);
  });

  it("uses the specified anisotropy strength endpoints", () => {
    expect(anisotropyAlphaT(0.42, 0)).toBe(0.42);
    expect(anisotropyAlphaT(0.42, 1)).toBe(1);
    expect(anisotropyAlphaT(0, 0)).toBe(0);
    expect(() => anisotropyAlphaT(0.42, -0.01)).toThrow(RangeError);
  });
});

describe("optical and explicit material-heuristic CPU references", () => {
  it("reduces a zero-thickness film to the normal-incidence interface", () => {
    const film = evalIridescence({
      cosThetaIncident: 1,
      filmThicknessNm: 0,
      samples: [
        { wavelengthNm: 465, incidentIor: 1, filmIor: 1.31, substrateIor: 1.47 },
        { wavelengthNm: 615, incidentIor: 1, filmIor: 1.31, substrateIor: 1.47 }
      ]
    });
    for (const channel of film) expect(channel).toBeCloseTo(iorToF0(1.47), 15);
    expect(iorToF0(1.47, 1)).toBeCloseTo(iorToF0(1, 1.47), 15);
    expect(iorToF0(1.31, 1.31)).toBe(0);
    expect(() => evalIridescence({ cosThetaIncident: 1, filmThicknessNm: 0, samples: [] })).toThrow(RangeError);
    expect(() => iorToF0(0)).toThrow(RangeError);
  });

  it("applies Beer–Lambert over composable paths with transparent boundaries", () => {
    const color = [0.21, 0.57, 0.91] as const;
    const whole = volumeAttenuation(1.7, color, 2.4);
    const first = volumeAttenuation(0.6, color, 2.4);
    const second = volumeAttenuation(1.1, color, 2.4);
    for (let i = 0; i < 3; i++) expect(whole[i]).toBeCloseTo(first[i] * second[i], 14);
    expect(volumeAttenuation(0, [0, 0.4, 1], 2)).toEqual([1, 1, 1]);
    expect(volumeAttenuation(3, color, Infinity)).toEqual([1, 1, 1]);
    expect(() => volumeAttenuation(-0.1, color, 2)).toThrow(RangeError);
  });

  it("keeps material controls and single-pass coat compositing explicit", () => {
    expect(applyIorToRoughness(0.73, 1.47, 1.47)).toBeCloseTo(0.73, 15);
    expect(applyIorToRoughness(0.73, 1, 1.47)).toBe(0);
    const specular = specIorSpecularColor(1.47, [0.25, 0.5, 1], 0.6);
    const scale = iorToF0(1.47) * 0.6;
    expect(specular[0]).toBeCloseTo(scale * 0.25, 15);
    expect(specular[1]).toBeCloseTo(scale * 0.5, 15);
    expect(specular[2]).toBeCloseTo(scale, 15);
    expect(specIorSpecularF90(0)).toBe(0);
    expect(specIorSpecularF90(0.61)).toBe(0.61);
    expect(clearcoatFccCompose([0.2, 0.4, 0.6], [0.3, 0.2, 0.1], 0, 1)).toEqual([0.2, 0.4, 0.6]);
    expect(clearcoatFccCompose([0.2, 0.4, 0.6], [0.3, 0.2, 0.1], 1, 1)).toEqual([0.3, 0.2, 0.1]);
    expect(() => specIorSpecularF90(1.01)).toThrow(RangeError);
    expect(() => applyIorToRoughness(0.4, 1.4, 1)).toThrow(RangeError);
  });

  it("reports a normal slab ray and total internal reflection distinctly", () => {
    const normal = volumeTransmissionRay([0, 0, -1], [0, 0, 1], 1, 1.47, 2.3);
    expect(normal.kind).toBe("transmitted");
    if (normal.kind !== "transmitted") throw new Error("expected normal-incidence transmission");
    expect(normal.pathLength).toBeCloseTo(2.3, 15);
    expect(normal.direction[2]).toBeCloseTo(-1, 15);
    expect(normal.ray[2]).toBeCloseTo(-2.3, 15);
    const critical = volumeTransmissionRay([0.8, 0, -0.6], [0, 0, 1], 1.6, 1, 1);
    expect(critical.kind).toBe("total-internal-reflection");
    expect(() => volumeTransmissionRay([0, 0, 0], [0, 0, 1], 1, 1.47, 1)).toThrow(RangeError);
  });
});

describe("uniform-environment CPU model", () => {
  it("matches an incident-direction integration of the two GGX Fresnel basis terms", () => {
    // This CPU quadrature comparison establishes only the chosen model's
    // numerical behavior, not a renderer mapping or comparison tolerance.
    const noV = 0.63;
    const roughness = 0.71;
    const basis = environmentBRDF(noV, roughness, { polarSamples: 128, azimuthSamples: 128 });
    const incidentBasis = incidentGgxBasis(noV, roughness);
    expect(relativeError(basis.f0, incidentBasis.f0)).toBeLessThan(0.001);
    expect(relativeError(basis.f90, incidentBasis.f90)).toBeLessThan(0.001);
    expect(() => environmentBRDF(0, roughness)).toThrow(RangeError);
    expect(() => environmentBRDF(noV, 0)).toThrow(RangeError);
  });

  it("preserves black and perfect-reflector limits for the chosen multiple-scattering closure", () => {
    const basis = environmentBRDF(0.63, 0.71, { polarSamples: 128, azimuthSamples: 128 });
    expect(multiscatteringSingle(basis, 0, 0)).toBe(0);
    expect(multiscatteringMulti(basis, 0, 0)).toBe(0);
    expect(brdfGGXMultiscatter(basis, 0, 0)).toBe(0);
    expect(brdfGGXMultiscatter(basis, 1, 1)).toBeCloseTo(1, 14);
    const single = multiscatteringSingle(basis, 0.07, 0.82);
    const multi = multiscatteringMulti(basis, 0.07, 0.82);
    expect(single).toBeGreaterThan(0);
    expect(multi).toBeGreaterThan(0);
    expect(brdfGGXMultiscatter(basis, 0.07, 0.82)).toBeCloseTo(single + multi, 15);
    expect(() => multiscatteringMulti({ f0: 0, f90: 0 }, 0.5, 1)).toThrow(RangeError);
  });

  it("integrates explicit directional visibility including blocked and open endpoints", () => {
    const options = { polarSamples: 64, azimuthSamples: 64 };
    const occlusion = (visibility: (direction: readonly [number, number, number]) => number): number =>
      computeSpecularOcclusion(0.63, 0.71, 0.07, 0.82, visibility, options);
    expect(occlusion(() => 0)).toBe(0);
    expect(occlusion(() => 1)).toBe(1);
    expect(occlusion(() => 0.35)).toBeCloseTo(0.35, 14);
    const partial = occlusion(([x]) => x > 0 ? 1 : 0);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    expect(() => occlusion(() => 1.01)).toThrow(RangeError);
    expect(() => computeSpecularOcclusion(0.63, 0.71, 0, 0, () => 1, options)).toThrow(RangeError);
  });
});
