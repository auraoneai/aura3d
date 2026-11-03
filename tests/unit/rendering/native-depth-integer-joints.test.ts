import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat, type VertexAttributeDescriptor } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { shadowCasterVariantId, type ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import { resolveNativeVertexLayouts } from "../../../packages/rendering/src/webgpu/NativeRenderState";
import {
  precompilePrd02DepthVariants,
  prd02DepthProgram,
  prd02DepthVariantDefines,
  prd02DepthVariantForVertexFormat,
  prd02DepthWgsl,
  PRD02_DEPTH_SHADER_NAME,
  registerPrd02DepthShader,
  resolvePrd02ShadowCasterVariant
} from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";

type Input = "float" | "uint" | "sint";
const inputs: readonly Input[] = ["float", "uint", "sint"];
const descriptor: Record<Input, Pick<VertexAttributeDescriptor, "type" | "integer">> = {
  float: { type: "float32" },
  uint: { type: "uint16", integer: true },
  sint: { type: "int8", integer: true }
};
const wgslType: Record<Input, string> = { float: "f32", uint: "u32", sint: "i32" };
const glslType: Record<Input, string> = { float: "vec4", uint: "uvec4", sint: "ivec4" };
const gpuFormat: Record<Input, string> = { float: "float32x4", uint: "uint16x4", sint: "sint8x4" };

function formatFor(first: Input, second: Input, extra: readonly VertexAttributeDescriptor[] = []): VertexFormat {
  return new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "uv", components: 2, offset: 12 },
    { semantic: "joints", components: 4, offset: 0, bufferSlot: 1, ...descriptor[first] },
    { semantic: "weights", components: 4, offset: 0, bufferSlot: 2, type: "uint8", normalized: true },
    { semantic: "joints1", components: 4, offset: 0, bufferSlot: 3, ...descriptor[second] },
    { semantic: "weights1", components: 4, offset: 0, bufferSlot: 4, type: "uint8", normalized: true },
    ...extra
  ], 20, [{ slot: 1, stride: 16 }, { slot: 2, stride: 4 }, { slot: 3, stride: 16 }, { slot: 4, stride: 4 }]);
}

function variant(overrides: Partial<ShadowCasterVariantKey> = {}): ShadowCasterVariantKey {
  return {
    skinning: 8, skinningTexture: false, morphTargets: false, instanced: false,
    batched: false, alphaTest: false, alphaHash: false, doubleSided: false,
    features: {}, ...overrides
  };
}

