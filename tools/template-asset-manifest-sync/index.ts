import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import ts from "typescript";
import { CREATE_AURA3D_TEMPLATES } from "../../packages/create-aura3d/src/index";

const root = resolve(import.meta.dirname, "..", "..");
const templateRoot = resolve(root, "packages/create-aura3d/templates");

for (const template of CREATE_AURA3D_TEMPLATES) {
  const directory = resolve(templateRoot, template);
  const manifestPath = resolve(directory, "aura.assets.json");
  const typegenPath = resolve(directory, "src/aura-assets.ts");

  if (existsSync(manifestPath)) {
    if (!existsSync(typegenPath)) throw new Error(`${template}: aura.assets.json exists without src/aura-assets.ts.`);
    console.log(`${template}: retained existing CLI manifest`);
    continue;
  }

  if (!existsSync(typegenPath)) {
    const packageName = template === "product-viewer"
      ? "@aura3d/lean/product"
      : template === "mini-game"
        ? "@aura3d/lean/game"
        : "@aura3d/engine";
    writeFileSync(typegenPath, `import { defineAuraAssets } from ${JSON.stringify(packageName)};\n\nexport const assets = defineAuraAssets({} as const);\n`);
  }

  const source = readFileSync(typegenPath, "utf8");
  const entries = readStaticAssetEntries(typegenPath, source);
  const assets = entries.map(([id, value]) => {
    if (!isRecord(value)) throw new Error(`${template}:${id} is not a static asset object.`);
    const url = requiredString(value.url, `${template}:${id}.url`);
    const outputPath = `public/${url.replace(/^\//u, "")}`;
    const filePath = resolve(directory, outputPath);
    if (!existsSync(filePath)) throw new Error(`${template}:${id} references missing ${outputPath}.`);
    const actualHash = `sha256-${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
    const declaredHash = requiredString(value.hash, `${template}:${id}.hash`);
    if (declaredHash !== actualHash) throw new Error(`${template}:${id} hash mismatch: ${declaredHash} != ${actualHash}.`);
    const metadata = isRecord(value.metadata) ? value.metadata : {};
    return {
      id,
      type: requiredString(value.type, `${template}:${id}.type`),
      format: requiredString(value.format, `${template}:${id}.format`),
      source: outputPath,
      outputPath,
      url,
      hash: actualHash,
      sizeBytes: statSync(filePath).size,
      ...(Array.isArray(value.bounds) ? { bounds: value.bounds } : {}),
      ...(Array.isArray(metadata.materials) ? { materials: metadata.materials } : {}),
      ...(Array.isArray(metadata.animations) ? { animations: metadata.animations } : {}),
      ...(Array.isArray(metadata.textures) ? { textures: metadata.textures } : {}),
      ...(typeof metadata.thumbnailUrl === "string" ? { thumbnailUrl: metadata.thumbnailUrl } : {}),
      ...(typeof metadata.license === "string" ? { license: metadata.license } : {}),
      ...(typeof metadata.author === "string" ? { author: metadata.author } : {}),
      ...(typeof metadata.sourcePage === "string" ? { sourcePage: metadata.sourcePage } : {})
    };
  });

  const manifest = {
    schema: "aura3d.assets/1.0",
    assetBasePath: "/aura-assets/",
    outputDir: "public/aura-assets",
    typegen: "src/aura-assets.ts",
    assets
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${template}: generated ${basename(manifestPath)} with ${assets.length} typed assets`);
}

function readStaticAssetEntries(path: string, source: string): readonly [string, unknown][] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "assets" || !declaration.initializer) continue;
      const initializer = unwrap(declaration.initializer);
      if (!ts.isCallExpression(initializer) || initializer.arguments.length === 0) continue;
      const argument = unwrap(initializer.arguments[0]!);
      if (!ts.isObjectLiteralExpression(argument)) continue;
      return argument.properties.flatMap((property): readonly [string, unknown][] => {
        if (!ts.isPropertyAssignment(property)) return [];
        const name = propertyName(property.name);
        return [[name, staticValue(property.initializer)]];
      });
    }
  }
  throw new Error(`${path}: could not find a static defineAuraAssets object.`);
}

function staticValue(node: ts.Expression): unknown {
  const value = unwrap(node);
  if (ts.isStringLiteralLike(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) {
    const number = Number(value.operand.text);
    return value.operator === ts.SyntaxKind.MinusToken ? -number : number;
  }
  if (ts.isArrayLiteralExpression(value)) return value.elements.map((entry) => staticValue(entry));
  if (ts.isObjectLiteralExpression(value)) {
    return Object.fromEntries(value.properties.flatMap((property): readonly [string, unknown][] => {
      if (!ts.isPropertyAssignment(property)) return [];
      return [[propertyName(property.name), staticValue(property.initializer)]];
    }));
  }
  throw new Error(`Unsupported generated asset expression: ${value.getText()}`);
}

function unwrap(node: ts.Expression): ts.Expression {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return unwrap(node.expression);
  return node;
}

function propertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  throw new Error(`Unsupported generated asset property name: ${name.getText()}`);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
