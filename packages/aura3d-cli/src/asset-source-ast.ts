import { extname } from "node:path";
import * as ts from "typescript";
import {
  isPrimaryRoleIdentifier,
  isPrimitiveConstructorName,
  isSupportingPrimitiveIdentifier,
} from "./asset-source-roles.js";
import type { AssetSourceTypedAssetUsage } from "./index.js";

export interface SourceAstScanReport {
  readonly typedAssetUsages: readonly Omit<AssetSourceTypedAssetUsage, "file" | "occurrences">[];
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

interface SourceTypedAssetReference {
  readonly assetId: string;
  readonly typedAsset: string;
}

export function scanAssetSourceAst(relativeFile: string, source: string): SourceAstScanReport {
  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true, scriptKindForSource(relativeFile));
  const typedAssetUsages: Omit<AssetSourceTypedAssetUsage, "file" | "occurrences">[] = [];
  const failures = new Set<string>();
  const warnings = new Set<string>();
  const typedAssetAliases = new Map<string, SourceTypedAssetReference>();

  const addTypedAssetUsage = (reference: SourceTypedAssetReference | undefined): void => {
    if (!reference) return;
    typedAssetUsages.push(reference);
  };

  const collectAliases = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        const reference = getDirectTypedAssetReference(node.initializer);
        if (reference) typedAssetAliases.set(node.name.text, reference);
      } else if (ts.isObjectBindingPattern(node.name) && isIdentifierNamed(unwrapExpression(node.initializer), "assets")) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const propertyName = element.propertyName ?? element.name;
          const assetId = getBindingPropertyName(propertyName);
          if (!assetId) continue;
          const reference = { assetId, typedAsset: `assets.${assetId}` };
          typedAssetAliases.set(element.name.text, reference);
          addTypedAssetUsage(reference);
        }
      }
    }
    ts.forEachChild(node, collectAliases);
  };

  const scan = (node: ts.Node): void => {
    if (isStringLiteralNode(node)) {
      const value = node.text;
      if (isRawModelUrlOrPath(value)) {
        failures.add(`raw GLB/glTF URL or path "${value}" found in source. Add it with assets add/resolve and use model(assets.x).`);
      }
    }

    if (ts.isImportDeclaration(node) && isStringLiteralNode(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (isForbiddenThreeImport(specifier)) {
        failures.add("direct three imports are not allowed in public examples. Use @aura3d/engine public APIs.");
      }
      if (isForbiddenRendererInternalImport(specifier)) {
        failures.add("renderer internals are not allowed in public examples. Use @aura3d/engine public APIs.");
      }
      if (node.importClause && importsName(node.importClause, "GLTFLoader")) {
        failures.add("GLTFLoader is not allowed in public examples. Use model(assets.x) from @aura3d/engine.");
      }
    }

    if (ts.isCallExpression(node)) {
      if (isRequireOfForbiddenThreeImport(node)) {
        failures.add("direct three imports are not allowed in public examples. Use @aura3d/engine public APIs.");
      }
      if (isRequireOfForbiddenRendererInternalImport(node)) {
        failures.add("renderer internals are not allowed in public examples. Use @aura3d/engine public APIs.");
      }
      if (isCallNamed(node, "model")) {
        const [firstArgument] = node.arguments;
        if (firstArgument && isStringLiteralNode(firstArgument)) {
          failures.add(`raw model string id "${firstArgument.text}" passed to model(). Use generated typed assets, for example model(assets.${sanitizeAssetId(firstArgument.text || "asset")}).`);
        }
      }
      if (isCallNamed(node, "unsafeModelUrl")) {
        failures.add("unsafeModelUrl is not allowed in public examples. Preserve typed asset safety with generated assets from ./src/aura-assets.");
      }
    }

    if (ts.isIdentifier(node)) {
      if (node.text === "unsafeModelUrl") {
        failures.add("unsafeModelUrl is not allowed in public examples. Preserve typed asset safety with generated assets from ./src/aura-assets.");
      }
      if (node.text === "GLTFLoader") {
        failures.add("GLTFLoader is not allowed in public examples. Use model(assets.x) from @aura3d/engine.");
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      addTypedAssetUsage(getDirectTypedAssetReference(node));
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const candidateName = node.name.text;
      if (
        isPrimaryRoleIdentifier(candidateName) &&
        !isSupportingPrimitiveIdentifier(candidateName) &&
        isPrimitivePrimaryInitializer(node.initializer, typedAssetAliases)
      ) {
        warnings.add(`primitive "${candidateName}" appears assigned to a primary-role object. Primary characters, vehicles, worlds, tracks, products, and weapons must use typed model(assets.x) assets or be marked abstract/prototype.`);
      }
    }

    ts.forEachChild(node, scan);
  };

  collectAliases(sourceFile);
  scan(sourceFile);

  return {
    typedAssetUsages,
    failures: [...failures].sort(),
    warnings: [...warnings].sort(),
  };
}

function scriptKindForSource(path: string): ts.ScriptKind {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isStringLiteralNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function getBindingPropertyName(name: ts.BindingName | ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function getDirectTypedAssetReference(expression: ts.Expression): SourceTypedAssetReference | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped) && isIdentifierNamed(unwrapExpression(unwrapped.expression), "assets")) {
    const assetId = unwrapped.name.text;
    return { assetId, typedAsset: `assets.${assetId}` };
  }
  if (ts.isElementAccessExpression(unwrapped) && isIdentifierNamed(unwrapExpression(unwrapped.expression), "assets")) {
    const argument = unwrapped.argumentExpression;
    if (argument && isStringLiteralNode(argument)) {
      const assetId = argument.text;
      return { assetId, typedAsset: `assets[${JSON.stringify(assetId)}]` };
    }
  }
  return undefined;
}

