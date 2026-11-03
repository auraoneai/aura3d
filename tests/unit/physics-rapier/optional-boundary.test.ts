import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createCameraProbe } from "../../../packages/engine/src/agent-api/camera/Probe.js";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape } from "../../../packages/physics/src/Shape.js";

const root = process.cwd();
const registry = JSON.parse(readFileSync(resolve(root, "aura.exports.json"), "utf8")) as {
  paths: Array<readonly [string, string]>;
};
const aliases = new Map(registry.paths.filter(([name, target]) => !name.includes("*") && !target.includes("*")));
const backend = (specifier: string): boolean =>
  specifier === "@aura3d/physics-rapier" || specifier.startsWith("@aura3d/physics-rapier/") ||
  /^@dimforge\/rapier3d(?:[-/]|$)/u.test(specifier);

/** Runtime module edges; type-only imports and deferred imports inside functions do not load a backend. */
function eagerImports(source: string, name: string): string[] {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: string[] = [];
  const functions = new Map<string, ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction>();
  const visitedFunctions = new Set<ts.Node>();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      // With verbatimModuleSyntax, `import { type T }` emits `import {}`
      // and still evaluates the module. Only `import type` disappears.
      if (!statement.importClause?.isTypeOnly) imports.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!statement.isTypeOnly) imports.push(statement.moduleSpecifier.text);
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
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      // An immediately invoked function runs during module evaluation.
      let expression: ts.Node = node;
      while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
      if (!ts.isCallExpression(expression.parent) || expression.parent.expression !== expression) return;
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      imports.push((node.arguments[0] as ts.StringLiteral).text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const target = functions.get(node.expression.text);
      if (target?.body && !visitedFunctions.has(target)) {
        visitedFunctions.add(target);
        visit(target.body);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
  return imports;
}

function resolveSource(from: string, specifier: string): string | undefined {
  const mapped = aliases.get(specifier);
  if (!mapped && specifier.startsWith("@aura3d/")) throw new Error(`Unmapped workspace import ${specifier} from ${relative(root, from)}`);
  const base = mapped ? resolve(root, mapped) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : undefined;
  if (!base) return undefined; // External, non-Aura dependency.
  const extension = extname(base);
  if (existsSync(base) && [".json", ".css", ".glsl", ".wgsl"].includes(extension)) return undefined;
  const withoutJs = /\.(?:c|m)?js$/u.test(base) ? base.slice(0, -extension.length) : base;
  const candidates = [base, `${withoutJs}.ts`, `${withoutJs}.tsx`, resolve(base, "index.ts")];
  const path = candidates.find((candidate) => existsSync(candidate) && /\.(?:[cm]?[jt]s|tsx)$/u.test(candidate));
  if (!path) throw new Error(`Cannot resolve runtime import ${specifier} from ${relative(root, from)}`);
  return path;
}

/** Find the first eagerly evaluated path from a source entry to the optional backend. */
function backendPath(entry: string): string[] | undefined {
  const first = resolve(root, entry);
  if (!isAbsolute(first) || !existsSync(first)) throw new Error(`Missing public source entry: ${entry}`);
  const queue: Array<{ path: string; chain: string[] }> = [{ path: first, chain: [entry] }];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const { path, chain } = queue[index]!;
    if (visited.has(path)) continue;
    visited.add(path);
    for (const specifier of eagerImports(readFileSync(path, "utf8"), path)) {
      if (backend(specifier)) return [...chain, specifier];
      const target = resolveSource(path, specifier);
      if (target && !visited.has(target)) queue.push({ path: target, chain: [...chain, relative(root, target)] });
    }
  }
  return undefined;
}

describe("optional physical simulation boundary", () => {
  it("distinguishes eager runtime imports from types and deferred loading", () => {
    expect(eagerImports(`
      import type { T } from "types";
      import { type Only } from "types-only";
      import { type Mixed, value } from "value";
      export type { T } from "export-types";
      export { type Only } from "export-types-only";
      export { value } from "export-value";
      void import("eager");
      void (async () => { await import("iife"); })();
      require("required");
      async function usePhysics() { await import("deferred"); }
      const startPhysics = async () => { await import("called-at-load"); };
      void startPhysics();
    `, "fixture.ts")).toEqual(["types-only", "value", "export-types-only", "export-value", "eager", "iife", "required", "called-at-load"]);
  });

  it.each([
    "packages/core/src/index.ts",
    "packages/physics/src/solverless.ts",
    "packages/engine/src/public/index.ts"
  ])("keeps the optional backend out of the eager runtime graph for %s", (entry) => {
    const path = backendPath(entry);
    expect(path, path ? `Optional backend eagerly reached: ${path.join(" -> ")}` : "").toBeUndefined();
  });

  it("keeps the camera collider probe independent of the optional backend", () => {
    const path = backendPath("packages/engine/src/agent-api/camera/Probe.ts");
    expect(path, path ? `Optional backend eagerly reached: ${path.join(" -> ")}` : "").toBeUndefined();
  });

  it("retains camera casts against real collider geometry through the solverless entry", () => {
    const body = new RigidBody(1, { type: "static" });
    const collider = new Collider(1, body.id, { shape: Shape.box(1, 1, 1) });
    const probe = createCameraProbe({ colliders: () => [{ id: "wall", collider, body }] });
    const hit = probe.sphereCast([0, 0, 5], [0, 0, -5], 0.2);
    expect(hit).toMatchObject({ hit: true, node: "wall" });
    expect(hit.distance).toBeCloseTo(3.8, 6);
    expect(probe.sphereCast([5, 0, 5], [5, 0, -5], 0.2).hit).toBe(false);
  });

  it.each([
    "packages/physics/src/native/NativePhysicsWorld.ts",
    "packages/physics/src/native/NativeCCD.ts",
    "packages/physics/src/native/NativeAcceleratedCCD.ts",
    "packages/physics/src/native/NativeContinuousStep.ts",
    "packages/physics/src/native/NativeSupportPath.ts"
  ])("keeps the unexported native experiment independent of the optional backend for %s", (entry) => {
    const path = backendPath(entry);
    expect(path, path ? `Optional backend eagerly reached: ${path.join(" -> ")}` : "").toBeUndefined();
  });

  it("pins the optional solver while declaring the adapter's actual sidecar dependencies", () => {
    const adapter = JSON.parse(readFileSync(resolve(root, "packages/physics-rapier/package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      sideEffects: boolean;
    };
    const engine = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      peerDependencies: Record<string, string>;
      peerDependenciesMeta: Record<string, { optional?: boolean }>;
    };
    expect(adapter.dependencies).toEqual({
      "@dimforge/rapier3d-compat": "0.20.0",
      "@gltf-transform/core": "4.5.1",
      "@gltf-transform/extensions": "4.5.1",
      meshoptimizer: "1.2.0"
    });
    expect(engine.peerDependencies["@dimforge/rapier3d-compat"]).toBe(adapter.dependencies["@dimforge/rapier3d-compat"]);
    expect(engine.peerDependenciesMeta["@dimforge/rapier3d-compat"]?.optional).toBe(true);
    expect(adapter.sideEffects).toBe(false);
    const adapterSource = readFileSync(resolve(root, "packages/physics-rapier/src/index.ts"), "utf8");
    for (const dependency of ["@gltf-transform/core", "@gltf-transform/extensions", "meshoptimizer"]) {
      expect(adapterSource).toContain(`import("${dependency}")`);
      expect(adapter.dependencies[dependency]).toMatch(/^\d+\.\d+\.\d+$/u);
    }
  });
});
