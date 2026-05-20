import { describe, expect, it } from "vitest";
import {
  Bone,
  Skeleton,
  buildSkinningPalette
} from "../../../packages/animation/src";
import { Ray, Vector3 } from "../../../packages/math/src";
import {
  Geometry,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_PBR_SHADER_NAME,
  DEFAULT_RENDERER_AUTO_FRAME_OPTIONS,
  DEFAULT_RENDERER_DIRECT_LIGHTING,
  DEFAULT_RENDERER_ENVIRONMENT_LIGHTING,
  InstancedPBRMaterial,
  InstancedUnlitMaterial,
  IndexBuffer,
  MaterialInstance,
  MockRenderBuffer,
  MockRenderDevice,
  MorphUnlitMaterial,
  PBRMaterial,
  Renderer,
  Sampler,
  SkinnedUnlitMaterial,
  Texture,
  TextureBinding,
  TexturedPBRMaterial,
  UnlitMaterial,
  VertexBuffer,
  VertexFormat,
  WebGPUDevice,
  computePerspectiveCameraFrame,
  createDepthTextureBinding,
  createDefaultShaderLibrary,
  createRenderDevice,
  pickSceneRenderableHits,
  pickSceneRenderables,
  type WebGPUAdapterLike,
  type WebGPUBufferDescriptorLike,
  type WebGPUBufferLike,
  type WebGPUDeviceLike,
  type WebGPULike,
  type WebGPUSamplerDescriptorLike,
  type UniformValue
} from "../../../packages/rendering/src";
import {
  colorGradePixels,
  fusedLdrPostprocessPixels,
  fxaaPixels,
  toneMapPixels,
  type FusedLdrPostProcessPass
} from "../../../packages/rendering/src/PostProcessPass";
import { DirectionalLight, PointLight, Renderable, Scene, SpotLight, quatFromEuler } from "../../../packages/scene/src";

interface FakeWebGPUBuffer extends WebGPUBufferLike {
  data: Uint8Array;
  usage?: string;
}

