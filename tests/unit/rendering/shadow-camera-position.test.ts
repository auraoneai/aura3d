import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, PerspectiveCamera, PointLight } from "@aura3d/scene";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { shaderGraph } from "../../../packages/engine/src/agent-api/nodes/shaderGraph";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { MockRenderDevice, MockRenderTarget, type DrawCommand, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { ShadowMap } from "../../../packages/rendering/src/ShadowMap";
import { ShadowPass } from "../../../packages/rendering/src/ShadowPass";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { FrameCamera } from "../../../packages/rendering/src/contracts/frameGraph";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { setRendererQrFlags, withRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { RendererShadowOrchestrator } from "../../../packages/rendering/src/renderer/ShadowOrchestration";
import { executePrd02BridgedShadowMap, PRD02_SHADOW_LOOKUP_UNIFORM } from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { createPrd02ShadowsContributor } from "../../../packages/rendering/src/shadows/Prd02ShadowsContributor";
import { Prd02ShadowSystem } from "../../../packages/rendering/src/shadows/ShadowSystem";

const EYE = [7, -3, 11] as const;
const SECOND_EYE = [-4, 2, 9] as const;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FLAGS_OFF = resolveQrFlags({ options: ["none"] });
const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

function useWebGPUShape(device: MockRenderDevice): void {
  Object.defineProperty(device, "kind", { value: "webgpu" });
  Object.defineProperty(device, "drawChecked", { value: (command: DrawCommand) => device.draw(command), configurable: true });
}

function caster() {
  const graph: ShaderGraphDocument = {
    version: 1,
    stage: "material",
    nodes: [
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "eye", op: "input", type: "vec3", name: "cameraPosition" },
      { id: "time", op: "input", type: "f32", name: "time" },
      { id: "zero", op: "constant", type: "f32", value: 0 },
      { id: "timeOffset", op: "construct", type: "vec3", inputs: ["time", "zero", "zero"] },
      { id: "placed", op: "add", type: "vec3", inputs: ["position", "eye"] },
      { id: "displaced", op: "add", type: "vec3", inputs: ["placed", "timeOffset"] }
    ],
    outputs: { position: "displaced" }
  };
  const material = createCustomShaderMaterial(shaderGraph.material({ graph }).custom!);
  const geometry = Geometry.litCube(1);
  const item: RenderItem = { geometry, material, modelMatrix: IDENTITY, label: "camera-dependent", castShadow: true };
  return { material, geometry, item };
}

function expectEye(draws: readonly DrawCommand[], eye: readonly number[], clip = 0) {
  expect(draws.length).toBeGreaterThan(0);
  for (const draw of draws) {
    expect(draw.label).toContain(":custom-depth");
    expect(draw.uniforms?.get("u_cameraPosition")).toEqual(eye);
    expect(draw.uniforms?.get("u_a3dClipRange")).toBe(clip);
  }
}

function sceneCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera({ near: 0.1, far: 60, aspect: 1, fovYRadians: Math.PI / 3 });
  camera.transform.setPosition(1, 2, 5);
  camera.updateCameraMatrices();
  return camera;
}

