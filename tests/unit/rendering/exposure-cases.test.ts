/**
 * exposure-cases.test.ts: beat-three.js PRD-2 WP-6 (exposure attribution).
 *
 * CPU references for the three bench scenes whose mean luma still differs from three.js r185 in
 * evidence/vs-threejs/RESULTS-candidate.md: the cube (ambient only, 12.8 vs 2.9), the PBR viewer (environment lit,
 * 91.1 vs 55.0) and the forest (hemisphere + sun, 119.6 vs 148.2). It extends the part-1 approach of
 * exposure-parity.test.ts and names the cause of each gap.
 *
 * Two kinds of check, kept apart on purpose:
 *   - engine-backed: values read from the engine itself (the ACES expressions in the generated output chunk, the runtime
 *     environment the compiler builds, the SH9 irradiance, the probe bind). These fail when Lighting, colour management or
 *     environment compilation change.
 *   - measurement-backed: the remote rows in evidence/exposure-parity/wp6/cases.json (written by
 *     tests/browser/exposure-cases.spec.ts, which re-checks every row against a fresh remote run). Model predictions are
 *     compared with those rows; no test compares a literal with itself.
 * The decisions are in evidence/exposure-parity/README.md. The bench sources are not pinned here: the bench lane may fix them.
 */
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { scene } from "@aura3d/engine";
import type { AuraSceneSnapshot } from "@aura3d/engine";
import { createProductionRuntimeEnvironment, explicitEnvironmentResolution, prd02ProbeBindIntensities } from "../../../packages/engine/src/agent-api/compiler/environment";
import { qrPrimitiveMeshFor } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { linearToSrgbChannel, srgbToLinearChannel } from "../../../packages/rendering/src/ColorManagement";
import { ambientToExitRadiance } from "../../../packages/rendering/src/LightUniforms";
import { decodeHdrEquirect } from "../../../packages/rendering/src/environment/HdrEquirect";
import { evaluateSH9Irradiance, projectEquirectToSH9 } from "../../../packages/rendering/src/environment/SphericalHarmonics";
import { outputFragmentGlsl } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { acesFilmicToneMapping } from "../../../packages/rendering/src/post/ToneOperators";
import { OUTPUT_SRGB_CHUNK_GLSL, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { a3dHemisphereIrradiance } from "../../../packages/rendering/src/shaders/chunks/lighting_mirrors";

type Vec3 = [number, number, number];

interface CaseRow { id: string; meanLuma: number; regionsLuma: Record<string, number> | null; hdriStatus: string | null }
const rows = new Map<string, CaseRow>((JSON.parse(readFileSync(new URL("../../../evidence/exposure-parity/wp6/cases.json", import.meta.url), "utf8")) as { rows: CaseRow[] }).rows.map((r) => [r.id, r]));
const row = (id: string): CaseRow => {
  const r = rows.get(id);
  if (!r) throw new Error(`evidence/exposure-parity/wp6/cases.json has no row ${id}`);
  return r;
};
const mean = (id: string): number => row(id).meanLuma;
const region = (id: string, name: "centre" | "top" | "bottom" | "corner"): number => row(id).regionsLuma![name]!;
const ratio = (a: number, b: number): number => a / b;
const within = (value: number, target: number, rel: number): boolean => Math.abs(value / target - 1) <= rel;

const snapshot = (nodes: readonly unknown[]): AuraSceneSnapshot => ({
  schema: "aura3d-scene-snapshot/1.0",
  background: "#000000",
  camera: { mode: "orbit", position: [0, 4, 0], target: [0, 0, 0] },
  nodes: nodes as never,
  diagnostics: { enabled: false }
});

const encode255 = (linear: Vec3): Vec3 => [linearToSrgbChannel(linear[0]) * 255, linearToSrgbChannel(linear[1]) * 255, linearToSrgbChannel(linear[2]) * 255];
const lumaOfSrgb255 = (rgb: Vec3): number => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const srgbHexToLinear = (hex: string): Vec3 => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [16, 8, 0].map((shift) => srgbToLinearChannel(((value >> shift) & 255) / 255)) as Vec3;
};
const referenceAcesLuma255 = (linear: Vec3): number => lumaOfSrgb255(encode255([...acesFilmicToneMapping(linear, 1)]));
const lambert = (albedo: Vec3, radiance: Vec3): Vec3 => [albedo[0] * radiance[0], albedo[1] * radiance[1], albedo[2] * radiance[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * Execute the actual straight-line GLSL expressions rather than extracting
 * constants and silently assuming an operator structure. This deliberately
 * small interpreter fails on unsupported syntax; it is not a GPU compiler and
 * uses JS numbers rather than shader f32 rounding.
 */
type ShaderValue = number | Vec3;
const vectorOp = (a: ShaderValue, b: ShaderValue, op: (x: number, y: number) => number): ShaderValue => {
  if (typeof a === "number" && typeof b === "number") return op(a, b);
  return [0, 1, 2].map((i) => op(typeof a === "number" ? a : a[i]!, typeof b === "number" ? b : b[i]!)) as Vec3;
};

function executeShader(source: string, entry: string, input: Vec3): Vec3 {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const call = (name: string, args: ShaderValue[]): ShaderValue => {
    if (name === "vec3") {
      if (args.length === 1 && typeof args[0] === "number") return [args[0], args[0], args[0]];
      if (args.length === 3 && args.every((v) => typeof v === "number")) return args as Vec3;
      throw new Error("Unsupported vec3 constructor");
    }
    if (name === "dot") {
      if (!Array.isArray(args[0]) || !Array.isArray(args[1])) throw new Error("dot requires vectors");
      return dot(args[0], args[1]);
    }
    if (name === "max") return vectorOp(args[0]!, args[1]!, Math.max);
    if (name === "pow") return vectorOp(args[0]!, args[1]!, Math.pow);
    if (name === "step") return vectorOp(args[0]!, args[1]!, (edge, x) => x < edge ? 0 : 1);
    if (name === "clamp") return vectorOp(vectorOp(args[0]!, args[1]!, Math.max), args[2]!, Math.min);
    if (name === "mix") {
      const difference = vectorOp(args[1]!, args[0]!, (x, y) => x - y);
      return vectorOp(args[0]!, vectorOp(difference, args[2]!, (x, y) => x * y), (x, y) => x + y);
    }
    const declaration = new RegExp(`\\bvec3\\s+${name}\\s*\\(([^)]*)\\)\\s*\\{([^{}]*)\\}`, "g");
    const matches = [...clean.matchAll(declaration)];
    if (matches.length !== 1) throw new Error(`Expected one straight-line GLSL function ${name}, found ${matches.length}`);
    const parameters = matches[0]![1]!.split(",").map((parameter) => parameter.trim().split(/\s+/).at(-1)!);
    if (parameters.length !== args.length) throw new Error(`Wrong argument count for ${name}`);
    const variables = new Map<string, ShaderValue>(parameters.map((parameter, i) => [parameter, args[i]!]));
    const body = matches[0]![2]!.replace(/\bvec3\s+(\w+)\s*=/g, "const $1 =");
    const parsed = ts.createSourceFile("output-shader.ts", `{${body}}`, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const diagnostics = (parsed as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (diagnostics.length > 0) throw new Error(ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, "\n"));
    const block = parsed.statements[0];
    if (!block || !ts.isBlock(block)) throw new Error(`Invalid body for ${name}`);
    const evaluate = (node: ts.Expression): ShaderValue => {
      if (ts.isNumericLiteral(node)) return Number(node.text);
      if (ts.isParenthesizedExpression(node)) return evaluate(node.expression);
      if (ts.isIdentifier(node)) {
        const value = variables.get(node.text);
        if (value === undefined) throw new Error(`Unknown GLSL identifier ${node.text}`);
        return value;
      }
      if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
        return vectorOp(0, evaluate(node.operand), (x, y) => x - y);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        return call(node.expression.text, node.arguments.map(evaluate));
      }
      if (ts.isBinaryExpression(node)) {
        const operation = node.operatorToken.kind === ts.SyntaxKind.PlusToken ? (x: number, y: number) => x + y
          : node.operatorToken.kind === ts.SyntaxKind.MinusToken ? (x: number, y: number) => x - y
          : node.operatorToken.kind === ts.SyntaxKind.AsteriskToken ? (x: number, y: number) => x * y
          : node.operatorToken.kind === ts.SyntaxKind.SlashToken ? (x: number, y: number) => x / y : undefined;
        if (operation) return vectorOp(evaluate(node.left), evaluate(node.right), operation);
      }
      throw new Error(`Unsupported GLSL expression: ${node.getText(parsed)}`);
    };
    for (const statement of block.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const variable of statement.declarationList.declarations) {
          if (!ts.isIdentifier(variable.name) || !variable.initializer) throw new Error(`Unsupported GLSL variable in ${name}`);
          variables.set(variable.name.text, evaluate(variable.initializer));
        }
      } else if (ts.isReturnStatement(statement) && statement.expression) {
        return evaluate(statement.expression);
      } else throw new Error(`Unsupported GLSL statement in ${name}: ${statement.getText(parsed)}`);
    }
    throw new Error(`Missing return in ${name}`);
  };
  const result = call(entry, [input]);
  if (!Array.isArray(result) || result.length !== 3 || result.some((value) => !Number.isFinite(value))) {
    throw new Error(`${entry} did not return a finite vec3`);
  }
  return result;
}

