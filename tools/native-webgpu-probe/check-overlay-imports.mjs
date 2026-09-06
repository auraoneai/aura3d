import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import ts from 'typescript';

const [basePath, overlayPath, directory, outputPath] = process.argv.slice(2);
if (!basePath || !overlayPath || !directory || !outputPath) throw new Error('Usage: check-overlay-imports.mjs BASE_MANIFEST OVERLAY_MANIFEST OVERLAY_DIRECTORY OUTPUT_JSON');
const baseBytes = readFileSync(basePath), overlayBytes = readFileSync(overlayPath);
const base = JSON.parse(baseBytes), overlay = JSON.parse(overlayBytes);
const files = new Set([...base.files, ...overlay.files].map(file => file.path));
const resolutions = [], missing = [];
const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.d.ts'];
for (const file of overlay.files) {
  if (!/\.(?:[cm]?[jt]sx?|html)$/.test(file.path)) continue;
  const bytes = readFileSync(resolve(directory, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Overlay changed before dependency verification: ${file.path}`);
  const source = ts.createSourceFile(file.path, bytes.toString(), ts.ScriptTarget.Latest, true);
  const imports = new Set();
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) imports.add(node.moduleReference.expression.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) imports.add(node.argument.literal.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) imports.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  if (file.path.endsWith('.html')) {
    for (const match of bytes.toString().matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) imports.add(match[1]);
  } else visit(source);
  for (const specifier of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
    const path = specifier.split(/[?#]/, 1)[0];
    const target = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(file.path), path));
    const candidates = [target];
    const extension = posix.extname(target);
    if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
      const stem = target.slice(0, -extension.length);
      candidates.push(...['.ts', '.tsx', '.mts', '.cts', '.d.ts'].map(suffix => stem + suffix));
    }
    if (!extension) candidates.push(...extensions.map(suffix => target + suffix), ...extensions.map(suffix => target + '/index' + suffix));
    const resolved = candidates.find(candidate => files.has(candidate));
    const entry = { importer: file.path, specifier, ...(resolved ? { resolved } : { candidates }) };
    (resolved ? resolutions : missing).push(entry);
  }
}
const report = {
  schema: 'aura301-native-overlay-imports/v1',
  baseManifestSha256: createHash('sha256').update(baseBytes).digest('hex'),
  overlayManifestSha256: createHash('sha256').update(overlayBytes).digest('hex'),
  overlayFiles: overlay.files.length, resolvedImports: resolutions.length, resolutions, missing,
  passed: missing.length === 0,
};
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, overlayFiles: report.overlayFiles, resolvedImports: report.resolvedImports, missing }));
if (!report.passed) process.exitCode = 1;
