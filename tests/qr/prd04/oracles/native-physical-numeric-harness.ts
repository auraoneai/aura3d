/**
 * Native physical-lighting numerical harness: independent CPU reference
 * equations (native-physical-cases.ts) against the production physical shader
 * functions.
 *
 * The WGSL evaluated here is the `wgsl` source attached to the renderer's own
 * PRD-04 lobe chunks (shaders/physical/*.glsl.ts → `ShaderChunk.wgsl`, the
 * WGSL companions of the GLSL the generated-program renderer compiles), looked
 * up through PRD04_SHADER_CHUNKS, plus the test-only `brdf` shim that binds the
 * renderer's native DFG table. No separate candidate copy is used. Every
 * mapped probe carries an explicit float32 tolerance (see `F32_TOLERANCE`);
 * every sample whose reference models something the production shader does
 * not compute carries an explicit model-exclusion contract naming the
 * production function and the difference. `evaluateNativePhysicalConformance`
 * is the gate: it passes only when every mapped probe is within tolerance, the
 * perturbed negative control is detected, and every exclusion is documented.
 * Compute-pass execution is GPU evidence for these functions, not a frame
 * capture: the per-backend pixel checks live in the material-lighting spec.
 */
import { PRD04_SHADER_CHUNKS } from "../../../../packages/rendering/src/shaders/physical/index";
import { A3D_SHEEN_ALBEDO_LUT } from "../../../../packages/rendering/src/shaders/physical/sheenAlbedoLut";
import { NATIVE_BRDF_WGSL } from "../shims/native-brdf.wgsl";
import { decodeNativeDfgFloat16, nativeDfgLutRg16f, NATIVE_DFG_LUT_SIZE, sampleNativeDfgLut } from "./native-dfg-lut";
import {
  PHYSICAL_CASES,
  type PhysicalCaseSample,
  type PhysicalCategory,
  type PhysicalModel,
  type PhysicalOutput,
} from "./native-physical-cases";
import type { SheenDirectInput } from "./native-reference-sheen";

/** Production chunks whose WGSL the harness evaluates, in dependency order. */
export const NATIVE_PHYSICAL_PRODUCTION_CHUNKS = [
  "a3d_prd04_bsdf_lobes_common", "a3d_prd04_specular_ior", "a3d_prd04_clearcoat",
  "a3d_prd04_sheen", "a3d_prd04_anisotropy", "a3d_prd04_volume",
] as const;

/** The production WGSL for one PRD-04 chunk, exactly as the renderer's chunk object carries it. */
export function productionPhysicalWgsl(name: (typeof NATIVE_PHYSICAL_PRODUCTION_CHUNKS)[number]): string {
  const chunk = PRD04_SHADER_CHUNKS.find((entry) => entry.name === name);
  if (!chunk?.wgsl) throw new Error(`production chunk ${name} has no WGSL source`);
  return chunk.wgsl;
}

/**
 * Float32 tolerance for closed-form probes. WGSL f32 arithmetic is correctly
 * rounded to within 1 ULP for +, -, * and 2.5 ULP for /; sqrt and inverseSqrt
 * are within 2-3 ULP; exp2/log2 (and pow, defined as exp2(y log2 x)) within
 * 3 + 2|x| ULP or 2^-21 absolute near one (WGSL §"Floating Point Accuracy").
 * The longest probe chain is about 30 such operations with exponents |x| < 8,
 * i.e. at most ~600 ULP = 600 * 2^-24 ≈ 3.6e-5 relative, and the decimal
 * inputs are rounded to f32 once (2^-24 relative, condition number < 10).
 * 2^-13 (≈1.2e-4) relative is therefore a conservative bound that still
 * rejects any real formula change (the negative control moves 8%). The
 * absolute term 2^-20 covers results that should be exactly zero but are
 * reached through cancellation of O(1) f32 quantities.
 */
export const F32_TOLERANCE: ExplicitTolerance = {
  absolute: 2 ** -20,
  relative: 2 ** -13,
  rationale: "f32 evaluation of a closed-form production function: <= ~600 ULP accumulated (WGSL accuracy table), bounded by 2^-13 relative plus 2^-20 absolute",
};