describe("Renderer", () => {
  it("renders an empty scene without draw calls", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    const diagnostics = renderer.render([]);

    expect(diagnostics.drawCalls).toBe(0);
    renderer.dispose();
  });

  it("runs renderer-owned postprocess and presents tone-mapped pixels to the backbuffer", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1, clearColor: [1, 0.25, 0, 1] });

    const diagnostics = renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: { exposure: 2, gamma: 1, operator: "reinhard", outputColorSpace: "linear" }
      }
    });

    expect(diagnostics.drawCalls).toBe(0);
    expect(diagnostics.postprocessPasses).toBe(1);
    expect(diagnostics.postprocessPassNames).toEqual(["tone-mapping"]);
    expect(diagnostics.postprocessTargetFormat).toBe("rgba8");
    expect(diagnostics.postprocessRenderTargets).toBe(1);
    expect(diagnostics.postprocessTextures).toBe(1);
    expect(diagnostics.postprocessTargetWidth).toBe(2);
    expect(diagnostics.postprocessTargetHeight).toBe(1);
    expect(Array.from(renderer.device.readPixels(0, 0, 1, 1))).toEqual([170, 85, 0, 255]);
    renderer.dispose();
  });

  it("runs renderer-owned WebGPU postprocess through the same presentation contract", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 2,
      height: 1,
      clearColor: [1, 0.25, 0, 1]
    });

    const diagnostics = renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: { exposure: 2, gamma: 1, operator: "reinhard", outputColorSpace: "linear" }
      }
    });

    expect(diagnostics.drawCalls).toBe(0);
    expect(renderer.device.info.capabilities).toContain("postprocess-presentation");
    expect(renderer.getFeatureReport().supported).toContain("postprocess-ldr");
    expect(Array.from(renderer.device.readPixels(0, 0, 1, 1))).toEqual([170, 85, 0, 255]);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("runs renderer-owned WebGPU postprocess asynchronously through native texture readback", async () => {
    const native = createNativeFakeWebGPU();
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: native.gpu,
      width: 4,
      height: 4,
      clearColor: [1, 0.25, 0, 1]
    });

    const diagnostics = await renderer.renderAsync({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba8",
        bloom: { threshold: 0.1, intensity: 0.2, radius: 1 },
        toneMapping: { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "linear" },
        fxaa: true
      }
    });

    expect(diagnostics.drawCalls).toBe(0);
    expect(diagnostics.postprocessPasses).toBe(3);
    expect(diagnostics.postprocessPassNames).toEqual(["bloom", "tone-mapping", "fxaa"]);
    expect(diagnostics.postprocessTargetFormat).toBe("rgba8");
    expect(diagnostics.postprocessRenderTargets).toBe(3);
    expect(diagnostics.postprocessTextures).toBe(3);
    expect(diagnostics.postprocessTargetWidth).toBe(4);
    expect(diagnostics.postprocessTargetHeight).toBe(4);
    expect(native.device.textureCopies.length).toBeGreaterThanOrEqual(3);
    expect(native.device.textureWrites.length).toBeGreaterThanOrEqual(2);
    expect(native.device.textureWrites.map((write) => write.format)).toEqual(expect.arrayContaining(["rgba8unorm"]));
    expect(renderer.device.info.capabilities).toContain("native-texture-readback");
    expect(Array.from(renderer.device.readPixels(0, 0, 1, 1))).not.toEqual([170, 85, 0, 255]);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("renders high-level WebGPU sources into explicit offscreen render targets for deterministic readback", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 16,
      height: 16,
      clearColor: [0, 0, 0, 1]
    });
    const target = renderer.device.createRenderTarget({ width: 16, height: 16, label: "renderer-explicit-webgpu-target" });

    const diagnostics = renderer.render({
      renderItems: [{
        geometry: Geometry.triangle(),
        material: new UnlitMaterial({ color: [0.9, 0.2, 0.1, 1] }),
        label: "renderer-explicit-target-triangle"
      }],
      renderTarget: target
    });

    expect(diagnostics.drawCalls).toBe(1);
    expect(renderer.device.captureState().get("renderTarget")).toBe("renderer-explicit-webgpu-target");
    expect(Array.from(renderer.device.readPixels(8, 8, 1, 1))).toEqual([230, 51, 26, 255]);
    target.dispose();
    renderer.dispose();
  });

  it("requires tone mapping before renderer-owned HDR postprocess presentation", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 2,
      height: 1,
      clearColor: [2.5, 0.5, 0.125, 1]
    });

    expect(() => renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba16f",
        toneMapping: false,
        bloom: true
      }
    })).toThrow(/HDR_POSTPROCESS_TONEMAPPING_REQUIRED|tone mapping/);
    renderer.dispose();
  });

  it("chains renderer-owned color grading, aberration, film grain, outline, and FXAA passes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 3, clearColor: [0.65, 0.35, 0.1, 1] });

    renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: false,
        colorGrade: { contrast: 1.2, saturation: 0.7, temperature: 0.15, tint: -0.08, vibrance: 0.2 },
        chromaticAberration: { strength: 0.8 },
        filmGrain: { intensity: 0.12, seed: 7, monochrome: true },
        outline: { threshold: 0.05, opacity: 0.35, color: [0.2, 0.7, 1, 1] },
        fxaa: { edgeThreshold: 0.05, subpixelBlend: 0.5 }
      }
    });

    const output = Array.from(renderer.device.readPixels(1, 1, 1, 1));
    expect(output).not.toEqual([166, 89, 26, 255]);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("defaults LDR-only postprocess to rgba8 on HDR-capable renderers", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 2,
      height: 1,
      clearColor: [0.6, 0.3, 0.1, 1]
    });

    renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: false,
        fxaa: { edgeThreshold: 0.05, subpixelBlend: 0.5 }
      }
    });

    const output = Array.from(renderer.device.readPixels(0, 0, 1, 1));
    expect(output[3]).toBe(255);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("keeps renderer-owned LDR fusion diagnostics tied to the authored pass stack", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 2, clearColor: [0.58, 0.32, 0.14, 1] });

    const diagnostics = renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba8",
        toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
        colorGrade: { contrast: 1.18, saturation: 1.12, temperature: -0.02, vignette: 0.28, sharpening: 0.04 },
        fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 }
      }
    });

    expect(diagnostics.postprocessPasses).toBe(3);
    expect(diagnostics.postprocessPassNames).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(diagnostics.postprocessTargetFormat).toBe("rgba8");
    expect(diagnostics.postprocessRenderTargets).toBe(1);
    expect(diagnostics.postprocessTextures).toBe(1);
    expect(diagnostics.postprocessTargetWidth).toBe(3);
    expect(diagnostics.postprocessTargetHeight).toBe(2);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("uses a device-native LDR postprocess presentation path without collapsing pass diagnostics", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 2, clearColor: [0.58, 0.32, 0.14, 1] });
    const calls: { readonly passNames: readonly string[]; readonly sourceLabel: string }[] = [];
    renderer.device.presentLdrPostprocess = (source, options) => {
      calls.push({ passNames: options.passes.map((pass) => pass.name), sourceLabel: source.label });
      renderer.device.presentRenderTarget?.(source);
    };

    const diagnostics = renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba8",
        toneMapping: { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" },
        colorGrade: { contrast: 1.18, saturation: 1.12, temperature: -0.02, vignette: 0.28, sharpening: 0.04 },
        fxaa: { edgeThreshold: 0.08, subpixelBlend: 0.55 }
      }
    });

    expect(calls).toEqual([{ passNames: ["tone-mapping", "color-grade", "fxaa"], sourceLabel: "renderer-forward-color" }]);
    expect(diagnostics.postprocessPasses).toBe(3);
    expect(diagnostics.postprocessPassNames).toEqual(["tone-mapping", "color-grade", "fxaa"]);
    expect(diagnostics.postprocessTargetFormat).toBe("rgba8");
    expect(diagnostics.postprocessRenderTargets).toBe(1);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("matches the sequential helper output for fused LDR tone, grade, sharpen, and FXAA", () => {
    const width = 5;
    const height = 4;
    const source = new Uint8Array(width * height * 4);
    for (let index = 0; index < source.length; index += 4) {
      const pixel = index / 4;
      source[index] = (pixel * 41 + 17) % 256;
      source[index + 1] = (pixel * 67 + 29) % 256;
      source[index + 2] = (pixel * 97 + 53) % 256;
      source[index + 3] = 255;
    }
    const toneMapping = { exposure: 1.08, whitePoint: 1.34, gamma: 2.2, operator: "filmic" as const };
    const colorGrade = { contrast: 1.18, saturation: 1.12, temperature: -0.02, vignette: 0.28, sharpening: 0.04 };
    const fxaa = { edgeThreshold: 0.08, subpixelBlend: 0.55 };
    const passes: readonly FusedLdrPostProcessPass[] = [
      { name: "tone-mapping", options: toneMapping },
      { name: "color-grade", options: colorGrade },
      { name: "fxaa", options: fxaa }
    ];

    const sequential = fxaaPixels(
      colorGradePixels(
        toneMapPixels(source, width, height, { outputColorSpace: "srgb", ...toneMapping }).pixels,
        width,
        height,
        colorGrade
      ).pixels,
      width,
      height,
      fxaa
    ).pixels;
    const fused = fusedLdrPostprocessPixels(new Uint8Array(source), width, height, passes, {
      mutateInput: true,
      scratch: {},
      toneMappingDefaults: { outputColorSpace: "srgb" }
    });

    expect(Array.from(fused)).toEqual(Array.from(sequential));
  });

  it("runs renderer-owned HDR tone mapping before byte-space grading passes", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 2,
      height: 1,
      clearColor: [2.5, 0.5, 0.125, 1]
    });

    renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba16f",
        toneMapping: { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "linear" },
        colorGrade: { contrast: 1.05, saturation: 1.1 },
        filmGrain: { intensity: 0.04, seed: 11, monochrome: true }
      }
    });

    const output = Array.from(renderer.device.readPixels(0, 0, 1, 1));
    expect(output[0]).toBeGreaterThan(output[1] ?? 0);
    expect(output[1]).toBeGreaterThan(output[2] ?? 0);
    expect(output[3]).toBe(255);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("runs renderer-owned HDR bloom in float space before tone mapping", async () => {
    const renderer = await Renderer.create({
      backend: "webgpu",
      webgpu: createFakeWebGPU(),
      width: 1,
      height: 1,
      clearColor: [4, 0, 0, 1]
    });

    renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba16f",
        bloom: { threshold: 0.75, intensity: 0.5, radius: 0 },
        toneMapping: { exposure: 1, gamma: 1, operator: "reinhard", outputColorSpace: "linear" }
      }
    });

    const output = Array.from(renderer.device.readPixels(0, 0, 1, 1));
    expect(output).toEqual([219, 0, 0, 255]);
    expect(output[0]).toBeLessThan(240);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("chains renderer-owned depth, velocity, reflection, and history postprocess passes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 3, clearColor: [0.25, 0.45, 0.75, 1] });
    const depth = createDepthTextureBinding({
      label: "renderer-advanced-depth",
      width: 3,
      height: 3,
      data: new Float32Array([
        0.2, 0.28, 0.36,
        0.42, 0.5, 0.58,
        0.68, 0.78, 0.9
      ])
    });
    const velocity = new Float32Array([
      0, 0,
      1, 0,
      0, 0,
      0, 1,
      1, 1,
      0, 1,
      0, 0,
      1, 0,
      0, 0
    ]);
    const history = new Uint8Array(3 * 3 * 4);

    renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: false,
        depthOfField: { depth, focusDepth: 0.5, focusRange: 0.12, maxRadius: 1 },
        motionBlur: { velocity, samples: 3, scale: 1 },
        contactShadow: { depth, radius: 1, intensity: 0.7, thickness: 0.3, direction: [0, 1] },
        ssao: { depth, radius: 1, intensity: 0.6, bias: 0.01 },
        ssr: { depth, intensity: 0.4, maxDistance: 2 },
        taa: { history, blend: 0.45 }
      }
    });

    const output = Array.from(renderer.device.readPixels(1, 1, 1, 1));
    expect(output).not.toEqual([64, 115, 191, 255]);
    expect(output[3]).toBe(255);
    expect(renderer.device.captureState().get("renderTarget") ?? null).toBeNull();
    renderer.dispose();
  });

  it("requests a sampleable forward depth texture for depth-aware renderer-owned postprocess", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 3, clearColor: [0.25, 0.45, 0.75, 1] });

    renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: false,
        contactShadow: { radius: 1, intensity: 0.7, thickness: 0.3 },
        depthOfField: { focusDepth: 0.5, focusRange: 0.12, maxRadius: 1 }
      }
    });

    const ownedTargets = [...((renderer.device as unknown as { readonly renderTargets: Set<{ readonly label: string; readonly depthTexture?: Texture }> }).renderTargets)];
    const forwardTarget = ownedTargets.find((target) => target.label === "renderer-forward-color");
    expect(forwardTarget?.depthTexture).toMatchObject({
      width: 3,
      height: 3,
      format: "depth24",
      label: "renderer-forward-color-depth"
    });
    renderer.dispose();
  });

  it("allows caller-provided depth postprocess bindings without requiring backend depth readback", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 3, height: 3, clearColor: [0.25, 0.45, 0.75, 1] });
    (renderer.device.info as { capabilities?: string[] }).capabilities = (renderer.device.info.capabilities ?? []).filter((capability) => capability !== "depth-textures");
    const depth = createDepthTextureBinding({
      label: "synthetic-depth-binding",
      width: 3,
      height: 3,
      data: new Float32Array([
        0.2, 0.28, 0.36,
        0.42, 0.5, 0.58,
        0.68, 0.78, 0.9
      ])
    });

    renderer.render({
      renderItems: [],
      postprocess: {
        toneMapping: false,
        depthOfField: { depth, focusDepth: 0.5, focusRange: 0.12, maxRadius: 1 },
        contactShadow: { depth, radius: 1, intensity: 0.7, thickness: 0.3 },
        ssao: { depth, radius: 1, intensity: 0.6, bias: 0.01 }
      }
    });

    const ownedTargets = [...((renderer.device as unknown as { readonly renderTargets: Set<{ readonly label: string; readonly depthTexture?: Texture }> }).renderTargets)];
    const forwardTarget = ownedTargets.find((target) => target.label === "renderer-forward-color");
    expect(forwardTarget?.depthTexture).toBeUndefined();
    renderer.dispose();
  });

  it("renders PBR forward output as linear input when renderer-owned postprocess is enabled", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "linear-postprocess-pbr" }),
        modelMatrix: translationMatrix(0, 0, -2),
        label: "linear-postprocess-pbr"
      }],
      postprocess: {
        toneMapping: { exposure: 1, operator: "reinhard" }
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_outputColorSpace")).toBe(0);
    renderer.dispose();
  });

  it("renders PBR forward output directly to display sRGB when postprocess is disabled", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.render([{
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "display-pbr" }),
      modelMatrix: translationMatrix(0, 0, -2),
      label: "display-pbr"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_outputColorSpace")).toBe(1);
    expect(command?.uniforms?.get("u_environmentFogEnabled")).toBe(0);
    renderer.dispose();
  });

  it("binds renderer-level environment fog uniforms to direct PBR render sources", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "fogged-pbr" }),
        modelMatrix: translationMatrix(0, 0, -4),
        label: "fogged-pbr"
      }],
      environmentFog: {
        mode: "exponential-squared",
        color: [0.18, 0.24, 0.36],
        near: 2,
        far: 36,
        density: 0.08,
        heightFalloff: 0.2,
        heightReference: -1,
        maxOpacity: 0.74
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.shader?.reflection.uniforms.has("u_environmentFogEnabled")).toBe(true);
    expect(command?.uniforms?.get("u_environmentFogEnabled")).toBe(1);
    expect(command?.uniforms?.get("u_environmentFogMode")).toBe(3);
    expect(command?.uniforms?.get("u_environmentFogColor")).toEqual([0.18, 0.24, 0.36]);
    expect(command?.uniforms?.get("u_environmentFogNear")).toBe(2);
    expect(command?.uniforms?.get("u_environmentFogFar")).toBe(36);
    expect(command?.uniforms?.get("u_environmentFogDensity")).toBe(0.08);
    expect(command?.uniforms?.get("u_environmentFogHeightFalloff")).toBe(0.2);
    expect(command?.uniforms?.get("u_environmentFogHeightReference")).toBe(-1);
    expect(command?.uniforms?.get("u_environmentFogMaxOpacity")).toBe(0.74);
    renderer.dispose();
  });

  it("draws a renderer-owned equirect environment background before forward items", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const texture = createRgbaTexture(4, 2, [40, 80, 160, 255]);

    renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "background-pbr" }),
        modelMatrix: translationMatrix(0, 0, -4),
        label: "background-pbr"
      }],
      environmentBackground: {
        projection: "equirect",
        texture: new TextureBinding({ name: "test-equirect-background", texture, required: true }),
        rotation: 0.125,
        intensity: 0.72,
        encoding: "srgb"
      }
    });

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(commands.map((command) => command.label)).toEqual(["environment-background", "background-pbr"]);
    expect(commands[0]?.uniforms?.get("u_environmentBackgroundProjection")).toBe(1);
    expect(commands[0]?.uniforms?.get("u_environmentBackgroundTexture")).toBeInstanceOf(TextureBinding);
    expect(commands[0]?.uniforms?.get("u_environmentBackgroundRotation")).toBe(0.125);
    expect(commands[0]?.uniforms?.get("u_environmentBackgroundIntensity")).toBe(0.72);
    expect(commands[0]?.uniforms?.get("u_outputColorSpace")).toBe(1);
    texture.dispose();
    renderer.dispose();
  });

  it("draws a renderer-owned cubemap environment background with cube texture uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const texture = createRgbaCubeTexture(2);

    renderer.render({
      renderItems: [],
      environmentBackground: {
        projection: "cubemap",
        texture: new TextureBinding({ name: "test-cubemap-background", texture, required: true }),
        outputColorSpace: "linear",
        encoding: "rgbe"
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.label).toBe("environment-background");
    expect(command?.uniforms?.get("u_environmentBackgroundProjection")).toBe(2);
    expect(command?.uniforms?.get("u_environmentBackgroundCubeTexture")).toBeInstanceOf(TextureBinding);
    expect(command?.uniforms?.get("u_environmentBackgroundEncoding")).toBe(2);
    expect(command?.uniforms?.get("u_outputColorSpace")).toBe(0);
    texture.dispose();
    renderer.dispose();
  });

  it("uploads a deterministic alpha cutoff default for shaders that declare alpha discard", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.render([
      {
        geometry: Geometry.litTriangle(),
        material: new PBRMaterial({ name: "alpha-default-pbr" }),
        label: "alpha-default-pbr"
      },
      {
        geometry: Geometry.triangle(),
        material: new UnlitMaterial({ name: "alpha-default-unlit" }),
        label: "alpha-default-unlit"
      }
    ]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(commands[0]?.uniforms?.get("u_alphaCutoff")).toBe(0);
    expect(commands[1]?.uniforms?.get("u_alphaCutoff")).toBe(0);
    renderer.dispose();
  });

  it("blocks renderer HDR postprocess on backends without HDR render-target support", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1 });

    expect(() => renderer.render({
      renderItems: [],
      postprocess: {
        targetFormat: "rgba16f",
        toneMapping: { operator: "reinhard" }
      }
    })).toThrow(/HDR_POSTPROCESS_UNSUPPORTED|HDR postprocess/);
    renderer.dispose();
  });

  it("draws a triangle through the forward pass", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    const diagnostics = renderer.render([{ geometry: Geometry.triangle(), label: "triangle" }]);

    expect(diagnostics.drawCalls).toBe(1);
    renderer.dispose();
  });

  it("submits line segment geometry through the renderer line topology path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.lineSegments([
      [-0.8, 0, 0],
      [0.8, 0, 0]
    ]);

    const diagnostics = renderer.render([{
      geometry,
      material: new UnlitMaterial({ color: [1, 0.2, 0.05, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "line-segment"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.topology).toBe("lines");
    expect(command?.vertexCount).toBe(2);
    expect(command?.indexBuffer).toBeUndefined();
    expect(command?.renderState?.cullMode).toBe("none");
    renderer.dispose();
  });

  it("renders opaque items before blended items and sorts blended items back-to-front", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();
    const transparent = (name: string) => new UnlitMaterial({
      name,
      color: [1, 1, 1, 0.45],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    });

    const diagnostics = renderer.render({
      cameraPosition: [0, 0, 5],
      renderItems: [
        { geometry, material: transparent("near-transparent"), modelMatrix: translationMatrix(0, 0, 4), label: "near-transparent" },
        { geometry, material: new UnlitMaterial({ name: "opaque", color: [0.2, 0.4, 0.8, 1] }), modelMatrix: translationMatrix(0, 0, 0), label: "opaque" },
        { geometry, material: transparent("far-transparent"), modelMatrix: translationMatrix(0, 0, -5), label: "far-transparent" }
      ]
    });

    expect(diagnostics.drawCalls).toBe(3);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual([
      "opaque",
      "far-transparent",
      "near-transparent"
    ]);
    renderer.dispose();
  });

  it("can build and bind a renderer-owned shadow map before the forward pass", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const light = new DirectionalLight("renderer-owned-shadow-light");
    light.castsShadow = true;

    const diagnostics = renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "shadowed-pbr" }),
        modelMatrix: translationMatrix(0, 0, -2),
        label: "shadowed-cube"
      }],
      collectedLights: [{
        kind: "directional",
        color: [1, 1, 1],
        intensity: 1,
        position: [0, 4, 4],
        direction: [0, -1, -1],
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: true,
        layerMask: 0xffffffff,
        source: light
      }],
      shadow: {
        size: 64,
        lightMatrix: translationMatrix(0, 0, 0),
        strength: 0.7,
        bias: 0.002
      }
    });

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    const forwardUniforms = commands[1]?.uniforms;
    expect(diagnostics.drawCalls).toBe(2);
    expect(commands.map((command) => command.label)).toEqual(["shadowed-cube", "shadowed-cube"]);
    expect(forwardUniforms?.get("u_shadowMapEnabled")).toBe(1);
    expect(forwardUniforms?.get("u_shadowMapStrength")).toBe(0.7);
    expect(forwardUniforms?.get("u_shadowMapBias")).toBe(0.002);
    expect(forwardUniforms?.get("u_shadowMapTexture")).toBeInstanceOf(TextureBinding);
    renderer.dispose();
  });

  it("resets forward shadow uniforms when a later frame renders without a shadow map", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const light = new DirectionalLight("stale-shadow-light");
    light.castsShadow = true;
    const item = {
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "stale-shadow-pbr" }),
      modelMatrix: translationMatrix(0, 0, -2),
      label: "stale-shadow-cube"
    };

    renderer.render({
      renderItems: [item],
      collectedLights: [{
        kind: "directional",
        color: [1, 1, 1],
        intensity: 1,
        position: [0, 4, 4],
        direction: [0, -1, -1],
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: true,
        layerMask: 0xffffffff,
        source: light
      }],
      shadow: { size: 64, lightMatrix: translationMatrix(0, 0, 0), strength: 0.7 }
    });

    renderer.render([item]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_shadowMapEnabled")).toBe(0);
    expect(command?.uniforms?.get("u_shadowMapTexture")).toBeInstanceOf(TextureBinding);
    expect(command?.uniforms?.get("u_shadowMapStrength")).toBe(0);
    renderer.dispose();
  });

  it("fails loudly when renderer-owned shadows are requested without a shadow-casting light", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });

    try {
      expect(() => renderer.render({
        renderItems: [{
          geometry: Geometry.litCube(1),
          material: new PBRMaterial({ name: "missing-shadow-light-pbr" }),
          label: "missing-shadow-light-cube"
        }],
        shadow: true
      })).toThrow(/SHADOW_LIGHT_REQUIRED|shadow-casting light/);
    } finally {
      renderer.dispose();
    }
  });

  it("renders renderer-owned point shadow maps through a six-face atlas forward path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const point = new PointLight("supported-point-shadow");
    point.castsShadow = true;
    point.range = 9;
    point.transform.setPosition(1, 2, 3);

    try {
      renderer.render({
        renderItems: [{
          geometry: Geometry.litCube(1),
          material: new PBRMaterial({ name: "supported-point-shadow-pbr" }),
          modelMatrix: translationMatrix(0, 0, -2),
          label: "supported-point-shadow-cube"
        }],
        collectedLights: [{
          kind: "point",
          color: [1, 0.95, 0.82],
          intensity: 3,
          position: [1, 2, 3],
          direction: [0, -1, 0],
          range: point.range,
          spotAngle: 0,
          penumbra: 0,
          castsShadow: true,
          layerMask: 0xffffffff,
          source: point
        }],
        shadow: { light: point, size: 32, strength: 0.72, bias: 0.003 }
      });

      const commands = (renderer.device as MockRenderDevice).drawCommands;
      const forwardUniforms = commands[6]?.uniforms;
      const lightData = forwardUniforms?.get("u_lightData") as Float32Array;
      const faceMatrices = forwardUniforms?.get("u_pointShadowFaceMatrices") as Float32Array;
      const faceRects = forwardUniforms?.get("u_pointShadowFaceRects") as Float32Array;
      expect(commands.map((command) => command.label)).toEqual([
        "supported-point-shadow-cube",
        "supported-point-shadow-cube",
        "supported-point-shadow-cube",
        "supported-point-shadow-cube",
        "supported-point-shadow-cube",
        "supported-point-shadow-cube",
        "supported-point-shadow-cube"
      ]);
      expect(forwardUniforms?.get("u_pointShadowMapEnabled")).toBe(1);
      expect(forwardUniforms?.get("u_pointShadowStrength")).toBe(0.72);
      expect(forwardUniforms?.get("u_pointShadowBias")).toBe(0.003);
      expect(forwardUniforms?.get("u_pointShadowMapTexture")).toBeInstanceOf(TextureBinding);
      expect(Array.from(forwardUniforms?.get("u_pointShadowLightPosition") as readonly number[])).toEqual([1, 2, 3]);
      expect(faceMatrices).toHaveLength(96);
      expect(faceRects).toHaveLength(24);
      expect(lightData[14]).toBe(1);
    } finally {
      renderer.dispose();
    }
  });

  it("renders renderer-owned spot shadow maps through the projected forward shadow path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const spot = new SpotLight("supported-spot-shadow");
    spot.castsShadow = true;
    spot.range = 12;
    spot.angle = Math.PI / 5;
    spot.transform.setPosition(0, 2, 4);

    renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "supported-spot-shadow-pbr" }),
        modelMatrix: translationMatrix(0, 0, -2),
        label: "supported-spot-shadow-cube"
      }],
      collectedLights: [{
        kind: "spot",
        color: [1, 0.95, 0.82],
        intensity: 2,
        position: [0, 2, 4],
        direction: [0, -0.35, -1],
        range: spot.range,
        spotAngle: spot.angle,
        penumbra: spot.penumbra,
        castsShadow: true,
        layerMask: 0xffffffff,
        source: spot
      }],
      shadow: {
        light: spot,
        size: 64,
        strength: 0.65,
        bias: 0.002
      }
    });

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    const forwardUniforms = commands[1]?.uniforms;
    const lightData = forwardUniforms?.get("u_lightData") as Float32Array;
    const forwardShadowMatrix = Array.from(forwardUniforms?.get("u_shadowMapMatrix") as Float32Array);
    expect(commands.map((command) => command.label)).toEqual(["supported-spot-shadow-cube", "supported-spot-shadow-cube"]);
    expect(forwardUniforms?.get("u_shadowMapEnabled")).toBe(1);
    expect(lightData[14]).toBe(1);
    expect(forwardShadowMatrix).toHaveLength(16);
    expect(forwardShadowMatrix).not.toEqual(Array.from(translationMatrix(0, 0, 0)));
    renderer.dispose();
  });

  it("derives a non-identity renderer-owned shadow matrix from caster bounds and light direction", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    const light = new DirectionalLight("derived-shadow-light");
    light.castsShadow = true;

    renderer.render({
      renderItems: [{
        geometry: Geometry.litCube(1),
        material: new PBRMaterial({ name: "derived-shadow-pbr" }),
        modelMatrix: translationMatrix(2, 1, -3),
        label: "derived-shadow-cube"
      }],
      collectedLights: [{
        kind: "directional",
        color: [1, 1, 1],
        intensity: 1,
        position: [0, 6, 6],
        direction: [0.35, -0.8, -0.48],
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: true,
        layerMask: 0xffffffff,
        source: light
      }],
      shadow: {
        size: 64,
        strength: 0.7,
        bias: 0.002
      }
    });

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    const depthMatrix = Array.from(commands[0]?.uniforms?.get("u_modelViewProjection") as Float32Array);
    const forwardShadowMatrix = Array.from(commands[1]?.uniforms?.get("u_shadowMapMatrix") as Float32Array);
    expect(commands.map((command) => command.label)).toEqual(["derived-shadow-cube", "derived-shadow-cube"]);
    expect(forwardShadowMatrix).toHaveLength(16);
    expect(depthMatrix).toHaveLength(16);
    expect(forwardShadowMatrix).not.toEqual(Array.from(translationMatrix(0, 0, 0)));
    expect(depthMatrix).not.toEqual(Array.from(translationMatrix(2, 1, -3)));
    expect(forwardShadowMatrix.slice(0, 12).some((value, index) => Math.abs(value - (translationMatrix(0, 0, 0)[index] ?? 0)) > 0.001)).toBe(true);
    renderer.dispose();
  });

  it("rejects lit materials on line-only geometry with a clear render-item contract error", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.lineSegments([
      [-0.8, 0, 0],
      [0.8, 0, 0]
    ]);

    try {
      expect(() => renderer.render([{
        geometry,
        material: new PBRMaterial({ name: "line-pbr-misuse" }),
        label: "bad-lit-line"
      }])).toThrow(/RENDER_ITEM_GEOMETRY_MATERIAL_CONTRACT|missing attributes required by its material/);
    } finally {
      renderer.dispose();
    }
  });

  it("submits point geometry through the renderer point topology path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.points([
      [-0.5, 0, 0],
      [0.5, 0, 0]
    ]);

    const diagnostics = renderer.render([{
      geometry,
      material: new UnlitMaterial({ color: [0.1, 0.8, 1, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
      label: "point-cloud"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.topology).toBe("points");
    expect(command?.vertexCount).toBe(2);
    expect(command?.indexBuffer).toBeUndefined();
    expect(command?.renderState?.cullMode).toBe("none");
    renderer.dispose();
  });

  it("applies resized frame dimensions to the next render viewport", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.resize(16, 12);
    renderer.render([{ geometry: Geometry.triangle(), label: "resized-triangle" }]);

    expect(renderer.device.captureState().get("viewportWidth")).toBe(16);
    expect(renderer.device.captureState().get("viewportHeight")).toBe(12);
    renderer.dispose();
  });

  it("resizes canvas backing buffers from CSS display size and DPR", async () => {
    const canvas = {
      width: 1,
      height: 1,
      getBoundingClientRect: () => ({ width: 123.4, height: 56.2 })
    } as HTMLCanvasElement;
    const renderer = await Renderer.create({ backend: "mock", canvas, width: 1, height: 1 });

    const first = renderer.resizeToDisplay({ devicePixelRatio: 2 });
    const second = renderer.resizeToDisplay({ devicePixelRatio: 2 });

    expect(first).toEqual({
      resized: true,
      cssWidth: 123.4,
      cssHeight: 56.2,
      devicePixelRatio: 2,
      width: 247,
      height: 112
    });
    expect(second.resized).toBe(false);
    expect(canvas.width).toBe(247);
    expect(canvas.height).toBe(112);
    renderer.render([{ geometry: Geometry.triangle(), label: "dpr-triangle" }]);
    expect(renderer.device.captureState().get("viewportWidth")).toBe(247);
    expect(renderer.device.captureState().get("viewportHeight")).toBe(112);
    renderer.dispose();
  });

  it("infers initial canvas backing size from CSS display size and DPR", async () => {
    const previousDpr = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
    Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 2 });
    const canvas = {
      width: 1,
      height: 1,
      getBoundingClientRect: () => ({ width: 140.2, height: 80.4 })
    } as HTMLCanvasElement;

    try {
      const renderer = await Renderer.create({ backend: "mock", canvas });
      renderer.render([{ geometry: Geometry.triangle(), label: "initial-dpr-triangle" }]);

      expect(canvas.width).toBe(280);
      expect(canvas.height).toBe(161);
      expect(renderer.device.captureState().get("viewportWidth")).toBe(280);
      expect(renderer.device.captureState().get("viewportHeight")).toBe(161);
      renderer.dispose();
    } finally {
      if (previousDpr) {
        Object.defineProperty(globalThis, "devicePixelRatio", previousDpr);
      } else {
        delete (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
      }
    }
  });

  it("owns and stops renderer animation loops on stop or disposal", async () => {
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number): void => {
      callbacks.delete(id);
    }) as typeof cancelAnimationFrame;

    try {
      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
      let frames = 0;
      const loop = renderer.startAnimationLoop(() => {
        frames += 1;
      });

      callbacks.get(1)?.(16);
      callbacks.get(2)?.(32);
      expect(frames).toBe(2);
      expect(loop.running).toBe(true);
      loop.stop();
      expect(loop.running).toBe(false);
      expect(callbacks.has(3)).toBe(false);

      const disposedLoop = renderer.startAnimationLoop(() => {
        frames += 1;
      });
      renderer.dispose();
      expect(disposedLoop.running).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    }
  });

  it("submits instanced unlit geometry as one GPU instanced draw command", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.5, 0, 0),
      ...translationMatrix(0.5, 0, 0)
    ]);

    const diagnostics = renderer.render([{
      geometry: Geometry.triangle(),
      material: new InstancedUnlitMaterial({ color: [0.2, 0.8, 0.3, 1] }),
      instanceTransforms: transforms,
      label: "instanced-triangles"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(command?.uniforms?.get("u_instanceCount")).toBe(2);
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16))).toEqual([-0.5, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32))).toEqual([0.5, 0, 0, 1]);
    renderer.dispose();
  });

  it("uses per-instance matrix attributes for oversized instancing batches", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array(Array.from({ length: 65 }, (_, index) => [
      ...translationMatrix(index / 100, 0, 0)
    ]).flat());

    const diagnostics = renderer.render([{
      geometry: Geometry.triangle(),
      material: new InstancedUnlitMaterial({ color: [0.2, 0.8, 0.3, 1] }),
      instanceTransforms: transforms,
      label: "many-instanced-triangles"
    }]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(diagnostics.drawCalls).toBe(1);
    expect(commands.map((command) => command.instanceCount)).toEqual([65]);
    expect(commands[0]?.uniforms?.get("u_instanceCount")).toBe(65);
    expect(commands[0]?.uniforms?.get("u_instanceAttributeMode")).toBe(1);
    expect(commands[0]?.instanceAttributes?.map((attribute) => attribute.shaderName)).toEqual([
      "a_instanceMatrix0",
      "a_instanceMatrix1",
      "a_instanceMatrix2",
      "a_instanceMatrix3"
    ]);
    expect(commands[0]?.instanceAttributes?.map((attribute) => attribute.offset)).toEqual([0, 16, 32, 48]);
    expect(commands[0]?.instanceAttributes?.every((attribute) => attribute.stride === 64 && attribute.divisor === 1)).toBe(true);
    renderer.dispose();
  });

  it("uploads per-instance colors and custom attributes through the public RenderItem path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.5, 0, 0),
      ...translationMatrix(0.5, 0, 0)
    ]);
    const instanceColors = new Float32Array([
      1, 0, 0, 1,
      0, 0.4, 1, 0.75
    ]);
    const customWeights = new Float32Array([0.25, 0.75]);

    renderer.render([{
      geometry: Geometry.triangle(),
      material: new InstancedUnlitMaterial({ color: [1, 1, 1, 1] }),
      instanceTransforms: transforms,
      instanceColors,
      instanceAttributes: [{
        shaderName: "a_customWeight",
        components: 1,
        data: customWeights
      }],
      label: "instanced-color-custom"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.instanceCount).toBe(2);
    expect(command?.instanceAttributes?.map((attribute) => attribute.shaderName)).toEqual(["a_instanceColor", "a_customWeight"]);
    const colorBuffer = command?.instanceAttributes?.[0]?.buffer as MockRenderBuffer;
    const customBuffer = command?.instanceAttributes?.[1]?.buffer as MockRenderBuffer;
    expect(Array.from(new Float32Array(colorBuffer.bytes.buffer))).toEqual(Array.from(instanceColors));
    expect(Array.from(new Float32Array(customBuffer.bytes.buffer))).toEqual(Array.from(customWeights));
    expect(colorBuffer.disposed).toBe(true);
    expect(customBuffer.disposed).toBe(true);
    renderer.dispose();
  });

  it("can batch compatible static render items inside the renderer", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();
    const material = new InstancedUnlitMaterial({ color: [0.9, 0.7, 0.3, 1] });

    const diagnostics = renderer.render({
      staticBatching: true,
      renderItems: [
        { geometry, material, modelMatrix: translationMatrix(-0.5, 0, 0), label: "static-a" },
        { geometry, material, modelMatrix: translationMatrix(0, 0, 0), label: "static-b" },
        { geometry, material, modelMatrix: translationMatrix(0.5, 0, 0), label: "static-c" }
      ]
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.submittedObjects).toBe(3);
    expect(diagnostics.visibleObjects).toBe(3);
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toMatch(/^renderer-static-batch-/);
    expect(command?.instanceCount).toBe(3);
    expect(command?.uniforms?.get("u_instanceCount")).toBe(3);
    renderer.dispose();
  });

  it("submits instanced PBR geometry with normal and light uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.4, 0, 0),
      ...translationMatrix(0.4, 0, 0)
    ]);

    const diagnostics = renderer.render([{
      geometry: Geometry.litTriangle(),
      material: new InstancedPBRMaterial({
        baseColor: [0.25, 0.7, 0.95, 1],
        roughness: 0.55,
        emissiveColor: [0.04, 0.08, 0.12]
      }),
      instanceTransforms: transforms,
      label: "instanced-pbr-triangles"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(command?.uniforms?.get("u_instanceCount")).toBe(2);
    expect(command?.uniforms?.get("u_lightCount")).toBe(0);
    expect(command?.shader?.label).toBe("galileo3d/instanced-pbr");
    expect(command?.shader?.reflection.uniforms.has("u_lightData")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("normal")).toBe(true);
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16)).map((value) => Number(value.toFixed(3)))).toEqual([-0.4, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32)).map((value) => Number(value.toFixed(3)))).toEqual([0.4, 0, 0, 1]);
    renderer.dispose();
  });

  it("expands instance transforms for textured materials without an instanced shader path", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const transforms = new Float32Array([
      ...translationMatrix(-0.35, 0, 0),
      ...translationMatrix(0.35, 0, 0)
    ]);

    const diagnostics = renderer.render([{
      geometry: Geometry.texturedCube(1),
      material: new TexturedPBRMaterial({ baseColor: [0.7, 0.35, 0.2, 1] }),
      instanceTransforms: transforms,
      label: "textured-pbr-instance-fallback"
    }]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(diagnostics.drawCalls).toBe(2);
    expect(commands.map((command) => command.label)).toEqual([
      "textured-pbr-instance-fallback#instance-0",
      "textured-pbr-instance-fallback#instance-1"
    ]);
    expect(commands.map((command) => command.instanceCount)).toEqual([undefined, undefined]);
    expect(commands[0]?.shader?.label).not.toBe("galileo3d/instanced-pbr");
    expect(commands[0]?.shader?.label).toBe(DEFAULT_TEXTURED_PBR_SHADER_NAME);
    expect(commands[0]?.vertexFormat?.hasAttribute("uv")).toBe(true);
    expect(commands[0]?.uniforms?.get("u_baseColorTexture")).toBeInstanceOf(TextureBinding);
    expect(Array.from((commands[0]?.uniforms?.get("u_modelMatrix") as Float32Array).slice(12, 16)).map((value) => Number(value.toFixed(2)))).toEqual([-0.35, 0, 0, 1]);
    expect(Array.from((commands[1]?.uniforms?.get("u_modelMatrix") as Float32Array).slice(12, 16)).map((value) => Number(value.toFixed(2)))).toEqual([0.35, 0, 0, 1]);
    renderer.dispose();
  });

  it("renders base-color textured PBR geometry without tangents when no normal map is authored", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const vertices = new VertexBuffer(VertexFormat.P3N3T2, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(0, "normal", [0, 0, 1]);
    vertices.setAttribute(0, "uv", [0, 0]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(1, "normal", [0, 0, 1]);
    vertices.setAttribute(1, "uv", [1, 0]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    vertices.setAttribute(2, "normal", [0, 0, 1]);
    vertices.setAttribute(2, "uv", [0.5, 1]);
    const geometry = new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
    const texture = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([220, 120, 60, 255]) });

    const diagnostics = renderer.render([{
      geometry,
      material: new TexturedPBRMaterial({ baseColorTexture: texture }),
      label: "textured-pbr-without-tangent"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("textured-pbr-without-tangent");
    expect(command?.vertexFormat?.hasAttribute("uv")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("tangent")).toBe(false);
    expect(command?.uniforms?.get("u_normalTextureEnabled")).toBe(0);
    expect(command?.uniforms?.get("u_baseColorTexture")).toBeInstanceOf(TextureBinding);
    renderer.dispose();
    geometry.dispose();
  });

  it("renders material instance overrides without mutating the shared base material", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const baseMaterial = new UnlitMaterial({ color: [0.1, 0.2, 0.3, 1] });
    const instance = new MaterialInstance(baseMaterial);
    instance.setOverride("u_baseColor", [0.9, 0.1, 0.2, 1]);

    const diagnostics = renderer.render([{
      geometry: Geometry.triangle(),
      material: instance,
      label: "material-instance-triangle"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.uniforms?.get("u_baseColor")).toEqual([0.9, 0.1, 0.2, 1]);
    expect(baseMaterial.getParameter("u_baseColor")).toEqual([0.1, 0.2, 0.3, 1]);
    expect(command?.renderState).toEqual(baseMaterial.renderState);
    expect(command?.shader?.label).toBe(baseMaterial.shaderKey);

    renderer.dispose();
  });

  it("compiles material-selected shader variants through the forward pass", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new TexturedPBRMaterial({
      clearcoatFactor: 0.8,
      clearcoatTexture: new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 255]) })
    });

    const diagnostics = renderer.render([{
      geometry: Geometry.texturedCube(1),
      material,
      label: "clearcoat-variant-triangle"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(material.shaderVariant).toBe(DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT);
    expect(command?.shader?.label).toBe(`${DEFAULT_TEXTURED_PBR_SHADER_NAME}:${DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT}`);
    expect(command?.shader?.reflection.uniforms.has("u_clearcoatTexture")).toBe(true);

    renderer.dispose();
  });

  it("resolves scene renderables through explicit resource libraries", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-triangle");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:triangle", material: "material:unlit", morphWeights: [0.25] }));
    const geometry = Geometry.litTriangle();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:triangle": geometry },
      materialLibrary: new Map([["material:unlit", material]]),
      morphTargetLibrary: {
        "geometry:triangle": [{ positions: [[0, 0, 0], [0, 0, 1], [0, 0, 2]] }]
      }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const floats = new Float32Array(buffer.bytes.buffer.slice(buffer.bytes.byteOffset, buffer.bytes.byteOffset + buffer.bytes.byteLength));
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("scene-triangle");
    expect(Array.from(floats.slice(0, 15)).map((value) => Number(value.toFixed(3)))).toEqual([
      -0.5, -0.5, 0, 0, 0, 1,
      0.5, -0.5, 0.25, 0, 0, 1,
      0, 0.5, 0.5
    ]);

    renderer.dispose();
    geometry.dispose();
  });

  it("carries scene renderable instance transforms into instanced draw commands", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-instanced-triangle");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({
      geometry: "geometry:triangle",
      material: "material:instanced",
      instanceTransforms: [
        ...translationMatrix(-0.25, 0, 0),
        ...translationMatrix(0.25, 0, 0)
      ],
      instanceColors: [
        1, 0, 0, 1,
        0, 0.4, 1, 1
      ]
    }));
    const geometry = Geometry.triangle();
    const material = new InstancedUnlitMaterial({ color: [0.4, 0.8, 0.2, 1] });

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:triangle": geometry },
      materialLibrary: new Map([["material:instanced", material]])
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const matrices = command?.uniforms?.get("u_instanceMatrices");
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.instanceCount).toBe(2);
    expect(matrices).toBeInstanceOf(Float32Array);
    expect(Array.from((matrices as Float32Array).slice(12, 16))).toEqual([-0.25, 0, 0, 1]);
    expect(Array.from((matrices as Float32Array).slice(28, 32))).toEqual([0.25, 0, 0, 1]);
    expect(command?.instanceAttributes?.map((attribute) => attribute.shaderName)).toEqual(["a_instanceColor"]);

    renderer.dispose();
    geometry.dispose();
  });

  it("flips culling for mirrored model transforms instead of dropping back-facing imported geometry", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });

    renderer.render([{
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({ name: "mirrored-pbr" }),
      modelMatrix: scaleMatrix(-1, 1, 1),
      label: "mirrored-pbr"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.renderState?.cullMode).toBe("front");
    renderer.dispose();
  });

  it("expands instanced draws when per-instance mirrored transforms require different cull state", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.litCube(1);
    const material = new InstancedPBRMaterial({ name: "mixed-handedness-instanced-pbr" });

    renderer.render([{
      geometry,
      material,
      instanceTransforms: [
        ...translationMatrix(-0.25, 0, 0),
        ...scaleMatrix(-1, 1, 1)
      ],
      label: "mixed-handedness-instanced-pbr"
    }]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(commands).toHaveLength(2);
    expect(commands.map((command) => command.instanceCount)).toEqual([undefined, undefined]);
    expect(commands.map((command) => command.renderState?.cullMode)).toEqual(["back", "front"]);
    renderer.dispose();
    geometry.dispose();
  });

  it("applies camera view-projection and scene node transforms to renderer matrix uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("scene-pbr-cube");
    node.transform.setPosition(2, 3, 4);
    node.transform.setScale(2, 4, 8);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit", material: "material:pbr" }));
    const geometry = Geometry.litTriangle();
    const material = new PBRMaterial();

    const diagnostics = renderer.render(
      {
        scene,
        geometryLibrary: { "geometry:lit": geometry },
        materialLibrary: new Map([["material:pbr", material]])
      },
      { viewProjectionMatrix: translationMatrix(1, 2, 3) }
    );

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const normal = command?.uniforms?.get("u_normalMatrix") as Float32Array;
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("scene-pbr-cube");
    expect(Array.from(model.slice(0, 16)).map(round3)).toEqual([
      2, 0, 0, 0,
      0, 4, 0, 0,
      0, 0, 8, 0,
      2, 3, 4, 1
    ]);
    expect(Array.from(normal.slice(0, 16)).map(round3)).toEqual([
      0.5, 0, 0, 0,
      0, 0.25, 0, 0,
      0, 0, 0.125, 0,
      0, 0, 0, 1
    ]);
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([3, 5, 7, 1]);

    renderer.dispose();
    geometry.dispose();
  });

  it("auto-frames scene render sources that do not have an authored camera", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const scene = new Scene();
    const node = scene.createNode("auto-framed-pbr-cube");
    node.transform.setPosition(12, -3, 2);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit-cube", material: "material:pbr" }));
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:lit-cube": geometry },
      materialLibrary: { "material:pbr": material }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    const cameraPosition = command?.uniforms?.get("u_cameraPosition") as readonly number[];
    const environmentIntensity = command?.uniforms?.get("u_environmentIntensity") as number;
    const environmentSkyColor = command?.uniforms?.get("u_environmentSkyColor") as readonly number[];
    expect(diagnostics.drawCalls).toBe(1);
    expect(Array.from(model.slice(12, 16)).map(round3)).toEqual([12, -3, 2, 1]);
    expect(Array.from(mvp.slice(12, 16)).map(round3)).not.toEqual([12, -3, 2, 1]);
    const expectedFrame = computePerspectiveCameraFrame(
      { min: [11.5, -3.5, 1.5], max: [12.5, -2.5, 2.5] },
      { width: 16, height: 9 },
      DEFAULT_RENDERER_AUTO_FRAME_OPTIONS
    );
    expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3));
    expect(round3(cameraPosition[0])).not.toBe(12);
    expect(round3(cameraPosition[1])).not.toBe(-3);
    expect(environmentIntensity).toBe(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING.intensity);
    expect(environmentSkyColor).toEqual(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING.proceduralMap?.skyColor);
    expect(command?.uniforms?.get("u_lightCount")).toBe(2);
    const lightData = command?.uniforms?.get("u_lightData") as Float32Array;
    expect(Array.from(lightData.slice(0, 4)).map(round3)).toEqual([
      ...DEFAULT_RENDERER_DIRECT_LIGHTING.key.color.map(round3),
      DEFAULT_RENDERER_DIRECT_LIGHTING.key.intensity
    ]);

    renderer.dispose();
    geometry.dispose();
  });

  it("auto-frames explicit render sources from authored frame bounds instead of decorative items", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial();
    const decorativeMatrix = new Float32Array([
      20, 0, 0, 0,
      0, 20, 0, 0,
      0, 0, 20, 0,
      80, 0, -12, 1
    ]);

    const diagnostics = renderer.render({
      cameraPolicy: "auto-frame",
      cameraFrameBounds: { min: [-1, -0.5, -0.4], max: [1, 0.9, 0.4] },
      renderItems: [
        { geometry, material, label: "primary-product" },
        { geometry, material, label: "decorative-studio-set", modelMatrix: decorativeMatrix, includeInAutoFrame: false }
      ]
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const cameraPosition = command?.uniforms?.get("u_cameraPosition") as readonly number[];
    const expectedFrame = computePerspectiveCameraFrame(
      { min: [-1, -0.5, -0.4], max: [1, 0.9, 0.4] },
      { width: 16, height: 9 },
      DEFAULT_RENDERER_AUTO_FRAME_OPTIONS
    );
    expect(diagnostics.drawCalls).toBe(2);
    expect(command?.label).toBe("primary-product");
    expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3));
    expect(Math.abs(cameraPosition[0])).toBeLessThan(5);

    renderer.dispose();
    geometry.dispose();
  });

  it("lets render sources tighten auto-frame options for preview subjects", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial();

    renderer.render({
      cameraPolicy: "auto-frame",
      cameraFrameBounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      cameraFrameOptions: { minDistance: 0.2, paddingRatio: 0 },
      renderItems: [{ geometry, material, label: "tight-preview-subject" }]
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const cameraPosition = command?.uniforms?.get("u_cameraPosition") as readonly number[];
    const expectedFrame = computePerspectiveCameraFrame(
      { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { width: 16, height: 9 },
      { ...DEFAULT_RENDERER_AUTO_FRAME_OPTIONS, minDistance: 0.2, paddingRatio: 0 }
    );
    expect(command?.label).toBe("tight-preview-subject");
    expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3));
    expect(Math.hypot(cameraPosition[0], cameraPosition[1], cameraPosition[2])).toBeLessThan(2.2);

    renderer.dispose();
    geometry.dispose();
  });

  it("lets explicit auto-frame camera policy override authored scene cameras", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const scene = new Scene();
    const authoredCamera = scene.createPerspectiveCamera({ name: "bad-authored-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(authoredCamera);
    const node = scene.createNode("explicit-auto-frame-overrides-authored-camera-cube");
    node.transform.setPosition(12, -3, 2);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit-cube", material: "material:pbr" }));
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial();

    const diagnostics = renderer.render({
      scene,
      cameraPolicy: "auto-frame",
      geometryLibrary: { "geometry:lit-cube": geometry },
      materialLibrary: { "material:pbr": material }
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const cameraPosition = command?.uniforms?.get("u_cameraPosition") as readonly number[];
    const expectedFrame = computePerspectiveCameraFrame(
      { min: [11.5, -3.5, 1.5], max: [12.5, -2.5, 2.5] },
      { width: 16, height: 9 },
      DEFAULT_RENDERER_AUTO_FRAME_OPTIONS
    );
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.label).toBe("explicit-auto-frame-overrides-authored-camera-cube");
    expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3));
    expect(Array.from(cameraPosition).map(round3)).not.toEqual([0, 0, 0]);

    renderer.dispose();
    geometry.dispose();
  });

  it("lets high-level scene render sources opt out of the default renderer environment", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const scene = new Scene();
    const node = scene.createNode("environment-opt-out-pbr-cube");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:lit-cube", material: "material:pbr" }));
    const geometry = Geometry.litCube(1);
    const material = new PBRMaterial({ environmentIntensity: 0.03 });

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:lit-cube": geometry },
      materialLibrary: { "material:pbr": material },
      environmentLighting: false
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.uniforms?.get("u_environmentIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentMapIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentSpecularIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentMapTextureEnabled")).toBe(0);
    expect(command?.uniforms?.get("u_lightCount")).toBe(0);
    renderer.dispose();
    geometry.dispose();
  });

  it("applies the default renderer environment to object render sources with direct PBR items", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new PBRMaterial({ name: "direct-object-source-pbr", environmentIntensity: 0.03 });
    const geometry = Geometry.litCube(1);

    const diagnostics = renderer.render({
      renderItems: [{
        geometry,
        material,
        modelMatrix: translationMatrix(0, 0, -2),
        label: "direct-object-source-pbr"
      }]
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    const cameraPosition = command?.uniforms?.get("u_cameraPosition") as readonly number[];
    expect(diagnostics.drawCalls).toBe(1);
    expect(Array.from(model.slice(12, 16)).map(round3)).toEqual([0, 0, -2, 1]);
    expect(Array.from(mvp.slice(12, 16)).map(round3)).not.toEqual([0, 0, -2, 1]);
    const expectedFrame = computePerspectiveCameraFrame(
      { min: [-0.5, -0.5, -2.5], max: [0.5, 0.5, -1.5] },
      { width: 4, height: 4 },
      DEFAULT_RENDERER_AUTO_FRAME_OPTIONS
    );
    expect(Array.from(cameraPosition).map(round3)).toEqual(expectedFrame.cameraPosition.map(round3));
    expect(command?.uniforms?.get("u_environmentIntensity")).toBe(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING.intensity);
    expect(command?.uniforms?.get("u_environmentSkyColor")).toEqual(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING.proceduralMap?.skyColor);
    expect(command?.uniforms?.get("u_lightCount")).toBe(2);
    const lightData = command?.uniforms?.get("u_lightData") as Float32Array;
    expect(Array.from(lightData.slice(0, 4)).map(round3)).toEqual([
      ...DEFAULT_RENDERER_DIRECT_LIGHTING.key.color.map(round3),
      DEFAULT_RENDERER_DIRECT_LIGHTING.key.intensity
    ]);

    renderer.dispose();
    geometry.dispose();
  });

  it("lets object render sources with direct PBR items opt out of the default renderer environment", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new PBRMaterial({ name: "direct-object-source-unlit-pbr", environmentIntensity: 0.03 });
    const geometry = Geometry.litCube(1);

    const diagnostics = renderer.render({
      renderItems: [{
        geometry,
        material,
        modelMatrix: translationMatrix(0, 0, -2),
        label: "direct-object-source-unlit-pbr"
      }],
      environmentLighting: false
    });

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(diagnostics.drawCalls).toBe(1);
    expect(command?.uniforms?.get("u_environmentIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentMapIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentSpecularIntensity")).toBe(0);
    expect(command?.uniforms?.get("u_environmentMapTextureEnabled")).toBe(0);
    expect(command?.uniforms?.get("u_lightCount")).toBe(0);

    renderer.dispose();
    geometry.dispose();
  });

  it("can require authored cameras for scene render sources instead of silently using identity framing", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("camera-required-cube");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();

    expect(() => renderer.render({
      scene,
      cameraPolicy: "require",
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": new UnlitMaterial() }
    })).toThrow(/CAMERA_REQUIRED|requires an explicit camera/);

    renderer.dispose();
    geometry.dispose();
  });

  it("culls scene renderables against the active scene camera frustum by default", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "main-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(camera);
    const visible = scene.createNode("visible-cube");
    visible.transform.setPosition(0, 0, -4);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const culled = scene.createNode("outside-frustum-cube");
    culled.transform.setPosition(30, 0, -4);
    scene.root.addChild(culled);
    scene.addRenderable(culled, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material }
    });

    expect(diagnostics.drawCalls).toBe(1);
    expect(diagnostics.submittedObjects).toBe(2);
    expect(diagnostics.visibleObjects).toBe(1);
    expect(diagnostics.culledObjects).toBe(1);
    expect(diagnostics.frustumTestedObjects).toBe(2);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(["visible-cube"]);
    renderer.dispose();
    geometry.dispose();
  });

  it("resizes authored scene cameras to the renderer viewport before frustum culling", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 9 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "aspect-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(camera);
    const visible = scene.createNode("wide-aspect-visible-cube");
    visible.transform.setPosition(6, 0, -8);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material }
    });

    expect(camera.aspect).toBeCloseTo(16 / 9);
    expect(diagnostics.drawCalls).toBe(1);
    expect(diagnostics.submittedObjects).toBe(1);
    expect(diagnostics.visibleObjects).toBe(1);
    expect(diagnostics.culledObjects).toBe(0);
    expect(diagnostics.frustumTestedObjects).toBe(1);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toContain("wide-aspect-visible-cube");
    renderer.dispose();
    geometry.dispose();
  });

  it("keeps scene frustum culling stable for parented moving cameras", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const cameraRig = scene.createNode("camera-rig");
    cameraRig.transform.setPosition(5, 0, 0);
    scene.root.addChild(cameraRig);
    const camera = scene.createPerspectiveCamera({ name: "side-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    camera.transform.setRotation(...quatFromEuler(0, Math.PI / 2, 0));
    cameraRig.addChild(camera);
    const visible = scene.createNode("visible-from-parented-camera");
    visible.transform.setPosition(0, 0, 0);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const behindCamera = scene.createNode("behind-parented-camera");
    behindCamera.transform.setPosition(8, 0, 0);
    scene.root.addChild(behindCamera);
    scene.addRenderable(behindCamera, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material }
    });

    expect(diagnostics.drawCalls).toBe(1);
    expect(diagnostics.submittedObjects).toBe(2);
    expect(diagnostics.visibleObjects).toBe(1);
    expect(diagnostics.culledObjects).toBe(1);
    expect(diagnostics.frustumTestedObjects).toBe(2);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual(["visible-from-parented-camera"]);
    renderer.dispose();
    geometry.dispose();
  });

  it("can disable scene camera frustum culling for diagnostics and authoring tools", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ name: "main-camera", fovYRadians: Math.PI / 2, aspect: 1, near: 0.1, far: 20 });
    scene.root.addChild(camera);
    const visible = scene.createNode("visible-cube");
    visible.transform.setPosition(0, 0, -4);
    scene.root.addChild(visible);
    scene.addRenderable(visible, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const outside = scene.createNode("outside-frustum-cube");
    outside.transform.setPosition(30, 0, -4);
    scene.root.addChild(outside);
    scene.addRenderable(outside, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();
    const material = new UnlitMaterial();

    const diagnostics = renderer.render({
      scene,
      geometryLibrary: { "geometry:cube": geometry },
      materialLibrary: { "material:unlit": material },
      frustumCulling: false
    });

    expect(diagnostics.drawCalls).toBe(2);
    expect(diagnostics.submittedObjects).toBe(2);
    expect(diagnostics.visibleObjects).toBe(2);
    expect(diagnostics.culledObjects).toBe(0);
    expect(diagnostics.frustumTestedObjects).toBe(0);
    expect((renderer.device as MockRenderDevice).drawCommands.map((command) => command.label)).toEqual([
      "visible-cube",
      "outside-frustum-cube"
    ]);
    renderer.dispose();
    geometry.dispose();
  });

  it("forwards indexed and array draw ranges to render commands", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const indexed = Geometry.cube();
    const points = Geometry.points([
      [-1, 0, 0],
      [0, 0, 0],
      [1, 0, 0]
    ]);
    const material = new UnlitMaterial();

    renderer.render([
      { geometry: indexed, material, label: "indexed-range", drawRange: { start: 6, count: 12 } },
      { geometry: points, material, label: "array-range", drawRange: { start: 1, count: 2 } }
    ]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(commands[0]?.label).toBe("indexed-range");
    expect(commands[0]?.firstIndex).toBe(6);
    expect(commands[0]?.indexCount).toBe(12);
    expect(commands[1]?.label).toBe("array-range");
    expect(commands[1]?.firstVertex).toBe(1);
    expect(commands[1]?.vertexCount).toBe(2);
    expect(() => renderer.render([{ geometry: indexed, material, drawRange: { start: 35, count: 2 } }])).toThrow(/drawRange/);

    renderer.dispose();
    indexed.dispose();
    points.dispose();
  });

  it("picks the nearest scene renderable using transformed geometry bounds", () => {
    const scene = new Scene();
    const near = scene.createNode("near-cube");
    near.transform.setPosition(0, 0, 0);
    scene.root.addChild(near);
    scene.addRenderable(near, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const far = scene.createNode("far-cube");
    far.transform.setPosition(0, 0, -4);
    scene.root.addChild(far);
    scene.addRenderable(far, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const miss = scene.createNode("miss-cube");
    miss.transform.setPosition(4, 0, 0);
    scene.root.addChild(miss);
    scene.addRenderable(miss, new Renderable({ geometry: "geometry:cube", material: "material:unlit" }));
    const geometry = Geometry.cube();

    const hit = pickSceneRenderables(
      { scene, geometryLibrary: { "geometry:cube": geometry } },
      new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1))
    );

    expect(hit?.node.name).toBe("near-cube");
    expect(hit?.geometry).toBe(geometry);
    expect(hit?.distance).toBeCloseTo(4.5);
    expect(hit?.bounds.min).toEqual([-0.5, -0.5, -0.5]);
    expect(hit?.bounds.max).toEqual([0.5, 0.5, 0.5]);
    expect(
      pickSceneRenderables({ scene, geometryLibrary: { "geometry:cube": geometry } }, new Ray(new Vector3(4, 4, 5), new Vector3(0, 0, -1)))
    ).toBeUndefined();
    geometry.dispose();
  });

  it("picks point-cloud renderables with a finite threshold and returns sorted point hits", () => {
    const scene = new Scene();
    const points = scene.createNode("pickable-points");
    scene.root.addChild(points);
    scene.addRenderable(points, new Renderable({ geometry: "geometry:points", material: "material:unlit" }));
    const geometry = Geometry.points([
      [0.08, 0, 0],
      [0.36, 0, -1],
      [1.2, 0, 0]
    ]);

    const hits = pickSceneRenderableHits(
      { scene, geometryLibrary: { "geometry:points": geometry } },
      new Ray(new Vector3(0, 0, 4), new Vector3(0, 0, -1)),
      { pointRadius: 0.12 }
    );

    expect(hits).toHaveLength(1);
    expect(hits[0]?.node.name).toBe("pickable-points");
    expect(hits[0]?.pointIndex).toBe(0);
    expect(hits[0]?.distance).toBeCloseTo(4);
    expect(hits[0]?.bounds.min[0]).toBeCloseTo(-0.04);
    expect(
      pickSceneRenderables(
        { scene, geometryLibrary: { "geometry:points": geometry } },
        new Ray(new Vector3(0, 0, 4), new Vector3(0, 0, -1)),
        { pointRadius: 0.04 }
      )
    ).toBeUndefined();
    expect(() => pickSceneRenderableHits(
      { scene, geometryLibrary: { "geometry:points": geometry } },
      new Ray(new Vector3(0, 0, 4), new Vector3(0, 0, -1)),
      { pointRadius: 0 }
    )).toThrow(/radius/);
    geometry.dispose();
  });

  it("includes scene renderable instance transforms in pick bounds and rejects missing pick resources", () => {
    const scene = new Scene();
    const instanced = scene.createNode("instanced-cubes");
    scene.root.addChild(instanced);
    scene.addRenderable(instanced, new Renderable({
      geometry: "geometry:cube",
      material: "material:unlit",
      instanceTransforms: [
        ...translationMatrix(5, 0, 0),
        ...translationMatrix(0, 0, -2)
      ]
    }));
    const geometry = Geometry.cube();

    const hit = pickSceneRenderables(
      { scene, geometryLibrary: { "geometry:cube": geometry } },
      new Ray(new Vector3(5, 0, 5), new Vector3(0, 0, -1))
    );

    expect(hit?.node.name).toBe("instanced-cubes");
    expect(hit?.bounds.min).toEqual([-0.5, -0.5, -2.5]);
    expect(hit?.bounds.max).toEqual([5.5, 0.5, 0.5]);
    expect(() => pickSceneRenderables({ scene }, new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)))).toThrow(/geometryLibrary/);
    expect(() => pickSceneRenderables({ scene, geometryLibrary: {} }, new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)))).toThrow(
      /missing geometry/
    );
    geometry.dispose();
  });

  it("includes morph and skinning deformation bounds when picking scene renderables", () => {
    const scene = new Scene();
    const morphed = scene.createNode("morphed-cube");
    scene.root.addChild(morphed);
    scene.addRenderable(morphed, new Renderable({
      geometry: "geometry:cube",
      material: "material:unlit",
      morphWeights: [1]
    }));
    const skinned = scene.createNode("skinned-triangle");
    skinned.transform.setPosition(0, 1.4, 0);
    scene.root.addChild(skinned);
    scene.addRenderable(skinned, new Renderable({
      geometry: "geometry:skinned-triangle",
      material: "material:unlit",
      skinning: {
        jointCount: 2,
        matrices: new Float32Array([
          ...translationMatrix(0, 0, 0),
          ...translationMatrix(4, 0, 0)
        ])
      }
    }));
    const cube = Geometry.cube();
    const skinnedGeometry = createSkinnedTriangle();
    const morphTargets = [{
      positions: Array.from({ length: cube.vertexBuffer.vertexCount }, () => [4, 0, 0] as const)
    }];

    const morphedHit = pickSceneRenderables(
      {
        scene,
        geometryLibrary: { "geometry:cube": cube, "geometry:skinned-triangle": skinnedGeometry },
        morphTargetLibrary: { "geometry:cube": morphTargets }
      },
      new Ray(new Vector3(4, 0, 5), new Vector3(0, 0, -1))
    );
    const skinnedHit = pickSceneRenderables(
      {
        scene,
        geometryLibrary: { "geometry:cube": cube, "geometry:skinned-triangle": skinnedGeometry },
        morphTargetLibrary: { "geometry:cube": morphTargets }
      },
      new Ray(new Vector3(3.95, 1.4, 5), new Vector3(0, 0, -1))
    );

    expect(morphedHit?.node.name).toBe("morphed-cube");
    expect(morphedHit?.bounds.min[0]).toBeCloseTo(3.5);
    expect(morphedHit?.bounds.max[0]).toBeCloseTo(4.5);
    expect(skinnedHit?.node.name).toBe("skinned-triangle");
    expect(skinnedHit?.bounds.min[0]).toBeCloseTo(3.6);
    expect(skinnedHit?.bounds.max[0]).toBeCloseTo(4.4);
    expect(() => pickSceneRenderables(
      { scene, geometryLibrary: { "geometry:cube": cube, "geometry:skinned-triangle": skinnedGeometry } },
      new Ray(new Vector3(4, 0, 5), new Vector3(0, 0, -1))
    )).toThrow(/morph target resource/);

    cube.dispose();
    skinnedGeometry.dispose();
  });

  it("composes morph target bounds before skinning bounds for scene picking", () => {
    const scene = new Scene();
    const node = scene.createNode("morphed-skinned-triangle");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({
      geometry: "geometry:morphed-skinned-triangle",
      material: "material:skinned",
      morphWeights: [1],
      skinning: {
        jointCount: 2,
        matrices: new Float32Array([
          ...translationMatrix(0, 0, 0),
          ...translationMatrix(4, 0, 0)
        ])
      }
    }));
    const geometry = createSkinnedTriangle();
    const morphTargets = [{
      positions: Array.from({ length: geometry.vertexBuffer.vertexCount }, () => [2, 0, 0] as const)
    }];

    const hit = pickSceneRenderables(
      {
        scene,
        geometryLibrary: { "geometry:morphed-skinned-triangle": geometry },
        morphTargetLibrary: { "geometry:morphed-skinned-triangle": morphTargets }
      },
      new Ray(new Vector3(5.95, 0, 5), new Vector3(0, 0, -1))
    );

    expect(hit?.node.name).toBe("morphed-skinned-triangle");
    expect(hit?.bounds.min[0]).toBeCloseTo(5.6);
    expect(hit?.bounds.max[0]).toBeCloseTo(6.4);
    geometry.dispose();
  });

  it("applies an explicit camera to direct render items without mutating the material", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new UnlitMaterial();

    renderer.render(
      [{ geometry: Geometry.triangle(), material, label: "camera-space-triangle" }],
      { viewProjectionMatrix: translationMatrix(0.25, 0.5, 0.75) }
    );

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(Array.from(material.getParameter("u_modelViewProjection") as Float32Array).slice(12, 16)).toEqual([0, 0, 0, 1]);

    renderer.dispose();
  });

  it("derives direct render-item transform uniforms under the identity camera policy", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new PBRMaterial({ name: "identity-policy-pbr" });

    renderer.render([{
      geometry: Geometry.litCube(1),
      material,
      modelMatrix: translationMatrix(0.4, -0.25, -1.5),
      label: "identity-policy-pbr"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    const normal = command?.uniforms?.get("u_normalMatrix") as Float32Array;
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([0.4, -0.25, -1.5, 1]);
    expect(Array.from(model.slice(12, 16)).map(round3)).toEqual([0.4, -0.25, -1.5, 1]);
    expect(Array.from(normal.slice(12, 16)).map(round3)).toEqual([0, 0, 0, 1]);
    expect(Array.from(material.getParameter("u_modelViewProjection") as Float32Array).slice(12, 16)).toEqual([0, 0, 0, 1]);

    renderer.dispose();
  });

  it("preserves explicit render-item model-view-projection matrices when no camera is supplied", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const material = new PBRMaterial({ name: "explicit-mvp-pbr" });

    renderer.render([{
      geometry: Geometry.litCube(1),
      material,
      modelMatrix: translationMatrix(0.4, -0.25, -1.5),
      modelViewProjectionMatrix: translationMatrix(0.9, 0.8, 0.7),
      label: "explicit-mvp-pbr"
    }]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const mvp = command?.uniforms?.get("u_modelViewProjection") as Float32Array;
    const model = command?.uniforms?.get("u_modelMatrix") as Float32Array;
    expect(Array.from(mvp.slice(12, 16)).map(round3)).toEqual([0.9, 0.8, 0.7, 1]);
    expect(Array.from(model.slice(12, 16)).map(round3)).toEqual([0.4, -0.25, -1.5, 1]);

    renderer.dispose();
  });

  it("rejects unresolved scene render resources instead of silently skipping renderables", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const scene = new Scene();
    const node = scene.createNode("missing-scene-resource");
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:missing", material: "material:missing" }));

    expect(() => renderer.render(scene)).toThrow(/geometryLibrary and materialLibrary/);
    expect(() =>
      renderer.render({
        scene,
        geometryLibrary: {},
        materialLibrary: {}
      })
    ).toThrow(/missing geometry/);

    renderer.dispose();
  });

  it("rejects render after dispose", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    renderer.dispose();

    expect(() => renderer.render([])).toThrow(/disposed/);
  });

  it("routes backend requests through one RenderDevice abstraction and reports missing WebGPU runtime explicitly", async () => {
    const mock = await createRenderDevice({ backend: "mock" });
    expect(mock.kind).toBe("mock");
    expect(mock.getDiagnostics()).toMatchObject({ drawCalls: 0, contextLost: false });
    mock.dispose();

    await expect(createRenderDevice({ backend: "webgpu" })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_RUNTIME_MISSING"
    });

    await expect(createRenderDevice({ backend: "webgpu", webgpu: createAdapterlessWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_ADAPTER_MISSING"
    });
  });

  it("rejects malformed WebGPU devices during backend creation", async () => {
    await expect(createRenderDevice({ backend: "webgpu", webgpu: createRejectingWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_REQUEST_FAILED"
    });

    await expect(createRenderDevice({ backend: "webgpu", webgpu: createMalformedWebGPU() })).rejects.toMatchObject({
      name: "RenderDeviceError",
      code: "WEBGPU_DEVICE_INVALID",
      details: {
        missing: expect.arrayContaining(["queue.writeBuffer", "queue.submit"])
      }
    });
  });

  it("creates a WebGPU render device through an injected adapter and verifies resources, readback, and diagnostics", async () => {
    const fakeGpu = createFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: fakeGpu });

    expect(device.kind).toBe("webgpu");
    expect(device.info.renderer).toBe("unit-webgpu-adapter");
    expect(device.info.capabilities).toEqual(expect.arrayContaining(["buffers", "buffer-readback", "draw-validation"]));
    expect(device.info.capabilities).toContain("rasterization");
    expect(device.info.limitations?.join(" ")).toContain("native WebGPU render-pipeline");

    const buffer = device.createBuffer("vertex", 8, new Uint8Array([1, 2, 3, 4]));
    device.updateBuffer(buffer, 4, new Uint8Array([5, 6, 7, 8]));
    expect(Array.from(device.readBuffer(buffer))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const shader = device.createShaderProgram({
      label: "unit-shader",
      marker: "@galileo3d-shader:unit",
      vertex: "// @galileo3d-shader:unit\nin vec3 position; uniform mat4 modelViewProjection;",
      fragment: "// @galileo3d-shader:unit\nuniform vec4 color;"
    });
    expect(shader.reflection.attributes.has("position")).toBe(true);
    expect(shader.reflection.uniforms.has("modelViewProjection")).toBe(true);
    expect(shader.reflection.uniforms.has("color")).toBe(true);

    const target = device.createRenderTarget({ width: 2, height: 2, label: "offscreen" });
    device.setRenderTarget(target);
    device.beginFrame(2, 2);
    device.clear([0.2, 0.4, 0.6, 1]);
    device.draw({ label: "webgpu-triangle", topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader });
    device.endFrame();

    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([51, 102, 153, 255]);
    expect(device.captureState().get("renderTarget")).toBe("offscreen");
    expect(device.getDiagnostics()).toMatchObject({
      drawCalls: 1,
      buffers: 1,
      shaders: 1,
      renderTargets: 1,
      contextLost: false,
      lastError: null
    });

    target.dispose();
    expect(device.getDiagnostics().renderTargets).toBe(0);
    device.dispose();
    expect(device.disposed).toBe(true);
  });

  it("marks WebGPU diagnostics as context lost when the native device lost promise resolves", async () => {
    let resolveLost!: (info: { readonly reason: string; readonly message: string }) => void;
    const lost = new Promise<{ readonly reason: string; readonly message: string }>((resolve) => {
      resolveLost = resolve;
    });
    const nativeDevice = { ...createFakeWebGPUDevice(), lost };
    const device = await createRenderDevice({
      backend: "webgpu",
      webgpu: {
        async requestAdapter(): Promise<WebGPUAdapterLike> {
          return {
            name: "lost-webgpu-adapter",
            async requestDevice(): Promise<WebGPUDeviceLike> {
              return nativeDevice;
            }
          };
        }
      }
    });

    const buffer = device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
    expect(device.getDiagnostics()).toMatchObject({ contextLost: false, lastError: null });

    resolveLost({ reason: "destroyed", message: "unit lost event" });
    await Promise.resolve();
    await Promise.resolve();

    expect(device.getDiagnostics()).toMatchObject({
      contextLost: true,
      lastError: "WebGPU device lost: destroyed: unit lost event"
    });
    expect(device.captureState().get("contextLost")).toBe(true);
    let thrown: unknown;
    try {
      device.readBuffer(buffer);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: "RenderDeviceError",
      code: "CONTEXT_LOST"
    });
  });

  it("rasterizes a WebGPU triangle into an offscreen render target for deterministic readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const vertices = new Float32Array([
      -0.8, -0.8, 0,
      0.8, -0.8, 0,
      0, 0.8, 0
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "raster-shader",
      marker: "@galileo3d-shader:raster",
      vertex: "// @galileo3d-shader:raster\nin vec3 position;",
      fragment: "// @galileo3d-shader:raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 16, height: 16, label: "webgpu-raster-target" });
    device.setRenderTarget(target);
    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(8, 8, 1, 1))).toEqual([26, 204, 51, 255]);
    device.dispose();
  });

  it("modulates WebGPU offscreen raster output with vertex colors", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 12 }
    ], 28);
    const vertices = new Float32Array([
      -0.8, -0.8, 0, 0.25, 0.5, 1, 0.5,
      0.8, -0.8, 0, 0.25, 0.5, 1, 0.5,
      0, 0.8, 0, 0.25, 0.5, 1, 0.5
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "vertex-color-raster-shader",
      marker: "@galileo3d-shader:vertex-color-raster",
      vertex: "// @galileo3d-shader:vertex-color-raster\nin vec3 position; in vec4 a_color;",
      fragment: "// @galileo3d-shader:vertex-color-raster\nuniform vec4 u_color; in vec4 v_vertexColor;"
    });
    const target = device.createRenderTarget({ width: 16, height: 16, label: "webgpu-vertex-color-target" });
    device.setRenderTarget(target);
    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: format,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.4, 0.4, 0.4, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(8, 8, 1, 1))).toEqual([26, 51, 102, 128]);
    device.dispose();
  });

  it("rasterizes WebGPU line and point topologies into deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const lineVertices = new Float32Array([
      -0.75, 0, 0,
      0.75, 0, 0
    ]);
    const pointVertices = new Float32Array([
      0, 0.65, 0
    ]);
    const lineBuffer = device.createBuffer("vertex", lineVertices.byteLength, lineVertices);
    const pointBuffer = device.createBuffer("vertex", pointVertices.byteLength, pointVertices);
    const shader = device.createShaderProgram({
      label: "webgpu-line-point-raster-shader",
      marker: "@galileo3d-shader:webgpu-line-point-raster",
      vertex: "// @galileo3d-shader:webgpu-line-point-raster\nin vec3 position;",
      fragment: "// @galileo3d-shader:webgpu-line-point-raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-line-point-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-line-raster",
      topology: "lines",
      vertexBuffer: lineBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 2,
      shader,
      uniforms: new Map([["u_color", [0.9, 0.2, 0.1, 1]]])
    });
    device.draw({
      label: "webgpu-point-raster",
      topology: "points",
      vertexBuffer: pointBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 1,
      shader,
      uniforms: new Map([["u_color", [0.1, 0.35, 1, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(16, 16, 1, 1))).toEqual([230, 51, 26, 255]);
    expect(Array.from(device.readPixels(16, 5, 1, 1))).toEqual([26, 89, 255, 255]);
    expect(device.getDiagnostics().drawCalls).toBe(2);
    device.dispose();
  });

  it("rasterizes WebGPU instanced triangles into deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const vertices = new Float32Array([
      -0.25, -0.25, 0,
      0.25, -0.25, 0,
      0, 0.25, 0
    ]);
    const transforms = new Float32Array([
      ...translationMatrix(-0.45, 0, 0),
      ...translationMatrix(0.45, 0, 0)
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "webgpu-instanced-raster-shader",
      marker: "@galileo3d-shader:webgpu-instanced-raster",
      vertex: "// @galileo3d-shader:webgpu-instanced-raster\nin vec3 position; uniform mat4 u_instanceMatrices[64]; uniform float u_instanceCount;",
      fragment: "// @galileo3d-shader:webgpu-instanced-raster\nuniform vec4 u_baseColor;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-instanced-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-instanced-raster",
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_baseColor", [0.2, 0.8, 0.3, 1]],
        ["u_instanceMatrices", transforms],
        ["u_instanceCount", 2]
      ]),
      instanceCount: 2
    });
    device.endFrame();

    expect(device.getDiagnostics().drawCalls).toBe(1);
    expect(Array.from(device.readPixels(9, 17, 1, 1))).toEqual([51, 204, 77, 255]);
    expect(Array.from(device.readPixels(23, 17, 1, 1))).toEqual([51, 204, 77, 255]);
    expect(Array.from(device.readPixels(16, 17, 1, 1))).toEqual([0, 0, 0, 255]);
    device.dispose();
  });

  it("applies WebGPU model-view-projection matrices in deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const vertices = new Float32Array([
      -0.35, -0.35, 0,
      0.35, -0.35, 0,
      0, 0.35, 0
    ]);
    const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "webgpu-mvp-raster-shader",
      marker: "@galileo3d-shader:webgpu-mvp-raster",
      vertex: "// @galileo3d-shader:webgpu-mvp-raster\nin vec3 position; uniform mat4 u_modelViewProjection;",
      fragment: "// @galileo3d-shader:webgpu-mvp-raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-mvp-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-mvp-raster",
      topology: "triangles",
      vertexBuffer: buffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_color", [0.2, 0.45, 0.95, 1]],
        ["u_modelViewProjection", translationMatrix(0.45, 0, 0)]
      ])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(16, 17, 1, 1))).toEqual([0, 0, 0, 255]);
    expect(Array.from(device.readPixels(23, 17, 1, 1))).toEqual([51, 115, 242, 255]);
    device.dispose();
  });

  it("applies WebGPU depth testing in deterministic offscreen readback", async () => {
    const device = await createRenderDevice({ backend: "webgpu", webgpu: createFakeWebGPU() });
    const nearVertices = new Float32Array([
      -0.65, -0.65, -0.5,
      0.65, -0.65, -0.5,
      0, 0.65, -0.5
    ]);
    const farVertices = new Float32Array([
      -0.65, -0.65, 0.5,
      0.65, -0.65, 0.5,
      0, 0.65, 0.5
    ]);
    const nearBuffer = device.createBuffer("vertex", nearVertices.byteLength, nearVertices);
    const farBuffer = device.createBuffer("vertex", farVertices.byteLength, farVertices);
    const shader = device.createShaderProgram({
      label: "webgpu-depth-raster-shader",
      marker: "@galileo3d-shader:webgpu-depth-raster",
      vertex: "// @galileo3d-shader:webgpu-depth-raster\nin vec3 position;",
      fragment: "// @galileo3d-shader:webgpu-depth-raster\nuniform vec4 u_color;"
    });
    const target = device.createRenderTarget({ width: 32, height: 32, label: "webgpu-depth-raster-target" });

    device.setRenderTarget(target);
    device.beginFrame(32, 32);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "webgpu-depth-near",
      topology: "triangles",
      vertexBuffer: nearBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.1, 0.8, 0.2, 1]]])
    });
    device.draw({
      label: "webgpu-depth-far",
      topology: "triangles",
      vertexBuffer: farBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map([["u_color", [0.9, 0.1, 0.1, 1]]])
    });
    device.endFrame();

    expect(Array.from(device.readPixels(16, 17, 1, 1))).toEqual([25, 204, 51, 255]);
    device.dispose();
  });

  it("submits a native WebGPU render pass when the device exposes pipeline APIs", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu",
      marker: "@galileo3d-shader:native-webgpu",
      vertex: "// @galileo3d-shader:native-webgpu\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-target" });

    expect(device.info.capabilities).toContain("native-render-pipeline");
    expect(device.info.limitations?.join(" ")).not.toContain("requires createRenderPipeline");

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_modelViewProjection", translationMatrix(0.25, 0, 0)],
        ["u_color", [0.35, 0.45, 0.55, 1]]
      ])
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.shaderModules.map((module) => module.code)).toEqual([
      expect.stringContaining("u_draw.modelViewProjection * vec4<f32>(position, 1.0)"),
      expect.stringContaining("@group(0) @binding(0)")
    ]);
    expect(native.device.pipelines[0]).toMatchObject({
      label: "native-webgpu-pipeline",
      vertex: {
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 12,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }]
        }]
      },
      fragment: {
        entryPoint: "fs_main",
        targets: [{ format: "rgba8unorm" }]
      }
    });
    expect(native.device.renderPasses).toEqual([
      expect.objectContaining({
        label: "native-triangle-pass",
        pipeline: "native-webgpu-pipeline",
        vertexBuffers: [0],
        depthStencilAttachment: true,
        drawCalls: [{ kind: "draw", count: 3 }]
      })
    ]);
    expect(native.device.bindGroups).toHaveLength(1);
    expect(native.device.uniformWrites[0]?.slice(0, 16)).toEqual(translationMatrix(0.25, 0, 0));
    expect(native.device.uniformWrites[0]?.slice(16, 20).map(round3)).toEqual([0.35, 0.45, 0.55, 1]);
    expect(native.device.submissions.length).toBeGreaterThanOrEqual(1);
    device.dispose();
  });

  it("propagates imported texture sampler quality into native WebGPU sampled-texture bindings", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0, 0, 0,
      0.5, -0.5, 0, 1, 0,
      0, 0.5, 0, 0.5, 1
    ]);
    const vertexFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 12 }
    ], 20);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-textured",
      marker: "@galileo3d-shader:native-webgpu-textured",
      vertex: "// @galileo3d-shader:native-webgpu-textured\nlayout(location = 0) in vec3 position;\nlayout(location = 2) in vec2 uv;",
      fragment: "// @galileo3d-shader:native-webgpu-textured\nuniform sampler2D u_baseColorTexture;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-textured-target" });
    const texture = new Texture({ width: 2, height: 2, colorSpace: "srgb", data: new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255
    ]) });
    const sampler = new Sampler({
      minFilter: "linear-mipmap-linear",
      magFilter: "linear",
      addressU: "repeat",
      addressV: "mirror-repeat",
      maxAnisotropy: 8
    });

    expect(device.info.capabilities).toContain("native-sampled-textures");

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-textured-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_modelViewProjection", translationMatrix(0, 0, 0)],
        ["u_color", [1, 1, 1, 1]],
        ["u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture, sampler, expectedColorSpace: "srgb" })]
      ])
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.textureWrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ format: "rgba8unorm-srgb", bytesPerRow: 8 })
    ]));
    expect(native.device.samplerDescriptors).toEqual(expect.arrayContaining([
      {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "mirror-repeat",
        maxAnisotropy: 8
      }
    ]));
    expect(native.device.bindGroups[0]).toMatchObject({
      label: "native-textured-triangle-draw-bind-group",
      entries: [{ binding: 0 }, { binding: 1 }, { binding: 2 }]
    });
    device.dispose();
    texture.dispose();
  });

  it("generates native WebGPU PBR WGSL with split-sum HDR IBL and filmic output", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const library = createDefaultShaderLibrary();
    const shader = device.createShaderProgram(library.compileSource(DEFAULT_PBR_SHADER_NAME));
    const vertices = new Float32Array([
      -0.5, -0.5, 0, 0, 0, 1,
      0.5, -0.5, 0, 0, 0, 1,
      0, 0.5, 0, 0, 0, 1
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-pbr-wgsl-target", format: "rgba16f" });

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.draw({
      label: "native-pbr-wgsl-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3N3,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_modelViewProjection", translationMatrix(0, 0, 0)],
        ["u_baseColor", [0.8, 0.55, 0.25, 1]],
        ["u_metallic", 0.35],
        ["u_roughness", 0.28],
        ["u_environmentIntensity", 0.45],
        ["u_environmentMapTextureIntensity", 0.85],
        ["u_environmentMapTextureSpecularIntensity", 0.72],
        ["u_environmentMapTextureMipCount", 9]
      ])
    });
    device.endFrame();

    const fragmentSource = native.device.shaderModules.find((module) => module.label === `${DEFAULT_PBR_SHADER_NAME}-fragment`)?.code ?? "";
    expect(fragmentSource).toContain("fn fresnelSchlickRoughness");
    expect(fragmentSource).toContain("fn ggxVisibilitySmithCorrelated");
    expect(fragmentSource).toContain("fn diffuseBurley");
    expect(fragmentSource).toContain("fn encodePbrOutput");
    expect(fragmentSource).toContain("@group(0) @binding(10) var u_normalTexture: texture_2d<f32>;");
    expect(fragmentSource).toContain("@group(0) @binding(12) var u_metallicRoughnessTexture: texture_2d<f32>;");
    expect(fragmentSource).toContain("@group(0) @binding(14) var u_occlusionTexture: texture_2d<f32>;");
    expect(fragmentSource).toContain("fn perturbNormal");
    expect(fragmentSource).toContain("textureSample(u_metallicRoughnessTexture, u_metallicRoughnessSampler, uv)");
    expect(fragmentSource).toContain("textureSample(u_occlusionTexture, u_occlusionSampler, uv)");
    expect(fragmentSource).toContain("textureSampleLevel(u_environmentTexture, u_environmentSampler, diffuseUv, max(environmentMipCount - 1.0, 0.0))");
    expect(fragmentSource).toContain("specularEnv * (f0 * brdf.x + vec3<f32>(brdf.y, brdf.y, brdf.y))");
    expect(fragmentSource).toContain("environmentDiffuse = (vec3<f32>(1.0, 1.0, 1.0) - environmentFresnel) * (1.0 - metallic) * diffuseEnv * baseColor * u_draw.params.w * occlusion");
    expect(fragmentSource).not.toContain("textureSampleLevel(u_environmentTexture, u_environmentSampler, diffuseUv, 6.0)");
    expect(fragmentSource).not.toContain("pow(clamp(linearColor");
    expect(native.device.uniformWrites[0]?.[30]).toBe(9);
    expect(native.device.uniformWrites[0]?.[31]).toBeCloseTo(0.72, 5);
    expect(native.device.uniformWrites[0]?.[128]).toBe(0);
    expect(native.device.uniformWrites[0]?.[129]).toBe(1);
    expect(native.device.uniformWrites[0]?.[130]).toBe(1);
    expect((native.device.bindGroups[0] as { entries: Array<{ binding: number }> }).entries.map((entry) => entry.binding)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(device.getDiagnostics().nativePbrSubmissions).toBe(1);
    device.dispose();
  });

  it("preserves half-float HDR sampled textures in native WebGPU bindings", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0, 0, 0,
      0.5, -0.5, 0, 1, 0,
      0, 0.5, 0, 0.5, 1
    ]);
    const vertexFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 12 }
    ], 20);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-hdr-textured",
      marker: "@galileo3d-shader:native-webgpu-hdr-textured",
      vertex: "// @galileo3d-shader:native-webgpu-hdr-textured\nlayout(location = 0) in vec3 position;\nlayout(location = 2) in vec2 uv;",
      fragment: "// @galileo3d-shader:native-webgpu-hdr-textured\nuniform sampler2D u_baseColorTexture;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-hdr-textured-target", format: "rgba16f" });
    const hdrTexture = new Texture({
      width: 2,
      height: 2,
      format: "rgba16f",
      colorSpace: "linear",
      mipLevels: [
        {
          width: 2,
          height: 2,
          data: new Uint16Array([
            0x3c00, 0x3800, 0x3400, 0x3c00,
            0x4200, 0x3c00, 0x3800, 0x3c00,
            0x4800, 0x4200, 0x3c00, 0x3c00,
            0x4c00, 0x4800, 0x4200, 0x3c00
          ])
        },
        {
          width: 1,
          height: 1,
          data: new Uint16Array([0x4400, 0x4000, 0x3c00, 0x3c00])
        }
      ]
    });

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-hdr-textured-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat,
      vertexCount: 3,
      shader,
      uniforms: new Map<string, UniformValue>([
        ["u_modelViewProjection", translationMatrix(0, 0, 0)],
        ["u_color", [1, 1, 1, 1]],
        ["u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture: hdrTexture, expectedColorSpace: "linear" })]
      ])
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.textureDescriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "texture", format: "rgba16float", mipLevelCount: 2 })
    ]));
    expect(native.device.textureWrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ format: "rgba16float", mipLevel: 0, bytesPerRow: 16 }),
      expect.objectContaining({ format: "rgba16float", mipLevel: 1, bytesPerRow: 8 })
    ]));
    expect(native.device.pipelines[0]).toMatchObject({
      fragment: {
        targets: [{ format: "rgba16float" }]
      }
    });
    device.dispose();
    hdrTexture.dispose();
  });

  it("creates native WebGPU depth targets and binds depth state for offscreen render passes", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-depth",
      marker: "@galileo3d-shader:native-webgpu-depth",
      vertex: "// @galileo3d-shader:native-webgpu-depth\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-depth\nuniform vec4 color;"
    });
    const depthTarget = device.createRenderTarget({ width: 8, height: 8, label: "native-depth-target" });
    const colorOnlyTarget = device.createRenderTarget({ width: 8, height: 8, label: "native-color-only-target", depth: false });

    expect(device.info.capabilities).toContain("depth-render-targets");

    device.setRenderTarget(depthTarget);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-depth-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "back", blend: false }
    });
    device.endFrame();

    device.setRenderTarget(colorOnlyTarget);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-color-only-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader,
      renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "back", blend: false }
    });
    device.endFrame();

    expect(native.device.textureDescriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "native-depth-target", format: "rgba8unorm" }),
      expect.objectContaining({ label: "native-depth-target-depth", format: "depth24plus" }),
      expect.objectContaining({ label: "native-color-only-target", format: "rgba8unorm" })
    ]));
    expect(native.device.textureDescriptors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "native-color-only-target-depth" })
    ]));
    expect(native.device.pipelines[0]).toMatchObject({
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less-equal"
      }
    });
    expect(native.device.pipelines[1]).not.toHaveProperty("depthStencil");
    expect(native.device.renderPasses[0]).toMatchObject({
      label: "native-depth-triangle-pass",
      depthStencilAttachment: true
    });
    expect(native.device.renderPasses[1]).toMatchObject({
      label: "native-color-only-triangle-pass",
      depthStencilAttachment: false
    });

    device.dispose();
  });

  it("tracks native WebGPU render-target clears per target instead of per frame", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-clear-tracking",
      marker: "@galileo3d-shader:native-webgpu-clear-tracking",
      vertex: "// @galileo3d-shader:native-webgpu-clear-tracking\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-clear-tracking\nuniform vec4 color;"
    });
    const first = device.createRenderTarget({ width: 8, height: 8, label: "native-clear-first" });
    const second = device.createRenderTarget({ width: 8, height: 8, label: "native-clear-second" });
    const draw = (label: string) => device.draw({
      label,
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });

    device.beginFrame(8, 8);
    device.setRenderTarget(first);
    device.clear([1, 0, 0, 1]);
    draw("first-clear");
    device.setRenderTarget(second);
    device.clear([0, 1, 0, 1]);
    draw("second-clear");
    device.setRenderTarget(first);
    draw("first-load");
    device.endFrame();

    expect(native.device.renderPasses.map((pass) => [pass.label, pass.colorLoadOp, pass.depthLoadOp])).toEqual([
      ["first-clear-pass", "clear", "clear"],
      ["second-clear-pass", "clear", "clear"],
      ["first-load-pass", "load", "load"]
    ]);
    device.dispose();
  });

  it("reads native WebGPU render targets through async texture-to-buffer copy when available", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-readback",
      marker: "@galileo3d-shader:native-webgpu-readback",
      vertex: "// @galileo3d-shader:native-webgpu-readback\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-readback\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-readback-target" });

    expect(device.info.capabilities).toContain("native-texture-readback");
    expect(device.readPixelsAsync).toBeTypeOf("function");

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-readback-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });
    device.endFrame();

    const pixels = await device.readPixelsAsync?.(1, 2, 2, 2);

    expect(Array.from(pixels ?? [])).toEqual([
      26, 204, 51, 255,
      26, 204, 51, 255,
      26, 204, 51, 255,
      26, 204, 51, 255
    ]);
    expect(native.device.textureCopies).toEqual([{
      origin: { x: 1, y: 2, z: 0 },
      size: { width: 2, height: 2, depthOrArrayLayers: 1 },
      bytesPerRow: 256,
      rowsPerImage: 2
    }]);
    device.dispose();
  });

  it("reports WebGPU HDR target capabilities and submits native rgba16f render passes", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-hdr",
      marker: "@galileo3d-shader:native-webgpu-hdr",
      vertex: "// @galileo3d-shader:native-webgpu-hdr\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-hdr\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-hdr-target", format: "rgba16f" });

    expect(device.info.capabilities).toEqual(expect.arrayContaining(["hdr-render-targets", "float-readback", "native-render-pipeline"]));
    expect(device.readFloatPixelsAsync).toBeTypeOf("function");

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([2.5, 0.5, 0.125, 1]);
    expect(Array.from(device.readFloatPixels(4, 4, 1, 1))).toEqual([2.5, 0.5, 0.125, 1]);
    await expect(device.readFloatPixelsAsync?.(4, 4, 1, 1)).resolves.toEqual(new Float32Array([2.5, 0.5, 0.125, 1]));
    device.draw({
      label: "native-hdr-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.pipelines[0]).toMatchObject({
      fragment: {
        targets: [{ format: "rgba16float" }]
      }
    });
    device.dispose();
  });

  it("submits native WebGPU indexed draws only when indexed pass APIs are present", async () => {
    const native = createNativeFakeWebGPU();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const indices = new Uint16Array([0, 1, 2]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const indexBuffer = device.createBuffer("index", indices.byteLength, indices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-indexed",
      marker: "@galileo3d-shader:native-webgpu-indexed",
      vertex: "// @galileo3d-shader:native-webgpu-indexed\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-indexed\nuniform vec4 color;"
    });
    const target = device.createRenderTarget({ width: 8, height: 8, label: "native-indexed-target" });

    device.setRenderTarget(target);
    device.beginFrame(8, 8);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-indexed-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      indexBuffer,
      indexType: "uint16",
      indexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.renderPasses[0]).toMatchObject({
      label: "native-indexed-triangle-pass",
      indexBuffers: [{ slot: 0, indexFormat: "uint16" }],
      drawCalls: [{ kind: "drawIndexed", count: 3, instances: 1 }]
    });
    device.dispose();

    const limitedNative = createNativeFakeWebGPU({ indexedPassApi: false });
    const limitedDevice = await createRenderDevice({ backend: "webgpu", webgpu: limitedNative.gpu });
    const limitedVertexBuffer = limitedDevice.createBuffer("vertex", vertices.byteLength, vertices);
    const limitedIndexBuffer = limitedDevice.createBuffer("index", indices.byteLength, indices);
    const limitedShader = limitedDevice.createShaderProgram({
      label: "native-webgpu-indexed-limited",
      marker: "@galileo3d-shader:native-webgpu-indexed-limited",
      vertex: "// @galileo3d-shader:native-webgpu-indexed-limited\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-indexed-limited\nuniform vec4 color;"
    });
    const limitedTarget = limitedDevice.createRenderTarget({ width: 8, height: 8, label: "native-indexed-limited-target" });

    limitedDevice.setRenderTarget(limitedTarget);
    limitedDevice.beginFrame(8, 8);
    limitedDevice.draw({
      label: "native-indexed-limited",
      topology: "triangles",
      vertexBuffer: limitedVertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      indexBuffer: limitedIndexBuffer,
      indexType: "uint16",
      indexCount: 3,
      shader: limitedShader
    });
    limitedDevice.endFrame();

    expect(limitedDevice.getDiagnostics().nativeSubmissions).toBe(0);
    expect(limitedDevice.getDiagnostics().lastError).toMatch(/indexed draw skipped/);
    expect(limitedNative.device.submissions).toEqual([]);
    limitedDevice.dispose();
  });

  it("configures a WebGPU canvas surface and submits native render passes to the current texture", async () => {
    const native = createNativeFakeWebGPU();
    const canvas = createFakeWebGPUCanvas();
    const device = await createRenderDevice({ backend: "webgpu", webgpu: native.gpu, canvas: canvas as unknown as OffscreenCanvas });
    const vertices = new Float32Array([
      -0.5, -0.5, 0,
      0.5, -0.5, 0,
      0, 0.5, 0
    ]);
    const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
    const shader = device.createShaderProgram({
      label: "native-webgpu-canvas",
      marker: "@galileo3d-shader:native-webgpu-canvas",
      vertex: "// @galileo3d-shader:native-webgpu-canvas\nin vec3 position;",
      fragment: "// @galileo3d-shader:native-webgpu-canvas\nuniform vec4 color;"
    });

    expect(device.info.capabilities).toEqual(expect.arrayContaining(["native-render-pipeline", "canvas-surface"]));
    expect(canvas.context.configurations).toHaveLength(1);
    expect(canvas.context.configurations[0]).toMatchObject({
      format: "bgra8unorm",
      alphaMode: "opaque"
    });

    device.beginFrame(16, 16);
    device.clear([0, 0, 0, 1]);
    device.draw({
      label: "native-canvas-triangle",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: VertexFormat.P3,
      vertexCount: 3,
      shader
    });
    device.endFrame();

    expect(device.captureState().get("renderTarget")).toBe(null);
    expect(device.captureState().get("canvasSubmissions")).toBe(1);
    expect(device.getDiagnostics().nativeSubmissions).toBe(1);
    expect(native.device.pipelines[0]).toMatchObject({
      fragment: {
        targets: [{ format: "bgra8unorm" }]
      }
    });
    expect(native.device.bindGroups[0]).toMatchObject({
      label: "native-canvas-triangle-draw-bind-group",
      entries: [{ binding: 0 }]
    });
    expect(canvas.context.currentTextureViews).toEqual([1]);
    expect(native.device.renderPasses).toEqual([
      expect.objectContaining({
        label: "native-canvas-triangle-pass",
        pipeline: "native-webgpu-canvas-pipeline",
        drawCalls: [{ kind: "draw", count: 3 }]
      })
    ]);

    device.dispose();
    expect(canvas.context.unconfigured).toBe(true);
  });

  it("validates WebGPU foreign and disposed resources", async () => {
    const first = await WebGPUDevice.create({ gpu: createFakeWebGPU() });
    const second = await WebGPUDevice.create({ gpu: createFakeWebGPU() });
    const firstBuffer = first.createBuffer("vertex", 4);
    const secondBuffer = second.createBuffer("vertex", 4);

    first.beginFrame(1, 1);
    expect(() => first.draw({ topology: "triangles", vertexBuffer: secondBuffer, vertexCount: 3 })).toThrow(/not created by this WebGPU device/);
    first.endFrame();

    firstBuffer.dispose();
    first.beginFrame(1, 1);
    expect(() => first.draw({ topology: "triangles", vertexBuffer: firstBuffer, vertexCount: 3 })).toThrow(/disposed/);
    first.endFrame();

    first.dispose();
    second.dispose();
  });

  it("binds animation skinning palettes into renderer draw uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const skeleton = new Skeleton([
      new Bone({ name: "root", parentIndex: -1, translation: [0, 0, 0] }),
      new Bone({ name: "child", parentIndex: 0, translation: [0.25, 0, 0] })
    ]);
    const skinning = buildSkinningPalette(skeleton);
    const geometry = createSkinnedTriangle();

    renderer.render([
      {
        geometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning,
        label: "skinned-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    expect(command?.uniforms?.get("u_jointCount")).toBe(2);
    expect(command?.uniforms?.get("u_jointMatrices")).toBeInstanceOf(Float32Array);
    expect(Array.from((command?.uniforms?.get("u_jointMatrices") as Float32Array).slice(16, 20))).toEqual([1, 0, 0, 0]);
    expect((command?.uniforms?.get("u_jointMatrices") as Float32Array)[28]).toBe(0.25);
    expect(command?.vertexFormat?.hasAttribute("joints")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("weights")).toBe(true);

    renderer.dispose();
    geometry.dispose();
  });

  it("uploads distinct skinning palettes for multiple skinned characters in one frame", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = createSkinnedTriangle();
    const firstSkinning = {
      jointCount: 2,
      matrices: new Float32Array([
        ...translationMatrix(0, 0, 0),
        ...translationMatrix(0.25, 0, 0)
      ])
    };
    const secondSkinning = {
      jointCount: 2,
      matrices: new Float32Array([
        ...translationMatrix(0, 0, 0),
        ...translationMatrix(0.75, 0, 0)
      ])
    };

    renderer.render([
      {
        geometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning: firstSkinning,
        label: "skinned-agent-a"
      },
      {
        geometry,
        material: new SkinnedUnlitMaterial({ color: [0.5, 0.8, 0.2, 1] }),
        skinning: secondSkinning,
        label: "skinned-agent-b"
      }
    ]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    expect(commands).toHaveLength(2);
    expect(commands[0]?.uniforms?.get("u_jointCount")).toBe(2);
    expect(commands[1]?.uniforms?.get("u_jointCount")).toBe(2);
    expect((commands[0]?.uniforms?.get("u_jointMatrices") as Float32Array)[28]).toBeCloseTo(0.25);
    expect((commands[1]?.uniforms?.get("u_jointMatrices") as Float32Array)[28]).toBeCloseTo(0.75);

    renderer.dispose();
    geometry.dispose();
  });

  it("applies morph target weights before renderer draw submission", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.litTriangle();

    renderer.render([
      {
        geometry,
        material: new UnlitMaterial(),
        morphTargets: [
          {
            positions: [[0, 0, 0], [0, 0, 1], [0, 0, 2]],
            normals: [[0, 0, 0], [0, 1, 0], [0, 2, 0]]
          }
        ],
        morphWeights: [0.5],
        label: "morphed-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const floats = new Float32Array(buffer.bytes.buffer.slice(buffer.bytes.byteOffset, buffer.bytes.byteOffset + buffer.bytes.byteLength));
    expect(command?.label).toBe("morphed-triangle");
    expect(command?.vertexFormat?.hasAttribute("normal")).toBe(true);
    expect(Array.from(floats.slice(0, 18)).map((value) => Number(value.toFixed(3)))).toEqual([
      -0.5, -0.5, 0, 0, 0, 1,
      0.5, -0.5, 0.5, 0, 0.447, 0.894,
      0, 0.5, 1, 0, 0.707, 0.707
    ]);
    expect(buffer.disposed).toBe(true);

    renderer.dispose();
    geometry.dispose();
  });

  it("composes CPU morph deltas before GPU skinning palette submission", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = createSkinnedTriangle();
    const skinning = {
      jointCount: 2,
      matrices: new Float32Array([
        ...translationMatrix(0, 0, 0),
        ...translationMatrix(4, 0, 0)
      ])
    };

    renderer.render([
      {
        geometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning,
        morphTargets: [
          {
            positions: [[1, 0, 0], [1, 0, 0], [1, 0, 0]]
          }
        ],
        morphWeights: [0.5],
        label: "morph-then-skin"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const floats = new Float32Array(buffer.bytes.buffer.slice(buffer.bytes.byteOffset, buffer.bytes.byteOffset + buffer.bytes.byteLength));
    expect(command?.label).toBe("morph-then-skin");
    expect(command?.uniforms?.get("u_jointCount")).toBe(2);
    expect(command?.uniforms?.get("u_jointMatrices")).toBeInstanceOf(Float32Array);
    expect(command?.vertexFormat?.hasAttribute("joints")).toBe(true);
    expect(command?.vertexFormat?.hasAttribute("weights")).toBe(true);
    expect(Array.from(floats.slice(0, 11)).map(round3)).toEqual([0.1, -0.4, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(buffer.disposed).toBe(true);

    renderer.dispose();
    geometry.dispose();
  });

  it("routes compatible blended morph render items through shader uniforms without CPU-deforming geometry", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();

    renderer.render([
      {
        geometry,
        material: new MorphUnlitMaterial({ color: [0.2, 0.4, 0.8, 1] }),
        morphTargets: [
          {
            positions: [[0, 0, 0], [0, 0.25, 0], [0, 0.5, 0]]
          },
          {
            positions: [[0.1, 0, 0], [0.2, 0, 0], [0.3, 0, 0]]
          }
        ],
        morphWeights: [0.75, 0.5],
        label: "gpu-morphed-triangle"
      }
    ]);

    const command = (renderer.device as MockRenderDevice).drawCommands[0];
    const buffer = command?.vertexBuffer as MockRenderBuffer;
    const packedMorph = command?.uniforms?.get("u_morphPositionDeltas") as Float32Array;
    const morphWeights = command?.uniforms?.get("u_morphWeights") as Float32Array;
    expect(command?.label).toBe("gpu-morphed-triangle");
    expect(command?.uniforms?.get("u_morphTargetCount")).toBe(2);
    expect(Array.from(morphWeights)).toEqual([0.75, 0.5, 0, 0]);
    expect(Array.from(packedMorph.slice(0, 12))).toEqual([
      0, 0, 0, 0,
      0, 0.25, 0, 0,
      0, 0.5, 0, 0
    ]);
    expect(Array.from(packedMorph.slice(64 * 4, 64 * 4 + 12))).toEqual([
      0.10000000149011612, 0, 0, 0,
      0.20000000298023224, 0, 0, 0,
      0.30000001192092896, 0, 0, 0
    ]);
    expect(buffer).toBe(geometry.vertexBuffer.uploadedBuffer);
    expect(buffer.disposed).toBe(false);

    renderer.dispose();
    geometry.dispose();
  });

  it("stress-binds non-toy skinning palettes and maximum GPU morph target uniforms", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const skinnedGeometry = createSkinnedStrip(24);
    const morphGeometry = createMorphStressGeometry(32);
    const bones = Array.from({ length: 12 }, (_, index) =>
      new Bone({ name: `joint-${index}`, parentIndex: index === 0 ? -1 : index - 1, translation: [index * 0.01, 0, 0] })
    );
    const skinning = buildSkinningPalette(new Skeleton(bones));
    const morphTargets = Array.from({ length: 4 }, (_, targetIndex) => ({
      positions: Array.from({ length: 32 }, (_, vertexIndex) => [0, targetIndex * 0.01, vertexIndex * 0.001] as const)
    }));

    renderer.render([
      {
        geometry: skinnedGeometry,
        material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
        skinning,
        label: "skinned-strip-24-verts-12-joints"
      },
      {
        geometry: morphGeometry,
        material: new MorphUnlitMaterial({ color: [0.2, 0.4, 0.8, 1] }),
        morphTargets,
        morphWeights: [0.1, 0.2, 0.3, 0.4],
        label: "gpu-morphed-strip-32-verts-4-targets"
      }
    ]);

    const commands = (renderer.device as MockRenderDevice).drawCommands;
    const skinCommand = commands.find((command) => command.label === "skinned-strip-24-verts-12-joints");
    const morphCommand = commands.find((command) => command.label === "gpu-morphed-strip-32-verts-4-targets");
    expect(skinCommand?.uniforms?.get("u_jointCount")).toBe(12);
    expect((skinCommand?.uniforms?.get("u_jointMatrices") as Float32Array).length).toBe(12 * 16);
    expect(skinCommand?.vertexCount).toBe(24);
    expect(morphCommand?.uniforms?.get("u_morphTargetCount")).toBe(4);
    expect(Array.from(morphCommand?.uniforms?.get("u_morphWeights") as Float32Array).map(round3)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect((morphCommand?.uniforms?.get("u_morphPositionDeltas") as Float32Array).length).toBe(4 * 64 * 4);
    expect(morphCommand?.vertexCount).toBe(32);

    renderer.dispose();
    skinnedGeometry.dispose();
    morphGeometry.dispose();
  });

  it("rejects skinning data on materials without the renderer skinning shader contract", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = createSkinnedTriangle();

    expect(() =>
      renderer.render([
        {
          geometry,
          material: new UnlitMaterial(),
          skinning: { jointCount: 1, matrices: new Float32Array(16) },
          label: "bad-skinned-triangle"
        }
      ])
    ).toThrow(/joint palette uniforms/);

    renderer.dispose();
    geometry.dispose();
  });

  it("rejects skinned geometry without joint and weight attributes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const geometry = Geometry.triangle();
    const skinning = {
      jointCount: 2,
      matrices: new Float32Array(2 * 16)
    };

    expect(() =>
      renderer.render([
        {
          geometry,
          material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
          skinning,
          label: "missing-skin-attributes"
        }
      ])
    ).toThrow(/joints and weights attributes/);

    renderer.dispose();
    geometry.dispose();
  });

  it("rejects unnormalized or out-of-palette skinning vertex influences before GPU submission", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 4, height: 4 });
    const unnormalized = createSkinnedTriangle();
    const outOfRange = createSkinnedTriangle();
    const skinning = {
      jointCount: 2,
      matrices: new Float32Array(2 * 16)
    };

    unnormalized.vertexBuffer.setAttribute(0, "weights", [0.7, 0.7, 0, 0]);
    outOfRange.vertexBuffer.setAttribute(0, "joints", [2, 0, 0, 0]);

    expect(() =>
      renderer.render([
        {
          geometry: unnormalized,
          material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
          skinning,
          label: "unnormalized-skin-weights"
        }
      ])
    ).toThrow(/weights must be normalized/);

    expect(() =>
      renderer.render([
        {
          geometry: outOfRange,
          material: new SkinnedUnlitMaterial({ color: [0.2, 0.8, 0.5, 1] }),
          skinning,
          label: "out-of-range-skin-joint"
        }
      ])
    ).toThrow(/within the uploaded skinning palette/);

    renderer.dispose();
    unnormalized.dispose();
    outOfRange.dispose();
  });
});