async function mockWebGpu(): Promise<{ device: WebGPUDevice; modules: string[] }> {
  const modules: string[] = [];
  const native: WebGPUDeviceLike = {
    queue: { writeBuffer() {}, submit() {} },
    createBuffer() { return { destroy() {} }; },
    createShaderModule({ code }) { modules.push(code); return {}; },
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
  return { device, modules };
}

describe("typed WebGPU shadow-depth joints", () => {
  it("matches all independent joint types to the actual multi-stream layouts and distinct cache identities", () => {
    const ids = new Set<string>();
    for (const first of inputs) for (const second of inputs) {
      const format = formatFor(first, second);
      const key = prd02DepthVariantForVertexFormat(variant(), format);
      const layouts = resolveNativeVertexLayouts(format);
      const attributes = layouts.flatMap((layout) => layout?.attributes ?? []);
      expect(attributes.find((attribute) => attribute.shaderLocation === 5)?.format).toBe(gpuFormat[first]);
      expect(attributes.find((attribute) => attribute.shaderLocation === 8)?.format).toBe(gpuFormat[second]);
      const source = prd02DepthWgsl(key).webgpu.vertex;
      expect(source).toContain(`@location(5) joints: vec4<${wgslType[first]}>`);
      expect(source).toContain(`@location(8) joints1: vec4<${wgslType[second]}>`);
      expect(source).toContain("fn a3dJointMatrix(rawIndex: u32)");
      expect(source).toContain("let joint = min(rawIndex, u32(max(aura.u_jointCount - 1.0, 0.0)))");
      if (first === "uint") expect(source).toContain("a3dSkin4(joints, weights)");
      if (first === "sint") expect(source).toContain("a3dSkin4(vec4<u32>(max(joints, vec4<i32>(0))), weights)");
      if (first === "float") expect(source).toContain("a3dSkin4(vec4<u32>(clamp(joints,");
      if (second === "uint") expect(source).toContain("a3dSkin4(joints1, weights1)");
      if (second === "sint") expect(source).toContain("a3dSkin4(vec4<u32>(max(joints1, vec4<i32>(0))), weights1)");
      if (second === "float") expect(source).toContain("a3dSkin4(vec4<u32>(clamp(joints1,");
      ids.add(shadowCasterVariantId(key));
    }
    expect(ids.size).toBe(9);
  });

  it("selects every supported integer width and treats normalized joint data as float inputs", () => {
    for (const [type, expected] of [
      ["uint8", "u32"], ["uint16", "u32"], ["uint32", "u32"],
      ["int8", "i32"], ["int16", "i32"], ["int32", "i32"]
    ] as const) {
      const format = new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "joints", components: 4, offset: 12, type, integer: true },
        { semantic: "weights", components: 4, offset: 28 }
      ], 44);
      const key = prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), format);
      const actual = resolveNativeVertexLayouts(format)[0]!.attributes.find((attribute) => attribute.shaderLocation === 5)!;
      expect(actual.format.startsWith(expected === "u32" ? "uint" : "sint")).toBe(true);
      expect(prd02DepthWgsl(key).webgpu.vertex).toContain(`joints: vec4<${expected}>`);
    }
    for (const type of ["uint8", "int16"] as const) {
      const format = new VertexFormat([
        { semantic: "position", components: 3, offset: 0 },
        { semantic: "joints", components: 4, offset: 12, type, normalized: true },
        { semantic: "weights", components: 4, offset: 20 }
      ], 36);
      const key = prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), format);
      expect(prd02DepthWgsl(key).webgpu.vertex).toContain("joints: vec4<f32>");
      expect(key.features["prd02.depthJointInput"]).toBeUndefined();
    }
  });

  it("keeps skinning, clipping, logarithmic depth, alpha testing and instance placement in the typed variant", () => {
    const key = prd02DepthVariantForVertexFormat(variant({
      skinningTexture: true, morphTargets: true, instanced: true, alphaTest: true,
      features: { "a3d.clipping": true, "a3d.logarithmicDepth": true, "prd02.depthInstanceAttr": 1, "prd02.depthAlphaMap": 0 }
    }), formatFor("uint", "sint"));
    const { webgpu, portableBindings } = prd02DepthWgsl(key);
    expect(webgpu.vertex).toContain("@location(10) instance0: vec4<f32>");
    expect(webgpu.vertex).toContain("textureLoad(u_jointPaletteTextureTexture");
    expect(webgpu.vertex).toContain("weightSum += dot(weights1");
    expect(webgpu.vertex).toContain("if (weightSum > 0.0001) { local = skin * local; }");
    expect(webgpu.vertex).toContain("let geometryLocal = aura.u_geometryMatrix * vec4<f32>(local.xyz, 1.0);");
    expect(webgpu.vertex).toContain("placed = instance * geometryLocal;");
    expect(webgpu.vertex).toContain("output.localPosition = geometryLocal.xyz;");
    expect(webgpu.vertex).toContain("output.viewDistance = -(aura.u_a3dLogDepthView * worldPosition).z;");
    expect(webgpu.fragment).toContain("textureSample(u_baseColorTextureTexture");
    expect(webgpu.fragment).toContain("if (!retained) { discard; }");
    expect(webgpu.fragment).toContain("@builtin(frag_depth)");
    expect(portableBindings.map((binding) => binding.name)).toEqual(expect.arrayContaining([
      "u_geometryMatrix", "u_jointPaletteTexture", "u_a3dClipPlanes", "u_a3dLogDepthRange", "u_baseColorTexture", "u_instanceAttributeMode"
    ]));
  });

  it("rejects missing, wrongly typed, misplaced or aliased shader inputs before choosing a program", () => {
    const four = variant({ skinning: 4 });
    const eight = variant();
    expect(() => prd02DepthVariantForVertexFormat(four, VertexFormat.P3)).toThrow(/joints/);
    const primary = (joint: Partial<VertexAttributeDescriptor>, weight: Partial<VertexAttributeDescriptor> = {}) => new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12, ...joint },
      { semantic: "weights", components: 4, offset: 28, ...weight }
    ], 44);
    expect(() => prd02DepthVariantForVertexFormat(four, primary({ shaderLocation: 4 }))).toThrow(/joints/);
    expect(() => prd02DepthVariantForVertexFormat(four, primary({ components: 2 }))).toThrow(/joints/);
    expect(() => prd02DepthVariantForVertexFormat(four, primary({ type: "uint8" }))).toThrow(/joints/);
    expect(() => prd02DepthVariantForVertexFormat(four, primary({}, { type: "uint32", integer: true }))).toThrow(/weights/);
    expect(() => prd02DepthVariantForVertexFormat(eight, primary({}))).toThrow(/joints1/);
    expect(() => prd02DepthVariantForVertexFormat(variant({ alphaTest: true, features: { "prd02.depthAlphaMap": 0 } }), primary({}))).toThrow(/uv/);
    const colliding = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12 },
      { semantic: "weights", components: 4, offset: 28 },
      { semantic: "uv1", components: 2, offset: 44, shaderLocation: 5 }
    ], 52);
    expect(() => prd02DepthVariantForVertexFormat(four, colliding)).toThrow(/unique/);
    const instanceKey = variant({ instanced: true, features: { "prd02.depthInstanceAttr": 1 } });
    const overlap = formatFor("uint", "sint", [{ semantic: "lineStart", components: 3, offset: 0 }]);
    expect(() => prd02DepthVariantForVertexFormat(instanceKey, overlap)).toThrow(/overlap/);
    expect(() => prd02DepthWgsl(variant({ features: { "prd02.depthJointInput": "bad" } }))).toThrow(/joint input type/);
  });

  it("overwrites stale type features when a final geometry or influence count changes", () => {
    const mixed = prd02DepthVariantForVertexFormat(variant(), formatFor("uint", "sint"));
    const floats = prd02DepthVariantForVertexFormat({ ...mixed, skinning: 4 }, formatFor("float", "float"));
    expect(floats.features["prd02.depthJointInput"]).toBeUndefined();
    expect(floats.features["prd02.depthJoint1Input"]).toBeUndefined();
    expect(prd02DepthWgsl(floats).webgpu.vertex).not.toContain("@location(8) joints1");
  });

  it("precompiles distinct typed modules and reuses them for matching resolved geometry", async () => {
    const { device, modules } = await mockWebGpu();
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const geometries: Geometry[] = [];
    try {
      const variants = new Map<string, { key: ShadowCasterVariantKey; features: [] }>();
      for (const first of inputs) for (const second of inputs) {
        const format = formatFor(first, second);
        const streams = format.streams.map((stream) => new VertexBuffer(format, 1, stream.slot));
        const geometry = new Geometry(streams[0]!, null, "triangles", undefined, streams.slice(1));
        geometries.push(geometry);
        const key = resolvePrd02ShadowCasterVariant({
          geometry, skinning: { jointCount: 1, matrices: new Float32Array(16), extraInfluences: true }
        }, {} as never, {} as never);
        const final = prd02DepthVariantForVertexFormat(key, format);
        expect(shadowCasterVariantId(final)).toBe(shadowCasterVariantId(key));
        variants.set(shadowCasterVariantId(key), { key, features: [] });
      }
      await precompilePrd02DepthVariants(device, library, variants);
      expect(modules).toHaveLength(18);
      const compiled = modules.slice();
      for (const { key } of variants.values()) {
        const a = prd02DepthProgram(device, library, key);
        expect(prd02DepthProgram(device, library, key)).toBe(a);
      }
      expect(modules).toEqual(compiled);
      for (const first of inputs) for (const second of inputs) {
        expect(modules.some((code) => code.includes(`joints: vec4<${wgslType[first]}>`) && code.includes(`joints1: vec4<${wgslType[second]}>`))).toBe(true);
      }
    } finally {
      for (const geometry of geometries) geometry.dispose();
      device.dispose();
    }
  });

  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires naga when the source gate requests WGSL validation", () => {
    expect(spawnSync("naga", ["--version"], { stdio: "ignore" }).status, "naga is required to validate native depth WGSL").toBe(0);
  });

  it.runIf(spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0)("passes generated typed modules through the available offline WGSL compiler", async () => {
    const { device, modules } = await mockWebGpu();
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-wgsl-"));
    try {
      for (const first of inputs) for (const second of inputs) {
        const key = prd02DepthVariantForVertexFormat(variant({
          skinningTexture: first === "uint", instanced: true, alphaTest: true,
          features: { "a3d.clipping": true, "a3d.logarithmicDepth": true, "prd02.depthInstanceAttr": 1, "prd02.depthAlphaMap": 0 }
        }), formatFor(first, second));
        prd02DepthProgram(device, library, key);
      }
      modules.forEach((source, index) => {
        const file = join(directory, `${index}.wgsl`);
        writeFileSync(file, source);
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      });
    } finally {
      device.dispose();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("typed WebGL shadow-depth joints", () => {
  it("declares and reflects matching GLSL input types independently for both influence sets", () => {
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const device = new MockRenderDevice();
    try {
      for (const first of inputs) for (const second of inputs) {
        const key = prd02DepthVariantForVertexFormat(variant(), formatFor(first, second), "webgl2");
        const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(key) });
        const program = prd02DepthProgram(device, library, key);
        expect(source.vertex).toContain(`layout(location = 5) in ${glslType[first]} a_joints;`);
        expect(source.vertex).toContain(`layout(location = 8) in ${glslType[second]} a_joints1;`);
        expect(program.reflection.attributeDetails.get("a_joints")?.type).toBe(glslType[first]);
        expect(program.reflection.attributeDetails.get("a_joints1")?.type).toBe(glslType[second]);
        if (first === "uint") expect(source.vertex).toContain("min(a_joints, uvec4(uint(max(u_jointCount - 1.0, 0.0))))");
        if (first === "sint") expect(source.vertex).toContain("clamp(a_joints, ivec4(0), ivec4(int(max(u_jointCount - 1.0, 0.0))))");
        if (second === "uint") expect(source.vertex).toContain("min(a_joints1, uvec4(uint(max(u_jointCount - 1.0, 0.0))))");
        if (second === "sint") expect(source.vertex).toContain("clamp(a_joints1, ivec4(0), ivec4(int(max(u_jointCount - 1.0, 0.0))))");
        if (first === "float" && second === "float") {
          expect(source.vertex).toContain("a3dSkinMatrix8(a_joints, a_weights, a_joints1, a_weights1)");
        } else {
          expect(source.vertex).toContain("a3dSkinMatrix8(a3dDepthJoints, a_weights, a3dDepthJoints1, a_weights1)");
        }
      }
    } finally { device.dispose(); }
  });

  it("uses the WebGL name contract and allows formats that GL converts to floating inputs", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0, type: "int16", normalized: true, shaderLocation: 3 },
      { semantic: "joints", components: 4, offset: 8, type: "uint32" },
      { semantic: "weights", components: 4, offset: 24, type: "uint8" }
    ], 28);
    const key = prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), format, "webgl2");
    expect(key.features["prd02.depthJointInput"]).toBeUndefined();
    expect(() => prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), format, "webgpu")).toThrow(/position/);
    const wrongName = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12, type: "uint8", integer: true, shaderName: "otherJoints" },
      { semantic: "weights", components: 4, offset: 16 }
    ], 32);
    expect(() => prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), wrongName, "webgl2")).toThrow(/joints/);
    const duplicateName = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "joints", components: 4, offset: 12 },
      { semantic: "weights", components: 4, offset: 28 },
      { semantic: "normal", components: 3, offset: 44, shaderName: "a_joints" }
    ], 56);
    expect(() => prd02DepthVariantForVertexFormat(variant({ skinning: 4 }), duplicateName, "webgl2")).toThrow(/unique/);
  });

  it.runIf(spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0)("compiles and links all joint-type pairs with clipping, alpha and logarithmic depth", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-glsl-"));
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    try {
      for (const first of inputs) for (const second of inputs) {
        const key = prd02DepthVariantForVertexFormat(variant({
          instanced: true, alphaTest: true,
          features: { "a3d.clipping": true, "a3d.logarithmicDepth": true, "prd02.depthInstanceAttr": 1, "prd02.depthAlphaMap": 0 }
        }), formatFor(first, second), "webgl2");
        const defines = prd02DepthVariantDefines(key);
        // The normal shadow feature registration sets this for dense instances.
        defines.A3D_DEPTH_INSTANCE_ATTR = 1;
        const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines });
        const vertex = join(directory, `${first}-${second}.vert`);
        const fragment = join(directory, `${first}-${second}.frag`);
        writeFileSync(vertex, source.vertex);
        writeFileSync(fragment, source.fragment);
        expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" })).not.toThrow();
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
