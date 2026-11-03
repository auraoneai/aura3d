import ts from "typescript";

/** The marketing build writes redirects after building public routes, so redirects take precedence. */
export interface MarketingRoutes {
  readonly publicRoutes: ReadonlySet<string>;
  readonly redirectedRoutes: ReadonlySet<string>;
}

/** A `const` array can still be mutated, making its declaration a false build signal. */
function rejectRouteListMutations(file: ts.SourceFile, names: ReadonlySet<string>): void {
  const mutators = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
  function isListTarget(node: ts.Expression): boolean {
    if (ts.isIdentifier(node)) return names.has(node.text);
    if (ts.isParenthesizedExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return isListTarget(node.expression);
    }
    return false;
  }
  function rejectMutations(node: ts.Node): void {
    if (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        isListTarget(node.left)) throw new Error("marketing route lists must not be mutated");
    if (ts.isDeleteExpression(node) && isListTarget(node.expression)) throw new Error("marketing route lists must not be mutated");
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) &&
        isListTarget(node.operand)) throw new Error("marketing route lists must not be mutated");
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && isListTarget(callee.expression) && mutators.has(callee.name.text)) {
        throw new Error("marketing route lists must not be mutated");
      }
      if (ts.isElementAccessExpression(callee) && isListTarget(callee.expression)) {
        throw new Error("marketing route lists must not use computed method calls");
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) &&
          ["Object", "Reflect"].includes(callee.expression.text) &&
          ["assign", "defineProperty", "defineProperties", "set", "deleteProperty", "setPrototypeOf"].includes(callee.name.text) &&
          node.arguments[0] && isListTarget(node.arguments[0])) {
        throw new Error("marketing route lists must not be mutated");
      }
    }
    ts.forEachChild(node, rejectMutations);
  }
  rejectMutations(file);
}

/**
 * Read the route declarations as syntax, never by importing the marketing build (which runs on
 * import). Only static arrays and the public list's known spreads are supported; an unrecognised
 * or missing declaration must stop classification rather than imply that a gate is public.
 */
export function parseMarketingRoutes(source: string): MarketingRoutes {
  const file = ts.createSourceFile("build-showcase-routes.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  // TypeScript keeps parser diagnostics on the source file, although its public type omits them.
  const diagnostics = (file as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (!diagnostics || diagnostics.length > 0) {
    throw new Error("marketing showcase route source has invalid syntax");
  }

  const names = ["showcaseRoutes", "evidenceRoutes", "retiredPrototypeRoutes", "publicRoutes"] as const;
  const required = new Set<string>(names);
  const declarations = new Map<string, ts.ArrayLiteralExpression>();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !required.has(declaration.name.text)) continue;
      const name = declaration.name.text;
      if (declarations.has(name)) throw new Error(`duplicate marketing route list: ${name}`);
      if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer ||
          !ts.isArrayLiteralExpression(declaration.initializer)) {
        throw new Error(`marketing route list ${name} must be a const array`);
      }
      declarations.set(name, declaration.initializer);
    }
  }
  for (const name of names) {
    if (!declarations.has(name)) throw new Error(`missing marketing route list: ${name}`);
  }

  rejectRouteListMutations(file, required);

  function routeId(element: ts.Expression, name: string): string {
    if (!ts.isStringLiteral(element) || !/^[a-z0-9][a-z0-9-]*$/.test(element.text)) {
      throw new Error(`marketing route list ${name} must contain only static route ids`);
    }
    return element.text;
  }

  function literalList(name: string): readonly string[] {
    const ids = declarations.get(name)!.elements.map((element) => routeId(element, name));
    if (new Set(ids).size !== ids.length) throw new Error(`duplicate route id in marketing route list ${name}`);
    return ids;
  }

  const showcase = literalList("showcaseRoutes");
  const evidence = literalList("evidenceRoutes");
  const redirectedRoutes = new Set(literalList("retiredPrototypeRoutes"));
  const publicRoutes = new Set<string>();
  function addPublic(id: string): void {
    if (publicRoutes.has(id)) throw new Error(`duplicate route id in marketing route list publicRoutes: ${id}`);
    publicRoutes.add(id);
  }
  const publicList = declarations.get("publicRoutes")!;
  for (const element of publicList.elements) {
    if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
      const spread = element.expression.text;
      if (spread === "showcaseRoutes" || spread === "evidenceRoutes") {
        if (declarations.get(spread)!.pos > publicList.pos) {
          throw new Error(`marketing route list publicRoutes references ${spread} before its declaration`);
        }
        for (const id of spread === "showcaseRoutes" ? showcase : evidence) addPublic(id);
        continue;
      }
    }
    addPublic(routeId(element, "publicRoutes"));
  }
  return { publicRoutes, redirectedRoutes };
}

