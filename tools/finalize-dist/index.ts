import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const root = process.cwd();
const packageRoot = join(root, "packages");
const rootDist = join(root, "dist");

const packageNames = readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  // A src-less directory is not a package (e.g. the QR-15 `packages/editor`
  // stub whose contents were deleted in T6.1-T6.11) — it has nothing to emit
  // or copy, so it must not fail the dist layout.
  .filter((name) => existsSync(join(packageRoot, name, "src")))
  .sort();
const packageNameSet = new Set(packageNames);
// `game` ships inside the root tarball: `@aura3d/game` stays private while the
// published surface exposes the same runtime as `@aura3d/engine/game` (PRD-09
// createGame is the route API the create-aura3d templates consume).
const rootPackageSurfacePackages = new Set(["engine", "game"]);
// Published names whose dist directory differs from the package dir name.
// `@aura3d/engine-runtime` is the workspace name of packages/engine; imports
// resolve through the workspace manifest while the dist tree keys on dirs.
const packageNameAliases: Record<string, string> = { "engine-runtime": "engine" };
const publicPackageNames = packageNames.filter((packageName) => {
  const manifestPath = join(packageRoot, packageName, "package.json");
  if (!existsSync(manifestPath)) return true;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { private?: boolean };
  return manifest.private !== true;
});

mkdirSync(rootDist, { recursive: true });

// Q-12-5 bridge: `.github/workflows/build.yml` (lane-12-owned) still asserts
// `dist/index.{js,d.ts}` exist. Keep emitting the root aggregate as a
// build-only artifact — it is NOT listed in package.json#files (T1.7 removed
// it), so nothing publishes it — until the workflow assertion is deleted.
const rootIndexLines: string[] = [];
const rootTypeLines: string[] = [];

for (const packageName of packageNames) {
  const source = join(rootDist, "packages", packageName, "src");
  const packageSource = join(packageRoot, packageName, "src");
  if (!existsSync(source)) {
    throw new Error(`Missing emitted source directory for ${packageName}: ${source}`);
  }

  const rootPackageDist = join(rootDist, packageName);
  const localPackageDist = join(packageRoot, packageName, "dist");
  rmSync(rootPackageDist, { recursive: true, force: true });
  rmSync(localPackageDist, { recursive: true, force: true });
  cpSync(source, rootPackageDist, { recursive: true });
  cpSync(source, localPackageDist, { recursive: true });
  copyStaticRuntimeAssets(packageSource, rootPackageDist);
  copyStaticRuntimeAssets(packageSource, localPackageDist);
  rewriteJavaScriptSpecifiers(localPackageDist, localPackageDist, false);

  if (publicPackageNames.includes(packageName)) {
    rootIndexLines.push(`export * from "./${packageName}/index.js";`);
    rootTypeLines.push(`export * from "./${packageName}/index.js";`);
  } else if (!rootPackageSurfacePackages.has(packageName)) {
    rmSync(rootPackageDist, { recursive: true, force: true });
  }
}

// Root-package rewrites must run only after every workspace package has been
// copied. Otherwise a clean build processes `engine` before `lean`, cannot see
// the eventual target, and leaves an external workspace import in the root
// compatibility bundle. A warm local dist masked that ordering defect.
for (const packageName of packageNames) {
  const rootPackageDist = join(rootDist, packageName);
  if (existsSync(rootPackageDist)) {
    rewriteJavaScriptSpecifiers(rootPackageDist, rootDist, true);
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
    else if (path.endsWith(".js") || path.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function copyStaticRuntimeAssets(sourceDir: string, targetDir: string): void {
  if (!existsSync(sourceDir)) return;
  for (const file of walkStaticRuntimeAssets(sourceDir)) {
    const target = join(targetDir, relative(sourceDir, file));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file, target);
  }
}

function walkStaticRuntimeAssets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkStaticRuntimeAssets(path, out);
    else if (/\.(bin|css|glb|gltf|hdr|jpg|jpeg|ktx2|png|svg|webp)$/i.test(path)) out.push(path);
  }
  return out;
}

