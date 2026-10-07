import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface ExportEntry {
  readonly types?: string;
  readonly import?: string;
}

const packageJson = JSON.parse(readFileSync(resolve("packages/three-compat/package.json"), "utf8")) as {
  readonly exports: Record<string, ExportEntry | string>;
};

// `./postprocessing` was required here until WS-3.4 removed the stub tree behind it.
//
// Two defects made this gate unable to notice that removal:
//
//   1. It iterated a hardcoded `requiredSubpaths` list, so a subpath declared in package.json but absent from
//      that list was never examined at all. Re-adding `./postprocessing` to `exports` passed this gate.
//   2. It never resolved anything. It read the keys, wrote an import line to disk, and exited zero, so a
//      subpath resolving to nothing was indistinguishable from one that worked.
//
// It now enumerates *every declared* export subpath and resolves each one, so the set under test is the set
// the package actually publishes rather than a list that has to be maintained by hand.
//
// Resolution targets are the built `dist/` paths a real external consumer would load. `dist/` is gitignored
// build output, so this gate requires a current build; a stale tree is itself a failure worth surfacing,
// because it means the published surface and the source no longer agree.
const requiredSubpaths = [".", "./controls", "./loaders"];
const packageRoot = resolve("packages/three-compat");
const declaredSubpaths = Object.keys(packageJson.exports);

const resolveTarget = (entry: ExportEntry | string | undefined): string | undefined => {
  if (entry === undefined) {
    return undefined;
  }
  return typeof entry === "string" ? entry : entry.import;
};

// A subpath in `exports` whose source tree was deleted. Checked across every declared subpath, not just the
// required ones, so removing a tree without removing its export is caught here.
const sourceTreeFor = (subpath: string): string =>
  subpath === "." ? "src/index.ts" : `src/${subpath.slice(2)}/index.ts`;

const missingSubpaths = requiredSubpaths.filter((subpath) => resolveTarget(packageJson.exports[subpath]) === undefined);

const undeclaredTargets = declaredSubpaths.filter((subpath) => resolveTarget(packageJson.exports[subpath]) === undefined);

const unresolvedTargets = declaredSubpaths
  .map((subpath) => ({ subpath, target: resolveTarget(packageJson.exports[subpath]) }))
  .filter((entry): entry is { subpath: string; target: string } => entry.target !== undefined)
  .filter((entry) => !existsSync(resolve(packageRoot, entry.target)))
  .map((entry) => `${entry.subpath} -> ${entry.target}`);

const danglingSourceTrees = declaredSubpaths
  .filter((subpath) => !existsSync(resolve(packageRoot, sourceTreeFor(subpath))))
  .map((subpath) => `${subpath} -> ${sourceTreeFor(subpath)}`);

// The consumer imports every declared subpath, so the emitted artifact reflects the whole published surface.
const consumerSource = declaredSubpaths.map((subpath) => {
  const importPath = subpath === "." ? "@aura3d/three-compat" : `@aura3d/three-compat/${subpath.slice(2)}`;
  return `import "${importPath}";`;
}).join("\n");
const monorepoInternalImports = /\.\.\/|packages\//.test(consumerSource);

const report = {
  schema: "a3d-three-compat-external-consumer",
  generatedAt: new Date().toISOString(),
  pass: missingSubpaths.length === 0
    && undeclaredTargets.length === 0
    && unresolvedTargets.length === 0
    && danglingSourceTrees.length === 0
    && !monorepoInternalImports,
  requiredSubpaths,
  declaredSubpaths,
  missingSubpaths,
  undeclaredTargets,
  unresolvedTargets,
  danglingSourceTrees,
  consumerSource,
  monorepoInternalImports
};
const sourcePath = resolve("tests/reports/three-compat-external-consumer/consumer.ts");
mkdirSync(dirname(sourcePath), { recursive: true });
writeFileSync(sourcePath, `${consumerSource}\n`);
const reportPath = resolve("tests/reports/three-compat-external-consumer.json");
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(
  `Three.js compatibility external consumer passed: ${declaredSubpaths.length} declared package subpaths, all resolved.`
);
