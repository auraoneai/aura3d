import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const packageRoot = join(root, "packages");
const rootDist = join(root, "dist");

const packageNames = readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const packageNameSet = new Set(packageNames);
const publicPackageNames = packageNames.filter((packageName) => {
  const manifestPath = join(packageRoot, packageName, "package.json");
  if (!existsSync(manifestPath)) return true;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { private?: boolean };
  return manifest.private !== true;
});

mkdirSync(rootDist, { recursive: true });

const rootIndexLines: string[] = [];
const rootTypeLines: string[] = [];

for (const packageName of packageNames) {
  const source = join(rootDist, "packages", packageName, "src");
  if (!existsSync(source)) {
    throw new Error(`Missing emitted source directory for ${packageName}: ${source}`);
  }

  const rootPackageDist = join(rootDist, packageName);
  const localPackageDist = join(packageRoot, packageName, "dist");
  rmSync(rootPackageDist, { recursive: true, force: true });
  rmSync(localPackageDist, { recursive: true, force: true });
  cpSync(source, rootPackageDist, { recursive: true });
  cpSync(source, localPackageDist, { recursive: true });
  rewriteJavaScriptSpecifiers(rootPackageDist, rootDist, true);
  rewriteJavaScriptSpecifiers(localPackageDist, localPackageDist, false);

  if (publicPackageNames.includes(packageName)) {
    rootIndexLines.push(`export * from "./${packageName}/index.js";`);
    rootTypeLines.push(`export * from "./${packageName}/index.js";`);
  } else {
    rmSync(rootPackageDist, { recursive: true, force: true });
  }
}

writeFileSync(join(rootDist, "index.js"), `${rootIndexLines.join("\n")}\n`);
writeFileSync(join(rootDist, "index.d.ts"), `${rootTypeLines.join("\n")}\n`);

console.log(`Finalized dist exports for ${packageNames.length} packages.`);

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkFiles(path, out);
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

function rewriteJavaScriptSpecifiers(dir: string, distRoot: string, rewriteWorkspacePackages: boolean): void {
  for (const file of walkFiles(dir)) {
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(
      /\b(from\s*["']|import\s*\(\s*["'])([^"']+)(["'])/g,
      (full, prefix: string, specifier: string, suffix: string) => {
        const nextSpecifier = rewriteSpecifier(file, distRoot, specifier, rewriteWorkspacePackages);
        return nextSpecifier === specifier ? full : `${prefix}${nextSpecifier}${suffix}`;
      }
    );
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
}

function rewriteSpecifier(file: string, distRoot: string, specifier: string, rewriteWorkspacePackages: boolean): string {
  const sourcePackageMatch = /(?:^|\/)([a-z0-9-]+)\/src\/index\.js$/i.exec(specifier);
  if (sourcePackageMatch && packageNameSet.has(sourcePackageMatch[1]!)) {
    if (!rewriteWorkspacePackages) return `@aura3d/${sourcePackageMatch[1]!}`;
    const target = join(distRoot, sourcePackageMatch[1]!, "index.js");
    let next = relative(dirname(file), target).replaceAll("\\", "/");
    if (!next.startsWith(".")) next = `./${next}`;
    return next;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (specifier.endsWith(".js") || specifier.endsWith(".json")) return specifier;
    const base = join(dirname(file), specifier);
    if (existsSync(`${base}.js`)) return `${specifier}.js`;
    if (existsSync(join(base, "index.js"))) return `${specifier}/index.js`;
    return specifier;
  }

  const match = /^@aura3d\/([^/]+)$/.exec(specifier);
  if (!rewriteWorkspacePackages || !match || !packageNameSet.has(match[1]!)) return specifier;
  const target = match[1] === "animation" && file.includes(`${distRoot}/assets/`)
    ? join(distRoot, "animation", "browser-index.js")
    : join(distRoot, match[1]!, "index.js");
  let next = relative(dirname(file), target).replaceAll("\\", "/");
  if (!next.startsWith(".")) next = `./${next}`;
  return next;
}
