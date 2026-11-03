import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { ColliderHelperOptions } from "../../../packages/debug/src/AdvancedHelpers.js";
import type { PhysicsDebugAdapter, PhysicsDebugSnapshot } from "../../../packages/debug/src/PhysicsDebugAdapter.js";
import type { AuraAppHandle } from "../../../packages/engine/src/agent-api/AuraAppHandle.js";
import type { GameAppRuntime, GameAppRuntimeOptions } from "../../../packages/engine/src/agent-api/GameAppRuntime.js";
import type { GameInputController, GameInputOptions } from "../../../packages/engine/src/agent-api/GameRuntimeCore.js";
import type { DebugLine } from "../../../packages/physics/src/PhysicsDebugDraw.js";
import type { PhysicsWorld } from "../../../packages/physics/src/PhysicsWorld.js";
import type { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import type { PhysicsShape } from "../../../packages/physics/src/Shape.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false)
  : false;
type Assert<T extends true> = T;
type AdapterWorld = Parameters<PhysicsDebugAdapter["buildLines"]>[0];
type AdapterBody = NonNullable<ReturnType<AdapterWorld["getBody"]>>;

/** Checked by TypeScript, including the private-member identity of RigidBody. */
export type IsolatedDeclarationIdentity = [
  Assert<Equal<ColliderHelperOptions["shape"], PhysicsShape>>,
  Assert<Equal<AdapterWorld, Pick<PhysicsWorld, "colliders" | "getBody">>>,
  Assert<Equal<Parameters<PhysicsDebugAdapter["snapshot"]>[0], Pick<PhysicsWorld, "colliders" | "bodies" | "getBody" | "snapshot">>>,
  Assert<Equal<Parameters<PhysicsDebugAdapter["stackEvidence"]>[0], Pick<PhysicsWorld, "colliders" | "bodies" | "getBody" | "snapshot">>>,
  Assert<Equal<AdapterBody, RigidBody>>,
  Assert<Equal<Pick<RigidBody, keyof RigidBody> extends AdapterBody ? true : false, false>>,
  Assert<Equal<ReturnType<PhysicsDebugAdapter["buildLines"]>, readonly DebugLine[]>>,
  Assert<Equal<PhysicsDebugSnapshot["lines"], readonly DebugLine[]>>,
  Assert<Equal<NonNullable<GameAppRuntimeOptions["input"]>, GameInputOptions | readonly GameInputOptions[]>>,
  Assert<Equal<Parameters<GameAppRuntime["inputController"]>[0], GameInputOptions>>,
  Assert<Equal<ReturnType<GameAppRuntime["inputController"]>, GameInputController>>,
  Assert<Equal<NonNullable<GameAppRuntime["input"]>, GameInputController>>,
  Assert<Equal<Parameters<AuraAppHandle["input"]>[0], GameInputOptions>>,
  Assert<Equal<ReturnType<AuraAppHandle["input"]>, GameInputController>>
];

const files = [
  "packages/debug/src/AdvancedHelpers.ts",
  "packages/debug/src/PhysicsDebugAdapter.ts",
  "packages/engine/src/agent-api/GameAppRuntime.ts",
  "packages/engine/src/agent-api/AuraAppHandle.ts"
] as const;

function imports(file: string, text: string): { specifier: string; typeOnly: boolean }[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      ? [{ specifier: statement.moduleSpecifier.text, typeOnly: statement.importClause?.isTypeOnly === true }]
      : []);
}

function legacySpecifier(specifier: string): boolean {
  return /^@aura3d\/physics(?:\/world)?$/u.test(specifier) || /(?:^|\/)GameRuntime(?:\.js)?$/u.test(specifier);
}

