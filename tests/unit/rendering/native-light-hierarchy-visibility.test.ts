import { describe, expect, it, vi } from "vitest";
import { Scene, SceneNode } from "@aura3d/scene";
import { LightCollector } from "../../../packages/rendering/src/LightCollector";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { createPrd02ContactShadowsContributor } from "../../../packages/rendering/src/passes/Prd02ContactShadowsContributor";
import { setRendererQrFlags, withRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererShadowOrchestrator } from "../../../packages/rendering/src/renderer/ShadowOrchestration";
import { prd02LocalShadowLights, prd02SunDirection } from "../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { collectShadowSystemLights } from "../../../packages/rendering/src/shadows/Prd02ShadowsContributor";

function fixture() {
  const scene = new Scene();
  const outside = new SceneNode({ name: "outside" });
  const hidden = scene.createNode("hidden");
  const nested = scene.createNode("nested");
  const visibleGroup = scene.createNode("visible-group");
  const hiddenSun = scene.createLight("directional", "hidden-sun");
  const hiddenPoint = scene.createLight("point", "hidden-point");
  const visibleSun = scene.createLight("directional", "visible-sun");
  const visibleSpot = scene.createLight("spot", "visible-spot");
  const visiblePoint = scene.createLight("point", "visible-point");
  outside.addChild(scene.root);
  scene.root.addChild(hidden).addChild(visibleSun).addChild(visibleGroup);
  hidden.addChild(nested);
  nested.addChild(hiddenSun).addChild(hiddenPoint);
  visibleGroup.addChild(visibleSpot).addChild(visiblePoint);
  hidden.visible = false;
  hiddenSun.intensity = 10;
  hiddenPoint.intensity = 8;
  visibleSun.intensity = 5;
  visibleSpot.intensity = 3;
  visiblePoint.intensity = 3;
  for (const light of [hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint]) light.castsShadow = true;
  hiddenSun.transform.setRotation(0, Math.SQRT1_2, 0, Math.SQRT1_2);
  visibleGroup.transform.setPosition(3, 4, 0);
  visibleSpot.transform.setPosition(1, 0, 0);
  visiblePoint.transform.setPosition(2, 0, 0);
  scene.updateWorldTransforms();
  return { scene, outside, hidden, nested, visibleGroup, hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint };
}

function shadowLights(source: unknown) {
  return collectShadowSystemLights({ source } as FrameContributorContext);
}

function expectDirection(actual: readonly number[] | null, expected: readonly number[]): void {
  expect(actual).not.toBeNull();
  expected.forEach((value, index) => expect(actual![index]).toBeCloseTo(value, 6));
}