/**
 * Bilinear DFG fetch through a hardware sampler. WebGPU does not specify the
 * sub-texel precision of linear filtering; Vulkan's minimum is 4 bits
 * (subTexelPrecisionBits), so each interpolation weight can be off by 2^-5 and
 * a two-axis fetch by at most 2 * 2^-5 = 2^-4 of the largest difference
 * between the four texels in the footprint. The texels are the exact binary16
 * values the CPU sampler decodes, so this bound plus F32_TOLERANCE covers it.
 */
export function dfgTransportTolerance(roughness: number, ndotv: number): ExplicitTolerance {
  const words = nativeDfgLutRg16f();
  const max = NATIVE_DFG_LUT_SIZE - 1;
  const px = Math.max(0, Math.min(max, roughness * NATIVE_DFG_LUT_SIZE - 0.5));
  const py = Math.max(0, Math.min(max, ndotv * NATIVE_DFG_LUT_SIZE - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, max), y1 = Math.min(y0 + 1, max);
  let spread = 0;
  for (let component = 0; component < 2; component++) {
    const values = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) =>
      decodeNativeDfgFloat16(words[2 * (y! * NATIVE_DFG_LUT_SIZE + x!) + component]!));
    spread = Math.max(spread, Math.max(...values) - Math.min(...values));
  }
  return {
    absolute: F32_TOLERANCE.absolute + spread * 2 ** -4,
    relative: F32_TOLERANCE.relative,
    rationale: `hardware bilinear filtering with >= 4 sub-texel bits: 2^-4 of the footprint spread (${spread.toPrecision(4)}) plus the f32 bound`,
  };
}

/** CPU twin of the production `a3dPrd04IBLSheen` table read (same 8-decimal values, same bilinear order). */
export function sampleProductionSheenAlbedo(ndotv: number, roughness: number): number {
  const lut = A3D_SHEEN_ALBEDO_LUT.map((value) => Number(value.toFixed(8)));
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp01(roughness) * 15, y = clamp01(ndotv) * 15;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, 15), y1 = Math.min(y0 + 1, 15);
  const fx = x - x0, fy = y - y0;
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  const lower = mix(lut[y0 * 16 + x0]!, lut[y0 * 16 + x1]!, fx);
  const upper = mix(lut[y1 * 16 + x0]!, lut[y1 * 16 + x1]!, fx);
  return clamp01(mix(lower, upper, fy));
}

export type MappingKind = "equation" | "native-lut-transport" | "native-dfg-transport";

export interface NumericProbe {
  readonly id: string;
  readonly category: PhysicalCategory;
  readonly sampleId: string;
  readonly sampleKind: "normal" | "boundary";
  readonly model: PhysicalModel;
  readonly mapping: MappingKind;
  /** WGSL calling the production function, with any required input conversion. */
  readonly statement: string;
  readonly expected: readonly number[];
  /** Independent unmodified model result, when the primary expectation adapts its semantics. */
  readonly physicalReference?: readonly number[];
  readonly limitations: string;
  readonly tolerance: ExplicitTolerance;
}

export interface UnmappedSample {
  readonly id: string;
  readonly category: PhysicalCategory;
  readonly sampleId: string;
  readonly sampleKind: "normal" | "boundary";
  readonly model: PhysicalModel;
  readonly reason: string;
  /** Explicit supported-model contract: the production function and why it is not this reference. */
  readonly contract: "documented-model-difference";
  readonly productionFunction: string;
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
  readonly tolerance: ExplicitTolerance;
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
      comparison: compareNumericValues(probe.expected, observed, probe.tolerance),
      // Diagnostic only: the transport probes' unfiltered physical integral.
      ...(probe.physicalReference ? { physicalComparison: compareNumericValues(probe.physicalReference, observed) } : {}),
    };
  });
  const baseline = measurements.find((item) => item.id === plan.negativeControl.baselineId);
  if (!baseline) throw new Error("negative-control baseline is missing from the measurements");
  const control = compareNumericValues(baseline.comparison.expected, [values[plan.probes.length * 4]!], baseline.tolerance);
  return {
    measurements,
    negativeControl: {
      ...plan.negativeControl, comparison: control,
      movedAwayFromReference: control.absoluteError[0]! > baseline.comparison.absoluteError[0]!,
    },
  };
}

