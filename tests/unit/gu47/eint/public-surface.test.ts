// GU47 lane eint (integration): the names the engine lanes' "API as shipped"
// sections list are reachable from the `@aura3d/engine` root entry
// (packages/engine/src/public/index.ts). Value exports are checked at runtime;
// the type exports are checked by the typecheck of the annotations below.
import { describe, expect, it } from "vitest";
import * as root from "../../../../packages/engine/src/public/index";
import type {
  AuraActorPoseApi,
  AuraBurstOptions,
  AuraColorGradeOptions,
  AuraCrowdOptions,
  AuraCrowdPoseSet,
  AuraCustomMaterialSpec,
  AuraDepthOfFieldTiltShift,
  AuraEnvironmentSwapOptions,
  AuraGradeRgb,
  AuraHdriId,
  AuraInstanceColorTarget,
  AuraLightPatch,
  AuraLightTransitionOptions,
  AuraLutAssetRef,
  AuraMaterialRimSpec,
  AuraOutlineOptions,
  AuraPlayLayerOptions,
  AuraRuntimeNodeHandleParts,
  AuraSetFogOptions,
  AuraSetFogSpec,
  AuraSkyCloudsOptions,
  AuraSkyStarsOptions,
  AuraToonMaterialOptions,
  AuraTrailHandle,
  AuraTrailOptions,
  AuraVfxBuiltinSequence,
  AuraVfxGenreVariant,
  AuraVfxSpriteSource,
  AuraVolumetricFogOptions,
  GlbResourceCacheOptions,
  GlbResourceCacheSnapshot,
  TypedGLBActorCrossFadeOptions
} from "../../../../packages/engine/src/public/index";
import type { AuraSkyStarsOptions as ContractStars } from "../../../../packages/engine/src/contracts/atmosphere";

describe("GU47 integration: root public surface", () => {
  it("exports the E-A look HDRI helpers", () => {
    const id: AuraHdriId = "venice_sunset";
    expect(root.lookHdriIds).toContain(id);
    expect(root.lookHdriIds).toHaveLength(17);
    expect(root.lookHdriUrl(id)).toBe("/hdri/venice_sunset_1k.hdr");
    expect(typeof root.lookOutputPreset).toBe("function");
  });

  it("exports the E-F genre variants", () => {
    const variant: AuraVfxGenreVariant = "spark-fire";
    expect(root.AURA_VFX_GENRE_VARIANTS).toContain(variant);
    expect(root.AURA_VFX_GENRE_VARIANTS).toHaveLength(15);
  });

  it("exports the E-H crowd kit and GLB resource cache", () => {
    for (const fn of [root.createCrowd, root.loadCrowdPoses, root.bakeCrowdPoses, root.sampleCrowdPoseSet, root.clearCrowdPoseCache]) {
      expect(typeof fn).toBe("function");
    }
    for (const fn of [root.configureGlbResourceCache, root.clearGlbResourceCache, root.glbResourceCacheSnapshot]) {
      expect(typeof fn).toBe("function");
    }
    expect(root.GLB_RESOURCE_CACHE_DEFAULTS.maxEntries).toBe(32);
    const snapshot: GlbResourceCacheSnapshot = root.glbResourceCacheSnapshot();
    expect(snapshot.kind).toBe("aura-glb-resource-cache");
  });

  it("types the lanes' option shapes by name (typecheck-only assertions)", () => {
    const patch: AuraLightPatch = { color: "#ff0000", intensity: 2 };
    const transition: AuraLightTransitionOptions = { transitionSeconds: 1 };
    const swap: AuraEnvironmentSwapOptions = { intensity: 1, rotationDeg: 90, crossfadeSeconds: 0.5 };
    const fog: AuraSetFogSpec = { density: 0.02, near: 10, far: 200 };
    const fogOptions: AuraSetFogOptions = { transitionSeconds: 2, overrideSceneFog: true };
    const stars: AuraSkyStarsOptions = { count: 800, brightness: 1.2 };
    const contractStars: ContractStars = stars;
    const clouds: AuraSkyCloudsOptions = { coverage: 0.4, speed: 1 };
    const rim: AuraMaterialRimSpec = { color: "#ffd27a", power: 3, intensity: 1 };
    const toon: AuraToonMaterialOptions = { color: "#88aaff", steps: 3, rim };
    const target: AuraInstanceColorTarget = "emissive";
    const custom: Pick<AuraCustomMaterialSpec, "castShadow"> = { castShadow: true };
    const grade: Pick<AuraColorGradeOptions, "temperature" | "tint"> = { temperature: 0.2, tint: -0.1 };
    const lift: AuraGradeRgb = [0.01, 0.0, -0.01];
    const lut: AuraLutAssetRef["type"] = "lut";
    const tilt: AuraDepthOfFieldTiltShift = { bandCenter: 0.5, bandWidth: 0.2 };
    const godRays: Pick<AuraVolumetricFogOptions, "godRayDensity"> = { godRayDensity: 0.5 };
    const outline: Pick<AuraOutlineOptions, "targets"> = { targets: ["hero"] };
    const burst: AuraBurstOptions = { count: 12, color: "#ffaa00" };
    const trail: AuraTrailOptions = { width: 0.3, life: 0.4, widthOverSpeed: [1, 8] };
    const sprite: AuraVfxSpriteSource = "smoke-a" satisfies AuraVfxBuiltinSequence;
    const layer: AuraPlayLayerOptions = { weight: 1, speed: 2 };
    const crossFade: TypedGLBActorCrossFadeOptions = { speed: 1.5, loop: true };
    const cache: GlbResourceCacheOptions = { maxEntries: 8 };
    const crowd: Pick<AuraCrowdOptions, "id" | "bob"> = { id: "stands", bob: 0.03 };
    const poseSetTriangles: AuraCrowdPoseSet["triangles"] = 0;
    const pose: Pick<AuraActorPoseApi, "clear"> = { clear: () => undefined };
    const trailLength: AuraTrailHandle["length"] = 0;
    const parts: AuraRuntimeNodeHandleParts = {};
    const all = [patch, transition, swap, fog, fogOptions, contractStars, clouds, toon, target, custom, grade, lift, lut, tilt, godRays, outline, burst, trail, sprite, layer, crossFade, cache, crowd, poseSetTriangles, pose, trailLength, parts];
    expect(all).toHaveLength(27);
  });
});
