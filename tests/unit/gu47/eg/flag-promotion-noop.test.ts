/**
 * GU47 E-G (WP-7 item 1): promotion prep. With each of the five flags ON, a
 * scene that does not use the feature gets no extra pass, draw, shader
 * feature (uniforms / program variant) or MRT output:
 *   A3D_QR_VFX_SKY, A3D_QR_VFX_FOG, A3D_QR_WORLD_WATER (alone),
 *   A3D_QR_POST_VELOCITY_MRT, A3D_QR_ANIMATION_SKINNED_SHADOWS.
 * Pixel equality over the 64 luma targets is the phase-2 capture
 * (evidence/game-upgrades-47/flag-promotion/README.md).
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/index";
import "../../../../packages/engine/src/lanes/prd10";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { prd07ForwardFog, setPrd07ForwardFog } from "../../../../packages/rendering/src/atmosphere/fogUniformStore";
import { VelocityHistory, velocityFramePrepared } from "../../../../packages/rendering/src/forward/Velocity";
import { registeredVelocityFeature, velocityFeature } from "../../../../packages/rendering/src/post/chunks/velocity.glsl";
import { createPrd06DeformDepthFeature } from "../../../../packages/rendering/src/shaders/deform/depthFeature";
import { WATER_ONLY_CONTRIBUTOR } from "../../../../packages/engine/src/production-runtime/world/WorldFramePasses";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const on = (...tokens: string[]) => resolveQrFlags({ options: tokens });
const ctxFor = (flags: ReturnType<typeof resolveQrFlags>): FrameContributorContext => ({
  device: {} as never,
  width: 640,
  height: 360,
  frameIndex: 1,
  timeSeconds: 0,
  camera: null,
  source: {} as never,
  items: [],
  tier: QUALITY_TIERS.high,
  flags,
  sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
  blackboard: new Map()
});

afterEach(() => setPrd07ForwardFog(null));

describe("GU47 E-G promotion prep: A3D_QR_VFX_SKY", () => {
  it("the sky contributor emits no pass for a scene without a sky node", () => {
    const flags = on("vfx.sky");
    const sky = frameContributors(flags).find((c) => c.id === "prd07.sky");
    expect(sky).toBeDefined();
    const ctx = ctxFor(flags);
    expect(sky!.passes!("background", ctx)).toEqual([]);
    expect(sky!.passes!("after-opaque", ctx)).toEqual([]);
    expect(ctx.blackboard.size).toBe(0);
  });
});

describe("GU47 E-G promotion prep: A3D_QR_VFX_FOG", () => {
  const flags = on("vfx.fog");
  const fogFeature = () => shaderFeaturesFor(flags).find((f) => f.id === "prd07.fog");

  it("the prd07.fog shader feature selects nothing while no fog node is live", () => {
    expect(prd07ForwardFog()).toBeNull();
    const input = { item: {} as never, pass: "forward" as never, tier: QUALITY_TIERS.high, flags };
    expect(fogFeature()).toBeDefined();
    expect(fogFeature()!.select(input)).toBeUndefined();
  });

  it("it selects the fog model as soon as a fog node publishes the store", () => {
    setPrd07ForwardFog({ uniforms: {} as never, volumes: [], sunDirection: [0, 1, 0], sunColor: [1, 1, 1], cameraPosition: [0, 0, 0] });
    const input = { item: {} as never, pass: "forward" as never, tier: QUALITY_TIERS.high, flags };
    expect(fogFeature()!.select(input)).toBeDefined();
  });

  it("the fog collect contributor passes items through and leaves the store empty without atmosphere", () => {
    const fog = frameContributors(flags).find((c) => c.id === "prd07.fog");
    const items = [] as never[];
    expect(fog!.collect!(items, ctxFor(flags))).toBe(items);
    expect(prd07ForwardFog()).toBeNull();
  });
});

describe("GU47 E-G promotion prep: A3D_QR_WORLD_WATER alone", () => {
  it("the water-only contributor is active under the sub-flag and emits nothing without water", () => {
    const flags = on("world.water");
    expect(flags.on("A3D_QR_WORLD")).toBe(false);
    expect(frameContributors(flags)).toContain(WATER_ONLY_CONTRIBUTOR);
    expect(frameContributors(flags).some((c) => c.id === "prd10.world")).toBe(false);
    const ctx = ctxFor(flags);
    for (const phase of ["background", "after-opaque", "transparent"] as const) expect(WATER_ONLY_CONTRIBUTOR.passes!(phase, ctx)).toEqual([]);
    expect(ctx.blackboard.size).toBe(0);
    expect(WATER_ONLY_CONTRIBUTOR.collect).toBeUndefined();
  });

  it("defers to prd10.world when the world lane is on (no double water passes)", () => {
    const ctx = ctxFor(on("world"));
    for (const phase of ["background", "after-opaque", "transparent"] as const) expect(WATER_ONLY_CONTRIBUTOR.passes!(phase, ctx)).toEqual([]);
  });
});

describe("GU47 E-G promotion prep: A3D_QR_POST_VELOCITY_MRT", () => {
  const mrt = resolveQrFlags({ options: { A3D_QR_POST: true, A3D_QR_POST_VELOCITY_MRT: true } });
  const input = { item: {} as never, pass: "forward" as never, tier: QUALITY_TIERS.high, flags: mrt };

  it("the registered velocity feature selects only once a temporal frame prepared velocity", () => {
    const history = new VelocityHistory();
    history.reset("scene-swap");
    expect(velocityFramePrepared()).toBe(false);
    expect(registeredVelocityFeature.select(input)).toBeUndefined();
    // The flag-only rule is unchanged for direct callers.
    expect(velocityFeature.select(input)).toBe("velocity");
    history.prepare(IDENTITY, [0, 0]);
    expect(velocityFramePrepared()).toBe(true);
    expect(registeredVelocityFeature.select(input)).toBe("velocity");
    expect(registeredVelocityFeature.select({ ...input, pass: "depth" as never })).toBeUndefined();
    history.reset("scene-swap");
    expect(registeredVelocityFeature.select(input)).toBeUndefined();
  });

  it("the registry carries the gated form", () => {
    const registered = shaderFeaturesFor(mrt).find((f) => f.id === velocityFeature.id);
    expect(registered).toBeDefined();
    new VelocityHistory().reset("scene-swap");
    expect(registered!.select(input)).toBeUndefined();
  });
});

describe("GU47 E-G promotion prep: A3D_QR_ANIMATION_SKINNED_SHADOWS", () => {
  it("the skinned depth variant selects only skinned items", () => {
    const feature = createPrd06DeformDepthFeature({} as never);
    const flags = on("animation.skinned_shadows");
    for (const pass of ["depth", "distance", "velocity"] as const) {
      expect(feature.select({ item: {} as never, pass: pass as never, tier: QUALITY_TIERS.high, flags })).toBeUndefined();
      expect(feature.select({ item: { skinning: {} } as never, pass: pass as never, tier: QUALITY_TIERS.high, flags })).toBe(pass);
    }
  });
});
