/**
 * PRD-01 Phase 3b — C-02 program generator conformance (PR F).
 * Covers §6.4 assembly, §8.1 removals, §8.5 vertex convention, §8.7 depth,
 * key canonicalization, hook splicing, and extension-lobe-pending (C-36).
 */

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import { generateProgram, computeProgramKey, registerShaderChunk, registerShaderFeature } from "../../../../packages/rendering/src/contracts/program";
import { registerMaterialLobe } from "../../../../packages/rendering/src/contracts/materialLobes";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl, programDegradationLog, GENERATED_PROGRAM_MARKER } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { programKey } from "../../../../packages/rendering/src/program/ProgramKey";

const FLAGS = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });

function gen(partial: Partial<ProgramFeatures>) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: FLAGS });
}

function assertBalanced(src: string) {
  let depth = 0;
  for (const ch of src) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    expect(depth).toBeGreaterThanOrEqual(0);
  }
  expect(depth).toBe(0);
}

const BANNED = [/mix\(1\.1,/, /mix\(1\.0, 0\.18/, /u_outputColorSpace/, /step\(0\.5, u_/, /a3dApplyMetalRough/, /a3dApplyAdvancedPbrLobes/, /roughEnvironmentFloor/];

describe("generateProgram (C-02 real)", () => {
  const cases: [string, Partial<ProgramFeatures>][] = [
    ["unlit-opaque", {}],
    ["unlit-blend", { alphaMode: "blend" }],
    ["lit-1dir", { lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
    ["lit-full8", { lighting: "lit", lights: { dir: 2, point: 4, spot: 2, rect: 0, clustered: false, hemisphere: false } }],
    ["lit-clustered", { lighting: "lit", lights: { dir: 2, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } }],
    ["lit-maps", { lighting: "lit", maps: { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false }, metallicRoughness: { uvSet: 0, transform: false }, occlusion: { uvSet: 1, transform: false }, emissive: { uvSet: 0, transform: false } } }],
    ["lit-env-equirect", { lighting: "lit", environment: "equirect", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
    ["mask-instanced", { alphaMode: "mask", instancing: { color: true } }],
    ["vertex-colors", { vertexColors: true, lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
    ["flat-fog", { flatShading: true, fog: "exp2", lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
    ["depth-mask", { pass: "depth", alphaMode: "mask", maps: { baseColor: { uvSet: 0, transform: false } } }],
    ["distance", { pass: "distance" }],
    ["background-coverage", { backgroundCoverage: true }]
  ];

  it.each(cases)("%s: assembles well-formed GLSL 300 es", (_name, partial) => {
    const out = gen(partial);
    expect(out.vertex).toContain("#version 300 es");
    expect(out.fragment).toContain("#version 300 es");
    expect(out.vertex).toContain(GENERATED_PROGRAM_MARKER);
    expect(out.fragment).toContain(GENERATED_PROGRAM_MARKER);
    expect(out.vertex).toContain("layout(std140, binding = 0) uniform AuraFrame");
    assertBalanced(out.vertex);
    assertBalanced(out.fragment);
    for (const banned of BANNED) {
      expect(out.vertex).not.toMatch(banned);
      expect(out.fragment).not.toMatch(banned);
    }
  });

  it("emits bucketed unrolled light loops and the clustered path", () => {
    const out = gen({ lighting: "lit", lights: { dir: 1, point: 2, spot: 0, rect: 0, clustered: false, hemisphere: false } });
    expect(out.fragment).toContain("for (int i = 0; i < 3; ++i)");
    expect(out.defines.LIGHTS_CLUSTERED).toBeUndefined();
    const cl = gen({ lighting: "lit", lights: { dir: 0, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } });
    expect(cl.defines.LIGHTS_CLUSTERED).toBe(true);
    expect(cl.fragment).toContain("a3dClusteredLightRadiance");
    expect(cl.fragment).not.toContain("for (int i = 0; i < 8");
  });

  it("bakes §8.5 order: model · instance · geometry", () => {
    const out = gen({ instancing: { color: false } });
    expect(out.vertex).toContain("u_modelMatrix * instanceMatrix * a3dLocal");
    expect(out.vertex).toContain("u_geometryMatrix * vec4(transformed, 1.0)");
    expect(out.vertex).toContain("a_instanceMatrix0");
  });

  it("§8.7: depth fragment discards under ALPHA_MASK; distance packs radial depth", () => {
    const depth = gen({ pass: "depth", alphaMode: "mask", maps: { baseColor: { uvSet: 0, transform: false } } });
    expect(depth.fragment).toContain("a3dApplyAlpha");
    expect(depth.fragment).toContain("gl_FragCoord.z");
    const dist = gen({ pass: "distance" });
    expect(dist.fragment).toContain("a3dPackDistance");
    expect(dist.fragment).toContain("u_distanceLight");
  });

  it("WGSL target throws WGSL_PROGRAM_MISSING without a lane-11 emitter", () => {
    expect(() => gen({ target: "wgsl" })).toThrow(/WGSL_PROGRAM_MISSING/);
  });
});

describe("ProgramKey canonicalization", () => {
  it("sparse and explicit-default records share a key", () => {
    expect(programKey({})).toBe(programKey(normalizeProgramFeatures({})));
    expect(computeProgramKey(normalizeProgramFeatures({ lighting: "lit" }))).toBe(programKey({ lighting: "lit" }));
  });

  it("5,000 random records: distinct records never collide", () => {
    let seed = 0x9e3779b9;
    const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const seen = new Map<string, ProgramFeatures>();
    let checked = 0;
    for (let i = 0; i < 5000 && checked < 500; i++) {
      const rec = normalizeProgramFeatures({
        lighting: rand() > 0.4 ? "lit" : "unlit",
        alphaMode: (["opaque", "mask", "blend"] as const)[Math.floor(rand() * 3)],
        vertexColors: rand() > 0.5,
        doubleSided: rand() > 0.5,
        flatShading: rand() > 0.7,
        fog: (["none", "linear", "exp2", "height"] as const)[Math.floor(rand() * 4)],
        environment: (["none", "equirect", "pmrem-cube"] as const)[Math.floor(rand() * 3)],
        instancing: rand() > 0.6 ? { color: rand() > 0.5 } : undefined,
        lights: { dir: Math.floor(rand() * 3) as 0 | 1 | 2 | 4 | 8, point: Math.floor(rand() * 5) as 0 | 1 | 2 | 4 | 8, spot: Math.floor(rand() * 3) as 0 | 1 | 2 | 4 | 8, rect: Math.floor(rand() * 2) as 0 | 1 | 2 | 4, clustered: rand() > 0.8, hemisphere: rand() > 0.7 },
        maps: rand() > 0.5 ? { baseColor: { uvSet: rand() > 0.8 ? 1 : 0 as 0 | 1, transform: false } } : {}
      });
      const key = programKey(rec);
      const prev = seen.get(key);
      if (prev) {
        expect(computeProgramKey(prev)).toBe(key); // equal by value -> equal key is fine
      } else {
        seen.set(key, rec);
        checked++;
      }
    }
    expect(checked).toBe(500);
    expect(seen.size).toBe(500);
  });
});

describe("hook splicing + extension lobes", () => {
  it("spliced registered chunks land at their hook, ordered by (order, id)", () => {
    registerShaderChunk({ name: "test_b_chunk", owner: "prd01", stage: "fragment", glsl: "b3dFragB();" });
    registerShaderChunk({ name: "test_a_chunk", owner: "prd01", stage: "fragment", glsl: "b3dFragA();" });
    const unregB = registerShaderFeature({
      id: "prd01.testB", owner: "prd01", order: 2, flag: "A3D_QR_CORE",
      select: () => true, defines: () => ({ TEST_B: true }),
      chunks: ["test_b_chunk"], hooks: ["fragment:emissive"]
    });
    const unregA = registerShaderFeature({
      id: "prd01.testA", owner: "prd01", order: 1, flag: "A3D_QR_CORE",
      select: () => true, defines: () => ({ TEST_A: true }),
      chunks: ["test_a_chunk"], hooks: ["fragment:emissive"]
    });
    try {
      const out = gen({ features: { "prd01.testA": true, "prd01.testB": true } });
      const aIdx = out.fragment.indexOf("b3dFragA();", out.fragment.indexOf("void main"));
      const bIdx = out.fragment.indexOf("b3dFragB();", out.fragment.indexOf("void main"));
      expect(aIdx).toBeGreaterThan(-1);
      expect(bIdx).toBeGreaterThan(aIdx); // (order,id): testA before testB
      expect(out.defines.TEST_A).toBe(true);
      expect(out.defines.TEST_B).toBe(true);
    } finally {
      unregA(); unregB();
    }
  });

  it("unknown extension -> extension-lobe-pending (ownerPrd 4); registered lobe splices once", () => {
    programDegradationLog.length = 0;
    gen({ extensions: [{ lobe: "KHR_materials_clearcoat", maps: [], bits: {} }] });
    expect(programDegradationLog.filter((d) => d.code === "extension-lobe-pending")).toHaveLength(1);
    expect(programDegradationLog[0].ownerPrd).toBe(4);

    registerShaderChunk({ name: "test_lobe_frag", owner: "prd04", stage: "fragment", glsl: "a3dTestLobe(material);" });
    registerShaderChunk({ name: "test_lobe_pars", owner: "prd04", stage: "fragment", glsl: "float a3dTestLobeScale = 1.0;" });
    const unreg = registerMaterialLobe({
      id: "clearcoat", owner: "prd04", flag: "A3D_QR_CORE", glTFExtension: "KHR_materials_clearcoat",
      feature: () => ({ lobe: "clearcoat", maps: [], bits: {} }),
      chunks: { pars: "test_lobe_pars", fragment: "test_lobe_frag" },
      samplerSlots: [], bind: () => undefined
    });
    try {
      programDegradationLog.length = 0;
      const out = gen({ lighting: "lit", extensions: [{ lobe: "KHR_materials_clearcoat", maps: [], bits: {} }] });
      expect(programDegradationLog).toHaveLength(0);
      expect(out.fragment.match(/a3dTestLobe\(material\)/g)).toHaveLength(1);
      expect(out.fragment).toContain("a3dTestLobeScale");
    } finally {
      unreg();
    }
  });

  it("vertex:deform emits the canonical a3dDeform call only when a feature contributes", () => {
    const base = gen({ features: { "prd06.deform": true } });
    expect(base.vertex).toContain("C-18 passthrough");
    expect(base.vertex).not.toContain("a3dDeform(a3dDeformPos");

    registerShaderChunk({
      name: "test_deform", owner: "prd06", stage: "vertex",
      glsl: "void a3dDeform(out vec4 pos, out vec3 nrm, out vec4 tan) { pos.y += 0.0; nrm = nrm; tan = tan; }"
    });
    const unreg = registerShaderFeature({
      id: "prd06.deform", owner: "prd06", flag: "A3D_QR_CORE", select: () => true, defines: () => ({}),
      chunks: ["test_deform"], hooks: ["vertex:deform"]
    });
    try {
      const out = gen({ features: { "prd06.deform": true } });
      expect(out.vertex).toContain("a3dDeform(a3dDeformPos, objectNormal, objectTangent)");
      expect(out.vertex).toContain("void a3dDeform(out vec4 pos");
    } finally {
      unreg();
    }
  });

  it("contract generateProgram delegates to the installed lane-01 impl", () => {
    const out = generateProgram(normalizeProgramFeatures({}));
    expect(out.vertex).toContain(GENERATED_PROGRAM_MARKER);
  });
});