describe("scene camera eye in shadow and outline depth passes", () => {
  it("forwards the eye and the light projection's own convention to a supplied shadow target", () => {
    const { item, material, geometry } = caster();
    const light = new DirectionalLight("sun");
    light.castsShadow = true;
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const target = device.createRenderTarget({ width: 16, height: 16, depth: "texture" });
    const lightVp = Float32Array.from([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1]);
    const depth = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 16 }), renderTarget: target, viewProjectionMatrix: lightVp, cameraPosition: EYE, timeSeconds: 12.5, depthConvention: depth });
    try {
      expect(pass.execute({ device, width: 16, height: 16 }).rendered).toBe(true);
      expectEye(device.drawCommands, EYE, 1);
      expect(device.drawCommands[0]!.uniforms!.get("u_time")).toBe(12.5);
      expect(Array.from(device.drawCommands[0]!.uniforms!.get("u_modelViewProjection") as Float32Array)).toEqual(Array.from(lightVp));
      expect(pass.getRenderTarget()).toBe(target);
      expect(() => pass.getForwardShadowMap({ lightMatrix: lightVp })).toThrow(/minus-one-to-one light projection/);
      pass.dispose();
      expect(target.disposed).toBe(false);
    } finally {
      target.dispose(); geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it.each(["reversed", "logarithmic"] as const)("rejects %s light depth before allocating or drawing a shadow", (mode) => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const depthConvention = negotiateDepthConvention({ mode }, { clipRange: "minus-one-to-one", reversed: true, logarithmic: true });
    const pass = new ShadowPass({ light, casters: [item], depthConvention });
    const allocate = vi.spyOn(device, "createRenderTarget");
    try {
      expect(() => pass.execute({ device, width: 8, height: 8 })).toThrow(/cannot rasterize/);
      expect(allocate).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects a zero-to-one light projection on WebGL-style shadow rasterization", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const depthConvention = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
    const pass = new ShadowPass({ light, casters: [item], depthConvention });
    try {
      expect(() => pass.execute({ device, width: 8, height: 8 })).toThrow(/cannot rasterize/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds the encoded color attachment for WebGPU while retaining a caller-supplied depth attachment", () => {
    const { item, material, geometry } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const target = device.createRenderTarget({ width: 16, height: 16, format: "rgba8", depth: "texture" });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 16 }), renderTarget: target, cameraPosition: EYE });
    try {
      const result = pass.execute({ device, width: 16, height: 16 });
      expect(result).toMatchObject({ rendered: true, shadowTextureKind: "encoded-color-depth", shadowTextureLabel: target.colorTexture.label });
      expectEye(device.drawCommands, EYE);
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })?.texture.texture).toBe(target.colorTexture);
      expect(target.depthTexture).toBeDefined();
      pass.dispose();
      expect(target.disposed).toBe(false);
    } finally { target.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("keeps a color attachment on WebGPU even when the lighting flag and depth-texture capability are set", () => {
    const { item, material, geometry } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    setRendererQrFlags(FLAGS_ON, device);
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 16 }), cameraPosition: EYE });
    try {
      const result = pass.execute({ device, width: 16, height: 16 });
      const target = pass.getRenderTarget()!;
      expect(target.depthOnly).not.toBe(true);
      expect(result.shadowTextureKind).toBe("encoded-color-depth");
      expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })?.texture.texture).toBe(target.colorTexture);
      expectEye(device.drawCommands, EYE);
    } finally { pass.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects a supplied WebGPU depth-only target instead of sampling its placeholder color texture", () => {
    const { item, material, geometry } = caster();
    const light = new DirectionalLight("sun"); light.castsShadow = true;
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const target = device.createRenderTarget({ width: 16, height: 16, depthOnly: true });
    const pass = new ShadowPass({ light, casters: [item], shadowMap: new ShadowMap({ size: 16 }), renderTarget: target });
    try {
      expect(() => pass.execute({ device, width: 16, height: 16 })).toThrow(/color attachment/i);
      expect(device.drawCommands).toHaveLength(0);
      expect(target.disposed).toBe(false);
    } finally { pass.dispose(); target.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each(["directional", "cascaded", "point"] as const)("uses the forward eye for every legacy %s shadow draw", async (kind) => {
    const { item, material, geometry } = caster();
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    setRendererQrFlags(FLAGS_OFF, renderer.device);
    const camera = sceneCamera();
    const light = kind === "point" ? new PointLight("point") : new DirectionalLight("sun");
    light.castsShadow = true;
    light.transform.setPosition(-8, 4, 2);
    if (light instanceof PointLight) light.range = 20;
    const shadow = { light, size: 8, ...(kind === "cascaded" ? { cascadeCount: 2 } : {}) };
    try {
      for (const eye of [EYE, SECOND_EYE]) {
        renderer.render({ renderItems: [item], cameraPosition: eye, shadow }, camera);
        const draws = (renderer.device as MockRenderDevice).drawCommands.filter((draw) => draw.label?.includes(":custom-depth"));
        expect(draws).toHaveLength(kind === "point" ? 6 : kind === "cascaded" ? 2 : 1);
        expectEye(draws, eye);
        const forward = (renderer.device as MockRenderDevice).drawCommands.find((draw) => draw.label === "camera-dependent");
        expect(typeof forward?.uniforms?.get("u_time")).toBe("number");
        expect(draws.every((draw) => draw.uniforms?.get("u_time") === forward?.uniforms?.get("u_time"))).toBe(true);
        const matrices = draws.map((draw) => Array.from(draw.uniforms!.get("u_modelViewProjection") as Float32Array));
        if (kind !== "directional") expect(new Set(matrices.map((matrix) => matrix.join(","))).size).toBeGreaterThan(1);
      }
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each(["sync", "async"] as const)("passes an explicit eye without a resolved scene projection in the %s renderer", async (mode) => {
    const { item, material, geometry } = caster();
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8 });
    setRendererQrFlags(FLAGS_OFF, renderer.device);
    const light = new DirectionalLight("sun");
    light.castsShadow = true;
    const source = { renderItems: [item], cameraPosition: EYE, cameraPolicy: "identity" as const, shadow: { light, size: 8 } };
    try {
      if (mode === "sync") renderer.render(source);
      else await renderer.renderAsync(source);
      const draws = (renderer.device as MockRenderDevice).drawCommands.filter((draw) => draw.label?.includes(":custom-depth"));
      expect(draws).toHaveLength(1);
      expectEye(draws, EYE);
      const forward = (renderer.device as MockRenderDevice).drawCommands.find((draw) => draw.label === "camera-dependent");
      expect(typeof forward?.uniforms?.get("u_time")).toBe("number");
      expect(draws[0]!.uniforms?.get("u_time")).toBe(forward?.uniforms?.get("u_time"));
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("assembles six WebGPU point-shadow faces in order without CPU readback", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    setRendererQrFlags(FLAGS_OFF, device);
    const sourceItem = { ...item, globalClipping: { planes: [[1, 0, 0, -1] as const], clipShadows: true } };
    const light = new PointLight("point");
    light.castsShadow = true;
    light.range = 20;
    light.transform.setPosition(-8, 4, 2);
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    const pipeline = new RendererShadowOrchestrator({ device, width: 8, height: 8, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const readPixels = vi.spyOn(device, "readPixels");
    const readDepth = vi.spyOn(device, "readDepthPixels");
    const writePixels = vi.spyOn(device, "writeRenderTargetPixels");
    const copy = vi.spyOn(device, "copyRenderTargetColorRegion");
    const draw = device.draw.bind(device);
    let face = 0;
    vi.spyOn(device, "draw").mockImplementation((command) => {
      draw(command);
      const target = device.getRenderTarget() as MockRenderTarget;
      // Mock draws do not rasterize: tag each encoded face with face and row
      // coordinates so the resulting atlas arrangement can be checked.
      for (let y = 0; y < target.height; y += 1) for (let x = 0; x < target.width; x += 1) {
        target.colorPixels.set([face + 1, y + 10, x + 20, 255], (y * target.width + x) * 4);
      }
      face += 1;
    });
    try {
      device.beginFrame(8, 8);
      const map = withRendererQrFlags(device, () => pipeline.executeRendererShadowMap({
        shadowOptions: { light, size: 4 }, source: {}, items: [sourceItem], lights: [],
        ownedTargets, ownedShadowPasses, cameraPosition: EYE, timeSeconds: 12.5
      }));
      expect(map?.pointLight?.texture.texture).toBe(ownedTargets[0]?.colorTexture);
      expect(ownedTargets).toHaveLength(1);
      expect(ownedShadowPasses).toHaveLength(6);
      expect(device.drawCommands).toHaveLength(6);
      expectEye(device.drawCommands, EYE);
      expect(device.drawCommands.every((command) => command.uniforms?.get("u_time") === 12.5)).toBe(true);
      expect(device.drawCommands.every((command) => command.uniforms?.get("u_a3dClipGroupCount") === 1)).toBe(true);
      expect(copy).toHaveBeenCalledTimes(6);
      for (let index = 0; index < 6; index += 1) {
        const [source, destination, region] = copy.mock.calls[index]!;
        expect(source.label).toContain(`face-${index}`);
        expect(destination).toBe(ownedTargets[0]);
        expect(region).toEqual({ sourceX: 0, sourceY: 0, destinationX: (index % 3) * 4, destinationY: Math.floor(index / 3) * 4, width: 4, height: 4 });
      }
      const atlas = ownedTargets[0] as MockRenderTarget;
      for (let index = 0; index < 6; index += 1) for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
        const atlasX = (index % 3) * 4 + x;
        const atlasY = Math.floor(index / 3) * 4 + y;
        const offset = (atlasY * atlas.width + atlasX) * 4;
        expect(Array.from(atlas.colorPixels.subarray(offset, offset + 4))).toEqual([index + 1, y + 10, x + 20, 255]);
      }
      expect(readPixels).not.toHaveBeenCalled();
      expect(readDepth).not.toHaveBeenCalled();
      expect(writePixels).not.toHaveBeenCalled();
      device.endFrame();
    } finally {
      for (const pass of ownedShadowPasses) pass.dispose();
      for (const target of ownedTargets) target.dispose();
      geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("retains ownership of point-shadow resources if a GPU atlas copy fails", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const light = new PointLight("point"); light.castsShadow = true; light.range = 20;
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: ShadowPass[] = [];
    const pipeline = new RendererShadowOrchestrator({ device, width: 8, height: 8, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const copyRegion = device.copyRenderTargetColorRegion.bind(device);
    let calls = 0;
    vi.spyOn(device, "copyRenderTargetColorRegion").mockImplementation((source, destination, region) => {
      calls += 1;
      if (calls === 4) throw new Error("copy failed");
      copyRegion(source, destination, region);
    });
    try {
      device.beginFrame(8, 8);
      expect(() => withRendererQrFlags(device, () => pipeline.executeRendererShadowMap({
        shadowOptions: { light, size: 4 }, source: {}, items: [item], lights: [],
        ownedTargets, ownedShadowPasses, cameraPosition: EYE
      }))).toThrow("copy failed");
      expect(calls).toBe(4);
      expect(device.getRenderTarget()).toBeNull();
      expect(ownedShadowPasses).toHaveLength(4);
      expect(ownedTargets).toHaveLength(1);
      const faces = ownedShadowPasses.map((pass) => pass.getRenderTarget()!);
      expect(faces.every((target) => !target.disposed)).toBe(true);
      device.endFrame();
      for (const pass of ownedShadowPasses) pass.dispose();
      for (const target of ownedTargets) target.dispose();
      expect(faces.every((target) => target.disposed)).toBe(true);
      expect(ownedTargets[0]!.disposed).toBe(true);
    } finally {
      for (const pass of ownedShadowPasses) pass.dispose();
      for (const target of ownedTargets) target.dispose();
      geometry.dispose(); material.dispose(); device.dispose();
    }
  });

  it("fails before allocation when WebGPU lacks an ordered point-shadow copy", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    Object.defineProperty(device, "copyRenderTargetColorRegion", { value: undefined });
    setRendererQrFlags(FLAGS_OFF, device);
    const light = new PointLight("point"); light.castsShadow = true; light.range = 20;
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: ShadowPass[] = [];
    const pipeline = new RendererShadowOrchestrator({ device, width: 8, height: 8, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null } as never);
    const allocate = vi.spyOn(device, "createRenderTarget");
    const readPixels = vi.spyOn(device, "readPixels");
    try {
      expect(() => withRendererQrFlags(device, () => pipeline.executeRendererShadowMap({
        shadowOptions: { light, size: 4 }, source: {}, items: [item], lights: [], ownedTargets, ownedShadowPasses
      }))).toThrow(/ordered GPU color-region copy/);
      expect(allocate).not.toHaveBeenCalled();
      expect(readPixels).not.toHaveBeenCalled();
      expect(ownedTargets).toHaveLength(0);
      expect(ownedShadowPasses).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("copies only the requested mock target region and rejects foreign or invalid targets", () => {
    const device = new MockRenderDevice();
    const other = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 3, format: "rgba8" }) as MockRenderTarget;
    const destination = device.createRenderTarget({ width: 4, height: 4, format: "rgba8" }) as MockRenderTarget;
    const foreign = other.createRenderTarget({ width: 3, height: 3, format: "rgba8" });
    const region = { sourceX: 1, sourceY: 1, destinationX: 0, destinationY: 2, width: 2, height: 2 };
    try {
      for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
        source.colorPixels.set([x, y, 42, 255], (y * 3 + x) * 4);
      }
      destination.colorPixels.fill(7);
      device.setRenderTarget(source);
      device.copyRenderTargetColorRegion(source, destination, region);
      expect(device.getRenderTarget()).toBe(source);
      for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
        const pixel = Array.from(destination.colorPixels.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4));
        expect(pixel).toEqual(x < 2 && y >= 2 ? [x + 1, y - 1, 42, 255] : [7, 7, 7, 7]);
      }
      expect(() => device.copyRenderTargetColorRegion(foreign, destination, region)).toThrow();
      expect(() => device.copyRenderTargetColorRegion(source, destination, { ...region, width: 3 })).toThrow();
      expect(() => device.copyRenderTargetColorRegion(source, source, region)).toThrow();
    } finally { source.dispose(); destination.dispose(); foreign.dispose(); device.dispose(); other.dispose(); }
  });

  it.each(["rgba16f", "rgba32f"] as const)("copies only the selected %s mock float pixels", (format) => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 3, format }) as MockRenderTarget;
    const destination = device.createRenderTarget({ width: 4, height: 4, format }) as MockRenderTarget;
    try {
      for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
        source.colorFloatPixels!.set([x + 0.25, y + 0.5, 2.75, 1], (y * 3 + x) * 4);
      }
      destination.colorFloatPixels!.fill(-9);
      device.setRenderTarget(source);
      device.copyRenderTargetColorRegion(source, destination, { sourceX: 1, sourceY: 1, destinationX: 0, destinationY: 2, width: 2, height: 2 });
      expect(device.getRenderTarget()).toBe(source);
      for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
        const pixel = Array.from(destination.colorFloatPixels!.subarray((y * 4 + x) * 4, (y * 4 + x + 1) * 4));
        expect(pixel).toEqual(x < 2 && y >= 2 ? [x + 1.25, y - 0.5, 2.75, 1] : [-9, -9, -9, -9]);
      }
    } finally { source.dispose(); destination.dispose(); device.dispose(); }
  });

  it("keeps generated cascade and atlas projections standard when the scene camera uses a different convention", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    const camera = new PerspectiveCamera({ near: 0.1, far: 60, depth: { mode: "reversed", clipRange: "zero-to-one" } });
    camera.transform.setPosition(...EYE);
    camera.updateCameraMatrices();
    const frameCamera: FrameCamera = {
      viewMatrix: Float32Array.from(camera.viewMatrix), projectionMatrix: Float32Array.from(camera.projectionMatrix),
      viewProjectionMatrix: Float32Array.from(camera.viewProjectionMatrix), previousViewProjectionMatrix: null,
      near: camera.near, far: camera.far, projection: "perspective", position: EYE,
      depth: negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: false })
    };
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const previous = device.createRenderTarget({ width: 4, height: 4, depth: true });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(previous);
      system.update({
        camera: frameCamera, sun: { direction: [0, -1, -0.2] }, casters: [item],
        localLights: [{ shadowIndex: 0, kind: "point", position: [-8, 4, 2], direction: [0, -1, 0], range: 20, size: 64 }],
        flags: FLAGS_ON, tier: QUALITY_TIERS.high, timeSeconds: 12.5
      });
      expect(device.getRenderTarget()).toBe(previous);
      expect(device.drawCommands).toHaveLength(8);
      expectEye(device.drawCommands, EYE);
      expect(device.drawCommands.every((command) => command.uniforms?.get("u_time") === 12.5)).toBe(true);
      expect(device.drawCommands.slice(0, 2).every((draw) => !draw.renderState?.scissor)).toBe(true);
      expect(device.drawCommands.slice(2).every((draw) => !!draw.renderState?.scissor)).toBe(true);
      expect(device.drawCommands.every((draw) => draw.renderState?.depthCompare === "less-equal" && !draw.renderState?.depthCompareV2)).toBe(true);
      device.endFrame();
    } finally { previous.dispose(); system.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([
    ["mock", false], ["mock", true], ["webgpu", false], ["webgpu", true]
  ] as const)("warms the CPU-morphed %s shadow variant (clipped: %s) used by the first draw", async (kind, clipped) => {
    const device = new MockRenderDevice();
    if (kind === "webgpu") useWebGPUShape(device);
    const compile = vi.spyOn(device, "createShaderProgram");
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial({ name: "morph-caster" });
    const item: RenderItem = {
      geometry, material, label: "morph-caster",
      morphTargets: [{ positions: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }], morphWeights: [0.5],
      ...(clipped ? { globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } } : {})
    };
    const camera = sceneCamera();
    const frame = { camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far }, casters: [item], flags: FLAGS_ON, tier: QUALITY_TIERS.high };
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 2, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    try {
      await system.precompile(frame);
      expect(compile).toHaveBeenCalledTimes(1);
      const warmed = compile.mock.results[0]!.value;
      device.beginFrame(8, 8);
      system.update({ ...frame, sun: { direction: [0, -1, -0.2] } });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands.every((draw) => draw.shader === warmed)).toBe(true);
      expect(compile).toHaveBeenCalledTimes(1);
      device.endFrame();
    } finally { system.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([
    ["webgl2", "none", false], ["webgl2", 0, false], ["webgl2", 1, true],
    ["webgpu", "none", false], ["webgpu", 0, false], ["webgpu", 1, true]
  ] as const)("warms the actual %s masked shadow program with map=%s and clipping=%s", async (backend, uvSet, clipped) => {
    const device = new MockRenderDevice();
    if (backend === "webgpu") useWebGPUShape(device);
    else Object.defineProperty(device, "kind", { value: "webgl2" });
    const flags = createTrustedQrFlags({ A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    setRendererQrFlags(flags, device);
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 12 },
      { semantic: "uv1", components: 2, offset: 20 },
      { semantic: "color", components: 4, offset: 28 }
    ], 44);
    const geometry = new Geometry(new VertexBuffer(format, 3));
    for (let index = 0; index < 3; index += 1) {
      geometry.vertexBuffer.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
      geometry.vertexBuffer.setAttribute(index, "color", [1, 1, 1, 0.7]);
    }
    const material = new UnlitMaterial({ alphaTest: 0.5, vertexColors: true });
    const instance = new MaterialInstance(material);
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]) });
    const binding = new TextureBinding({ name: "u_baseColorTexture", texture });
    if (uvSet !== "none") {
      instance.setOverride("u_baseColorTexture", binding);
      instance.setOverride("u_baseColorTextureTexCoord", uvSet);
    }
    const item: RenderItem = { geometry, material: instance, label: `alpha-uv${uvSet}`,
      morphTargets: [{ positions: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }], morphWeights: [0.5],
      ...(clipped ? { globalClipping: { planes: [[1, 0, 0, 0]], clipShadows: true } } : {}) };
    const camera = sceneCamera();
    const frame = { camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far },
      casters: [item], flags, tier: QUALITY_TIERS.high };
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 2, maxDistance: 50,
      splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const compile = vi.spyOn(device, "createShaderProgram");
    try {
      await system.precompile(frame);
      expect(compile).toHaveBeenCalledTimes(1);
      const warmed = compile.mock.results[0]!.value;
      expect(warmed.reflection.attributes.has("a_uv")).toBe(uvSet === 0);
      expect(warmed.reflection.attributes.has("a_uv1")).toBe(uvSet === 1);
      expect(warmed.reflection.attributes.has("a_color")).toBe(true);
      device.beginFrame(8, 8);
      system.update({ ...frame, sun: { direction: [0, -1, -0.2] } });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands.every((draw) => draw.shader === warmed)).toBe(true);
      expect(device.drawCommands.every((draw) => {
        const bound = draw.uniforms?.get("u_baseColorTexture");
        return uvSet === "none" ? bound instanceof TextureBinding && bound.texture === null : bound === binding;
      })).toBe(true);
      expect(device.drawCommands.every((draw) => draw.uniforms?.get("u_alphaCutoff") === 0.5)).toBe(true);
      expect(compile).toHaveBeenCalledTimes(1);
      device.endFrame();
    } finally { system.dispose(); geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("rejects a UV0 vertex layout that the native depth draw cannot consume during warmup", async () => {
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const flags = createTrustedQrFlags({ A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    setRendererQrFlags(flags, device);
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "uv", components: 2, offset: 12, shaderLocation: 9 }
    ], 20);
    const geometry = new Geometry(new VertexBuffer(format, 3));
    const material = new UnlitMaterial({ alphaTest: 0.5 });
    const instance = new MaterialInstance(material);
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]) });
    instance.setOverride("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
    instance.setOverride("u_baseColorTextureTexCoord", 0);
    const camera = sceneCamera();
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 1, maxDistance: 50,
      splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    const compile = vi.spyOn(device, "createShaderProgram");
    try {
      await expect(system.precompile({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix },
        casters: [{ geometry, material: instance }], flags, tier: QUALITY_TIERS.high })).rejects.toMatchObject({ code: "DEPTH_VERTEX_FORMAT_INVALID" });
      expect(compile).not.toHaveBeenCalled();
      expect(system.isPrecompiled).toBe(false);
    } finally { system.dispose(); geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it.each(["coverage", "blend-mode"] as const)("rejects unsupported %s during shadow warmup without compiling (strict)", async (mode) => {
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_STRICT: true }), device);
    const compile = vi.spyOn(device, "createShaderProgram");
    const geometry = Geometry.triangle();
    const material = mode === "coverage"
      ? new UnlitMaterial({ alphaTest: 0.5, renderState: { alphaToCoverage: true } })
      : new UnlitMaterial({ renderState: { blendMode: "additive" } });
    const camera = sceneCamera();
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 1, maxDistance: 50,
      splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    try {
      await expect(system.precompile({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix },
        casters: [{ geometry, material, castShadow: true, morphTargets: [{ positions: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }], morphWeights: [0.5] }],
        flags: FLAGS_ON, tier: QUALITY_TIERS.high })).rejects.toMatchObject({
        code: mode === "coverage" ? "DEPTH_ALPHA_COVERAGE_UNSUPPORTED" : "DEPTH_ALPHA_HASH_UNSUPPORTED"
      });
      expect(system.isPrecompiled).toBe(false);
      expect(compile).not.toHaveBeenCalled();
      expect(device.drawCommands).toHaveLength(0);
      expect(() => geometry.vertexBuffer.getAttribute(0, "position")).not.toThrow();
    } finally { system.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("does not prepare or compile an invisible empty-instance caster", async () => {
    const device = new MockRenderDevice();
    const compile = vi.spyOn(device, "createShaderProgram");
    const geometry = Geometry.triangle();
    const camera = sceneCamera();
    const system = new Prd02ShadowSystem(device, { enabled: true, mapSize: 16, cascades: 1, maxDistance: 50, splitLambda: 0.6, filter: "hard", strength: 1, bias: 0, normalBias: 0 });
    try {
      // The incomplete morph pair would fail preparation if this invisible caster were processed.
      await system.precompile({ camera: { viewProjectionMatrix: camera.viewProjectionMatrix }, casters: [{ geometry, instanceTransforms: [], morphTargets: [{}] }], flags: FLAGS_ON, tier: QUALITY_TIERS.high });
      expect(system.isPrecompiled).toBe(true);
      expect(compile).not.toHaveBeenCalled();
      expect(() => geometry.vertexBuffer.getAttribute(0, "position")).not.toThrow();
    } finally { system.dispose(); geometry.dispose(); device.dispose(); }
  });

  it("preserves the bridge eye even when unused-cascade skipping is disabled", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    const camera = sceneCamera();
    const sun = new DirectionalLight("sun"); sun.castsShadow = true;
    const source = {
      shadow: { enabled: true, size: 16, cascadeCount: 2 },
      collectedLights: [{ kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [-8, 4, 2] as const,
        direction: [0, -1, -0.2] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: sun }]
    };
    try {
      device.beginFrame(8, 8);
      const result = executePrd02BridgedShadowMap({
        device, source, items: [item], camera, flags: FLAGS_ON,
        frameCamera: { viewProjectionMatrix: camera.viewProjectionMatrix, eye: EYE }, timeSeconds: 12.5
      });
      expect(result).toBeDefined();
      expect(device.drawCommands).toHaveLength(2);
      expectEye(device.drawCommands, EYE);
      expect(device.drawCommands.every((command) => command.uniforms?.get("u_time") === 12.5)).toBe(true);
      device.endFrame();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([
    ["mock", true], ["webgpu", true], ["webgpu", false]
  ] as const)("publishes compatible QR atlas bindings on %s (sun: %s)", (kind, includeSun) => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    if (kind === "webgpu") {
      useWebGPUShape(device);
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: device.info.capabilities?.filter((capability) => capability !== "depth-textures") } });
    }
    const camera = sceneCamera();
    const sun = new DirectionalLight("sun"); sun.castsShadow = true;
    const point = new PointLight("point"); point.castsShadow = true; point.range = 20;
    const directional = { kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [-8, 4, 2] as const,
      direction: [0, -1, -0.2] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: sun };
    const local = { kind: "point" as const, color: [1, 1, 1] as const, intensity: 1, position: [-8, 4, 2] as const,
      direction: [0, -1, 0] as const, range: 20, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: point };
    const source = { shadow: { enabled: true, size: 16, cascadeCount: 2 }, collectedLights: includeSun ? [directional, local] : [local] };
    const previous = device.createRenderTarget({ width: 4, height: 4, depth: true });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(previous);
      const map = executePrd02BridgedShadowMap({
        device, source, items: [item], camera, flags: FLAGS_ON,
        frameCamera: { viewProjectionMatrix: camera.viewProjectionMatrix, eye: EYE }, timeSeconds: 12.5
      });
      expect(map).toBeDefined();
      expect(device.getRenderTarget()).toBe(previous);
      expect(map!.localShadows?.slots.get(local)).toBe(0);
      const raw = map!.localShadows?.rawTexture;
      expect(raw?.name).toBe("u_localShadowAtlas");
      expect(raw?.texture?.format).toBe(kind === "webgpu" ? "rgba16f" : "depth24");
      expect(raw?.sampler.compare).toBeUndefined();
      expect(raw?.sampler.minFilter).toBe("nearest");
      if (kind === "webgpu") expect(map!.localShadows?.texture).toBeUndefined();
      else {
        expect(map!.localShadows?.texture?.texture).toBe(raw?.texture);
        expect(map!.localShadows?.texture?.sampler.compare).toBe("less-equal");
      }
      if (includeSun) {
        expect(map!.cascades).toHaveLength(2);
        expect(map!.texture.texture?.format).toBe(kind === "webgpu" ? "rgba16f" : "depth24");
      } else {
        expect(map!.strength).toBe(0);
        expect(map!.texture.texture).toBe(raw?.texture);
      }
      expect(device.drawCommands).toHaveLength(includeSun ? 8 : 6);
      expectEye(device.drawCommands, EYE);
      expect(device.drawCommands.every((command) => command.uniforms?.get("u_time") === 12.5)).toBe(true);
      expect(device.drawCommands.slice(includeSun ? 2 : 0).every((draw) => !!draw.renderState?.scissor)).toBe(true);
      device.endFrame();
    } finally { previous.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects a WebGPU comparison-only QR receiver before allocating incompatible targets", () => {
    const device = new MockRenderDevice();
    useWebGPUShape(device);
    const geometry = Geometry.triangle();
    const material = new Material({ name: "comparison-lookup", shaderKey: "lookup", requiredUniforms: [PRD02_SHADOW_LOOKUP_UNIFORM] } as never);
    const camera = sceneCamera();
    const ctx = {
      device, width: 8, height: 8, frameIndex: 0, timeSeconds: 12.5,
      camera: { viewProjectionMatrix: camera.viewProjectionMatrix, near: camera.near, far: camera.far, position: EYE },
      source: { shadow: { enabled: true } }, items: [{ geometry, material }], tier: QUALITY_TIERS.high, flags: FLAGS_ON,
      sceneDepth: null, blackboard: new Map()
    } as never;
    const allocate = vi.spyOn(device, "createRenderTarget");
    try {
      const passes = createPrd02ShadowsContributor().passes!("shadows", ctx);
      expect(passes).toHaveLength(1);
      expect(() => passes[0]!.execute({ device, width: 8, height: 8 })).toThrow(/depth-comparison shadow layout/);
      expect(allocate).not.toHaveBeenCalled();
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses the post frame eye and camera projection for the selected outline mask", () => {
    const { item, material, geometry } = caster();
    const device = new MockRenderDevice();
    const pipeline = new RendererPostprocessPipeline({ device, width: 8, height: 8 } as never) as unknown as {
      executeOutlineTargets(postprocess: unknown, targets: readonly string[], forward: unknown, output: unknown): void;
    };
    const previous = device.createRenderTarget({ width: 8, height: 8, depth: true });
    const cameraVp = Float32Array.from([3, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]);
    const depth = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
    try {
      device.beginFrame(8, 8);
      device.setRenderTarget(previous);
      pipeline.executeOutlineTargets({
        outline: { targets: ["camera-dependent"] },
        cameraFrame: { viewProjectionMatrix: cameraVp, viewMatrix: IDENTITY, position: EYE, depth, near: 0.1, far: 60 },
        postFrameContext: { items: [item, { ...item, label: "unselected" }], sceneDepth: { available: false, texture: null }, timeSeconds: 12.5 }
      }, ["camera-dependent"], undefined, undefined);
      expect(device.getRenderTarget()).toBe(previous);
      const draws = device.drawCommands.filter((draw) => draw.label?.includes(":custom-depth"));
      expect(draws).toHaveLength(1);
      expectEye(draws, EYE, 1);
      expect(draws[0]!.uniforms!.get("u_time")).toBe(12.5);
      expect(Array.from(draws[0]!.uniforms!.get("u_modelViewProjection") as Float32Array)).toEqual(Array.from(cameraVp));
      expect(device.drawCommands.at(-1)?.label).toBe("gu47-outline-targets-ink");
      device.endFrame();
    } finally { previous.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });
});