const engineAcesFilmic = (linear: Vec3): Vec3 => executeShader(OUTPUT_SRGB_CHUNK_GLSL, "ACESFilmicToneMapping", linear);
/** Display bytes after Aura3D's default encode, evaluated from its GLSL. */
const engineAcesBytes = (linear: Vec3): Vec3 => executeShader(OUTPUT_SRGB_CHUNK_GLSL, "a3dEncodeForCanvas", linear).map((v) => v * 255) as Vec3;

describe("engine output operator", () => {
  const samples: Vec3[] = [[0, 0, 0], [0.02, 0.02, 0.02], [0.18, 0.18, 0.18], [0.686, 0.144, 0.042], [1, 1, 1], [3, 2, 0.5], [0.05, 0.4, 0.1], [-0.1, 0.18, 8]];

  it("evaluates the emitted ACES expressions against the independent CPU fit across scene-linear colours", () => {
    for (const color of samples) {
      const engine = engineAcesFilmic(color);
      const reference = acesFilmicToneMapping(color, 1);
      for (let i = 0; i < 3; i += 1) expect(engine[i]!).toBeCloseTo(reference[i]!, 10);
    }
  });

  it("matches fixed decimal evaluations of the published fit and Aura3D viewing scale", () => {
    // Independent high-precision evaluation of the fit, including the 1/0.6
    // viewing scale. These are Aura3D contract values, not the ACES standard's
    // full reference rendering transform.
    const cases: [Vec3, Vec3][] = [
      [[0.18, 0.18, 0.18], [0.213105445714345, 0.213105445714345, 0.213103314659888]],
      [[1, 0, 0], [0.957333401755674, 0.005323721430323, 0.007157749298928]],
      [[0, 1, 0], [0.293359256012289, 0.774607322032973, 0.099433903982684]],
      [[0, 0, 1], [0, 0, 0.772829523633324]],
      [[3, 2, 0.5], [0.942936934750068, 0.88958134981237, 0.681064790727651]]
    ];
    for (const [input, expected] of cases) {
      const actual = engineAcesFilmic(input);
      for (let i = 0; i < 3; i += 1) expect(actual[i]!).toBeCloseTo(expected[i]!, 10);
    }
  });

  it("preserves the direct and post output curve, exposure, and sRGB transfer in generated shaders", () => {
    const direct = generateProgramImpl(normalizeProgramFeatures({ features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true } })).fragment;
    const linear = generateProgramImpl(normalizeProgramFeatures({})).fragment;
    const post = outputFragmentGlsl({ toneMapping: "aces", backgroundCoverage: false, overlay: false });
    expect(direct).toContain("a3dColor = a3dEncodeForCanvas(a3dColor);");
    expect(linear).not.toContain("a3dEncodeForCanvas");
    expect(post).toContain("#define TONE_MAP(c) ACESFilmicToneMapping(c)");
    expect(post).toContain("TONE_MAP(hdr * u_exposure)");
    expect(post).toContain("a3dLinearToSRGB(clamp(a3dOutputGamut(display), 0.0, 1.0))");
    for (const color of samples) for (const exposure of [0, 0.25, 1, 2, 4]) {
      const exposed = color.map((v) => v * exposure) as Vec3;
      const expected = encode255([...acesFilmicToneMapping(color, exposure)]).map((v) => v / 255);
      const fromDirect = executeShader(direct, "a3dEncodeForCanvas", exposed);
      const fromPost = executeShader(post, "a3dLinearToSRGB", executeShader(post, "ACESFilmicToneMapping", exposed));
      for (let i = 0; i < 3; i += 1) {
        expect(fromDirect[i]!).toBeCloseTo(expected[i]!, 10);
        expect(fromPost[i]!).toBeCloseTo(expected[i]!, 10);
      }
    }
    for (const value of [0, 0.00313079, 0.0031308, 0.00313081, 0.18, 1]) {
      const encoded = executeShader(post, "a3dLinearToSRGB", [value, value, value]);
      expect(encoded[0]).toBeCloseTo(linearToSrgbChannel(value), 6);
    }
    // W3C CSS Color 4 §19: independently evaluated sRGB transfer points.
    // https://www.w3.org/TR/css-color-4/#color-conversion-code
    for (const [value, expected] of [[0, 0], [0.0031308, 0.040449936], [0.18, 0.461356129500442], [1, 1]]) {
      const encoded = executeShader(post, "a3dLinearToSRGB", [value!, value!, value!]);
      expect(encoded[0]).toBeCloseTo(expected!, 6);
    }
  });

  it("detects changes to shader arithmetic, not just its coefficients", () => {
    // This independent synthetic pair has identical coefficients. A helper
    // that merely reads those coefficients and assumes an equation would give
    // both programs the same answer.
    const source = `vec3 probe(vec3 value) {
      vec3 scaled = value * vec3(0.5, 1.0, 2.0);
      return (scaled + 0.25) * scaled - 0.125;
    }`;
    const mutant = source.replace("- 0.125", "+ 0.125");
    const sample: Vec3 = [0.2, 0.4, 0.8];
    const actual = executeShader(source, "probe", sample);
    const changed = executeShader(mutant, "probe", sample);
    for (const [i, expected] of [-0.09, 0.135, 2.835].entries()) {
      expect(actual[i]!).toBeCloseTo(expected, 12);
      expect(changed[i]! - actual[i]!).toBeCloseTo(0.25, 12);
    }
  });
});

