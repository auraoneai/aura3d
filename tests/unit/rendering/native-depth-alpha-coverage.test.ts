import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { shadowCasterVariantId, type ShadowCasterVariantKey } from "../../../packages/rendering/src/contracts/shadows";
import {
  PRD02_DEPTH_SHADER_NAME, prd02DepthProgram, prd02DepthVariantDefines,
  prd02DepthVariantForVertexFormat, prd02DepthWgsl, registerPrd02DepthShader,
  resolvePrd02ShadowCasterVariant, prd02ShadowCasterEligible
} from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";

const format = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "uv", components: 2, offset: 12 },
  { semantic: "uv1", components: 2, offset: 20 },
  { semantic: "color", components: 4, offset: 28, type: "uint8", normalized: true },
  { semantic: "joints", components: 4, offset: 32, type: "uint8", integer: true },
  { semantic: "weights", components: 4, offset: 36, type: "uint8", normalized: true },
  { semantic: "joints1", components: 4, offset: 40, type: "int8", integer: true },
  { semantic: "weights1", components: 4, offset: 44, type: "uint8", normalized: true }
], 48);

function key(map: 0 | 1 | undefined, vertex: boolean, member: boolean): ShadowCasterVariantKey {
  return {
    skinning: 8, skinningTexture: false, morphTargets: true, instanced: true, batched: member,
    alphaTest: true, alphaHash: false, doubleSided: false,
    features: {
      "a3d.clipping": true, "a3d.logarithmicDepth": true,
      ...(map !== undefined ? { "prd02.depthAlphaMap": map } : {}),
      ...(vertex ? { "prd02.depthAlphaVertex": true } : {}),
      ...(member ? { "prd02.depthAlphaMember": true } : {})
    }
  };
}

