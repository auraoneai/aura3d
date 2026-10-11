/**
 * 01-T3 (PRD-16, lane-01 brief Wave C): generator units.
 *   - a depth program with a deform chunk calls the canonical a3dDeform();
 *   - a lit forward program declares exactly one environment sampler;
 *   - clearcoat with no registered lobe records exactly one
 *     `extension-lobe-pending` (ownerPrd 4) and splices no lobe code.
 * The flag-off sentinels for the accepted legacy patches (02 Q-01-1..4,
 * 04 Q-01-1..4, 07 R-01-2) are pixel identity checks on the 18 base scenes.
 * They run in the remote sentinel job, not here.
 */

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import { registerShaderChunk, registerShaderFeature, type ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl, programDegradationLog, type ProgramDegradation } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";

const CORE = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function gen(partial: Partial<ProgramFeatures>, onDegradation?: (d: ProgramDegradation) => void) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: CORE, onDegradation });
}

describe("01-T3: depth program with a deform chunk", () => {
  it("depth and distance passes call a3dDeform() and keep the depth fragment", () => {
    registerShaderChunk({
      name: "t3_deform", owner: "prd06", stage: "vertex",
      glsl: "void a3dDeform(inout vec4 pos, inout vec3 nrm, inout vec4 tan) { pos.y += 0.0; }"
    });
    const unreg = registerShaderFeature({
      id: "prd01.t3Deform", owner: "prd01", flag: "A3D_QR_CORE", select: () => true, defines: () => ({ T3_DEFORM: true }),
      chunks: ["t3_deform"], hooks: ["vertex:deform"]
    });
    try {
      for (const pass of ["depth", "distance"] as const) {
        const out = gen({ pass, lighting: "unlit", features: { "prd01.t3Deform": true } });
        expect(out.vertex, pass).toContain("void a3dDeform(inout vec4 pos");
        expect(out.vertex, pass).toContain("a3dDeform(a3dDeformPos, objectNormal, objectTangent);");
        expect(out.vertex.indexOf("void a3dDeform("), pass).toBeLessThan(out.vertex.indexOf("void main()"));
        expect(out.defines.T3_DEFORM, pass).toBe(true);
        expect(out.fragment, pass).not.toContain("PhysicalMaterial");
      }
      const plain = gen({ pass: "depth", lighting: "unlit" });
      expect(plain.vertex).toContain("C-18 passthrough");
    } finally {
      unreg();
    }
  });
});

describe("01-T3: exactly one environment sampler", () => {
  const samplerDecls = (src: string) => (src.match(/^\s*uniform\s+sampler(?:2D|Cube)\s+u_environment\w*\s*;/gm) ?? []);
  /** The env samplers sit in mutually exclusive `#if CUBE_UV / #elif EQUIRECT` branches (#1140 cube IBL). */
  const branchOf = (src: string, decl: string) => {
    const at = src.indexOf(decl);
    const cube = src.lastIndexOf("#if defined(ENVMAP_TYPE_CUBE_UV)", at);
    const equirect = src.lastIndexOf("#elif defined(ENVMAP_TYPE_EQUIRECT)", at);
    const end = src.indexOf("#endif", Math.max(cube, equirect));
    return at < 0 || at > end ? "none" : equirect > cube ? "equirect" : "cube";
  };

  it("lit forward + equirect compiles exactly one env sampler (the 2D map)", () => {
    const out = gen({ lighting: "lit", lights: LIGHT1, environment: "equirect" });
    expect(out.defines.ENVMAP_TYPE_EQUIRECT).toBe(true);
    expect(out.defines.ENVMAP_TYPE_CUBE_UV).toBeUndefined();
    expect(branchOf(out.fragment, "uniform sampler2D u_environmentMap;")).toBe("equirect");
    expect(branchOf(out.fragment, "uniform samplerCube u_environmentCubeMap;")).toBe("cube");
    expect(samplerDecls(out.vertex)).toEqual([]);
  });

  it("lit forward + pmrem-cube selects the cube branch only", () => {
    const out = gen({ lighting: "lit", lights: LIGHT1, environment: "pmrem-cube" });
    expect(out.defines.ENVMAP_TYPE_CUBE_UV).toBe(true);
    expect(out.defines.ENVMAP_TYPE_EQUIRECT).toBeUndefined();
    expect(out.defines.A3D_ENV_SAMPLE).toBe(true);
  });

  it("no environment and unlit programs declare none", () => {
    // With no environment neither guard define is set, so no sampler is compiled in.
    const noEnv = gen({ lighting: "lit", lights: LIGHT1 });
    expect(noEnv.defines.ENVMAP_TYPE_EQUIRECT).toBeUndefined();
    expect(noEnv.defines.ENVMAP_TYPE_CUBE_UV).toBeUndefined();
    expect(noEnv.defines.A3D_ENV_SAMPLE).toBeUndefined();
    expect(samplerDecls(gen({ lighting: "unlit", environment: "equirect" }).fragment)).toEqual([]);
  });
});

describe("01-T3: empty-registry clearcoat", () => {
  it("records exactly one extension-lobe-pending and splices no lobe code", () => {
    // `core` alone: the C-03 lobes are gated by A3D_QR_MATERIALS, so the
    // active registry is empty for this record.
    programDegradationLog.length = 0;
    const sink: ProgramDegradation[] = [];
    const out = gen({ lighting: "lit", lights: LIGHT1, extensions: [{ lobe: "KHR_materials_clearcoat", maps: [], bits: {} }] }, (d) => sink.push(d));
    const pending = programDegradationLog.filter((d) => d.code === "extension-lobe-pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.ownerPrd).toBe(4);
    expect(pending[0]!.message).toContain("KHR_materials_clearcoat");
    expect(sink).toEqual(pending);
    expect(out.fragment).not.toContain("a3dPrd04");
    expect(out.defines.A3D_LOBE_CLEARCOAT).toBeUndefined();
  });
});
