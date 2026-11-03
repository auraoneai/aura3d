import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const providerPath = resolve("packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts");
const legacyPath = resolve("packages/engine/src/public/legacy-physics-access.ts");
const worldPath = resolve("packages/physics/src/world.ts");
const rapierPath = resolve("packages/physics-rapier/src/index.ts");
const initPath = resolve("packages/physics-rapier/src/rapierInit.ts");

const registry = JSON.parse(readFileSync(resolve("aura.exports.json"), "utf8")) as {
  paths: [string, string, ...unknown[]][];
};
const aliases = new Map(registry.paths
  .filter(([name, path]) => !name.includes("*") && !path.includes("*"))
  .map(([name, path]) => [name, resolve(path)]));

type Edges = { static: string[]; dynamic: string[]; eager: string[] };
const sourceEdgeCache = new Map<string, Edges>();

/** Match the project's verbatim-module semantics, including eager function calls. */
function sourceEdges(path: string, contents = readFileSync(path, "utf8")): Edges {
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);
  const edges: Edges = { static: [], dynamic: [], eager: [] };
  const functions = new Map<string, ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction>();
  const visitedFunctions = new Set<ts.Node>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      // `import { type T }` emits `import {}` under verbatimModuleSyntax.
      if (!statement.importClause?.isTypeOnly) edges.static.push(statement.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!statement.isTypeOnly) edges.static.push(statement.moduleSpecifier.text);
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) functions.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          functions.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }
  edges.eager.push(...edges.static);
  const collectDynamic = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      edges.dynamic.push(node.arguments[0].text);
    }
    ts.forEachChild(node, collectDynamic);
  };
  const collectEager = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      let expression: ts.Node = node;
      while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
      if (!ts.isCallExpression(expression.parent) || expression.parent.expression !== expression) return;
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      edges.eager.push(node.arguments[0].text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const target = functions.get(node.expression.text);
      if (target?.body && !visitedFunctions.has(target)) {
        visitedFunctions.add(target);
        collectEager(target.body);
      }
    }
    ts.forEachChild(node, collectEager);
  };
  collectDynamic(source);
  ts.forEachChild(source, collectEager);
  return edges;
}

function resolveSource(path: string, specifier: string): string | undefined {
  const mapped = aliases.get(specifier);
  if (!mapped && specifier.startsWith("@aura3d/")) {
    throw new Error(`Unmapped workspace import ${specifier} from ${relative(process.cwd(), path)}`);
  }
  const base = mapped ?? (specifier.startsWith(".") ? resolve(dirname(path), specifier) : undefined);
  if (!base) return undefined;
  const extension = extname(base);
  if (existsSync(base) && [".json", ".css", ".glsl", ".wgsl"].includes(extension)) return undefined;
  const withoutJs = /\.(?:c|m)?js$/u.test(base) ? base.slice(0, -extension.length) : base;
  const target = [base, `${withoutJs}.ts`, `${withoutJs}.tsx`, resolve(base, "index.ts")]
    .find((candidate) => existsSync(candidate) && /\.(?:[cm]?[jt]s|tsx)$/u.test(candidate));
  if (!target) throw new Error(`Cannot resolve runtime import ${specifier} from ${relative(process.cwd(), path)}`);
  return target;
}

/** Follow eager source imports, retaining deferred imports as boundary evidence. */
function eagerGraph(entry: string): Map<string, Edges> {
  const graph = new Map<string, Edges>();
  const visit = (path: string): void => {
    if (graph.has(path)) return;
    const edges = sourceEdgeCache.get(path) ?? sourceEdges(path);
    sourceEdgeCache.set(path, edges);
    graph.set(path, edges);
    for (const specifier of edges.eager) {
      const target = resolveSource(path, specifier);
      if (target) visit(target);
    }
  };
  visit(entry);
  return graph;
}