export interface NativePhysicalConformance {
  readonly status: "passed" | "failed";
  readonly reasons: readonly string[];
}

/**
 * The conformance gate. Passes only when every mapped production probe is
 * within its stated tolerance, the perturbed control is outside tolerance and
 * farther from the reference, every case sample is either measured or carries
 * an explicit model-exclusion contract, and every category is accounted for.
 */
export function evaluateNativePhysicalConformance(plan: NumericPlan, report: MeasuredProbeReport): NativePhysicalConformance {
  const reasons: string[] = [];
  for (const item of report.measurements) {
    if (item.comparison.verdict !== "within-tolerance") {
      reasons.push(`${item.id}: ${item.comparison.verdict} (observed ${item.comparison.observed.join(", ")}, expected ${item.comparison.expected.join(", ")})`);
    }
  }
  if (report.measurements.length !== plan.probes.length) reasons.push("measurement count differs from the probe plan");
  if (report.negativeControl.comparison.verdict !== "outside-tolerance" || !report.negativeControl.movedAwayFromReference) {
    reasons.push("the perturbed negative control was not detected");
  }
  for (const entry of plan.unmapped) {
    if (entry.contract !== "documented-model-difference" || !entry.productionFunction.trim() || entry.reason.trim().length < 30) {
      reasons.push(`${entry.id}: unmapped without a documented model-difference contract`);
    }
  }
  const accounted = new Set([...plan.probes, ...plan.unmapped].map(({ id }) => id));
  for (const entry of PHYSICAL_CASES) {
    for (const sample of entry.samples) {
      if (!accounted.has(`${entry.category}/${sample.id}`)) reasons.push(`${entry.category}/${sample.id}: not accounted for`);
    }
  }
  return { status: reasons.length === 0 ? "passed" : "failed", reasons };
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

/** Unit view vector at the given N.V in the (x, z) plane, N = +z. */
function viewAt(noV: number): readonly [number, number, number] {
  return [Math.sqrt(Math.max(0, 1 - noV * noV)), 0, noV];
}

function numericOutput(sample: PhysicalCaseSample): readonly number[] {
  const value = sample.evaluate();
  if (typeof value === "number") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  throw new TypeError(`sample ${sample.id} is not a scalar or numeric vector`);
}

/** Explicit model-difference contracts: what production computes instead, and why it is not this reference. */
const exclusions: Partial<Record<PhysicalCategory, { readonly productionFunction: string; readonly reason: string }>> = {
  evalIridescence: {
    productionFunction: "a3dPrd04EvalIridescence (physical-wgsl/iridescence.wgsl.ts)",
    reason: "The CPU reference reports monochromatic dielectric samples; production integrates the Airy reflectance over 41 wavelengths with CIE 1931 weights into linear RGB, so a per-wavelength value is not a production output.",
  },
  computeSpecularOcclusion: {
    productionFunction: "a3dPrd04SpecularOcclusion (physical-wgsl/bsdf_lobes_common.wgsl.ts)",
    reason: "The reference integrates a directional visibility field; production applies a bounded scalar ambient-occlusion heuristic, which cannot supply that field.",
  },
  applyIorToRoughness: {
    productionFunction: "a3dApplyIorToRoughness (physical-wgsl/transmission.wgsl.ts)",
    reason: "The reference scales roughness by a Fresnel-amplitude ratio to a chosen reference interface; production uses the linear transmission-blur ramp clamp((ior - 1) * 2, 0, 1), a different documented heuristic.",
  },
  multiscatteringMulti: {
    productionFunction: "a3dPrd04Multiscatter (physical-wgsl/bsdf_lobes_common.wgsl.ts)",
    reason: "The reference uses the geometric-series closure single * (1 - E) * Favg / (1 - Favg * (1 - E)); production uses a different, capped closure min(1 - single, (1 - E) * Favg) over the DFG table.",
  },
  brdfGGXMultiscatter: {
    productionFunction: "a3dPrd04Multiscatter (physical-wgsl/bsdf_lobes_common.wgsl.ts)",
    reason: "The reference total adds the geometric-series multiple-scattering closure; production adds its different capped closure, so the totals intentionally differ (single scattering is measured separately).",
  },
  volumeTransmissionRay: {
    productionFunction: "a3dVolumeTransmissionRay (physical-wgsl/transmission.wgsl.ts)",
    reason: "The reference traverses a slab, path length thickness / cos(theta_t); production applies KHR_materials_volume thickness along the refracted ray in object space, a different documented convention.",
  },
};

/** Resolve every case from the CPU inventory; never invent outputs for missing production functions. */
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
      let limitations = "Closed-form production function evaluated in f32; the expectation is the independent binary64 reference.";
      let tolerance: ExplicitTolerance = F32_TOLERANCE;
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
          mapping = "native-lut-transport";
          physicalReference = numericOutput(sample);
          expected = [sampleProductionSheenAlbedo(noV, roughness)];
          limitations = "Primary reference is the CPU bilinear read of Aura's preintegrated sheen albedo table (the production data); physicalReference is the independent hemisphere integral, reported as a diagnostic of the 16 x 16 table's interpolation error.";
          break;
        }
        case "dGGXAnisotropic": {
          const [at, ab, ht, hb, hn] = args.map((value) => number(value, id));
          statement = `vec4f(a3dPrd04DGGXAnisotropic(${literal(at!)}, ${literal(ab!)}, ${literal(hn!)}, ${literal(ht!)}, ${literal(hb!)}), 0.0, 0.0, 0.0)`;
          if (hn === 0) limitations = "Horizon half vector: the production slope-space form is finite there and equals the reference's one-sided limit.";
          break;
        }
        case "vGGXAnisotropic": {
          const [at, ab, lt, lb, ln, vt, vb, vn] = args.map((value) => number(value, id));
          statement = `vec4f(a3dPrd04VGGXAnisotropic(${literal(at!)}, ${literal(ab!)}, ${literal(vt!)}, ${literal(vb!)}, ${literal(lt!)}, ${literal(lb!)}, ${literal(vn!)}, ${literal(ln!)}), 0.0, 0.0, 0.0)`;
          if (ln === 0 || vn === 0) limitations = "One direction at the horizon: the production height-correlated form stays finite and equals the reference's one-sided limit.";
          break;
        }
        case "sheenDirect": {
          const { noL, noV, cosDeltaPhi, roughness } = args[0] as SheenDirectInput;
          const lightRadius = Math.sqrt(Math.max(0, 1 - noL * noL));
          const light: readonly [number, number, number] = [lightRadius * cosDeltaPhi, lightRadius * Math.sqrt(Math.max(0, 1 - cosDeltaPhi * cosDeltaPhi)), noL];
          statement = `vec4f(a3dPrd04SheenDirect(${vec3(light)}, ${vec3(viewAt(noV))}, vec3f(0.0, 0.0, 1.0), vec3f(1.0), ${literal(roughness)}).x, 0.0, 0.0, 0.0)`;
          limitations = "Unit-color Charlie x Neubelt BRDF without the incident cosine; directions are rebuilt from the cosines, so f32 rounding of the vectors is inside the stated bound.";
          break;
        }
        case "anisotropyAlphaT": {
          const alpha = number(args[0], id), strength = number(args[1], id);
          // The initializer consumes perceptual roughness; the reference consumes alpha.
          statement = `INIT_ANISOTROPY(${literal(Math.sqrt(alpha))}, ${literal(strength)})`;
          limitations = "The production lobe initializer receives roughness = sqrt(alpha) and a strength-aligned tangent vector; alphaT is read from the initialized struct.";
          break;
        }
        case "clearcoatFccCompose": {
          const baseColor = vector3(args[0], id), coat = vector3(args[1], id);
          const coverage = number(args[2], id), fcc = number(args[3], id);
          if (fcc !== 0.04) throw new RangeError(`${id}: production clearcoat has the fixed KHR 1.5-IOR F0 0.04`);
          statement = `vec4f(a3dPrd04ComposeClearcoat(${vec3(baseColor)}, ${literal(coverage)}, vec3f(0.0, 0.0, 1.0), vec3f(0.0, 0.0, 1.0), ${vec3(coat)}, vec3f(0.0)), 0.0)`;
          limitations = "Normal incidence, so the production Fresnel is exactly its fixed F0 = 0.04 (KHR_materials_clearcoat IOR 1.5).";
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
          tolerance = dfgTransportTolerance(roughness, noV);
          limitations = "Primary reference is the native binary16 table's CPU bilinear sampler, not an independent LUT; the separately reported physical reference is numerical hemisphere integration. Edge clamping, quantization and finite quadrature differ.";
          break;
        }
        case "multiscatteringSingle": {
          const [noV, roughness, f0, f90] = args.map((value) => number(value, id));
          statement = `vec4f(a3dPrd04EnvironmentBRDF(vec3f(0.0, 0.0, 1.0), ${vec3(viewAt(noV!))}, vec3f(${literal(f0!)}), ${literal(f90!)}, ${literal(roughness!)}), 0.0)`;
          const [a, b] = sampleNativeDfgLut(roughness!, noV!);
          const single = Math.min(1, Math.max(0, f0! * a + f90! * b));
          expected = [single, single, single];
          physicalReference = [numericOutput(sample)[0]!, numericOutput(sample)[0]!, numericOutput(sample)[0]!];
          mapping = "native-dfg-transport";
          tolerance = dfgTransportTolerance(roughness!, noV!);
          limitations = "Production single scattering F0 * A + F90 * B over the native DFG table; physicalReference uses the independently integrated (A, B).";
          break;
        }
        case "volumeAttenuation": {
          const distance = number(args[0], id), color = vector3(args[1], id), attenuationDistance = number(args[2], id);
          statement = `vec4f(a3dVolumeAttenuation(${literal(distance)}, ${vec3(color)}, ${literal(attenuationDistance)}), 0.0)`;
          limitations = "Beer-Lambert transmittance color^(d / D); production evaluates pow in f32.";
          break;
        }
        case "iorToF0": {
          const transmitted = number(args[0], id), incident = number(args[1], id);
          statement = `vec4f(a3dPrd04IorToF0f(${literal(transmitted)}, ${literal(incident)}), 0.0, 0.0, 0.0)`;
          break;
        }
        case "specIorSpecularColor": {
          const ior = number(args[0], id), color = vector3(args[1], id), factor = number(args[2], id), incident = number(args[3], id);
          if (incident !== 1) throw new RangeError(`${id}: production specular color assumes an incident index of 1`);
          statement = `vec4f(a3dPrd04SpecIorSpecularColor(${literal(ior)}, ${vec3(color)}, ${literal(factor)}), 0.0)`;
          break;
        }
        case "specIorSpecularF90": {
          const factor = number(args[0], id);
          statement = `vec4f(a3dPrd04SpecIorSpecularF90(${literal(factor)}, 0.0), 0.0, 0.0, 0.0)`;
          limitations = "Dielectric (metalness 0) specular F90 equals the KHR_materials_specular factor.";
          break;
        }
        default: {
          const exclusion = exclusions[entry.category];
          if (!exclusion) throw new Error(`${id}: no production mapping and no documented model-difference contract`);
          unmapped.push({ ...base, contract: "documented-model-difference", ...exclusion, reference: sample.evaluate() });
          continue;
        }
      }
      probes.push({ ...base, statement, expected: expected ?? numericOutput(sample), ...(physicalReference ? { physicalReference } : {}), mapping, limitations, tolerance });
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

/** Production chunk WGSL plus the brdf shim, with one vec4 storage record per probe and control. */
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
${NATIVE_BRDF_WGSL}
${NATIVE_PHYSICAL_PRODUCTION_CHUNKS.map(productionPhysicalWgsl).join("\n")}
@group(0) @binding(0) var<storage, read_write> numericResults: array<vec4f>;
@compute @workgroup_size(1) fn main() {
${assignments.join("\n")}
}
`;
}
