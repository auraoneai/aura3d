/**
 * Native physical-lighting numerical harness, authored independently from the
 * documented CPU models and the explicitly independent shader candidates.
 *
 * These candidates are not connected to the Aura renderer. In particular,
 * compiling or executing the generated compute program is not renderer or
 * pixel evidence. A mapped sample records measured error, not a conformance
 * pass: shader precision, LUT filtering, and approximation tolerances have not
 * been established. Unmapped samples remain visible in the inventory.
 */
import { A3D_PRD04_ANISOTROPY_WGSL } from "../../../../packages/rendering/src/shaders/independent-wgsl/Anisotropy";
import { A3D_PRD04_CLEARCOAT_WGSL } from "../../../../packages/rendering/src/shaders/independent-wgsl/Clearcoat";
import { A3D_PRD04_SHEEN_WGSL } from "../../../../packages/rendering/src/shaders/independent-wgsl/Sheen";
import { NATIVE_BRDF_WGSL } from "../shims/native-brdf.wgsl";
import { nativeDfgLutRg16f, NATIVE_DFG_LUT_SIZE, sampleNativeDfgLut } from "./native-dfg-lut";
import {
  PHYSICAL_CASES,
  type PhysicalCaseSample,
  type PhysicalCategory,
  type PhysicalModel,
  type PhysicalOutput,
} from "./native-physical-cases";
import type { SheenDirectInput } from "./native-reference-sheen";

export type MappingKind = "equation" | "bounded-sheen" | "quadrature-approximation" | "native-dfg-transport" | "different-boundary";

export interface NumericProbe {
  readonly id: string;
  readonly category: PhysicalCategory;
  readonly sampleId: string;
  readonly sampleKind: "normal" | "boundary";
  readonly model: PhysicalModel;
  readonly mapping: MappingKind;
  /** WGSL using the candidate's real function, with any required input conversion. */
  readonly statement: string;
  readonly expected: readonly number[];
  /** Independent unmodified model result, when the primary expectation adapts its semantics. */
  readonly physicalReference?: readonly number[];
  readonly limitations: string;
  readonly tolerance: "unresolved";
}

export interface UnmappedSample {
  readonly id: string;
  readonly category: PhysicalCategory;
  readonly sampleId: string;
  readonly sampleKind: "normal" | "boundary";
  readonly model: PhysicalModel;
  readonly reason: string;
  /** CPU-only independent reference; this is not a shader observation. */
  readonly reference: PhysicalOutput;
}

export interface NumericPlan {
  readonly categories: readonly PhysicalCategory[];
  readonly probes: readonly NumericProbe[];
  readonly unmapped: readonly UnmappedSample[];
  /** Extra output evaluates a deliberately scaled shader lobe, not a fixture. */
  readonly negativeControl: {
    readonly id: string;
    readonly baselineId: string;
    readonly statement: string;
    readonly scale: number;
  };
}

export interface NumericalDifference {
  readonly expected: readonly number[];
  readonly observed: readonly number[];
  readonly absoluteError: readonly number[];
  /** Null where the reference is zero, so zero is never hidden by a made-up denominator. */
  readonly relativeError: readonly (number | null)[];
  readonly verdict: "unresolved" | "within-tolerance" | "outside-tolerance";
}

export interface ExplicitTolerance {
  readonly absolute: number;
  readonly relative: number;
  readonly rationale: string;
}

export interface ProbeMeasurement {
  readonly id: string;
  readonly category: PhysicalCategory;
  readonly sampleId: string;
  readonly sampleKind: "normal" | "boundary";
  readonly model: PhysicalModel;
  readonly mapping: MappingKind;
  readonly limitations: string;
  readonly tolerance: "unresolved";
  readonly comparison: NumericalDifference;
  readonly physicalComparison?: NumericalDifference;
}

export interface MeasuredProbeReport {
  readonly measurements: readonly ProbeMeasurement[];
  readonly negativeControl: {
    readonly id: string;
    readonly baselineId: string;
    readonly scale: number;
    readonly comparison: NumericalDifference;
    readonly movedAwayFromReference: boolean;
  };
}

