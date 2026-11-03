import { posix } from "node:path";
import ts from "typescript";
import type { PackedPackage } from "./prepare-baseline.js";

export interface RuntimeExportSurface {
  target: string;
  format?: "esm" | "commonjs";
  names: string[];
  verified: boolean;
  issues: string[];
}

type Binding =
  | { kind: "local"; name: string }
  | { kind: "indirect"; target: string; name: string }
  | { kind: "namespace"; target: string };
type CommonJsStep =
  | { kind: "write"; object: "exports" | "module.exports"; name: string }
  | { kind: "replace"; names: string[] }
  | { kind: "reexport"; target: string };
interface ModuleInfo {
  path: string;
  format?: "esm" | "commonjs";
  exports: Map<string, Binding>;
  stars: string[];
  dependencies: Set<string>;
  imports: { target: string; name: string }[];
  commonJsSteps: CommonJsStep[];
  issues: Set<string>;
}
type Resolution = { kind: "binding"; id: string } | { kind: "missing" | "ambiguous" | "unknown" };

const MAX_MODULES = 2_048;
const MAX_DEPTH = 128;
const MAX_RESOLUTION_STEPS = 250_000;

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

function stringName(name: ts.PropertyName | ts.ModuleExportName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && (ts.isStringLiteral(name.expression) || ts.isNumericLiteral(name.expression))) return name.expression.text;
  return undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return !!ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((modifier) => modifier.kind === kind);
}

/**
 * Analyze only the retained archive buffers. No source text is imported,
 * evaluated, installed, or resolved against the host filesystem.
 */