describe("cube: ambient only (lights.ambient 1 on #d86a3a)", () => {
  const albedo = srgbHexToLinear("#d86a3a");
  const env = createProductionRuntimeEnvironment(snapshot([{ kind: "light", light: "ambient", name: "a", intensity: 1, position: [0, 5, 0] }]), undefined, { implicitFill: false });

  it("lights the cube with the ambient light only: no probe, no procedural map, no implicit fill", () => {
    expect(env.preset).toBe("authored-lights");
    expect(env.lighting.environmentMapIntensity).toBe(0);
    expect(env.lighting.environmentMapSpecularIntensity).toBe(0);
    expect(env.lighting.proceduralMap).toBeUndefined();
  });

  it("the neutral room probe adds nothing here: the knob is zero, so the bind zeroes the room's diffuse and specular", () => {
    const room = { kind: "neutral-room" as const, diffuseIntensity: 1, specularIntensity: 1 };
    expect(prd02ProbeBindIntensities(env.lighting, room, true)).toEqual({ diffuseIntensity: 0, specularIntensity: 0 });
  });

  // The face radiance is derived from the engine's compiled lighting (colour and intensity), not from the authored numbers.
  const face = lambert(albedo, ambientToExitRadiance(env.lighting.color ?? [1, 1, 1], env.lighting.intensity ?? 0));

  it("face radiance is A * 1 / PI, the three r185 value (computed from the engine's compiled lighting)", () => {
    for (let i = 0; i < 3; i += 1) expect(face[i]! / (albedo[i]! / Math.PI)).toBeCloseTo(1, 6);
  });

  // Cause 1 (tone map): the bench's three source leaves toneMapping at its default (NoToneMapping); Aura3D's default is ACES.
  const threeNoneBytes = encode255(face);
  const auraBytes = engineAcesBytes(face);

  it("the engine's default operator darkens the face by the factor the remote centre region shows (0.87x)", () => {
    const modelled = lumaOfSrgb255(auraBytes) / lumaOfSrgb255(threeNoneBytes);
    expect(modelled).toBeGreaterThan(0.84);
    expect(modelled).toBeLessThan(0.9);
    // Measured: same scene, black background, ACES (default) vs output.toneMapping "none"; centre block is cube only.
    const measured = ratio(region("cube:#000000:default", "centre"), region("cube:#000000:none", "centre"));
    expect(within(modelled, measured, 0.03)).toBe(true);
  });

  it("three.js with ACESFilmic switched on reads what Aura3D's default reads (remote rows)", () => {
    expect(within(mean("cube:#000000:default"), mean("cube:three-aces"), 0.02)).toBe(true);
    expect(within(region("cube:#000000:default", "centre"), region("cube:three-aces", "centre"), 0.02)).toBe(true);
  });

  // Cause 2 (background): scene() without .background() clears to #070b12; three clears to black.
  it("the default scene background is #070b12 and predicts the bench cube's frame mean: 12.8 measured", () => {
    const background = scene().toJSON().background;
    expect(background).toBe("#070b12");
    const bgLuma = lumaOfSrgb255([0x07, 0x0b, 0x12]);
    // Cube coverage of the frame, derived from three's row (no background, no tone map): mean = coverage * face luma.
    const coverage = mean("bench:baseline:three") / lumaOfSrgb255(threeNoneBytes);
    expect(coverage).toBeGreaterThan(0.03);
    expect(coverage).toBeLessThan(0.05);
    const predicted = coverage * lumaOfSrgb255(auraBytes) + (1 - coverage) * bgLuma;
    expect(within(predicted, mean("bench:baseline:aura"), 0.05)).toBe(true);
    // The background is shown as authored: the top strip of the Aura frame is the background colour's luma.
    expect(Math.abs(region("bench:baseline:aura", "top") - bgLuma)).toBeLessThan(1);
  });

  it("with matching background and operator the frame means agree: 2.91 vs 2.88 (none), 2.52 vs 2.53 (ACES in both)", () => {
    expect(within(mean("cube:#000000:none"), mean("bench:baseline:three"), 0.02)).toBe(true);
    expect(within(mean("cube:#000000:default"), mean("cube:three-aces"), 0.02)).toBe(true);
  });
});