function rewriteJavaScriptSpecifiers(dir: string, distRoot: string, rewriteWorkspacePackages: boolean): void {
  for (const file of walkFiles(dir)) {
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(
      /\b(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"']+)(["'])/g,
      (full, prefix: string, specifier: string, suffix: string) => {
        const nextSpecifier = rewriteSpecifier(file, distRoot, specifier, rewriteWorkspacePackages);
        return nextSpecifier === specifier ? full : `${prefix}${nextSpecifier}${suffix}`;
      }
    );
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
}

function rewriteSpecifier(file: string, distRoot: string, specifier: string, rewriteWorkspacePackages: boolean): string {
  // `@aura3d/navigation-recast` internalizes like every other workspace
  // package: its adapter ships inside the root dist (the heavy
  // `recast-navigation` engine behind it stays a lazy consumer-side import
  // with a fail-closed error). A bare-specifier carve-out here would leak an
  // undeclared import into the packed tarball that the install smoke forbids.
  const sourcePackageMatch = /(?:^|\/)([a-z0-9-]+)\/src\/index\.js$/i.exec(specifier);
  if (sourcePackageMatch && packageNameSet.has(sourcePackageMatch[1]!)) {
    if (!rewriteWorkspacePackages) return `@aura3d/${sourcePackageMatch[1]!}`;
    const target = join(distRoot, sourcePackageMatch[1]!, "index.js");
    let next = relative(dirname(file), target).replaceAll("\\", "/");
    if (!next.startsWith(".")) next = `./${next}`;
    return next;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    // Cross-package relative imports (e.g. `../../../rendering/src/LightUniforms.js`
    // inside emitted engine code) resolve to a sibling package's SOURCE tree —
    // legal in-repo, dead inside the packed tarball. Rewrite onto the sibling's
    // emitted mirror: `dist/<pkg>/...` for the root bundle pass,
    // `packages/<pkg>/dist/...` for the local package-dist pass.
    const resolved = join(dirname(file), specifier);
    const crossMatch = /(?:^|\/)([a-z0-9-]+)\/src\/(.+)$/i.exec(resolved);
    // Only when the specifier leaves the file's own package: for the root pass
    // that's `dist/<pkg>/`; for the local pass, `packages/<pkg>/dist`.
    const emittingPackage = rewriteWorkspacePackages
      ? relative(distRoot, file).split(/[\\/]/)[0]
      : basename(dirname(distRoot));
    if (crossMatch && packageNameSet.has(crossMatch[1]!) && crossMatch[1] !== emittingPackage) {
      const crossPackage = crossMatch[1]!;
      const rest = crossMatch[2]!;
      const targetBase = rewriteWorkspacePackages
        ? join(distRoot, crossPackage, rest)
        : join(packageRoot, crossPackage, "dist", rest);
      const target = existsSync(targetBase)
        ? targetBase
        : existsSync(`${targetBase}.js`)
          ? `${targetBase}.js`
          : existsSync(join(targetBase, "index.js"))
            ? join(targetBase, "index.js")
            : targetBase;
      let next = relative(dirname(file), target).replaceAll("\\", "/");
      if (!next.startsWith(".")) next = `./${next}`;
      return next;
    }
    if (specifier.endsWith(".js") || specifier.endsWith(".json")) return specifier;
    const base = join(dirname(file), specifier);
    if (existsSync(`${base}.js`)) return `${specifier}.js`;
    if (existsSync(join(base, "index.js"))) return `${specifier}/index.js`;
    return specifier;
  }

  const subpathMatch = /^@aura3d\/([^/]+)\/(.+)$/.exec(specifier);
  if (subpathMatch) subpathMatch[1] = packageNameAliases[subpathMatch[1]!] ?? subpathMatch[1]!;
  if (rewriteWorkspacePackages && subpathMatch && packageNameSet.has(subpathMatch[1]!)) {
    const packageName = subpathMatch[1]!;
    const subpath = subpathMatch[2]!;
    const target = subpath === "browser"
      ? join(distRoot, packageName, "browser-index.js")
      : resolveWorkspaceSubpathTarget(distRoot, packageName, subpath);
    if (!target) return specifier;
    let next = relative(dirname(file), target).replaceAll("\\", "/");
    if (!next.startsWith(".")) next = `./${next}`;
    return next;
  }

  const match = /^@aura3d\/([^/]+)$/.exec(specifier);
  if (match) match[1] = packageNameAliases[match[1]!] ?? match[1]!;
  if (!rewriteWorkspacePackages || !match || !packageNameSet.has(match[1]!)) return specifier;
  const target = match[1] === "animation" && file.includes(`${distRoot}/assets/`)
    ? join(distRoot, "animation", "browser-index.js")
    : join(distRoot, match[1]!, "index.js");
  let next = relative(dirname(file), target).replaceAll("\\", "/");
  if (!next.startsWith(".")) next = `./${next}`;
  return next;
}

function resolveWorkspaceSubpathTarget(distRoot: string, packageName: string, subpath: string): string | null {
  const manifestPath = join(packageRoot, packageName, "package.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly exports?: Record<string, string | { readonly import?: string }>;
    };
    const exported = manifest.exports?.[`./${subpath}`];
    const importTarget = typeof exported === "string" ? exported : exported?.import;
    if (importTarget?.startsWith("./dist/")) {
      const target = join(distRoot, packageName, importTarget.slice("./dist/".length));
      if (existsSync(target)) return target;
    }
  }
  const direct = join(distRoot, packageName, `${subpath}.js`);
  if (existsSync(direct)) return direct;
  const index = join(distRoot, packageName, subpath, "index.js");
  if (existsSync(index)) return index;
  return null;
}
