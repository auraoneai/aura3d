#!/usr/bin/env node
/**
 * Generates packages/assets/src/vite/physicsEntryPoints.generated.ts: every public `@aura3d/engine` export (and every
 * member of an exported namespace object such as `prefabs`, `sceneKits` or `game`) whose implementation, transitively
 * within the engine sources, declares physics bodies or colliders or uses the physics runtime. The `aura3d()` Vite
 * plugin keeps Rapier when an app mentions any of these names, so an engine API that declares bodies internally (for
 * example `prefabs.miniGolfHole()`, nine `.physics({...})` bodies) can never be stripped by the build-time scan.
 *
 *   node packages/assets/scripts/gen-physics-entry-points.mjs           # write the module
 *   node packages/assets/scripts/gen-physics-entry-points.mjs --check   # exit 1 when the committed module is stale
 *
 * Method (TypeScript program over the public entries listed in the root package.json `exports`, resolved through
 * tsconfig.base.json `paths` to `packages/<pkg>/src`; subpaths whose own name matches the scanner's keyword pattern,
 * such as `@aura3d/engine/physics` or `.../game`, are skipped because importing them already keeps physics):
 *
 * 1. Seeds. A unit (function, method, object member, variable, class) is physics when its own code
 *    - calls a builder `.physics(...)` with arguments (`AuraNodeBuilder.physics`, `AuraSceneBuilder.physics`),
 *    - writes a node body spec (`physics: {...}` typed as `AuraNodePhysicsSpec`, or an untyped literal with a body
 *      `type`/`shape`) or a model collider (`collider: "auto" | "bounds" | true`),
 *    - calls `requireReady()` on a physics backend access (any value that also has `preload`), or a member of the
 *      engine's access objects (BACKEND_ACCESS_MODULES), or
 *    - references a value of the physics runtime (PHYSICS_RUNTIME_MODULES: `@aura3d/physics`, `@aura3d/physics-rapier`,
 *      `@dimforge/*` and the engine's physics runtime modules), except the modules behind `@aura3d/physics/solverless`,
 *      the package's own contract for solver-free geometry (shapes, stepper, mesh BVH, surface queries).
 * 2. Propagation. Every value reference in a unit's code is resolved with the type checker and followed into the
 *    engine sources: calls, `new`, members of namespace objects through the resolved property (`prefabs.box` follows
 *    `box`, a bare `prefabs` follows the whole object), shorthand and spread members. Import and export aliases
 *    (`import { x }`, `import { y as x }`, default imports, `export { x } from`, `export *`, `export * as ns`) are
 *    followed to their declarations, so `{ cityBlock }` with an imported `cityBlock` follows the function itself.
 *    Nested closures and object literals are walked inside their creator, and a referenced class contributes its constructor, fields and every
 *    method an escaped instance could be called with, so the code that creates an object carries the status of the
 *    methods later called through an interface. Physics status is the fixpoint over the reference graph (cycles included).
 * 3. Boundaries. The app mount runtime (MOUNT_RUNTIME_MODULES: `createAuraApp`, `createGameApp`) creates bodies only
 *    for nodes that already declare them, so it is neither walked nor a seed; the scene content the app builds is what
 *    counts. Class members whose own names match the keyword pattern (`physics`, `collider`, `vehicle`, ...) are skipped
 *    when an instance escapes, because an app has to spell that name to call them, which the keyword rule catches.
 *
 * The output lists entry paths with one evidence chain each, the bare names the scanner matches, and the namespace
 * objects whose dynamic access (`prefabs[name]`) keeps physics. tests/unit/assets/physics-entry-points.test.ts reruns
 * this generator with --check, so an engine change that adds a body-declaring API fails until this file is regenerated.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// `--root <dir>` runs the generator over another tree with the same layout (tests use small fixture trees).
const rootFlag = process.argv.indexOf("--root");
const ROOT = rootFlag >= 0 && process.argv[rootFlag + 1]
  ? path.resolve(process.argv[rootFlag + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "packages/assets/src/vite/physicsEntryPoints.generated.ts");
const SCANNER = path.join(ROOT, "packages/assets/src/vite/auraPhysics.ts");
const GENERATOR = "packages/assets/scripts/gen-physics-entry-points.mjs";

/** Modules of the physics runtime: a value reference into any of them is a seed. */
const PHYSICS_RUNTIME_MODULES = [
  "packages/physics/src/",
  "packages/physics-rapier/src/",
  "node_modules/@dimforge/",
  "packages/engine/src/agent-api/physics/onDemandPhysics.ts",
  "packages/engine/src/agent-api/physics/v5/",
  "packages/engine/src/agent-api/nodes/physics-core.ts",
  "packages/engine/src/agent-api/nodes/physics.ts",
  "packages/engine/src/agent-api/PhysicsRuntime.ts"
];
/** The app mount runtime: creates bodies only for nodes that already declare them. Neither walked nor a seed. */
const MOUNT_RUNTIME_MODULES = ["packages/engine/src/agent-api/app/"];
/**
 * Lazy physics-backend access objects (`PhysicsWorldAccess`): creating or passing one loads and uses nothing, so a
 * top-level reference is neutral; calling one of their members (`requireReady()`, `preload()`) uses the world (seed).
 */