describe("standard depth alpha coverage", () => {
  it("keys each map, vertex and member combination and matches forward mask factors in both shader languages", () => {
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const ids = new Set<string>();
    for (const map of [undefined, 0, 1] as const) for (const vertex of [false, true]) for (const member of [false, true]) {
      const selected = prd02DepthVariantForVertexFormat(key(map, vertex, member), format);
      ids.add(shadowCasterVariantId(selected));
      const glsl = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(selected) });
      const wgsl = prd02DepthWgsl(selected);
      const glFragment = glsl.fragment;
      const gpuFragment = wgsl.webgpu.fragment;
      expect(glFragment).toContain("float a3dDepthAlpha = u_baseColor.a;");
      expect(gpuFragment).toContain("var depthAlpha = aura.u_baseColor.a;");
      expect(glFragment).toContain("if (a3dDepthAlpha < u_alphaCutoff) discard;");
      expect(gpuFragment).toContain("if (depthAlpha < aura.u_alphaCutoff) { discard; }");
      expect(glFragment.includes("a3dDepthAlpha *= v_depthColor.a;")).toBe(vertex);
      expect(gpuFragment.includes("depthAlpha *= input.color.a;")).toBe(vertex);
      expect(glFragment.includes("a3dDepthAlpha *= u_a3dPackedLoopColor.a;")).toBe(member);
      expect(gpuFragment.includes("depthAlpha *= aura.u_a3dPackedLoopColor.a;")).toBe(member);
      expect(glFragment.includes("a3dDepthAlpha *= texture(u_baseColorTexture, a3dDepthUv).a;")).toBe(map !== undefined);
      expect(gpuFragment.includes("depthAlpha *= textureSample(u_baseColorTextureTexture")).toBe(map !== undefined);
      if (map !== undefined) {
        expect(glsl.vertex).toContain(`layout(location = ${map === 0 ? 2 : 7}) in vec2 a_${map === 0 ? "uv" : "uv1"};`);
        expect(wgsl.webgpu.vertex).toContain(`@location(${map === 0 ? 2 : 7}) uv: vec2<f32>`);
        expect(glFragment).toContain("v_depthUv * u_baseColorTextureScale");
        expect(glFragment).toContain("a3dUvCos * a3dScaledUv.x - a3dUvSin * a3dScaledUv.y");
        expect(glFragment).toContain("a3dUvSin * a3dScaledUv.x + a3dUvCos * a3dScaledUv.y");
        expect(glFragment).toContain("+ u_baseColorTextureOffset;");
        expect(gpuFragment).toContain("input.uv * aura.u_baseColorTextureScale");
        expect(gpuFragment).toContain("uvCos * scaledUv.x - uvSin * scaledUv.y, uvSin * scaledUv.x + uvCos * scaledUv.y");
        expect(gpuFragment).toContain("+ aura.u_baseColorTextureOffset;");
      } else {
        expect(wgsl.webgpu.vertex).not.toContain("uv: vec2<f32>");
        expect(wgsl.portableBindings.some((binding) => binding.name === "u_baseColorTexture")).toBe(false);
      }
      expect(wgsl.portableBindings).toEqual(expect.arrayContaining([
        { name: "u_baseColor", kind: "vec4" }, { name: "u_alphaCutoff", kind: "float" }
      ]));
      expect(wgsl.portableBindings.some((binding) => binding.name === "u_a3dPackedLoopColor")).toBe(member);
    }
    expect(ids.size).toBe(12);
  });

  it("requires only the inputs used by the chosen mask, and rejects invalid metadata and unsupported hash", () => {
    const position = VertexFormat.P3;
    const noSkin = { ...key(undefined, false, false), skinning: 0 as const, instanced: false };
    expect(() => prd02DepthVariantForVertexFormat(noSkin, position)).not.toThrow();
    expect(() => prd02DepthVariantForVertexFormat({ ...noSkin, features: { "prd02.depthAlphaMap": 0 } }, position)).toThrow(/uv/);
    expect(() => prd02DepthVariantForVertexFormat({ ...noSkin, features: { "prd02.depthAlphaMap": 1 } }, position)).toThrow(/uv1/);
    expect(() => prd02DepthVariantForVertexFormat({ ...noSkin, features: { "prd02.depthAlphaVertex": true } }, position)).toThrow(/color/);
    expect(() => prd02DepthWgsl({ ...noSkin, features: { "prd02.depthAlphaMap": 2 } })).toThrow(/metadata/);
    expect(() => prd02DepthVariantDefines({ ...noSkin, features: { "prd02.depthAlphaVertex": "yes" } })).toThrow(/metadata/);
    const hash = { ...noSkin, alphaTest: false, alphaHash: true };
    expect(() => prd02DepthWgsl(hash)).toThrow(/Alpha-hashed depth/);
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const device = new MockRenderDevice();
    try { expect(() => prd02DepthProgram(device, library, hash)).toThrow(/Alpha-hashed depth/); }
    finally { device.dispose(); }
  });

  it("classifies non-opaque blend modes before guarding unsupported shadow hashing", () => {
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ renderState: { blendMode: "additive", blend: false } });
    try {
      expect(prd02ShadowCasterEligible({ geometry, material })).toBe(false);
      const item = { geometry, material, castShadow: true };
      expect(prd02ShadowCasterEligible(item)).toBe(true);
      const variant = resolvePrd02ShadowCasterVariant(item, {} as never, {} as never);
      expect(variant.alphaHash).toBe(true);
      expect(() => prd02DepthWgsl(variant)).toThrow(/Alpha-hashed depth/);
    } finally { geometry.dispose(); material.dispose(); }
  });

  it.runIf(spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0)("compiles and links every mask permutation with skinning, clipping and log depth", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-alpha-"));
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    try {
      for (const map of [undefined, 0, 1] as const) for (const vertex of [false, true]) for (const member of [false, true]) {
        const selected = prd02DepthVariantForVertexFormat(key(map, vertex, member), format, "webgl2");
        const source = library.compileSource(PRD02_DEPTH_SHADER_NAME, { defines: prd02DepthVariantDefines(selected) });
        const name = `${map ?? "none"}-${+vertex}-${+member}`;
        const vertexFile = join(directory, `${name}.vert`);
        const fragmentFile = join(directory, `${name}.frag`);
        writeFileSync(vertexFile, source.vertex);
        writeFileSync(fragmentFile, source.fragment);
        expect(() => execFileSync("glslangValidator", ["-l", vertexFile, fragmentFile], { encoding: "utf8" })).not.toThrow();
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0)("validates the injected native WGSL mask permutations", async () => {
    const modules: string[] = [];
    const native: WebGPUDeviceLike = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule({ code }) { modules.push(code); return {}; },
      destroy() {}
    };
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const directory = mkdtempSync(join(tmpdir(), "aura-depth-alpha-wgsl-"));
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    try {
      for (const map of [undefined, 0, 1] as const) for (const vertex of [false, true]) for (const member of [false, true]) {
        prd02DepthProgram(device, library, prd02DepthVariantForVertexFormat(key(map, vertex, member), format));
      }
      expect(modules).toHaveLength(24);
      modules.forEach((source, index) => {
        const file = join(directory, `${index}.wgsl`);
        writeFileSync(file, source);
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      });
    } finally { device.dispose(); rmSync(directory, { recursive: true, force: true }); }
  });
});
