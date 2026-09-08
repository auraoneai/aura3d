import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/runtime-import-audit.json";
const roots = ["apps", "packages", "templates"] as const;
const allowed = [
  "packages/three-compat/",
  "packages/engine/src/production-runtime/",
  "apps/three-compat-threejs-migration-lab/",
  "apps/threejs-parity-lab/",
  "apps/example-parity-lab/"
] as const;
const files = roots.flatMap((root) => walk(root)).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
const runtimeThreeImports = files.filter((file) => {
  if (allowed.some((prefix) => file.startsWith(prefix))) return false;
  return importsThreeAtRuntime(file, readFileSync(file, "utf8"));
});
const issues = runtimeThreeImports.map((file) => reportIssue(`runtime-three-import:${file}`, `${file} imports Three.js at runtime.`, "blocker"));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-runtime-import-audit",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  scannedFiles: files.length,
  allowedPrefixes: allowed,
  runtimeThreeImports,
  issues
});
console.log(`Three.js parity runtime import audit written: ${outputPath}`);

function walk(root: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (path.includes("node_modules") || path.includes("/dist/")) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else entries.push(path);
  }
  return entries;
}

function importsThreeAtRuntime(path: string, source: string): boolean {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".jsx") ? ts.ScriptKind.JSX : path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === "three") {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)
        && node.arguments[0]!.text === "three") {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
