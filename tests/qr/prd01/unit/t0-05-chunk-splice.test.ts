/**
 * T0-05 / 04-LOBES (PRD-16 §2, lane 01 + lane 04 halves): with `core,materials`
 * the generated program carries the prd04 chunks, spliced pars-at-global /
 * calls-in-main, requires first, once each; `rendererProgramCache` hands the
 * cache `{flags, onDegradation}`; `fragment:indirect` appends to the default
 * body. Structural (text) checks only. The real WebGL2 compile + link is the
 * harness `program-compile` tool (`program-generator-compile.spec.ts`,
 * macos-14).
 */

import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd04";
import { registerShaderChunk, registerShaderFeature, type ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl, programDegradationLog, type ProgramDegradation } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { rendererProgramCache, setRendererProgramDegradationSink } from "../../../../packages/rendering/src/renderer/qrSubFlags";
import { physicalFeatureSet } from "../../../../packages/rendering/src/materials/PhysicalFeatures";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";

const CORE_MATERIALS = resolveQrFlags({ env: { A3D_QR: "core,materials,materials_transmission" } });
const LIGHT1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function gen(partial: Partial<ProgramFeatures>, onDegradation?: (d: ProgramDegradation) => void) {
  return generateProgramImpl(normalizeProgramFeatures(partial), { flags: CORE_MATERIALS, onDegradation });
}

const ext = (lobe: string, bits: Record<string, boolean | number | string> = {}) => ({ lobe, maps: [], bits });

/** Body of `void main() { ... }` (brace-matched). */
function mainBody(src: string): string {
  const start = src.indexOf("void main() {");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}" && --depth === 0) return src.slice(start + "void main() {".length, i);
  }
  throw new Error("unbalanced main()");
}