function isIdentifierNamed(expression: ts.Expression, name: string): boolean {
  return ts.isIdentifier(expression) && expression.text === name;
}

function isRawModelUrlOrPath(value: string): boolean {
  return /\.gl(?:b|tf)(?:$|[?#/\\])/i.test(value) || /\.gl(?:b|tf)\b/i.test(value);
}

function isForbiddenThreeImport(specifier: string): boolean {
  return specifier === "three" || specifier.startsWith("three/");
}

function isForbiddenRendererInternalImport(specifier: string): boolean {
  return [
    "@aura3d/rendering",
    "@aura3d/engine/rendering",
    "@aura3d/engine/production-runtime",
    "@aura3d/engine/advanced-runtime",
  ].some((forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`));
}

function importsName(importClause: ts.ImportClause, name: string): boolean {
  if (importClause.name?.text === name) return true;
  const bindings = importClause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return bindings.name.text === name;
  return bindings.elements.some((element) => (element.propertyName ?? element.name).text === name || element.name.text === name);
}

function isRequireOfForbiddenThreeImport(node: ts.CallExpression): boolean {
  const [specifier] = node.arguments;
  return isIdentifierNamed(unwrapExpression(node.expression), "require") &&
    specifier !== undefined &&
    isStringLiteralNode(specifier) &&
    isForbiddenThreeImport(specifier.text);
}

function isRequireOfForbiddenRendererInternalImport(node: ts.CallExpression): boolean {
  const [specifier] = node.arguments;
  return isIdentifierNamed(unwrapExpression(node.expression), "require") &&
    specifier !== undefined &&
    isStringLiteralNode(specifier) &&
    isForbiddenRendererInternalImport(specifier.text);
}

function isCallNamed(node: ts.CallExpression, name: string): boolean {
  const callee = unwrapExpression(node.expression);
  if (ts.isIdentifier(callee)) return callee.text === name;
  return ts.isPropertyAccessExpression(callee) && callee.name.text === name;
}

function isPrimitivePrimaryInitializer(expression: ts.Expression, typedAssetAliases: ReadonlyMap<string, SourceTypedAssetReference>): boolean {
  return isPrimitiveBuilderExpression(expression) && !containsTypedModelCall(expression, typedAssetAliases);
}

function isPrimitiveBuilderExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isCallExpression(unwrapped)) return false;
  const callee = unwrapExpression(unwrapped.expression);
  if (isPrimitiveConstructorCallee(callee)) return true;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "add") {
    const receiver = unwrapExpression(callee.expression);
    const receiverIsPrimitive = isPrimitiveBuilderExpression(receiver);
    const primitiveArgument = unwrapped.arguments.some((argument) => ts.isExpression(argument) && isPrimitiveBuilderExpression(argument));
    return receiverIsPrimitive || primitiveArgument;
  }
  return false;
}

function isPrimitiveConstructorCallee(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return isPrimitiveConstructorName(callee.text);
  return ts.isPropertyAccessExpression(callee) &&
    isIdentifierNamed(unwrapExpression(callee.expression), "primitives") &&
    isPrimitiveConstructorName(callee.name.text);
}

function containsTypedModelCall(expression: ts.Expression, typedAssetAliases: ReadonlyMap<string, SourceTypedAssetReference>): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && isCallNamed(node, "model")) {
      const [firstArgument] = node.arguments;
      if (firstArgument && isTypedAssetModelArgument(firstArgument, typedAssetAliases)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function isTypedAssetModelArgument(expression: ts.Expression, typedAssetAliases: ReadonlyMap<string, SourceTypedAssetReference>): boolean {
  const unwrapped = unwrapExpression(expression);
  if (getDirectTypedAssetReference(unwrapped)) return true;
  return ts.isIdentifier(unwrapped) && typedAssetAliases.has(unwrapped.text);
}

function sanitizeAssetId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}