/** Widen actual binary16 RG words to the candidate's RGBA16F upload layout. */
export function nativeDfgRgba16f(): Uint16Array {
  const rg = nativeDfgLutRg16f();
  const rgba = new Uint16Array(NATIVE_DFG_LUT_SIZE * NATIVE_DFG_LUT_SIZE * 4);
  for (let texel = 0; texel < rg.length / 2; texel++) {
    rgba[texel * 4] = rg[texel * 2]!;
    rgba[texel * 4 + 1] = rg[texel * 2 + 1]!;
    rgba[texel * 4 + 2] = 0;
    rgba[texel * 4 + 3] = 0x3c00;
  }
  return rgba;
}

/** Generic comparison arithmetic; caller-supplied bounds are never shader defaults. */
export function compareNumericValues(
  expected: readonly number[], observed: readonly number[], tolerance?: ExplicitTolerance,
): NumericalDifference {
  if (expected.length === 0 || expected.length !== observed.length ||
      !expected.every(Number.isFinite) || !observed.every(Number.isFinite)) {
    throw new RangeError("comparison requires equally sized, nonempty finite numeric vectors");
  }
  if (tolerance && (!Number.isFinite(tolerance.absolute) || tolerance.absolute < 0 ||
      !Number.isFinite(tolerance.relative) || tolerance.relative < 0 || !tolerance.rationale.trim())) {
    throw new RangeError("tolerance requires finite nonnegative bounds and a rationale");
  }
  const absoluteError = expected.map((value, index) => Math.abs(value - observed[index]!));
  const relativeError = expected.map((value, index) => value === 0 ? null : absoluteError[index]! / Math.abs(value));
  if (!absoluteError.every(Number.isFinite) || !relativeError.every((value) => value === null || Number.isFinite(value))) {
    throw new RangeError("comparison error exceeds the finite numeric range");
  }
  if (tolerance && expected.some((value) => !Number.isFinite(tolerance.absolute + tolerance.relative * Math.abs(value)))) {
    throw new RangeError("combined tolerance exceeds the finite numeric range");
  }
  const verdict = !tolerance ? "unresolved" : absoluteError.every((error, index) =>
    error <= tolerance.absolute + tolerance.relative * Math.abs(expected[index]!))
    ? "within-tolerance" : "outside-tolerance";
  return { expected: [...expected], observed: [...observed], absoluteError, relativeError, verdict };
}

