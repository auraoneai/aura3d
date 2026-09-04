import { describe, expect, it, vi } from "vitest";
import { DirectionalLight, PointLight, RectAreaLight, Scene } from "@aura3d/scene";
import {
  MAX_LIGHTS_PER_CLUSTER,
  arenaShowdown,
  cinematicNight,
  createClusteredForwardLighting,
  createLightingRig,
  listLightingRigPresets,
  productHero,
  resetClusteredForwardLightingWarnings,
  type ClusteredForwardLightingDiagnostics,
  type CollectedLight,
  type LightingRig,
  type LightingRigPreset
} from "../../../packages/rendering/src";

const B5_PRESETS = ["cinematic-night", "arena-showdown", "product-hero"] as const;

function directionalLight(index: number): CollectedLight {
  const source = new DirectionalLight(`b5-directional-${index}`);
  return {
    kind: "directional",
    color: [1, 1, 1],
    intensity: 1,
    position: [0, 5, 0],
    direction: [0, -1, 0],
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0xffffffff,
    source
  };
}

function pointLightAt(index: number, x: number): CollectedLight {
  const source = new PointLight(`b5-point-${index}`);
  return {
    kind: "point",
    color: [1, 1, 1],
    intensity: 1,
    position: [x, 0, 0],
    direction: [0, -1, 0],
    range: 1000,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0xffffffff,
    source
  };
}

function rectAreaLight(width: number, height: number): CollectedLight {
  const source = new RectAreaLight("b5-rect");
  return {
    kind: "rect-area",
    color: [1, 1, 1],
    intensity: 4,
    position: [0, 0, 3],
    direction: [0, 0, -1],
    right: [1, 0, 0],
    up: [0, 1, 0],
    range: 12,
    width,
    height,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 0xffffffff,
    source
  };
}

function indexedLights(clustered: { lightIndices: { texture: { textureLevels: readonly { data: unknown }[] } | null } }): number[] {
  const data = clustered.lightIndices.texture?.textureLevels[0]?.data as Float32Array;
  return Array.from(data.slice(0, MAX_LIGHTS_PER_CLUSTER * 4)).filter((_, offset) => offset % 4 === 0);
}

