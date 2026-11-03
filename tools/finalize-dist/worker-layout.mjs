import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";

function parseModule(file, source) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length > 0) throw new Error(`invalid worker module syntax: ${file}`);
  return parsed;
}

function isImportMetaUrl(node) {
  return ts.isPropertyAccessExpression(node) && node.name.text === "url" &&
    ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword && node.expression.name.text === "meta";
}

/** The nested static form is what Vite and similar bundlers recognize as a worker entry. */
export function hasBundlerSafeWorkerFactory(source) {
  const parsed = parseModule("workerFactory.ts", source);
  const factory = parsed.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "createWorkerRendererWorker" &&
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
  if (!factory?.body) return false;
  const statement = factory.body.statements.find(ts.isReturnStatement);
  const worker = statement?.expression;
  if (!worker || !ts.isNewExpression(worker) || !ts.isIdentifier(worker.expression) || worker.expression.text !== "Worker" || worker.arguments?.length !== 2) return false;
  const [url, options] = worker.arguments;
  if (!ts.isNewExpression(url) || !ts.isIdentifier(url.expression) || url.expression.text !== "URL" || url.arguments?.length !== 2 ||
      !ts.isStringLiteral(url.arguments[0]) || url.arguments[0].text !== "./render.worker.js" || !isImportMetaUrl(url.arguments[1])) return false;
  if (!ts.isObjectLiteralExpression(options) || options.properties.length !== 1) return false;
  const option = options.properties[0];
  return ts.isPropertyAssignment(option) && ts.isIdentifier(option.name) && option.name.text === "type" &&
    ts.isStringLiteral(option.initializer) && option.initializer.text === "module";
}

function relativeModuleImports(parsed) {
  const imports = [];
  function visit(node) {
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      specifier = node.arguments[0].text;
    }
    if (specifier?.startsWith("./") || specifier?.startsWith("../")) imports.push(specifier);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return imports;
}

function installsRuntime(parsed) {
  let localName;
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "./workerRuntime.js") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const installer = bindings.elements.find((element) => (element.propertyName ?? element.name).text === "installWorkerRenderer");
    if (installer) localName = installer.name.text;
  }
  if (!localName) return false;
  return parsed.statements.some((statement) => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === localName);
}

function containsPath(directory, file) {
  const path = relative(directory, file);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

/**
 * Verify the actual emitted module tree, including literal dynamic imports.
 * Bare imports are resolved by the consumer's package manager/bundler. A root
 * is admitted only when package.json#files includes it in the root tarball.
 */
export function assertWorkerPackageLayout({ entryFile, includedRoots }) {
  const entry = resolve(entryFile);
  const factoryFile = resolve(dirname(entry), "workerFactory.js");
  const roots = includedRoots.map((root) => resolve(root));
  const pending = [{ file: entry, worker: true }, { file: factoryFile, worker: false }];
  const visited = new Set();
  let factorySource;
  while (pending.length) {
    const { file, worker } = pending.pop();
    const key = `${worker ? "worker" : "host"}:${file}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (worker && file === factoryFile) throw new Error(`worker entry imports its host-only factory: ${file}`);
    if (!roots.some((root) => containsPath(root, file))) throw new Error(`worker dependency is outside packaged files: ${file}`);
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`missing worker module dependency: ${file}`);
    if (!/\.[cm]?js$/i.test(file)) continue;
    const source = readFileSync(file, "utf8");
    const parsed = parseModule(file, source);
    if (file === entry && !installsRuntime(parsed)) throw new Error(`worker entry does not install its runtime: ${file}`);
    if (file === factoryFile) factorySource = source;
    for (const specifier of relativeModuleImports(parsed)) pending.push({ file: resolve(dirname(file), specifier), worker });
  }
  if (!factorySource || !hasBundlerSafeWorkerFactory(factorySource)) {
    throw new Error("worker package lacks a static module-worker factory");
  }
}
