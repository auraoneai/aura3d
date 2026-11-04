import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const physicsSource = join(root, "packages/physics/src");
const solverlessSource = join(physicsSource, "solverless.ts");
const accessSource = join(root, "packages/engine/src/agent-api/physics/PhysicsWorldAccess.ts");
const providerSource = join(root, "packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts");
const forbidden = new Set(["@aura3d/physics-rapier", "@dimforge/rapier3d-compat"]);

function diagnosticsText(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n"
  });
}

/**
 * Emit from the current sources. This is a source test, not a packed-install
 * check: a packed consumer must still verify the shipped declaration graph.
 */
function emitSourceDeclarations(directory: string): void {
  const output = join(directory, "emitted");
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    skipLibCheck: true,
    types: [],
    declaration: true,
    emitDeclarationOnly: true,
    noEmitOnError: false,
    rootDir: root,
    outDir: output,
    baseUrl: root,
    paths: {
      "@aura3d/physics": ["packages/physics/src/index.ts"],
      "@aura3d/physics/solverless": ["packages/physics/src/solverless.ts"],
      "@aura3d/physics/world": ["packages/physics/src/world.ts"]
    }
  };
  const host = ts.createCompilerHost(options);
  const program = ts.createProgram([
    join(physicsSource, "index.ts"), solverlessSource, accessSource, providerSource
  ], options, host);
  const result = program.emit();
  expect(result.emitSkipped, diagnosticsText(result.diagnostics)).toBe(false);
  expect(diagnosticsText(result.diagnostics)).toBe("");

  const stagedPhysics = join(directory, "node_modules/@aura3d/physics");
  mkdirSync(stagedPhysics, { recursive: true });
  cpSync(join(root, "packages/physics/package.json"), join(stagedPhysics, "package.json"));
  cpSync(join(output, "packages/physics/src"), join(stagedPhysics, "dist"), { recursive: true });
  cpSync(join(output, "packages/engine/src/agent-api/physics"), join(directory, "engine-physics"), { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
}

/** Fail as soon as TypeScript attempts to resolve either optional backend. */
function checkConsumer(directory: string, source: string): { diagnostics: string; resolved: string[] } {
  const file = join(directory, "consumer.ts");
  writeFileSync(file, source);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    skipLibCheck: false,
    types: [],
    noEmit: true
  };
  const host = ts.createCompilerHost(options);
  const resolved: string[] = [];
  host.resolveModuleNameLiterals = (names, containingFile, redirectedReference, compilerOptions, containingSourceFile) => names.map((name) => {
    resolved.push(name.text);
    if (forbidden.has(name.text)) throw new Error(`Forbidden optional backend resolution: ${name.text}`);
    const mode = ts.getModeForUsageLocation(containingSourceFile, name, compilerOptions);
    return ts.resolveModuleName(name.text, containingFile, compilerOptions, host, undefined, redirectedReference, mode);
  });
  const program = ts.createProgram([file], options, host);
  return { diagnostics: diagnosticsText(ts.getPreEmitDiagnostics(program)), resolved };
}

function parseSource(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function namedImport(source: ts.SourceFile, names: readonly string[]): ts.ImportDeclaration {
  const match = source.statements.find((statement): statement is ts.ImportDeclaration => {
    if (!ts.isImportDeclaration(statement)) return false;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return names.every((name) => bindings.elements.some((element) => element.name.text === name));
  });
  if (!match) throw new Error(`Missing import of ${names.join(", ")} in ${source.fileName}`);
  return match;
}

function namedStatement(source: ts.SourceFile, name: string): ts.Statement {
  const statement = source.statements.find((candidate) =>
    (ts.isInterfaceDeclaration(candidate) || ts.isTypeAliasDeclaration(candidate) || ts.isFunctionDeclaration(candidate)) && candidate.name?.text === name
  );
  if (!statement) throw new Error(`Missing declaration ${name} in ${source.fileName}`);
  return statement;
}

function emitDeclarationFragment(source: string): string {
  const result = ts.transpileDeclaration(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true
  });
  expect(diagnosticsText(result.diagnostics ?? [])).toBe("");
  return result.outputText;
}