/** Analyze readback values only; this function does not execute a shader. */
export function describeNativePhysicalReadback(plan: NumericPlan, values: ArrayLike<number>): MeasuredProbeReport {
  if (values.length !== (plan.probes.length + 1) * 4) throw new RangeError("readback has an unexpected vec4 record count");
  const measurements = plan.probes.map((probe, index): ProbeMeasurement => {
    const observed = Array.from({ length: probe.expected.length }, (_, component) => values[index * 4 + component]!);
    return {
      id: probe.id, category: probe.category, sampleId: probe.sampleId, sampleKind: probe.sampleKind,
      model: probe.model, mapping: probe.mapping, limitations: probe.limitations, tolerance: probe.tolerance,
      comparison: compareNumericValues(probe.expected, observed),
      ...(probe.physicalReference ? { physicalComparison: compareNumericValues(probe.physicalReference, observed) } : {}),
    };
  });
  const baseline = measurements.find((item) => item.id === plan.negativeControl.baselineId);
  if (!baseline) throw new Error("negative-control baseline is missing from the measurements");
  const control = compareNumericValues(baseline.comparison.expected, [values[plan.probes.length * 4]!]);
  return {
    measurements,
    negativeControl: {
      ...plan.negativeControl, comparison: control,
      movedAwayFromReference: control.absoluteError[0]! > baseline.comparison.absoluteError[0]!,
    },
  };
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function vector3(value: unknown, label: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${label} must have three components`);
  return [number(value[0], label), number(value[1], label), number(value[2], label)];
}

function literal(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("WGSL values must be finite");
  const normalized = Object.is(value, -0) ? "0" : String(value);
  return /[.eE]/.test(normalized) ? normalized : `${normalized}.0`;
}

function vec3(value: readonly [number, number, number]): string {
  return `vec3f(${value.map(literal).join(", ")})`;
}

function numericOutput(sample: PhysicalCaseSample): readonly number[] {
  const value = sample.evaluate();
  if (typeof value === "number") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  throw new TypeError(`sample ${sample.id} is not a scalar or numeric vector`);
}

/** Independent double-precision evaluation of the candidate's derived bound. */
function boundedSheenScale(roughness: number): number {
  const r = Math.min(1, Math.max(0, roughness));
  const p = 1 / Math.max(r * r, 0.001);
  const tangentBound = (p + 2) / Math.sqrt(2 * Math.PI * (p + 1));
  const globalBound = Math.min((p + 2) / 4, Math.hypot(1, tangentBound));
  return 0.98 / Math.max(1, globalBound);
}

const unavailableReasons: Partial<Record<PhysicalCategory, string>> = {
  evalIridescence: "The CPU reference reports monochromatic dielectric samples; no independently authored shader with matching wavelength, illuminant and substrate semantics is wired here.",
  computeSpecularOcclusion: "The reference integrates a directional visibility field; a scalar ambient-occlusion heuristic cannot supply that field.",
  applyIorToRoughness: "No independent candidate with this reference's incident and reference IOR convention is available.",
  volumeAttenuation: "No independently authored volume-attenuation shader candidate is connected to this harness.",
  iorToF0: "No independently authored IOR interface shader candidate is connected to this harness.",
  specIorSpecularColor: "No independently authored shader candidate with the same tint, factor and incident-IOR convention is connected.",
  specIorSpecularF90: "No independently authored shader candidate with this factor convention is connected.",
  multiscatteringSingle: "The common candidate uses a heuristic escape fraction, not the reference's integrated GGX basis.",
  multiscatteringMulti: "The common candidate uses a different escape fraction and closure from the independent integrated model.",
  brdfGGXMultiscatter: "The available direct-lobe correction and common candidate do not implement the reference's integrated multiple-scattering closure.",
  volumeTransmissionRay: "The reference distinguishes transmitted direction, path length and total internal reflection; no matching independent shader candidate is connected.",
};

/** Resolve every case from the CPU inventory; never invent outputs for missing candidates. */
export function createNativePhysicalNumericPlan(): NumericPlan {
  const probes: NumericProbe[] = [];
  const unmapped: UnmappedSample[] = [];
  for (const entry of PHYSICAL_CASES) {
    for (const sample of entry.samples) {
      const id = `${entry.category}/${sample.id}`;
      const base = { id, category: entry.category, sampleId: sample.id, sampleKind: sample.kind, model: entry.model };
      const args: readonly unknown[] = sample.input;
      let statement = "";
      let mapping: MappingKind = "equation";
      let limitations = "Finite f32 shader arithmetic and hardware behavior remain unvalidated.";
      let expected: readonly number[] | undefined;
      let physicalReference: readonly number[] | undefined;
      switch (entry.category) {
        case "dCharlie": {
          const noH = number(args[0], id), roughness = number(args[1], id);
          statement = `vec4f(a3dPrd04DCharlie(${literal(roughness)}, ${literal(noH)}), 0.0, 0.0, 0.0)`;
          break;
        }
        case "vNeubelt": {
          const noL = number(args[0], id), noV = number(args[1], id);
          statement = `vec4f(a3dPrd04VNeubelt(${literal(noV)}, ${literal(noL)}), 0.0, 0.0, 0.0)`;
          break;
        }
        case "iblSheenBRDF": {
          const noV = number(args[0], id), roughness = number(args[1], id);
          statement = `vec4f(a3dPrd04IBLSheen(${literal(noV)}, ${literal(roughness)}), 0.0, 0.0, 0.0)`;
          mapping = "quadrature-approximation";
          physicalReference = numericOutput(sample);
          expected = physicalReference.map((value) => value * boundedSheenScale(roughness));
          limitations = "The shader uses a 16 by 32 warped midpoint quadrature with a derived energy normalization; its primary expectation scales the higher-order CPU integral, while physicalReference preserves the unscaled model. The shader clamps to a conservative bound; GPU precision and tolerance remain unvalidated.";
          break;
        }
        case "dGGXAnisotropic": {
          const [at, ab, ht, hb, hn] = args.map((value) => number(value, id));
          statement = `vec4f(a3dPrd04DGGXAnisotropic(${literal(at!)}, ${literal(ab!)}, ${literal(hn!)}, ${literal(ht!)}, ${literal(hb!)}), 0.0, 0.0, 0.0)`;
          if (hn === 0) {
            mapping = "different-boundary";
            limitations = "At the horizon the shader returns zero; the reference reports the one-sided distribution limit. Their difference is diagnostic, not a tolerance failure.";
          }
          break;
        }
        case "vGGXAnisotropic": {
          const [at, ab, lt, lb, ln, vt, vb, vn] = args.map((value) => number(value, id));
          statement = `vec4f(a3dPrd04VGGXAnisotropic(${literal(at!)}, ${literal(ab!)}, ${literal(vt!)}, ${literal(vb!)}, ${literal(lt!)}, ${literal(lb!)}, ${literal(vn!)}, ${literal(ln!)}), 0.0, 0.0, 0.0)`;
          if (ln === 0 || vn === 0) {
            mapping = "different-boundary";
            limitations = "At the horizon the shader returns zero; the reference reports the one-sided visibility limit. Their difference is diagnostic, not a tolerance failure.";
          }
          break;
        }
        case "sheenDirect": {
          const { noL, noV, cosDeltaPhi, roughness } = args[0] as SheenDirectInput;
          const lightRadius = Math.sqrt(Math.max(0, 1 - noL * noL));
          const light: readonly [number, number, number] = [lightRadius * cosDeltaPhi, lightRadius * Math.sqrt(Math.max(0, 1 - cosDeltaPhi * cosDeltaPhi)), noL];
          const view: readonly [number, number, number] = [Math.sqrt(Math.max(0, 1 - noV * noV)), 0, noV];
          statement = `vec4f(a3dPrd04SheenDirect(${vec3(light)}, ${vec3(view)}, vec3f(0.0, 0.0, 1.0), vec3f(1.0), ${literal(roughness)}).x, 0.0, 0.0, 0.0)`;
          physicalReference = numericOutput(sample);
          expected = physicalReference.map((value) => value * boundedSheenScale(roughness));
          mapping = "bounded-sheen";
          limitations = "Both are unit-color BRDFs without the incident cosine. The primary expectation applies the candidate's derived roughness-only energy normalization; physicalReference preserves the unscaled physical model. GPU precision remains unvalidated.";
          break;
        }
        case "anisotropyAlphaT": {
          const alpha = number(args[0], id), strength = number(args[1], id);
          // The initializer consumes perceptual roughness; the reference consumes alpha.
          statement = `INIT_ANISOTROPY(${literal(Math.sqrt(alpha))}, ${literal(strength)})`;
          limitations = "The candidate lobe initializer receives roughness = sqrt(alpha) and a strength-aligned tangent vector; alphaT is read from the initialized struct.";
          break;
        }
        case "clearcoatFccCompose": {
          const baseColor = vector3(args[0], id), coat = vector3(args[1], id);
          const coverage = number(args[2], id), fcc = number(args[3], id);
          if (fcc !== 0.04) {
            unmapped.push({ ...base, reason: "The candidate has a fixed 1.5-IOR Fresnel term; this FCC is not its normal-incidence value.", reference: sample.evaluate() });
            continue;
          }
          statement = `vec4f(a3dPrd04ComposeClearcoat(${vec3(baseColor)}, ${literal(coverage)}, vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, 1.0), ${vec3(coat)}, vec3f(0.0)), 0.0)`;
          limitations = "The sample uses normal incidence and fixed F0=0.04; it checks this candidate's composition only, not arbitrary FCC or layered energy conservation.";
          break;
        }
        case "environmentBRDF": {
          const noV = number(args[0], id), roughness = number(args[1], id);
          const integrated = sample.evaluate();
          if (typeof integrated !== "object" || integrated === null || !("f0" in integrated) || !("f90" in integrated)) {
            throw new TypeError(`sample ${id} must provide an environment basis`);
          }
          statement = `vec4f(a3dDFG(${literal(roughness)}, ${literal(noV)}), 0.0, 0.0)`;
          expected = sampleNativeDfgLut(roughness, noV);
          physicalReference = [integrated.f0, integrated.f90];
          mapping = "native-dfg-transport";
          limitations = "Primary reference is the native binary16 table's CPU bilinear sampler, not an independent LUT; the separately reported physical reference is numerical hemisphere integration. Edge clamping, quantization and finite quadrature differ.";
          break;
        }
        default: {
          unmapped.push({ ...base, reason: unavailableReasons[entry.category] ?? "No independently authored shader candidate with matching semantics is available.", reference: sample.evaluate() });
          continue;
        }
      }
      probes.push({ ...base, statement, expected: expected ?? numericOutput(sample), ...(physicalReference ? { physicalReference } : {}), mapping, limitations, tolerance: "unresolved" });
    }
  }
  const baseline = probes.find((probe) => probe.id === "dCharlie/sloped-half-vector");
  if (!baseline) throw new Error("the negative-control baseline is missing");
  const controlScalar = baseline.statement.match(/^vec4f\((.*), 0\.0, 0\.0, 0\.0\)$/)?.[1];
  if (!controlScalar) throw new Error("negative-control baseline must expose one shader scalar");
  return {
    categories: PHYSICAL_CASES.map(({ category }) => category), probes, unmapped,
    negativeControl: {
      id: "negative-control/scaled-sheen", baselineId: baseline.id, scale: 1.08,
      statement: `vec4f(1.08 * ${controlScalar}, 0.0, 0.0, 0.0)`,
    },
  };
}

/** Actual candidate WGSL, with one vec4 storage record per probe and control. */
export function buildNativePhysicalComputeWgsl(plan: NumericPlan): string {
  const assignments = plan.probes.map((probe, index) => {
    const init = /^INIT_ANISOTROPY\(([^,]+), ([^)]+)\)$/.exec(probe.statement);
    if (init) {
      return `var lobes${index}: A3DPrd04Lobes;\n` +
        `a3dPrd04AnisotropyInit(&lobes${index}, vec2f(${init[2]}, 0.0), vec4f(1.0), false, vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), ${init[1]});\n` +
        `numericResults[${index}u] = vec4f(lobes${index}.alphaT, 0.0, 0.0, 0.0);`;
    }
    return `numericResults[${index}u] = ${probe.statement};`;
  });
  assignments.push(`numericResults[${plan.probes.length}u] = ${plan.negativeControl.statement};`);
  return `
struct A3DPrd04Lobes {
  clearcoat: f32, clearcoatRoughness: f32, clearcoatNormal: vec3f,
  sheenColor: vec3f, sheenRoughness: f32,
  anisotropy: f32, anisotropyT: vec3f, anisotropyB: vec3f, alphaT: f32,
}
${NATIVE_BRDF_WGSL}
${A3D_PRD04_ANISOTROPY_WGSL}
${A3D_PRD04_SHEEN_WGSL}
${A3D_PRD04_CLEARCOAT_WGSL}
@group(0) @binding(0) var<storage, read_write> numericResults: array<vec4f>;
@compute @workgroup_size(1) fn main() {
${assignments.join("\n")}
}
`;
}