describe("debug and game declaration isolation", () => {
  it("emits declarations without the legacy physics or game runtime entries", () => {
    for (const file of files) {
      const text = readFileSync(resolve(file), "utf8");
      const sourceImports = imports(file, text);
      expect(sourceImports.filter(({ specifier }) => legacySpecifier(specifier)), file).toEqual([]);
      const result = ts.transpileDeclaration(text, {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: { declaration: true, isolatedDeclarations: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true }
      });
      expect(result.diagnostics ?? [], file).toEqual([]);
      const declarationImports = imports(`${file}.d.ts`, result.outputText);
      expect(declarationImports.filter(({ specifier }) => legacySpecifier(specifier)), file).toEqual([]);
      expect(declarationImports.map(({ specifier }) => specifier), file).toContain(
        file.startsWith("packages/debug/") ? "@aura3d/physics/solverless" : "./GameRuntimeCore.js"
      );
    }
    const handleImports = imports(files[3], readFileSync(resolve(files[3]), "utf8"));
    expect(handleImports).toContainEqual({ specifier: "./nodes/scene.js", typeOnly: false });

    // The legacy entry re-exports, rather than redefines, these input types.
    const legacyPath = resolve("packages/engine/src/agent-api/GameRuntime.ts");
    const legacy = ts.createSourceFile(legacyPath, readFileSync(legacyPath, "utf8"), ts.ScriptTarget.Latest, true);
    expect(legacy.statements.some((statement) => ts.isExportDeclaration(statement) &&
      !statement.exportClause && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "./GameRuntimeCore.js")).toBe(true);
  });

  it("uses the same debug draw class and runs helper and game behavior without the legacy barrels", async () => {
    const legacyPhysicsLoaded = vi.fn(() => { throw new Error("unexpected legacy physics root"); });
    const legacyWorldLoaded = vi.fn(() => { throw new Error("unexpected legacy physics world"); });
    vi.resetModules();
    vi.doMock("@aura3d/physics", legacyPhysicsLoaded);
    vi.doMock("@aura3d/physics/world", legacyWorldLoaded);
    try {
      const solverless = await import("@aura3d/physics/solverless");
      const leaf = await import("../../../packages/physics/src/PhysicsDebugDraw.js");
      const { PhysicsDebugAdapter } = await import("../../../packages/debug/src/PhysicsDebugAdapter.js");
      const { buildColliderHelper } = await import("../../../packages/debug/src/AdvancedHelpers.js");
      const { createGameAppRuntime } = await import("../../../packages/engine/src/agent-api/GameAppRuntime.js");
      expect(solverless.PhysicsDebugDraw).toBe(leaf.PhysicsDebugDraw);

      const body = new solverless.RigidBody(1, { type: "dynamic", position: [1, 2, 3] });
      const collider = new solverless.Collider(1, 1, { shape: { kind: "box", halfExtents: [1, 1, 1] } });
      const world = {
        colliders: () => [collider],
        bodies: () => [body],
        getBody: (id: number) => id === body.id ? body : undefined,
        snapshot: () => ({ bodies: [body.snapshot()], contacts: [], stats: { bodies: 1 } })
      } as unknown as Pick<PhysicsWorld, "colliders" | "bodies" | "getBody" | "snapshot">;
      const draw = vi.spyOn(leaf.PhysicsDebugDraw.prototype, "buildLines");
      const adapter = new PhysicsDebugAdapter();
      expect(adapter.snapshot(world)).toMatchObject({ bodyCount: 1, colliderCount: 1, contactCount: 0, lines: expect.arrayContaining([expect.objectContaining({ category: "collider" })]) });
      expect(adapter.buildLines(world)).toHaveLength(12);
      expect(draw).toHaveBeenCalledWith(world);
      expect(adapter.stackEvidence(world)).toMatchObject({ bodyCount: 1, dynamicBodyCount: 1, lineCount: 12, minY: 2, maxY: 2, settledCount: 1 });
      expect(buildColliderHelper({ shape: collider.shape })).toHaveLength(12);

      const input = { update: vi.fn(), dispose: vi.fn() } as unknown as GameInputController;
      const app = {
        runtime: { frame: 0, time: 0, paused: false },
        onFrame: vi.fn(() => () => {}),
        input: vi.fn(() => input),
        advance: vi.fn(),
        evidence: vi.fn(() => ({})),
        dispose: vi.fn()
      } as unknown as AuraAppHandle;
      const runtime = createGameAppRuntime(app, { autoStart: false, input: { actions: { jump: ["Space"] }, autoListen: false } });
      expect(runtime.input).toBe(input);
      expect(runtime.evidence).toMatchObject({ status: "idle", inputControllers: 1, activeInputControllers: 1 });
      expect(runtime.dispose()).toMatchObject({ status: "disposed", activeInputControllers: 0 });
      expect(input.dispose).toHaveBeenCalledOnce();
      expect(legacyPhysicsLoaded).not.toHaveBeenCalled();
      expect(legacyWorldLoaded).not.toHaveBeenCalled();

      // Confirm the stubs cover the actual forbidden imports.
      await expect(import("@aura3d/physics")).rejects.toThrow();
      await expect(import("@aura3d/physics/world")).rejects.toThrow();
      expect(legacyPhysicsLoaded).toHaveBeenCalledOnce();
      expect(legacyWorldLoaded).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock("@aura3d/physics");
      vi.doUnmock("@aura3d/physics/world");
      vi.resetModules();
    }
  }, 30_000);
});
