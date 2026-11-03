import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd07";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type RenderDevice, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { prd07ForwardFog, setPrd07ForwardFog } from "../../../packages/rendering/src/atmosphere/fogUniformStore";
import { prd07WetnessState, setPrd07WetnessState, type WetnessUniformState } from "../../../packages/rendering/src/atmosphere/shaders/wetness.glsl";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { frameContributors, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { shaderFeaturesFor, type ShaderFeatureSelectInput } from "../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { bindShaderFeatureUniforms, selectShaderFeatureBits } from "../../../packages/rendering/src/program/FeatureSelect";
import { createRendererFrameHooks } from "../../../packages/rendering/src/renderer/FrameGraph";
import {
  beginPrd07Frame,
  createPrd07FrameScope,
  createPrd07ManagedFrameBinding,
  disposePrd07FrameScope,
  endPrd07Frame,
  producePrd07ManagedFrame,
  registerPrd07ManagedFrameContext,
  requirePrd07ManagedFrame,
  revokePrd07DeviceGeneration,
  type Prd07FrameDraft,
  type Prd07FrameProducer
} from "../../../packages/rendering/src/vfx/Prd07FrameState";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_VFX: true, A3D_QR_VFX_FOG: true });
const wetOnly = createTrustedQrFlags({ A3D_QR_VFX: true });
const item = { geometry: {}, material: { shaderKey: "pbr" } } as unknown as RenderItem;

function fill(draft: Prd07FrameDraft, color: [number, number, number], wetness: number) {
  draft.beginFog(5, 0, 100);
  draft.setFogA(0.1, 0.2, 0.3, 0.4);
  draft.setFogB(1, 1, 0, 0.5);
  draft.setFogColor(color[0], color[1], color[2]);
  draft.setFogAbsorption(0.1, 0.2, 0.3);
  draft.setSunDirection(0, 1, 0);
  draft.setSunColor(1, 1, 1);
  draft.setCameraPosition(1, 2, 3);
  draft.addFogVolume("box", 4, 5, 6, 1, 2, 3, 0.25);
  draft.setWetness(wetness, 0.62, 0, 0, null);
}

function setup(producer: Prd07FrameProducer, options: { readonly view?: string; readonly frameIndex?: number;
  readonly wetOnly?: boolean; readonly device?: MockRenderDevice; readonly renderer?: object } = {}) {
  const device = options.device ?? new MockRenderDevice(), renderer = options.renderer ?? {}, sourceOwner = {};
  const generation = (device as RenderDevice).generation ?? 0;
  const view = options.view ?? "main", frameIndex = options.frameIndex ?? 7;
  const currentFlags = options.wetOnly ? wetOnly : flags;
  const scope = createPrd07FrameScope(renderer, device, generation);
  const frame = beginPrd07Frame(scope, renderer, device, generation, view, frameIndex);
  const binding = createPrd07ManagedFrameBinding(scope, frame, renderer, device, generation, view, frameIndex, sourceOwner, producer);
  const hooks = createRendererFrameHooks({ device, postScopeId: renderer, viewId: view, frameIndex,
    width: 1, height: 1, camera: null, source: {}, flags: currentFlags });
  const collectContext = hooks.frameContext([]), drawContext = hooks.frameContext([item]);
  registerPrd07ManagedFrameContext(collectContext, binding, sourceOwner, renderer, device, generation, view, frameIndex);
  registerPrd07ManagedFrameContext(drawContext, binding, sourceOwner, renderer, device, generation, view, frameIndex);
  return { device, renderer, sourceOwner, generation, view, frameIndex, scope, frame, binding, hooks,
    collectContext, drawContext, flags: currentFlags };
}

function contributor(id: string, currentFlags = flags) {
  const found = frameContributors(currentFlags).find((entry) => entry.id === id);
  if (!found?.collect) throw new Error(`missing contributor ${id}`);
  return found;
}

function select(frameContext: FrameContributorContext, currentFlags = flags) {
  return selectShaderFeatureBits({ item, pass: "forward", tier: QUALITY_TIERS.high, flags: currentFlags, frameContext });
}

