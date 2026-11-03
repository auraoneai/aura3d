import { describe, expect, it } from "vitest";
import { A3D_PRD04_ANISOTROPY_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Anisotropy";
import { A3D_PRD04_CLEARCOAT_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Clearcoat";
import { A3D_PRD04_SHEEN_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Sheen";
import { nativeDfgLutRg16f, NATIVE_DFG_LUT_SIZE, sampleNativeDfgLut } from "../../qr/prd04/oracles/native-dfg-lut";
import { PHYSICAL_CASES, PHYSICAL_CATEGORIES } from "../../qr/prd04/oracles/native-physical-cases";
import {
  buildNativePhysicalComputeWgsl,
  compareNumericValues,
  createNativePhysicalNumericPlan,
  describeNativePhysicalReadback,
  nativeDfgRgba16f,
} from "../../qr/prd04/oracles/native-physical-numeric-harness";
import { NATIVE_BRDF_WGSL } from "../../qr/prd04/shims/native-brdf.wgsl";

const requiredCategories = [
  "dCharlie", "vNeubelt", "iblSheenBRDF", "dGGXAnisotropic", "vGGXAnisotropic",
  "evalIridescence", "computeSpecularOcclusion", "applyIorToRoughness", "volumeAttenuation",
  "iorToF0", "specIorSpecularColor", "specIorSpecularF90", "clearcoatFccCompose",
  "environmentBRDF", "multiscatteringSingle", "multiscatteringMulti", "sheenDirect",
  "brdfGGXMultiscatter", "anisotropyAlphaT", "volumeTransmissionRay",
] as const;

describe("native physical numerical probe plan", () => {
  const plan = createNativePhysicalNumericPlan();

  it("accounts exactly once for every normal and boundary sample in all 20 categories", () => {
    expect([...PHYSICAL_CATEGORIES]).toEqual(expect.arrayContaining([...requiredCategories]));
    expect(new Set(PHYSICAL_CATEGORIES).size).toBe(PHYSICAL_CATEGORIES.length);
    expect(plan.categories).toEqual([...PHYSICAL_CATEGORIES]);
    const intended = PHYSICAL_CASES.flatMap((entry) => entry.samples.map((sample) => `${entry.category}/${sample.id}`));
    const represented = [...plan.probes, ...plan.unmapped].map(({ id }) => id);
    expect(represented).toHaveLength(intended.length);
    expect(new Set(represented).size).toBe(intended.length);
    expect([...represented].sort()).toEqual([...intended].sort());
    for (const entry of PHYSICAL_CASES) {
      const samples = [...plan.probes, ...plan.unmapped].filter(({ category }) => category === entry.category);
      expect(samples.some(({ sampleKind }) => sampleKind === "normal"), entry.category).toBe(true);
      expect(samples.some(({ sampleKind }) => sampleKind === "boundary"), entry.category).toBe(true);
      for (const sample of samples) expect(sample.model, sample.id).toBe(entry.model);
    }
    for (const entry of plan.unmapped) {
      expect(entry.reason.trim().length, entry.id).toBeGreaterThan(30);
      const sample = PHYSICAL_CASES.find(({ category }) => category === entry.category)!.samples
        .find(({ id }) => id === entry.sampleId)!;
      expect(entry.reference, entry.id).toEqual(sample.evaluate());
    }
  });

  it("keeps model differences and unestablished tolerances explicit", () => {
    for (const probe of plan.probes) {
      expect(probe.limitations.trim().length, probe.id).toBeGreaterThan(30);
      expect(probe.expected.length, probe.id).toBeGreaterThan(0);
      expect(probe.expected.length, probe.id).toBeLessThanOrEqual(4);
      expect(probe.expected.every(Number.isFinite), probe.id).toBe(true);
      if (probe.physicalReference) {
        expect(probe.physicalReference.length, probe.id).toBe(probe.expected.length);
        expect(probe.physicalReference.every(Number.isFinite), probe.id).toBe(true);
      }
      if (probe.mapping === "different-boundary") {
        expect(probe.limitations, probe.id).toMatch(/horizon|boundary|limit/i);
      }
      if (probe.mapping !== "native-dfg-transport" &&
          probe.category !== "sheenDirect" && probe.category !== "iblSheenBRDF") {
        const sample = PHYSICAL_CASES.find(({ category }) => category === probe.category)!.samples
          .find(({ id }) => id === probe.sampleId)!;
        const reference = sample.evaluate();
        if (typeof reference === "number") expect(probe.expected, probe.id).toEqual([reference]);
        else if (Array.isArray(reference) && reference.every((value) => typeof value === "number")) {
          expect(probe.expected, probe.id).toEqual(reference);
        }
      }
    }
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "computeSpecularOcclusion")) {
      expect(reason).toContain("directional visibility");
    }
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "evalIridescence")) {
      expect(reason).toContain("monochromatic");
    }
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "multiscatteringMulti")) {
      expect(reason).toContain("different");
    }
    for (const probe of plan.probes.filter(({ category, mapping }) =>
      category === "iblSheenBRDF" && mapping === "quadrature-approximation")) {
      expect(probe.limitations).toMatch(/quadrature/i);
    }
  });

  it("keeps unscaled sheen references while comparing against the derived normalized model", () => {
    for (const probe of plan.probes.filter(({ category }) => category === "sheenDirect" || category === "iblSheenBRDF")) {
      const sample = PHYSICAL_CASES.find(({ category }) => category === probe.category)!.samples
        .find(({ id }) => id === probe.sampleId)!;
      const output = sample.evaluate();
      if (typeof output !== "number") throw new Error(`expected scalar sheen reference for ${probe.id}`);
      const roughness = probe.category === "sheenDirect"
        ? (sample.input[0] as { roughness: number }).roughness
        : sample.input[1] as number;
      const p = 1 / Math.max(Math.min(Math.max(roughness, 0), 1) ** 2, 0.001);
      const tangent = (p + 2) / Math.sqrt(2 * Math.PI * (p + 1));
      const globalBound = Math.min((p + 2) / 4, Math.sqrt(1 + tangent * tangent));
      const scale = 0.98 / Math.max(1, globalBound);
      expect(probe.physicalReference, probe.id).toEqual([output]);
      expect(probe.expected[0], probe.id).toBeCloseTo(output * scale, 12);
      expect(probe.mapping, probe.id).toBe(probe.category === "sheenDirect" ? "bounded-sheen" : "quadrature-approximation");
      expect(probe.limitations, probe.id).toContain("unscaled");
    }
  });

  it("maps independent case values into the actual candidate functions and their argument order", () => {
    expect(plan.probes.find(({ id }) => id === "dCharlie/sloped-half-vector")?.statement)
      .toBe("vec4f(a3dPrd04DCharlie(0.72, 0.6), 0.0, 0.0, 0.0)");
    expect(plan.probes.find(({ id }) => id === "vNeubelt/oblique-light-and-view")?.statement)
      .toBe("vec4f(a3dPrd04VNeubelt(0.82, 0.3), 0.0, 0.0, 0.0)");
    expect(plan.probes.find(({ id }) => id === "dGGXAnisotropic/unequal-slope-widths")?.statement)
      .toContain("a3dPrd04DGGXAnisotropic(0.36, 0.8, 0.6, 0.48, 0.64)");
    expect(plan.probes.find(({ id }) => id === "vGGXAnisotropic/unequal-slopes-and-directions")?.statement)
      .toContain("a3dPrd04VGGXAnisotropic(0.36, 0.8, 0.0, 0.8, 0.6, 0.0, 0.6, 0.8)");
    expect(plan.probes.find(({ category }) => category === "clearcoatFccCompose")?.statement)
      .toContain("a3dPrd04ComposeClearcoat(");
    expect(plan.probes.find(({ category }) => category === "sheenDirect")?.statement)
      .toContain("a3dPrd04SheenDirect(");
  });

  it("compares the DFG transport against the native sampler and separately exposes the physical integral", () => {
    const probe = plan.probes.find(({ id }) => id === "environmentBRDF/oblique-view-and-roughness")!;
    expect(probe.mapping).toBe("native-dfg-transport");
    expect(probe.statement).toContain("a3dDFG(0.63, 0.58)");
    expect(probe.expected).toEqual(sampleNativeDfgLut(0.63, 0.58));
    expect(probe.expected).not.toEqual(sampleNativeDfgLut(0.58, 0.63));
    const cpu = PHYSICAL_CASES.find(({ category }) => category === "environmentBRDF")!.samples[0]!.evaluate();
    if (typeof cpu !== "object" || cpu === null || !("f0" in cpu) || !("f90" in cpu)) throw new Error("expected CPU basis");
    expect(probe.physicalReference).toEqual([cpu.f0, cpu.f90]);
    expect(probe.limitations).toContain("not an independent LUT");
  });

  it("uploads native binary16 RG words with zero blue and half-float one alpha", () => {
    const rg = nativeDfgLutRg16f();
    const rgba = nativeDfgRgba16f();
    expect(rgba).toHaveLength(NATIVE_DFG_LUT_SIZE ** 2 * 4);
    for (let texel = 0; texel < rg.length / 2; texel++) {
      expect([...rgba.slice(texel * 4, texel * 4 + 4)]).toEqual([rg[texel * 2], rg[texel * 2 + 1], 0, 0x3c00]);
    }
    rgba[0] = 0;
    expect(nativeDfgRgba16f()[0]).toBe(rg[0]);
  });

  it("builds actual candidate WGSL and invokes the initializer instead of reproducing alphaT inline", () => {
    const source = buildNativePhysicalComputeWgsl(plan);
    expect(source).toContain(NATIVE_BRDF_WGSL);
    expect(source).toContain(A3D_PRD04_ANISOTROPY_WGSL);
    expect(source).toContain(A3D_PRD04_SHEEN_WGSL);
    expect(source).toContain(A3D_PRD04_CLEARCOAT_WGSL);
    expect(source).toContain("@compute @workgroup_size(1) fn main()");
    expect(source).toContain("@group(0) @binding(0) var<storage, read_write> numericResults");
    const initializerCalls = source.match(/a3dPrd04AnisotropyInit\(&lobes\d+/g) ?? [];
    const initializerSamples = plan.probes.filter(({ category }) => category === "anisotropyAlphaT");
    expect(initializerSamples.length).toBeGreaterThan(0);
    expect(initializerCalls).toHaveLength(initializerSamples.length);
    expect(source).toMatch(/numericResults\[\d+u\] = vec4f\(lobes\d+\.alphaT/);
    expect(source).toContain(`numericResults[${plan.probes.length}u] = ${plan.negativeControl.statement};`);
    expect(source).not.toContain("INIT_ANISOTROPY(");
  });
});