describe("PBR viewer: HDRI environment + directional light", () => {
  const hdr = decodeHdrEquirect(new Uint8Array(readFileSync(new URL("../../../fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", import.meta.url))));
  const flags = { on: (name: string) => name === "A3D_QR_COMPILER" || name === "A3D_QR_LIGHTING" };
  const hdriEnv = (intensity: number) => createProductionRuntimeEnvironment(snapshot([{ kind: "environment", environment: "hdri", name: "env", intensity, background: false }]), flags, { implicitFill: false });

  /** Cosine-weighted mean radiance of the HDRI about +Y: what three's irradiance lookup returns for an up-facing normal, divided by PI. */
  function diffuseRadianceUp(): Vec3 {
    const out: Vec3 = [0, 0, 0];
    for (let y = 0; y < hdr.height; y += 1) {
      const theta = ((y + 0.5) / hdr.height) * Math.PI;
      const cosine = Math.cos(theta);
      if (cosine <= 0) continue;
      const solidAngle = (Math.PI / hdr.height) * ((2 * Math.PI) / hdr.width) * Math.sin(theta);
      for (let x = 0; x < hdr.width; x += 1) {
        const i = (y * hdr.width + x) * 3;
        for (let k = 0; k < 3; k += 1) out[k]! += hdr.data[i + k]! * cosine * solidAngle;
      }
    }
    return [out[0] / Math.PI, out[1] / Math.PI, out[2] / Math.PI];
  }
  const bruteForceUp = diffuseRadianceUp();
  const engineUp = ((): Vec3 => {
    const irradiance = evaluateSH9Irradiance(projectEquirectToSH9(hdr.data, hdr.width, hdr.height, 3), [0, 1, 0]);
    return [irradiance[0]! / Math.PI, irradiance[1]! / Math.PI, irradiance[2]! / Math.PI];
  })();

  it("the engine's SH9 irradiance of the same HDRI matches the brute-force cosine integral within 2.5% (probe intensity is not the gap)", () => {
    for (let i = 0; i < 3; i += 1) expect(Math.abs(engineUp[i]! / bruteForceUp[i]! - 1)).toBeLessThan(0.025);
  });

  it("an authored hdri environment is one knob: diffuse and specular IBL equal the authored intensity (three's scene.environmentIntensity)", () => {
    for (const intensity of [0.7, 1]) {
      const env = hdriEnv(intensity);
      expect(env.lighting.environmentMapIntensity).toBe(intensity);
      expect(env.lighting.environmentMapSpecularIntensity).toBe(intensity);
      expect(prd02ProbeBindIntensities(env.lighting, { kind: "explicit", diffuseIntensity: 1, specularIntensity: 1 }, true)).toEqual({ diffuseIntensity: intensity, specularIntensity: intensity });
    }
  });

  // Ground plane (#2b2f38, up-facing) under the bench light set. The Aura side takes its environment intensity from the engine's
  // compiled lighting and its irradiance from the engine's SH9; the three side takes the authored intensity and the brute-force integral.
  const ground = srgbHexToLinear("#2b2f38");
  const sunColor = srgbHexToLinear("#fff4e0");
  const sunDir = unit([5, 8, 4]);
  const groundLuma = (sun: number, environment: number, radianceUp: Vec3): number => {
    const direct = sunColor.map((c) => (c * sun * Math.max(0, dot([0, 1, 0], sunDir))) / Math.PI) as Vec3;
    const indirect = radianceUp.map((c) => c * environment) as Vec3;
    return referenceAcesLuma255(lambert(ground, [direct[0] + indirect[0], direct[1] + indirect[1], direct[2] + indirect[2]]));
  };
  const auraGround = (sun: number, authoredEnvironment: number): number => groundLuma(sun, hdriEnv(authoredEnvironment).lighting.environmentMapIntensity ?? 0, engineUp);
  const threeGround = (sun: number, authoredEnvironment: number): number => groundLuma(sun, authoredEnvironment, bruteForceUp);

  // Cause (nominal lights): the two bench sources do not author the same lights (rows are named by sun and environment intensity).
  it("the mismatched nominal lights (Aura3D sun 2.5 + environment 1 vs three.js sun 1.1 + 0.7) predict the ground-strip gap: 1.57x measured", () => {
    const modelled = auraGround(2.5, 1) / threeGround(1.1, 0.7);
    expect(modelled).toBeGreaterThan(1.6);
    expect(modelled).toBeLessThan(1.85);
    const measured = ratio(region("pbr:aura:2.5:1:bloom:ref", "bottom"), region("pbr:three:1.1:0.7:bloom", "bottom"));
    expect(measured).toBeGreaterThan(1.5);
    expect(within(modelled, measured, 0.12)).toBe(true);
  });

  it("identical nominal lights (sun 1.1, environment 0.7): the model predicts the ground within 3%, the remote ground strip is within 6%", () => {
    expect(within(auraGround(1.1, 0.7), threeGround(1.1, 0.7), 0.03)).toBe(true);
    const measured = ratio(region("pbr:aura:1.1:0.7:bloom:ref", "bottom"), region("pbr:three:1.1:0.7:bloom", "bottom"));
    expect(within(measured, 1, 0.06)).toBe(true);
    // The engine-side numbers feed the model: an environment-intensity regression moves the prediction away from the measurement.
    expect(within(auraGround(1.1, 0.7) / threeGround(1.1, 0.7), measured, 0.08)).toBe(true);
  });

  // Cause (the PBR viewer's measured 91.1): the Aura bench source never loads its HDRI.
  it("a bare { type, format, url } texture is not an HDRI source: the node falls through to the neutral room, an asset ref loads", () => {
    const bare = { kind: "environment", environment: "hdri", name: "env", intensity: 0.7, texture: { type: "texture", format: "hdr", url: "/env.hdr" } };
    const ref = { ...bare, texture: { kind: "aura-asset-ref", id: "env", type: "texture", format: "hdr", url: "/env.hdr" } };
    expect(explicitEnvironmentResolution(bare as never, null)).toBeUndefined();
    expect(explicitEnvironmentResolution(ref as never, null)?.probe).toEqual({ hdri: "/env.hdr" });
  });

  it("the neutral-room fallback ignores the authored intensity: 0.7 and 1 bind the room at 1 (remote: identical frames, 73.29 and 73.29)", () => {
    const room = { kind: "neutral-room" as const, diffuseIntensity: 1, specularIntensity: 1 };
    for (const intensity of [0.7, 1]) {
      expect(prd02ProbeBindIntensities(hdriEnv(intensity).lighting, room, true)).toEqual({ diffuseIntensity: 1, specularIntensity: 1 });
    }
    expect(mean("pbr:aura:0:0.7:nobloom")).toBe(mean("pbr:aura:0:1:nobloom"));
    expect(row("pbr:aura:0:0.7:nobloom").hdriStatus).toBe("none");
    expect(row("pbr:aura:0:0.7:nobloom:ref").hdriStatus).toBe("ready");
  });

  // What "identical nominal lights" does and does not give (remote rows, whole frame and regions). These pin the measured figures the README
  // quotes, so the README cannot drift from the evidence; they say nothing about the engine.
  it("matched input, bloom as authored: whole frame -6.9%, but the subject is 12% darker and the background 29% brighter than three.js", () => {
    const aura = "pbr:aura:1.1:0.7:bloom:ref";
    const three = "pbr:three:1.1:0.7:bloom";
    expect(ratio(mean(aura), mean(three)) - 1).toBeCloseTo(-0.069, 2);
    expect(ratio(region(aura, "centre"), region(three, "centre")) - 1).toBeCloseTo(-0.12, 2);
    expect(ratio(region(aura, "top"), region(three, "top")) - 1).toBeCloseTo(0.287, 2);
  });

  it("matched input, no bloom: Aura3D is 17.6% above three.js on the whole frame; the bloom term pulls the two together", () => {
    expect(ratio(mean("pbr:aura:1.1:0.7:nobloom:ref"), mean("pbr:three:1.1:0.7:nobloom")) - 1).toBeCloseTo(0.176, 2);
    const bloomGainThree = mean("pbr:three:1.1:0.7:bloom") - mean("pbr:three:1.1:0.7:nobloom");
    const bloomGainAura = mean("pbr:aura:1.1:0.7:bloom:ref") - mean("pbr:aura:1.1:0.7:nobloom:ref");
    expect(bloomGainThree).toBeGreaterThan(10);
    expect(bloomGainAura).toBeLessThan(1);
  });

  it("the background gap is a tone-map difference: three's composer maps #1a1d24 down to luma 11, Aura3D shows the authored colour (29)", () => {
    const bg = srgbHexToLinear("#1a1d24");
    expect(Math.abs(referenceAcesLuma255(bg) - region("pbr:three:1.1:0.7:nobloom", "top"))).toBeLessThan(1.5);
    expect(Math.abs(lumaOfSrgb255([0x1a, 0x1d, 0x24]) - region("pbr:aura:1.1:0.7:nobloom:ref", "top"))).toBeLessThan(1.5);
  });
});