function createSkinnedTriangle(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, 3);
  vertices.setAttribute(0, "position", [-0.4, -0.4, 0]);
  vertices.setAttribute(1, "position", [0.4, -0.4, 0]);
  vertices.setAttribute(2, "position", [0, 0.4, 0]);
  for (let index = 0; index < 3; index += 1) {
    vertices.setAttribute(index, "joints", [1, 0, 0, 0]);
    vertices.setAttribute(index, "weights", [1, 0, 0, 0]);
  }
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function createSkinnedStrip(vertexCount: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3J4W4, vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const x = -0.9 + (index / Math.max(1, vertexCount - 1)) * 1.8;
    vertices.setAttribute(index, "position", [x, index % 2 === 0 ? -0.25 : 0.25, 0]);
    vertices.setAttribute(index, "joints", [index % 12, (index + 1) % 12, 0, 0]);
    vertices.setAttribute(index, "weights", [0.75, 0.25, 0, 0]);
  }
  const indices = Array.from({ length: vertexCount }, (_, index) => index);
  return new Geometry(vertices, new IndexBuffer(indices, vertexCount), "points");
}

function createMorphStressGeometry(vertexCount: number): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, vertexCount);
  for (let index = 0; index < vertexCount; index += 1) {
    const x = -0.9 + (index / Math.max(1, vertexCount - 1)) * 1.8;
    vertices.setAttribute(index, "position", [x, Math.sin(index) * 0.1, 0]);
  }
  const indices = Array.from({ length: vertexCount }, (_, index) => index);
  return new Geometry(vertices, new IndexBuffer(indices, vertexCount), "points");
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}

function scaleMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ];
}

function createRgbaTexture(width: number, height: number, rgba: readonly [number, number, number, number]): Texture {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set(rgba, offset);
  }
  return new Texture({
    width,
    height,
    data,
    format: "rgba8",
    colorSpace: "srgb",
    label: "unit-rgba-texture"
  });
}

function createRgbaCubeTexture(size: number): Texture {
  const faces = (["px", "nx", "py", "ny", "pz", "nz"] as const).map((face, index) => {
    const data = new Uint8Array(size * size * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
      data.set([30 + index * 20, 60 + index * 10, 120 + index * 8, 255], offset);
    }
    return {
      face,
      mipLevels: [{ width: size, height: size, data }]
    };
  });
  return new Texture({
    width: size,
    height: size,
    dimension: "cube",
    format: "rgba8",
    colorSpace: "srgb",
    label: "unit-cubemap-texture",
    cubeFaces: faces
  });
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function createFakeWebGPU(): WebGPULike {
  const device = createFakeWebGPUDevice();
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "unit-webgpu-adapter",
        info: { vendor: "galileo3d-test" },
        async requestDevice() {
          return device;
        }
      };
    }
  };
}

function createAdapterlessWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike | null> {
      return null;
    }
  };
}

function createRejectingWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "rejecting-webgpu-adapter",
        async requestDevice(): Promise<WebGPUDeviceLike> {
          throw new Error("device denied");
        }
      };
    }
  };
}

