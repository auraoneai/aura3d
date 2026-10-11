/**
 * T0-26 — real consumer for the PRD-02 shadow system: the bridge renders the
 * prd02 sun cascades for the legacy forward shader (until the C-02 generator
 * path compiles `a3d_prd02_shadow_lookup`), cascades are allocated only when
 * a forward consumer exists, config/lights come from the compiled
 * RenderSource, and flag-off keeps the legacy shadow path untouched.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { DirectionalLight, PerspectiveCamera, Scene, identityMat4 } from "@aura3d/scene";
import { MockRenderDevice, type RenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { Material } from "../../../../packages/rendering/src/Material";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector";
import type { FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { SHADOW_BLACKBOARD_KEY } from "../../../../packages/rendering/src/contracts/shadows";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { RendererShadowOrchestrator } from "../../../../packages/rendering/src/renderer/ShadowOrchestration";
import { createLeanCoreShaderLibrary } from "../../../../packages/rendering/src/ShaderLibraryCore";
import {
  PRD02_SHADOW_LOOKUP_UNIFORM,
  executePrd02BridgedShadowMap,
  prd02LookupConsumerExists,
  prd02ShadowConfig,
  takePrd02BridgedShadowFrame
} from "../../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import { createPrd02ShadowsContributor } from "../../../../packages/rendering/src/shadows/Prd02ShadowsContributor";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const BASE = resolveQrFlags({});

afterEach(() => setRendererQrFlags(BASE));

const PRD02_SHADOWS = {
  enabled: true, mapSize: 1024, cascades: 2, maxDistance: 150, splitLambda: 0.75, blend: 0.1,
  filter: "pcf", strength: 1, bias: 0, normalBias: 0.02, sceneRadius: 6
};

function camera(): PerspectiveCamera {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 60 });
  cam.transform.setPosition(0, 3, 8);
  cam.updateCameraMatrices();
  return cam;
}

function sunLight(overrides: Partial<CollectedLight> = {}): CollectedLight {
  return {
    kind: "directional", color: [1, 1, 1], intensity: 2, position: [3, 4, 3],
    direction: [-0.5, -0.7, -0.5], range: 0, spotAngle: 0, penumbra: 0,
    castsShadow: true, layerMask: 1, source: { id: "sun", name: "sun", visible: true },
    ...overrides
  } as unknown as CollectedLight;
}

const item = (material?: Material): RenderItem => ({
  geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "caster",
  ...(material ? { material } : {})
}) as RenderItem;

const lookupMaterial = () => new Material({
  name: "lookup", shaderKey: "lookup", requiredUniforms: [PRD02_SHADOW_LOOKUP_UNIFORM]
} as never);

const source = (extra: Record<string, unknown> = {}) => ({
  shadow: { enabled: true, prd02Shadows: PRD02_SHADOWS },
  collectedLights: [sunLight()],
  ...extra
}) as never;

function countingDevice(): { device: MockRenderDevice; labels: string[] } {
  const device = new MockRenderDevice();
  const labels: string[] = [];
  const create = device.createRenderTarget.bind(device);
  vi.spyOn(device, "createRenderTarget").mockImplementation((descriptor) => {
    labels.push(descriptor.label ?? "");
    return create(descriptor);
  });
  return { device, labels };
}

describe("T0-26 prd02 shadow bridge (legacy forward consumer)", () => {
  it("renders the prd02 cascades and returns legacy ForwardShadowMapOptions", () => {
    const { device, labels } = countingDevice();
    device.beginFrame(256, 256);
    const map = executePrd02BridgedShadowMap({ device, source: source(), items: [item()], camera: camera(), flags: FLAGS_ON });
    device.endFrame();
    expect(map).toBeDefined();
    expect(map!.texture.name).toBe("u_shadowMapTexture");
    expect(map!.strength).toBe(1);
    expect([...map!.lightMatrix].every(Number.isFinite)).toBe(true);
    expect(map!.cascades).toHaveLength(2);
    expect(map!.cascades![0]!.near).toBe(0);
    expect(map!.cascades![1]!.near).toBe(map!.cascades![0]!.far);
    expect(labels.filter((l) => l.startsWith("prd02-cascade-"))).toHaveLength(2);
    const frame = takePrd02BridgedShadowFrame(device);
    expect(frame?.uniforms.cascadeTextures[0]).toBe(map!.cascades![0]!.shadowMap.texture.texture);
    expect(takePrd02BridgedShadowFrame(device)).toBeNull();
  });

  it("allocates nothing without a sun, casters, camera, or with shadows killed", () => {
    const { device, labels } = countingDevice();
    const base = { device, items: [item()], camera: camera(), flags: FLAGS_ON };
    expect(executePrd02BridgedShadowMap({ ...base, source: source({ collectedLights: [] }) })).toBeUndefined();
    expect(executePrd02BridgedShadowMap({ ...base, source: source({ collectedLights: [sunLight({ castsShadow: false })] }) })).toBeUndefined();
    expect(executePrd02BridgedShadowMap({ ...base, items: [], source: source() })).toBeUndefined();
    expect(executePrd02BridgedShadowMap({ ...base, camera: undefined, source: source() })).toBeUndefined();
    const killed = source({ shadow: { enabled: true, prd02Shadows: PRD02_SHADOWS, prd02KillSwitches: { shadows: false } } });
    expect(executePrd02BridgedShadowMap({ ...base, source: killed })).toBeUndefined();
    expect(labels).toEqual([]);
    expect(takePrd02BridgedShadowFrame(device)).toBeNull();
  });

  it("defers to the contributor when a lookup-chunk consumer exists", () => {
    const { device, labels } = countingDevice();
    const items = [item(lookupMaterial())];
    expect(prd02LookupConsumerExists(items)).toBe(true);
    expect(prd02LookupConsumerExists([item()])).toBe(false);
    expect(executePrd02BridgedShadowMap({ device, source: source(), items, camera: camera(), flags: FLAGS_ON })).toBeUndefined();
    expect(labels).toEqual([]);
  });

  it("reads the compiler's prd02Shadows config ahead of the legacy options", () => {
    const cfg = prd02ShadowConfig(
      { shadow: { size: 512, cascadeCount: 4, strength: 0.32, prd02Shadows: PRD02_SHADOWS } },
      FLAGS_ON, QUALITY_TIERS.high, 60
    );
    expect(cfg).toMatchObject({ mapSize: 1024, cascades: 2, strength: 1, splitLambda: 0.75, normalBias: 0.02, maxDistance: 60, filter: "pcf" });
    const legacy = prd02ShadowConfig({ shadow: { size: 512, cascadeCount: 3, filter: "none" } }, FLAGS_ON, QUALITY_TIERS.high, 60);
    expect(legacy).toMatchObject({ mapSize: 512, cascades: 3, filter: "hard" });
  });
});

function contributorCtx(device: RenderDevice, items: readonly RenderItem[]): FrameContributorContext {
  const cam = camera();
  return {
    device, width: 256, height: 256, frameIndex: 0, timeSeconds: 0,
    camera: { viewProjectionMatrix: cam.viewProjectionMatrix, near: cam.near, far: cam.far },
    source: source(), items, tier: QUALITY_TIERS.high, flags: FLAGS_ON,
    sceneDepth: null, blackboard: new Map()
  } as unknown as FrameContributorContext;
}

function runContributor(ctx: FrameContributorContext): void {
  const passes = createPrd02ShadowsContributor().passes?.("shadows", ctx) ?? [];
  expect(passes).toHaveLength(1);
  passes[0]!.execute({ device: ctx.device, width: ctx.width, height: ctx.height } as never);
}

describe("T0-26 prd02.shadows contributor allocation", () => {
  it("allocates no cascades when no forward consumer exists", () => {
    const { device, labels } = countingDevice();
    const ctx = contributorCtx(device, [item()]);
    runContributor(ctx);
    expect(labels).toEqual([]);
    expect(ctx.blackboard.get(SHADOW_BLACKBOARD_KEY)).toBeNull();
  });

  it("publishes the bridged frame without rendering a second time", () => {
    const { device, labels } = countingDevice();
    device.beginFrame(256, 256);
    executePrd02BridgedShadowMap({ device, source: source(), items: [item()], camera: camera(), flags: FLAGS_ON });
    const allocated = labels.length;
    const ctx = contributorCtx(device, [item()]);
    runContributor(ctx);
    device.endFrame();
    expect(labels.length).toBe(allocated);
    const published = ctx.blackboard.get(SHADOW_BLACKBOARD_KEY) as { cascadeTextures: unknown[] } | null;
    expect(published?.cascadeTextures[0]).toBeTruthy();
  });

  it("renders and binds for a lookup-chunk consumer", () => {
    const { device, labels } = countingDevice();
    device.beginFrame(256, 256);
    const material = lookupMaterial();
    const ctx = contributorCtx(device, [item(material)]);
    runContributor(ctx);
    device.endFrame();
    expect(labels.some((l) => l.startsWith("prd02-cascade-"))).toBe(true);
    expect(material.getParameter(PRD02_SHADOW_LOOKUP_UNIFORM)).toBeDefined();
  });
});

describe("T0-26 flag-off keeps the legacy shadow path", () => {
  function orchestrator(device: RenderDevice): RendererShadowOrchestrator {
    return new RendererShadowOrchestrator({
      device, width: 256, height: 256, shaderLibrary: createLeanCoreShaderLibrary(),
      shadowDepthTarget: null, frameIndex: 0
    } as never);
  }

  function sceneWithSun(): Scene {
    const scene = new Scene();
    const sun = new DirectionalLight("sun");
    sun.castsShadow = true;
    scene.root.addChild(sun);
    return scene;
  }

  it("flag off renders the legacy map and never allocates prd02 cascades", () => {
    setRendererQrFlags(BASE);
    const { device, labels } = countingDevice();
    device.beginFrame(256, 256);
    const map = orchestrator(device).executeRendererShadowMap({
      shadowOptions: { enabled: true, size: 512 }, source: sceneWithSun(), items: [item()], lights: [],
      ownedTargets: [], ownedShadowPasses: [], camera: camera()
    });
    device.endFrame();
    expect(map?.texture.name).toBe("u_shadowMapTexture");
    expect(map?.cascades).toBeUndefined();
    expect(labels.some((l) => l.startsWith("prd02-"))).toBe(false);
    expect(takePrd02BridgedShadowFrame(device)).toBeNull();
  });

  it("flag on routes the same call through the prd02 bridge", () => {
    setRendererQrFlags(FLAGS_ON);
    const { device, labels } = countingDevice();
    device.beginFrame(256, 256);
    const map = orchestrator(device).executeRendererShadowMap({
      shadowOptions: { enabled: true, prd02Shadows: PRD02_SHADOWS } as never, source: source(), items: [item()], lights: [],
      ownedTargets: [], ownedShadowPasses: [], camera: camera()
    });
    device.endFrame();
    expect(map?.cascades).toHaveLength(2);
    expect(labels.filter((l) => l.startsWith("prd02-cascade-"))).toHaveLength(2);
  });
});

describe("T0-26 review fixes (structural camera, receiver consumers, maxDistance)", () => {
  function collectCtx(device: RenderDevice, items: readonly RenderItem[], cam: PerspectiveCamera | null): FrameContributorContext {
    return {
      ...contributorCtx(device, items),
      camera: cam ? { viewProjectionMatrix: cam.viewProjectionMatrix, near: cam.near, far: cam.far } : null
    } as unknown as FrameContributorContext;
  }

  it("uses the collect-phase frame camera when the renderer has no concrete Camera", () => {
    const { device, labels } = countingDevice();
    const contributor = createPrd02ShadowsContributor();
    const items = [item()];
    expect(contributor.phases).toContain("collect");
    expect(contributor.collect?.([...items], collectCtx(device, items, camera()))).toEqual(items);
    device.beginFrame(256, 256);
    const map = executePrd02BridgedShadowMap({ device, source: source(), items, camera: undefined, flags: FLAGS_ON });
    device.endFrame();
    expect(map?.cascades).toHaveLength(2);
    expect(labels.filter((l) => l.startsWith("prd02-cascade-"))).toHaveLength(2);
  });

  it("defers to the contributor when a non-caster receiver declares the lookup chunk", () => {
    const { device, labels } = countingDevice();
    const receiver = { ...item(lookupMaterial()), castShadow: false } as RenderItem;
    const caster = item();
    createPrd02ShadowsContributor().collect?.([caster, receiver], collectCtx(device, [caster, receiver], camera()));
    // The renderer passes casters only.
    expect(executePrd02BridgedShadowMap({ device, source: source(), items: [caster], camera: camera(), flags: FLAGS_ON })).toBeUndefined();
    expect(labels).toEqual([]);
  });

  it("caps cascade splits at prd02Shadows.maxDistance", () => {
    const { device } = countingDevice();
    const capped = source({ shadow: { enabled: true, prd02Shadows: { ...PRD02_SHADOWS, maxDistance: 20 } } });
    device.beginFrame(256, 256);
    const map = executePrd02BridgedShadowMap({ device, source: capped, items: [item()], camera: camera(), flags: FLAGS_ON });
    device.endFrame();
    const last = map!.cascades![map!.cascades!.length - 1]!;
    expect(last.far).toBeCloseTo(20, 5);
  });
});
