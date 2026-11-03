import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import "../../../packages/engine/src/agent-api/compiler/lines";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { DEPTH_COVERAGE_FEATURE, PHOTOMETRIC_PROFILE_FEATURE, normalizeProgramFeatures, type ProgramGraphFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_PARITY_LINES: true });
const coverage = { [DEPTH_COVERAGE_FEATURE]: true } as const;
const lights = { dir: 0, point: 1, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function pbr(overrides: Partial<ProgramGraphFeatures> = {}) {
  const features = normalizeProgramFeatures({
    lighting: "lit", alphaMode: "mask", lights,
    maps: { baseColor: { uvSet: 0, transform: false } },
    features: { ...coverage, [PHOTOMETRIC_PROFILE_FEATURE]: true, "a3d.clipping": true },
    ...overrides
  });
  return generateProgramImpl(features, { flags });
}

function point(coverageEnabled = true) {
  const features = normalizeProgramFeatures({ lighting: "unlit", alphaMode: "mask", vertexColors: true,
    features: { ...(coverageEnabled ? coverage : {}), "a3d.nativePrimitive": "points", "a3d.clipping": true, "prd15.parityPoints": 7 } });
  return generateProgramImpl(features, { flags });
}

describe("generated depth coverage program contract", () => {
  it("keeps ordinary programs single-output and distinguishes program keys", () => {
    const ordinary = pbr({ features: { [PHOTOMETRIC_PROFILE_FEATURE]: true, "a3d.clipping": true } });
    const selected = pbr();
    const original = createGeneratedPbrProgram(ordinary.descriptor!);
    const withCoverage = createGeneratedPbrProgram(selected.descriptor!);
    expect(original.writesDepthCoverage).toBe(false);
    expect(withCoverage.writesDepthCoverage).toBe(true);
    expect(selected.key).not.toBe(ordinary.key);
    expect(original.fragment).not.toContain("@location(1) depthCoverage");
    expect(withCoverage.fragment).toContain("@location(1) depthCoverage: vec4f");
    expect(Object.isFrozen(withCoverage)).toBe(true);
    expect(Reflect.set(withCoverage, "writesDepthCoverage", false)).toBe(false);
  });

  it("retains measured-light resources and writes coverage only after mask and clipping discards", () => {
    const selected = pbr();
    const program = createGeneratedPbrProgram(selected.descriptor!);
    expect(program.photometricProfile).toBe(true);
    expect(program.resources).toContainEqual({ uniform: "u_a3dPhotometricAtlas", textureBinding: 75, dimension: "2d", sampleType: "unfilterable-float" });
    expect(selected.defines.A3D_DEPTH_COVERAGE).toBe(true);
    expect(selected.fragment).toContain("layout(location = 1) out vec4 outCoverage");
    const output = program.fragment.indexOf("return GeneratedDepthCoverageOutput(");
    expect(output).toBeGreaterThan(program.fragment.indexOf("if (base.a < material.controls.x) { discard; }"));
    expect(output).toBeGreaterThan(program.fragment.indexOf("if (!generatedClipRetains(input.worldPosition, input.clipLocal)) { discard; }"));
    expect(program.fragment).toContain("vec4f(1.0, 0.0, 0.0, 0.0)");
    expect(program.fragment).toContain("effectiveColorIntensity.a = a3dPhotometricCandela(");
  });

  it("retains point expansion, mapped/round silhouettes, alpha and clipping before coverage", () => {
    const original = createGeneratedUnlitProgram(point(false).descriptor!);
    const program = createGeneratedUnlitProgram(point().descriptor!);
    expect(program.writesDepthCoverage).toBe(true);
    expect(program.point).toEqual({ attenuated: true, mapped: true, round: true });
    expect(program.vertex).toBe(original.vertex);
    expect(program.requiredVertexLocations).toEqual(original.requiredVertexLocations);
    expect(program.resources).toEqual(original.resources);
    const output = program.fragment.indexOf("return GeneratedDepthCoverageOutput(");
    for (const discard of ["if (input.pointInvalid > 0.0)", "if (!a3dPointInRoundFootprint(input.pointCoord))", "if (base.a < material.alphaControls.x)", "if (!generatedUnlitClipRetains(input.world, input.local))"]) {
      expect(program.fragment.indexOf(discard)).toBeGreaterThan(-1);
      expect(program.fragment.indexOf(discard)).toBeLessThan(output);
    }
    expect(Object.isFrozen(program)).toBe(true);
  });

  it("rejects structural combinations without one linear, opaque depth surface", () => {
    const unsupported: Array<Partial<ProgramGraphFeatures>> = [
      { pass: "depth" }, { alphaMode: "blend" }, { backgroundCoverage: true },
      { features: { ...coverage, "a3d.output.srgb": true } },
      { features: { ...coverage, "a3d.logarithmicDepth": true } },
      { features: { ...coverage, "a3d.transparency": "accumulation" } },
      { features: { ...coverage, "prd03.indirectFraction": "indirectFraction" } },
      { features: { ...coverage, "prd04.transmissionTarget": true } },
      { drawId: "uniform" },
      { extensions: [{ lobe: "transmission", maps: [], bits: {} }] },
      { extensions: [{ lobe: "KHR_materials_volume", maps: [], bits: {} }] },
      { graph: {} as ProgramGraphFeatures["graph"] },
      { features: { [DEPTH_COVERAGE_FEATURE]: false } }
    ];
    for (const change of unsupported) expect(() => pbr(change)).toThrow(/GENERATED_DEPTH_COVERAGE_UNSUPPORTED/);
  });

  it("rejects descriptors whose feature and shader define disagree", () => {
    const descriptor = pbr().descriptor!;
    const missingDefine = { ...descriptor.defines };
    delete missingDefine.A3D_DEPTH_COVERAGE;
    expect(() => createGeneratedPbrProgram({ ...descriptor, defines: missingDefine })).toThrow(/A3D_DEPTH_COVERAGE/);
    expect(() => createGeneratedPbrProgram({ ...descriptor, defines: { ...descriptor.defines, A3D_DEPTH_COVERAGE: 0 } })).toThrow(/depth coverage define/);
    const pointDescriptor = point().descriptor!;
    const pointDefines = { ...pointDescriptor.defines };
    delete pointDefines.A3D_DEPTH_COVERAGE;
    expect(() => createGeneratedUnlitProgram({ ...pointDescriptor, defines: pointDefines })).toThrow(/A3D_DEPTH_COVERAGE/);
  });

  it("refuses unknown contributor hooks instead of trusting their depth semantics", () => {
    const id = "test.depth-coverage.custom-fragment";
    const remove = registerShaderFeature({ id, owner: "prd04", flag: "A3D_QR_CORE", hooks: ["fragment:end"], chunks: [],
      select: () => true, defines: () => ({}) });
    try {
      const options = { features: { ...coverage, [id]: true } };
      expect(() => pbr(options)).toThrow("GENERATED_DEPTH_COVERAGE_CONTRIBUTOR_UNSUPPORTED");
      expect(() => pbr({ ...options, target: "wgsl" })).toThrow("GENERATED_DEPTH_COVERAGE_CONTRIBUTOR_UNSUPPORTED");
    } finally { remove(); }
  });
});

const glslangAvailable = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
const nagaAvailable = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;

describe("offline coverage shader validation", () => {
  it.runIf(glslangAvailable)("links actual GLSL single-output and two-output variants", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-coverage-glsl-"));
    try {
      for (const [index, program] of [pbr({ features: { [PHOTOMETRIC_PROFILE_FEATURE]: true, "a3d.clipping": true } }), pbr()].entries()) {
        const vertex = join(directory, `${index}.vert`), fragment = join(directory, `${index}.frag`);
        writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
        const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(reflection.includes("outCoverage")).toBe(index === 1);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(nagaAvailable)("validates the generated PBR and point WGSL stages", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-coverage-wgsl-"));
    try {
      const programs = [createGeneratedPbrProgram(pbr().descriptor!), createGeneratedUnlitProgram(point().descriptor!)];
      for (const [index, program] of programs.entries()) for (const stage of ["vertex", "fragment"] as const) {
        const file = join(directory, `${index}-${stage}.wgsl`);
        writeFileSync(file, program[stage]);
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