describe("forest: hemisphere light + sun", () => {
  const sky = srgbHexToLinear("#dce8f2");
  const groundColour = srgbHexToLinear("#4d6358");
  const sunColor = srgbHexToLinear("#fff4e0");
  const sunDir = unit([30, 50, 20]);
  const hemisphereIntensity = 1.1;
  const sunIntensity = 2.4;
  const env = createProductionRuntimeEnvironment(snapshot([
    { kind: "light", light: "hemisphere", name: "h", intensity: hemisphereIntensity, color: "#dce8f2", groundColor: "#4d6358", position: [0, 1, 0] },
    { kind: "light", light: "directional", name: "sun", intensity: sunIntensity, color: "#fff4e0", position: [30, 50, 20] }
  ]), undefined, { implicitFill: false });
  const engineAmbient = ambientToExitRadiance(env.lighting.color ?? [1, 1, 1], env.lighting.intensity ?? 0);

  /** three r185: A * (hemisphere irradiance(n) / PI + sun * I * max(0, n.l) / PI), the sun unshadowed. */
  const threeRadiance = (albedo: Vec3, n: Vec3, shadowed: boolean): Vec3 => {
    const h = a3dHemisphereIrradiance(sky.map((c) => c * hemisphereIntensity) as unknown as Vec3, groundColour.map((c) => c * hemisphereIntensity) as unknown as Vec3, [0, 1, 0], n);
    const sun = shadowed ? 0 : sunIntensity * Math.max(0, dot(unit(n), sunDir)) / Math.PI;
    return [0, 1, 2].map((i) => albedo[i]! * (h[i]! / Math.PI + sunColor[i]! * sun)) as unknown as Vec3;
  };
  const engineRadiance = (albedo: Vec3, n: Vec3, shadowed: boolean): Vec3 => {
    const sun = shadowed ? 0 : sunIntensity * Math.max(0, dot(unit(n), sunDir)) / Math.PI;
    return [0, 1, 2].map((i) => albedo[i]! * (engineAmbient[i]! + sunColor[i]! * sun)) as unknown as Vec3;
  };
  const luma = (v: Vec3): number => v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;

  it("the compiled forest lighting is the authored lights only: no probe, no implicit fill, the neutral room probe zeroed", () => {
    expect(env.preset).toBe("authored-lights");
    expect(env.lighting.environmentMapIntensity).toBe(0);
    expect(env.lighting.environmentMapSpecularIntensity).toBe(0);
    expect(env.lighting.proceduralMap).toBeUndefined();
    const room = { kind: "neutral-room" as const, diffuseIntensity: 1, specularIntensity: 1 };
    expect(prd02ProbeBindIntensities(env.lighting, room, true)).toEqual({ diffuseIntensity: 0, specularIntensity: 0 });
  });

  it("the engine's ambient is the mean of the sky and ground colours times 1.1 over PI, computed here from the hex values", () => {
    for (let i = 0; i < 3; i += 1) expect(engineAmbient[i]! / (((sky[i]! + groundColour[i]!) / 2) * hemisphereIntensity / Math.PI)).toBeCloseTo(1, 6);
  });

  // Cause (hemisphere): Aura3D folds a hemisphere light to the uniform mean(sky, ground); three weights by n.up.
  it("a horizontal normal gets the same ambient in both (mean of sky and ground)", () => {
    const a = srgbHexToLinear("#6b4a32");
    const got = engineRadiance(a, [1, 0, 0], true);
    const want = threeRadiance(a, [1, 0, 0], true);
    for (let i = 0; i < 3; i += 1) expect(got[i]! / want[i]!).toBeCloseTo(1, 6);
  });

  it("an up-facing normal (the ground, canopy tops) gets about 0.55x of three's ambient, a down-facing one about 3.9x", () => {
    const a = srgbHexToLinear("#566b4a");
    const upRatio = luma(engineRadiance(a, [0, 1, 0], true)) / luma(threeRadiance(a, [0, 1, 0], true));
    const downRatio = luma(engineRadiance(a, [0, -1, 0], true)) / luma(threeRadiance(a, [0, -1, 0], true));
    expect(upRatio).toBeGreaterThan(0.5);
    expect(upRatio).toBeLessThan(0.62);
    expect(downRatio).toBeGreaterThan(3.5);
    expect(downRatio).toBeLessThan(4.4);
  });

  it("the sunlit ground reads 0.88x of three's radiance; the share of the gap that the hemisphere fold explains is bounded by that", () => {
    const a = srgbHexToLinear("#566b4a");
    const ratio = luma(engineRadiance(a, [0, 1, 0], false)) / luma(threeRadiance(a, [0, 1, 0], false));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  });

  // Cause (bench source): the Aura3D forest writes hsl(97..126 45% 20..32%), read as sRGB; the three forest calls setHSL(h, s, l)
  // with no colour space, which reads the numbers in the linear working space. Same numbers, different albedo.
  it("the canopy and rock colours are not the same albedo in the two bench sources", () => {
    const hslToRgb = (h: number, s: number, l: number): Vec3 => {
      const f = (n: number): number => {
        const k = (n + h * 12) % 12;
        return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      return [f(0), f(8), f(4)];
    };
    const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    for (const [h, s, l, minRatio] of [[110 / 360, 0.45, 0.26, 3], [29 / 360, 0.05, 0.4, 2.5]] as const) {
      const rgb = hslToRgb(h, s, l);
      const asSrgb = rgb.map(toLinear) as unknown as Vec3; // Aura3D bench: CSS hsl() is sRGB
      const asLinear = rgb; // three bench: setHSL() default is the linear working space
      expect(luma(asLinear) / luma(asSrgb)).toBeGreaterThan(minRatio);
    }
  });

  const displayLuma = (radiance: Vec3): number => referenceAcesLuma255(radiance);
  const groundAlbedo = srgbHexToLinear("#566b4a");
  const sunOnlyRadiance = (): Vec3 => lambert(groundAlbedo, sunColor.map((c) => c * sunIntensity * sunDir[1] / Math.PI) as Vec3);
  const hemiOnlyEngine = (): Vec3 => lambert(groundAlbedo, engineAmbient);
  const hemiOnlyThree = (): Vec3 => lambert(groundAlbedo, a3dHemisphereIrradiance(sky.map((c) => c * hemisphereIntensity) as unknown as Vec3, groundColour.map((c) => c * hemisphereIntensity) as unknown as Vec3, [0, 1, 0], [0, 1, 0]).map((c) => c / Math.PI) as Vec3);
  const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const G = (lib: string, tail = ""): string => `forest:${lib}:linear:noshadow:nofog:ground${tail}`;

  // Ground-only ablation (no trees or rocks, no shadows, no fog; the bottom strip is the ground), remote rows forest:<lib>:linear:noshadow:nofog:ground[:sun0|:hemi0].
  it("ground only, sun alone: the two libraries read the same (remote bottom strip 74.05 vs 74.06), as the sun term is the same rule", () => {
    expect(within(region(G("aura", ":hemi0"), "bottom"), region(G("three", ":hemi0"), "bottom"), 0.02)).toBe(true);
    expect(within(region(G("aura", ":hemi0"), "centre"), region(G("three", ":hemi0"), "centre"), 0.03)).toBe(true);
  });

  it("ground only, hemisphere alone: the model puts the up-facing ground near 0.55x of three; the remote strip reads 0.57x", () => {
    const modelled = displayLuma(hemiOnlyEngine()) / displayLuma(hemiOnlyThree());
    const measured = ratio(region(G("aura", ":sun0"), "bottom"), region(G("three", ":sun0"), "bottom"));
    expect(measured).toBeGreaterThan(0.5);
    expect(measured).toBeLessThan(0.65);
    expect(within(modelled, measured, 0.12)).toBe(true);
  });

  it("ground only, both lights: the model puts Aura3D below three.js (about 0.9x) and the remote ground strip agrees in sign and size (88.0 vs 96.4)", () => {
    const modelled = displayLuma(add(sunOnlyRadiance(), hemiOnlyEngine())) / displayLuma(add(sunOnlyRadiance(), hemiOnlyThree()));
    const measured = ratio(region(G("aura"), "bottom"), region(G("three"), "bottom"));
    expect(modelled).toBeLessThan(1);
    expect(measured).toBeLessThan(1);
    expect(within(modelled, measured, 0.06)).toBe(true);
  });

  // Cause of the canopy residual: the cone mesh has radius 1 (the parity generator default), so a node `size` scales the radius,
  // while box, sphere and cylinder meshes span 1 across. The Aura bench writes size [1.8, 2.2, 1.8] for a canopy of radius 0.9.
  it("the forest's instanced shapes: cylinder and sphere span their size, the cone spans twice its size across (radius 1 mesh)", () => {
    const span = (primitive: "cone" | "cylinder" | "sphere", size: readonly [number, number, number]): number[] => {
      const node = { kind: "primitive", primitive, size, instances: new Array(8000).fill({ position: [0, 0, 0] }) };
      const mesh = qrPrimitiveMeshFor(node as never, { core: true, primitiveSegments: "full" } as never)!;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < mesh.positions.length; i += 3) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k]!, mesh.positions[i + k]!); hi[k] = Math.max(hi[k]!, mesh.positions[i + k]!); }
      return [0, 1, 2].map((k) => (hi[k]! - lo[k]!) * size[k]!);
    };
    const trunk = span("cylinder", [0.36, 1.2, 0.36]);
    const rock = span("sphere", [1, 1, 1]);
    const canopy = span("cone", [1.8, 2.2, 1.8]);
    expect(trunk[0]).toBeCloseTo(0.36, 5); // three: CylinderGeometry(0.18, 0.18, 1.2)
    expect(rock[0]).toBeCloseTo(1, 5); // three: SphereGeometry(0.5)
    expect(canopy[0]).toBeCloseTo(3.6, 5); // three: ConeGeometry(0.9, 2.2, 7) spans 1.8
    expect(canopy[1]).toBeCloseTo(2.2, 5);
  });

  // Cause of the canopy excess (characterisation of the engine as it is): the vertex shader takes the mesh normal as is (mat3(instanceMatrix) * a_normal,
  // see program/ProgramGenerator.ts) while `size` folds into u_geometryMatrix for positions only, so a cone stretched by a non-uniform size keeps the
  // normals of the unit cone. When the normal path is fixed this test should flip: the engine normal then equals the true one.
  it("a cone sized [0.9, 2.2, 0.9] keeps the unit cone's normals (y 0.707); the true slope normal has y 0.378, three's value", () => {
    const size = [0.9, 2.2, 0.9] as const;
    const node = { kind: "primitive", primitive: "cone", size, instances: new Array(8000).fill({ position: [0, 0, 0] }) };
    const mesh = qrPrimitiveMeshFor(node as never, { core: true, primitiveSegments: "full" } as never)!;
    const sideNormals: Vec3[] = [];
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const n: Vec3 = [mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!];
      if (n[1] > 0.1 && n[1] < 0.9) sideNormals.push(n);
    }
    expect(sideNormals.length).toBeGreaterThan(8);
    const trueNormal = (n: Vec3): Vec3 => unit([n[0] / size[0], n[1] / size[1], n[2] / size[2]]);
    for (const n of sideNormals) {
      expect(n[1]).toBeCloseTo(Math.SQRT1_2, 3);
      expect(trueNormal(n)[1]).toBeCloseTo(0.378, 2);
    }
    // Sun-term consequence: the mean of max(0, n.l) over the side normals, engine against true, with the forest sun direction.
    const meanLit = (normals: readonly Vec3[]): number => normals.reduce((sum, n) => sum + Math.max(0, dot(unit(n), sunDir)), 0) / normals.length;
    expect(meanLit(sideNormals) / meanLit(sideNormals.map(trueNormal))).toBeGreaterThan(1.5);
  });

  it("with the cone built to three's dimensions in the mesh (true normals), Aura3D lands on three.js: canopies within 8%, whole frame within 1%", () => {
    const bottom = (id: string): number => region(id, "bottom");
    // Canopies only, bottom strip: bench size [1.8, 2.2, 1.8] (radius 1.8, wrong normals) 132.8; r09 (radius 0.9, wrong normals) 128.9; meshdims 110.1; three 118.8.
    expect(bottom("forest:aura:linear:noshadow:nofog:canopies")).toBeGreaterThan(bottom("forest:aura:linear:noshadow:nofog:canopies:r09:cone7"));
    expect(bottom("forest:aura:linear:noshadow:nofog:canopies:r09:cone7")).toBeGreaterThan(bottom("forest:aura:linear:noshadow:nofog:canopies:meshdims") * 1.1);
    expect(within(bottom("forest:aura:linear:noshadow:nofog:canopies:meshdims"), bottom("forest:three:linear:noshadow:nofog:canopies"), 0.08)).toBe(true);
    // Whole frame, sRGB-linear matched colours, shadows and fog on.
    expect(within(mean("forest:aura:linear:shadow:fog:meshdims"), mean("forest:three:linear:shadow:fog"), 0.01)).toBe(true);
    expect(within(mean("forest:aura:linear:shadow:fog:r09:cone7"), mean("forest:three:linear:shadow:fog"), 0.07)).toBe(true);
    expect(mean("forest:aura:linear:shadow:fog:r09:cone7")).toBeGreaterThan(mean("forest:aura:linear:shadow:fog:meshdims") * 1.03);
    // The same numbers read as sRGB in both: 6% above, with the canopies dark (the residual there is the ground fold and the sky).
    expect(within(mean("forest:aura:css:shadow:fog:meshdims"), mean("forest:three:css:shadow:fog"), 0.08)).toBe(true);
  });

  // Remote rows, canopies only (no ground lighting term in the comparison: ground-only strip is 0.91x, trunks and rocks track it).
  it("trunks and rocks track the ground (Aura3D 8 to 10% below three.js in the bottom strip); the canopies are 12% above", () => {
    const strip = (lib: string, part: string): number => region(`forest:${lib}:linear:noshadow:nofog:${part}`, "bottom");
    for (const part of ["ground", "trunks", "rocks"]) {
      const r = strip("aura", part) / strip("three", part);
      expect(r).toBeGreaterThan(0.89);
      expect(r).toBeLessThan(0.93);
    }
    expect(strip("aura", "canopies") / strip("three", "canopies")).toBeGreaterThan(1.1);
  });

  it("the canopy excess is not roughness, per-instance colours or the cone's segment count (remote rows: each leaves Aura3D 10% or more above)", () => {
    const bottom = (lib: string, tail: string): number => region(`forest:${lib}:linear:noshadow:nofog:canopies${tail}`, "bottom");
    for (const tail of [":rough1", ":plain", ":rough1:plain"]) expect(bottom("aura", tail) / bottom("three", tail)).toBeGreaterThan(1.1);
    expect(bottom("aura", ":cone7") / bottom("three", "")).toBeGreaterThan(1.1);
  });

  // Whole-frame figures (remote rows, 8000 trees and 2000 rocks).
  it("as written, Aura3D is 19% below three.js on the whole frame (119.6 vs 148.1); the same numbers read the same way in both put it above", () => {
    expect(ratio(mean("bench:forest:aura"), mean("bench:forest:three")) - 1).toBeCloseTo(-0.193, 2);
    expect(ratio(mean("forest:aura:css:shadow:fog"), mean("forest:three:css:shadow:fog")) - 1).toBeCloseTo(0.084, 2);
    expect(ratio(mean("forest:aura:linear:shadow:fog"), mean("forest:three:linear:shadow:fog")) - 1).toBeCloseTo(0.08, 2);
  });
});
