// #1143: lane 10's `prd10.caustics` and `prd10.wind` ShaderFeatures must run
// on the engine's generated-program (C-02) path: generator-compatible (no
// "[prd01] ... is skipped on the generated-program path" warning), selected
// per item through ShaderFeature.select, and actually spliced into the
// generated program's sources.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../packages/engine/src/lanes/prd10";
import "../../../../packages/rendering/src/program/ProgramGenerator";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { shaderFeaturesFor, type ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { featureGeneratorIncompatibility, selectShaderFeatureBits } from "../../../../packages/rendering/src/program/FeatureSelect";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";

// Only lane 10 on: lighting is default-on now, and its program features would
// change the selection under test.
const FLAGS = resolveQrFlags({ env: { A3D_QR: "world,-lighting" } });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function feature(id: string) {
  const found = shaderFeaturesFor(FLAGS).find((f) => f.id === id);
  expect(found, `${id} registered under A3D_QR=world`).toBeDefined();
  return found!;
}

function select(label: string, pass: ProgramFeatures["pass"] = "forward") {
  return selectShaderFeatureBits({
    item: { label } as never,
    pass: pass as never,
    tier: {} as never,
    flags: FLAGS
  } as never);
}

function program(pass: ProgramFeatures["pass"], features: Record<string, string | number | boolean>) {
  const lit = pass === "forward";
  return generateProgramImpl(
    normalizeProgramFeatures({ pass, lighting: lit ? "lit" : "unlit", ...(lit ? { lights: LIGHT1 } : {}), features } as Partial<ProgramFeatures>),
    { flags: FLAGS }
  );
}

afterEach(() => vi.restoreAllMocks());

describe("#1143 lane-10 features on the generated-program path", () => {
  it("both features are generator-compatible and select without the skip warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(featureGeneratorIncompatibility(feature("prd10.caustics"))).toBeUndefined();
    expect(featureGeneratorIncompatibility(feature("prd10.wind"))).toBeUndefined();
    expect(select("prd10.caustics:seabed")["prd10.caustics"]).toBe(1);
    expect(select("prd10.wind:grass")["prd10.wind"]).toBe(1);
    expect(select("plain-mesh")).not.toHaveProperty("prd10.wind");
    const skips = warn.mock.calls.map((c) => String(c[0])).filter((m) => /prd10\.(caustics|wind).*skipped/.test(m));
    expect(skips).toEqual([]);
  });

  it("prd10.caustics compiles into the forward fragment: pars at global scope, call inside main after the default lights", () => {
    const { fragment } = program("forward", { "prd10.caustics": 1 });
    const main = fragment.indexOf("void main() {");
    const pars = fragment.indexOf("uniform sampler2D u_causticAtlas;");
    const call = fragment.indexOf("float a3dCausticBoost = a3dCausticsBoost(");
    expect(fragment).toContain("#define A3D_PRD10_CAUSTICS 1");
    expect(pars).toBeGreaterThan(-1);
    expect(pars).toBeLessThan(main);
    expect(fragment).toContain("float a3dCausticsBoost(vec3 worldPos");
    expect(call).toBeGreaterThan(main);
    // The default light loop still runs (fragment:indirect appends; a
    // fragment:lights claim would have replaced it), and the boost follows it.
    const lights = fragment.indexOf("a3dDirectLight(L, radiance, V, N, material, directDiffuse, directSpecular);");
    expect(lights).toBeGreaterThan(main);
    expect(call).toBeGreaterThan(lights);
    expect(fragment).toContain("directDiffuse *= a3dCausticBoost;");
    expect(fragment).not.toMatch(/uniform float u_time;/);
  });

  it("prd10.wind compiles into the generated vertex stage via the canonical C-18 a3dDeform call", () => {
    for (const pass of ["forward", "depth", "distance"] as const) {
      const { vertex } = program(pass, { "prd10.wind": 1 });
      const main = vertex.indexOf("void main() {");
      const def = vertex.indexOf("void a3dDeform(inout vec4 localPos, inout vec3 localNormal, inout vec4 localTangent)");
      expect(def, pass).toBeGreaterThan(-1);
      expect(def, pass).toBeLessThan(main);
      expect(vertex, pass).toContain("vec3 a3dWindOffset(vec3 localPos");
      expect(vertex.slice(main), pass).toContain("a3dDeform(a3dDeformPos, objectNormal, objectTangent);");
      expect(vertex, pass).toContain("#define A3D_PRD10_WIND 1");
      // No A3DWind block on the generated path (it would alias AuraFrame's binding 0).
      expect(vertex, pass).not.toContain("uniform A3DWind");
    }
  });

  it("bindUniforms binds every uniform the generated chunks declare", () => {
    const names = (id: string) => {
      const set = new Map<string, unknown>();
      feature(id).bindUniforms?.(1, {} as never, (name, value) => set.set(name, value));
      return [...set.keys()].sort();
    };
    expect(names("prd10.wind")).toEqual(["u_windAssetHeight", "u_windDirStrength", "u_windGust", "u_windNoise"]);
    expect(names("prd10.caustics")).toEqual(["u_causticAtlas", "u_causticScale", "u_causticStrength", "u_causticSunDir", "u_waterHeight"]);
  });
});
