import { beforeAll, describe, expect, it } from "vitest";
import { identityMat4 } from "@aura3d/scene";
import { BaseRenderPass } from "../../../packages/rendering/src/RenderPass";
import { RenderGraph } from "../../../packages/rendering/src/RenderGraph";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { MockRenderDevice, type DrawCommand, type RenderDevice, type RenderTarget, type RenderTargetDescriptor, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createRendererFrameHooks, setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { isUnmodifiedDefaultShaderLibrary } from "../../../packages/rendering/src/renderer/TrustedShaderLibrary";
import type { ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerPrd04ShaderFeatures } from "../../../packages/rendering/src/materials/features";
import { registerPrd04MaterialLobes } from "../../../packages/rendering/src/materials/lobes";
import { registerPrd04ShaderChunks } from "../../../packages/rendering/src/shaders/physical/index";
import { bindShaderFeatureUniforms } from "../../../packages/rendering/src/program/FeatureSelect";
import { GENERATED_PROGRAM_MARKER } from "../../../packages/rendering/src/program/ProgramGenerator";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { bindLiveQualityTier } from "../../../packages/rendering/src/quality/liveTier";
import { TRANSMISSION_LANE_RESOURCE, transmissionFrameContributor } from "../../../packages/rendering/src/forward/Transmission";
import { capturedTransmissionTarget, itemReportsTransmissionLobe, publishCapturedTransmissionTarget, releaseTransmissionFrame, releaseTransmissionScope, setPrd04TransmissionDiagnostics } from "../../../packages/rendering/src/forward/transmissionTargetStore";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import "../../../packages/rendering/src/lanes/prd01";

beforeAll(() => {
  registerPrd04ShaderChunks();
  registerPrd04MaterialLobes();
  registerPrd04ShaderFeatures();
});

describe("transmission frame-graph binding", () => {
  it("orders opaque, checked copy and mip generation before a real feature bind, then revokes its frame", () => {
    const order: string[] = [], scope = {};
    let current: RenderTarget | null = null;
    let id = 0;
    const device = {
      kind: "mock", disposed: false, contextLost: false, generation: 1,
      createRenderTarget(d: RenderTargetDescriptor) {
        const texture = new Texture({ width: d.width, height: d.height, format: d.format, renderAttachment: true, mipLevelCount: d.mipLevelCount });
        return {
          id: ++id, label: d.label ?? "source", width: d.width, height: d.height,
          colorTexture: texture, disposed: false,
          dispose() { (this as { disposed: boolean }).disposed = true; texture.dispose(); }
        } as RenderTarget;
      },
      createBuffer: () => ({ dispose() {} }),
      createShaderProgram: () => ({ dispose() {} }),
      setRenderTarget(target: RenderTarget | null) { current = target; },
      getRenderTarget: () => current,
      drawTransmissionCapture(command: DrawCommand) {
        order.push("copy");
        expect((command.uniforms!.get("u_source") as TextureBinding).texture).toBe(source.colorTexture);
      },
      generateRenderTargetMipmaps(target: RenderTarget) {
        order.push("mips");
        expect(target.colorTexture.mipLevelCount).toBe(5);
      }
    } as unknown as RenderDevice;
    const source = device.createRenderTarget({ width: 16, height: 8, format: "rgba16f", depth: false });
    device.setRenderTarget(source);
    const flags = { values: {}, on: (name: string) => name === "A3D_QR_MATERIALS_TRANSMISSION" };
    const item = { material: { getParameter: (name: string) => name === "u_transmissionFactor" ? 0.5 : undefined } } as never;
    const hooks = createRendererFrameHooks({ device, source: [], width: 16, height: 8, camera: null, postScopeId: scope, viewId: "left", frameIndex: 3, flags });
    hooks.setForwardTarget(source);
    hooks.setOutputColorSpace("linear");
    const frame = hooks.frameContext([item]);
    const graph = new RenderGraph();
    let bound: TextureBinding | undefined;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    registerPrd04ShaderFeatures();
    class TestPass extends BaseRenderPass {
      constructor(name: string, reads: string[], writes: string[], private readonly action: () => void) { super(name, reads, writes); }
      execute(): void { this.action(); }
    }
    try {
      // Reverse insertion demonstrates that the resource edges enforce order.
      graph.addPass(new TestPass("glass", [TRANSMISSION_LANE_RESOURCE], ["result"], () => {
        order.push("glass");
        const uniforms = new Map<string, UniformValue>();
        bindShaderFeatureUniforms({ "prd04.transmissionTarget": true }, flags, item, (name, value) => uniforms.set(name, value), frame);
        bound = uniforms.get("a3d_prd04_transmissionSampler") as TextureBinding;
        expect(uniforms.get("a3d_prd04_transmissionSamplerSize")).toEqual(new Float32Array([16, 8]));
      }));
      hooks.addPasses(graph, "transmission", [item]);
      graph.addPass(new TestPass("opaque", [], ["color"], () => { order.push("opaque"); }));
      graph.execute({ device, width: 16, height: 8 });
      expect(order).toEqual(["opaque", "copy", "mips", "glass"]);
      expect(bound?.texture).toBe(capturedTransmissionTarget(frame)?.texture);
      expect(bound?.sampler.minFilter).toBe("linear-mipmap-linear");
      const target = capturedTransmissionTarget(frame)!.target;
      releaseTransmissionFrame(frame);
      expect(capturedTransmissionTarget(frame)).toBeUndefined();
      expect(() => bindShaderFeatureUniforms({ "prd04.transmissionTarget": true }, flags, item, () => {}, frame)).toThrow(/capture is unavailable/i);
      releaseTransmissionScope(device, scope);
      expect(target.disposed).toBe(true);
    } finally {
      unregister();
      transmissionFrameContributor.dispose();
      source.dispose();
    }
  });
});

describe("renderer physical transmission route", () => {
  it.each([false, true])("retains direct replay after a trusted legacy variant populated the default library (async=%s)", async asynchronous => {
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
      A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    device.drawTransmissionCapture = command => device.draw(command);
    const geometry = Geometry.texturedCube(1);
    const texture = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 255]) });
    const legacy = new TexturedPBRMaterial({ clearcoatFactor: 0.5, clearcoatTexture: texture });
    const opaque = new UnlitMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.7 });
    const library = (renderer as unknown as { readonly shaderLibrary: ShaderLibrary }).shaderLibrary;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    try {
      setRendererQrFlags(createTrustedQrFlags({}), device);
      renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: legacy, label: "legacy" }] }, frameId: 1 });
      expect((library as unknown as { variantCache: Map<string, unknown> }).variantCache.size).toBeGreaterThan(0);
      expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
      setRendererQrFlags(flags, device);
      const source = { cameraPolicy: "identity" as const, renderItems: [
        { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
      ] };
      if (asynchronous) await renderer.renderAsync({ source, frameId: 2 });
      else renderer.render({ source, frameId: 2 });
      const labels = device.drawCommands.map(command => command.label);
      expect(labels.indexOf("prd04-transmission-scene-color-copy")).toBeGreaterThan(labels.indexOf("opaque"));
      expect(labels.indexOf("glass")).toBeGreaterThan(labels.indexOf("prd04-transmission-scene-color-copy"));
      expect(renderer.transmissionDiagnostics().some(diagnostic => diagnostic.targetActive)).toBe(true);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); texture.dispose(); legacy.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it.each([false, true])("captures only after specular transmission is enabled on a diffuse-transmission material (async=%s)", async asynchronous => {
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false,
      A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    device.drawTransmissionCapture = command => device.draw(command);
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), material = new PBRMaterial({ diffuseTransmissionFactor: 0.7 });
    const volumeOnly = new PBRMaterial({ volumeThicknessFactor: 1 });
    const item = { geometry, material, label: "diffuse-transmission" };
    try {
      expect(itemReportsTransmissionLobe(item)).toBe(false);
      expect(itemReportsTransmissionLobe({ geometry, material: volumeOnly })).toBe(false);
      if (asynchronous) await renderer.renderAsync({ source: { cameraPolicy: "identity", renderItems: [item] }, frameId: 1 });
      else renderer.render({ source: { cameraPolicy: "identity", renderItems: [item] }, frameId: 1 });
      expect(device.drawCommands.some(command => command.label?.includes("transmission-capture"))).toBe(false);
      expect(renderer.transmissionDiagnostics().some(diagnostic => diagnostic.targetActive)).toBe(false);
      material.setParameter("u_transmissionFactor", 0.5);
      expect(itemReportsTransmissionLobe(item)).toBe(true);
      if (asynchronous) await renderer.renderAsync({ source: { cameraPolicy: "identity", renderItems: [item] }, frameId: 2 });
      else renderer.render({ source: { cameraPolicy: "identity", renderItems: [item] }, frameId: 2 });
      expect(renderer.transmissionDiagnostics().some(diagnostic => diagnostic.targetActive)).toBe(true);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); material.dispose(); volumeOnly.dispose(); }
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    "draws opaque, captures, then draws transmissive and blended materials (async=%s, post=%s)", async (asynchronous, post) => {
    registerPrd04ShaderChunks();
    registerPrd04MaterialLobes();
    registerPrd04ShaderFeatures();
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags(Object.fromEntries([...enabled].map((name) => [name, true])));
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    device.drawTransmissionCapture = (command) => device.draw(command);
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box();
    const opaque = new UnlitMaterial();
    const glass = new PBRMaterial({ transmissionFactor: 0.8 });
    const blend = new PBRMaterial({ transmissionFactor: 0.4, renderState: { blend: true, depthWrite: false } });
    const source = { cameraPolicy: "identity" as const, ...(post ? { postprocess: { targetFormat: "rgba8" as const, sampleCount: 1 } } : {}), renderItems: [
      { geometry, material: glass, label: "glass" },
      { geometry, material: blend, label: "blend" },
      { geometry, material: opaque, label: "opaque" }
    ] };
    try {
      if (asynchronous) await renderer.renderAsync({ source, frameId: 1 });
      else renderer.render({ source, frameId: 1 });
      const commands = device.drawCommands;
      const labels = commands.map((command) => command.label);
      const copy = labels.indexOf("prd04-transmission-scene-color-copy");
      expect(labels.indexOf("opaque")).toBeGreaterThanOrEqual(0);
      expect(copy).toBeGreaterThan(labels.indexOf("opaque"));
      expect(labels.indexOf("glass")).toBeGreaterThan(copy);
      expect(labels.indexOf("blend")).toBeGreaterThan(copy);
      const captured = (commands[copy]!.uniforms!.get("u_source") as TextureBinding).texture;
      expect(captured?.colorSpace).toBe("linear");
      for (const label of ["glass", "blend"]) {
        const command = commands[labels.indexOf(label)]!;
        expect(command.shader?.marker).toBe(GENERATED_PROGRAM_MARKER);
        expect(command.shader?.reflection.uniforms.has("a3d_prd04_transmissionSampler")).toBe(true);
        const binding = command.uniforms?.get("a3d_prd04_transmissionSampler") as TextureBinding;
        expect(binding.texture).toBeDefined();
        expect(binding.texture).not.toBe(captured);
        expect(binding.texture?.mipLevelCount).toBe(1);
      }
      expect(renderer.transmissionDiagnostics()).toMatchObject([{ targetActive: true, mipCount: 1, sourceCopied: true }]);
    } finally {
      unregister();
      renderer.dispose();
      geometry.dispose();
      opaque.dispose();
      glass.dispose();
      blend.dispose();
    }
  });

  it.each([[false, false], [true, false], [false, true], [true, true]])(
    "reports low-tier capture absence without a missing graph resource (async=%s, direct=%s)", async (asynchronous, direct) => {
    registerPrd04ShaderChunks();
    registerPrd04MaterialLobes();
    registerPrd04ShaderFeatures();
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TIERS"]);
    if (direct) enabled.delete("A3D_QR_CORE_OUTPUT");
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), ...(direct ? { A3D_QR_CORE_OUTPUT: false } : {}) });
    const unbind = bindLiveQualityTier(flags, { tier: "low", settings: QUALITY_TIERS.low });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), material = new PBRMaterial({ transmissionFactor: 0.5 });
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material, label: "glass" }] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 2 })).rejects.toMatchObject({ code: "TRANSMISSION_CAPTURE_UNAVAILABLE" });
      else expect(() => renderer.render({ source, frameId: 2 })).toThrow(/transmission capture is unavailable/i);
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
      expect(renderer.transmissionDiagnostics()).toMatchObject([{ targetActive: false, mipCount: 0 }]);
    } finally {
      unbind(); unregister(); renderer.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it("rejects an after-opaque dependency cycle rather than capturing before that phase", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags(Object.fromEntries([...enabled].map((name) => [name, true])));
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    device.drawTransmissionCapture = (command) => device.draw(command);
    const unregisterTransmission = registerFrameContributor(transmissionFrameContributor);
    let executed = false;
    const unregisterEffect = registerFrameContributor({ id: "prd04.test-after-opaque-cycle", owner: "prd04", flag: "A3D_QR_MATERIALS", phases: ["after-opaque"],
      passes() { return [new class extends BaseRenderPass {
        constructor() { super("test.after-opaque-cycle", [TRANSMISSION_LANE_RESOURCE]); }
        execute() { executed = true; }
      }()]; }
    });
    const geometry = Geometry.box(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: glass }] }, frameId: 1 })).toThrow(/cycle/i);
      expect(executed).toBe(false);
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
    } finally { unregisterEffect(); unregisterTransmission(); renderer.dispose(); geometry.dispose(); glass.dispose(); }
  });

  it.each([[false, false, false], [true, false, false], [false, true, true], [true, true, true]])(
    "captures a linear opaque replay before the encoded direct draw (async=%s, live override=%s, materials only=%s)", async (asynchronous, liveOverride, materialsOnly) => {
    const enabled = new Set(["A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    if (!materialsOnly) { enabled.add("A3D_QR_CORE"); enabled.add("A3D_QR_CORE_GENERATOR"); }
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags,
      clearColor: [0.7, 0.4, 0.2, 0.8], outputClearColor: [0.1, 0.2, 0.3, 1] });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    const draws: Array<{ command: DrawCommand; target: RenderTarget | null }> = [];
    const clears: Array<{ color: readonly number[]; target: RenderTarget | null }> = [];
    const draw = device.draw.bind(device), clear = device.clear.bind(device);
    device.draw = (command) => { draws.push({ command, target: device.getRenderTarget() }); draw(command); };
    device.clear = (color) => { clears.push({ color: [...color], target: device.getRenderTarget() }); clear(color); };
    device.drawTransmissionCapture = (command) => device.draw(command);
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), opaque = new PBRMaterial();
    const glass = new PBRMaterial(liveOverride ? {} : { transmissionFactor: 0.5 });
    const instance = new MaterialInstance(glass);
    if (liveOverride) instance.setOverride("u_transmissionFactor", 0.5);
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: liveOverride ? instance : glass, label: "direct-glass" }, { geometry, material: opaque, label: "direct-opaque" }
    ] };
    try {
      if (asynchronous) await renderer.renderAsync({ source, frameId: 1 });
      else renderer.render({ source, frameId: 1 });
      const opaqueDraws = draws.map((draw, index) => ({ ...draw, index })).filter(({ command }) => command.label === "direct-opaque");
      const copy = draws.findIndex(({ command }) => command.label === "prd04-transmission-scene-color-copy");
      const glassDraw = draws.findIndex(({ command }) => command.label === "direct-glass");
      expect(opaqueDraws).toHaveLength(2);
      expect(copy).toBeGreaterThan(opaqueDraws[0]!.index);
      expect(opaqueDraws[1]!.index).toBeGreaterThan(copy);
      expect(glassDraw).toBeGreaterThan(opaqueDraws[1]!.index);
      const sourceTarget = opaqueDraws[0]!.target;
      expect(sourceTarget?.colorTexture.format).toBe("rgba16f");
      expect(sourceTarget?.colorTexture.colorSpace).toBe("linear");
      expect(opaqueDraws[1]!.target).toBeNull();
      expect(draws[glassDraw]!.target).toBeNull();
      expect((draws[copy]!.command.uniforms!.get("u_source") as TextureBinding).texture).toBe(sourceTarget?.colorTexture);
      if (materialsOnly) {
        expect(opaqueDraws[0]!.command.uniforms?.get("u_outputColorSpace")).toBe(0);
        expect(opaqueDraws[1]!.command.uniforms?.get("u_outputColorSpace")).toBe(1);
      } else {
        expect(opaqueDraws[0]!.command.shader).not.toBe(opaqueDraws[1]!.command.shader);
      }
      expect(draws[glassDraw]!.command.shader?.marker).toBe(GENERATED_PROGRAM_MARKER);
      expect(clears).toEqual(expect.arrayContaining([
        { color: [0.7, 0.4, 0.2, 0.8], target: null },
        { color: [0.1, 0.2, 0.3, 0.8], target: sourceTarget }
      ]));
      expect(renderer.transmissionDiagnostics()).toMatchObject([{ targetActive: true, sourceCopied: true }]);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it.each([false, true])("rejects replay with an opaque per-draw callback before invoking it (async=%s)", async (asynchronous) => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    let callbacks = 0;
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, onBeforeRender: () => { callbacks += 1; } }, { geometry, material: glass }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(callbacks).toBe(0);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("keeps direct replay captures isolated across separately composited views", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    const capturedTargets: Array<RenderTarget | null> = [];
    device.drawTransmissionCapture = (command) => { capturedTargets.push(device.getRenderTarget()); device.draw(command); };
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    const camera = { viewMatrix: identityMat4(), projectionMatrix: identityMat4() };
    try {
      renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: opaque }, { geometry, material: glass }] }, frameId: 1, views: [
        { id: "left", camera, viewport: { x: 0, y: 0, width: 1, height: 1 } },
        { id: "right", camera, viewport: { x: 1, y: 0, width: 1, height: 1 } }
      ] });
      expect(capturedTargets).toHaveLength(2);
      expect(capturedTargets[0]).not.toBe(capturedTargets[1]);
      expect(renderer.transmissionDiagnostics().map((report) => report.targetActive)).toEqual([true, true]);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("rejects direct replay into a persistent partial XR viewport", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    device.setExternalFramebuffer({}, 2, 1);
    device.setViewport(0, 0, 1, 1, { persistent: true });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [
        { geometry, material: opaque }, { geometry, material: glass }
      ] }, frameId: 1 })).toThrow(/viewport|replay/i);
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it.each([false, true])("rejects an unsupported partial renderer viewport (direct=%s)", async (direct) => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    if (direct) enabled.delete("A3D_QR_CORE_OUTPUT");
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), ...(direct ? { A3D_QR_CORE_OUTPUT: false } : {}) });
    const renderer = await Renderer.create({ backend: "mock", width: 2, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: glass }] }, frameId: 1,
        viewport: { x: 1, y: 0, width: 1, height: 1 } })).toThrow(/viewport/i);
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); glass.dispose(); }
  });

  it("rejects direct replay while an external forward draw hook is installed", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const unregister = registerFrameContributor(transmissionFrameContributor);
    let calls = 0;
    const unhook = registerForwardDrawHook({ id: "test.replay", bind() { calls += 1; } });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [
        { geometry, material: opaque }, { geometry, material: glass }
      ] }, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
    } finally { unhook(); unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("rejects direct replay with a caller-modified shader library", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const shaderLibrary = createDefaultShaderLibrary();
    shaderLibrary.registerChunk("test.replay-mutation", "// caller extension");
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags, shaderLibrary });
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [
        { geometry, material: opaque }, { geometry, material: glass }
      ] }, frameId: 1 })).toThrow(/replay/i);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("does not reuse a stale linear clear after setClearColor", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags,
      clearColor: [0.7, 0.4, 0.2, 1], outputClearColor: [0.1, 0.2, 0.3, 1] });
    const geometry = Geometry.box(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    renderer.setClearColor([0.4, 0.3, 0.2, 1]);
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: glass }] }, frameId: 1 })).toThrow(/known linear clear color/i);
    } finally { renderer.dispose(); geometry.dispose(); glass.dispose(); }
  });

  it("rejects direct replay when an after-opaque contributor adds a pass", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const unregisterTransmission = registerFrameContributor(transmissionFrameContributor);
    let executions = 0;
    const unregisterEffect = registerFrameContributor({ id: "prd04.test-direct-replay-effect", owner: "prd04", flag: "A3D_QR_MATERIALS", phases: ["after-opaque"],
      passes() { return [new class extends BaseRenderPass { constructor() { super("test.direct-replay-effect"); } execute() { executions += 1; } }()]; }
    });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [
        { geometry, material: opaque }, { geometry, material: glass }
      ] }, frameId: 1 })).toThrow(/replay/i);
      expect(executions).toBe(0);
    } finally { unregisterEffect(); unregisterTransmission(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("rejects an unrelated transmission-phase pass before rebinding its target", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const unregisterTransmission = registerFrameContributor(transmissionFrameContributor);
    let executions = 0;
    const unregisterOther = registerFrameContributor({ id: "prd04.test-untrusted-transmission", owner: "prd04", flag: "A3D_QR_MATERIALS", phases: ["transmission"],
      passes() { return [new class extends BaseRenderPass { constructor() { super("test.untrusted-transmission"); } execute() { executions += 1; } }()]; }
    });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      expect(() => renderer.render({ source: { cameraPolicy: "identity", renderItems: [
        { geometry, material: opaque }, { geometry, material: glass }
      ] }, frameId: 1 })).toThrow(/untrusted contributor pass/i);
      expect(executions).toBe(0);
    } finally { unregisterOther(); unregisterTransmission(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); }
  });

  it("keeps legacy and unlit materials out of the transmission capture route", async () => {
    const flags = createTrustedQrFlags({ A3D_QR_CORE: false, A3D_QR_CORE_GENERATOR: false, A3D_QR_CORE_OUTPUT: false, A3D_QR_MATERIALS_TRANSMISSION: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), pbr = new PBRMaterial({ transmissionFactor: 0.5 }), unlit = new UnlitMaterial();
    unlit.setParameter("u_transmissionFactor", 0.5);
    try {
      renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: pbr }, { geometry, material: unlit }] }, frameId: 1 });
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
      expect(renderer.transmissionDiagnostics()).toMatchObject([{ targetActive: false }]);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); pbr.dispose(); unlit.dispose(); }
  });

  it("does not require a transmission capture for an unlit generated material", async () => {
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    const flags = createTrustedQrFlags(Object.fromEntries([...enabled].map((name) => [name, true])));
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), unlit = new UnlitMaterial();
    unlit.setParameter("u_transmissionFactor", 0.5);
    try {
      renderer.render({ source: { cameraPolicy: "identity", renderItems: [{ geometry, material: unlit }] }, frameId: 1 });
      expect(device.drawCommands.some((command) => command.label === "prd04-transmission-scene-color-copy")).toBe(false);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); unlit.dispose(); }
  });

  it("plans capture for a live transmission override with materials-only generated programs", async () => {
    registerPrd04ShaderChunks();
    registerPrd04MaterialLobes();
    registerPrd04ShaderFeatures();
    const flags = createTrustedQrFlags({ A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true, A3D_QR_CORE: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const device = renderer.device as MockRenderDevice & { drawTransmissionCapture(command: DrawCommand): void };
    device.drawTransmissionCapture = (command) => device.draw(command);
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.box(), base = new PBRMaterial(), instance = new MaterialInstance(base);
    instance.setOverride("u_transmissionFactor", 0.5);
    try {
      renderer.render({ source: { cameraPolicy: "identity", postprocess: { targetFormat: "rgba8", sampleCount: 1 },
        renderItems: [{ geometry, material: instance, label: "live-glass" }] }, frameId: 1 });
      const labels = device.drawCommands.map((command) => command.label);
      const copy = labels.indexOf("prd04-transmission-scene-color-copy"), glass = labels.indexOf("live-glass");
      expect(copy).toBeGreaterThanOrEqual(0);
      expect(glass).toBeGreaterThan(copy);
      expect(device.drawCommands[glass]!.shader?.marker).toBe(GENERATED_PROGRAM_MARKER);
      expect(device.drawCommands[glass]!.uniforms?.get("a3d_prd04_transmissionSampler")).toBeInstanceOf(TextureBinding);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); base.dispose(); }
  });
});

