import { describe, expect, it } from "vitest";
import { DirectionalLight, PointLight, SpotLight } from "@galileo3d/scene";
import {
  CascadedShadowMaps,
  CascadedShadowPass,
  Geometry,
  MockRenderDevice,
  ForwardPass,
  PBRMaterial,
  Sampler,
  UnlitMaterial,
  ShadowMap,
  ShadowPass,
  Texture,
  TextureBinding,
  computeShadowDepthBias,
  createPoissonDiskShadowKernel,
  createShadowAtlasLayout,
  createShadowFilterKernel,
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

    const pass = new ShadowPass({ light, casters: [{ geometry: Geometry.cube(), label: "cube" }] });
    const result = pass.execute(context);
    const forwardShadow = pass.getForwardShadowMap({
      lightMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      strength: 0.7
    });
    device.endFrame();

    expect(result.rendered).toBe(true);
    expect(result.casterCount).toBe(1);
    expect(result.skippedTransparentCasters).toBe(0);
    expect(result.targetBacked).toBe(true);
    expect(result.shadowTextureKind).toBe("depth-texture");
    expect(result.shadowTextureLabel).toBe("shadow-map-depth-color-depth");
    expect(forwardShadow?.texture.texture?.label).toBe("shadow-map-depth-color-depth");
    expect(forwardShadow?.texture.texture?.format).toBe("depth24");
    expect(forwardShadow?.bias).toBe(pass.shadowMap.bias);
    expect(forwardShadow?.filterKernel).toBe(pass.shadowMap.filterKernel);
    expect(device.getDiagnostics().drawCalls).toBe(1);
    pass.dispose();
  });

  it("self-frames exported shadow pass execution when the device has no active frame", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    const pass = new ShadowPass({ light, casters: [{ geometry: Geometry.cube(), label: "self-framed-cube" }] });

    const result = pass.execute({ device, width: 16, height: 12 });
    const forwardShadow = pass.getForwardShadowMap({
      lightMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    });

    expect(result.rendered).toBe(true);
    expect(result.shadowTextureKind).toBe("depth-texture");
    expect(forwardShadow?.texture.texture?.label).toBe("shadow-map-depth-color-depth");
    expect(forwardShadow?.texture.texture?.format).toBe("depth24");
    expect(device.captureState().get("frameActive")).toBe(false);
    expect(device.captureState().get("viewportWidth")).toBe(16);
    expect(device.captureState().get("viewportHeight")).toBe(12);
    expect(device.getDiagnostics().drawCalls).toBe(1);
    pass.dispose();
  });

  it("marks color-encoded shadow maps as a bounded fallback when sampleable depth textures are unavailable", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const device = new MockRenderDevice();
    Object.defineProperty(device, "info", {
      value: {
        ...device.info,
        capabilities: device.info.capabilities?.filter((capability) => capability !== "depth-textures")
      }
    });
    const pass = new ShadowPass({ light, casters: [{ geometry: Geometry.cube(), label: "fallback-shadow-caster" }] });

    const result = pass.execute({ device, width: 16, height: 16 });
    const forwardShadow = pass.getForwardShadowMap({
      lightMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]
    });

    expect(result.rendered).toBe(true);
    expect(result.shadowTextureKind).toBe("encoded-color-depth");
    expect(result.shadowTextureLabel).toBe("shadow-map-depth-color");
    expect(forwardShadow?.texture.texture?.label).toBe("shadow-map-depth-color");
    expect(forwardShadow?.texture.texture?.format).toBe("rgba8");
    pass.dispose();
  });

  it("draws bounded point and spot shadow passes when those lights cast shadows", () => {
    const pointLight = new PointLight("unit-point-shadow");
    pointLight.castsShadow = true;
    pointLight.range = 8;
    const spotLight = new SpotLight("unit-spot-shadow");
    spotLight.castsShadow = true;
    spotLight.angle = Math.PI / 5;
    spotLight.penumbra = 0.35;
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 16, height: 16 };
    const caster = { geometry: Geometry.cube(), label: "bounded-point-spot-caster" };

    device.beginFrame(16, 16);
    const pointResults = Array.from({ length: 6 }, (_, face) => new ShadowPass({
      light: pointLight,
      casters: [caster],
      shadowMap: new ShadowMap({ size: 64, label: `point-face-${face}` })
    }).execute(context));
    const spotResult = new ShadowPass({
      light: spotLight,
      casters: [caster],
      shadowMap: new ShadowMap({ size: 128, filter: "pcf", pcfSamples: 9, label: "spot-shadow" })
    }).execute(context);
    device.endFrame();

    expect(pointResults).toHaveLength(6);
    expect(pointResults.every((result) => result.rendered)).toBe(true);
    expect(pointResults.every((result) => result.casterCount === 1)).toBe(true);
    expect(spotResult).toMatchObject({ rendered: true, casterCount: 1, skippedTransparentCasters: 0 });
    expect(device.getDiagnostics().drawCalls).toBe(7);
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

  it("binds forward-pass shadow-map uniforms for shadow-casting direct lights", () => {
    const light = new DirectionalLight();
    light.castsShadow = true;
    const shadowTexture = new Texture({
      width: 4,
      height: 4,
      label: "unit-forward-shadow-map",
      data: new Uint8Array(4 * 4 * 4).fill(128)
    });
    const shadowBinding = new TextureBinding({
      name: "u_shadowMapTexture",
      texture: shadowTexture,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true
    });
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 16, height: 16 };
    const filterKernel = createShadowFilterKernel({ filter: "pcf", pcfRadius: 2, pcfSamples: 16, pcfDistribution: "poisson" });

    device.beginFrame(16, 16);
    new ForwardPass({
      items: [
        {
          geometry: Geometry.litCube(1),
          material: new PBRMaterial({ baseColor: [0.8, 0.8, 0.8, 1], environmentIntensity: 0.05 }),
          label: "forward-shadow-receiver"
        }
      ],
      lights: [{
        kind: "directional",
        color: [1, 1, 1],
        intensity: 1,
        position: [0, 0, 0],
        direction: [0, -1, -1],
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: true,
        layerMask: 0xffffffff,
        source: light
      }],
      shadowMap: {
        texture: shadowBinding,
        lightMatrix: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ],
        strength: 0.75,
        bias: 0.002,
        slopeBias: 2,
        texelSize: [0.25, 0.25],
        filterKernel
      }
    }).execute(context);
    device.endFrame();

    const uniforms = device.drawCommands[0]?.uniforms;
    expect(uniforms?.get("u_shadowMapTexture")).toBe(shadowBinding);
    expect(uniforms?.get("u_shadowMapEnabled")).toBe(1);
    expect(uniforms?.get("u_shadowMapStrength")).toBe(0.75);
    expect(uniforms?.get("u_shadowMapBias")).toBe(0.002);
    expect(uniforms?.get("u_shadowMapSlopeBias")).toBe(2);
    expect(Array.from(uniforms?.get("u_shadowMapTexelSize") as readonly number[])).toEqual([0.25, 0.25]);
    expect(Array.from(uniforms?.get("u_shadowMapMatrix") as Float32Array)).toHaveLength(16);
    expect(uniforms?.get("u_shadowPcfSampleCount")).toBe(16);
    const samples = uniforms?.get("u_shadowPcfSamples") as Float32Array;
    expect(samples).toHaveLength(128);
    expect(Array.from(samples.slice(0, 4))).toEqual([
      expect.closeTo(filterKernel.samples[0]!.x, 6),
      expect.closeTo(filterKernel.samples[0]!.y, 6),
      expect.closeTo(filterKernel.samples[0]!.weight, 6),
      0
    ]);
    expect(Array.from(samples.slice(60, 64))).toEqual([
      expect.closeTo(filterKernel.samples[15]!.x, 6),
      expect.closeTo(filterKernel.samples[15]!.y, 6),
      expect.closeTo(filterKernel.samples[15]!.weight, 6),
      0
    ]);
  });

  it("validates shadow map size and bias", () => {
    expect(new ShadowMap({ size: 256, bias: 0.005 }).size).toBe(256);
    expect(() => new ShadowMap({ size: 0 })).toThrow(/size/);
    expect(() => new ShadowMap({ bias: -1 })).toThrow(/bias/);
  });

  it("builds a validated PCF filter kernel for bounded soft-shadow evidence", () => {
    const shadowMap = new ShadowMap({ size: 256, bias: 0.002, filter: "pcf", pcfRadius: 1.5, pcfSamples: 9 });
    const weights = shadowMap.filterKernel.samples.reduce((sum, sample) => sum + sample.weight, 0);

    expect(shadowMap.filterKernel.mode).toBe("pcf");
    expect(shadowMap.filterKernel.radius).toBe(1.5);
    expect(shadowMap.filterKernel.samples).toHaveLength(9);
    expect(weights).toBeCloseTo(1, 6);
    expect(shadowMap.filterKernel.samples.map((sample) => sample.x)).toContain(-1.5);
    expect(shadowMap.filterKernel.samples.map((sample) => sample.x)).toContain(1.5);
    expect(() => new ShadowMap({ filter: "pcf", pcfRadius: 0 })).toThrow(/pcfRadius/);
    expect(() => new ShadowMap({ filter: "pcf", pcfSamples: 8 })).toThrow(/pcfSamples/);
  });

  it("builds deterministic Poisson PCF samples and slope-scaled depth bias", () => {
    const shadowMap = new ShadowMap({ size: 256, bias: 0.002, filter: "pcf", pcfRadius: 2, pcfSamples: 16, pcfDistribution: "poisson" });
    const weights = shadowMap.filterKernel.samples.reduce((sum, sample) => sum + sample.weight, 0);
    const facingBias = computeShadowDepthBias({ baseBias: 0.001, normalDotLight: 1, slopeScale: 2, texelSize: 1 / 1024 });
    const grazingBias = computeShadowDepthBias({ baseBias: 0.001, normalDotLight: 0.1, slopeScale: 2, texelSize: 1 / 1024 });

    expect(shadowMap.filterKernel).toMatchObject({ mode: "pcf", distribution: "poisson", radius: 2 });
    expect(shadowMap.filterKernel.samples).toHaveLength(16);
    expect(weights).toBeCloseTo(1, 6);
    expect(shadowMap.filterKernel.samples.some((sample) => sample.x !== 0 && sample.y !== 0)).toBe(true);
    expect(createPoissonDiskShadowKernel(4, 1)).toHaveLength(4);
    expect(createPoissonDiskShadowKernel(32, 1)[31]).toEqual({ x: 0.897866, y: -0.192168, weight: 1 / 32 });
    expect(grazingBias).toBeGreaterThan(facingBias);
    expect(facingBias).toBe(0.001);
    expect(() => createPoissonDiskShadowKernel(33, 1)).toThrow(/Poisson/);
    expect(() => computeShadowDepthBias({ baseBias: -1, normalDotLight: 1 })).toThrow(/baseBias/);
  });

  it("resizes shadow maps by disposing the previous texture and preserving bias and filtering", () => {
    const first = new ShadowMap({ size: 128, bias: 0.002, filter: "pcf", pcfRadius: 2, pcfSamples: 16, label: "main-shadow" });
    const previousTexture = first.texture;
    const resized = first.resize(512);

    expect(previousTexture.disposed).toBe(true);
    expect(resized.size).toBe(512);
    expect(resized.bias).toBe(0.002);
    expect(resized.filterKernel.mode).toBe("pcf");
    expect(resized.filterKernel.radius).toBe(2);
    expect(resized.filterKernel.samples).toHaveLength(16);
    expect(resized.texture.label).toBe("main-shadow");
    expect(resized.texture.disposed).toBe(false);
    resized.dispose();
    expect(resized.texture.disposed).toBe(true);
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
    const cascades = new CascadedShadowMaps({
      cascadeCount: 3,
      near: 0.25,
      far: 32,
      lambda: 0.5,
      size: 128,
      bias: 0.003,
      filter: "pcf",
      pcfRadius: 1.25,
      pcfSamples: 9,
      label: "unit-csm"
    });
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
    expect(result.cascades[0]?.shadowMap.filterKernel).toMatchObject({ mode: "pcf", radius: 1.25 });
    expect(result.cascades[0]?.shadowMap.filterKernel.samples).toHaveLength(9);
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

  it("packs cascades into a deterministic shadow atlas layout", () => {
    const layout = createShadowAtlasLayout([
      { id: "cascade-2", size: 128, cascadeIndex: 2 },
      { id: "spot-key", size: 128 },
      { id: "cascade-0", size: 256, cascadeIndex: 0 },
      { id: "cascade-1", size: 128, cascadeIndex: 1 },
      { id: "point-face-0", size: 64 }
    ], 512);

    expect(layout.atlasSize).toBe(512);
    expect(layout.utilization).toBeCloseTo(0.453125, 6);
    expect(layout.allocations.map((allocation) => allocation.id)).toEqual([
      "cascade-0",
      "cascade-1",
      "cascade-2",
      "spot-key",
      "point-face-0"
    ]);
    expect(layout.allocations.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 256, height: 256 },
      { x: 256, y: 0, width: 128, height: 128 },
      { x: 384, y: 0, width: 128, height: 128 },
      { x: 0, y: 256, width: 128, height: 128 },
      { x: 128, y: 256, width: 64, height: 64 }
    ]);
    expect(() => createShadowAtlasLayout([{ id: "too-large", size: 1024 }], 512)).toThrow(/exceed atlas/);
  });

  it("reports cascaded shadow skips per cascade and resizes owned maps without losing split ranges", () => {
    const light = new DirectionalLight();
    light.castsShadow = false;
    const cascades = new CascadedShadowMaps({ cascadeCount: 2, near: 1, far: 16, size: 64, bias: 0.004, filter: "pcf", pcfRadius: 1.5, pcfSamples: 9 });
    const previousTexture = cascades.getCascades()[0]!.shadowMap.texture;
    const resized = cascades.resize(256);
    const device = new MockRenderDevice();
    const context: RenderPassContext = { device, width: 256, height: 256 };

    const result = new CascadedShadowPass({ light, cascades: resized, casters: [{ geometry: Geometry.cube() }] }).execute(context);

    expect(previousTexture.disposed).toBe(true);
    expect(resized.getCascades()[0]?.shadowMap.size).toBe(256);
    expect(resized.getCascades()[0]?.shadowMap.bias).toBe(0.004);
    expect(resized.getCascades()[0]?.shadowMap.filterKernel.mode).toBe("pcf");
    expect(resized.getCascades()[0]?.shadowMap.filterKernel.radius).toBe(1.5);
    expect(resized.getCascades()[0]?.shadowMap.filterKernel.samples).toHaveLength(9);
    expect(resized.getCascades()[0]?.split).toEqual(cascades.getCascades()[0]?.split);
    expect(result.rendered).toBe(false);
    expect(result.cascades).toHaveLength(2);
    expect(result.cascades.map((cascade) => cascade.reason)).toEqual(["not-shadow-casting", "not-shadow-casting"]);
    expect(device.getDiagnostics().drawCalls).toBe(0);
    const resizedTextures = resized.getCascades().map((cascade) => cascade.shadowMap.texture);
    resized.dispose();
    expect(resizedTextures.every((texture) => texture.disposed)).toBe(true);
  });
});
