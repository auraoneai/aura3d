import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import { advancedLightingStateFor, releaseAdvancedLightingState, setAdvancedLightingInvalidator } from "../../../packages/engine/src/agent-api/app/advancedLightingState";
import { ADVANCED_LIGHTING_PREPARE_FRAME, createAdvancedLightingBridge, withAdvancedLightingOrigin,
  type AdvancedLightingPrepareFrame } from "../../../packages/engine/src/agent-api/compiler/advancedLightingBridge";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Material } from "../../../packages/rendering/src/Material";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { MockRenderDevice, type RenderDevice } from "../../../packages/rendering/src/RenderDevice";
import type { RenderItem, RenderSource } from "../../../packages/rendering/src";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { attachRootRenderSource, createAuraApp, material as auraMaterial, primitives, scene } from "../../../packages/engine/src/public/index";
import { ADVANCED_LIGHTING_BINDING, advancedLightingItemBinding } from "../../../packages/rendering/src/lighting/AdvancedLightingBindings";
import { NativeLightmapBake, NativeLightProbeGrid, VoxelIndirectLighting } from "@aura3d/engine/lighting";
import { PRD02_ITEM_IRRADIANCE_BINDINGS } from "../../../packages/rendering/src/probes/ProbeBoxProjection";
import { prd02ItemIrradianceBindings } from "../../../packages/rendering/src/probes/ProbeBoxProjection";
import { disposePrd02Probes, prd02BeforeFrame, prd02IrradianceVolumes } from "../../../packages/rendering/src/probes/Prd02ProbesContributor";
import { probeSourceOwner } from "../../../packages/rendering/src/probes/ProbeSourceOwner";

function item(name = "card", textured = true): RenderItem {
  return withAdvancedLightingOrigin({ geometry: Geometry.box({ textured }), material: new Material({ shaderKey: "aura3d/pbr-direct" }) }, { name });
}

function grid() { return new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] }); }

function lightmap(uvChannel: 0 | 1 = 0, withAuthoredLight = false) {
  const task = new NativeLightmapBake({
    atlas: { width: 2, height: 2, uvChannel, gutter: 0, texelDensity: 2, charts: [{ x: 0, y: 0, width: 2, height: 2, triangles: [0] }] },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] },
    lights: withAuthoredLight ? [{ type: "ambient", color: [1, 1, 1], intensity: 1 }] : [], indirect: () => [0, 1, 0]
  });
  while (task.status !== "complete") task.step(16);
  return task.createRenderData();
}

function fixture(targetCount: (name: string) => number = (name) => name === "card" ? 1 : 0) {
  const owner = {};
  const device = new MockRenderDevice();
  const invalidate = vi.fn();
  const unregister = setAdvancedLightingInvalidator(owner, invalidate);
  const bridge = createAdvancedLightingBridge({ owner, device, targetCount, assertSupported() {} });
  const frame = { device, postScopeId: {}, viewId: "main", frameIndex: 1 };
  const state = advancedLightingStateFor(owner);
  const callback = () => {
    const source = bridge.wrapSource({ collectRenderItems: () => [] } as RenderSource);
    return (source as RenderSource & { [ADVANCED_LIGHTING_PREPARE_FRAME]: AdvancedLightingPrepareFrame })[ADVANCED_LIGHTING_PREPARE_FRAME];
  };
  return { owner, device, state, bridge, frame, invalidate, callback,
    cleanup: () => { bridge.dispose(); unregister(); releaseAdvancedLightingState(owner); device.dispose(); } };
}