/** Function definitions / uniform declarations inside main() never compile. */
function assertNoGlobalsInMain(src: string) {
  const body = mainBody(src);
  expect(body).not.toMatch(/^\s*uniform\s/m);
  expect(body).not.toMatch(/^\s*struct\s+\w+\s*\{/m);
  expect(body).not.toMatch(/^\s*(void|float|int|bool|vec[234]|mat[234]|A3DPrd04\w*)\s+\w+\s*\([^;{]*\)\s*\{/m);
}

function countDefinitions(src: string, fn: string): number {
  return (src.match(new RegExp(`\\b\\w+\\s+${fn}\\s*\\(`, "g")) ?? []).filter((m) => !m.startsWith("return")).length;
}

describe("T0-05 (a): rendererProgramCache passes {flags, onDegradation}", () => {
  it("the device cache resolves registered lobes (programs carry the prd04 chunk)", () => {
    const device = new MockRenderDevice();
    const seen: string[] = [];
    setRendererProgramDegradationSink(device, (d) => seen.push(d.code));
    const sources: string[] = [];
    const create = device.createShaderProgram.bind(device);
    device.createShaderProgram = (s) => {
      sources.push(s.fragment);
      return create(s);
    };
    const cache = rendererProgramCache(device, CORE_MATERIALS);
    const handle = cache.acquire(normalizeProgramFeatures({ lighting: "lit", lights: LIGHT1, extensions: [ext("clearcoat")] }));
    expect(handle.status).not.toBe("failed");
    expect(sources.some((s) => s.includes("a3dPrd04ClearcoatInit"))).toBe(true);
    // Late-bound C-36 sink: an unregistered lobe reaches it.
    cache.acquire(normalizeProgramFeatures({ lighting: "lit", lights: LIGHT1, extensions: [ext("KHR_materials_unknown_x")] }));
    expect(seen).toContain("extension-lobe-pending");
    expect(cache.stats().failed).toBe(0);
  });
});

describe("T0-05 (b): prd04 lobes splice pars/call, requires first", () => {
  const lobeCases: [string, Partial<ProgramFeatures>, string[]][] = [
    ["clearcoat", { extensions: [ext("clearcoat"), ext("ior")] }, ["a3dPrd04ClearcoatInit(", "a3dPrd04ComposeClearcoat", "a3dPrd04ClearcoatDirect("]],
    ["sheen", { extensions: [ext("sheen")] }, ["a3dPrd04SheenInit(", "a3dPrd04SheenIndirect("]],
    ["transmission", { extensions: [ext("transmission"), ext("volume")], features: { "prd04.transmissionTarget": true } }, ["a3dGetIBLVolumeRefraction(", "a3dVolumeAttenuation"]],
    ["dispersion", { extensions: [ext("transmission"), ext("dispersion")], features: { "prd04.transmissionTarget": true } }, ["a3dGetIBLVolumeRefractionDispersion("]],
    ["iridescence", { extensions: [ext("iridescence", { film: true })] }, ["a3dPrd04IridescenceInit("]],
    ["anisotropy", { extensions: [ext("anisotropy")], features: { "prd04.tangentFrame": true } }, ["a3dPrd04AnisotropyInit(", "a3dPrd04TangentFrame("]],
    ["glTF-name match", { extensions: [ext("KHR_materials_clearcoat")] }, ["a3dPrd04ClearcoatInit("]]
  ];

  it.each(lobeCases)("%s: chunk present, main() has calls only, helpers defined once", (_name, partial, needles) => {
    programDegradationLog.length = 0;
    const out = gen({ lighting: "lit", lights: LIGHT1, environment: "equirect", ...partial });
    for (const needle of needles) expect(out.fragment).toContain(needle);
    assertNoGlobalsInMain(out.fragment);
    assertNoGlobalsInMain(out.vertex);
    // requires-first: the shared lobe struct precedes every lobe function; once each.
    const structAt = out.fragment.indexOf("struct A3DPrd04Lobes");
    expect(structAt).toBeGreaterThan(-1);
    expect(out.fragment.indexOf("struct A3DPrd04Lobes", structAt + 1)).toBe(-1);
    expect(structAt).toBeLessThan(out.fragment.indexOf("a3dPrd04LobesEnsure"));
    expect(countDefinitions(out.fragment, "a3dPrd04EnvironmentBRDF")).toBe(1);
    expect(countDefinitions(out.fragment, "F_Schlick")).toBe(2); // vec3 + float overloads
    expect(programDegradationLog.filter((d) => d.code === "extension-lobe-pending")).toEqual([]);
  });

  it("lobe ids + truthy bits map to chunk-guard defines", () => {
    const out = gen({ lighting: "lit", lights: LIGHT1, extensions: [ext("iridescence", { film: true, map: false }), ext("transmission")], features: { "prd04.transmissionTarget": true } });
    expect(out.defines.A3D_LOBE_IRIDESCENCE).toBe(true);
    expect(out.defines.A3D_LOBE_IRIDESCENCE_FILM).toBe(true);
    expect(out.defines.A3D_LOBE_IRIDESCENCE_MAP).toBeUndefined();
    expect(out.defines.A3D_TRANSMISSION).toBe(1);
    expect(out.defines.A3D_NUM_DIRECT_LIGHTS).toBe(1);
  });

  it("composition order transmission -> sheen -> clearcoat (r185 meshphysical)", () => {
    const body = mainBody(gen({ lighting: "lit", lights: LIGHT1, extensions: [ext("clearcoat"), ext("sheen"), ext("transmission")], features: { "prd04.transmissionTarget": true } }).fragment);
    const tr = body.indexOf("a3dGetIBLVolumeRefraction(");
    const sh = body.indexOf("a3dPrd04SheenIndirect(");
    const cc = body.indexOf("a3dPrd04ClearcoatIndirect(");
    expect(tr).toBeGreaterThan(-1);
    expect(tr).toBeLessThan(sh);
    expect(sh).toBeLessThan(cc);
  });

  it("unlit and depth programs take no lobe calls", () => {
    expect(gen({ lighting: "unlit", extensions: [ext("clearcoat")] }).fragment).not.toContain("a3dPrd04ClearcoatInit(");
    expect(gen({ pass: "depth", lighting: "unlit", extensions: [ext("clearcoat")] }).fragment).not.toContain("a3dPrd04");
  });

  it("debugView + alpha-to-coverage features splice calls and keep main() clean", () => {
    for (const [features, alphaMode] of [[{ "prd04.debugView": 8 }, "opaque"], [{ "prd04.alphaToCoverage": true }, "mask"]] as const) {
      for (const lighting of ["lit", "unlit"] as const) {
        const out = gen({ lighting, lights: LIGHT1, alphaMode, features });
        assertNoGlobalsInMain(out.fragment);
      }
    }
    const a2c = gen({ lighting: "lit", lights: LIGHT1, alphaMode: "mask", features: { "prd04.alphaToCoverage": true } });
    expect(mainBody(a2c.fragment)).toContain("a3dPrd04AlphaToCoverage( a3dAlpha, u_alphaCutoff );");
    expect(a2c.defines.ALPHA_TO_COVERAGE).toBe(1);
    expect(mainBody(gen({ lighting: "lit", lights: LIGHT1, features: { "prd04.debugView": 8 } }).fragment)).toContain("a3dPrd04DebugView( a3dDbg, a3dLobes )");
  });

  it("tangentFrame: vertex writes the varying at vertex:world, fragment reads it", () => {
    const out = gen({ lighting: "lit", lights: LIGHT1, features: { "prd04.tangentFrame": true } });
    expect(out.vertex).toContain("out vec4 v_prd04Tangent;");
    expect(mainBody(out.vertex)).toContain("v_prd04Tangent = ");
    expect(out.fragment).toContain("in vec4 v_prd04Tangent;");
    assertNoGlobalsInMain(out.vertex);
  });
});

describe("T0-05: generator splice rules", () => {
  it("fragment:indirect appends to the default indirect body", () => {
    registerShaderChunk({ name: "t005_indirect_call", owner: "prd01", stage: "fragment", glsl: "indirectSpecular += vec3(0.0);" });
    const unreg = registerShaderFeature({
      id: "prd01.t005Indirect", owner: "prd01", flag: "A3D_QR_CORE", select: () => true, defines: () => ({}),
      chunks: ["t005_indirect_call"], hooks: ["fragment:indirect"]
    });
    try {
      const body = mainBody(gen({ lighting: "lit", lights: LIGHT1, features: { "prd01.t005Indirect": true } }).fragment);
      const ambient = body.indexOf("a3dAmbientDiffuse(");
      expect(ambient).toBeGreaterThan(-1);
      expect(body.indexOf("indirectSpecular += vec3(0.0);")).toBeGreaterThan(ambient);
    } finally {
      unreg();
    }
  });

  it("missing requires throw SHADER_CHUNK_MISSING (never skipped silently); cycles throw", () => {
    registerShaderChunk({ name: "t005_needs_missing", owner: "prd01", stage: "fragment", glsl: "// x", requires: ["t005_absent"] });
    registerShaderChunk({ name: "t005_cycle_a", owner: "prd01", stage: "fragment", glsl: "// a", requires: ["t005_cycle_b"] });
    registerShaderChunk({ name: "t005_cycle_b", owner: "prd01", stage: "fragment", glsl: "// b", requires: ["t005_cycle_a"] });
    const mk = (id: string, chunk: string) => registerShaderFeature({
      id, owner: "prd01", flag: "A3D_QR_CORE", select: () => true, defines: () => ({}), chunks: [chunk], hooks: ["fragment:pars"]
    });
    const u1 = mk("prd01.t005Missing", "t005_needs_missing");
    const u2 = mk("prd01.t005Cycle", "t005_cycle_a");
    try {
      expect(() => gen({ features: { "prd01.t005Missing": true } })).toThrow(/SHADER_CHUNK_MISSING:t005_absent/);
      expect(() => gen({ features: { "prd01.t005Cycle": true } })).toThrow(/SHADER_CHUNK_CYCLE/);
    } finally {
      u1(); u2();
    }
  });

  it("a declaration chunk a feature also lists at a body hook stays at global scope", () => {
    registerShaderChunk({ name: "t005_both", owner: "prd01", stage: "both", glsl: "vec4 t005Fn() { return vec4(1.0); }" });
    const unreg = registerShaderFeature({
      id: "prd01.t005Both", owner: "prd01", flag: "A3D_QR_CORE", select: () => true, defines: () => ({}),
      chunks: ["t005_both"], hooks: ["vertex:pars", "vertex:world", "fragment:material"]
    });
    try {
      const out = gen({ lighting: "lit", lights: LIGHT1, features: { "prd01.t005Both": true } });
      assertNoGlobalsInMain(out.vertex);
      assertNoGlobalsInMain(out.fragment);
      expect(out.fragment).toContain("vec4 t005Fn()");
    } finally {
      unreg();
    }
  });
});

describe("04-LOBES: PBR descriptors under core,materials", () => {
  it("clearcoat / sheen / transmission records name registered lobes", () => {
    const ctx = { flags: CORE_MATERIALS, tier: QUALITY_TIERS.high };
    const base = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.5, emissiveFactor: [0, 0, 0], emissiveStrength: 1, normalScale: 1, occlusionStrength: 1, ior: 1.5, alphaMode: "opaque", alphaCutoff: 0.5, alphaToCoverage: false, doubleSided: false, unlit: false, textures: {} } as const;
    const ids = (d: object) => physicalFeatureSet({ ...base, ...d } as never, ctx).extensions.map((e) => e.lobe);
    expect(ids({ clearcoat: { factor: 1, roughnessFactor: 0.1, normalScale: 1 } })).toContain("clearcoat");
    expect(ids({ sheen: { colorFactor: [1, 0, 0], roughnessFactor: 0.5 } })).toContain("sheen");
    expect(ids({ transmission: { factor: 1 } })).toContain("transmission");
  });
});