function createMalformedWebGPU(): WebGPULike {
  return {
    async requestAdapter(): Promise<WebGPUAdapterLike> {
      return {
        name: "malformed-webgpu-adapter",
        async requestDevice(): Promise<WebGPUDeviceLike> {
          return {
            queue: {},
            createBuffer() {
              return { destroy() {} };
            }
          } as unknown as WebGPUDeviceLike;
        }
      };
    }
  };
}

function createFakeWebGPUDevice(): WebGPUDeviceLike {
  return {
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
      },
      submit() {}
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        destroy() {
          this.data = new Uint8Array(0);
        }
      };
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      return { label: descriptor.label, code: descriptor.code };
    },
    destroy() {}
  };
}

function createNativeFakeWebGPU(options: { readonly indexedPassApi?: boolean } = {}): { gpu: WebGPULike; device: ReturnType<typeof createNativeFakeWebGPUDevice> } {
  const device = createNativeFakeWebGPUDevice(options);
  return {
    device,
    gpu: {
      async requestAdapter(): Promise<WebGPUAdapterLike> {
        return {
          name: "native-unit-webgpu-adapter",
          info: { vendor: "galileo3d-native-test" },
          async requestDevice() {
            return device;
          }
        };
      }
    }
  };
}

function createNativeFakeWebGPUDevice(options: { readonly indexedPassApi?: boolean } = {}): WebGPUDeviceLike & {
  renderPasses: Array<{
    label?: string;
    pipeline?: string;
    depthStencilAttachment: boolean;
    colorLoadOp: "clear" | "load";
    depthLoadOp?: "clear" | "load";
    vertexBuffers: number[];
    indexBuffers: Array<{ slot: number; indexFormat: "uint16" | "uint32" }>;
    bindGroups: number[];
    drawCalls: Array<{ kind: string; count: number; instances?: number }>;
  }>;
  shaderModules: Array<{ readonly label?: string; readonly code: string }>;
  pipelines: unknown[];
  textureDescriptors: unknown[];
  samplerDescriptors: WebGPUSamplerDescriptorLike[];
  bindGroups: unknown[];
  uniformWrites: number[][];
  textureCopies: Array<{
    origin: { x: number; y: number; z: number };
    size: { width: number; height: number; depthOrArrayLayers: number };
    bytesPerRow: number;
    rowsPerImage: number | undefined;
  }>;
  textureWrites: Array<{
    format?: string;
    mipLevel: number;
    bytesPerRow: number | undefined;
    rowsPerImage: number | undefined;
    size: { width: number; height: number; depthOrArrayLayers: number };
  }>;
  submissions: unknown[];
} {
  let nextTextureId = 1;
  const indexedPassApi = options.indexedPassApi ?? true;
  const renderPasses: Array<{
    label?: string;
    pipeline?: string;
    depthStencilAttachment: boolean;
    colorLoadOp: "clear" | "load";
    depthLoadOp?: "clear" | "load";
    vertexBuffers: number[];
    indexBuffers: Array<{ slot: number; indexFormat: "uint16" | "uint32" }>;
    bindGroups: number[];
    drawCalls: Array<{ kind: string; count: number; instances?: number }>;
  }> = [];
  const shaderModules: Array<{ readonly label?: string; readonly code: string }> = [];
  const pipelines: unknown[] = [];
  const textureDescriptors: unknown[] = [];
  const samplerDescriptors: WebGPUSamplerDescriptorLike[] = [];
  const bindGroups: unknown[] = [];
  const uniformWrites: number[][] = [];
  const textureCopies: Array<{
    origin: { x: number; y: number; z: number };
    size: { width: number; height: number; depthOrArrayLayers: number };
    bytesPerRow: number;
    rowsPerImage: number | undefined;
  }> = [];
  const textureWrites: Array<{
    format?: string;
    mipLevel: number;
    bytesPerRow: number | undefined;
    rowsPerImage: number | undefined;
    size: { width: number; height: number; depthOrArrayLayers: number };
  }> = [];
  const submissions: unknown[] = [];
  return {
    renderPasses,
    shaderModules,
    pipelines,
    textureDescriptors,
    samplerDescriptors,
    bindGroups,
    uniformWrites,
    textureCopies,
    textureWrites,
    submissions,
    queue: {
      writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const target = buffer as FakeWebGPUBuffer;
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(source, offset);
        if (target.usage === "uniform") {
          uniformWrites.push(Array.from(new Float32Array(source.buffer, source.byteOffset, source.byteLength / 4)));
        }
      },
      writeTexture(destination, _data, layout, size) {
        const normalizedSize = Array.isArray(size)
          ? { width: size[0] ?? 0, height: size[1] ?? 0, depthOrArrayLayers: size[2] ?? 1 }
          : {
              width: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).width,
              height: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).height,
              depthOrArrayLayers: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).depthOrArrayLayers ?? 1
            };
        textureWrites.push({
          format: (destination.texture as { readonly format?: string }).format,
          mipLevel: destination.mipLevel ?? 0,
          bytesPerRow: layout.bytesPerRow,
          rowsPerImage: layout.rowsPerImage,
          size: normalizedSize
        });
      },
      submit(commands: readonly unknown[]) {
        submissions.push(...commands);
      }
    },
    createBuffer(descriptor: WebGPUBufferDescriptorLike): FakeWebGPUBuffer {
      return {
        data: new Uint8Array(descriptor.size),
        usage: descriptor.usage & 0x0040 ? "uniform" : "buffer",
        async mapAsync() {},
        getMappedRange() {
          return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength);
        },
        unmap() {},
        destroy() {
          this.data = new Uint8Array(0);
        }
      } as FakeWebGPUBuffer;
    },
    createShaderModule(descriptor: { readonly label?: string; readonly code: string }) {
      const module = { label: descriptor.label, code: descriptor.code };
      shaderModules.push(module);
      return module;
    },
    createRenderPipeline(descriptor) {
      pipelines.push(descriptor);
      return {
        label: descriptor.label,
        getBindGroupLayout(index: number) {
          return { index, pipeline: descriptor.label };
        }
      };
    },
    createBindGroup(descriptor) {
      const bindGroup = {
        label: descriptor.label,
        layout: descriptor.layout,
        entries: descriptor.entries
      };
      bindGroups.push(bindGroup);
      return bindGroup;
    },
    createTexture(descriptor) {
      textureDescriptors.push(descriptor);
      const id = nextTextureId++;
      return {
        label: descriptor.label,
        format: descriptor.format,
        createView() {
          return { id };
        },
        destroy() {}
      };
    },
    createSampler(descriptor?: WebGPUSamplerDescriptorLike) {
      const samplerDescriptor = descriptor ?? {};
      samplerDescriptors.push(samplerDescriptor);
      return { descriptor: samplerDescriptor };
    },
    createCommandEncoder(descriptor?: { readonly label?: string }) {
      const command = { label: descriptor?.label, passes: [] as unknown[] };
      return {
        copyTextureToBuffer(source, destination, size) {
          const origin = {
            x: source.origin?.x ?? 0,
            y: source.origin?.y ?? 0,
            z: source.origin?.z ?? 0
          };
          const normalizedSize = Array.isArray(size)
            ? { width: size[0] ?? 0, height: size[1] ?? 0, depthOrArrayLayers: size[2] ?? 1 }
            : {
                width: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).width,
                height: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).height,
                depthOrArrayLayers: (size as { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number }).depthOrArrayLayers ?? 1
              };
          textureCopies.push({
            origin,
            size: normalizedSize,
            bytesPerRow: destination.bytesPerRow,
            rowsPerImage: destination.rowsPerImage
          });
          const target = destination.buffer as FakeWebGPUBuffer;
          for (let row = 0; row < normalizedSize.height; row += 1) {
            for (let column = 0; column < normalizedSize.width; column += 1) {
              const format = (source.texture as { readonly format?: string }).format;
              const bytesPerPixel = format === "rgba32float" ? 16 : format === "rgba16float" ? 8 : 4;
              const offset = row * destination.bytesPerRow + column * bytesPerPixel;
              if (format === "rgba32float") {
                new Float32Array(target.data.buffer, target.data.byteOffset + offset, 4).set([2.5, 0.5, 0.125, 1]);
              } else if (format === "rgba16float") {
                const view = new DataView(target.data.buffer, target.data.byteOffset + offset, 8);
                view.setUint16(0, numberToHalfFloat(2.5), true);
                view.setUint16(2, numberToHalfFloat(0.5), true);
                view.setUint16(4, numberToHalfFloat(0.125), true);
                view.setUint16(6, numberToHalfFloat(1), true);
              } else {
                target.data.set([26, 204, 51, 255], offset);
              }
            }
          }
        },
        beginRenderPass(renderPassDescriptor) {
          const pass = {
            label: renderPassDescriptor.label,
            depthStencilAttachment: renderPassDescriptor.depthStencilAttachment !== undefined,
            colorLoadOp: renderPassDescriptor.colorAttachments[0]?.loadOp ?? "load",
            depthLoadOp: renderPassDescriptor.depthStencilAttachment?.depthLoadOp,
            vertexBuffers: [] as number[],
            indexBuffers: [] as Array<{ slot: number; indexFormat: "uint16" | "uint32" }>,
            drawCalls: [] as Array<{ kind: string; count: number; instances?: number }>,
            pipeline: undefined as string | undefined,
            bindGroups: [] as number[]
          };
          renderPasses.push(pass);
          const encoder = {
            setPipeline(pipeline: unknown) {
              pass.pipeline = (pipeline as { readonly label?: string }).label;
            },
            setVertexBuffer(slot: number) {
              pass.vertexBuffers.push(slot);
            },
            setBindGroup(index: number) {
              pass.bindGroups.push(index);
            },
            draw(count: number, instances?: number) {
              pass.drawCalls.push({ kind: "draw", count, ...(instances === undefined || instances === 1 ? {} : { instances }) });
            },
            end() {}
          };
          return indexedPassApi
            ? {
                ...encoder,
                setIndexBuffer(_buffer: WebGPUBufferLike, indexFormat: "uint16" | "uint32") {
                  pass.indexBuffers.push({ slot: 0, indexFormat });
                },
                drawIndexed(count: number, instances?: number) {
                  pass.drawCalls.push({ kind: "drawIndexed", count, ...(instances === undefined ? {} : { instances }) });
                }
              }
            : encoder;
        },
        finish() {
          return command;
        }
      };
    },
    destroy() {}
  };
}