export function createRuntimeExportAnalyzer(pkg: PackedPackage): { analyze(target: string, condition: string): RuntimeExportSurface } {
  const paths = new Set(pkg.paths);
  const modules = new Map<string, ModuleInfo>();

  const issue = (info: ModuleInfo, message: string): void => { info.issues.add(`${info.path}: ${message}`); };
  const body = (info: ModuleInfo, path: string): Buffer | undefined => {
    if (!paths.has(path)) {
      issue(info, `runtime body is not packed: ${path}`);
      return undefined;
    }
    const bytes = pkg.files.get(path);
    if (!bytes) issue(info, `runtime body unavailable: ${path}${pkg.unavailableFiles?.has(path) ? ` (${pkg.unavailableFiles.get(path)})` : ""}`);
    return bytes;
  };
  const text = (info: ModuleInfo, bytes: Buffer, description: string): string | undefined => {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { issue(info, `invalid UTF-8 in ${description}`); return undefined; }
  };
  const formatFor = (info: ModuleInfo): ModuleInfo["format"] => {
    if (info.path.endsWith(".mjs")) return "esm";
    if (info.path.endsWith(".cjs")) return "commonjs";
    if (!info.path.endsWith(".js")) { issue(info, "unsupported non-JavaScript runtime target"); return undefined; }
    let dir = posix.dirname(info.path);
    while (dir !== ".") {
      const manifestPath = `${dir}/package.json`;
      if (paths.has(manifestPath)) {
        const bytes = body(info, manifestPath);
        if (!bytes) return undefined;
        const source = text(info, bytes, manifestPath);
        if (source === undefined) return undefined;
        try {
          const parsed: unknown = JSON.parse(source);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            issue(info, `invalid package scope: ${manifestPath}`);
            return undefined;
          }
          const manifest = parsed as { type?: unknown };
          if (manifest.type === "module") return "esm";
          if (manifest.type === undefined || manifest.type === "commonjs") return "commonjs";
          issue(info, `unsupported package type in ${manifestPath}`);
          return undefined;
        } catch { issue(info, `invalid package scope: ${manifestPath}`); return undefined; }
      }
      dir = posix.dirname(dir);
    }
    if (pkg.manifest.type === "module") return "esm";
    if (pkg.manifest.type === undefined || pkg.manifest.type === "commonjs") return "commonjs";
    issue(info, "unsupported root package type");
    return undefined;
  };

  const resolveRelative = (info: ModuleInfo, specifier: string, depth: number): string | undefined => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      issue(info, `external module is not verified: ${specifier}`);
      return undefined;
    }
    if (/[\\%?#\0]/.test(specifier)) {
      issue(info, `unsupported relative module specifier: ${specifier}`);
      return undefined;
    }
    const target = posix.normalize(posix.join(posix.dirname(info.path), specifier));
    if (target === ".." || target.startsWith("../") || posix.isAbsolute(target)) {
      issue(info, `relative module escapes the packed package: ${specifier}`);
      return undefined;
    }
    info.dependencies.add(target);
    load(target, depth + 1);
    return target;
  };

  const inspect = (info: ModuleInfo, root: ts.Node, commonjs: boolean, esmLocals?: ReadonlyMap<string, Binding>): void => {
    const visit = (node: ts.Node, depth: number): void => {
      if (depth > 1_000) { issue(info, "JavaScript syntax tree exceeds inspection depth"); return; }
      if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
        || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) || ts.isAsExpression(node)
        || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)
        || ts.isImportEqualsDeclaration(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        issue(info, "unsupported TypeScript or JSX syntax in JavaScript");
      }
      if ((ts.isExportDeclaration(node) || ts.isImportDeclaration(node) || ts.isExportAssignment(node))
        && !ts.isSourceFile(node.parent)) issue(info, "non-top-level import or export");
      if (ts.isStatement(node) && hasModifier(node, ts.SyntaxKind.ExportKeyword) && !ts.isSourceFile(node.parent)) {
        issue(info, "non-top-level export declaration");
      }
      if (!commonjs && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
        const base = node.expression;
        const property = ts.isPropertyAccessExpression(node) ? node.name.text
          : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
        if (ts.isIdentifier(base) && !esmLocals?.has(base.text)
          && (base.text === "exports" || (base.text === "module" && (property === "exports" || property === undefined)))) {
          issue(info, "CommonJS export mutation in an ES module is not verified");
        }
      }
      if (ts.isWithStatement(node)) issue(info, "dynamic with statement");
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) issue(info, "dynamic import is not verified");
        if (ts.isIdentifier(node.expression) && ["eval", "Function", "require"].includes(node.expression.text)) {
          issue(info, `dynamic or external ${node.expression.text} call is not verified`);
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
        issue(info, "dynamic Function constructor is not verified");
      }
      if (ts.isIdentifier(node) && (node.text === "eval" || node.text === "Function")) {
        issue(info, `dynamic ${node.text} reference is not verified`);
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
        && ["globalThis", "global", "window", "self"].includes(node.expression.text)) {
        const argument = node.argumentExpression;
        if (!ts.isStringLiteral(argument) || argument.text === "eval" || argument.text === "Function") {
          issue(info, "dynamic global property access is not verified");
        }
      }
      if (commonjs && ts.isIdentifier(node) && (node.text === "exports" || node.text === "module" || node.text === "require")) {
        issue(info, `dynamic or unsupported CommonJS ${node.text} reference`);
      }
      if (commonjs && node.kind === ts.SyntaxKind.ThisKeyword) issue(info, "CommonJS this reference is not verified");
      if (!commonjs && ts.isIdentifier(node) && (node.text === "exports" || node.text === "module")
        && !esmLocals?.has(node.text)
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
        && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
        issue(info, "CommonJS binding reference in an ES module is not verified");
      }
      ts.forEachChild(node, (child) => visit(child, depth + 1));
    };
    visit(root, 0);
  };

  function parseEsm(info: ModuleInfo, file: ts.SourceFile, depth: number): void {
    const locals = new Map<string, Binding>();
    const pending: { exported: string; local: string }[] = [];
    const addLocal = (name: string, binding: Binding = { kind: "local", name }): void => {
      if (locals.has(name)) issue(info, `duplicate or ambiguous local binding: ${name}`);
      else locals.set(name, binding);
    };
    const addExport = (name: string, binding: Binding): void => {
      if (info.exports.has(name)) issue(info, `duplicate explicit export: ${name}`);
      else info.exports.set(name, binding);
    };
    const source = (node: ts.Expression | undefined): string | undefined => {
      if (!node || !ts.isStringLiteral(node)) { issue(info, "non-literal module specifier"); return undefined; }
      return resolveRelative(info, node.text, depth);
    };

    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) {
        const target = source(statement.moduleSpecifier);
        const clause = statement.importClause;
        if (!clause) continue;
        if (clause.isTypeOnly) issue(info, "type-only import in JavaScript");
        if (clause.name) {
          addLocal(clause.name.text, target ? { kind: "indirect", target, name: "default" } : { kind: "local", name: clause.name.text });
          if (target) info.imports.push({ target, name: "default" });
        }
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) {
          addLocal(named.name.text, target ? { kind: "namespace", target } : { kind: "local", name: named.name.text });
        } else if (named && ts.isNamedImports(named)) {
          for (const element of named.elements) {
            if (element.isTypeOnly) issue(info, "type-only import in JavaScript");
            const imported = element.propertyName?.text ?? element.name.text;
            addLocal(element.name.text, target ? { kind: "indirect", target, name: imported } : { kind: "local", name: element.name.text });
            if (target) info.imports.push({ target, name: imported });
          }
        }
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) addLocal(name);
        }
      } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        addLocal(statement.name.text);
      }
    }

    for (const statement of file.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) issue(info, "type-only export in JavaScript");
        const target = statement.moduleSpecifier ? source(statement.moduleSpecifier) : undefined;
        if (!statement.exportClause) {
          if (target) info.stars.push(target);
          else if (!statement.moduleSpecifier) issue(info, "export star has no module");
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          if (target) addExport(statement.exportClause.name.text, { kind: "namespace", target });
          else issue(info, "namespace export has no verifiable module");
        } else {
          for (const element of statement.exportClause.elements) {
            if (element.isTypeOnly) issue(info, "type-only export in JavaScript");
            const exported = element.name.text, imported = element.propertyName?.text ?? exported;
            if (statement.moduleSpecifier) {
              if (target) addExport(exported, { kind: "indirect", target, name: imported });
            } else pending.push({ exported, local: imported });
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        if (statement.isExportEquals) issue(info, "export equals is not JavaScript");
        else addExport("default", { kind: "local", name: "*default*" });
      } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
        if (ts.isVariableStatement(statement) && !isDefault) {
          for (const declaration of statement.declarationList.declarations) {
            for (const name of bindingNames(declaration.name)) addExport(name, { kind: "local", name });
          }
        } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
          const name = statement.name?.text;
          if (isDefault) addExport("default", { kind: "local", name: name ?? "*default*" });
          else if (name) addExport(name, { kind: "local", name });
          else issue(info, "unnamed non-default export");
        } else issue(info, "unsupported JavaScript export declaration");
      }
    }
    for (const { exported, local } of pending) {
      const binding = locals.get(local);
      if (binding) addExport(exported, binding);
      else issue(info, `export refers to an unresolved local binding: ${local}`);
    }
    inspect(info, file, false, locals);
  }

  function commonJsAccess(node: ts.Expression): { object: "exports" | "module.exports"; property: boolean; name?: string } | undefined {
    const property = (expression: ts.Expression): { base: ts.Expression; name?: string } | undefined => {
      if (ts.isPropertyAccessExpression(expression) && !expression.questionDotToken) return { base: expression.expression, name: expression.name.text };
      if (ts.isElementAccessExpression(expression) && !expression.questionDotToken) {
        const argument = expression.argumentExpression;
        return { base: expression.expression, name: ts.isStringLiteral(argument) || ts.isNumericLiteral(argument) ? argument.text : undefined };
      }
      return undefined;
    };
    const outer = property(node);
    if (!outer) return undefined;
    if (ts.isIdentifier(outer.base) && outer.base.text === "exports") return { object: "exports", property: true, name: outer.name };
    if (ts.isIdentifier(outer.base) && outer.base.text === "module" && outer.name === "exports") return { object: "module.exports", property: false };
    const inner = property(outer.base);
    if (inner && ts.isIdentifier(inner.base) && inner.base.text === "module" && inner.name === "exports") {
      return { object: "module.exports", property: true, name: outer.name };
    }
    return undefined;
  }

  function parseCommonJs(info: ModuleInfo, file: ts.SourceFile, depth: number): void {
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)
        || hasModifier(statement, ts.SyntaxKind.ExportKeyword)) issue(info, "ES module syntax in a CommonJS file");
      const expression = ts.isExpressionStatement(statement) ? statement.expression : undefined;
      const assignment = expression && ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.EqualsToken ? expression : undefined;
      const access = assignment ? commonJsAccess(assignment.left) : undefined;
      if (!assignment || !access) { inspect(info, statement, true); continue; }
      if (access.property && access.name !== undefined) {
        if (access.name === "__proto__") issue(info, "CommonJS __proto__ export is not statically safe");
        else info.commonJsSteps.push({ kind: "write", object: access.object, name: access.name });
        inspect(info, assignment.right, true);
      } else if (!access.property && access.object === "module.exports" && ts.isObjectLiteralExpression(assignment.right)) {
        const names: string[] = [];
        for (const property of assignment.right.properties) {
          const name = ts.isSpreadAssignment(property) ? undefined : stringName(property.name);
          if (name === undefined || name === "__proto__") issue(info, "dynamic or unsupported CommonJS object export");
          else names.push(name);
        }
        info.commonJsSteps.push({ kind: "replace", names });
        inspect(info, assignment.right, true);
      } else if (!access.property && access.object === "module.exports" && ts.isCallExpression(assignment.right)
        && ts.isIdentifier(assignment.right.expression) && assignment.right.expression.text === "require"
        && assignment.right.arguments.length === 1 && ts.isStringLiteral(assignment.right.arguments[0]!)) {
        const target = resolveRelative(info, assignment.right.arguments[0]!.text, depth);
        if (target) info.commonJsSteps.push({ kind: "reexport", target });
      } else {
        issue(info, "dynamic or unsupported CommonJS export assignment");
        inspect(info, assignment.right, true);
      }
    }
  }

  function load(path: string, depth: number): ModuleInfo {
    const existing = modules.get(path);
    if (existing) return existing;
    const info: ModuleInfo = { path, exports: new Map(), stars: [], dependencies: new Set(), imports: [], commonJsSteps: [], issues: new Set() };
    modules.set(path, info);
    if (modules.size > MAX_MODULES || depth > MAX_DEPTH) { issue(info, "runtime module graph exceeds analysis limit"); return info; }
    const bytes = body(info, path);
    if (!bytes) return info;
    info.format = formatFor(info);
    if (!info.format) return info;
    const source = text(info, bytes, path);
    if (source === undefined) return info;
    try {
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const parseDiagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
      for (const diagnostic of parseDiagnostics) issue(info, `JavaScript parse error TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
      if (info.format === "esm") parseEsm(info, file, depth);
      else parseCommonJs(info, file, depth);
    } catch (error) {
      issue(info, `JavaScript could not be analyzed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return info;
  }

  const analyze = (target: string, condition: string): RuntimeExportSurface => {
    const path = target.startsWith("./") ? target.slice(2) : target;
    const root = load(path, 0);
    const issues = new Set<string>();
    const reachable = new Set<string>();
    const visit = (info: ModuleInfo): void => {
      if (reachable.has(info.path)) return;
      reachable.add(info.path);
      for (const message of info.issues) issues.add(message);
      for (const dependency of info.dependencies) {
        const child = modules.get(dependency);
        if (child) visit(child);
        else issues.add(`${info.path}: unresolved dependency ${dependency}`);
      }
    };
    visit(root);
    let steps = 0;
    const spend = (): void => { if (++steps > MAX_RESOLUTION_STEPS) throw new Error("runtime export resolution exceeds analysis limit"); };
    const resolveExport = (path: string, name: string, seen: Set<string>): Resolution => {
      spend();
      const key = `${path}\0${name}`;
      if (seen.has(key)) return { kind: "missing" };
      if (seen.size > MAX_DEPTH) return { kind: "unknown" };
      const info = modules.get(path);
      if (!info || info.format !== "esm") return { kind: "unknown" };
      const nextSeen = new Set(seen).add(key);
      const binding = info.exports.get(name);
      if (binding?.kind === "local") return { kind: "binding", id: `${path}\0${binding.name}` };
      if (binding?.kind === "namespace") {
        const child = modules.get(binding.target);
        return child?.format === "esm" ? { kind: "binding", id: `${binding.target}\0*namespace*` } : { kind: "unknown" };
      }
      if (binding?.kind === "indirect") return resolveExport(binding.target, binding.name, nextSeen);
      if (name === "default") return { kind: "missing" };
      let result: Resolution = { kind: "missing" };
      for (const star of info.stars) {
        const found = resolveExport(star, name, nextSeen);
        if (found.kind === "unknown" || found.kind === "ambiguous") return found;
        if (found.kind === "binding") {
          if (result.kind === "binding" && result.id !== found.id) return { kind: "ambiguous" };
          result = found;
        }
      }
      return result;
    };
    const esmNames = (info: ModuleInfo): string[] => {
      const names = new Set<string>();
      const seen = new Set<string>();
      const collect = (current: ModuleInfo, star: boolean): void => {
        spend();
        if (seen.has(current.path)) return;
        seen.add(current.path);
        for (const name of current.exports.keys()) if (!star || name !== "default") names.add(name);
        for (const path of current.stars) {
          const child = modules.get(path);
          if (child) collect(child, true);
        }
      };
      collect(info, false);
      const result: string[] = [];
      for (const name of names) {
        const resolution = resolveExport(info.path, name, new Set());
        if (resolution.kind === "binding") result.push(name);
        else issues.add(`${info.path}: ${resolution.kind} runtime export ${JSON.stringify(name)}`);
      }
      for (const path of reachable) {
        const current = modules.get(path)!;
        if (current.format === "esm") {
          for (const star of current.stars) {
            if (modules.get(star)?.format !== "esm") issues.add(`${current.path}: star reexport target ${star} is not verifiable as an ES module`);
          }
          for (const [name, binding] of current.exports) {
            if (binding.kind === "local") continue;
            const resolution = resolveExport(current.path, name, new Set());
            if (resolution.kind !== "binding") issues.add(`${current.path}: ${resolution.kind} explicitly reexported runtime name ${JSON.stringify(name)}`);
          }
        }
        for (const imported of current.imports) {
          const resolution = resolveExport(imported.target, imported.name, new Set());
          if (resolution.kind !== "binding") issues.add(`${current.path}: ${resolution.kind} imported runtime name ${JSON.stringify(imported.name)} from ${imported.target}`);
        }
      }
      return result.sort();
    };
    const commonJsNames = (info: ModuleInfo, seen: Set<string>): string[] => {
      spend();
      if (seen.has(info.path)) { issues.add(`${info.path}: cyclic CommonJS reexport is not verified`); return []; }
      if (seen.size > MAX_DEPTH) { issues.add(`${info.path}: CommonJS reexport depth exceeds analysis limit`); return []; }
      if (info.format !== "commonjs") { issues.add(`${info.path}: CommonJS reexport target format is not verified`); return []; }
      let names = new Set<string>(), attached = true, reexported = false;
      const nextSeen = new Set(seen).add(info.path);
      for (const step of info.commonJsSteps) {
        if (step.kind === "write") {
          if (step.object === "exports" && !attached) issues.add(`${info.path}: detached exports alias is not verified`);
          if (reexported) issues.add(`${info.path}: mutation of a reexported CommonJS object is not verified`);
          names.add(step.name);
        } else if (step.kind === "replace") {
          names = new Set(step.names); attached = false; reexported = false;
        } else {
          const child = modules.get(step.target);
          names = new Set(child ? commonJsNames(child, nextSeen) : []);
          attached = false; reexported = true;
        }
      }
      return [...names].sort();
    };
    let names: string[] = [];
    try {
      if (root.format === "esm") names = esmNames(root);
      else if (root.format === "commonjs") {
        names = commonJsNames(root, new Set());
        if (!condition.split("/").includes("require")) issues.add(`${path}: CommonJS import/default interop is not verified`);
      }
    } catch (error) {
      issues.add(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { target, ...(root.format ? { format: root.format } : {}), names, verified: issues.size === 0, issues: [...issues].sort() };
  };
  return { analyze };
}
