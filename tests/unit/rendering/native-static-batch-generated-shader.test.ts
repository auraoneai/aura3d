import { describe, expect, it } from "vitest";
import type { ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE, type ProgramGraphFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  deriveStaticGeneratedUnlitPairSource, inspectStaticGeneratedUnlitPairProgram,
  recordStaticGeneratedUnlitSources, getRecordedStaticGeneratedUnlitSources,
  STATIC_GENERATED_UNLIT_PAIR_LABEL, STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM
} from "../../../packages/rendering/src/webgl2/StaticGeneratedUnlitShader";

function ordinarySource(overrides: Partial<ProgramGraphFeatures> = {}): ShaderSources {
  const features = normalizeProgramFeatures({
    shadows: { cascades: 0, pcfTaps: 4, localShadows: 0, contact: false },
    specularAntialiasing: true,
    features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true },
    ...overrides
  });
  const generated = generateProgramImpl(features);
  return { label: `a3d-program:${generated.key.slice(0, 40)}`, marker: GENERATED_PROGRAM_MARKER,
    vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! };
}

describe("generated unlit pair shader source", () => {
  it("preserves the chosen fragment and all staged vertex operations except model selection", () => {
    const ordinary = ordinarySource();
    const pair = deriveStaticGeneratedUnlitPairSource(ordinary);
    expect(pair.label).toBe(STATIC_GENERATED_UNLIT_PAIR_LABEL);
    expect(pair.marker).toBe(ordinary.marker);
    expect(pair.fragment).toBe(ordinary.fragment);
    expect(pair.generatedProgram).toBeUndefined();
    expect(pair.vertex).toContain(`uniform mat4 ${STATIC_GENERATED_UNLIT_PAIR_MODEL_UNIFORM}[2];`);
    expect(pair.vertex).toContain("vec4 a3dLocal = u_geometryMatrix * vec4(transformed, 1.0);");
    expect(pair.vertex).toContain("vec4 a3dWorld = u_batchModel[gl_InstanceID] * instanceMatrix * a3dLocal;");
    expect(pair.vertex).toContain("gl_Position = u_viewProjection * a3dWorld;");
    expect(pair.vertex.replace("uniform mat4 u_batchModel[2];", "uniform mat4 u_modelMatrix;")
      .replace(/u_batchModel\[gl_InstanceID\]/g, "u_modelMatrix")).toBe(ordinary.vertex);
  });

  it("declines unsupported generated variants even when their sources are internally consistent", () => {
    const cases: Partial<ProgramGraphFeatures>[] = [
      { alphaMode: "mask" }, { vertexColors: true }, { fog: "linear" },
      { instancing: { color: false } }, { skinning: { influences: 4, palette: "uniform" } },
      { maps: { baseColor: { uvSet: 0, transform: false } } },
      { features: {} }, { features: { [PROGRAM_OUTPUT_SRGB_FEATURE]: true, "a3d.clipping": true } },
      { backgroundCoverage: true }
    ];
    for (const variant of cases) expect(() => deriveStaticGeneratedUnlitPairSource(ordinarySource(variant))).toThrow();
  });

  it("rejects modified source or a contributor claim instead of trusting a marker", () => {
    const ordinary = ordinarySource();
    expect(() => deriveStaticGeneratedUnlitPairSource({ ...ordinary, vertex: `${ordinary.vertex}\n// changed` })).toThrow();
    expect(() => deriveStaticGeneratedUnlitPairSource({ ...ordinary, fragment: `${ordinary.fragment}\n// changed` })).toThrow();
    expect(() => deriveStaticGeneratedUnlitPairSource({ ...ordinary, generatedProgram: {
      ...ordinary.generatedProgram!, activeFeatures: [{ id: "test.hook", value: true }]
    } })).toThrow();
    expect(() => deriveStaticGeneratedUnlitPairSource({ ...ordinary, generatedProgram: undefined })).toThrow();
  });

  it("does not inspect nested descriptors during issuance", () => {
    const ordinary = ordinarySource();
    let nestedReads = 0;
    const watched = new Proxy(ordinary.generatedProgram!, {
      get() { nestedReads += 1; throw new Error("unexpected nested read"); },
      getPrototypeOf() { nestedReads += 1; throw new Error("unexpected nested prototype read"); },
      ownKeys() { nestedReads += 1; throw new Error("unexpected nested key read"); },
      getOwnPropertyDescriptor() { nestedReads += 1; throw new Error("unexpected nested descriptor read"); }
    });
    const candidate = { ...ordinary, generatedProgram: watched };
    expect(() => recordStaticGeneratedUnlitSources(candidate)).not.toThrow();
    const recorded = getRecordedStaticGeneratedUnlitSources(candidate);
    expect(recorded).toBeDefined();
    expect(recorded!.generatedProgram).toBe(watched);
    expect(nestedReads).toBe(0);
  });

  it("revalidates mutated descriptors against the recorded source and never probes an unissued object", () => {
    const ordinary = ordinarySource();
    recordStaticGeneratedUnlitSources(ordinary);
    const recorded = getRecordedStaticGeneratedUnlitSources(ordinary)!;
    expect(recorded).toBeDefined();
    expect(recorded).not.toBe(ordinary);
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(recorded.generatedProgram).toBe(ordinary.generatedProgram);
    const originalVertex = ordinary.vertex;
    (ordinary as { vertex: string }).vertex += "\n// changed after issue";
    recordStaticGeneratedUnlitSources(ordinary);
    expect(getRecordedStaticGeneratedUnlitSources(ordinary)).toBe(recorded);
    expect(recorded.vertex).toBe(originalVertex);
    expect(() => deriveStaticGeneratedUnlitPairSource(recorded)).not.toThrow();
    // This axis is accepted for unlit drawing, but changes generated source.
    // The retained descriptor reference cannot authorize a different program.
    (ordinary.generatedProgram!.features.lights as { hemisphere: boolean }).hemisphere = true;
    expect(() => deriveStaticGeneratedUnlitPairSource(recorded)).toThrow(/source differs/);

    let probes = 0;
    const unissued = new Proxy({}, {
      get() { probes += 1; throw new Error("unexpected property read"); },
      getPrototypeOf() { probes += 1; throw new Error("unexpected prototype read"); },
      ownKeys() { probes += 1; throw new Error("unexpected key read"); }
    });
    expect(getRecordedStaticGeneratedUnlitSources(unissued)).toBeUndefined();
    expect(probes).toBe(0);
    const unsupported = ordinarySource({ fog: "linear" });
    expect(() => recordStaticGeneratedUnlitSources(unsupported)).not.toThrow();
    const unsupportedRecord = getRecordedStaticGeneratedUnlitSources(unsupported);
    expect(unsupportedRecord).toBeDefined();
    expect(() => deriveStaticGeneratedUnlitPairSource(unsupportedRecord!)).toThrow();
  });
});

