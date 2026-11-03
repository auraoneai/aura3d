import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd07";
import { forwardDrawReplaySafe } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { prd07ForwardFog, setPrd07ForwardFog } from "../../../packages/rendering/src/atmosphere/fogUniformStore";
import { prd07WetnessState, setPrd07WetnessState, type WetnessUniformState } from "../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import type { Prd07FogVolume } from "../../../packages/rendering/src/atmosphere/FogVolumes";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerFrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { registerMaterialLobe, type MaterialLobe } from "../../../packages/rendering/src/contracts/materialLobes";
import { registerShaderFeature, shaderFeaturesFor, type ShaderFeature } from "../../../packages/rendering/src/contracts/program";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { transmissionFrameContributor } from "../../../packages/rendering/src/forward/Transmission";
import { registerPrd04ShaderFeatures } from "../../../packages/rendering/src/materials/features";
import { registerPrd04MaterialLobes } from "../../../packages/rendering/src/materials/lobes";
import { bindShaderFeatureUniforms } from "../../../packages/rendering/src/program/FeatureSelect";
import { createRendererFrameHooks } from "../../../packages/rendering/src/renderer/FrameGraph";
import { registerPrd04ShaderChunks } from "../../../packages/rendering/src/shaders/physical/index";
import { isOriginalPrd07FeatureIdentity, originalPrd07FeatureFlag } from "../../../packages/rendering/src/vfx/replayFeatureIdentity";

const item = { geometry: {}, material: { shaderKey: "pbr" } } as unknown as RenderItem;
const flagsFor = (...enabled: string[]): QrFlags => createTrustedQrFlags(Object.fromEntries(enabled.map((name) => [name, true])));