describe("B5 clustered over-budget fallback", () => {
  it("keeps input order and warns when over budget without an observer", () => {
    const lights = Array.from({ length: MAX_LIGHTS_PER_CLUSTER + 6 }, (_, index) => directionalLight(index));
    const warnings: string[] = [];
    const clustered = createClusteredForwardLighting(lights, 64, 64, undefined, {
      onWarning: (message) => warnings.push(message)
    });

    expect(clustered.diagnostics.requestedLightCount).toBe(MAX_LIGHTS_PER_CLUSTER + 6);
    expect(clustered.diagnostics.indexedLightCount).toBe(MAX_LIGHTS_PER_CLUSTER);
    expect(clustered.diagnostics.droppedLightCount).toBe(6);
    expect(clustered.diagnostics.overBudgetClusterCount).toBe(1);
    expect(clustered.diagnostics.maxRequestedLightsInCluster).toBe(MAX_LIGHTS_PER_CLUSTER + 6);
    expect(clustered.diagnostics.requestedPerCluster).toEqual([MAX_LIGHTS_PER_CLUSTER + 6]);
    expect(clustered.diagnostics.indexedPerCluster).toEqual([MAX_LIGHTS_PER_CLUSTER]);
    expect(clustered.diagnostics.fallbackPolicy).toBe("input-order-no-observer");
    expect(clustered.diagnostics.warnings).toHaveLength(1);
    expect(clustered.diagnostics.warnings[0]).toMatch(/light budget exceeded/);
    expect(clustered.diagnostics.warnings[0]).toMatch(/input order/);
    expect(warnings).toEqual(clustered.diagnostics.warnings);
    // Input order preserved: first 64 input lights survive.
    expect(indexedLights(clustered)).toEqual(
      Array.from({ length: MAX_LIGHTS_PER_CLUSTER }, (_, index) => index)
    );
    clustered.dispose();
  });

  it("keeps the nearest N lights when an observer is supplied", () => {
    // Farthest-first input order proves the policy re-ranks by distance.
    const lights = Array.from({ length: MAX_LIGHTS_PER_CLUSTER + 6 }, (_, order) =>
      pointLightAt(MAX_LIGHTS_PER_CLUSTER + 5 - order, MAX_LIGHTS_PER_CLUSTER + 5 - order)
    );
    const warnings: string[] = [];
    const clustered = createClusteredForwardLighting(lights, 64, 64, undefined, {
      observerPosition: [0, 0, 0],
      onWarning: (message) => warnings.push(message)
    });

    expect(clustered.diagnostics.fallbackPolicy).toBe("nearest-observer");
    expect(clustered.diagnostics.overBudgetClusterCount).toBe(1);
    expect(clustered.diagnostics.droppedLightCount).toBe(6);
    expect(clustered.diagnostics.warnings[0]).toMatch(/nearest 64/);
    expect(warnings).toHaveLength(1);
    const kept = indexedLights(clustered);
    expect(kept).toHaveLength(MAX_LIGHTS_PER_CLUSTER);
    // Survivors are the 64 lights nearest the observer: input lights with x in 0..63,
    // i.e. light ids b5-point-0..63 regardless of farthest-first input order.
    const keptDistances = kept.map((lightIndex) => lights[lightIndex]!.position[0]);
    expect(Math.max(...keptDistances)).toBe(MAX_LIGHTS_PER_CLUSTER - 1);
    expect(new Set(kept).size).toBe(MAX_LIGHTS_PER_CLUSTER);
    clustered.dispose();
  });

  it("records per-cluster telemetry across a multi-cluster grid", () => {
    const lights = Array.from({ length: MAX_LIGHTS_PER_CLUSTER + 1 }, (_, index) => directionalLight(index));
    const clustered = createClusteredForwardLighting(
      lights,
      129,
      64,
      undefined,
      { onWarning: () => undefined }
    );

    expect(clustered.diagnostics.clusterCount).toBe(3);
    expect(clustered.diagnostics.requestedPerCluster).toEqual([
      MAX_LIGHTS_PER_CLUSTER + 1,
      MAX_LIGHTS_PER_CLUSTER + 1,
      MAX_LIGHTS_PER_CLUSTER + 1
    ]);
    expect(clustered.diagnostics.indexedPerCluster).toEqual([
      MAX_LIGHTS_PER_CLUSTER,
      MAX_LIGHTS_PER_CLUSTER,
      MAX_LIGHTS_PER_CLUSTER
    ]);
    expect(clustered.diagnostics.overBudgetClusterCount).toBe(3);
    expect(clustered.diagnostics.maxRequestedLightsInCluster).toBe(MAX_LIGHTS_PER_CLUSTER + 1);
    expect(clustered.diagnostics.totalLightReferences).toBe(3 * MAX_LIGHTS_PER_CLUSTER);
    expect(clustered.diagnostics.droppedLightCount).toBe(1);
    expect(clustered.diagnostics.warnings[0]).toMatch(/3 of 3 clusters/);
    clustered.dispose();
  });

  it("reports no fallback when every cluster is within budget", () => {
    const clustered = createClusteredForwardLighting([directionalLight(0)], 64, 64);
    const diagnostics: ClusteredForwardLightingDiagnostics = clustered.diagnostics;
    expect(diagnostics.overBudgetClusterCount).toBe(0);
    expect(diagnostics.maxRequestedLightsInCluster).toBe(1);
    expect(diagnostics.fallbackPolicy).toBe("none");
    expect(diagnostics.warnings).toEqual([]);
    clustered.dispose();
  });

  it("deduplicates the default console warning per configuration", () => {
    resetClusteredForwardLightingWarnings();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const lights = Array.from({ length: MAX_LIGHTS_PER_CLUSTER + 1 }, (_, index) => directionalLight(index));
      createClusteredForwardLighting(lights, 96, 96).dispose();
      createClusteredForwardLighting(lights, 96, 96).dispose();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toMatch(/light budget exceeded/);
      // A different peak budget is a different configuration and warns again.
      const more = [...lights, directionalLight(lights.length)];
      createClusteredForwardLighting(more, 96, 96).dispose();
      expect(spy).toHaveBeenCalledTimes(2);
      resetClusteredForwardLightingWarnings();
      createClusteredForwardLighting(lights, 96, 96).dispose();
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
      resetClusteredForwardLightingWarnings();
    }
  });

  it("rejects malformed observer positions", () => {
    expect(() => createClusteredForwardLighting([directionalLight(0)], 64, 64, undefined, {
      observerPosition: [0, 0] as unknown as readonly [number, number, number]
    })).toThrow(/observerPosition/);
    expect(() => createClusteredForwardLighting([directionalLight(0)], 64, 64, undefined, {
      observerPosition: [0, Number.NaN, 0]
    })).toThrow(/observerPosition/);
  });

  it("carries rect-area emitter dimensions through the clustered textures", () => {
    const clustered = createClusteredForwardLighting([rectAreaLight(2.6, 1.5)], 64, 64);
    const data = clustered.lightData.texture?.textureLevels[0]?.data as Float32Array;
    expect(Array.from(data.slice(8, 16))).toEqual([
      0,
      0,
      -1,
      3,
      expect.closeTo(2.6, 5),
      expect.closeTo(1.5, 5),
      0,
      expect.closeTo(0xffffffff, -1)
    ]);
    expect(clustered.diagnostics.overBudgetClusterCount).toBe(0);
    clustered.dispose();
  });
});

