import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { GameCollisionWorldSnapshot, GameEventRecord, GameKinematicBody } from "../../../packages/engine/src/agent-api/GameRuntimeCore.js";
import type { AuraAssetRef, AuraPhysicsSceneSummary, AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { SceneKitGames } from "../../../packages/engine/src/agent-api/sceneKitDiagnosticsCore.js";

/** Whole-clause type imports are erased; inline type specifiers may still emit an import. */
function runtimeImports(file: string): string[] {
  const path = resolve("packages/engine/src/agent-api", file);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
}

describe("provider-neutral evidence import edges", () => {
  it("does not eagerly import legacy physics for evidence or scene-kit diagnostics", () => {
    for (const file of ["sceneEvidence.ts", "GameEvidence.ts", "sceneKitDiagnostics.ts", "sceneKitDiagnosticsCore.ts"]) {
      const imports = runtimeImports(file);
      expect(imports, file).not.toContain("./nodes/physics.js");
      expect(imports, file).not.toContain("@aura3d/physics/world");
    }
    expect(runtimeImports("GameEvidence.ts")).not.toContain("./GameRuntime.js");
    expect(runtimeImports("GameEvidence.ts")).not.toContain("./GameRuntime");
    expect(runtimeImports("sceneEvidence.ts")).not.toContain("./nodes/scene.js");
    expect(runtimeImports("sceneKitDiagnosticsCore.ts")).not.toContain("./nodes/games.js");
    expect(runtimeImports("sceneKitDiagnosticsCore.ts")).not.toContain("./nodes/games-core.js");
  });

  it("collects scene and game state without loading a physics provider", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected physics world import");
    });

    try {
      const { collectAuraSceneEvidence } = await import("../../../packages/engine/src/agent-api/sceneEvidence.js");
      const { collectGameRuntimeEvidence } = await import("../../../packages/engine/src/agent-api/GameEvidence.js");
      const { scene } = await import("../../../packages/engine/src/agent-api/nodes/scene.js");
      const { camera } = await import("../../../packages/engine/src/agent-api/nodes/camera.js");

      const nodes: AuraSceneNode[] = [
        { kind: "primitive", primitive: "sphere", name: "player", physics: { type: "dynamic", sensor: true }, animation: { clip: "walk" }, runtime: { id: "player" } },
        { kind: "primitive", primitive: "box", name: "floor", physics: { type: "static" }, animation: { clip: "turntable" } },
        { kind: "model", asset: { kind: "aura-asset-ref", id: "robot", type: "model", format: "glb", url: "/aura-assets/robot.glb", hash: "sha256-test", bounds: [1, 2, 1] } as unknown as AuraAssetRef<"model">, castShadow: true, receiveShadow: true, visible: true },
        { kind: "interaction", mode: "orbit" },
        { kind: "interaction", mode: "drag-vector", target: "player" },
        { kind: "interaction", mode: "click-impulse", target: "player" },
        { kind: "label", label: "billboard", text: "Player", occlusionAware: true, collisionAvoidance: true }
      ];
      const builder = scene().addMany(nodes).camera(camera.follow({ targetNode: "player", captureTime: 0.35 }));
      const withoutWorld = collectAuraSceneEvidence(builder);
      expect(withoutWorld.physics).toEqual({ worldAttached: false, bodies: 2, colliders: 2, contacts: 0, steps: 0, resets: 0, nodesWithPhysics: 2, sensors: 1 });
      expect(withoutWorld.interactions).toMatchObject({ modes: ["click-impulse", "drag-vector", "orbit"], orbitEnabled: true, dragTargets: ["player"], impulseTargets: ["player"] });
      expect(withoutWorld.camera).toMatchObject({ mode: "follow", orbitEnabled: true, followTarget: "player", captureTime: 0.35 });
      expect(withoutWorld.animation).toEqual({ animatedNodes: 2, turntableEnabled: true, walkEnabled: true, clips: ["turntable", "walk"] });
      expect(withoutWorld.labels).toEqual({ count: 1, kinds: ["billboard"], occlusionAware: 1, collisionAvoidance: 1 });
      expect(withoutWorld.assets).toEqual([expect.objectContaining({ source: "typed-aura-assets-manifest", id: "robot", hash: "sha256-test", bounds: [1, 2, 1] })]);
      expect(withoutWorld.gameRuntime).toMatchObject({
        source: { mode: "scene-source", expectsGame: true, label: "collectAuraSceneEvidence" },
        runtimeNodes: { count: 1, ids: ["player"] },
        animation: { controllers: 2, activeClips: ["turntable", "walk"], eventCount: 0 },
        assets: { typedAssets: 1, missingAssets: [] }
      });

      const summary = { kind: "aura-physics-world", bodies: 6, colliders: 7, contacts: 3, steps: 12, resets: 2 } as AuraPhysicsSceneSummary;
      const withWorld = collectAuraSceneEvidence({ ...builder.toJSON(), physics: summary });
      expect(withWorld.physics).toEqual({ worldAttached: true, bodies: 6, colliders: 7, contacts: 3, steps: 12, resets: 2, nodesWithPhysics: 2, sensors: 1 });

      const bodies = [
        { grounded: true, velocity: [0, 0, 0] },
        { grounded: false, velocity: [0.5, 0, 0] }
      ] as unknown as GameKinematicBody[];
      const collision = { backend: "native", bodies: [{}, {}], contacts: [{ sensor: false }, { sensor: true }] } as unknown as GameCollisionWorldSnapshot;
      const event = (id: string, type: string): GameEventRecord => ({ kind: "aura-game-event", id, type, label: type, tags: [], severity: "info", frame: 1, time: 0.1 });
      const events = [event("1", "score"), event("2", "hit"), event("3", "score")];
      const evidence = collectGameRuntimeEvidence(
        { runtime: { frame: 4, time: 0.1, paused: false }, nodes: { ids: () => ["player", "ball"], all: () => [{ id: "player", debugLabel: "Hero" }] } },
        { bodies, collisionWorld: collision, events, renderer: { assetFailures: ["broken.glb"] }, errors: [{ severity: "error", code: "E_TEST", message: "test failure" }] }
      );
      expect(evidence.runtimeNodes).toMatchObject({ count: 2, debugLabels: { player: "Hero", ball: "runtime:ball" } });
      expect(evidence.physics).toEqual({ kinematicBodies: 2, groundedBodies: 1 });
      expect(evidence.movement).toEqual({ bodies: 2, groundedBodies: 1, airborneBodies: 1, movingBodies: 1 });
      expect(evidence.collision).toMatchObject({ collisionWorld: true, backend: "native", bodies: 2, contacts: 2, sensorContacts: 1 });
      expect(evidence.events).toMatchObject({ configured: true, count: 3, types: ["hit", "score"], last: events[2] });
      expect(evidence.warnings).toEqual(expect.arrayContaining(["Renderer asset failure: broken.glb", "ERROR E_TEST: test failure"]));
      expect(worldLoaded).not.toHaveBeenCalled();

      // Confirm the mock intercepts the actual legacy physics dependency.
      await expect(import("../../../packages/engine/src/agent-api/nodes/physics.js")).rejects.toThrow();
      expect(worldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("keeps mini-golf diagnostics driven by the stepped game state", async () => {
    const shoot = vi.fn();
    const step = vi.fn(() => ({ deterministicReplayId: "shot-42", shots: 1, score: 2, contacts: 3, collisions: 4 }));
    const nodes = vi.fn(() => [{ kind: "primitive", primitive: "sphere", name: "state-backed ball" }]);
    const dispose = vi.fn();
    const createMiniGolfState = vi.fn(() => ({ shoot, step, nodes, dispose }));
    vi.resetModules();
    vi.doMock("../../../packages/engine/src/agent-api/nodes/games.js", () => ({ games: { createMiniGolfState } }));

    try {
      const { buildSceneKit, createSceneKitPerformanceDiagnostics } = await import("../../../packages/engine/src/agent-api/sceneKitDiagnostics.js");
      const kit = buildSceneKit("miniGolf", {});
      expect(createMiniGolfState).toHaveBeenCalledOnce();
      expect(shoot).toHaveBeenCalledWith({ vector: [1, 0, -0.55], power: 1.25 });
      expect(step).toHaveBeenCalledWith(150);
      expect(nodes).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledOnce();
      expect(kit.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "state-backed ball" })]));
      expect(kit.evidence).toEqual([
        "state-backed deterministic shot shot-42",
        "shots 1, score 2, contacts 3, collisions 4",
        "ball/cup/obstacle/course boundaries",
        "aim/power/score cues"
      ]);
      const performance = createSceneKitPerformanceDiagnostics("miniGolf", kit.nodes);
      expect(performance.drawCalls).toMatchObject({ maxDrawCalls: 90, estimatedDrawCalls: 48, pass: true });
      expect(performance.lazyLoading).toMatchObject({ allOptional: true, systems: [{ system: "physics-backend", trigger: "miniGolf physics state construction", loadedByDefault: false }] });
    } finally {
      vi.doUnmock("../../../packages/engine/src/agent-api/nodes/games.js");
      vi.resetModules();
    }
  }, 30_000);

  it("builds each mini-golf kit with its supplied provider and disposes only its own state", async () => {
    const worldLoaded = vi.fn();
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldLoaded();
      throw new Error("unexpected legacy physics world import");
    });
    try {
      const { buildSceneKitWithGames } = await import("../../../packages/engine/src/agent-api/sceneKitDiagnosticsCore.js");
      const factory = (name: string) => {
        const shoot = vi.fn();
        const step = vi.fn(() => ({ deterministicReplayId: name, shots: 1, score: 2, contacts: 3, collisions: 4 }));
        const nodes = vi.fn(() => [{ kind: "primitive", primitive: "sphere", name: `${name} ball` }]);
        const dispose = vi.fn();
        const createMiniGolfState = vi.fn(() => ({ shoot, step, nodes, dispose }));
        return { games: { createMiniGolfState } as unknown as SceneKitGames, createMiniGolfState, shoot, step, nodes, dispose };
      };
      const first = factory("first-provider");
      const second = factory("second-provider");

      const playground = buildSceneKitWithGames(first.games, "physicsPlayground", { cubes: 2 });
      expect(playground.nodes.length).toBeGreaterThan(2);
      expect(first.createMiniGolfState).not.toHaveBeenCalled();

      const firstKit = buildSceneKitWithGames(first.games, "miniGolf", {});
      expect(firstKit.evidence[0]).toBe("state-backed deterministic shot first-provider");
      expect(firstKit.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "first-provider ball" })]));
      expect(second.createMiniGolfState).not.toHaveBeenCalled();
      expect(first.shoot).toHaveBeenCalledWith({ vector: [1, 0, -0.55], power: 1.25 });
      expect(first.step).toHaveBeenCalledWith(150);
      expect(first.nodes).toHaveBeenCalledOnce();
      expect(first.dispose).toHaveBeenCalledOnce();
      expect(first.shoot.mock.invocationCallOrder[0]).toBeLessThan(first.step.mock.invocationCallOrder[0]);
      expect(first.step.mock.invocationCallOrder[0]).toBeLessThan(first.nodes.mock.invocationCallOrder[0]);
      expect(first.nodes.mock.invocationCallOrder[0]).toBeLessThan(first.dispose.mock.invocationCallOrder[0]);

      const secondKit = buildSceneKitWithGames(second.games, "miniGolf", {});
      expect(secondKit.evidence[0]).toBe("state-backed deterministic shot second-provider");
      expect(secondKit.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ name: "second-provider ball" })]));
      expect(first.dispose).toHaveBeenCalledOnce();
      expect(second.dispose).toHaveBeenCalledOnce();
      expect(worldLoaded).not.toHaveBeenCalled();

      // Prove that the mock catches the actual legacy world binding.
      await expect(import("../../../packages/engine/src/agent-api/nodes/games.js")).rejects.toThrow();
      expect(worldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);

  it("disposes failed mini-golf construction without masking the original error", async () => {
    const { buildSceneKitWithGames } = await import("../../../packages/engine/src/agent-api/sceneKitDiagnosticsCore.js");
    for (const phase of ["shoot", "step", "nodes"] as const) {
      const original = new Error(`${phase} failed`);
      const cleanup = new Error("cleanup failed");
      const shoot = vi.fn();
      const step = vi.fn(() => ({ deterministicReplayId: "shot", shots: 1, score: 0, contacts: 0, collisions: 0 }));
      const nodes = vi.fn(() => []);
      const dispose = vi.fn(() => { throw cleanup; });
      const state = { shoot, step, nodes, dispose };
      state[phase].mockImplementation(() => { throw original; });
      const games = { createMiniGolfState: () => state } as unknown as SceneKitGames;
      let thrown: unknown;
      try {
        buildSceneKitWithGames(games, "miniGolf", {});
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(original);
      expect(dispose).toHaveBeenCalledOnce();
      if (phase === "shoot") expect(step).not.toHaveBeenCalled();
      if (phase !== "nodes") expect(nodes).not.toHaveBeenCalled();
    }

    const constructorError = new Error("provider unavailable");
    const games = { createMiniGolfState: () => { throw constructorError; } } as unknown as SceneKitGames;
    expect(() => buildSceneKitWithGames(games, "miniGolf", {})).toThrow(constructorError);

    const cleanupError = new Error("cleanup after success failed");
    const dispose = vi.fn(() => { throw cleanupError; });
    const successfulState = {
      shoot: vi.fn(),
      step: vi.fn(() => ({ deterministicReplayId: "shot", shots: 1, score: 0, contacts: 0, collisions: 0 })),
      nodes: vi.fn(() => []),
      dispose
    };
    const successfulGames = { createMiniGolfState: () => successfulState } as unknown as SceneKitGames;
    expect(() => buildSceneKitWithGames(successfulGames, "miniGolf", {})).toThrow(cleanupError);
    expect(dispose).toHaveBeenCalledOnce();
  }, 30_000);
});