const BACKEND_ACCESS_MODULES = [
  "packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts",
  "packages/engine/src/agent-api/physics/PhysicsWorldAccess.ts",
  "packages/engine/src/agent-api/physics/backendMissing.ts",
  "packages/engine/src/public/legacy-physics-access.ts"
];
/** The physics package's solver-free entry (see the comment on `solverlessFiles`). */
const SOLVERLESS_ENTRY = "packages/physics/src/solverless.ts";
/** Builder methods that declare a body or attach a physics world. */
const BODY_BUILDER_METHODS = new Set(["AuraNodeBuilder.physics", "AuraSceneBuilder.physics"]);

function assertBoundariesExist() {
  for (const entry of [...PHYSICS_RUNTIME_MODULES, ...MOUNT_RUNTIME_MODULES, ...BACKEND_ACCESS_MODULES, SOLVERLESS_ENTRY]) {
    if (entry.startsWith("node_modules/")) continue;
    if (!existsSync(path.join(ROOT, entry))) throw new Error(`${GENERATOR}: boundary ${entry} no longer exists; update the lists`);
  }
}

function keywordPattern() {
  const source = readFileSync(SCANNER, "utf8");
  const match = /export const PHYSICS_USAGE_PATTERN = \/(.+)\/([a-z]*);/.exec(source);
  if (!match) throw new Error(`PHYSICS_USAGE_PATTERN not found in ${path.relative(ROOT, SCANNER)}`);
  return new RegExp(match[1], match[2]);
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const startsWithAny = (file, prefixes) => {
  const relative = rel(file);
  return prefixes.some((prefix) => relative.startsWith(prefix) || relative.includes(`/${prefix}`));
};

function publicEntries(KEYWORD) {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const config = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, "tsconfig.base.json"), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")); }
  });
  const paths = config.options.paths ?? {};
  const entries = [];
  for (const key of Object.keys(pkg.exports).sort()) {
    const specifier = key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`;
    // An import of a subpath whose own name matches the keyword rule (`@aura3d/engine/physics`, `.../game`) already keeps.
    if (KEYWORD.test(specifier)) continue;
    const target = paths[specifier]?.[0];
    if (!target || !/\.tsx?$/.test(target)) continue;
    entries.push({ specifier, file: path.resolve(config.options.pathsBasePath ?? ROOT, target) });
  }
  return { entries, options: config.options };
}

function unwrap(expression) {
  let current = expression;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isTypeAssertionExpression(current))) {
    current = current.expression;
  }
  return current;
}

function generate() {
  assertBoundariesExist();
  const KEYWORD = keywordPattern();
  const keywordName = (name) => KEYWORD.test(name);
  const { entries, options } = publicEntries(KEYWORD);
  const program = ts.createProgram(entries.map((entry) => entry.file), { ...options, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();

  const inEngineSource = (file) => /(^|\/)packages\/[^/]+\/src\//.test(rel(file)) && !file.endsWith(".d.ts") && !rel(file).includes("node_modules/");
  const isPhysicsRuntime = (file) => startsWithAny(file, PHYSICS_RUNTIME_MODULES);
  const isMountRuntime = (file) => startsWithAny(file, MOUNT_RUNTIME_MODULES) || startsWithAny(file, BACKEND_ACCESS_MODULES);
  const isBackendAccess = (file) => startsWithAny(file, BACKEND_ACCESS_MODULES);
  const isMember = (declaration) => Boolean(declaration.parent && (ts.isInterfaceDeclaration(declaration.parent) || ts.isTypeLiteralNode(declaration.parent)
    || ts.isClassDeclaration(declaration.parent) || ts.isClassExpression(declaration.parent) || ts.isObjectLiteralExpression(declaration.parent)));

  // `@aura3d/physics/solverless` is the package's own contract for code that never reaches the solver (shapes, the
  // stepper, mesh BVH and surface queries): references into the modules behind it are geometry, not physics use.
  const solverlessEntry = program.getSourceFile(path.join(ROOT, SOLVERLESS_ENTRY));
  if (!solverlessEntry) throw new Error(`${SOLVERLESS_ENTRY} is not part of the program`);
  const solverlessFiles = new Set();
  for (const statement of solverlessEntry.statements) {
    // Value re-exports only: `export type * from "./types.js"` names solver types without making their modules solver-free.
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.moduleSpecifier) continue;
    if (statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.every((element) => element.isTypeOnly)) continue;
    const target = checker.getSymbolAtLocation(statement.moduleSpecifier);
    for (const declaration of target?.declarations ?? []) if (ts.isSourceFile(declaration)) solverlessFiles.add(declaration.fileName);
  }

  /** @type {Map<ts.Node, {label: string, seed?: string, edges: Set<ts.Node>}>} */
  const units = new Map();
  const queue = [];

  const isUnitKind = (node) => ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)
    || ts.isVariableDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isShorthandPropertyAssignment(node)
    || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isExportAssignment(node) || ts.isEnumDeclaration(node);
  const hasBody = (node) => !(ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) || node.body !== undefined;

  const nameOf = (node) => {
    const name = node.name;
    if (!name) return ts.isConstructorDeclaration(node) ? "constructor" : "<anonymous>";
    return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name) || ts.isNumericLiteral(name) ? name.text : name.getText();
  };
  const ownerName = (node) => {
    let current = node.parent;
    while (current) {
      if ((ts.isClassDeclaration(current) || ts.isClassExpression(current)) && current.name) return current.name.text;
      if (ts.isObjectLiteralExpression(current)) {
        const holder = current.parent;
        if (holder && (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) && holder.name) return nameOf(holder);
      }
      if (ts.isSourceFile(current)) return undefined;
      current = current.parent;
    }
    return undefined;
  };
  const labelOf = (node) => {
    const owner = ownerName(node);
    const name = nameOf(node);
    return `${owner ? `${owner}.` : ""}${name} (${rel(node.getSourceFile().fileName)})`;
  };

  const unitFor = (node) => {
    if (units.has(node)) return units.get(node);
    const unit = { node, label: labelOf(node), edges: new Set() };
    units.set(node, unit);
    queue.push(unit);
    return unit;
  };

  /**
   * The target of an import or export alias (`import { x }`, `import x from`, `import { y as x }`, `export { x } from`,
   * `export *`, `export * as ns`), followed through every re-export hop; any other symbol unchanged. Every symbol that
   * reaches `reference()` goes through this, so a name imported into a shorthand member (`{ cityBlock }`) is followed
   * to its declaration instead of stopping at the import binding, which carries no Value flag.
   */
  const dealias = (symbol) => {
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
    try {
      const target = checker.getAliasedSymbol(symbol);
      return target;
    } catch { return undefined; }
  };
  const resolve = (location) => dealias(checker.getSymbolAtLocation(location));
  /**
   * The object literal behind an exported namespace: `const ns = {...}`, or a factory around one such as
   * `lazyNamespace(() => ({...}))` / `Object.freeze({...})`.
   */
  const namespaceLiteral = (declaration) => {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) return undefined;
    const init = unwrap(declaration.initializer);
    if (ts.isObjectLiteralExpression(init)) return init;
    if (!ts.isCallExpression(init)) return undefined;
    for (const argument of [...init.arguments].reverse()) {
      const value = unwrap(argument);
      if (ts.isObjectLiteralExpression(value)) return value;
      if ((ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.parameters.length === 0) {
        if (!ts.isBlock(value.body)) { const body = unwrap(value.body); if (ts.isObjectLiteralExpression(body)) return body; continue; }
        const last = value.body.statements.at(-1);
        if (last && ts.isReturnStatement(last) && last.expression && ts.isObjectLiteralExpression(unwrap(last.expression))) return unwrap(last.expression);
      }
    }
    return undefined;
  };
  const isNamespaceObject = (declaration) => namespaceLiteral(declaration) !== undefined;

  /** Record the effect of one resolved value symbol on `unit`. Returns true when it resolved to something followable. */
  const reference = (unit, aliasOrSymbol, name) => {
    const symbol = dealias(aliasOrSymbol);
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Value)) return false;
    const declarations = symbol.declarations ?? [];
    let followed = false;
    for (const declaration of declarations) {
      const file = declaration.getSourceFile().fileName;
      if (isPhysicsRuntime(file) && !solverlessFiles.has(file)) {
        unit.seed ??= `uses ${symbol.getName()} from ${rel(file)}`;
        followed = true;
        continue;
      }
      if (isBackendAccess(file) && isMember(declaration)) {
        unit.seed ??= `calls ${symbol.getName()}() on a physics backend access from ${rel(file)}`;
        followed = true;
        continue;
      }
      if (!inEngineSource(file) || isMountRuntime(file) || solverlessFiles.has(file)) { followed = true; continue; }
      if (ts.isParameter(declaration) || ts.isBindingElement(declaration) || ts.isTypeParameterDeclaration(declaration)) { followed = true; continue; }
      // A bodiless signature (interface member, callback type, overload) is not followed by name: the object that
      // implements it was created by code this walk already covers (object literals and closures are walked inside
      // their creator's body; a referenced class contributes all of its methods), so the creator carries the status.
      if (!hasBody(declaration) || ts.isMethodSignature(declaration) || ts.isPropertySignature(declaration)) { followed = true; continue; }
      if (ts.isSourceFile(declaration) || ts.isModuleDeclaration(declaration)) {
        // `import * as ns` used bare: every export of the module.
        const moduleSymbol = checker.getSymbolAtLocation(ts.isSourceFile(declaration) ? declaration : declaration.name) ?? symbol;
        for (const exported of checker.getExportsOfModule(moduleSymbol)) reference(unit, exported, exported.getName());
        followed = true;
        continue;
      }
      if (isUnitKind(declaration) && hasBody(declaration)) {
        unit.edges.add(unitFor(declaration).node);
        followed = true;
      }
    }
    return followed;
  };

  /**
   * `physics: {...}` declares a body when the property is typed as a node body spec, or, for an untyped literal, when
   * the value carries a body `type` or `shape` (evidence/report objects with a `physics` section are not bodies).
   */
  const isBodySpecLiteral = (property, value) => {
    const contextual = checker.getContextualType(property.parent);
    const declared = contextual?.getNonNullableType().getProperty("physics");
    if (declared) {
      const type = checker.getTypeOfSymbolAtLocation(declared, property);
      return /\bAuraNodePhysicsSpec\b/.test(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation));
    }
    return value.properties.some((member) => member.name && (nameOf(member) === "type" || nameOf(member) === "shape"));
  };

  const walk = (unit, root) => {
    const visit = (node) => {
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isImportDeclaration(node)
        || ts.isExportDeclaration(node) || ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return;
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "requireReady") {
          // Any structural physics access (`{ preload(); requireReady() }`), not only the engine's own interface.
          const receiver = checker.getTypeAtLocation(callee.expression);
          if (receiver.getProperty("preload")) unit.seed ??= `calls requireReady() on a physics backend access in ${rel(node.getSourceFile().fileName)}`;
        }
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "physics" && node.arguments.length > 0) {
          for (const declaration of resolve(callee.name)?.declarations ?? []) {
            const owner = declaration.parent && (ts.isClassDeclaration(declaration.parent) || ts.isInterfaceDeclaration(declaration.parent)) && declaration.parent.name?.text;
            if (owner && BODY_BUILDER_METHODS.has(`${owner}.physics`)) unit.seed ??= `${owner}.physics(...) call in ${rel(node.getSourceFile().fileName)}`;
          }
        }
      }
      if (ts.isPropertyAssignment(node) && node.initializer) {
        const key = nameOf(node);
        const value = unwrap(node.initializer);
        if (key === "physics" && ts.isObjectLiteralExpression(value) && isBodySpecLiteral(node, value)) unit.seed ??= `physics: {...} body spec in ${rel(node.getSourceFile().fileName)}`;
        if (key === "collider" && ((ts.isStringLiteral(value) && (value.text === "auto" || value.text === "bounds")) || value.kind === ts.SyntaxKind.TrueKeyword)) {
          unit.seed ??= `collider: ${value.getText()} in ${rel(node.getSourceFile().fileName)}`;
        }
      }
      if (ts.isShorthandPropertyAssignment(node)) {
        reference(unit, checker.getShorthandAssignmentValueSymbol(node), node.name.text);
        return;
      }
      if (ts.isPropertyAccessExpression(node)) {
        const member = resolve(node.name);
        const followed = reference(unit, member, node.name.text);
        const target = unwrap(node.expression);
        // `prefabs.box()` follows `box` only; the whole namespace object is followed when it is used bare.
        const targetSymbol = ts.isIdentifier(target) ? resolve(target) : undefined;
        const namespaceTarget = followed && targetSymbol?.declarations?.some(isNamespaceObject);
        if (!namespaceTarget) visit(node.expression);
        return;
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        if (parent && (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isFunctionDeclaration(parent)
          || ts.isClassDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)
          || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) || ts.isLabeledStatement(parent)) && parent.name === node) return;
        reference(unit, resolve(node), node.text);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
  };

  const expandUnit = (unit) => {
    const node = unit.node;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const clause of node.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) for (const type of clause.types) walk(unit, type.expression);
      }
      for (const member of node.members) {
        if (ts.isConstructorDeclaration(member) || ts.isClassStaticBlockDeclaration(member)) { walk(unit, member); continue; }
        if (ts.isPropertyDeclaration(member)) { if (member.initializer) walk(unit, member.initializer); continue; }
        // An escaped instance can call any method; one spelled with a keyword name is caught at the app's call site.
        if ((ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && member.body) {
          if (keywordName(nameOf(member))) continue;
          unit.edges.add(unitFor(member).node);
        }
      }
      return;
    }
    if (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) {
      if (node.initializer) walk(unit, node.initializer);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      reference(unit, checker.getShorthandAssignmentValueSymbol(node), node.name.text);
      return;
    }
    if (ts.isExportAssignment(node) || ts.isSpreadAssignment(node)) { walk(unit, node.expression); return; }
    if (ts.isEnumDeclaration(node)) return;
    if (ts.isSourceFile(node)) {
      // A module namespace (`export * as ns`) used whole: every export of the module.
      const moduleSymbol = checker.getSymbolAtLocation(node);
      for (const exported of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) reference(unit, exported, exported.getName());
      return;
    }
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      for (const parameter of node.parameters) if (parameter.initializer) walk(unit, parameter.initializer);
      if (node.body) walk(unit, node.body);
    }
  };

  // Public surface: exports of every entry, with members of exported namespace objects as their own entries.
  /** @type {Map<string, {path: string, specifiers: Set<string>, node: ts.Node, container?: string}>} */
  const surface = new Map();
  const containers = new Map();
  const addSurface = (entryPath, specifier, node, container) => {
    const existing = surface.get(entryPath);
    if (existing) { existing.specifiers.add(specifier); return; }
    surface.set(entryPath, { path: entryPath, specifiers: new Set([specifier]), node: unitFor(node).node, container });
  };
  const addMembers = (prefix, specifier, literal, depth) => {
    containers.set(prefix, literal);
    for (const property of literal.properties) {
      if (ts.isSpreadAssignment(property)) {
        // `...otherNamespace` contributes its members; any other spread is one opaque member of the namespace.
        const source = ts.isIdentifier(unwrap(property.expression)) ? resolve(unwrap(property.expression)) : undefined;
        const spreadLiteral = source?.declarations?.map(namespaceLiteral).find(Boolean);
        if (spreadLiteral && depth < 3) addMembers(prefix, specifier, spreadLiteral, depth);
        else addSurface(`${prefix}.[spread]`, specifier, property, prefix);
        continue;
      }
      const memberPath = `${prefix}.${nameOf(property)}`;
      const initializer = ts.isPropertyAssignment(property) ? unwrap(property.initializer) : undefined;
      if (initializer && ts.isObjectLiteralExpression(initializer) && depth < 3) addMembers(memberPath, specifier, initializer, depth + 1);
      else addSurface(memberPath, specifier, property, prefix);
    }
  };
  /** One export of an entry: a value, a namespace object (members as entries) or `export * as ns` (exports as entries). */
  const addExport = (name, exported, specifier, depth) => {
    const symbol = dealias(exported);
    if (!symbol || !(symbol.flags & ts.SymbolFlags.Value)) return;
    for (const declaration of symbol.declarations ?? []) {
      const file = declaration.getSourceFile().fileName;
      if (!inEngineSource(file) && !isPhysicsRuntime(file)) continue;
      if (isPhysicsRuntime(file)) { addSurface(name, specifier, declaration); continue; }
      if (isMountRuntime(file)) continue;
      if (ts.isSourceFile(declaration)) {
        // `export * as ns from "./module.js"`: every export of the module is `ns.<export>`.
        containers.set(name, declaration);
        if (depth >= 3) { addSurface(name, specifier, declaration); continue; }
        const moduleSymbol = checker.getSymbolAtLocation(declaration);
        for (const member of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) addExport(`${name}.${member.getName()}`, member, specifier, depth + 1);
        continue;
      }
      if (isNamespaceObject(declaration)) { addMembers(name, specifier, namespaceLiteral(declaration), depth); continue; }
      if (isUnitKind(declaration) && hasBody(declaration)) addSurface(name, specifier, declaration);
    }
  };
  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry.file);
    if (!sourceFile) throw new Error(`entry not in program: ${rel(entry.file)}`);
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) addExport(exported.getName(), exported, entry.specifier, 1);
  }

  // Walk every reachable unit, then propagate physics status backwards from the seeds (fixpoint over cycles).
  for (let index = 0; index < queue.length; index++) expandUnit(queue[index]);
  const runtimeSeeded = (unit) => isPhysicsRuntime(unit.node.getSourceFile().fileName) && !solverlessFiles.has(unit.node.getSourceFile().fileName) ? `declared in ${rel(unit.node.getSourceFile().fileName)}` : undefined;
  const reverse = new Map();
  for (const unit of units.values()) {
    unit.seed ??= runtimeSeeded(unit);
    for (const target of unit.edges) {
      if (!reverse.has(target)) reverse.set(target, []);
      reverse.get(target).push(unit);
    }
  }
  const via = new Map();
  const work = [...units.values()].filter((unit) => unit.seed);
  for (const unit of work) via.set(unit.node, null);
  for (let index = 0; index < work.length; index++) {
    const unit = work[index];
    for (const caller of reverse.get(unit.node) ?? []) {
      if (via.has(caller.node)) continue;
      via.set(caller.node, unit);
      work.push(caller);
    }
  }
  const evidence = (node) => {
    const chain = [];
    let current = units.get(node);
    for (let hops = 0; current && hops < 8; hops++) {
      const next = via.get(current.node);
      if (next === null) { chain.push(`${current.label}: ${current.seed}`); break; }
      chain.push(current.label);
      current = next;
    }
    return chain.join(" -> ");
  };

  const physicsEntries = [...surface.values()]
    .filter((entry) => via.has(entry.node))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => ({ path: entry.path, from: [...entry.specifiers].sort(), evidence: evidence(entry.node) }));
  // An entry under a namespace whose own name the keyword rule matches (`games.prefabs`) needs no token: the app spells it.
  const tokens = [...new Set(physicsEntries
    .filter((entry) => !entry.path.split(".").slice(0, -1).some(keywordName))
    .map((entry) => entry.path.split(".").at(-1))
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)))].sort();
  const physicsContainers = [...containers.keys()]
    .filter((prefix) => physicsEntries.some((entry) => entry.path.startsWith(`${prefix}.`)))
    .flatMap((prefix) => prefix.split("."))
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();
  return { physicsEntries, tokens, physicsContainers, surfaceSize: surface.size, entries };
}

function render({ physicsEntries, tokens, physicsContainers, surfaceSize, entries }) {
  const json = (value) => JSON.stringify(value, null, 2);
  return `// GENERATED by ${GENERATOR}; do not edit by hand.
// Regenerate with \`node ${GENERATOR}\`; tests/unit/assets/physics-entry-points.test.ts fails when this file is stale.
// Public engine entries (and members of exported namespace objects) whose implementation, transitively within the
// engine sources, declares physics bodies or colliders or uses the physics runtime. ${physicsEntries.length} of ${surfaceSize}
// public values across ${entries.length} entry point(s): ${entries.map((entry) => entry.specifier).join(", ")}.

export interface PhysicsEntryPoint {
  /** Public path, e.g. \`prefabs.miniGolfHole\`. */
  readonly path: string;
  /** Package entry points that export it. */
  readonly from: readonly string[];
  /** One call chain from the entry to the code that declares bodies or uses the physics runtime. */
  readonly evidence: string;
}

export const PHYSICS_ENTRY_POINTS: readonly PhysicsEntryPoint[] = ${json(physicsEntries)};

/** The bare names the scanner matches (last segment of each path), as identifiers, property names or strings. */
export const PHYSICS_ENTRY_TOKENS: readonly string[] = ${json(tokens)};

/** Exported namespace objects with at least one physics member: dynamic or whole-object use of these keeps physics. */
export const PHYSICS_NAMESPACE_OBJECTS: readonly string[] = ${json(physicsContainers)};
`;
}

const output = render(generate());
if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(OUT, "utf8"); } catch { /* missing */ }
  if (current !== output) {
    console.error(`${rel(OUT)} is stale; run: node ${GENERATOR}`);
    process.exit(1);
  }
  console.log(`${rel(OUT)} is up to date`);
} else if (process.argv.includes("--print")) {
  process.stdout.write(output);
} else {
  writeFileSync(OUT, output);
  console.log(`wrote ${rel(OUT)}`);
}