/**
 * Read the alias-related reserved routes and verify the build is wired to the pure catalog plan.
 * This is a source contract, not evidence that a build or deployment has run.
 */
export function parseAliasBuildContract(source: string): ReadonlySet<string> {
  const marketing = parseMarketingRoutes(source);
  const file = ts.createSourceFile("build-showcase-routes.mjs", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const wanted = new Set(["retiredPrototypeRoutes", "supersededPublicRoutes", "reservedAliasRoutes"]);
  const arrays = new Map<string, ts.ArrayLiteralExpression>();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !wanted.has(declaration.name.text)) continue;
      const name = declaration.name.text;
      if (arrays.has(name)) throw new Error(`duplicate marketing alias route list: ${name}`);
      if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer ||
          !ts.isArrayLiteralExpression(declaration.initializer)) {
        throw new Error(`marketing alias route list ${name} must be a const array`);
      }
      arrays.set(name, declaration.initializer);
    }
  }
  for (const name of wanted) {
    if (!arrays.has(name)) throw new Error(`missing marketing alias route list: ${name}`);
  }
  rejectRouteListMutations(file, wanted);

  function literal(name: string): readonly string[] {
    const ids = arrays.get(name)!.elements.map((element) => {
      if (!ts.isStringLiteral(element) || !/^[a-z0-9][a-z0-9-]*$/.test(element.text)) {
        throw new Error(`marketing alias route list ${name} must contain only static route ids`);
      }
      return element.text;
    });
    if (new Set(ids).size !== ids.length) throw new Error(`duplicate route id in marketing alias route list ${name}`);
    return ids;
  }
  const retired = literal("retiredPrototypeRoutes");
  const superseded = literal("supersededPublicRoutes");
  const reservedList = arrays.get("reservedAliasRoutes")!;
  const reserved = new Set<string>();
  function add(id: string): void {
    if (reserved.has(id)) throw new Error(`duplicate route id in marketing alias route list reservedAliasRoutes: ${id}`);
    reserved.add(id);
  }
  for (const element of reservedList.elements) {
    if (ts.isStringLiteral(element) && /^[a-z0-9][a-z0-9-]*$/.test(element.text)) {
      add(element.text);
    } else if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression) &&
               (element.expression.text === "retiredPrototypeRoutes" || element.expression.text === "supersededPublicRoutes")) {
      const name = element.expression.text;
      if (arrays.get(name)!.pos > reservedList.pos) throw new Error(`reservedAliasRoutes references ${name} before its declaration`);
      for (const id of name === "retiredPrototypeRoutes" ? retired : superseded) add(id);
    } else {
      throw new Error("marketing alias route list reservedAliasRoutes must use static ids and known spreads");
    }
  }
  if ([...marketing.redirectedRoutes, ...superseded].some((id) => !reserved.has(id))) {
    throw new Error("marketing alias reserved routes must include retired and superseded routes");
  }

  const imported = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== "../../tools/site/route-aliases.mjs") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.propertyName) imported.add(element.name.text);
      }
    }
  }
  if (!imported.has("catalogRouteAliases") || !imported.has("planAliasRedirects")) {
    throw new Error("marketing build is missing the catalog alias planning helper import");
  }

  function functionBody(name: string): ts.Block {
    const functions = file.statements.filter((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name
    );
    if (functions.length !== 1 || !functions[0]!.body) throw new Error(`marketing build is missing ${name}`);
    return functions[0]!.body!;
  }
  function calls(root: ts.Node, name: string): ts.CallExpression[] {
    const result: ts.CallExpression[] = [];
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) result.push(node);
      ts.forEachChild(node, visit);
    }
    visit(root);
    return result;
  }
  function initializers(root: ts.Node, name: string): ts.Expression[] {
    const result: ts.Expression[] = [];
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        result.push(node.initializer);
      }
      ts.forEachChild(node, visit);
    }
    visit(root);
    return result;
  }
  const identifiers = (nodes: ts.NodeArray<ts.Expression>, names: readonly string[]): boolean =>
    nodes.length === names.length && names.every((name, i) => ts.isIdentifier(nodes[i]!) && (nodes[i] as ts.Identifier).text === name);
  const builder = functionBody("buildCatalogRouteAliases");
  const aliasCalls = calls(builder, "catalogRouteAliases");
  const redirectCalls = calls(builder, "planAliasRedirects");
  if (!initializers(builder, "aliases").some((node) => aliasCalls.includes(node as ts.CallExpression) &&
        identifiers((node as ts.CallExpression).arguments, ["catalog", "routes", "reservedRoutes"])) ||
      !initializers(builder, "plan").some((node) => redirectCalls.includes(node as ts.CallExpression) &&
        identifiers((node as ts.CallExpression).arguments, ["aliases", "entriesByApp", "existingRedirects"]))) {
    throw new Error("marketing alias builder does not use the catalog and redirect plans");
  }

  function isJoin(expression: ts.Expression, parts: readonly string[]): boolean {
    return ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "path" &&
      expression.expression.name.text === "join" && expression.arguments.length === parts.length &&
      parts.every((part, i) => expression.arguments[i]!.getText(file).replace(/^["']|["']$/g, "") === part);
  }
  let aliasDirectory = false;
  function visitDirectory(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "targetDir" &&
        node.initializer && isJoin(node.initializer, ["outputApps", "alias.slug"])) aliasDirectory = true;
    ts.forEachChild(node, visitDirectory);
  }
  visitDirectory(builder);
  const copiesAliasHtml = calls(builder, "copyFileSync").some((call) =>
    call.arguments.length === 2 &&
    isJoin(call.arguments[0]!, ["outputApps", "alias.appFolder", "index.html"]) &&
    isJoin(call.arguments[1]!, ["targetDir", "index.html"])
  );
  const writesAliasRules = calls(builder, "writeFileSync").some((call) =>
    call.arguments.length >= 2 && call.arguments[0]!.getText(file) === "redirectsPath" &&
    call.arguments[1]!.getText(file) === "plan.text"
  );
  if (!aliasDirectory || !copiesAliasHtml || !writesAliasRules) {
    throw new Error("marketing alias builder does not copy canonical HTML and write scoped alias rules");
  }

  const main = functionBody("main");
  const readsCatalog = initializers(main, "catalog").some((node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "readJson" &&
    node.arguments.length === 1 && isJoin(node.arguments[0]!, ["repoRoot", "tools", "site", "games.catalog.json"])
  );
  if (!readsCatalog) throw new Error("marketing build is missing the canonical site games catalog input");
  const expected = new Map([
    ["catalog", "catalog"], ["routes", "publicRoutes"], ["reservedRoutes", "reservedAliasRoutes"],
    ["rootDir", "repoRoot"], ["outDir", "distDir"]
  ]);
  const build = calls(main, "buildCatalogRouteAliases").find((call) => {
    const object = call.arguments[0];
    if (call.arguments.length !== 1 || !object || !ts.isObjectLiteralExpression(object)) return false;
    const fields = new Map<string, string>();
    for (const property of object.properties) {
      if (ts.isShorthandPropertyAssignment(property)) fields.set(property.name.text, property.name.text);
      else if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isIdentifier(property.initializer)) {
        fields.set(property.name.text, property.initializer.text);
      } else return false;
    }
    return fields.size === expected.size && [...expected].every(([key, value]) => fields.get(key) === value);
  });
  if (!build || !calls(main, "assertBuiltRoutes").some((call) => call.pos < build.pos)) {
    throw new Error("marketing build is missing the configured post-build catalog alias step");
  }
  return reserved;
}