function bind(frameContext: FrameContributorContext, currentFlags = flags): Map<string, UniformValue> {
  const values = new Map<string, UniformValue>();
  bindShaderFeatureUniforms({ "prd07.fog": "height", "prd07.wetness": true }, currentFlags, item,
    (name, value) => values.set(name, value), frameContext);
  return values;
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

describe("staged PRD07 managed collection and feature consumption", () => {
  it("collects once and selects and binds only the captured packet", () => {
    const color: [number, number, number] = [0.2, 0.4, 0.6];
    let productions = 0;
    let retainedDraft: Prd07FrameDraft | undefined;
    const ctx = setup((draft) => { productions += 1; retainedDraft = draft; fill(draft, color, 0.7); });
    try {
      expect(() => select(ctx.drawContext)).toThrow(/FRAME_UNAVAILABLE/);
      expect(() => bind(ctx.drawContext)).toThrow(/FRAME_UNAVAILABLE/);
      contributor("prd07.fog").collect!([], ctx.collectContext);
      contributor("prd07.wetness").collect!([], ctx.collectContext);
      expect(productions).toBe(1);
      expect(Object.isFrozen(retainedDraft)).toBe(true);
      expect(retainedDraft).not.toHaveProperty("publish");
      expect(() => retainedDraft!.setWetness(0.9, 0.62, 0, 0, null)).toThrow(/WRITER_CLOSED/);
      expect(prd07ForwardFog()).toBeNull();
      expect(prd07WetnessState().wetness).toBe(0);
      color[0] = 0.9;
      setPrd07WetnessState({ wetness: 0.1 });
      ctx.drawContext.blackboard.set("prd07.fog", { uniforms: { fogColor: [1, 0, 0] } });
      expect(select(ctx.drawContext)).toMatchObject({ "prd07.fog": expect.any(String), "prd07.wetness": true });
      const first = bind(ctx.drawContext), second = bind(ctx.drawContext);
      expect(first.get("u_fogColor")).toEqual([0.2, 0.4, 0.6]);
      expect(first.get("u_wetness")).toBe(0.7);
      expect((first.get("u_fogVolumes") as Float32Array)[7]).toBe(0.25);
      expect((first.get("u_puddleNoise") as TextureBinding).texture).toBeNull();
      expect(second).toEqual(first);
      (first.get("u_fogColor") as number[])[0] = 1;
      (first.get("u_fogVolumes") as Float32Array)[7] = 9;
      expect(bind(ctx.drawContext).get("u_fogColor")).toEqual([0.2, 0.4, 0.6]);
      expect((bind(ctx.drawContext).get("u_fogVolumes") as Float32Array)[7]).toBe(0.25);
      expect(productions).toBe(1);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it("collects a wetness-only packet without a fog feature or global state", () => {
    let productions = 0;
    const ctx = setup((draft) => { productions += 1; draft.setWetness(0.6, 0.62, 0, 0, null); }, { wetOnly: true });
    try {
      contributor("prd07.wetness", wetOnly).collect!([], ctx.collectContext);
      expect(select(ctx.drawContext, wetOnly)).toEqual({ "prd07.wetness": true });
      expect(bind(ctx.drawContext, wetOnly).get("u_wetness")).toBe(0.6);
      expect(requirePrd07ManagedFrame(ctx.drawContext).fog).toBeNull();
      expect(prd07WetnessState().wetness).toBe(0);
      expect(productions).toBe(1);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it("keeps two independently registered frames isolated when collected and bound interleaved", () => {
    const a = setup((draft) => fill(draft, [1, 0, 0], 0.2), { view: "left", frameIndex: 1 });
    const b = setup((draft) => fill(draft, [0, 1, 0], 0.8), { view: "right", frameIndex: 2 });
    try {
      contributor("prd07.fog").collect!([], a.collectContext);
      contributor("prd07.fog").collect!([], b.collectContext);
      expect(bind(a.drawContext).get("u_fogColor")).toEqual([1, 0, 0]);
      expect(bind(a.drawContext).get("u_wetness")).toBe(0.2);
      expect(bind(b.drawContext).get("u_fogColor")).toEqual([0, 1, 0]);
      expect(bind(b.drawContext).get("u_wetness")).toBe(0.8);
    } finally {
      disposePrd07FrameScope(a.scope); disposePrd07FrameScope(b.scope);
      a.device.dispose(); b.device.dispose();
    }
  });

  it("keeps two renderer owners isolated when they share the same device", () => {
    const device = new MockRenderDevice();
    const a = setup((draft) => fill(draft, [1, 0, 0], 0.2), { device, view: "main", frameIndex: 1 });
    const b = setup((draft) => fill(draft, [0, 1, 0], 0.8), { device, view: "main", frameIndex: 1 });
    try {
      contributor("prd07.fog").collect!([], a.collectContext);
      contributor("prd07.fog").collect!([], b.collectContext);
      expect(bind(a.drawContext).get("u_fogColor")).toEqual([1, 0, 0]);
      expect(bind(a.drawContext).get("u_wetness")).toBe(0.2);
      expect(bind(b.drawContext).get("u_fogColor")).toEqual([0, 1, 0]);
      expect(bind(b.drawContext).get("u_wetness")).toBe(0.8);
    } finally { disposePrd07FrameScope(a.scope); disposePrd07FrameScope(b.scope); device.dispose(); }
  });

  it("does not touch a caller-modified ambient wetness getter on the managed path", () => {
    const ctx = setup((draft) => fill(draft, [0.2, 0.4, 0.6], 0.7));
    const legacy = prd07WetnessState(), original = Object.getOwnPropertyDescriptor(legacy, "wetness")!;
    let calls = 0;
    Object.defineProperty(legacy, "wetness", { configurable: true, enumerable: true,
      get() { calls += 1; throw new Error("ambient getter"); } });
    try {
      contributor("prd07.fog").collect!([], ctx.collectContext);
      expect(select(ctx.drawContext)["prd07.wetness"]).toBe(true);
      expect(bind(ctx.drawContext).get("u_wetness")).toBe(0.7);
      expect(calls).toBe(0);
    } finally {
      Object.defineProperty(legacy, "wetness", original);
      disposePrd07FrameScope(ctx.scope); ctx.device.dispose();
    }
  });

  it("keeps unregistered contexts on the legacy path and rejects mismatched registration", () => {
    const ctx = setup((draft) => fill(draft, [0.2, 0.4, 0.6], 0.7));
    try {
      setPrd07WetnessState({ wetness: 1 });
      const unknown = ctx.hooks.frameContext([item]);
      expect(select(unknown)).toMatchObject({ "prd07.wetness": true });
      expect(bind(unknown).get("u_wetness")).toBe(1);
      expect(() => contributor("prd07.fog").collect!([], unknown)).not.toThrow();
      expect(() => registerPrd07ManagedFrameContext(unknown, ctx.binding, {}, ctx.renderer, ctx.device,
        ctx.generation, ctx.view, ctx.frameIndex)).toThrow(/CONTEXT_INVALID/);
      expect(() => select(unknown)).toThrow(/CONTEXT_INVALID/);
      expect(() => bind(unknown)).toThrow(/CONTEXT_INVALID/);
      expect(() => contributor("prd07.fog").collect!([], unknown)).toThrow(/CONTEXT_INVALID/);
      expect(() => registerPrd07ManagedFrameContext(unknown, ctx.binding, ctx.sourceOwner, ctx.renderer, ctx.device,
        ctx.generation, ctx.view, ctx.frameIndex)).toThrow(/CONTEXT_INVALID/);
      const wrongDevice = ctx.hooks.frameContext([item]), wrongView = ctx.hooks.frameContext([item]);
      expect(() => registerPrd07ManagedFrameContext(wrongDevice, ctx.binding, ctx.sourceOwner, ctx.renderer, {},
        ctx.generation, ctx.view, ctx.frameIndex)).toThrow(/CONTEXT_INVALID/);
      expect(() => registerPrd07ManagedFrameContext(wrongView, ctx.binding, ctx.sourceOwner, ctx.renderer, ctx.device,
        ctx.generation, "different-view", ctx.frameIndex)).toThrow(/CONTEXT_INVALID/);
      expect(() => createPrd07ManagedFrameBinding(ctx.scope, ctx.frame, ctx.renderer, {}, ctx.generation,
        ctx.view, ctx.frameIndex, ctx.sourceOwner, () => {})).toThrow(/BINDING_INVALID/);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it("does not inspect unregistered context proxies when using the legacy path", () => {
    const ctx = setup((draft) => fill(draft, [1, 0, 0], 0.7));
    let calls = 0;
    const proxy = new Proxy(ctx.drawContext, {
      get() { calls += 1; throw new Error("context getter"); },
      getOwnPropertyDescriptor() { calls += 1; throw new Error("context descriptor"); }
    });
    try {
      expect(select(proxy)).toEqual({});
      expect(bind(proxy).get("u_wetness")).toBe(0);
      expect(calls).toBe(0);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it("revokes selection and binding after frame end or device generation loss", () => {
    const a = setup((draft) => fill(draft, [1, 0, 0], 0.7));
    const b = setup((draft) => fill(draft, [0, 1, 0], 0.4));
    try {
      contributor("prd07.fog").collect!([], a.collectContext);
      contributor("prd07.fog").collect!([], b.collectContext);
      expect(endPrd07Frame(a.frame)).toBe(true);
      expect(() => select(a.drawContext)).toThrow(/FRAME_REVOKED/);
      expect(() => bind(a.drawContext)).toThrow(/FRAME_REVOKED/);
      expect(revokePrd07DeviceGeneration(b.device, b.generation)).toBe(1);
      expect(() => select(b.drawContext)).toThrow(/FRAME_REVOKED/);
      expect(() => bind(b.drawContext)).toThrow(/FRAME_REVOKED/);
    } finally {
      disposePrd07FrameScope(a.scope); disposePrd07FrameScope(b.scope);
      a.device.dispose(); b.device.dispose();
    }
  });

  it("rejects unverified textures and leaves a failed producer unavailable", () => {
    let reads = 0, productions = 0;
    const texture = new Proxy({}, { get() { reads += 1; throw new Error("texture access"); } });
    const ctx = setup((draft) => { productions += 1; draft.setWetness(0.5, 0.62, 0, 0, texture as unknown as null); });
    try {
      expect(() => contributor("prd07.fog").collect!([], ctx.collectContext)).toThrow(/TEXTURE_UNVERIFIED/);
      expect(() => producePrd07ManagedFrame(ctx.collectContext)).toThrow(/PRODUCER_UNAVAILABLE/);
      expect(() => select(ctx.drawContext)).toThrow(/FRAME_UNAVAILABLE/);
      expect(() => bind(ctx.drawContext)).toThrow(/FRAME_UNAVAILABLE/);
      expect(reads).toBe(0);
      expect(productions).toBe(1);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it.each(["throw", "promise"] as const)("closes retained drafts when a producer returns %s", (failure) => {
    let retained: Prd07FrameDraft | undefined;
    const ctx = setup((draft) => {
      retained = draft;
      draft.setWetness(0.5, 0.62, 0, 0, null);
      if (failure === "throw") throw new Error("producer failed");
      return Promise.resolve() as unknown as void;
    });
    try {
      expect(() => contributor("prd07.fog").collect!([], ctx.collectContext))
        .toThrow(failure === "throw" ? /producer failed/ : /SYNCHRONOUS_REQUIRED/);
      expect(() => retained!.setWetness(0.9, 0.62, 0, 0, null)).toThrow(/WRITER_CLOSED/);
      expect(() => producePrd07ManagedFrame(ctx.collectContext)).toThrow(/PRODUCER_UNAVAILABLE/);
      expect(() => select(ctx.drawContext)).toThrow(/FRAME_UNAVAILABLE/);
    } finally { disposePrd07FrameScope(ctx.scope); ctx.device.dispose(); }
  });

  it("keeps direct no-frame 4.x selection and binding on the standalone stores", () => {
    setPrd07WetnessState({ wetness: 0.5 });
    const input: ShaderFeatureSelectInput = { item, pass: "forward", tier: QUALITY_TIERS.high, flags };
    expect(shaderFeaturesFor(flags).find((f) => f.id === "prd07.wetness")!.select(input)).toBe(true);
    const values = new Map<string, UniformValue>();
    bindShaderFeatureUniforms({ "prd07.wetness": true }, flags, item, (name, value) => values.set(name, value));
    expect(values.get("u_wetness")).toBe(0.5);
  });

  it.each([false, true])("keeps an unregistered VFX-enabled mock renderer working (async=%s)", async (asynchronous) => {
    setPrd07WetnessState({ wetness: 0.4 });
    const renderer = await Renderer.create({ backend: "mock", width: 1, height: 1, qrFlags: flags });
    const geometry = Geometry.box(), material = new PBRMaterial();
    const source = { cameraPolicy: "identity" as const, renderItems: [{ geometry, material, label: "legacy-vfx" }],
      atmosphere: { resolveFog: () => ({ mode: "absorption", absorption: [0.1, 0.2, 0.3] }), fogVolumes: () => [], sky: null } };
    try {
      if (asynchronous) await renderer.renderAsync({ source, frameId: 1 });
      else renderer.render({ source, frameId: 1 });
      const draw = (renderer.device as MockRenderDevice).drawCommands.find((command) => command.label === "legacy-vfx");
      expect(draw).toBeDefined();
      expect(draw!.uniforms!.get("u_fogMode")).toBe(5);
      expect(draw!.uniforms!.get("u_wetness")).toBe(0.4);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});