describe("production advanced lighting bridge", () => {
  it("stamps the real app snapshot for one frame and invalidates stale packets on edits and detach", () => {
    const f = fixture(), source = grid(), draw = item();
    const empty = { collectRenderItems: () => [draw] };
    expect(f.bridge.wrapSource(empty)).toBe(empty);
    const detach = f.state.attachIndirect({ kind: "probe-grid", grid: source }, { outside: "clamp" });
    const prepare = f.callback();
    const before = prepare([draw], f.frame, "before-batching");
    expect(advancedLightingItemBinding(before[0]!, f.frame)?.kind).toBe("probe-grid");
    expect(prepare(before.map((value) => ({ ...value })), f.frame, "after-collect", before)).toHaveLength(1);
    expect(() => advancedLightingItemBinding(before[0]!, { ...f.frame, viewId: "other" })).toThrow(/FRAME_MISMATCH|frame/i);
    source.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
    expect(() => advancedLightingItemBinding(before[0]!, f.frame)).toThrow(/FRAME_STALE/);
    const nextFrame = { ...f.frame, frameIndex: 2 };
    const updated = prepare([draw], nextFrame, "before-batching");
    expect(advancedLightingItemBinding(updated[0]!, nextFrame)?.kind).toBe("probe-grid");
    detach();
    expect(() => advancedLightingItemBinding(updated[0]!, nextFrame)).toThrow(/FRAME_STALE/);
    f.cleanup();
    expect(source.renderData().texture.disposed).toBe(false);
    source.dispose();
  });

  it("rejects missing, duplicate and incompatible lightmap targets and competing sources", () => {
    const f = fixture((name) => name === "duplicate" ? 2 : name === "card" ? 1 : 0);
    const map = lightmap(), authoredLight = lightmap(0, true);
    expect(() => f.state.attachLightmap("absent", map, { composition: "add-indirect" })).toThrow(/exactly one/);
    expect(() => f.state.attachLightmap("duplicate", map, { composition: "add-indirect" })).toThrow(/exactly one/);
    expect(() => f.state.attachLightmap("card", authoredLight, { composition: "replace-diffuse" })).toThrow(/authored ambient or direct lights/);
    expect(() => f.state.attachLightmap("card", authoredLight, { composition: "add-indirect" })).toThrow(/LIGHTMAP_CONTAINS_AUTHORED_LIGHTS/);
    const detach = f.state.attachLightmap("card", map, { composition: "add-indirect" });
    const probe = grid();
    expect(() => f.state.attachIndirect({ kind: "probe-grid", grid: probe })).toThrow(/cannot be combined/);
    const prepare = f.callback();
    const target = item();
    const before = prepare([target, item("other")], f.frame, "before-batching");
    expect(advancedLightingItemBinding(before[0]!, f.frame)?.kind).toBe("lightmap");
    expect(advancedLightingItemBinding(before[1]!, f.frame)).toBeNull();
    expect(() => prepare([target, item()], f.frame, "before-batching")).toThrow(/multiple draw items/);
    expect(() => prepare([item("card", false)], f.frame, "before-batching")).toThrow(/no uv coordinates/);
    detach();
    const uv1 = lightmap(1);
    f.state.attachLightmap("card", uv1, { composition: "add-indirect" });
    expect(() => prepare([target], f.frame, "before-batching")).toThrow(/no uv1 coordinates/);
    f.cleanup(); probe.dispose(); map.texture.dispose(); uv1.texture.dispose(); authoredLight.texture.dispose();
  });

  it("refreshes voxel volume data after edits without transferring ownership", () => {
    const f = fixture();
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, resolution: 2, quality: "low" });
    f.state.attachIndirect({ kind: "voxel", volume }, { intensity: 2, maxDistance: 1 });
    const prepare = f.callback();
    const before = prepare([item()], f.frame, "before-batching");
    expect(advancedLightingItemBinding(before[0]!, f.frame)?.kind).toBe("voxel");
    volume.updateVoxel([0, 0, 0], { radiance: [1, 0, 0], opacity: 1 });
    expect(() => advancedLightingItemBinding(before[0]!, f.frame)).toThrow(/FRAME_STALE/);
    const next = { ...f.frame, frameIndex: 2 };
    const after = prepare([item()], next, "before-batching");
    const binding = advancedLightingItemBinding(after[0]!, next)!;
    expect(binding.kind).toBe("voxel");
    expect(binding.uniforms.u_a3dNativeVoxelIntensity).toBe(2);
    expect(volume.renderData().revision).toBe(1);
    f.cleanup();
    expect(volume.renderData().texture.disposed).toBe(false);
    volume.dispose();
  });

  it("detects contributor tag loss, extra geometry and PRD02 diffuse conflicts", () => {
    const f = fixture(), source = grid();
    f.state.attachIndirect({ kind: "probe-grid", grid: source });
    const prepare = f.callback(), before = prepare([item()], f.frame, "before-batching");
    const stripped = { ...before[0]! } as RenderItem & { [ADVANCED_LIGHTING_BINDING]?: unknown };
    delete stripped[ADVANCED_LIGHTING_BINDING];
    expect(() => prepare([stripped], f.frame, "after-collect", before)).toThrow(/removed or replaced/);
    expect(() => prepare([...before, item("extra")], f.frame, "after-collect", before)).toThrow(/without the global indirect binding/);
    const conflicting = { ...before[0]!, [PRD02_ITEM_IRRADIANCE_BINDINGS]: { device: f.device, owner: {}, volume: { textures: [] }, uniforms: {} } };
    expect(() => prepare([conflicting], f.frame, "after-collect", before)).toThrow(/PRD02 irradiance volume/);
    f.cleanup(); source.dispose();
  });

  it("requires a supported live renderer and rejects unknown backends", () => {
    const owner = {}, device = new MockRenderDevice(), source = grid();
    const unregister = setAdvancedLightingInvalidator(owner, () => {});
    const bridge = createAdvancedLightingBridge({ owner, device, targetCount: () => 1, assertSupported() { throw new Error("generator disabled"); } });
    expect(() => advancedLightingStateFor(owner).attachIndirect({ kind: "probe-grid", grid: source })).toThrow(/generator disabled/);
    bridge.dispose();
    const oversized = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [17, 1, 1], backend: "webgpu" });
    const webglLike = createAdvancedLightingBridge({ owner, device, targetCount: () => 1, assertSupported() {} });
    expect(() => advancedLightingStateFor(owner).attachIndirect({ kind: "probe-grid", grid: oversized })).toThrow(/axis limit/);
    webglLike.dispose(); oversized.dispose();
    const foreign = { ...device, kind: "foreign", disposed: false, contextLost: false } as unknown as RenderDevice;
    const unsupported = createAdvancedLightingBridge({ owner, device: foreign, targetCount: () => 1, assertSupported() {} });
    expect(() => advancedLightingStateFor(owner).attachIndirect({ kind: "probe-grid", grid: source })).toThrow(/foreign backend/);
    unsupported.dispose(); unregister(); releaseAdvancedLightingState(owner); source.dispose(); device.dispose();
  });

  it("carries a live attachment through actual sync and async Renderer forward draws", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false } });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const owner = {}, probe = grid(), geometry = Geometry.box(), material = new PBRMaterial();
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, resolution: 2, quality: "low" });
    const baked = lightmap();
    const unregister = setAdvancedLightingInvalidator(owner, () => {});
    const bridge = createAdvancedLightingBridge({ owner, device, targetCount: () => 1, assertSupported() {} });
    const state = advancedLightingStateFor(owner);
    const authored = withAdvancedLightingOrigin({ geometry, material }, { name: "card" });
    const source: RenderSource = { collectRenderItems: () => [authored], cameraPolicy: "identity", staticBatching: true };
    try {
      // A source without an attachment remains a normal renderer input.
      expect(bridge.wrapSource(source)).toBe(source);
      const detach = state.attachIndirect({ kind: "probe-grid", grid: probe });
      await expect(renderer.precompile(bridge.wrapSource(source))).rejects.toThrow(/precompile requires a live frame/i);
      await renderer.renderAsync(bridge.wrapSource(source));
      const asyncDraw = device.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeProbeTexture"));
      expect((asyncDraw?.uniforms?.get("u_a3dNativeProbeTexture") as TextureBinding | undefined)?.texture).toBe(probe.renderData().texture);
      renderer.render(bridge.wrapSource(source));
      const syncDraw = device.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeProbeTexture"));
      expect((syncDraw?.uniforms?.get("u_a3dNativeProbeTexture") as TextureBinding | undefined)?.texture).toBe(probe.renderData().texture);
      const keys = (rendererProgramCache(device, flags) as unknown as { keys(): string[] }).keys();
      expect(keys.some((key) => JSON.parse(key).features["a3d.nativeProbeGrid"] === true)).toBe(true);
      detach();

      const detachVolume = state.attachIndirect({ kind: "voxel", volume }, { maxDistance: 1 });
      renderer.render(bridge.wrapSource(source));
      const voxelDraw = device.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeVoxelTexture"));
      expect((voxelDraw?.uniforms?.get("u_a3dNativeVoxelTexture") as TextureBinding | undefined)?.texture).toBe(volume.renderData().texture);
      detachVolume();

      const detachMap = state.attachLightmap("card", baked, { composition: "add-indirect" });
      renderer.render(bridge.wrapSource(source));
      const mapDraw = device.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeLightmapTexture"));
      expect((mapDraw?.uniforms?.get("u_a3dNativeLightmapTexture") as TextureBinding | undefined)?.texture).toBe(baked.texture);
      detachMap();
      expect(bridge.wrapSource(source)).toBe(source);
      renderer.render(source);
      expect(device.drawCommands.at(-1)?.uniforms?.has("u_a3dNativeProbeTexture")).toBe(false);
    } finally {
      bridge.dispose(); unregister(); releaseAdvancedLightingState(owner);
      probe.dispose(); volume.dispose(); baked.texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
    }
  });

  it("fails an actual draw when onBeforeRender changes a source, then renders the updated frame", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false } });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const owner = {}, probe = grid(), geometry = Geometry.box(), material = new PBRMaterial();
    const invalidate = vi.fn();
    const unregister = setAdvancedLightingInvalidator(owner, invalidate);
    const bridge = createAdvancedLightingBridge({ owner, device: renderer.device, targetCount: () => 1, assertSupported() {} });
    let changed = false;
    const authored = withAdvancedLightingOrigin({ geometry, material, onBeforeRender: () => {
      if (!changed) { changed = true; probe.setProbeIrradiance(0, 0, 0, [1, 0, 0]); }
    } }, { name: "card" });
    const source: RenderSource = { collectRenderItems: () => [authored], cameraPolicy: "identity" };
    try {
      advancedLightingStateFor(owner).attachIndirect({ kind: "probe-grid", grid: probe });
      expect(() => renderer.render(bridge.wrapSource(source))).toThrow(/FRAME_STALE/);
      expect(invalidate).toHaveBeenCalledTimes(2);
      renderer.render(bridge.wrapSource(source));
      const commands = (renderer.device as MockRenderDevice).drawCommands;
      expect(commands.some((command) => command.uniforms?.has("u_a3dNativeProbeTexture"))).toBe(true);
      expect(probe.renderData().revision).toBe(1);
    } finally {
      bridge.dispose(); unregister(); releaseAdvancedLightingState(owner);
      probe.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
    }
  });

  it("rechecks mutable bake texels after draw callbacks and rejects a modified lightmap", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false } });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const owner = {}, baked = lightmap(), geometry = Geometry.box(), material = new PBRMaterial();
    const unregister = setAdvancedLightingInvalidator(owner, () => {});
    const bridge = createAdvancedLightingBridge({ owner, device: renderer.device, targetCount: () => 1, assertSupported() {} });
    const authored = withAdvancedLightingOrigin({ geometry, material, onBeforeRender: () => {
      const pixels = baked.texture.getMipLevel(0)!.data as Float32Array;
      pixels[0] += 1;
    } }, { name: "card" });
    try {
      advancedLightingStateFor(owner).attachLightmap("card", baked, { composition: "add-indirect" });
      const source: RenderSource = { collectRenderItems: () => [authored], cameraPolicy: "identity" };
      expect(() => renderer.render(bridge.wrapSource(source))).toThrow(/LIGHTMAP_PROVENANCE_INVALID|unmodified completed bake/);
    } finally {
      bridge.dispose(); unregister(); releaseAdvancedLightingState(owner);
      baked.texture.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
    }
  });

  it("rejects a real renderer contributor that strips the scoped binding", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false } });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const owner = {}, probe = grid(), geometry = Geometry.box(), material = new PBRMaterial();
    const unregister = setAdvancedLightingInvalidator(owner, () => {});
    const bridge = createAdvancedLightingBridge({ owner, device: renderer.device, targetCount: () => 1, assertSupported() {} });
    const unregisterContributor = registerFrameContributor({ id: "prd01.advanced-light-strip-test", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"],
      collect: (items) => items.map((value) => {
        const clone = { ...value } as RenderItem & { [ADVANCED_LIGHTING_BINDING]?: unknown };
        delete clone[ADVANCED_LIGHTING_BINDING];
        return clone;
      }) });
    try {
      advancedLightingStateFor(owner).attachIndirect({ kind: "probe-grid", grid: probe });
      const authored = withAdvancedLightingOrigin({ geometry, material }, { name: "card" });
      const source: RenderSource = { collectRenderItems: () => [authored], cameraPolicy: "identity" };
      expect(() => renderer.render(bridge.wrapSource(source))).toThrow(/removed or replaced/);
    } finally {
      unregisterContributor(); bridge.dispose(); unregister(); releaseAdvancedLightingState(owner);
      probe.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
    }
  });

  it("keeps each public app's probe owner across renderer view and target source copies", async () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: true } });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const device = renderer.device as MockRenderDevice;
    const appOptions = { scene: scene(), autoStart: false, qualityRebuild: { flags: { A3D_QR_LIGHTING: true } } };
    const a = createAuraApp(null, appOptions), b = createAuraApp(null, appOptions);
    const geometry = Geometry.box(), material = new PBRMaterial();
    const item: RenderItem = { geometry, material, boundingBoxCenter: [0, 0, 0] };
    const sourceA = { renderItems: [item], cameraPolicy: "identity" as const,
      "prd02.probes.room": { kind: "probe", probe: "irradiance-volume", name: "room", options: {
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] }, resolution: [1, 1, 1] } } };
    const sourceB = { renderItems: [item], cameraPolicy: "identity" as const };
    const observations: { owner: object | undefined; volume: unknown; texture?: unknown }[] = [];
    const unregister = registerFrameContributor({ id: "prd01.advanced-owner-observe", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"], order: 100,
      collect: (items, ctx) => {
        const advanced = advancedLightingItemBinding(items[0]!, ctx);
        observations.push({ owner: probeSourceOwner(ctx.source), volume: prd02ItemIrradianceBindings(items[0]!, device)?.volume,
          ...(advanced ? { texture: (advanced.uniforms.u_a3dNativeProbeTexture as TextureBinding).texture } : {}) });
        return items;
      } });
    const fakeCapture = { device, renderProbeFace: () => {} };
    const viewCamera = { viewProjectionMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
    const views = [
      { id: "left", camera: viewCamera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
      { id: "right", camera: viewCamera, viewport: { x: 4, y: 0, width: 4, height: 8 } }
    ];
    const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: true });
    const gridA = grid(), gridB = grid();
    const unregisterA = setAdvancedLightingInvalidator(a.nodes, () => {}), unregisterB = setAdvancedLightingInvalidator(b.nodes, () => {});
    const bridgeA = createAdvancedLightingBridge({ owner: a.nodes, device, targetCount: () => 1, assertSupported() {} });
    const bridgeB = createAdvancedLightingBridge({ owner: b.nodes, device, targetCount: () => 1, assertSupported() {} });
    try {
      prd02BeforeFrame(fakeCapture, sourceA, flags, a.nodes);
      const volume = prd02IrradianceVolumes(device, a.nodes)[0];
      expect(volume).toBeDefined();
      // A second app on the same device must not make the first source resolve
      // the wrong active owner when the renderer clones that source.
      prd02BeforeFrame(fakeCapture, sourceB, flags, b.nodes);
      renderer.render({ source: sourceA, views });
      expect(observations.splice(0)).toEqual([{ owner: a.nodes, volume }, { owner: a.nodes, volume }]);
      await renderer.renderAsync({ source: sourceB, views });
      expect(observations.splice(0)).toEqual([{ owner: b.nodes, volume: undefined }, { owner: b.nodes, volume: undefined }]);
      renderer.render({ source: sourceA, target });
      expect(observations.splice(0)).toEqual([{ owner: a.nodes, volume }]);

      const lightingA = a.lighting, lightingB = b.lighting;
      if (!lightingA || !lightingB) throw new Error("Lighting extensions were not installed");
      lightingA.attachIndirect({ kind: "probe-grid", grid: gridA });
      lightingB.attachIndirect({ kind: "probe-grid", grid: gridB });
      const advancedA = bridgeA.wrapSource(sourceA), advancedB = bridgeB.wrapSource(sourceB);
      prd02BeforeFrame(fakeCapture, advancedA, flags, a.nodes);
      prd02BeforeFrame(fakeCapture, advancedB, flags, b.nodes);
      await renderer.renderAsync({ source: advancedB, views });
      expect(observations.splice(0)).toEqual([
        { owner: b.nodes, volume: undefined, texture: gridB.renderData().texture },
        { owner: b.nodes, volume: undefined, texture: gridB.renderData().texture }
      ]);
      renderer.render({ source: advancedB, target });
      expect(observations.splice(0)).toEqual([{ owner: b.nodes, volume: undefined, texture: gridB.renderData().texture }]);
      expect(() => renderer.render({ source: advancedA, views })).toThrow(/PRD02 irradiance volume/);
      observations.length = 0;
      expect(() => renderer.render({ source: advancedA, target })).toThrow(/PRD02 irradiance volume/);
    } finally {
      unregister(); disposePrd02Probes(device, a.nodes); disposePrd02Probes(device, b.nodes);
      bridgeA.dispose(); bridgeB.dispose(); unregisterA(); unregisterB(); gridA.dispose(); gridB.dispose();
      target.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); a.dispose(); b.dispose();
    }
  });

  it("submits public app lighting attachments through the mounted production scene", async () => {
    class FakeCanvas {
      width = 200; height = 100; clientWidth = 200; clientHeight = 100;
      style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
      getBoundingClientRect() { return { width: 200, height: 100, left: 0, top: 0 }; }
      hasAttribute() { return false; }
      getContext() { return null; }
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 200, innerHeight: 100, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const create = Renderer.create.bind(Renderer);
    let device: MockRenderDevice | undefined;
    vi.spyOn(Renderer, "create").mockImplementation(async (options) => {
      const renderer = await create({ ...options, backend: "mock", requiredFeatures: [] });
      device = renderer.device as MockRenderDevice;
      // The actual app/compiler/renderer runs on a command-validating test
      // device; no WebGL context or browser is created by this source test.
      Object.defineProperty(device, "kind", { value: "webgl2" });
      Object.defineProperty(device, "info", { value: { ...device.info, capabilities: [...(device.info.capabilities ?? []), "hdr-render-targets"] } });
      return renderer;
    });
    const probe = grid(), volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, quality: "low", resolution: 2 });
    const baked = lightmap();
    let app: ReturnType<typeof createAuraApp> | undefined;
    try {
      const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
      app = createAuraApp(canvas, {
        scene: scene().add(primitives.box({ name: "card", material: auraMaterial.pbr({ color: "#ffffff" }) })),
        autoStart: false, resize: false, diagnostics: false,
        qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_POST: false } }
      });
      await app.ready();
      const lighting = app.lighting;
      if (!lighting) throw new Error("Lighting extension was not installed");
      const detachProbe = lighting.attachIndirect({ kind: "probe-grid", grid: probe });
      app.step(1 / 60);
      const probeTexture = probe.renderData().texture;
      expect((device!.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeProbeTexture"))?.uniforms?.get("u_a3dNativeProbeTexture") as TextureBinding | undefined)?.texture).toBe(probeTexture);
      const previousRevision = probeTexture.revision;
      probe.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
      app.step(1 / 60);
      expect(probeTexture.revision).toBeGreaterThan(previousRevision);
      expect((device!.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeProbeTexture"))?.uniforms?.get("u_a3dNativeProbeTexture") as TextureBinding | undefined)?.texture).toBe(probeTexture);
      const views: { owner: object | undefined; texture: unknown }[] = [];
      const unregisterViews = registerFrameContributor({ id: "prd01.advanced-public-views", owner: "prd01", flag: "A3D_QR_CORE", phases: ["collect"], order: 100,
        collect: (items, ctx) => {
          const binding = advancedLightingItemBinding(items[0]!, ctx);
          views.push({ owner: probeSourceOwner(ctx.source), texture: (binding?.uniforms.u_a3dNativeProbeTexture as TextureBinding | undefined)?.texture });
          return items;
        } });
      const camera = { viewProjectionMatrix: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
      const detachViews = attachRootRenderSource(canvas, { source: { views: [
        { id: "left", camera, viewport: { x: 0, y: 0, width: 100, height: 100 } },
        { id: "right", camera, viewport: { x: 100, y: 0, width: 100, height: 100 } }
      ] } });
      try {
        app.step(1 / 60);
        expect(views).toEqual([{ owner: app.nodes, texture: probeTexture }, { owner: app.nodes, texture: probeTexture }]);
        detachViews();
        views.length = 0;
        const target = device!.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: true });
        const detachTarget = attachRootRenderSource(canvas, { source: { renderTarget: target } });
        try {
          app.step(1 / 60);
          expect(views).toEqual([{ owner: app.nodes, texture: probeTexture }]);
        } finally { detachTarget(); target.dispose(); }
      } finally { detachViews(); unregisterViews(); }
      detachProbe();
      const detachVoxel = lighting.attachIndirect({ kind: "voxel", volume }, { maxDistance: 1 });
      app.step(1 / 60);
      expect((device!.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeVoxelTexture"))?.uniforms?.get("u_a3dNativeVoxelTexture") as TextureBinding | undefined)?.texture).toBe(volume.renderData().texture);
      detachVoxel();
      const detachMap = lighting.attachLightmap("card", baked, { composition: "add-indirect" });
      app.step(1 / 60);
      expect((device!.drawCommands.find((command) => command.uniforms?.has("u_a3dNativeLightmapTexture"))?.uniforms?.get("u_a3dNativeLightmapTexture") as TextureBinding | undefined)?.texture).toBe(baked.texture);
      app.setScene(scene().add(primitives.box({ name: "replacement", material: auraMaterial.pbr({ color: "#ffffff" }) })));
      await app.ready();
      expect(baked.texture.disposed).toBe(false);
      expect(device!.drawCommands.some((command) => command.uniforms?.has("u_a3dNativeLightmapTexture"))).toBe(false);
      detachMap();
      app.dispose();
      expect(probeTexture.disposed).toBe(false);
      expect(baked.texture.disposed).toBe(false);
      app = undefined;
    } finally {
      app?.dispose(); probe.dispose(); volume.dispose(); baked.texture.dispose();
      vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });

  it("submits public app lighting through the native-shaped WebGPU device bindings", async () => {
    const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
    const modules: { code: string }[] = [];
    const uploads: { texture: unknown; values: Float32Array }[] = [];
    const native = {
      queue: { submit() {}, writeBuffer() {}, writeTexture(destination: { texture: unknown }, data: ArrayBuffer | ArrayBufferView) {
        if (data instanceof Float32Array) uploads.push({ texture: destination.texture, values: data.slice() });
      }, onSubmittedWorkDone: async () => {} },
      createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
      createTexture: ({ label }: { label?: string }) => {
        const texture = { label, createView: () => ({ texture }), destroy() {} };
        return texture;
      },
      createSampler: () => ({}),
      createShaderModule: (descriptor: { code: string }) => { modules.push(descriptor); return descriptor; },
      createBindGroupLayout: (descriptor: object) => descriptor,
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline: () => ({ getBindGroupLayout: (index: number) => ({ index }) }),
      createBindGroup: (group: { entries: readonly { binding: number; resource: unknown }[] }) => { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {}, draw() {}, drawIndexed() {}, end() {} }),
        finish: () => ({})
      }),
      destroy() {}
    };
    const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }), unconfigure() {} };
    class FakeCanvas {
      width = 200; height = 100; clientWidth = 200; clientHeight = 100;
      style: Record<string, string> = {}; dataset: Record<string, string> = {}; parentElement = null;
      getBoundingClientRect() { return { width: 200, height: 100, left: 0, top: 0 }; }
      hasAttribute() { return false; }
      getContext(kind: string) { return kind === "webgpu" ? context : null; }
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
    vi.stubGlobal("window", { innerWidth: 200, innerHeight: 100, location: { href: "http://localhost/", search: "" }, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let device: WebGPUDevice | undefined;
    vi.spyOn(Renderer, "create").mockImplementation(async (options = {}) => {
      device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike },
        canvas: options.canvas, requireNativeRendering: true });
      return new Renderer(device, { ...options, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    });
    const probe = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [17, 1, 1], backend: "webgpu" });
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [1, 1, 1] }, quality: "low", resolution: 2 });
    const baked = lightmap();
    let app: ReturnType<typeof createAuraApp> | undefined;
    try {
      app = createAuraApp(new FakeCanvas() as unknown as HTMLCanvasElement, {
        scene: scene().add(primitives.box({ name: "card", material: auraMaterial.pbr({ color: "#ffffff" }) })),
        autoStart: false, resize: false, diagnostics: false, renderer: { backend: "webgpu" },
        qualityRebuild: { flags: { A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true, A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_POST: false } }
      });
      await app.ready();
      expect(device?.kind).toBe("webgpu");
      const lighting = app.lighting;
      if (!lighting) throw new Error("Lighting extension was not installed");
      const originalInfo = device!.info;
      Object.defineProperty(device!, "info", { configurable: true, value: { ...originalInfo,
        capabilities: originalInfo.capabilities?.filter((capability) => capability !== "native-sampled-textures") } });
      expect(() => lighting.attachIndirect({ kind: "probe-grid", grid: probe })).toThrow(/sampled textures/);
      Object.defineProperty(device!, "info", { configurable: true, value: originalInfo });
      const expectNativeTexture = (binding: number, texture: Texture) => {
        const entry = groups.flatMap((group) => group.entries).find((candidate) => candidate.binding === binding);
        expect((entry?.resource as { texture?: unknown } | undefined)?.texture).toBe(device!.getNativeTexture(texture));
      };
      const detachProbe = lighting.attachIndirect({ kind: "probe-grid", grid: probe });
      app.step(1 / 60);
      const probeTexture = probe.renderData().texture;
      expectNativeTexture(56, probeTexture);
      expect(modules.some((module) => module.code.includes("a3dNativeProbeCoefficient"))).toBe(true);
      const previousRevision = probeTexture.revision;
      probe.setProbeIrradiance(16, 0, 0, [1, 0, 0]);
      app.step(1 / 60);
      expect(probeTexture.revision).toBeGreaterThan(previousRevision);
      const probeUpload = uploads.filter((entry) => entry.texture === device!.getNativeTexture(probeTexture)).at(-1);
      expect(probeUpload?.values[16 * 9 * 4]).toBeCloseTo(1 / (Math.PI * 0.28209479177387814));
      detachProbe();
      expect(() => lighting.attachIndirect({ kind: "voxel", volume }, { maxDistance: 100 })).toThrow(/maxDistance/);
      volume.updateVoxel([0, 0, 0], { radiance: [1, 0.5, 0], opacity: 0.75 });
      const detachVolume = lighting.attachIndirect({ kind: "voxel", volume }, { maxDistance: 1 });
      await app.stepAsync(1 / 60);
      const voxelTexture = volume.renderData().texture;
      expectNativeTexture(57, voxelTexture);
      const voxelUpload = uploads.filter((entry) => entry.texture === device!.getNativeTexture(voxelTexture)).at(-1);
      expect(Array.from(voxelUpload!.values.slice(0, 4))).toEqual([0.75, 0.375, 0, 0.75]);
      expect(modules.some((module) => module.code.includes("a3dNativeVoxelCone"))).toBe(true);
      detachVolume();
      const detachMap = lighting.attachLightmap("card", baked, { composition: "add-indirect" });
      await app.stepAsync(1 / 60);
      expectNativeTexture(58, baked.texture);
      expect(modules.some((module) => module.code.includes("a3dNativeLightmapIrradiance"))).toBe(true);
      detachMap();
      app.dispose();
      expect(probeTexture.disposed).toBe(false);
      expect(baked.texture.disposed).toBe(false);
      app = undefined;
    } finally {
      app?.dispose(); probe.dispose(); volume.dispose(); baked.texture.dispose();
      vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });
});