describe("direct transmission preflight before program warmup", () => {
  beforeAll(() => {
    registerPrd04ShaderChunks();
    registerPrd04MaterialLobes();
    registerPrd04ShaderFeatures();
  });

  it.each([false, true])("rejects stateful untrusted flags before selecting a transmission provider (async=%s)", async asynchronous => {
    let flips = 0, descriptorReads = 0;
    const values = Object.freeze({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true,
      A3D_QR_CORE_OUTPUT: false, A3D_QR_MATERIALS_TRANSMISSION: true });
    const flags: QrFlags = { values, on(name) {
      if (name === "A3D_QR_MATERIALS_TRANSMISSION") return ++flips % 2 === 0;
      return values[name as keyof typeof values] === true;
    } };
    const unknown = new Proxy({ id: "prd04.toggleReplay", owner: "prd04", flag: "A3D_QR_MATERIALS",
      chunks: { pars: "", fragment: "" }, samplerSlots: [], feature: () => undefined, bind: () => {} }, {
      getOwnPropertyDescriptor() { descriptorReads += 1; throw new Error("unexpected provider inspection"); }
    }) as MaterialLobe;
    const unregister = registerMaterialLobe(unknown);
    descriptorReads = 0; // registration may inspect the flag; rendering must not.
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    try {
      const frame = { source: { cameraPolicy: "identity" as const, renderItems: [{ geometry, material: glass }] }, frameId: 1 };
      if (asynchronous) await expect(renderer.renderAsync(frame)).rejects.toMatchObject({ code: "TRANSMISSION_FLAGS_UNTRUSTED" });
      else expect(() => renderer.render(frame)).toThrow(/stable renderer feature flags/i);
      expect(descriptorReads).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); glass.dispose(); }
  });

  it.each([false, true])("rejects an unknown provider before its selector runs (async=%s)", async (asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TEST_REPLAY_VFX");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    expect(forwardDrawReplaySafe([{ geometry, material: opaque }], flags)).toBe(true);
    let calls = 0;
    const removeFeature = registerShaderFeature({
      id: "prd07.unknownWarmupReplay", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX", chunks: [], hooks: [],
      get select() { calls += 1; return () => { calls += 1; return true; }; }, defines: () => ({})
    });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      removeTransmission(); removeFeature(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([false, true])("rejects an unknown provider without reading accessor metadata (async=%s)", async (asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TEST_REPLAY_VFX");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    expect(forwardDrawReplaySafe([{ geometry, material: opaque }], flags)).toBe(true);
    let calls = 0;
    const removeFeature = registerShaderFeature({
      id: "prd07.unknownMetadataReplay", owner: "prd07", get flag() { calls += 1; return "A3D_QR_TEST_REPLAY_VFX" as const; },
      chunks: [], hooks: [], select: () => true, defines: () => ({})
    });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      removeTransmission(); removeFeature(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([false, true])("rejects a lobe with modified flag metadata without calling the getter (async=%s)", async (asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TEST_REPLAY_VFX");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    expect(forwardDrawReplaySafe([{ geometry, material: opaque }], flags)).toBe(true);
    let calls = 0;
    const lobe: MaterialLobe = { id: "prd07.unknownReplayLobe", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX",
      chunks: { pars: "unused", fragment: "unused" }, samplerSlots: [],
      feature: () => { calls += 1; return undefined; }, bind: () => { calls += 1; } };
    const removeLobe = registerMaterialLobe(lobe);
    const original = Object.getOwnPropertyDescriptor(lobe, "flag")!;
    Object.defineProperty(lobe, "flag", { configurable: true, enumerable: true,
      get() { calls += 1; return "A3D_QR_TEST_REPLAY_VFX"; } });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      Object.defineProperty(lobe, "flag", original);
      removeTransmission(); removeLobe(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([
    ["feature", false], ["feature", true], ["lobe", false], ["lobe", true]
  ] as const)("rejects an unknown %s proxy without invoking its trap (async=%s)", async (kind, asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TEST_REPLAY_VFX");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    expect(forwardDrawReplaySafe([{ geometry, material: opaque }], flags)).toBe(true);
    let calls = 0;
    let registering = true;
    const trap = (target: object, key: string | symbol) => {
      calls += 1;
      if (!registering) throw new Error("untrusted descriptor trap");
      return Reflect.getOwnPropertyDescriptor(target, key);
    };
    const feature: ShaderFeature = { id: "prd07.unknownProxy", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX",
      chunks: [], hooks: [], select: () => { calls += 1; return true; }, defines: () => ({}) };
    const lobe: MaterialLobe = { id: "prd07.unknownProxyLobe", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX",
      chunks: { pars: "unused", fragment: "unused" }, samplerSlots: [],
      feature: () => { calls += 1; return undefined; }, bind: () => { calls += 1; } };
    const remove = kind === "feature"
      ? registerShaderFeature(new Proxy<ShaderFeature>(feature, { getOwnPropertyDescriptor: trap }))
      : registerMaterialLobe(new Proxy<MaterialLobe>(lobe, { getOwnPropertyDescriptor: trap }));
    registering = false;
    calls = 0;
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const source = { cameraPolicy: "identity" as const, staticBatching: true, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      removeTransmission(); remove(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([false, true])("rejects flags that can toggle provider activation (async=%s)", async (asynchronous) => {
    const base = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_TEST_REPLAY_VFX");
    let probes = 0, selections = 0;
    const flags: QrFlags = {
      values: Object.freeze({ ...base.values, A3D_QR_CORE_OUTPUT: false }),
      on: (name) => name === "A3D_QR_TEST_REPLAY_VFX" ? (++probes % 2 === 0) : base.on(name)
    };
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    const removeFeature = registerShaderFeature({ id: "prd07.togglingReplay", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX",
      chunks: [], hooks: [], select: () => { selections += 1; return true; }, defines: () => ({}) });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_FLAGS_UNTRUSTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/stable renderer feature flags/i);
      expect(selections).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      removeTransmission(); removeFeature(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([false, true])("rejects wetness before its caller-installed getter runs (async=%s)", async (asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_VFX");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    const state = prd07WetnessState(), original = Object.getOwnPropertyDescriptor(state, "wetness")!;
    let calls = 0;
    Object.defineProperty(state, "wetness", { configurable: true, enumerable: true,
      get() { calls += 1; return 0.5; } });
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ] };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      Object.defineProperty(state, "wetness", original);
      removeTransmission(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });

  it.each([false, true])("rejects fog before reading a caller-owned volume (async=%s)", async (asynchronous) => {
    const baseFlags = flagsFor("A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_MATERIALS",
      "A3D_QR_MATERIALS_TRANSMISSION", "A3D_QR_VFX_FOG");
    const flags = createTrustedQrFlags({ ...baseFlags.values, A3D_QR_CORE_OUTPUT: false });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), opaque = new PBRMaterial(), glass = new PBRMaterial({ transmissionFactor: 0.5 });
    const removeTransmission = registerFrameContributor(transmissionFrameContributor);
    let calls = 0;
    const volume = { shape: "box" as const, center: [0, 0, 0], halfSize: [1, 1, 1],
      get density() { calls += 1; return 0.5; } };
    const source = { cameraPolicy: "identity" as const, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: glass, label: "glass" }
    ], atmosphere: { resolveFog: () => ({ mode: "height" }), fogVolumes: () => [volume], sky: null } };
    try {
      if (asynchronous) await expect(renderer.renderAsync({ source, frameId: 1 })).rejects.toMatchObject({ code: "TRANSMISSION_REPLAY_UNSUPPORTED" });
      else expect(() => renderer.render({ source, frameId: 1 })).toThrow(/replay/i);
      expect(calls).toBe(0);
      expect((renderer.device as MockRenderDevice).drawCommands.filter((command) => command.label === "opaque")).toHaveLength(0);
    } finally {
      removeTransmission(); renderer.dispose(); geometry.dispose(); opaque.dispose(); glass.dispose();
    }
  });
});
const fogFlags = flagsFor("A3D_QR_VFX_FOG");
const wetnessFlags = flagsFor("A3D_QR_VFX");
const noFlags = flagsFor();

function frame(
  device: MockRenderDevice,
  scope: object,
  viewId: string,
  frameIndex: number,
  color: readonly [number, number, number],
  volumes: readonly Prd07FogVolume[] = []
): FrameContributorContext {
  const hooks = createRendererFrameHooks({
    device, postScopeId: scope, viewId, frameIndex, width: 1, height: 1, camera: null, flags: fogFlags,
    source: { atmosphere: { resolveFog: () => ({ mode: "absorption", color, absorption: [0.1, 0.2, 0.3] }),
      fogVolumes: () => volumes, sky: null } } as never
  });
  hooks.collect([]);
  return hooks.frameContext([]);
}

function bound(feature: "prd07.fog" | "prd07.wetness", frameContext?: FrameContributorContext): Map<string, UniformValue> {
  const uniforms = new Map<string, UniformValue>();
  const flags = feature === "prd07.fog" ? fogFlags : wetnessFlags;
  bindShaderFeatureUniforms({ [feature]: feature === "prd07.fog" ? "height" : true }, flags, item,
    (name, value) => uniforms.set(name, value), frameContext);
  return uniforms;
}

let previousFog: ReturnType<typeof prd07ForwardFog>;
let previousWetness: WetnessUniformState;
beforeEach(() => {
  previousFog = prd07ForwardFog();
  previousWetness = { ...prd07WetnessState() };
  setPrd07ForwardFog(null);
  setPrd07WetnessState({ wetness: 0, puddleThreshold: 0.62, rainRipples: 0, snowCover: 0, puddleNoise: null });
});
afterEach(() => {
  setPrd07ForwardFog(previousFog);
  setPrd07WetnessState(previousWetness);
});

describe("direct replay and PRD07 stateful shader features", () => {
  it.each([
    ["prd07.fog", fogFlags, "A3D_QR_VFX_FOG"],
    ["prd07.wetness", wetnessFlags, "A3D_QR_VFX"]
  ] as const)("recognizes only the unchanged inactive %s identity", (id, flags, expectedFlag) => {
    const feature = shaderFeaturesFor(flags).find((entry) => entry.id === id)!;
    expect(originalPrd07FeatureFlag(feature)).toBe(expectedFlag);
    expect(forwardDrawReplaySafe([], noFlags)).toBe(true);
    expect(forwardDrawReplaySafe([], flags)).toBe(false);
    let calls = 0;
    const wrapped = new Proxy(feature, { getOwnPropertyDescriptor() { calls += 1; throw new Error("proxy trap"); } });
    expect(isOriginalPrd07FeatureIdentity(feature)).toBe(true);
    expect(isOriginalPrd07FeatureIdentity(wrapped)).toBe(false);
    expect(originalPrd07FeatureFlag(wrapped)).toBeUndefined();
    expect(calls).toBe(0);
    for (const key of ["flag", "select", "defines", "bindUniforms"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(feature, key)!;
      Object.defineProperty(feature, key, { configurable: true, enumerable: true,
        get() { calls += 1; return descriptor.value; } });
      try {
        expect(originalPrd07FeatureFlag(feature)).toBeUndefined();
        expect(forwardDrawReplaySafe([], noFlags)).toBe(false);
        expect(forwardDrawReplaySafe([], flags)).toBe(false);
        expect(calls).toBe(0);
      } finally { Object.defineProperty(feature, key, descriptor); }
    }
    const chunks = feature.chunks as string[], before = chunks[0]!;
    chunks[0] = "changed";
    try {
      expect(originalPrd07FeatureFlag(feature)).toBeUndefined();
      expect(forwardDrawReplaySafe([], noFlags)).toBe(false);
      expect(forwardDrawReplaySafe([], flags)).toBe(false);
    } finally { chunks[0] = before; }
    expect(originalPrd07FeatureFlag(feature)).toBe(expectedFlag);
  });

  it("repeats ordinary fog and wetness bindings without changing their stores", () => {
    const device = new MockRenderDevice();
    const fogFrame = frame(device, {}, "main", 1, [0.2, 0.4, 0.6]);
    setPrd07WetnessState({ wetness: 0.4, puddleThreshold: 0.3, rainRipples: 0.2, snowCover: 0.1 });
    const fogState = prd07ForwardFog();
    const wetnessState = prd07WetnessState();
    const firstFog = bound("prd07.fog", fogFrame);
    const secondFog = bound("prd07.fog", fogFrame);
    expect(secondFog).toEqual(firstFog);
    expect(prd07ForwardFog()).toBe(fogState);
    const firstWet = bound("prd07.wetness", fogFrame);
    const secondWet = bound("prd07.wetness", fogFrame);
    for (const name of ["u_wetness", "u_puddleThreshold", "u_rainRipples", "u_snowCover"]) {
      expect(secondWet.get(name)).toEqual(firstWet.get(name));
    }
    expect(firstWet.get("u_puddleNoise")).toBeInstanceOf(TextureBinding);
    expect(secondWet.get("u_puddleNoise")).toEqual(firstWet.get("u_puddleNoise"));
    expect(secondWet.get("u_puddleNoise")).not.toBe(firstWet.get("u_puddleNoise"));
    expect(prd07WetnessState()).toBe(wetnessState);
    device.dispose();
  });

  it.each(["app", "device", "view", "frame"] as const)("does not isolate fog by %s", (dimension) => {
    const firstDevice = new MockRenderDevice();
    const secondDevice = dimension === "device" ? new MockRenderDevice() : firstDevice;
    const firstScope = {};
    const secondScope = dimension === "app" ? {} : firstScope;
    try {
      const first = frame(firstDevice, firstScope, "left", 1, [1, 0, 0]);
      expect(bound("prd07.fog", first).get("u_fogColor")).toEqual([1, 0, 0]);
      const second = frame(secondDevice, secondScope, dimension === "view" ? "right" : "left",
        dimension === "frame" ? 2 : 1, [0, 1, 0]);
      expect(bound("prd07.fog", second).get("u_fogColor")).toEqual([0, 1, 0]);
      // The first frame's blackboard still holds its own fog, but the binder ignores it.
      expect((first.blackboard.get("prd07.fog") as { uniforms: { fogColor: number[] } }).uniforms.fogColor).toEqual([1, 0, 0]);
      expect(bound("prd07.fog", first).get("u_fogColor")).toEqual([0, 1, 0]);
    } finally {
      firstDevice.dispose();
      if (secondDevice !== firstDevice) secondDevice.dispose();
    }
  });

  it.each(["app", "device", "view", "frame"] as const)("does not isolate wetness by %s", (dimension) => {
    const firstDevice = new MockRenderDevice();
    const secondDevice = dimension === "device" ? new MockRenderDevice() : firstDevice;
    const firstScope = {};
    const secondScope = dimension === "app" ? {} : firstScope;
    try {
      const first = frame(firstDevice, firstScope, "left", 1, [1, 0, 0]);
      const second = frame(secondDevice, secondScope, dimension === "view" ? "right" : "left",
        dimension === "frame" ? 2 : 1, [0, 1, 0]);
      setPrd07WetnessState({ wetness: 0.2 });
      expect(bound("prd07.wetness", first).get("u_wetness")).toBe(0.2);
      setPrd07WetnessState({ wetness: 0.8 });
      expect(bound("prd07.wetness", second).get("u_wetness")).toBe(0.8);
      expect(bound("prd07.wetness", first).get("u_wetness")).toBe(0.8);
    } finally {
      firstDevice.dispose();
      if (secondDevice !== firstDevice) secondDevice.dispose();
    }
  });

  it("retains fog volumes that can run caller code and change values on each bind", () => {
    const device = new MockRenderDevice();
    let reads = 0;
    const volume: Prd07FogVolume = {
      shape: "box", center: [0, 0, 0], halfSize: [1, 1, 1],
      get density() { reads += 1; return reads * 0.25; }
    };
    try {
      const current = frame(device, {}, "main", 1, [1, 0, 0], [volume]);
      expect(reads).toBe(0);
      expect(forwardDrawReplaySafe([], fogFlags)).toBe(false);
      expect(reads).toBe(0);
      const first = bound("prd07.fog", current).get("u_fogVolumes") as Float32Array;
      const second = bound("prd07.fog", current).get("u_fogVolumes") as Float32Array;
      expect(reads).toBe(2);
      expect(first[7]).toBe(0.25);
      expect(second[7]).toBe(0.5);
    } finally { device.dispose(); }
  });

  it("exposes mutable wetness values and binds an uninspected caller texture", () => {
    const texture = new Texture({ width: 1, height: 1 });
    let callbacks = 0;
    texture.pollContentRevision = () => { callbacks += 1; };
    try {
      setPrd07WetnessState({ wetness: 0.2, puddleNoise: texture });
      const exposed = prd07WetnessState() as { wetness: number };
      expect(bound("prd07.wetness").get("u_wetness")).toBe(0.2);
      exposed.wetness = 0.8;
      const next = bound("prd07.wetness");
      expect(next.get("u_wetness")).toBe(0.8);
      expect((next.get("u_puddleNoise") as TextureBinding).texture).toBe(texture);
      expect(forwardDrawReplaySafe([], wetnessFlags)).toBe(false);
      expect(callbacks).toBe(0);
    } finally { texture.dispose(); }
  });

  it("can execute a caller-installed wetness accessor on each bind", () => {
    setPrd07WetnessState({ wetness: 0.25 });
    const state = prd07WetnessState();
    const descriptor = Object.getOwnPropertyDescriptor(state, "wetness")!;
    let reads = 0;
    Object.defineProperty(state, "wetness", { configurable: true, enumerable: true,
      get() { reads += 1; return reads * 0.25; } });
    try {
      expect(forwardDrawReplaySafe([], wetnessFlags)).toBe(false);
      expect(reads).toBe(0);
      expect(bound("prd07.wetness").get("u_wetness")).toBe(0.25);
      expect(bound("prd07.wetness").get("u_wetness")).toBe(0.5);
      expect(reads).toBe(2);
    } finally { Object.defineProperty(state, "wetness", descriptor); }
  });

  it.each([
    ["prd07.fog", fogFlags],
    ["prd07.wetness", wetnessFlags]
  ] as const)("rejects %s even when idle and without invoking modified callbacks", (id, flags) => {
    expect(forwardDrawReplaySafe([], noFlags)).toBe(true);
    const feature = shaderFeaturesFor(flags).find((entry) => entry.id === id)!;
    expect(feature).toBeDefined();
    expect(forwardDrawReplaySafe([], flags)).toBe(false);
    let calls = 0;
    const original = feature.select;
    Object.assign(feature, { select: () => { calls += 1; return undefined; } });
    try {
      expect(forwardDrawReplaySafe([], flags)).toBe(false);
      expect(calls).toBe(0);
    } finally { Object.assign(feature, { select: original }); }
  });

  it("rejects an unknown same-owner provider without executing it", () => {
    const unknownFlags = flagsFor("A3D_QR_TEST_REPLAY_VFX");
    let calls = 0;
    const remove = registerShaderFeature({
      id: "prd07.unknownReplay", owner: "prd07", flag: "A3D_QR_TEST_REPLAY_VFX", chunks: [], hooks: [],
      select: () => { calls += 1; return true; }, defines: () => ({})
    });
    try {
      expect(forwardDrawReplaySafe([], unknownFlags)).toBe(false);
      expect(calls).toBe(0);
    } finally { remove(); }
    expect(forwardDrawReplaySafe([], unknownFlags)).toBe(true);
  });
});
