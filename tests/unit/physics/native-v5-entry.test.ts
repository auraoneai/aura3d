import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { PhysicsWorld as PhysicsWorldType } from "../../../packages/physics/src/PhysicsWorld.js";

// These were missing from the isolated entry. Identity against the legacy
// facade protects existing class checks and function behavior on each leaf.
const restoredLegacyValues = [
  "A3DAppLifecycle", "A3DRenderer", "AnimationClip", "AnimationLayer", "AnimationMixer", "AnimationTrack",
  "GLTFLoader", "Renderer", "SPATIAL_DOM_LABEL_CAPABILITY", "captureAuraAppScreenshot", "captureScreenshot",
  "compositeMetallicRoughnessPixels", "createA3DApp", "createAssetCompatibilityReport", "createAssetDiagnostics",
  "createAssetViewerWorkflow", "createDiagnosticsPanel", "createEnvironment", "createExternalParityEnvironmentPipeline",
  "createGameAppRuntime", "createInteractiveSceneWorkflow", "createProductConfiguratorWorkflow",
  "createProductionPrimitiveTextureIntent", "crowds", "describeProductionSpotShadow", "gameAssetValidation",
  "gaussianSplat", "gaussianSplatBackendDiagnostic", "inspectAsset", "inspectGLTFAsset",
  "listExternalParityEnvironmentTargets", "loadAsset", "loadFont", "loadRenderableAsset", "meshVehicleSurface",
  "mipChainBytesCoarseToFine", "normalizeSceneSnapshot", "normalizeTextureBudgetBytes",
  "quaterniusGameReadyFighterValidationContract", "resolveProductionRuntimeShadowTuning",
  "resolveProductionShadowCasterIndex", "summarizeExternalParityGLTFCorpus", "unsafeModelUrl",
  "upgradeProductionPrimitiveTextures", "validateQuaterniusGameReadyFighterAsset", "workflows"
] as const;

/** Deprecated 4.x root values removed from `@aura3d/engine` in 5.0.0 (docs/migration/4-to-5.md B14). */
const removedFromLegacyRoot = new Set<string>([
  "A3DAppLifecycle", "A3DRenderer", "AnimationClip", "AnimationLayer", "AnimationMixer", "AnimationTrack",
  "GLTFLoader", "Renderer", "captureAuraAppScreenshot", "captureScreenshot", "compositeMetallicRoughnessPixels",
  "createA3DApp", "createAssetCompatibilityReport", "createAssetViewerWorkflow", "createExternalParityEnvironmentPipeline",
  "createGameAppRuntime", "createInteractiveSceneWorkflow", "createProductConfiguratorWorkflow",
  "createProductionPrimitiveTextureIntent", "crowds", "describeProductionSpotShadow", "gameAssetValidation",
  "inspectAsset", "inspectGLTFAsset", "listExternalParityEnvironmentTargets", "loadAsset", "loadRenderableAsset",
  "meshVehicleSurface", "mipChainBytesCoarseToFine", "normalizeSceneSnapshot", "normalizeTextureBudgetBytes",
  "quaterniusGameReadyFighterValidationContract", "resolveProductionRuntimeShadowTuning",
  "resolveProductionShadowCasterIndex", "summarizeExternalParityGLTFCorpus", "unsafeModelUrl",
  "upgradeProductionPrimitiveTextures", "validateQuaterniusGameReadyFighterAsset"
]);

function legacyRootValueNames(): string[] {
  const path = "packages/engine/src/public/index.ts";
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        throw new Error("Update the v5 scope inventory to resolve the legacy root's wildcard export.");
      }
      for (const item of statement.exportClause.elements) if (!item.isTypeOnly) names.add(item.name.text);
    }
    if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) names.add(statement.name.text);
      if (ts.isVariableStatement(statement)) {
        for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) names.add(item.name.text);
      }
    }
  }
  return [...names].sort();
}