describe("hierarchical scene-light visibility", () => {
  it("filters inherited visibility while preserving intensity order, stable ties, options, and recovery", () => {
    const { scene, hidden, nested, hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint } = fixture();
    const collector = new LightCollector();
    const names = (options = {}) => collector.collect(scene, options).map(({ source }) => source.name);
    visibleSpot.layerMask = 2;
    visiblePoint.layerMask = 2;
    hiddenPoint.layerMask = 2;

    expect(names()).toEqual(["visible-sun", "visible-spot", "visible-point"]);
    expect(names({ layerMask: 2, maxLights: 1 })).toEqual(["visible-spot"]);
    expect(names({ includeDisabled: true })).toEqual(["hidden-sun", "hidden-point", "visible-sun", "visible-spot", "visible-point"]);
    expect(hiddenSun.visible).toBe(true);
    expect(hiddenPoint.visible).toBe(true);
    expect(scene.collectLights()).toEqual([hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint]);

    hidden.visible = true;
    nested.visible = false;
    expect(names()).toEqual(["visible-sun", "visible-spot", "visible-point"]);
    nested.visible = true;
    expect(names()).toEqual(["hidden-sun", "hidden-point", "visible-sun", "visible-spot", "visible-point"]);
    visibleSpot.visible = false;
    expect(names({ layerMask: 2 })).toEqual(["hidden-point", "visible-point"]);
    expect(names({ includeDisabled: true, layerMask: 2 })).toEqual(["hidden-point", "visible-spot", "visible-point"]);
    visibleSpot.visible = true;
    expect(names({ layerMask: 2 })).toEqual(["hidden-point", "visible-spot", "visible-point"]);
  });

  it("uses the scene root as the visibility boundary and leaves clean transform state untouched", () => {
    const { scene, outside, hidden, nested, visibleGroup, hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint } = fixture();
    outside.visible = false;
    const nodes = [scene.root, hidden, nested, visibleGroup, hiddenSun, hiddenPoint, visibleSun, visibleSpot, visiblePoint];
    const matrices = nodes.map((node) => node.transform.worldMatrix);
    const values = matrices.map((matrix) => [...matrix]);
    const dirty = nodes.map((node) => node.transform.isDirty());
    const collector = new LightCollector();

    expect(collector.collect(scene).map(({ source }) => source.name)).toEqual(["visible-sun", "visible-spot", "visible-point"]);
    nodes.forEach((node, index) => {
      expect(node.transform.worldMatrix).toBe(matrices[index]);
      expect(node.transform.worldMatrix).toEqual(values[index]);
      expect(node.transform.isDirty()).toBe(dirty[index]);
    });
    expect(collector.collect(scene).find(({ source }) => source === visibleSpot)?.position).toEqual([4, 4, 0]);
    scene.root.visible = false;
    expect(collector.collect(scene)).toEqual([]);
    expect(collector.collect(scene, { includeDisabled: true })).toHaveLength(5);
    scene.root.visible = true;
    expect(collector.collect(scene).map(({ source }) => source.name)).toEqual(["visible-sun", "visible-spot", "visible-point"]);
  });

  it("filters fallback shadow lights and retains parented world matrices", () => {
    const { scene, hidden, visibleGroup, visibleSpot, visiblePoint } = fixture();
    const spotWorld = visibleSpot.transform.worldMatrix;
    const pointWorld = visiblePoint.transform.worldMatrix;
    const source = { scene };

    const first = shadowLights(source);
    expectDirection(first.sunDirection, [0, 0, -1]);
    expect(first.localLights.map(({ kind, shadowIndex, position }) => ({ kind, shadowIndex, position }))).toEqual([
      { kind: "spot", shadowIndex: 0, position: [4, 4, 0] },
      { kind: "point", shadowIndex: 1, position: [5, 4, 0] }
    ]);
    expect(visibleSpot.transform.worldMatrix).toBe(spotWorld);
    expect(visiblePoint.transform.worldMatrix).toBe(pointWorld);
    expect(visibleSpot.transform.worldMatrix[12]).toBe(4);
    expect(visiblePoint.transform.worldMatrix[12]).toBe(5);

    hidden.visible = true;
    const restored = shadowLights(source);
    expectDirection(restored.sunDirection, [-1, 0, 0]);
    expect(restored.localLights.map(({ kind, shadowIndex }) => ({ kind, shadowIndex }))).toEqual([
      { kind: "point", shadowIndex: 0 }, { kind: "spot", shadowIndex: 1 }, { kind: "point", shadowIndex: 2 }
    ]);
    hidden.visible = false;
    visibleGroup.transform.setPosition(7, 4, 0);
    expect(shadowLights(source).localLights.map(({ position }) => position)).toEqual([[4, 4, 0], [5, 4, 0]]);
    expect(visibleGroup.transform.isDirty()).toBe(true);
    expect(visibleSpot.transform.worldMatrix).toBe(spotWorld);
    expect(visiblePoint.transform.worldMatrix).toBe(pointWorld);
    scene.updateWorldTransforms();
    expect(shadowLights(source).localLights.map(({ position }) => position)).toEqual([[8, 4, 0], [9, 4, 0]]);
  });

  it("filters explicit shadow lists, respects the scene root, and reevaluates visibility per call", () => {
    const { scene, outside, hidden } = fixture();
    const collected = new LightCollector().collect(scene, { includeDisabled: true });
    const source = { scene, collectedLights: collected };
    outside.visible = false;

    expectDirection(prd02SunDirection(source), [0, 0, -1]);
    expect(prd02LocalShadowLights(source).map(({ light, input }) => [light.source.name, input.shadowIndex])).toEqual([
      ["visible-spot", 0], ["visible-point", 1]
    ]);
    hidden.visible = true;
    expectDirection(prd02SunDirection(source), [-1, 0, 0]);
    expect(prd02LocalShadowLights(source).map(({ light, input }) => [light.source.name, input.shadowIndex])).toEqual([
      ["hidden-point", 0], ["visible-spot", 1], ["visible-point", 2]
    ]);
    scene.root.visible = false;
    expect(prd02SunDirection(source)).toBeNull();
    expect(prd02LocalShadowLights(source)).toEqual([]);
    scene.root.visible = true;
    expectDirection(prd02SunDirection(source), [-1, 0, 0]);

    // Without a scene root, explicit sources use their full parent chain.
    expect(prd02SunDirection({ collectedLights: collected })).toBeNull();
    expect(prd02LocalShadowLights({ collectedLights: collected })).toEqual([]);
    // Source-less compiled descriptors retain their prior eligibility.
    const sourceLessSun = { ...collected[0]!, source: undefined };
    const sourceLessPoint = { ...collected[1]!, source: undefined };
    expectDirection(prd02SunDirection({ collectedLights: [sourceLessSun] }), [-1, 0, 0]);
    expect(prd02LocalShadowLights({ collectedLights: [sourceLessPoint] })).toHaveLength(1);
  });

  it("suppresses legacy scene and explicitly selected hidden lights, restoring parented point shadows without rewriting matrices", () => {
    const scene = new Scene();
    const outside = new SceneNode({ name: "outside" });
    const parent = scene.createNode("parent");
    const point = scene.createLight("point", "point");
    outside.addChild(scene.root);
    outside.visible = false;
    scene.root.addChild(parent);
    parent.addChild(point);
    parent.visible = false;
    parent.transform.setPosition(2, 0, 0);
    point.transform.setPosition(3, 0, 0);
    point.castsShadow = true;
    scene.updateWorldTransforms();
    const world = point.transform.worldMatrix;
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const host = { device, width: 4, height: 4, shaderLibrary: createLeanCoreShaderLibrary(), shadowDepthTarget: null as RenderTarget | null };
    const pipeline = new RendererShadowOrchestrator(host as never);
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    const run = (explicit: boolean) => withRendererQrFlags(device, () => pipeline.executeRendererShadowMap({
      source: { scene }, items: [{ geometry, castShadow: true }], lights: [],
      shadowOptions: explicit ? { light: point, size: 4 } : { size: 4 }, ownedTargets, ownedShadowPasses
    }));
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_LIGHTING: false }), device);
    device.beginFrame(4, 4);
    try {
      expect(() => run(false)).toThrow(/shadow-casting light/);
      expect(() => run(true)).toThrow(/shadow-casting light/);
      expect(point.transform.worldMatrix).toBe(world);
      expect(device.getDiagnostics().drawCalls).toBe(0);
      parent.visible = true;
      expect(run(false)).toBeDefined();
      expect(point.transform.worldMatrix).toBe(world);
      expect(point.transform.worldMatrix[12]).toBe(5);
      scene.root.visible = false;
      expect(() => run(true)).toThrow(/shadow-casting light/);
      scene.root.visible = true;
      expect(run(true)).toBeDefined();
    } finally {
      device.endFrame();
      for (const pass of ownedShadowPasses) pass.dispose();
      for (const target of ownedTargets) target.dispose();
      host.shadowDepthTarget?.dispose();
      geometry.dispose();
      device.dispose();
    }
  });

  it("matches the contact-shadow source identity to the visible sun for fallback and explicit lists", () => {
    const { scene, outside, hidden, hiddenSun, visibleSun } = fixture();
    const collected = new LightCollector().collect(scene, { includeDisabled: true });
    outside.visible = false;
    const device = new MockRenderDevice();
    const contributor = createPrd02ContactShadowsContributor();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const selected = (useCollected: boolean) => {
      const source = { scene, shadow: { prd02Contact: {} }, ...(useCollected ? { collectedLights: collected } : {}) };
      const context = {
        source, device, flags: createTrustedQrFlags({ A3D_QR_LIGHTING: true }), tier: QUALITY_TIERS.high, items: [],
        camera: { viewMatrix: identity, projectionMatrix: identity, viewProjectionMatrix: identity, near: 0.1, far: 50, projection: "perspective" },
        blackboard: new Map()
      } as unknown as FrameContributorContext;
      const passes = contributor.passes!("shadows", context);
      return passes.length ? (passes[0] as unknown as { sourceLight: object | null }).sourceLight : null;
    };
    try {
      expect(selected(false)).toBe(visibleSun);
      expect(selected(true)).toBe(visibleSun);
      hidden.visible = true;
      expect(selected(false)).toBe(hiddenSun);
      expect(selected(true)).toBe(hiddenSun);
      scene.root.visible = false;
      expect(selected(false)).toBeNull();
      expect(selected(true)).toBeNull();
    } finally {
      warn.mockRestore();
      contributor.dispose?.();
      device.dispose();
    }
  });
});