describe("B5 lighting rig presets", () => {
  it("publishes cinematic-night, arena-showdown, and product-hero", () => {
    for (const preset of B5_PRESETS) {
      expect(listLightingRigPresets()).toContain(preset);
    }
    expect(cinematicNight().preset).toBe("cinematic-night");
    expect(arenaShowdown().preset).toBe("arena-showdown");
    expect(productHero().preset).toBe("product-hero");
    // Whole-rig equality is compared on plain data: collectedLights embed live
    // scene-graph sources with per-instance ids that legitimately differ.
    for (const preset of B5_PRESETS) {
      const fromFactory = preset === "cinematic-night"
        ? cinematicNight()
        : preset === "arena-showdown" ? arenaShowdown() : productHero();
      const fromOptions = createLightingRig({ preset });
      expect(fromFactory.lights).toEqual(fromOptions.lights);
      expect(fromFactory.softboxes).toEqual(fromOptions.softboxes);
      expect(fromFactory.diagnostics).toEqual(fromOptions.diagnostics);
      expect(fromFactory.collectedLights.map((light) => light.kind)).toEqual(
        fromOptions.collectedLights.map((light) => light.kind)
      );
    }
  });

  it("builds rect-area, spot, key, and rim coverage in every new preset", () => {
    const factories = {
      "cinematic-night": cinematicNight,
      "arena-showdown": arenaShowdown,
      "product-hero": productHero
    } as const;
    for (const preset of B5_PRESETS) {
      const rig: LightingRig = factories[preset]();
      const kinds = rig.lights.map((light) => light.kind);
      const roles = rig.lights.map((light) => light.role);
      expect(rig.lights.length, `${preset} light count`).toBeGreaterThanOrEqual(4);
      expect(kinds, `${preset} rect-area`).toContain("rect-area");
      expect(kinds, `${preset} spot`).toContain("spot");
      expect(roles, `${preset} key`).toContain("key");
      expect(roles, `${preset} rim`).toContain("rim");
      expect(rig.collectedLights).toHaveLength(rig.lights.length);
      const rect = rig.collectedLights.find((light) => light.kind === "rect-area");
      expect(rect?.width, `${preset} rect width`).toBeGreaterThan(0);
      expect(rect?.height, `${preset} rect height`).toBeGreaterThan(0);
      expect(rect?.right, `${preset} rect basis`).toBeDefined();
      expect(rect?.up, `${preset} rect basis`).toBeDefined();
      expect(rig.diagnostics.shadowCastingLightCount, `${preset} shadow consistency`).toBe(
        rig.lights.filter((light) => light.castsShadow).length
      );
      expect(rig.softboxes.length, `${preset} softboxes`).toBeGreaterThanOrEqual(1);
      const lightIds = new Set(rig.lights.map((light) => light.id));
      for (const softbox of rig.softboxes) {
        for (const linked of softbox.linkedLightIds) {
          expect(lightIds.has(linked), `${preset} softbox link ${linked}`).toBe(true);
        }
      }
      expect(rig.diagnostics.unsupportedFeatures).toEqual(
        expect.arrayContaining(["ies-photometric-profile", "contact-shadow-map", "global-illumination"])
      );
      expect(rig.diagnostics.unsupportedFeatures).not.toContain("cascaded-shadow-map");
      expect(rig.diagnostics.disclosures.length).toBe(rig.diagnostics.unsupportedFeatures.length);
      expect(rig.diagnostics.claimBoundary.length).toBeGreaterThan(0);
    }
  });

  it("stays opt-in: building rigs touches no scene and returns fresh objects", () => {
    const scene = new Scene();
    cinematicNight();
    arenaShowdown();
    productHero();
    expect(scene.collectLights()).toHaveLength(0);
    expect(productHero().lights).toEqual(productHero().lights);
    expect(productHero().diagnostics).toEqual(productHero().diagnostics);
    expect(productHero()).not.toBe(productHero());
    // Shadow-casting keys exist where the preset claims them.
    expect(cinematicNight().lights.find((light) => light.id === "night-moon")?.castsShadow).toBe(true);
    expect(arenaShowdown().lights.find((light) => light.id === "arena-key")?.castsShadow).toBe(true);
  });

  it("scales new presets onto subjects without touching intensities", () => {
    const baseline = productHero().lights;
    const scaled = productHero({ subject: { height: 2 } }).lights;
    expect(scaled).toHaveLength(baseline.length);
    for (const [index, light] of scaled.entries()) {
      expect(light.position[1]).toBe(Number((baseline[index]!.position[1] * 2).toFixed(3)));
      expect(light.intensity).toBe(baseline[index]!.intensity);
    }
  });
});