function explicitSourceTypeOmissions(): string[] {
  const named = (path: string): { types: Set<string>; values: Set<string> } => {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const types = new Set<string>();
    const values = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
      for (const item of statement.exportClause.elements) {
        (statement.isTypeOnly || item.isTypeOnly ? types : values).add(item.name.text);
      }
    }
    return { types, values };
  };
  const legacy = named("packages/engine/src/public/index.ts");
  const isolated = named("packages/engine/src/agent-api/isolated-index.ts");
  const entry = named("packages/engine/src/public/v5.ts");
  return [...legacy.types].filter((name) => !isolated.types.has(name) && !isolated.values.has(name) &&
    !entry.types.has(name) && !entry.values.has(name)).sort();
}

describe("versioned isolated physics entry", () => {
  it("keeps contract type dependencies off the legacy agent barrel", () => {
    const files = [
      "animation", "app", "atmosphere", "camera", "compiler", "diagnostics", "effects", "environment", "game",
      "lighting", "looks", "materials", "post", "runtimeNodes", "sceneGraph", "time", "world"
    ];
    for (const file of files) {
      const path = `packages/engine/src/contracts/${file}.ts`;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const legacyImports = source.statements.filter((statement) =>
        ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
        /^\.\.\/agent-api\/index(?:\.js)?$/u.test(statement.moduleSpecifier.text)
      );
      expect(legacyImports, path).toEqual([]);
    }
  });

  it("shares one entry provider across physics, game and mini-golf while legacy remains independent", async () => {
    const evaluated = vi.fn();
    const backendEvaluated = vi.fn();
    const live = new Set<PhysicsWorldType>();
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", async (importOriginal) => {
      backendEvaluated();
      return importOriginal();
    });
    vi.doMock("@aura3d/physics/world", async (importOriginal) => {
      evaluated();
      const actual = await importOriginal<typeof import("@aura3d/physics/world")>();
      class TrackedWorld extends actual.PhysicsWorld {
        constructor(...args: ConstructorParameters<typeof actual.PhysicsWorld>) {
          super(...args);
          live.add(this);
        }
        override dispose(): void { live.delete(this); super.dispose(); }
      }
      return { ...actual, PhysicsWorld: TrackedWorld };
    });
    try {
      // Import the game first to exercise the cross-entry context in this order.
      const gameEntry = await import("../../../packages/game/src/v5.js");
      const v5 = await import("../../../packages/engine/src/public/v5.js");
      const v5Alias = await import("@aura3d/engine/v5");
      const gameAlias = await import("@aura3d/engine/v5/game");
      const context = await import("../../../packages/engine/src/public/v5-context.js");
      const contextAlias = await import("@aura3d/engine/v5/context");
      const provider = await import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js");
      const compiler = await import("../../../packages/engine/src/contracts/compiler.js");
      expect(contextAlias.v5PhysicsWorldAccess).toBe(context.v5PhysicsWorldAccess);
      expect(v5Alias.physics).toBe(v5.physics);
      expect(gameAlias.C24_GAME_SLOT).toBe(gameEntry.C24_GAME_SLOT);
      expect(v5.compileScene).toBe(compiler.compileScene);
      expect(evaluated).not.toHaveBeenCalled();
      expect(backendEvaluated).not.toHaveBeenCalled();
      expect(() => v5.physics.world()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => v5.game.collisionWorld()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => v5.games.createMiniGolfState()).toThrow(/await preloadPhysics\(\)/i);
      expect(v5.appExtensionsAll().some((extension) => extension.member === "lighting" && extension.owner === "prd02")).toBe(true);
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.status).toBe("staged");
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.omittedRootExports).toEqual(
        legacyRootValueNames().filter((name) => !(name in v5))
      );
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.omittedRootExports).toEqual([]);
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.omittedRootTypeExports).toEqual(explicitSourceTypeOmissions());
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.omittedRootTypeExports).toEqual([]);
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.compatibility).toMatch(/source; installed declarations.*unverified/i);
      expect(v5.V5_ISOLATED_ENTRY_SCOPE.migration).toMatchObject({
        physics: expect.stringContaining("await preloadPhysics()"),
        game: expect.stringContaining("@aura3d/engine/v5/game"),
        types: expect.stringContaining("verify")
      });
      expect(() => v5.sceneKits.miniGolf()).toThrow(/await preloadPhysics\(\)/i);
      expect(v5.scene().add(v5.looks.preset("product-studio")).add(v5.primitives.box()).toJSON().nodes.length).toBeGreaterThan(0);

      // Legacy's static import initializes the backend but does not grant the
      // isolated entry permission to construct until its own preload resolves.
      const { legacyPhysicsWorldAccess } = await import("../../../packages/engine/src/public/legacy-physics-access.js");
      const LegacyWorld = legacyPhysicsWorldAccess.requireReady();
      const legacyWorld = new LegacyWorld();
      legacyWorld.dispose();
      expect(evaluated).toHaveBeenCalledTimes(1);
      expect(() => v5.physics.world()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => provider.requirePhysicsWorld()).toThrow(/await preloadPhysics\(\)/i);

      await v5.preloadPhysics();
      expect(context.v5PhysicsWorldAccess.requireReady()).toBe(LegacyWorld);
      expect(() => provider.requirePhysicsWorld()).toThrow(/await preloadPhysics\(\)/i);
      const physics = v5.physics.world({ gravity: [0, 0, 0] });
      const collision = v5.game.collisionWorld({ gravity: [0, 0, 0] });
      const miniGolf = v5.games.createMiniGolfState();
      try {
        const body = physics.createBody({ shape: v5.physics.sphere(0.25) });
        collision.addSphere("ball", 0.25);
        miniGolf.shoot();
        expect(body.id).toBeDefined();
        expect(collision.snapshot().stats.bodies).toBe(1);
        expect(miniGolf.snapshot().shots).toBe(1);
        const beforeKit = live.size;
        const kit = v5.sceneKits.miniGolf();
        expect(kit.id).toBe("miniGolf");
        expect(kit.nodes.length).toBeGreaterThan(0);
        expect(live.size).toBe(beforeKit);
      } finally { physics.dispose(); miniGolf.dispose(); }

      const legacyGame = await import("../../../packages/game/src/index.js");
      expect(gameEntry.C24_GAME_SLOT).not.toBe(legacyGame.C24_GAME_SLOT);
      expect(gameEntry.createGame).toBeTypeOf("function");
    } finally {
      for (const world of live) world.dispose();
      vi.doUnmock("@aura3d/physics/world");
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  }, 30_000);

  it("preserves the restored legacy value bindings and directs v5 games to the matching subpath", async () => {
    vi.resetModules();
    try {
      const v5 = await import("../../../packages/engine/src/public/v5.js");
      const v5Game = await import("../../../packages/game/src/v5.js");
      const legacy = await import("../../../packages/engine/src/public/index.js");
      const legacyGame = await import("../../../packages/game/src/index.js");

      const legacyValues = legacy as unknown as Record<string, unknown>;
      for (const name of restoredLegacyValues) {
        if (removedFromLegacyRoot.has(name)) {
          // 5.0.0 removed these deprecated names from the legacy root (migration guide B14);
          // the staged v5 entry is unchanged.
          expect(legacyValues[name], name).toBeUndefined();
          expect(v5[name], name).toBeDefined();
        } else {
          expect(v5[name], name).toBe(legacyValues[name]);
        }
      }
      expect(v5.physics).not.toBe(legacy.physics);
      expect(v5.createGame).not.toBe(legacy.createGame);

      const options = { id: "migration", target: null as unknown as HTMLElement, scene: () => v5.scene() };
      const thrown = (callback: () => unknown): unknown => {
        try { callback(); } catch (error) { return error; }
        throw new Error("expected a migration error");
      };
      const isolatedError = thrown(() => v5.createGame(options));
      const disabledGameError = thrown(() => v5Game.createGame({ ...options, qualityRebuild: { flags: ["-game"] } }));
      for (const error of [isolatedError, disabledGameError]) {
        expect(error).toMatchObject({ name: "AuraGameMigrationError", code: "CREATE_GAME_ROOT_UNAVAILABLE", version: 1 });
        expect((error as Error).message).toContain("@aura3d/engine/v5/game");
      }

      const legacyError = thrown(() => legacy.createGame(options));
      const disabledLegacyError = thrown(() => legacyGame.createGame({ ...options, qualityRebuild: { flags: ["-game"] } }));
      for (const error of [legacyError, disabledLegacyError]) {
        expect(error).toMatchObject({ name: "AuraGameMigrationError", code: "CREATE_GAME_ROOT_UNAVAILABLE", version: 1 });
        expect((error as Error).message).toContain("@aura3d/engine/game");
        expect((error as Error).message).not.toContain("@aura3d/engine/v5/game");
      }
    } finally { vi.resetModules(); }
  }, 30_000);

  it("keeps v5 unready after the legacy root and game are imported first", async () => {
    vi.resetModules();
    try {
      const legacyGame = await import("../../../packages/game/src/index.js");
      const legacy = await import("../../../packages/engine/src/public/index.js");
      const oldWorld = legacy.physics.world({ gravity: [0, 0, 0] });
      try {
        const v5 = await import("../../../packages/engine/src/public/v5.js");
        const v5Game = await import("../../../packages/game/src/v5.js");
        expect(v5Game.C24_GAME_SLOT).not.toBe(legacyGame.C24_GAME_SLOT);
        expect(() => v5.physics.world()).toThrow(/await preloadPhysics\(\)/i);
        expect(() => v5.game.collisionWorld()).toThrow(/await preloadPhysics\(\)/i);
        await v5.preloadPhysics();
        const newWorld = v5.physics.world({ gravity: [0, 0, 0] });
        try {
          const oldBody = oldWorld.createBody({ shape: legacy.physics.sphere(0.25) });
          const newBody = newWorld.createBody({ shape: v5.physics.sphere(0.25) });
          expect(() => oldWorld.createCollider(newBody, { shape: legacy.physics.sphere() })).toThrow(/does not belong/i);
          expect(() => newWorld.createCollider(oldBody, { shape: v5.physics.sphere() })).toThrow(/does not belong/i);
        } finally { newWorld.dispose(); }
      } finally { oldWorld.dispose(); }
    } finally { vi.resetModules(); }
  }, 30_000);

  it("passes the same entry access to engine and game app factories", async () => {
    const stopped = new Error("factory inspected");
    const auraFactory = vi.fn((..._args: unknown[]) => { throw stopped; });
    const gameFactory = vi.fn((..._args: unknown[]) => { throw stopped; });
    vi.resetModules();
    vi.doMock("../../../packages/engine/src/agent-api/app/createAuraAppCore.js", () => ({
      createAuraAppWithPhysicsWorldAccess: auraFactory
    }));
    vi.doMock("../../../packages/engine/src/agent-api/app/createGameAppCore.js", () => ({
      createGameAppWithPhysicsWorldAccess: gameFactory
    }));
    try {
      // Import the engine first to exercise the other cross-entry import order.
      const v5 = await import("../../../packages/engine/src/public/v5.js");
      const gameEntry = await import("../../../packages/game/src/v5.js");
      const { v5PhysicsWorldAccess } = await import("../../../packages/engine/src/public/v5-context.js");
      const makeScene = () => v5.scene();
      expect(() => v5.createAuraApp(null, { scene: makeScene() })).toThrow(stopped);
      expect(auraFactory.mock.calls[0]?.[0]).toBe(v5PhysicsWorldAccess);
      expect(() => v5.createGameApp(null, { scene: makeScene() })).toThrow(stopped);
      expect(gameFactory.mock.calls[0]?.[0]).toBe(v5PhysicsWorldAccess);
      expect(() => gameEntry.createGameImpl({ id: "v5-test", target: null, scene: makeScene })).toThrow(stopped);
      expect(gameFactory.mock.calls.at(-1)?.[0]).toBe(v5PhysicsWorldAccess);
      expect(() => gameEntry.createGame({ id: "v5-slot-test", target: null, scene: makeScene })).toThrow(stopped);
      expect(gameFactory.mock.calls.at(-1)?.[0]).toBe(v5PhysicsWorldAccess);
    } finally {
      vi.doUnmock("../../../packages/engine/src/agent-api/app/createAuraAppCore.js");
      vi.doUnmock("../../../packages/engine/src/agent-api/app/createGameAppCore.js");
      vi.resetModules();
    }
  }, 30_000);
});
