import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, Scene, SceneNode, type LightKind } from "@aura3d/scene";
import { CascadedShadowMaps, CascadedShadowPass, supportsCascadedShadowLight } from "../../../packages/rendering/src/CascadedShadowMaps";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { ShadowMap } from "../../../packages/rendering/src/ShadowMap";
import { ShadowPass } from "../../../packages/rendering/src/ShadowPass";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function hierarchy(kind: LightKind = "directional") {
  const scene = new Scene();
  const outside = new SceneNode({ name: "outside-scene" });
  const upper = scene.createNode("upper");
  const nested = scene.createNode("nested");
  const light = scene.createLight(kind, "light");
  outside.addChild(scene.root);
  scene.root.addChild(upper);
  upper.addChild(nested);
  nested.addChild(light);
  outside.visible = false;
  upper.visible = false;
  light.castsShadow = true;
  light.intensity = 0;
  light.layerMask = 0;
  scene.updateWorldTransforms();
  return { scene, outside, upper, nested, light };
}

describe("standalone shadow visibility boundaries", () => {
  it.each(["directional", "point", "spot", "rect-area"] as const)(
    "uses an explicit scene root for %s light ancestors, invalidates stale maps, and recovers",
    (kind) => {
      const { scene, upper, nested, light } = hierarchy(kind);
      const device = new MockRenderDevice();
      const geometry = Geometry.triangle();
      const createTarget = vi.spyOn(device, "createRenderTarget");
      const cameraPosition = [7, -3, 11] as const;
      const viewProjection = [...IDENTITY];
      const pass = new ShadowPass({
        light, visibilityRoot: scene.root, casters: [{ geometry }], shadowMap: new ShadowMap({ size: 4 }),
        viewProjectionMatrix: IDENTITY, cameraPosition, timeSeconds: 5
      });
      const context = { device, width: 4, height: 4 };
      light.transform.setPosition(3, 2, 1);
      const world = light.transform.worldMatrix;
      const local = light.transform.localMatrix;
      const worldValues = [...world];
      const localValues = [...local];
      const dirty = light.transform.isDirty();
      try {
        expect(pass.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled", targetBacked: false });
        expect(createTarget).not.toHaveBeenCalled();
        upper.visible = true;
        nested.visible = false;
        expect(pass.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
        nested.visible = true;
        expect(pass.execute(context)).toMatchObject({ rendered: true, reason: "rendered" });
        expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).not.toBeNull();
        scene.root.visible = false;
        expect(pass.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
        expect(pass.getForwardShadowMap({ lightMatrix: IDENTITY })).toBeNull();
        scene.root.visible = true;
        expect(pass.execute(context)).toMatchObject({ rendered: true, reason: "rendered" });
        expect(light.visible).toBe(true);
        expect(light.intensity).toBe(0);
        expect(light.layerMask).toBe(0);
        expect(light.transform.worldMatrix).toBe(world);
        expect(light.transform.localMatrix).toBe(local);
        expect(light.transform.worldMatrix).toEqual(worldValues);
        expect(light.transform.localMatrix).toEqual(localValues);
        expect(light.transform.position).toEqual([3, 2, 1]);
        expect(light.transform.isDirty()).toBe(dirty);
        expect(cameraPosition).toEqual([7, -3, 11]);
        expect([...IDENTITY]).toEqual(viewProjection);
      } finally {
        pass.dispose();
        geometry.dispose();
        device.dispose();
      }
    }
  );

  it("preserves local-only explicit-light behavior when no matching root is supplied", () => {
    const { scene, nested, light } = hierarchy();
    const unrelated = new SceneNode({ name: "unrelated" });
    unrelated.visible = false;
    let ancestorVisibilityReads = 0;
    Object.defineProperty(nested, "visible", {
      configurable: true,
      get: () => { ancestorVisibilityReads += 1; throw new Error("unrelated ancestor visibility was read"); }
    });
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const options = { light, casters: [{ geometry }], viewProjectionMatrix: IDENTITY };
    const noRoot = new ShadowPass({ ...options, shadowMap: new ShadowMap({ size: 4 }) });
    const unrelatedRoot = new ShadowPass({ ...options, visibilityRoot: unrelated, shadowMap: new ShadowMap({ size: 4 }) });
    const lightRoot = new ShadowPass({ ...options, visibilityRoot: light, shadowMap: new ShadowMap({ size: 4 }) });
    const sceneRoot = new ShadowPass({ ...options, visibilityRoot: scene.root, shadowMap: new ShadowMap({ size: 4 }) });
    const context = { device, width: 4, height: 4 };
    try {
      expect(noRoot.execute(context).rendered).toBe(true);
      expect(unrelatedRoot.execute(context).rendered).toBe(true);
      expect(lightRoot.execute(context).rendered).toBe(true);
      expect(ancestorVisibilityReads).toBe(0);
      light.visible = false;
      const parent = light.parent;
      let parentReads = 0;
      Object.defineProperty(light, "parent", { configurable: true, get: () => { parentReads += 1; return parent; } });
      expect(noRoot.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
      expect(unrelatedRoot.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
      expect(sceneRoot.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
      expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
      expect(parentReads).toBe(0);
      Object.defineProperty(light, "parent", { configurable: true, writable: true, value: parent });
      light.visible = true;
      light.castsShadow = false;
      expect(lightRoot.execute(context)).toMatchObject({ rendered: false, reason: "not-shadow-casting" });
      expect(scene.root.visible).toBe(true);
    } finally {
      noRoot.dispose();
      unrelatedRoot.dispose();
      lightRoot.dispose();
      sceneRoot.dispose();
      geometry.dispose();
      device.dispose();
    }
  });

  it("reevaluates the root boundary after reparenting rather than caching membership", () => {
    const { scene, upper, nested, light } = hierarchy();
    const other = new SceneNode({ name: "other-root" });
    other.visible = false;
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const pass = new ShadowPass({
      light, visibilityRoot: scene.root, casters: [{ geometry }], shadowMap: new ShadowMap({ size: 4 }),
      viewProjectionMatrix: IDENTITY
    });
    const context = { device, width: 4, height: 4 };
    try {
      expect(pass.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
      other.addChild(light);
      expect(pass.execute(context).rendered).toBe(true);
      nested.addChild(light);
      expect(pass.execute(context)).toMatchObject({ rendered: false, reason: "light-disabled" });
      upper.visible = true;
      expect(pass.execute(context).rendered).toBe(true);
    } finally {
      pass.dispose();
      geometry.dispose();
      device.dispose();
    }
  });

  it("applies the same bounded visibility to cascade capability checks", () => {
    const { scene, upper, nested, light } = hierarchy();
    const unrelated = new SceneNode({ name: "unrelated" });
    unrelated.visible = false;
    expect(light).toBeInstanceOf(DirectionalLight);
    expect(supportsCascadedShadowLight(light)).toBe(true);
    expect(supportsCascadedShadowLight(light, unrelated)).toBe(true);
    expect(supportsCascadedShadowLight(light, light)).toBe(true);
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
    upper.visible = true;
    nested.visible = false;
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
    nested.visible = true;
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(true);
    scene.root.visible = false;
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
    scene.root.visible = true;
    light.visible = false;
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
    light.visible = true;
    light.castsShadow = false;
    expect(supportsCascadedShadowLight(light, scene.root)).toBe(false);
    expect(supportsCascadedShadowLight(scene.createLight("point"), scene.root)).toBe(false);
    expect(supportsCascadedShadowLight(scene.createLight("rect-area"), scene.root)).toBe(false);
    expect(supportsCascadedShadowLight(null, scene.root)).toBe(false);
  });

  it("does not preflight or draw hidden cascades, and recovers without changing light state", () => {
    const { scene, upper, light } = hierarchy();
    const device = new MockRenderDevice();
    const geometry = Geometry.triangle();
    const item = { geometry };
    let reads = 0;
    Object.defineProperty(item, "globalClipping", {
      configurable: true,
      get: () => { reads += 1; return { planes: [[1, 0, 0, 0]], clipShadows: true }; }
    });
    const cascades = new CascadedShadowMaps({ cascadeCount: 2, near: 0.1, far: 20, size: 4 });
    const pass = new CascadedShadowPass({
      light, visibilityRoot: scene.root, casters: [item], cascades, viewProjectionMatrices: [IDENTITY, IDENTITY]
    });
    const context = { device, width: 4, height: 4 };
    const world = light.transform.worldMatrix;
    try {
      const hidden = pass.execute(context);
      expect(hidden.rendered).toBe(false);
      expect(hidden.cascades.map(({ reason }) => reason)).toEqual(["light-disabled", "light-disabled"]);
      expect(reads).toBe(0);
      expect(device.getDiagnostics().drawCalls).toBe(0);
      Object.defineProperty(item, "globalClipping", { configurable: true, value: undefined });
      upper.visible = true;
      const restored = pass.execute(context);
      expect(restored.rendered).toBe(true);
      expect(restored.cascades.map(({ reason }) => reason)).toEqual(["rendered", "rendered"]);
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toHaveLength(2);
      scene.root.visible = false;
      expect(pass.execute(context).cascades.map(({ reason }) => reason)).toEqual(["light-disabled", "light-disabled"]);
      expect(pass.getForwardShadowMaps({ lightMatrices: [IDENTITY, IDENTITY] })).toEqual([]);
      scene.root.visible = true;
      expect(pass.execute(context).rendered).toBe(true);
      expect(light.transform.worldMatrix).toBe(world);
      expect(light.intensity).toBe(0);
      expect(light.layerMask).toBe(0);
    } finally {
      pass.dispose();
      cascades.dispose();
      geometry.dispose();
      device.dispose();
    }
  });
});