describe("WebGPU-shaped renderer transmission", () => {
  it.each([[false, false, false], [true, false, false], [false, true, false], [true, true, false], [false, false, true], [true, false, true]])(
    "submits capture and generated PBR (async=%s, mapped volume=%s, direct=%s)", async (asynchronous, mappedVolume, direct) => {
    registerPrd04ShaderChunks();
    registerPrd04MaterialLobes();
    registerPrd04ShaderFeatures();
    const descriptors: Array<{ label?: string; format: string; size?: readonly number[]; sampleCount?: number; mipLevelCount?: number }> = [];
    const passLabels: string[] = [];
    const groups: Array<{ entries: Array<{ binding: number; resource: unknown }> }> = [];
    const native = {
      features: new Set<string>(),
      queue: { writeBuffer() {}, writeTexture() {}, submit() {}, onSubmittedWorkDone: async () => {} },
      createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
      createTexture(descriptor: { label?: string; format: string; size?: readonly number[]; sampleCount?: number; mipLevelCount?: number }) {
        descriptors.push(descriptor);
        const texture = { descriptor, createView: (view?: object) => ({ texture, view }), destroy() {} };
        return texture;
      },
      createSampler: () => ({}), createShaderModule: ({ code }: { code: string }) => ({ code }),
      createBindGroupLayout: (layout: object) => layout,
      createPipelineLayout: (layout: object) => layout,
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBindGroup: (group: { entries: Array<{ binding: number; resource: unknown }> }) => { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass(pass: { label?: string }) {
          passLabels.push(pass.label ?? "");
          return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, setViewport() {}, setScissorRect() {},
            setBlendConstant() {}, setStencilReference() {}, draw() {}, drawIndexed() {}, end() {} };
        },
        finish: () => ({})
      }),
      destroy() {}
    };
    const nativeDevice = native as unknown as WebGPUDeviceLike;
    const canvasContext = {
      configure() {}, unconfigure() {},
      getCurrentTexture: () => native.createTexture({ label: "canvas", format: "bgra8unorm" })
    };
    const canvas = { width: 4, height: 4, getContext: (name: string) => name === "webgpu" ? canvasContext : null } as unknown as HTMLCanvasElement;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => nativeDevice }, device: nativeDevice, canvas });
    const enabled = new Set(["A3D_QR_CORE", "A3D_QR_CORE_OUTPUT", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS", "A3D_QR_MATERIALS_TRANSMISSION"]);
    if (direct) enabled.delete("A3D_QR_CORE_OUTPUT");
    const flags = createTrustedQrFlags({ ...Object.fromEntries([...enabled].map((name) => [name, true])), ...(direct ? { A3D_QR_CORE_OUTPUT: false } : {}) });
    const renderer = new Renderer(device, { backend: "webgpu", width: 4, height: 4, canvas, qrFlags: flags, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    if (!direct) renderer.setRenderScaleCeiling(0.5);
    const unregister = registerFrameContributor(transmissionFrameContributor);
    const geometry = Geometry.texturedCube(1), opaque = new PBRMaterial();
    const map = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 128, 0, 255]), colorSpace: "linear", generateMipmaps: false });
    const glass = mappedVolume ? new TexturedPBRMaterial({ transmissionFactor: 0.5, transmissionTexture: map,
      volumeThicknessFactor: 1, volumeThicknessTexture: map, volumeAttenuationColor: [0.6, 0.8, 1],
      volumeAttenuationDistance: 2, dispersion: 0.2 }) : new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      const input = { source: { cameraPolicy: "identity" as const, renderItems: [
        { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
      ] }, frameId: 1 };
      if (asynchronous) await renderer.renderAsync(input);
      else renderer.render(input);
      const sceneDepth = descriptors.find((descriptor) => descriptor.label === (direct ? "renderer-forward-color-depth" : "renderer-hdr-scene-depth"));
      expect(sceneDepth).toBeDefined();
      expect(sceneDepth?.sampleCount ?? 1).toBe(1);
      const sceneColor = descriptors.find((descriptor) => descriptor.label === (direct ? "renderer-forward-color" : "renderer-hdr-scene"));
      const depthCopy = descriptors.find((descriptor) => descriptor.label === "aura.scene.depth.copy-depth");
      expect(sceneColor?.size).toEqual(direct ? [4, 4] : [2, 2]);
      expect(sceneDepth?.size).toEqual(sceneColor?.size);
      if (direct) expect(depthCopy).toBeUndefined();
      else expect(depthCopy?.size).toEqual(sceneDepth?.size);
      const capture = descriptors.find((descriptor) => descriptor.label === "prd04-transmission-scene-color");
      expect(capture?.mipLevelCount).toBe(direct ? 3 : 2);
      const opaquePass = passLabels.indexOf("opaque-pass");
      const copyPass = passLabels.indexOf("prd04-transmission-scene-color-copy-pass");
      const glassPass = passLabels.indexOf("glass-pass");
      expect(opaquePass).toBeGreaterThanOrEqual(0);
      expect(copyPass).toBeGreaterThan(opaquePass);
      if (direct) expect(passLabels.lastIndexOf("opaque-pass")).toBeGreaterThan(copyPass);
      expect(glassPass).toBeGreaterThan(direct ? passLabels.lastIndexOf("opaque-pass") : copyPass);
      if (mappedVolume) {
        const bindings = groups.find((group) => group.entries.some((entry) => entry.binding === 59));
        expect(bindings?.entries.map((entry) => entry.binding)).toEqual(expect.arrayContaining([54, 55, 59, 60, 61, 62]));
        expect((bindings!.entries.find((entry) => entry.binding === 60)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(map));
        expect((bindings!.entries.find((entry) => entry.binding === 62)!.resource as { texture: unknown }).texture).toBe(device.getNativeTexture(map));
      }
      expect(renderer.transmissionDiagnostics()).toMatchObject([{ targetActive: true, mipCount: direct ? 3 : 2 }]);
    } finally {
      unregister(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose(); map.dispose();
    }
  });
});