type FakeUniform = { name: string; type: number; size: number; block: number; offset: number; stride: number; rowMajor?: boolean };
type FakeProgram = { uniforms: FakeUniform[]; attributes: Array<{ name: string; type: number; size: number }>; linked: boolean; binding: number; blockSize: number };

/** Models only the introspection contract, not a GLSL compiler or driver. */
function nativeReflectionFixture() {
  const constants = {
    FLOAT: 0x1406, FLOAT_VEC3: 0x8b51, FLOAT_VEC4: 0x8b52, FLOAT_MAT4: 0x8b5c,
    LINK_STATUS: 0x8b82, ACTIVE_ATTRIBUTES: 0x8b89, ACTIVE_UNIFORMS: 0x8b86, ACTIVE_UNIFORM_BLOCKS: 0x8a36,
    UNIFORM_BLOCK_BINDING: 0x8a3f, UNIFORM_BLOCK_DATA_SIZE: 0x8a40, UNIFORM_BLOCK_INDEX: 0x8a3a,
    UNIFORM_OFFSET: 0x8a3b, UNIFORM_MATRIX_STRIDE: 0x8a3d, UNIFORM_IS_ROW_MAJOR: 0x8a3e, INVALID_INDEX: 0xffffffff
  };
  const scalar = (name: string, type: number, size = 1): FakeUniform => ({ name, type, size, block: -1, offset: -1, stride: 0 });
  const original: FakeProgram = { linked: true, binding: 0, blockSize: 304,
    attributes: [{ name: "a_position", type: constants.FLOAT_VEC3, size: 1 }], uniforms: [
      scalar("u_modelMatrix", constants.FLOAT_MAT4), scalar("u_geometryMatrix", constants.FLOAT_MAT4),
      scalar("u_pointSize", constants.FLOAT), scalar("u_baseColor", constants.FLOAT_VEC4),
      scalar("u_emissiveColor", constants.FLOAT_VEC3), scalar("u_emissiveStrength", constants.FLOAT),
      { name: "u_viewProjection", type: constants.FLOAT_MAT4, size: 1, block: 0, offset: 128, stride: 16 }
    ] };
  const pair: FakeProgram = { ...original, attributes: original.attributes.map((entry) => ({ ...entry })),
    uniforms: original.uniforms.map((entry) => entry.name === "u_modelMatrix"
      ? scalar("u_batchModel[0]", constants.FLOAT_MAT4, 2) : { ...entry }).reverse() };
  let lost = false;
  let secondLocation = true;
  const gl = {
    ...constants,
    isContextLost: () => lost,
    getProgramParameter: (program: FakeProgram, parameter: number) => {
      if (parameter === constants.LINK_STATUS) return program.linked;
      if (parameter === constants.ACTIVE_ATTRIBUTES) return program.attributes.length;
      if (parameter === constants.ACTIVE_UNIFORMS) return program.uniforms.length;
      if (parameter === constants.ACTIVE_UNIFORM_BLOCKS) return 1;
      return 0;
    },
    getActiveAttrib: (program: FakeProgram, index: number) => program.attributes[index] ?? null,
    getAttribLocation: (_program: FakeProgram, name: string) => name === "a_position" ? 0 : -1,
    getUniformBlockIndex: (_program: FakeProgram, name: string) => name === "AuraFrame" ? 0 : constants.INVALID_INDEX,
    getActiveUniformBlockParameter: (program: FakeProgram, _block: number, parameter: number) =>
      parameter === constants.UNIFORM_BLOCK_BINDING ? program.binding : parameter === constants.UNIFORM_BLOCK_DATA_SIZE ? program.blockSize : null,
    getActiveUniform: (program: FakeProgram, index: number) => program.uniforms[index] ?? null,
    getActiveUniforms: (program: FakeProgram, indices: number[], parameter: number) => indices.map((index) => {
      const info = program.uniforms[index]!;
      if (parameter === constants.UNIFORM_BLOCK_INDEX) return info.block;
      if (parameter === constants.UNIFORM_OFFSET) return info.offset;
      if (parameter === constants.UNIFORM_MATRIX_STRIDE) return info.stride;
      if (parameter === constants.UNIFORM_IS_ROW_MAJOR) return info.rowMajor ?? false;
      return 0;
    }),
    getUniformLocation: (program: FakeProgram, name: string) => {
      if (name === "u_batchModel[1]") return secondLocation ? {} : null;
      const info = program.uniforms.find((entry) => entry.name === name);
      return info && info.block === -1 ? {} : null;
    }
  } as unknown as WebGL2RenderingContext;
  const inspect = () => inspectStaticGeneratedUnlitPairProgram(gl, original as unknown as WebGLProgram, pair as unknown as WebGLProgram);
  return { original, pair, inspect, constants, lose: () => { lost = true; }, hideSecond: () => { secondLocation = false; } };
}