describe("numeric comparison and negative control", () => {
  it("rejects missing, mismatched, and non-finite components and reports zero references honestly", () => {
    expect(() => compareNumericValues([], [])).toThrow(RangeError);
    expect(() => compareNumericValues([1], [1, 2])).toThrow(RangeError);
    expect(() => compareNumericValues([NaN], [1])).toThrow(RangeError);
    expect(() => compareNumericValues([1], [Infinity])).toThrow(RangeError);
    expect(() => compareNumericValues([1e308], [-1e308])).toThrow(RangeError);
    expect(() => compareNumericValues([Number.MIN_VALUE], [1])).toThrow(RangeError);
    expect(() => compareNumericValues([1], [1], { absolute: 1, relative: 0, rationale: " " })).toThrow(RangeError);
    const result = compareNumericValues([0, 2], [0.1, 2.5]);
    expect(result.absoluteError).toEqual([0.1, 0.5]);
    expect(result.relativeError).toEqual([null, 0.25]);
    expect(result.verdict).toBe("unresolved");
  });

  it("detects an 8% perturbation in a comparator-only example without claiming shader execution", () => {
    // This hand-chosen threshold tests the comparator itself. It is NOT a
    // renderer or hardware tolerance and is never placed in the probe plan.
    const comparatorOnly = { absolute: 0, relative: 0.04, rationale: "synthetic comparator check" };
    expect(compareNumericValues([1], [1], comparatorOnly).verdict).toBe("within-tolerance");
    expect(compareNumericValues([1], [1.08], comparatorOnly).verdict).toBe("outside-tolerance");
    const plan = createNativePhysicalNumericPlan();
    expect(plan.negativeControl.baselineId).toBe("dCharlie/sloped-half-vector");
    expect(plan.negativeControl.scale).toBe(1.08);
    expect(plan.negativeControl.statement).toContain("1.08 * a3dPrd04DCharlie(0.72, 0.6)");
  });

  it("processes all readback channels and the control without classifying synthetic inputs as shader execution", () => {
    const plan = createNativePhysicalNumericPlan();
    // Test only the report transformation with synthetic data. Actual browser
    // measurements must originate from the separately authored GPU readback.
    const synthetic = new Float32Array((plan.probes.length + 1) * 4);
    plan.probes.forEach((probe, index) => probe.expected.forEach((value, component) => {
      synthetic[index * 4 + component] = value;
    }));
    const baseline = plan.probes.find(({ id }) => id === plan.negativeControl.baselineId)!;
    synthetic[plan.probes.length * 4] = baseline.expected[0]! * plan.negativeControl.scale;
    const report = describeNativePhysicalReadback(plan, synthetic);
    expect(report.measurements).toHaveLength(plan.probes.length);
    for (const item of report.measurements) {
      if (item.tolerance === "unresolved") {
        expect(item.comparison.verdict, item.id).toBe("unresolved");
      }
      if (item.mapping === "different-boundary") {
        expect(item.comparison.verdict, item.id).not.toBe("within-tolerance");
      }
    }
    expect(report.measurements.find(({ category }) => category === "environmentBRDF")?.physicalComparison).toBeDefined();
    expect(report.negativeControl.movedAwayFromReference).toBe(true);
    synthetic[plan.probes.length * 4] = baseline.expected[0]!;
    expect(describeNativePhysicalReadback(plan, synthetic).negativeControl.movedAwayFromReference).toBe(false);
    expect(() => describeNativePhysicalReadback(plan, synthetic.subarray(1))).toThrow(RangeError);
    synthetic[0] = NaN;
    expect(() => describeNativePhysicalReadback(plan, synthetic)).toThrow(RangeError);
  });
});
