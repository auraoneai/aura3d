import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { AuraApp, AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";

describe("provider-neutral scene helpers", () => {
  it.each([
    ["looks/looks.ts", "../index.js"],
    ["looks/lookLint.ts", "../index.js"],
    ["nodes/effects.lighting.ts", "../index.js"],
    ["nodes/product.ts", "../product-viewer-runtime.js"],
    ["nodes/particles.ts", "../particle-fountain-runtime.js"],
    ["nodes/sceneKits.ts", "../humanoid-walk-runtime.js"],
    ["nodes/sceneKits.ts", "../particle-fountain-runtime.js"],
    ["nodes/sceneKits.ts", "../product-viewer-runtime.js"],
    ["nodes/sceneKitsCore.ts", "./games.js"],
    ["nodes/sceneKitsCore.ts", "../sceneKitDiagnostics.js"],
    ["nodes/prompt/promptPlanV2.ts", "../../index.js"],
    ["world/spline.ts", "../index.js"],
    ["world/kits.ts", "../index.js"],
    ["world/room.ts", "../index.js"],
    ["world/street.ts", "../index.js"],
    ["PromptAnimationEvidence.ts", "./humanoid-walk-runtime.js"],
    ["AuraVoiceBridge.ts", "./humanoid-walk-runtime.js"],
    ["AnimationDirector.ts", "./humanoid-walk-runtime.js"],
    ["SceneSequencer.ts", "./humanoid-walk-runtime.js"],
    ["ApplicationKits.ts", "./GameRuntime.js"]
  ])(
    "%s avoids its legacy runtime edge", (file, forbidden) => {
      const path = resolve("packages/engine/src/agent-api", file);
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const edges = source.statements.flatMap((statement) => {
        if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly && ts.isStringLiteral(statement.moduleSpecifier)) {
          return [statement.moduleSpecifier.text];
        }
        if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          return [statement.moduleSpecifier.text];
        }
        return [];
      });
      expect(edges).not.toContain(forbidden);
    }
  );

  it("builds looks and collects nested look diagnostics without loading the physics world", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.stubEnv("A3D_QR", "looks");
    vi.stubEnv("A3D_QR_LOOKS_EXPANSION", "v0");
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected physics world import");
    });

    try {
      const { looks } = await import("../../../packages/engine/src/agent-api/looks/looks.js");
      const { lookDiagnosticsSection } = await import("../../../packages/engine/src/agent-api/looks/lookDiagnostics.js");
      const { lightingEffectBuilders } = await import("../../../packages/engine/src/agent-api/nodes/effects.lighting.js");
      const { product } = await import("../../../packages/engine/src/agent-api/nodes/product.js");
      const { particles } = await import("../../../packages/engine/src/agent-api/nodes/particles.js");
      const { defineAuraAssets } = await import("../../../packages/engine/src/agent-api/nodes/assets.js");

      const preset = looks.preset("outdoor-day", { environmentIntensity: 2 }, { expansion: "v0" });
      if (!("toJSON" in preset)) throw new Error("v0 look should produce a group builder");
      const group = preset.toJSON();
      expect(group).toMatchObject({ kind: "group", name: "aura-look:outdoor-day" });
      expect(group.children).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "environment", environment: "hdri", intensity: 2, texture: expect.objectContaining({ id: "autumnFieldPuresky1k" }) }),
        expect.objectContaining({ kind: "light", light: "directional", shadow: true }),
        expect.objectContaining({ kind: "effect", effect: "color-grade" })
      ]));

      const nestedAmbient: AuraSceneNode = {
        kind: "group", name: "nested", position: [3, 0, 0], children: [
          { kind: "light", light: "ambient", name: "too bright", intensity: 1.6, color: "#ffffff" }
        ]
      };
      const snapshot: AuraSceneSnapshot = {
        schema: "aura3d-scene-snapshot/1.0", background: "#9db8cf",
        camera: { mode: "orbit", position: [3, 2, 3], target: [0, 0, 0] },
        nodes: [group, nestedAmbient], diagnostics: { enabled: false }
      };
      const diagnostics = lookDiagnosticsSection.collect({ scene: snapshot } as AuraApp);
      expect(diagnostics).toMatchObject({ id: "outdoor-day", expansion: "v0-current-engine" });
      expect(diagnostics.lint).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "look/ambient-flattens", nodes: ["too bright"] })
      ]));
      expect(diagnostics.lint.map(({ code }) => code)).not.toContain("look/no-lights");
      expect(diagnostics.lint.map(({ code }) => code)).not.toContain("look/no-ibl");

      expect(lightingEffectBuilders.contactShadows().toJSON()).toMatchObject({
        kind: "effect", effect: "contact-shadows",
        contactShadows: { length: 0.25, thickness: 0.05, steps: 12, intensity: 1, lights: "sun" }
      });
      expect(lightingEffectBuilders.contactShadows({ length: 0, steps: 16, lights: "shadowed" }).toJSON()).toMatchObject({
        contactShadows: { length: 0, thickness: 0.05, steps: 16, intensity: 1, lights: "shadowed" }
      });
      const { sample } = defineAuraAssets({ sample: { type: "model", format: "glb", url: "/sample.glb", bounds: [2, 1, 1] } });
      expect(product.placement(sample)).toMatchObject({ assetId: "sample", bounds: [2, 1, 1], scale: 0.72 });
      expect(product.viewer(sample, { stageStyle: "inspection", captureFrame: 0.7 })).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "model", asset: sample, animation: expect.objectContaining({ clip: "turntable", captureTime: 0.7 }) })
      ]));
      const fountain = particles.fountain({ count: 500, emissionRate: 33, color: "#123456" });
      expect(fountain).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "effect", effect: "particles", particleCount: 500, emissionRate: 33, color: "#123456" })
      ]));
      expect(particles.diagnostics(fountain)).toMatchObject({ effectCount: 3, totalParticles: 920 });
      expect(worldLoaded).not.toHaveBeenCalled();

      // Confirm the mock intercepts the actual legacy route.
      await expect(import("../../../packages/engine/src/agent-api/app/createAuraApp.js")).rejects.toThrow();
      expect(worldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }, 30_000);

  it("runs all application kits without loading the legacy physics world", async () => {
    const legacyWorldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      legacyWorldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const kits = await import("../../../packages/engine/src/agent-api/ApplicationKits.js");
      const { placedBounds } = await import("../../../packages/engine/src/agent-api/SpatialAnchoring.js");
      const bounds = placedBounds({ position: [0, 0, 0], size: [8, 6, 8], floorY: 0 });
      const part = { id: "part", label: "Part", u: 0.5, v: 0.5, w: 0.5, extent: [0.2, 0.2, 0.2] } as const;
      const product = kits.createProductConfiguratorKit({ bounds, parts: [{ ...part, price: 10 }],
        variants: [{ id: "base", label: "Base", color: "#ffffff", accent: "#555555", price: 0 }],
        finishes: [{ id: "satin", label: "Satin", price: 0 }], basePrice: 100 });
      expect(product.selectPart("part").price).toBe(110);
      const twin = kits.createDigitalTwinKit({ bounds, equipment: [{ ...part, sensors: { load: 5 } }] });
      expect(twin.raiseAlarm({ equipmentId: "part", severity: "critical", message: "overheat" }).mode).toBe("incident");
      const architecture = kits.createArchitectureKit({ bounds, spaces: [{ ...part, floor: 1 }],
        moods: [{ id: "noon", label: "Noon", sunElevation: 75, sunAzimuth: 180 }] });
      expect(architecture.focusSpace("part").visibleSpaceIds).toEqual(["part"]);
      expect(architecture.setSection({ planes: [[1, 0, 0, -2]] }).clipping.enabled).toBe(true);
      const city = kits.createSmartCityKit({ bounds, districts: [{ ...part, color: "#ffffff" }],
        layers: [{ id: "load", label: "Load", values: { part: 0.7 } }] });
      expect(city.frame().overlays).toEqual(expect.arrayContaining([expect.objectContaining({ districtId: "part", value: 0.7 })]));
      const cinematic = kits.createCinematicKit({ shots: [{ id: "move", seconds: 2, from: [0, 2, 8], to: [0, 2, 4], target: [0, 1, 0], transition: "linear" }] });
      expect(cinematic.sampleAt(1)).toMatchObject({ shotId: "move", shotProgress: 0.5, camera: { position: [0, 2, 6] } });
      expect(legacyWorldLoaded).not.toHaveBeenCalled();
      await expect(import("../../../packages/engine/src/agent-api/GameRuntime.js")).rejects.toThrow();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("compiles prompt plans into authored scenes without importing legacy physics", async () => {
    const legacyWorldLoaded = vi.fn();
    vi.resetModules();
    vi.stubEnv("A3D_QR", "looks,-vfx");
    vi.stubEnv("A3D_QR_LOOKS_EXPANSION", "v0");
    vi.doMock("@aura3d/physics/world", () => {
      legacyWorldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const { compilePromptPlanV2 } = await import("../../../packages/engine/src/agent-api/nodes/prompt/promptPlanV2.js");
      const { defineAuraAssets } = await import("../../../packages/engine/src/agent-api/nodes/assets.js");
      const { effects } = await import("../../../packages/engine/src/agent-api/nodes/effects.composite.js");
      const { groups } = await import("../../../packages/engine/src/agent-api/nodes/groups.js");
      const { AuraSceneBuilder } = await import("../../../packages/engine/src/agent-api/nodes/scene.js");
      const { sample } = defineAuraAssets({ sample: { type: "model", format: "glb", url: "/sample.glb", bounds: [1, 2, 1], hash: "sha256-test" } });
      const flatten = vi.spyOn(groups, "flatten");
      const fog = vi.spyOn(effects, "fog");
      const compiled = compilePromptPlanV2({
        sceneType: "product-viewer", subject: { asset: sample, label: "product" },
        acceptanceCriteria: ["subject visible"], environment: "studio sweep", effects: ["fog", "rain"]
      });
      expect(compiled.scene).toBeInstanceOf(AuraSceneBuilder);
      expect(compiled.report).toMatchObject({
        schema: "aura3d-prompt-plan-report/2.0", subjectAssetId: "sample",
        look: { id: "product-studio", from: "plan.environment" }
      });
      expect(compiled.report.appliedEffects).toContain("fog");
      expect(compiled.report.rejected).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "effects", value: "rain", code: "unsupported-effect" })
      ]));
      expect(flatten).toHaveBeenCalled();
      expect(fog).toHaveBeenCalled();
      const nodes = groups.flatten(compiled.scene.toJSON().nodes);
      expect(nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "model", asset: sample }),
        expect.objectContaining({ kind: "effect", effect: "fog" })
      ]));
      expect(legacyWorldLoaded).not.toHaveBeenCalled();
      await expect(import("../../../packages/engine/src/agent-api/nodes/games.js")).rejects.toThrow();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("builds world-kit placements and deterministic fills without legacy physics", async () => {
    const legacyWorldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      legacyWorldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const { worldKits } = await import("../../../packages/engine/src/agent-api/world/kits.js");
      const { worldRoom } = await import("../../../packages/engine/src/agent-api/world/room.js");
      const { worldStreet } = await import("../../../packages/engine/src/agent-api/world/street.js");
      const city = worldKits.city;
      expect(city.definition.license).toBe("CC0-1.0");
      expect(city.piece("street-lamp").asset).toMatchObject({ kind: "aura-asset-ref", id: "cityStreetLamp" });
      const placed = city.place([{ piece: "street-lamp", cell: [2, 1] }], { origin: [10, 0, 20] });
      expect(placed.instanceCount).toBe(1);
      expect(placed.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "light", light: "point", position: [18, 4.8, 24] })
      ]));
      const scatter = (placed.nodes as unknown as Array<{ kind: string; placements?: { asset: { id: string }; matrices: Float32Array } }>)
        .find((node) => node.kind === "scatter");
      expect(scatter?.placements?.asset.id).toBe("cityStreetLamp");
      expect(scatter?.placements?.matrices[3]).toBe(18);
      expect(scatter?.placements?.matrices[11]).toBe(24);
      const region = { shape: { kind: "circle", center: [0, 0], radius: 16 } } as const;
      const options = { seed: 9, density: 0.8, exclude: [{ kind: "circle", center: [0, 0], radius: 4 }] } as const;
      const first = city.fill(region, options), second = city.fill(region, options);
      expect(first.instanceCount).toBeGreaterThan(0);
      expect(first.checksum).toBe(second.checksum);
      expect(first.perAsset).toEqual(second.perAsset);
      const room = worldRoom({ size: [12, 3, 8], name: "isolated-room", dressing: false,
        openings: [{ wall: "north", width: 2, height: 2.1 }] });
      const roomNames = room.map((node) => "name" in node ? node.name ?? "" : "");
      expect(roomNames.filter((name) => name.includes("north-wall"))).toHaveLength(2);
      expect(roomNames.filter((name) => name.includes("lintel"))).toHaveLength(1);
      expect(room.some((node) => node.kind === "light")).toBe(true);
      const street = worldStreet({ path: [[0, 0, -60], [0, 0, 60]], lanes: 4,
        name: "isolated-street", props: false, buildings: false });
      const streetNames = street.map((node) => "name" in node ? node.name ?? "" : "");
      expect(streetNames).toContain("isolated-street-road");
      expect(streetNames.filter((name) => name.includes("sidewalk"))).toHaveLength(2);
      expect(streetNames.filter((name) => name.includes("lane-"))).toHaveLength(2);
      expect(legacyWorldLoaded).not.toHaveBeenCalled();
      await expect(import("../../../packages/engine/src/agent-api/nodes/games.js")).rejects.toThrow();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("binds scene kits and customization to independent physics providers", async () => {
    const legacyWorldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      legacyWorldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const { createPhysicsWorldProvider } = await import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js");
      const { createGamesWithPhysicsWorldAccess } = await import("../../../packages/engine/src/agent-api/nodes/games-core.js");
      const { createSceneKitsWithGames } = await import("../../../packages/engine/src/agent-api/nodes/sceneKitsCore.js");
      const { MINI_GOLF_LAYOUT } = await import("../../../packages/engine/src/agent-api/nodes/prefabs/index.js");

      function trackedProvider(label: string) {
        const worlds: FakeWorld[] = [];
        class FakeWorld {
          readonly fixedDelta = 1 / 60;
          nextId = 1;
          steps = 0;
          disposed = false;
          constructor() { worlds.push(this); }
          createRigidBody(options: { position?: readonly number[] }) {
            return {
              id: this.nextId++, position: [...(options.position ?? [0, 0, 0])], velocity: [0, 0, 0], sleeping: false,
              setVelocity: vi.fn(), setAngularVelocity: vi.fn(), setPosition: vi.fn(), sleep: vi.fn(), wake: vi.fn(), applyImpulse: vi.fn()
            };
          }
          createCollider() { return { id: this.nextId++ }; }
          step() { this.steps += 1; return []; }
          snapshot() { return { backend: { active: label }, stats: { steps: this.steps }, contacts: [] }; }
          dispose() { this.disposed = true; }
        }
        const provider = createPhysicsWorldProvider(async () => ({
          PhysicsWorld: FakeWorld, ensurePhysics: async () => ({ World: class BackendWorld {}, init: async () => {} })
        } as unknown as import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js").PhysicsWorldModule));
        const games = createGamesWithPhysicsWorldAccess(provider, {
          layout: MINI_GOLF_LAYOUT,
          prefabs: {
            miniGolfHole: () => [{ kind: "primitive", primitive: "sphere", name: `${label}-ball` }],
            miniGolfCourse: () => []
          },
          scene: () => undefined, camera: {}, lights: {}, timeline: {}, fightingGameKit: {}, createFightingGameKit: () => undefined
        } as never);
        return { worlds, provider, kits: createSceneKitsWithGames(games) };
      }

      const first = trackedProvider("first");
      const second = trackedProvider("second");
      expect(first.kits.particleFountain({ particleCount: 500 }).id).toBe("particleFountain");
      expect(() => first.kits.miniGolf()).toThrow(/await preloadPhysics/i);
      expect(() => second.kits.miniGolf()).toThrow(/await preloadPhysics/i);
      expect(first.worlds).toHaveLength(0);
      expect(second.worlds).toHaveLength(0);

      await first.provider.preload();
      const firstKit = first.kits.miniGolf();
      expect(firstKit.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "first-ball" })]));
      expect(firstKit.evidence).toEqual(expect.arrayContaining([
        "state-backed deterministic shot mini-golf-rapier-v2-1-0-0-0",
        "shots 1, score 0, contacts 0, collisions 0"
      ]));
      expect(first.worlds).toHaveLength(1);
      expect(first.worlds[0]).toMatchObject({ steps: 150, disposed: true });
      expect(() => second.kits.miniGolf()).toThrow(/await preloadPhysics/i);

      await second.provider.preload();
      const secondKit = second.kits.miniGolf();
      expect(secondKit.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "second-ball" })]));
      expect(second.worlds[0]).toMatchObject({ steps: 150, disposed: true });
      const alternateCamera = { mode: "orbit", position: [1, 2, 3], target: [0, 0, 0] } as const;
      const rebuilt = firstKit.customize({ camera: alternateCamera });
      expect(rebuilt.camera).toEqual(alternateCamera);
      expect(rebuilt.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "first-ball" })]));
      expect(first.worlds).toHaveLength(2);
      expect(first.worlds[1]).toMatchObject({ steps: 150, disposed: true });
      expect(second.worlds).toHaveLength(1);
      expect(legacyWorldLoaded).not.toHaveBeenCalled();

      await expect(import("../../../packages/engine/src/agent-api/nodes/games.js")).rejects.toThrow();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("extrudes and conforms a world spline without loading legacy physics", async () => {
    const legacyWorldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      legacyWorldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const { worldSpline, worldExtrude } = await import("../../../packages/engine/src/agent-api/world/spline.js");
      const { worldTerrain, terrainRecordFor } = await import("../../../packages/engine/src/agent-api/world/terrain.js");
      const heights = new Float32Array(33 * 33).fill(0.5);
      worldTerrain({ id: "isolated-spline-test", size: [64, 64], heightScale: 20,
        height: { kind: "array", columns: 33, rows: 33, heights }, layers: [{ name: "ground" }] });
      const spline = worldSpline([[4, 3, 32], [60, 3, 32]]);
      expect(spline.length).toBeCloseTo(56);
      expect(spline.pointAt(0)).toEqual([4, 3, 32]);
      expect(spline.pointAt(1)[0]).toBeCloseTo(60);
      expect(spline.closestT(spline.pointAt(0.6))).toBeCloseTo(0.6, 2);
      const node = worldExtrude(spline, {
        profile: "road-2-lane", material: { color: "#888888" }, uv: { vMetersPerTile: 8 },
        conformToTerrain: { terrain: "isolated-spline-test", falloff: 6 }
      });
      if (node.kind !== "primitive" || !node.geometry) throw new Error("expected custom road geometry");
      expect(node.primitive).toBe("custom");
      expect(node.geometry.indices!.length % 3).toBe(0);
      const uvs = node.geometry.uvs;
      if (!Array.isArray(uvs) || uvs.some((value) => typeof value !== "number")) throw new Error("expected flat UV coordinates");
      expect(Math.max(...(uvs as readonly number[]).filter((_, i) => i % 2 === 1))).toBeCloseTo(7, 1);
      expect(heights[16 * 33 + 16]! * 20).toBeCloseTo(3, 3);
      expect(heights[4 * 33 + 4]).toBeCloseTo(0.5);
      expect(terrainRecordFor("isolated-spline-test")?.gridVersion).toBe(1);
      expect(legacyWorldLoaded).not.toHaveBeenCalled();
      await expect(import("../../../packages/engine/src/agent-api/nodes/games.js")).rejects.toThrow();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("plans, samples and reports animation without importing the legacy app", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected physics world import");
    });
    try {
      const { createAnimationDirectorPlan } = await import("../../../packages/engine/src/agent-api/AnimationDirector.js");
      const { createAuraVoiceBridgePackage, sampleAuraVoiceBridgeAtTime } = await import("../../../packages/engine/src/agent-api/AuraVoiceBridge.js");
      const { collectPromptAnimationEvidence } = await import("../../../packages/engine/src/agent-api/PromptAnimationEvidence.js");
      const { createEpisodeStructure } = await import("../../../packages/engine/src/agent-api/EpisodeStructure.js");
      const { createSceneSequencer, createSceneSequencerPlayback } = await import("../../../packages/engine/src/agent-api/SceneSequencer.js");

      const plan = createAnimationDirectorPlan({
        episodeId: "episode-1", title: "Garden", prompt: "A helper greets a friend.", language: "en",
        runtime: { duration: 2, frameRate: 24, resolution: { width: 1280, height: 720 } },
        characters: [{ id: "hero", name: "Hero" }], locations: [{ id: "garden", name: "Garden" }],
        beats: [{ id: "beat-1", sceneId: "garden", locationId: "garden", summary: "The hero speaks.",
          visualIntent: "A close view.", characters: ["hero"], dialogue: [{ speakerId: "hero", text: "Hello there." }] }]
      });
      const bridge = createAuraVoiceBridgePackage({
        episodePlan: plan.episodePlan, storyboard: plan.storyboard, shotTimeline: plan.shotTimeline,
        dialogueTrack: plan.dialogueTrack, captionTrack: plan.captionTrack,
        renderQueue: plan.renderQueue, renderOutputPackage: plan.renderOutputPackage
      });
      expect(sampleAuraVoiceBridgeAtTime(bridge, 0.5, "hero")).toMatchObject({
        frame: 12, shot: { shotId: "shot-1" }, dialogue: { lineId: "shot-1:line-1", text: "Hello there." }
      });
      const evidence = collectPromptAnimationEvidence({ bridgePackage: bridge });
      expect(evidence).toMatchObject({ episodeId: "episode-1", assetStatus: { missingAssets: ["hero"] } });

      const episode = createEpisodeStructure({
        episodeId: "episode-1", metadata: { title: "Garden", runtime: 2, characterIds: ["hero"] },
        acts: [{ actId: "act-1", title: "Act 1", startTime: 0, endTime: 2, scenes: [
          { sceneId: "garden", title: "Garden", startTime: 0, endTime: 2, characterIds: ["hero"],
            shotRefs: [{ shotId: "shot-1", startTime: 0, endTime: 2 }] }
        ] }]
      });
      const playback = createSceneSequencerPlayback(createSceneSequencer({ episode, timeline: plan.shotTimeline }));
      playback.play();
      expect(playback.step(0.5)).toMatchObject({ status: "playing", shot: { shotId: "shot-1" }, activeCharacterIds: ["hero"] });
      expect(worldLoaded).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("keeps the runtime wrappers' legacy app binding and kit option forwarding", async () => {
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => ({
      PhysicsWorld: class FakeWorld {},
      ensurePhysics: async () => ({ World: class FakeBackend {}, init: async () => {} })
    }));
    try {
      const legacy = await import("../../../packages/engine/src/agent-api/app/createAuraApp.js");
      const humanoid = await import("../../../packages/engine/src/agent-api/humanoid-walk-runtime.js");
      const fountain = await import("../../../packages/engine/src/agent-api/particle-fountain-runtime.js");
      const product = await import("../../../packages/engine/src/agent-api/product-viewer-runtime.js");
      const { sceneKits } = await import("../../../packages/engine/src/agent-api/nodes/sceneKits.js");
      const { games } = await import("../../../packages/engine/src/agent-api/nodes/games.js");

      expect(humanoid.createAuraApp).toBe(legacy.createAuraApp);
      expect(fountain.createAuraApp).toBe(legacy.createAuraApp);
      expect(product.createAuraApp).toBe(legacy.createAuraApp);
      expect(humanoid.character.clips().map(({ name }) => name)).toContain("walk");
      const humanoidKit = humanoid.humanoidWalk({ animationState: "run" });
      expect(humanoidKit).toMatchObject({ kind: "aura-scene-kit", id: "humanoidWalk" });
      expect(humanoidKit.nodes).toEqual(sceneKits.humanoidWalk({ animationState: "run" }).nodes);
      const fountainKit = fountain.particleFountain({ particleCount: 500, emissionRate: 33, color: "#123456" });
      expect(fountainKit.nodes).toEqual(sceneKits.particleFountain({ particleCount: 500, emissionRate: 33, colors: ["#123456"] }).nodes);
      expect(fountainKit.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "effect", effect: "particles", particleCount: 500, emissionRate: 33, color: "#123456" })
      ]));
      expect(fountainKit.scene().toJSON().nodes).toEqual(fountainKit.nodes);
      const { sample } = product.defineAuraAssets({ sample: { type: "model", format: "glb", url: "/sample.glb" } });
      const productKit = product.productViewer(sample, { stageStyle: "inspection" });
      expect(productKit.nodes).toEqual(sceneKits.productViewer(sample, { stageStyle: "inspection" }).nodes);
      expect(productKit.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "model", asset: sample })
      ]));

      const shoot = vi.fn();
      const step = vi.fn(() => ({ deterministicReplayId: "replay-1", shots: 1, score: 2, contacts: 3, collisions: 4 }));
      const nodes = vi.fn((): AuraSceneNode[] => []);
      const dispose = vi.fn();
      const createState = vi.spyOn(games, "createMiniGolfState")
        .mockReturnValue({ shoot, step, nodes, dispose } as unknown as ReturnType<typeof games.createMiniGolfState>);
      try {
        const miniGolf = sceneKits.miniGolf();
        expect(createState).toHaveBeenCalledOnce();
        expect(shoot).toHaveBeenCalledWith(expect.objectContaining({ power: 1.25 }));
        expect(step).toHaveBeenCalledWith(150);
        expect(nodes).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledOnce();
        expect(miniGolf.evidence).toEqual(expect.arrayContaining([
          "state-backed deterministic shot replay-1", "shots 1, score 2, contacts 3, collisions 4"
        ]));
      } finally {
        createState.mockRestore();
      }
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);
});
