import { describe, expect, it } from "vitest";
import { DirectionalLight } from "@galileo3d/scene";
import {
  CascadedShadowMaps,
  CascadedShadowPass,
  Geometry,
  MockRenderDevice,
  ForwardPass,
  UnlitMaterial,
  ShadowMap,
  ShadowPass,
  type RenderPassContext
} from "../../../packages/rendering/src";
import { RenderStateInspector } from "../../../packages/debug/src";

describe("ShadowPass", () => {
  it("skips explicitly when no light is provided", () => {
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 4, height: 4 };
    const result = new ShadowPass({ light: null, casters: [{ geometry: Geometry.cube() }] }).execute(context);

    expect(result).toMatchObject({ rendered: false, reason: "no-light" });
    expect(device.getDiagnostics().drawCalls).toBe(0);
  });

  it("skips explicitly when there are no shadow casters", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 4, height: 4 };

    const result = new ShadowPass({ light, casters: [] }).execute(context);

    expect(result).toMatchObject({ rendered: false, reason: "no-casters" });
    expect(device.getDiagnostics().drawCalls).toBe(0);
  });

  it("draws casters for a basic shadow map when directional light casts shadows", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    device.beginFrame(4, 4);
    const context: RenderPassContext = { device, width: 4, height: 4 };

    const result = new ShadowPass({ light, casters: [{ geometry: Geometry.cube(), label: "cube" }] }).execute(context);
    device.endFrame();

    expect(result.rendered).toBe(true);
    expect(result.casterCount).toBe(1);
    expect(result.skippedTransparentCasters).toBe(0);
    expect(device.getDiagnostics().drawCalls).toBe(1);
  });

  it("skips transparent blended casters while rendering opaque casters", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 8, height: 8 };
    const transparent = new UnlitMaterial({
      color: [1, 1, 1, 0.35],
      renderState: { blend: true, depthWrite: false }
    });

    device.beginFrame(8, 8);
    const result = new ShadowPass({
      light,
      casters: [
        { geometry: Geometry.cube(), material: transparent, label: "transparent-caster" },
        { geometry: Geometry.triangle(), material: new UnlitMaterial(), label: "opaque-caster" }
      ]
    }).execute(context);
    device.endFrame();

    expect(result).toMatchObject({
      rendered: true,
      reason: "rendered",
      casterCount: 1,
      skippedTransparentCasters: 1
    });
    expect(device.drawCommands.map((command) => command.label)).toEqual(["opaque-caster"]);
  });

  it("reports no opaque casters when every caster is transparent", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 8, height: 8 };
    const transparent = new UnlitMaterial({
      color: [0.5, 0.5, 1, 0.25],
      renderState: { blend: true, depthWrite: false }
    });

    const result = new ShadowPass({
      light,
      casters: [{ geometry: Geometry.cube(), material: transparent, label: "transparent-caster" }]
    }).execute(context);

    expect(result).toMatchObject({
      rendered: false,
      reason: "no-opaque-casters",
      casterCount: 0,
      skippedTransparentCasters: 1
    });
    expect(device.getDiagnostics().drawCalls).toBe(0);
  });

  it("does not leak render state in no-light/no-caster paths", () => {
    const inspector = new RenderStateInspector();
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 4, height: 4 };
    const before = inspector.capture(device);

    new ShadowPass({ light: null, casters: [] }).execute(context);
    const after = inspector.capture(device);

    expect(() => inspector.assertNoLeak(before, after)).not.toThrow();
  });

  it("does not corrupt forward pass state after rendering shadow casters", () => {
    const inspector = new RenderStateInspector();
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    device.beginFrame(16, 16);
    const context: RenderPassContext = { device, width: 16, height: 16 };
    const before = inspector.capture(device);

    const shadowResult = new ShadowPass({ light, casters: [{ geometry: Geometry.cube(), label: "shadow-caster" }] }).execute(context);
    new ForwardPass({
      items: [
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ color: [0.2, 0.4, 1, 1] }),
          label: "forward-after-shadow"
        }
      ]
    }).execute(context);
    const after = inspector.capture(device);
    device.endFrame();

    expect(shadowResult.rendered).toBe(true);
    expect(device.getDiagnostics().drawCalls).toBe(2);
    expect(device.drawCommands.map((command) => command.label)).toEqual(["shadow-caster", "forward-after-shadow"]);
    expect(() => inspector.assertNoLeak(before, after, ["drawCalls"])).not.toThrow();
  });

  it("validates shadow map size and bias", () => {
    expect(new ShadowMap({ size: 256, bias: 0.005 }).size).toBe(256);
    expect(() => new ShadowMap({ size: 0 })).toThrow(/size/);
    expect(() => new ShadowMap({ bias: -1 })).toThrow(/bias/);
  });

  it("resizes shadow maps by disposing the previous texture and preserving bias", () => {
    const first = new ShadowMap({ size: 128, bias: 0.002, label: "main-shadow" });
    const previousTexture = first.texture;
    const resized = first.resize(512);

    expect(previousTexture.disposed).toBe(true);
    expect(resized.size).toBe(512);
    expect(resized.bias).toBe(0.002);
    expect(resized.texture.label).toBe("main-shadow");
  });

  it("computes stable cascaded shadow splits after the basic shadow path exists", () => {
    const splits = CascadedShadowMaps.computeSplits({ cascadeCount: 3, near: 0.1, far: 100, lambda: 0.5 });

    expect(splits).toHaveLength(3);
    expect(splits[0]?.near).toBe(0.1);
    expect(splits[2]?.far).toBe(100);
    expect(splits[0]!.far).toBeLessThan(splits[1]!.far);
    expect(splits[1]!.far).toBeLessThan(splits[2]!.far);
  });

  it("renders every cascaded shadow map through depth passes with stable split metadata", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const cascades = new CascadedShadowMaps({ cascadeCount: 3, near: 0.25, far: 32, lambda: 0.5, size: 128, bias: 0.003, label: "unit-csm" });
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 128, height: 128 };

    device.beginFrame(128, 128);
    const result = new CascadedShadowPass({
      light,
      cascades,
      casters: [
        { geometry: Geometry.cube(), label: "first-caster" },
        { geometry: Geometry.triangle(), label: "second-caster" }
      ]
    }).execute(context);
    device.endFrame();

    expect(result.rendered).toBe(true);
    expect(result.cascades).toHaveLength(3);
    expect(result.cascades.map((cascade) => cascade.index)).toEqual([0, 1, 2]);
    expect(result.cascades.map((cascade) => cascade.rendered)).toEqual([true, true, true]);
    expect(result.cascades[0]?.shadowMap.size).toBe(128);
    expect(result.cascades[0]?.shadowMap.bias).toBe(0.003);
    expect(result.cascades[0]?.shadowMap.texture.label).toBe("unit-csm-cascade-0");
    expect(result.cascades[1]?.split.near).toBeCloseTo(result.cascades[0]!.split.far, 6);
    expect(result.cascades[2]?.split.far).toBe(32);
    expect(device.getDiagnostics().drawCalls).toBe(6);
    expect(device.drawCommands.map((command) => command.label)).toEqual([
      "first-caster",
      "second-caster",
      "first-caster",
      "second-caster",
      "first-caster",
      "second-caster"
    ]);
    cascades.dispose();
  });

  it("stress-renders cascaded shadows over a moving camera range with stable splits and transparent-caster filtering", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 256, height: 256 };
    const transparent = new UnlitMaterial({
      color: [1, 1, 1, 0.3],
      renderState: { blend: true, depthWrite: false }
    });
    const movingCameraRanges = [
      { near: 0.1, far: 24 },
      { near: 0.15, far: 28 },
      { near: 0.2, far: 36 },
      { near: 0.25, far: 48 },
      { near: 0.3, far: 64 }
    ];

    device.beginFrame(256, 256);
    const results = movingCameraRanges.map(({ near, far }, frame) => {
      const cascades = new CascadedShadowMaps({ cascadeCount: 4, near, far, lambda: 0.62, size: 128, bias: 0.0025, label: `moving-camera-${frame}` });
      const result = new CascadedShadowPass({
        light,
        cascades,
        casters: [
          { geometry: Geometry.cube(), label: `frame-${frame}-floor-caster` },
          { geometry: Geometry.triangle(), label: `frame-${frame}-hero-caster` },
          { geometry: Geometry.cube(), material: transparent, label: `frame-${frame}-transparent-caster` }
        ]
      }).execute(context);
      cascades.dispose();
      return result;
    });
    device.endFrame();

    expect(results.every((result) => result.rendered)).toBe(true);
    for (const [frame, result] of results.entries()) {
      expect(result.cascades).toHaveLength(4);
      expect(result.cascades.map((cascade) => cascade.index)).toEqual([0, 1, 2, 3]);
      expect(result.cascades.map((cascade) => cascade.casterCount)).toEqual([2, 2, 2, 2]);
      expect(result.cascades.map((cascade) => cascade.skippedTransparentCasters)).toEqual([1, 1, 1, 1]);
      expect(result.cascades[0]?.shadowMap.texture.label).toBe(`moving-camera-${frame}-cascade-0`);
      for (let index = 1; index < result.cascades.length; index += 1) {
        const previous = result.cascades[index - 1]!;
        const current = result.cascades[index]!;
        expect(Number.isFinite(current.split.near)).toBe(true);
        expect(Number.isFinite(current.split.far)).toBe(true);
        expect(current.split.near).toBeCloseTo(previous.split.far, 6);
        expect(current.split.far).toBeGreaterThan(current.split.near);
      }
    }
    expect(device.getDiagnostics().drawCalls).toBe(40);
    expect(device.drawCommands.some((command) => command.label?.includes("transparent-caster"))).toBe(false);
  });

  it("reports cascaded shadow skips per cascade and resizes owned maps without losing split ranges", () => {
    const light = new DirectionalLight();
    light.castsShadow = false;
    const cascades = new CascadedShadowMaps({ cascadeCount: 2, near: 1, far: 16, size: 64, bias: 0.004 });
    const previousTexture = cascades.getCascades()[0]!.shadowMap.texture;
    const resized = cascades.resize(256);
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 256, height: 256 };

    const result = new CascadedShadowPass({ light, cascades: resized, casters: [{ geometry: Geometry.cube() }] }).execute(context);

    expect(previousTexture.disposed).toBe(true);
    expect(resized.getCascades()[0]?.shadowMap.size).toBe(256);
    expect(resized.getCascades()[0]?.shadowMap.bias).toBe(0.004);
    expect(resized.getCascades()[0]?.split).toEqual(cascades.getCascades()[0]?.split);
    expect(result.rendered).toBe(false);
    expect(result.cascades).toHaveLength(2);
    expect(result.cascades.map((cascade) => cascade.reason)).toEqual(["not-shadow-casting", "not-shadow-casting"]);
    expect(device.getDiagnostics().drawCalls).toBe(0);
    resized.dispose();
  });
});