function writeFixture(directory: string, path: string, content: string): void {
  const file = join(directory, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

describe("physics declaration isolation", () => {
  it("keeps the original nominal types in an adapter-absent solverless consumer", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-physics-declarations-"));
    try {
      emitSourceDeclarations(directory);
      const result = checkConsumer(directory, `
        import type {
          Collider, ColliderDescriptor, CollisionEvent, Constraint, ConstraintDescriptor, Contact,
          DebugLine, PhysicsBackendSelection, PhysicsCharacterController,
          PhysicsCharacterControllerDescriptor, PhysicsCharacterMovement,
          PhysicsContinuousCollisionDescriptor, PhysicsShape, PhysicsSnapshot,
          PhysicsVehicleAxis, PhysicsVehicleController, PhysicsWheelCommand, PhysicsWheelSpec,
          PhysicsWheelState, PhysicsWheelTuning, PhysicsWorld, PhysicsWorldDescriptor,
          RaycastHit, RaycastOptions, RigidBody, RigidBodyDescriptor, RigidBodyType,
          ScenePhysicsNode, SphereCastHit
        } from "@aura3d/physics/solverless";
        import type { RigidBody as OriginalBody } from "./node_modules/@aura3d/physics/dist/RigidBody.js";
        import type { Constraint as OriginalConstraint } from "./node_modules/@aura3d/physics/dist/Constraint.js";
        import type { PhysicsWorld as OriginalWorld } from "./node_modules/@aura3d/physics/dist/PhysicsWorld.js";
        import type { PhysicsWorldConstructor } from "./engine-physics/PhysicsWorldAccess.js";

        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
          ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false)
          : false;
        type Assert<T extends true> = T;
        type AssertFalse<T extends false> = T;
        type BodyIdentity = Assert<Equal<RigidBody, OriginalBody>>;
        type ConstraintIdentity = Assert<Equal<Constraint, OriginalConstraint>>;
        type WorldIdentity = Assert<Equal<PhysicsWorld, OriginalWorld>>;
        type ConstructorIdentity = Assert<Equal<PhysicsWorldConstructor, typeof OriginalWorld>>;
        type RejectForgedBody = AssertFalse<Pick<RigidBody, keyof RigidBody> extends RigidBody ? true : false>;
        type RejectForgedConstraint = AssertFalse<Pick<Constraint, keyof Constraint> extends Constraint ? true : false>;
        const ccd: PhysicsContinuousCollisionDescriptor = { mode: "adaptive-substeps", maxSubSteps: 3 };
        // @ts-expect-error The collision mode remains a closed literal contract.
        const invalidCcd: PhysicsContinuousCollisionDescriptor = { mode: "other" };
        type RequiredContract = [Collider, ColliderDescriptor, CollisionEvent, ConstraintDescriptor, Contact,
          DebugLine, PhysicsBackendSelection, PhysicsCharacterController, PhysicsCharacterControllerDescriptor,
          PhysicsCharacterMovement, PhysicsShape, PhysicsSnapshot, PhysicsVehicleAxis, PhysicsVehicleController,
          PhysicsWheelCommand, PhysicsWheelSpec, PhysicsWheelState, PhysicsWheelTuning, PhysicsWorldDescriptor,
          RaycastHit, RaycastOptions, RigidBodyDescriptor, RigidBodyType, ScenePhysicsNode, SphereCastHit];
        export type Checks = [BodyIdentity, ConstraintIdentity, WorldIdentity, ConstructorIdentity,
          RejectForgedBody, RejectForgedConstraint, RequiredContract, typeof ccd, typeof invalidCcd];
      `);
      expect(result.diagnostics).toBe("");
      expect(result.resolved).toContain("@aura3d/physics/solverless");
      expect(result.resolved).not.toContain("@aura3d/physics/world");
      expect(result.resolved.filter((name) => forbidden.has(name))).toEqual([]);

      // A root-barrel consumer must trip the same guard through ensure.d.ts.
      expect(() => checkConsumer(directory, 'import type { PhysicsWorld } from "@aura3d/physics"; export type T = PhysicsWorld;'))
        .toThrow("Forbidden optional backend resolution: @aura3d/physics-rapier");
      // Test the second guard even if the adapter itself is missing.
      expect(() => checkConsumer(directory, 'import type * as Rapier from "@dimforge/rapier3d-compat"; export type T = typeof Rapier;'))
        .toThrow("Forbidden optional backend resolution: @dimforge/rapier3d-compat");
      // The engine loader contract reaches the solver only through `@aura3d/physics/world`, whose `ensurePhysics` is typed
      // structurally (ensureOpaque.ts), so the engine's declarations stay solver-free for strict consumers without the optional peer.
      const loader = checkConsumer(directory, 'import type { PhysicsWorldModule } from "./engine-physics/PhysicsWorldProvider.js"; export type T = PhysicsWorldModule;');
      expect(loader.diagnostics).toBe("");
      expect(loader.resolved.filter((name) => forbidden.has(name))).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("emits no runtime dependency for the type-only exports", () => {
    const options: ts.TranspileOptions = { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } };
    const contract = readFileSync(join(physicsSource, "types.ts"), "utf8");
    const solverless = readFileSync(solverlessSource, "utf8");
    const contractJs = ts.transpileModule(contract, options).outputText;
    const typeExport = 'export type * from "./types.js";';
    expect(solverless).toContain(typeExport);
    const currentJs = ts.transpileModule(solverless, options).outputText;
    const withoutTypeExportJs = ts.transpileModule(solverless.replace(typeExport, ""), options).outputText;
    expect(currentJs).toBe(withoutTypeExportJs);
    const parsed = ts.createSourceFile("contract.js", contractJs, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    expect(parsed.statements.filter((node) => ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier))).toEqual([]);
  });

  it("preserves camera, actor and game-kit declarations through neutral type leaves", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-v5-type-edges-"));
    try {
      const camera = parseSource(join(root, "packages/engine/src/agent-api/camera/gameDirector.ts"));
      const actor = parseSource(join(root, "packages/engine/src/agent-api/app/actorAnimationHandle.ts"));
      const racket = parseSource(join(root, "packages/engine/src/agent-api/game-kits/racketSports.ts"));
      const racketGeometry = parseSource(join(root, "packages/engine/src/agent-api/game-kits/racketGeometry.ts"));
      const athlete = parseSource(join(root, "packages/engine/src/agent-api/game-kits/racketAthleteRig.ts"));
      const fighting = parseSource(join(root, "packages/engine/src/agent-api/game-kits/fighting.ts"));
      const nodeTypes = parseSource(join(root, "packages/engine/src/agent-api/nodes/types.ts"));
      const runtimeTypes = parseSource(join(root, "packages/engine/src/agent-api/nodes/types/runtime.ts"));
      const cameraImport = namedImport(camera, ["AuraVec3"]);
      const actorImport = namedImport(actor, ["AuraApp", "AuraRuntimeNodeHandle"]);
      const racketImport = namedImport(racket, ["AuraRuntimeNodeHandle"]);
      const racketGeometryImport = namedImport(racketGeometry, ["AuraRuntimeNodeHandle"]);
      const athleteImport = namedImport(athlete, ["AuraRuntimeNodeHandle"]);
      const fightingImport = namedImport(fighting, ["AuraRuntimeNodeSpec", "AuraSceneNode"]);
      expect(cameraImport.importClause?.isTypeOnly).toBe(true);
      expect(actorImport.importClause?.isTypeOnly).toBe(true);
      expect(racketImport.importClause?.isTypeOnly).toBe(true);
      expect(racketGeometryImport.importClause?.isTypeOnly).toBe(true);
      expect(athleteImport.importClause?.isTypeOnly).toBe(true);
      expect(fightingImport.importClause?.isTypeOnly).toBe(true);

      // Emit the actual public declaration fragments and their original imports.
      // Distinct fixture-only brands below detect a wrong owner for either app
      // parameter; they are not substitutes for the production declarations.
      const cameraDeclaration = emitDeclarationFragment([
        cameraImport.getText(camera), namedStatement(camera, "QrGameCameraTarget").getText(camera)
      ].join("\n"));
      const actorResultModule = namedImport(actor, ["AuraActorAnimationApi"]).moduleSpecifier.getText(actor);
      const actorDeclaration = emitDeclarationFragment([
        actorImport.getText(actor), `import type { AuraActorAnimationApi } from ${actorResultModule};`,
        namedStatement(actor, "createPrd06ActorAnimationApi").getText(actor)
      ].join("\n"));
      const racketInterface = namedStatement(racket, "RacketSportsGameKit");
      if (!ts.isInterfaceDeclaration(racketInterface)) throw new Error("Expected a racket kit interface.");
      const racketMethod = racketInterface.members.find((member): member is ts.MethodSignature =>
        ts.isMethodSignature(member) && ts.isIdentifier(member.name) && member.name.text === "orientCylinderBetween"
      );
      if (!racketMethod) throw new Error("Expected the racket handle method.");
      const racketDeclaration = emitDeclarationFragment([
        racketImport.getText(racket), namedStatement(racketGeometry, "RacketVec3").getText(racketGeometry),
        `export interface RacketSportsGameKit { ${racketMethod.getText(racket)} }`
      ].join("\n"));
      const geometryFunction = namedStatement(racketGeometry, "orientCylinderBetween");
      if (!ts.isFunctionDeclaration(geometryFunction) || !geometryFunction.parameters[0]) throw new Error("Expected the geometry handle parameter.");
      const geometryDeclaration = emitDeclarationFragment([
        racketGeometryImport.getText(racketGeometry),
        `export declare function orientCylinderBetween(${geometryFunction.parameters[0].getText(racketGeometry)}): void;`
      ].join("\n"));
      const athleteDeclaration = emitDeclarationFragment([
        athleteImport.getText(athlete), namedStatement(athlete, "AthleteLimbHandles").getText(athlete)
      ].join("\n"));
      const fightingInterface = namedStatement(fighting, "FightingStageBuild");
      if (!ts.isInterfaceDeclaration(fightingInterface)) throw new Error("Expected a fighting stage interface.");
      const fightingNodes = fightingInterface.members.find((member): member is ts.PropertySignature =>
        ts.isPropertySignature(member) && !!member.name && ts.isIdentifier(member.name) && member.name.text === "nodes"
      );
      const fighterFunction = namedStatement(fighting, "fighterRuntimeNode");
      if (!fightingNodes || !ts.isFunctionDeclaration(fighterFunction) || !fighterFunction.type) throw new Error("Expected fighting node declarations.");
      const fightingDeclaration = emitDeclarationFragment([
        fightingImport.getText(fighting), `export interface FightingStageBuild { ${fightingNodes.getText(fighting)} }`,
        `export declare function fighterRuntimeNode(): ${fighterFunction.type.getText(fighting)};`
      ].join("\n"));
      expect(cameraDeclaration).toContain('from "../nodes/types.js"');
      expect(actorDeclaration).toContain('from "../nodes/types/runtime.js"');
      expect(racketDeclaration).toContain('from "../nodes/types/runtime.js"');
      expect(geometryDeclaration).toContain('from "../nodes/types/runtime.js"');
      expect(athleteDeclaration).toContain('from "../nodes/types/runtime.js"');
      expect(fightingDeclaration).toContain('from "../nodes/types.js"');
      writeFixture(directory, "agent-api/camera/gameDirector.d.ts", cameraDeclaration);
      writeFixture(directory, "agent-api/app/actorAnimationHandle.d.ts", actorDeclaration);
      writeFixture(directory, "agent-api/game-kits/racketSports.d.ts", racketDeclaration);
      writeFixture(directory, "agent-api/game-kits/racketGeometry.d.ts", geometryDeclaration);
      writeFixture(directory, "agent-api/game-kits/racketAthleteRig.d.ts", athleteDeclaration);
      writeFixture(directory, "agent-api/game-kits/fighting.d.ts", fightingDeclaration);
      writeFixture(directory, "agent-api/nodes/types.d.ts", `${namedStatement(nodeTypes, "AuraVec3").getText(nodeTypes)}
        declare const sceneNodeOwner: unique symbol;
        declare const runtimeSpecOwner: unique symbol;
        export interface AuraSceneNode { readonly [sceneNodeOwner]: true }
        export interface AuraRuntimeNodeSpec { readonly [runtimeSpecOwner]: true }
      `);
      writeFixture(directory, "agent-api/nodes/types/runtime.d.ts", `
        declare const appOwner: unique symbol;
        declare const handleOwner: unique symbol;
        export interface AuraApp { readonly [appOwner]: true }
        export interface AuraRuntimeNodeHandle { readonly [handleOwner]: true }
      `);
      writeFixture(directory, "contracts/animation.d.ts", `
        declare const animationOwner: unique symbol;
        export interface AuraActorAnimationApi { readonly [animationOwner]: true }
      `);
      writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));

      const result = checkConsumer(directory, `
        import type { QrGameCameraTarget } from "./agent-api/camera/gameDirector.js";
        import type { createPrd06ActorAnimationApi } from "./agent-api/app/actorAnimationHandle.js";
        import type { RacketSportsGameKit } from "./agent-api/game-kits/racketSports.js";
        import type { orientCylinderBetween } from "./agent-api/game-kits/racketGeometry.js";
        import type { AthleteLimbHandles } from "./agent-api/game-kits/racketAthleteRig.js";
        import type { FightingStageBuild, fighterRuntimeNode } from "./agent-api/game-kits/fighting.js";
        import type { AuraVec3, AuraSceneNode, AuraRuntimeNodeSpec } from "./agent-api/nodes/types.js";
        import type { AuraApp, AuraRuntimeNodeHandle } from "./agent-api/nodes/types/runtime.js";
        import type { AuraActorAnimationApi } from "./contracts/animation.js";
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
          ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false) : false;
        type Assert<T extends true> = T;
        type Position = Assert<Equal<QrGameCameraTarget["position"], AuraVec3>>;
        type Handle = Assert<Equal<Parameters<typeof createPrd06ActorAnimationApi>[0], AuraRuntimeNodeHandle>>;
        type RacketHandle = Assert<Equal<Parameters<RacketSportsGameKit["orientCylinderBetween"]>[0], AuraRuntimeNodeHandle | undefined>>;
        type GeometryHandle = Assert<Equal<Parameters<typeof orientCylinderBetween>[0], AuraRuntimeNodeHandle | undefined>>;
        type AthleteHandle = Assert<Equal<AthleteLimbHandles["leftHand"], AuraRuntimeNodeHandle>>;
        type FightingNodes = Assert<Equal<FightingStageBuild["nodes"], readonly AuraSceneNode[]>>;
        type FighterSpec = Assert<Equal<ReturnType<typeof fighterRuntimeNode>, AuraRuntimeNodeSpec>>;
        type App = Assert<Equal<Parameters<typeof createPrd06ActorAnimationApi>[1], AuraApp | undefined>>;
        type Return = Assert<Equal<ReturnType<typeof createPrd06ActorAnimationApi>, AuraActorAnimationApi>>;
        const valid: QrGameCameraTarget = { position: [1, 2, 3] };
        // @ts-expect-error The target remains a 3D tuple.
        const invalid: QrGameCameraTarget = { position: [1, 2] };
        declare const factory: typeof createPrd06ActorAnimationApi;
        declare const app: AuraApp;
        declare const handle: AuraRuntimeNodeHandle;
        factory(handle, app);
        factory(handle);
        // @ts-expect-error An app cannot stand in for a runtime node handle.
        factory(app);
        export type Checks = [Position, Handle, RacketHandle, GeometryHandle, AthleteHandle, FightingNodes, FighterSpec,
          App, Return, typeof valid, typeof invalid];
      `);
      expect(result.diagnostics).toBe("");
      expect(result.resolved.filter((name) => forbidden.has(name))).toEqual([]);

      // Unused imports in these type modules used to lead source graph walkers
      // to the legacy physics/game entries, even though declarations need none.
      for (const [source, forbiddenEdges] of [
        [nodeTypes, ["../PhysicsRuntime.js", "../GameAppRuntime", "./physics.js", "./game/index.js"]],
        [runtimeTypes, ["../physics.js"]]
      ] as const) {
        const imports = source.statements.filter(ts.isImportDeclaration)
          .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
        for (const edge of forbiddenEdges) expect(imports).not.toContain(edge);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