/** Give a useful shortest chain when a shared leaf accidentally re-enters legacy. */
function eagerPath(graph: Map<string, Edges>, entry: string, target: string): string[] | undefined {
  const queue = [{ path: entry, chain: [relative(process.cwd(), entry)] }];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const { path, chain } = queue[index]!;
    if (visited.has(path)) continue;
    visited.add(path);
    if (path === target) return chain;
    for (const specifier of graph.get(path)?.eager ?? []) {
      const next = resolveSource(path, specifier);
      if (next && graph.has(next) && !visited.has(next)) {
        queue.push({ path: next, chain: [...chain, relative(process.cwd(), next)] });
      }
    }
  }
  return undefined;
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

describe("staged legacy and isolated physics entry graphs", () => {
  it("recognizes erased types, eagerly evaluated imports and deferred imports", () => {
    const edges = sourceEdges("fixture.ts", `
      import type { T } from "type-only";
      import { type T } from "inline-type";
      export { type T } from "inline-export-type";
      async function called() { await import("called-at-load"); }
      async function deferred() { await import("later"); }
      void called();
      void (async () => { await import("iife"); })();
    `);
    expect(edges.eager).toEqual(["inline-type", "inline-export-type", "called-at-load", "iife"]);
    expect(edges.dynamic).toEqual(["called-at-load", "later", "iife"]);
  });

  it("keeps the isolated provider's eager graph separate from the world and optional backend", () => {
    const isolated = eagerGraph(providerPath);
    const isolatedEdges = [...isolated.values()];
    expect(isolated.has(worldPath)).toBe(false);
    expect(isolated.has(rapierPath)).toBe(false);
    expect(isolated.has(initPath)).toBe(false);
    expect(isolatedEdges.flatMap((edge) => [...edge.eager, ...edge.dynamic])
      .filter((specifier) => /^@aura3d\/physics-rapier(?:\/|$)/u.test(specifier) ||
        /^@dimforge\/rapier3d(?:[-/]|$)/u.test(specifier))).toEqual([]);
    expect(sourceEdges(providerPath).dynamic).toContain("@aura3d/physics/world");

    // The explicitly legacy bootstrap has the opposite graph: its world edge
    // is static, and the adapter's top-level initialization loads the backend.
    const legacy = eagerGraph(legacyPath);
    expect(sourceEdges(legacyPath).static).toContain("@aura3d/physics/world");
    expect(legacy.has(worldPath)).toBe(true);
    expect(legacy.has(rapierPath)).toBe(true);
    expect(legacy.has(initPath)).toBe(true);
    expect(legacy.get(initPath)?.dynamic).toContain("@dimforge/rapier3d-compat");
  });

  it.each([
    "packages/engine/src/agent-api/GameRuntimeCore.ts",
    "packages/engine/src/agent-api/nodes/physics-core.ts",
    "packages/engine/src/agent-api/nodes/game/core.ts",
    "packages/engine/src/agent-api/nodes/games-core.ts",
    "packages/engine/src/agent-api/sceneKitDiagnosticsCore.ts",
    "packages/engine/src/agent-api/nodes/sceneKitsCore.ts",
    "packages/engine/src/agent-api/app/createAuraAppCore.ts",
    "packages/engine/src/agent-api/app/createGameAppCore.ts",
    "packages/engine/src/public/v5-internal.ts",
    "packages/engine/src/public/v5-context.ts",
    "packages/engine/src/agent-api/isolated-index.ts",
    "packages/engine/src/public/v5.ts",
    "packages/game/src/gameCore.ts",
    "packages/game/src/shared.ts",
    "packages/game/src/v5.ts"
  ])("keeps the staged entry dependency free of the eager legacy backend: %s", (entry) => {
    const graph = eagerGraph(resolve(entry));
    const forbidden = [legacyPath, worldPath, rapierPath, initPath]
      .filter((path) => graph.has(path))
      .map((path) => relative(process.cwd(), path));
    const firstPath = forbidden.length > 0 ? eagerPath(graph, resolve(entry), resolve(forbidden[0]!)) : undefined;
    expect(forbidden, firstPath ? `Legacy backend reached: ${firstPath.join(" -> ")}` : "").toEqual([]);
    const optionalEdges = [...graph.values()].flatMap((edge) => edge.eager)
      .filter((specifier) => /^@aura3d\/physics-rapier(?:\/|$)/u.test(specifier) ||
        /^@dimforge\/rapier3d(?:[-/]|$)/u.test(specifier));
    expect(optionalEdges).toEqual([]);
  });

  it("evaluates the shared game bridge without evaluating the world or optional backend", async () => {
    const worldEvaluated = vi.fn();
    const backendEvaluated = vi.fn();
    class World {}
    vi.resetModules();
    vi.doMock("@aura3d/physics/world", () => {
      worldEvaluated();
      return { PhysicsWorld: World, ensurePhysics: async () => ({ World, init: async () => {} }) };
    });
    vi.doMock("@dimforge/rapier3d-compat", () => {
      backendEvaluated();
      return { World, init: async () => {} };
    });
    try {
      const bridge = await import("../../../packages/engine/src/public/v5-internal.js");
      expect(bridge.createGame).toBeTypeOf("function");
      expect(bridge.createFixedStepLoop).toBeTypeOf("function");
      expect(worldEvaluated).not.toHaveBeenCalled();
      expect(backendEvaluated).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@aura3d/physics/world");
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  }, 30_000);

  it("awaits ESM initialization before publishing synchronous legacy access, without readying isolated providers", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const events: string[] = [];
    let initialized = false;
    class BackendWorld {
      integrationParameters = { numSolverIterations: 0 };
      constructor() {
        if (!initialized) throw new Error("constructed before initialization");
        events.push("world");
      }
      free() { events.push("free"); }
    }
    vi.resetModules();
    vi.doMock("@dimforge/rapier3d-compat", () => {
      events.push("backend-evaluated");
      return {
        World: BackendWorld,
        init: async () => {
          events.push("init-start");
          started.resolve();
          await release.promise;
          initialized = true;
          events.push("init-end");
        }
      };
    });
    try {
      const provider = await import("../../../packages/engine/src/agent-api/physics/PhysicsWorldProvider.js");
      const isolated = provider.createPhysicsWorldProvider();
      const another = provider.createPhysicsWorldProvider();
      expect(events).toEqual([]);
      expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);

      let published = false;
      const legacyImport = import("../../../packages/engine/src/public/legacy-physics-access.js")
        .then((entry) => { published = true; return entry; });
      await Promise.race([
        started.promise,
        legacyImport.then(() => { throw new Error("Legacy access published before backend initialization started."); })
      ]);
      expect(published).toBe(false);
      expect(events).toEqual(["backend-evaluated", "init-start"]);
      expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);

      release.resolve();
      const { legacyPhysicsWorldAccess: legacy } = await legacyImport;
      const World = legacy.requireReady();
      const world = new World();
      world.dispose();
      expect(events).toEqual(["backend-evaluated", "init-start", "init-end", "world", "free"]);
      await legacy.preload();
      expect(() => isolated.requireReady()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => another.requireReady()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => provider.requirePhysicsWorld()).toThrow(/await preloadPhysics\(\)/i);

      await isolated.preload();
      expect(isolated.requireReady()).toBe(World);
      expect(() => another.requireReady()).toThrow(/await preloadPhysics\(\)/i);
      expect(() => provider.requirePhysicsWorld()).toThrow(/await preloadPhysics\(\)/i);
    } finally {
      release.resolve();
      vi.doUnmock("@dimforge/rapier3d-compat");
      vi.resetModules();
    }
  });

  it("constructs and steps the real legacy world synchronously after import", async () => {
    const { legacyPhysicsWorldAccess } = await import("../../../packages/engine/src/public/legacy-physics-access.js");
    const World = legacyPhysicsWorldAccess.requireReady();
    const world = new World({ gravity: [0, -10, 0] });
    try {
      const body = world.createRigidBody({ position: [0, 1, 0] });
      world.step(1 / 60);
      expect(body.position[1]).toBeLessThan(1);
      expect(world.snapshot().backend.active).toBe("rapier");
    } finally { world.dispose(); }
  });
});