describe("renderer transmission diagnostics lifetime", () => {
  it.each([false, true])("snapshots the current app and views, revokes frame captures, and resets on resize (async=%s)", async (asynchronous) => {
    const flags = { values: { A3D_QR_POST: true }, on: (name: string) => name === "A3D_QR_POST" };
    const first = await Renderer.create({ backend: "mock", width: 2, height: 1, qrFlags: flags });
    const second = await Renderer.create({ backend: "mock", width: 2, height: 1, qrFlags: flags });
    const contexts: FrameContributorContext[] = [];
    const targets: RenderTarget[] = [];
    let active = true;
    const unregister = registerFrameContributor({
      id: "prd03.transmission-diagnostic-test", owner: "prd03", flag: "A3D_QR_POST", phases: ["after-opaque"],
      passes(_phase, frame) {
        return [new class extends BaseRenderPass {
          constructor() { super("test.transmission-diagnostic"); }
          execute() {
            contexts.push(frame);
            if (!active || frame.postScopeId !== first.postScopeId() || !String(frame.viewId).includes("left")) return;
            // The 1×1 target is a fixture for snapshot/lease ownership, not a GPU pixel claim.
            const target = frame.device.createRenderTarget({ width: 1, height: 1, format: "rgba8", depth: false });
            targets.push(target);
            publishCapturedTransmissionTarget(frame, target, 1);
            setPrd04TransmissionDiagnostics(frame, {
              targetActive: true, format: "rgba8", mipCount: 1, scale: 1, sourceCopied: true, readbacks: 0,
              issues: ["transmission-ldr-capture"]
            });
          }
        }()];
      }
    });
    const source = { cameraPolicy: "identity" as const, renderItems: [] };
    const camera = { viewMatrix: identityMat4(), projectionMatrix: identityMat4() };
    const views = [
      { id: "left", camera, viewport: { x: 0, y: 0, width: 1, height: 1 } },
      { id: "right", camera, viewport: { x: 1, y: 0, width: 1, height: 1 } }
    ];
    const render = async (renderer: Renderer, frameId: number, selectedViews = views) => {
      if (asynchronous) await renderer.renderAsync({ source, frameId, views: selectedViews });
      else renderer.render({ source, frameId, views: selectedViews });
    };
    try {
      await render(first, 1);
      await render(second, 1);
      expect(first.transmissionDiagnostics().map((value) => value.targetActive)).toEqual([true, false]);
      expect(second.transmissionDiagnostics().map((value) => value.targetActive)).toEqual([false, false]);
      expect(contexts.every((frame) => capturedTransmissionTarget(frame) === undefined)).toBe(true);
      const exposed = first.transmissionDiagnostics()[0]!;
      (exposed.issues as string[]).push("caller-change");
      expect(first.transmissionDiagnostics()[0]!.issues).toEqual(["transmission-ldr-capture"]);

      active = false;
      await render(first, 2, [views[0]!]);
      expect(first.transmissionDiagnostics()).toHaveLength(1);
      expect(first.transmissionDiagnostics()[0]!.targetActive).toBe(false);
      expect(first.transmissionDiagnostics()[0]!.issues).toEqual([]);
      expect(second.transmissionDiagnostics()).toHaveLength(2);
      first.resize(3, 1);
      expect(first.transmissionDiagnostics()).toEqual([]);
      expect(second.transmissionDiagnostics()).toHaveLength(2);
    } finally {
      unregister();
      first.dispose();
      second.dispose();
      for (const target of targets) target.dispose();
    }
  });
});
