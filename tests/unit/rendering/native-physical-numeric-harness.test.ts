import { describe, expect, it } from "vitest";
import { PRD04_SHADER_CHUNKS, registerPrd04ShaderChunks } from "../../../packages/rendering/src/shaders/physical/index";
import { shaderChunk } from "../../../packages/rendering/src/contracts/program";
import { nativeDfgLutRg16f, NATIVE_DFG_LUT_SIZE, sampleNativeDfgLut } from "../../qr/prd04/oracles/native-dfg-lut";
import { PHYSICAL_CASES, PHYSICAL_CATEGORIES } from "../../qr/prd04/oracles/native-physical-cases";
import {
  buildNativePhysicalComputeWgsl,
  compareNumericValues,
  createNativePhysicalNumericPlan,
  describeNativePhysicalReadback,
  evaluateNativePhysicalConformance,
  F32_TOLERANCE,
  NATIVE_PHYSICAL_PRODUCTION_CHUNKS,
  nativeDfgRgba16f,
  productionPhysicalWgsl,
  sampleProductionSheenAlbedo,
} from "../../qr/prd04/oracles/native-physical-numeric-harness";
import { NATIVE_BRDF_WGSL } from "../../qr/prd04/shims/native-brdf.wgsl";

/** Top-level argument count of a call or declaration, starting just after its "(" (no comparisons inside). */
function argumentCount(source: string, open: number): number {
  let depth = 0, count = 1, index = open;
  for (; index < source.length; index++) {
    const ch = source[index]!;
    // Angle brackets nest template arguments such as ptr<function, T>.
    if (ch === "(" || ch === "<") depth++;
    else if (ch === ">" && depth > 0) depth--;
    else if (ch === ")") { if (depth === 0) break; depth--; }
    else if (ch === "," && depth === 0) count++;
  }
  return source.slice(open, index).trim() === "" ? 0 : count;
}

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
      expect(entry.contract, entry.id).toBe("documented-model-difference");
      expect(entry.productionFunction, entry.id).toMatch(/^a3d\w+ \(physical-wgsl\/\w+\.wgsl\.ts\)$/);
      const sample = PHYSICAL_CASES.find(({ category }) => category === entry.category)!.samples
        .find(({ id }) => id === entry.sampleId)!;
      expect(entry.reference, entry.id).toEqual(sample.evaluate());
    }
  });

  it("keeps model differences explicit and gives every probe a justified finite tolerance", () => {
    for (const probe of plan.probes) {
      expect(probe.limitations.trim().length, probe.id).toBeGreaterThan(30);
      expect(probe.expected.length, probe.id).toBeGreaterThan(0);
      expect(probe.expected.length, probe.id).toBeLessThanOrEqual(4);
      expect(probe.expected.every(Number.isFinite), probe.id).toBe(true);
      expect(probe.tolerance.rationale.trim().length, probe.id).toBeGreaterThan(30);
      expect(probe.tolerance.relative, probe.id).toBe(F32_TOLERANCE.relative);
      if (probe.physicalReference) {
        expect(probe.physicalReference.length, probe.id).toBe(probe.expected.length);
        expect(probe.physicalReference.every(Number.isFinite), probe.id).toBe(true);
      }
      if (probe.mapping === "equation") {
        // Closed-form production functions are held to the f32 bound against the unmodified reference.
        expect(probe.tolerance, probe.id).toEqual(F32_TOLERANCE);
        const sample = PHYSICAL_CASES.find(({ category }) => category === probe.category)!.samples
          .find(({ id }) => id === probe.sampleId)!;
        const reference = sample.evaluate();
        if (typeof reference === "number") expect(probe.expected, probe.id).toEqual([reference]);
        else if (Array.isArray(reference) && reference.every((value) => typeof value === "number")) {
          expect(probe.expected, probe.id).toEqual(reference);
        } else throw new Error(`${probe.id}: equation probe without a numeric reference`);
      } else {
        expect(probe.physicalReference, probe.id).toBeDefined();
      }
    }
    // f32 bound: 2^-13 relative is far above ~600 ULP of accumulated f32 error and far below the 8% control.
    expect(F32_TOLERANCE.relative).toBe(2 ** -13);
    expect(F32_TOLERANCE.absolute).toBe(2 ** -20);
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "computeSpecularOcclusion")) {
      expect(reason).toContain("directional visibility");
    }
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "evalIridescence")) {
      expect(reason).toContain("monochromatic");
    }
    for (const { reason } of plan.unmapped.filter(({ category }) => category === "multiscatteringMulti")) {
      expect(reason).toContain("different");
    }
    expect([...new Set(plan.unmapped.map(({ category }) => category))].sort()).toEqual([
      "applyIorToRoughness", "brdfGGXMultiscatter", "computeSpecularOcclusion", "evalIridescence",
      "multiscatteringMulti", "volumeTransmissionRay",
    ]);
  });

  it("reads the production sheen albedo table and keeps the physical integral as a diagnostic", () => {
    const probes = plan.probes.filter(({ category }) => category === "iblSheenBRDF");
    expect(probes).toHaveLength(2);
    for (const probe of probes) {
      const sample = PHYSICAL_CASES.find(({ category }) => category === "iblSheenBRDF")!.samples.find(({ id }) => id === probe.sampleId)!;
      const [noV, roughness] = sample.input as readonly [number, number];
      expect(probe.mapping).toBe("native-lut-transport");
      expect(probe.expected).toEqual([sampleProductionSheenAlbedo(noV, roughness)]);
      expect(probe.physicalReference).toEqual([sample.evaluate()]);
      expect(probe.tolerance).toEqual(F32_TOLERANCE);
      // The 16 x 16 table stays within 0.5% of the independent hemisphere integral at these samples.
      expect(Math.abs(probe.expected[0]! - probe.physicalReference![0]!)).toBeLessThan(0.005);
    }
    const direct = plan.probes.filter(({ category }) => category === "sheenDirect");
    expect(direct).toHaveLength(2);
    for (const probe of direct) {
      expect(probe.mapping).toBe("equation");
      expect(probe.physicalReference).toBeUndefined();
    }
  });

  it("maps independent case values into the production functions and their argument order", () => {
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
    expect(plan.probes.find(({ id }) => id === "volumeAttenuation/finite-absorbing-path")?.statement)
      .toBe("vec4f(a3dVolumeAttenuation(2.4, vec3f(0.9, 0.6, 0.3), 4.5), 0.0)");
    expect(plan.probes.find(({ id }) => id === "iorToF0/dielectric-interface")?.statement)
      .toBe("vec4f(a3dPrd04IorToF0f(1.47, 1.0), 0.0, 0.0, 0.0)");
    expect(plan.probes.find(({ id }) => id === "specIorSpecularColor/tinted-dielectric")?.statement)
      .toBe("vec4f(a3dPrd04SpecIorSpecularColor(1.47, vec3f(0.9, 0.7, 0.55), 0.82), 0.0)");
    expect(plan.probes.find(({ id }) => id === "specIorSpecularF90/partial-specular-factor")?.statement)
      .toBe("vec4f(a3dPrd04SpecIorSpecularF90(0.65, 0.0), 0.0, 0.0, 0.0)");
    expect(plan.probes.find(({ id }) => id === "multiscatteringSingle/dielectric-single")?.statement)
      .toContain("a3dPrd04EnvironmentBRDF(vec3f(0.0, 0.0, 1.0), ");
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
    // Filtering bound: f32 bound plus 2^-4 of the 2 x 2 footprint spread (>= 4 sub-texel bits).
    expect(probe.tolerance.absolute).toBeGreaterThan(F32_TOLERANCE.absolute);
    expect(probe.tolerance.absolute).toBeLessThan(0.01);
    expect(probe.tolerance.rationale).toContain("sub-texel");
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

  it("evaluates the WGSL the renderer registers for its PRD-04 chunks, not a separate copy", () => {
    registerPrd04ShaderChunks();
    for (const name of NATIVE_PHYSICAL_PRODUCTION_CHUNKS) {
      const chunk = PRD04_SHADER_CHUNKS.find((entry) => entry.name === name)!;
      expect(productionPhysicalWgsl(name), name).toBe(chunk.wgsl);
      // The renderer's program registry resolves the very same chunk object.
      expect(shaderChunk(name)?.wgsl, name).toBe(chunk.wgsl);
    }
  });

  it("builds production WGSL and every probe calls a declared production function with its declared arity", () => {
    const source = buildNativePhysicalComputeWgsl(plan);
    expect(source).toContain(NATIVE_BRDF_WGSL);
    for (const name of NATIVE_PHYSICAL_PRODUCTION_CHUNKS) expect(source).toContain(productionPhysicalWgsl(name));
    expect(source).toContain("@compute @workgroup_size(1) fn main()");
    expect(source).toContain("@group(0) @binding(0) var<storage, read_write> numericResults");
    const declared = new Map<string, number>();
    for (const match of source.matchAll(/\bfn\s+(\w+)\s*\(/g)) {
      declared.set(match[1]!, argumentCount(source, match.index! + match[0].length));
    }
    const body = source.slice(source.indexOf("fn main()"));
    let calls = 0;
    for (const match of body.matchAll(/\b(a3d\w+)\s*\(/g)) {
      calls++;
      expect(declared.has(match[1]!), match[1]).toBe(true);
      expect(argumentCount(body, match.index! + match[0].length), match[1]).toBe(declared.get(match[1]!));
    }
    expect(calls).toBeGreaterThanOrEqual(plan.probes.length);
    const initializerCalls = source.match(/a3dPrd04AnisotropyInit\(&lobes\d+/g) ?? [];
    const initializerSamples = plan.probes.filter(({ category }) => category === "anisotropyAlphaT");
    expect(initializerSamples.length).toBeGreaterThan(0);
    expect(initializerCalls).toHaveLength(initializerSamples.length);
    expect(source).toMatch(/numericResults\[\d+u\] = vec4f\(lobes\d+\.alphaT/);
    expect(source).toContain(`numericResults[${plan.probes.length}u] = ${plan.negativeControl.statement};`);
    expect(source).not.toContain("INIT_ANISOTROPY(");
    // One struct declaration (from the production common chunk), no harness-local copy.
    expect(source.match(/struct A3DPrd04Lobes/g)).toHaveLength(1);
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
      // Float32Array storage rounds each expectation once (2^-24 relative), well inside the bound.
      expect(item.comparison.verdict, item.id).toBe("within-tolerance");
    }
    expect(report.measurements.find(({ category }) => category === "environmentBRDF")?.physicalComparison).toBeDefined();
    expect(report.negativeControl.movedAwayFromReference).toBe(true);
    expect(report.negativeControl.comparison.verdict).toBe("outside-tolerance");
    expect(evaluateNativePhysicalConformance(plan, report)).toEqual({ status: "passed", reasons: [] });

    // A changed production formula (2^-11 relative error on one probe) fails the gate.
    const drifted = synthetic.slice();
    const driftIndex = plan.probes.findIndex(({ id }) => id === "vGGXAnisotropic/unequal-slopes-and-directions");
    drifted[driftIndex * 4] = drifted[driftIndex * 4]! * (1 + 2 ** -11);
    const driftGate = evaluateNativePhysicalConformance(plan, describeNativePhysicalReadback(plan, drifted));
    expect(driftGate.status).toBe("failed");
    expect(driftGate.reasons.join("\n")).toContain("vGGXAnisotropic/unequal-slopes-and-directions: outside-tolerance");

    // An exclusion without its contract fails the gate.
    const undocumented = { ...plan, unmapped: plan.unmapped.map((entry, index) => index === 0 ? { ...entry, productionFunction: "" } : entry) };
    expect(evaluateNativePhysicalConformance(undocumented, report).status).toBe("failed");
    // A dropped sample fails the accounting check.
    const dropped = { ...plan, unmapped: plan.unmapped.slice(1) };
    expect(evaluateNativePhysicalConformance(dropped, report).reasons.join("\n")).toContain("not accounted for");

    synthetic[plan.probes.length * 4] = baseline.expected[0]!;
    const undetected = describeNativePhysicalReadback(plan, synthetic);
    expect(undetected.negativeControl.movedAwayFromReference).toBe(false);
    expect(evaluateNativePhysicalConformance(plan, undetected).reasons).toContain("the perturbed negative control was not detected");
    expect(() => describeNativePhysicalReadback(plan, synthetic.subarray(1))).toThrow(RangeError);
    synthetic[0] = NaN;
    expect(() => describeNativePhysicalReadback(plan, synthetic)).toThrow(RangeError);
  });
});