describe("generated unlit pair linked interface", () => {
  it("accepts matching interfaces independent of reflection order", () => {
    expect(nativeReflectionFixture().inspect()).toEqual({ compatible: true });
  });

  it("declines an invalid model array, extra active attribute or changed material uniform", () => {
    const array = nativeReflectionFixture();
    array.hideSecond();
    expect(array.inspect()).toEqual({ compatible: false, reason: "uniform-reflection" });
    const attributes = nativeReflectionFixture();
    attributes.pair.attributes.push({ name: "a_color", type: attributes.constants.FLOAT_VEC4, size: 1 });
    expect(attributes.inspect()).toEqual({ compatible: false, reason: "attribute-reflection" });
    const material = nativeReflectionFixture();
    material.pair.uniforms.find((uniform) => uniform.name === "u_emissiveStrength")!.type = material.constants.FLOAT_VEC3;
    expect(material.inspect()).toEqual({ compatible: false, reason: "uniform-reflection" });
  });

  it("declines a different AuraFrame binding, layout or matrix orientation", () => {
    const binding = nativeReflectionFixture();
    binding.pair.binding = 1;
    expect(binding.inspect()).toEqual({ compatible: false, reason: "frame-block" });
    const layout = nativeReflectionFixture();
    layout.pair.uniforms.find((uniform) => uniform.name === "u_viewProjection")!.offset = 64;
    expect(layout.inspect()).toEqual({ compatible: false, reason: "frame-block" });
    const orientation = nativeReflectionFixture();
    orientation.pair.uniforms.find((uniform) => uniform.name === "u_viewProjection")!.rowMajor = true;
    expect(orientation.inspect()).toEqual({ compatible: false, reason: "frame-block" });
  });

  it("declines context loss and unsuccessful linking", () => {
    const lost = nativeReflectionFixture();
    lost.lose();
    expect(lost.inspect()).toEqual({ compatible: false, reason: "context-lost" });
    const failed = nativeReflectionFixture();
    failed.pair.linked = false;
    expect(failed.inspect()).toEqual({ compatible: false, reason: "link-status" });
  });
});