function numberToHalfFloat(value: number): number {
  if (Number.isNaN(value)) return 0x7e00;
  if (value === Infinity) return 0x7c00;
  if (value === -Infinity) return 0xfc00;
  const sign = value < 0 ? 0x8000 : 0;
  const absolute = Math.abs(value);
  if (absolute === 0) return sign;
  if (absolute >= 65504) return sign | 0x7bff;
  if (absolute < 2 ** -14) {
    return sign | Math.round(absolute / 2 ** -24);
  }
  const exponent = Math.floor(Math.log2(absolute));
  const mantissa = Math.round((absolute / 2 ** exponent - 1) * 1024);
  return sign | ((exponent + 15) << 10) | (mantissa & 0x03ff);
}

function createFakeWebGPUCanvas(): {
  context: {
    configurations: unknown[];
    currentTextureViews: number[];
    unconfigured: boolean;
  };
  getContext(type: string): unknown;
} {
  const currentTextureViews: number[] = [];
  const context = {
    configurations: [] as unknown[],
    currentTextureViews,
    unconfigured: false,
    configure(configuration: unknown) {
      this.configurations.push(configuration);
    },
    getCurrentTexture() {
      return {
        createView() {
          const id = currentTextureViews.length + 1;
          currentTextureViews.push(id);
          return { id };
        },
        destroy() {}
      };
    },
    unconfigure() {
      this.unconfigured = true;
    }
  };
  return {
    context,
    getContext(type: string) {
      return type === "webgpu" ? context : null;
    }
  };
}
