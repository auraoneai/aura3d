/**
 * §B.3 — negative complexity. Deletion is a success metric.
 *
 * 1.6 must shrink. A phase that only adds code has not done this document's job, so every metric
 * below is compared against a committed baseline measured at `be86c73e` and reported as a delta.
 *
 * The honest complication, stated rather than hidden: adding Rapier in P4 **adds** a dependency while
 * removing far more code. That trade is explicitly acceptable under §B.3 — what is not acceptable is
 * quietly counting the removal and not the addition.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const REPORT_PATH = "tests/reports/negative-complexity.json";

/**
 * Baseline, per PRD §B.3 — with one number corrected and the correction recorded.
 *
 * The PRD states 212,810 `packages/*\/src` lines at `be86c73e`. That number is **not reproducible by
 * any consistent definition**, and it matters because §B.3 makes it a release condition: a baseline
 * nobody can re-derive is a baseline that silently grants or denies a release.
 *
 * Re-measured at `be86c73e` from tracked files:
 *
 *   packages/<pkg>/src/**\/*.{ts,tsx}                     200,929   <- this definition
 *   ... plus packages/create-aura3d/templates/*\/src        215,099
 *
 * The difference is 14,170 lines of **scaffold templates** — code shipped for developers to copy, not
 * engine source. Counting them would mean a template edit registers as engine growth, so they are
 * excluded and counted separately.
 *
 * 212,810 sits between the two, so it was likely produced by a third glob. Rather than reverse-engineer
 * it, the baseline is restated with its definition attached, and the original is retained so the
 * substitution is visible rather than silent. Verified: both definitions are IDENTICAL at `be86c73e`
 * and at HEAD, which independently confirms P1 has deleted no package source — as expected, since P1
 * is measurement integrity and adds tooling.
 */
const BASELINE = {
  commit: "be86c73e",
  packageSourceLines: 200_929,
  packageSourceLinesDefinition: "tracked packages/<pkg>/src/**/*.{ts,tsx}, excluding packages/create-aura3d/templates/*/src (scaffold code shipped for copying, 14,170 lines, counted separately)",
  packageSourceLinesAsWrittenInPrd: 212_810,
  packageSourceLinesCorrectionReason: "The PRD figure is not reproducible: the same tracked-file measurement at be86c73e gives 200,929 excluding scaffold templates or 215,099 including them. 212,810 matches neither, so the definition is restated rather than the number trusted.",
  templateScaffoldLines: 14_170,
  packages: 27,
  rootExportSubpaths: 39,
  externalRuntimeDependencies: 3,
  engineBarrelExports: 361,
  duplicateOwnershipViolations: 5,
  routes: 149
} as const;

/**
 * Count tracked source only, via `git ls-files`.
 *
 * An on-disk walk was the first implementation and it was wrong: it found 942 files where git tracks
 * 1,031, and reported a **9,000-line reduction that had not happened**. The difference is
 * gitignored and generated content that varies by machine and by whatever last ran. A metric that
 * moves when a build artifact appears cannot be a release condition, and a false reduction is exactly
 * the kind of flattering number this PRD exists to eliminate.
 */
function countPackageSourceLines(): { readonly engine: number; readonly templates: number } {
  const tracked = execFileSync("git", ["ls-files", "packages"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    /*
     * Note the nested-template case. `templates/animation-studio/studio/src/**` exists, so a
     * `templates/<name>/src/` pattern misses 16 files and under-reports the scaffold total by 3,222
     * lines. Any `src/` segment under `templates/` counts as scaffold.
     */
    .filter((path) => /^packages\/[a-z0-9-]+\/src\/.*\.(ts|tsx)$/.test(path) || /^packages\/create-aura3d\/templates\/.*\/src\/.*\.(ts|tsx)$/.test(path));
  let engine = 0;
  let templates = 0;
  for (const path of tracked) {
    let lines = 0;
    try {
      /*
       * Newline count, matching `wc -l`, not `split("\n").length`.
       *
       * The split form counts one extra line per file for the trailing newline. Across 942 files that
       * is a **942-line phantom delta** — and it appeared as growth against a baseline measured with
       * `wc -l`, which is precisely the kind of number that gets explained away rather than fixed.
       */
      lines = countNewlines(readFileSync(join(repoRoot, path), "utf8"));
    } catch {
      continue;
    }
    if (path.startsWith("packages/create-aura3d/templates/")) templates += lines;
    else engine += lines;
  }
  return { engine, templates };
}

/** `wc -l` semantics: the number of newline characters. */
function countNewlines(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

function countPackages(): number {
  return readdirSync(join(repoRoot, "packages")).filter((entry) => existsSync(join(repoRoot, "packages", entry, "package.json"))).length;
}

function rootPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;
}

function countRootExportSubpaths(): number {
  const exports = rootPackageJson().exports;
  return exports && typeof exports === "object" ? Object.keys(exports).length : 0;
}

/**
 * Runtime dependencies that ship to a consumer, excluding workspace-internal ones.
 *
 * Measured from the root manifest's `dependencies`, which is what an installer resolves.
 */
function countExternalRuntimeDependencies(): { readonly count: number; readonly names: readonly string[] } {
  const dependencies = rootPackageJson().dependencies;
  const names = dependencies && typeof dependencies === "object"
    ? Object.keys(dependencies).filter((name) => !name.startsWith("@aura3d/"))
    : [];
  return { count: names.length, names };
}

function countEngineBarrelExports(): number {
  const path = join(repoRoot, "packages/engine/src/agent-api/index.ts");
  if (!existsSync(path)) return 0;
  return (readFileSync(path, "utf8").match(/^export /gm) ?? []).length;
}

function countRoutes(): number {
  let total = 0;
  for (const root of ["apps", "examples"]) {
    const directory = join(repoRoot, root);
    if (!existsSync(directory)) continue;
    total += readdirSync(directory).filter((entry) => statSync(join(directory, entry)).isDirectory()).length;
  }
  return total;
}

/**
 * R12 duplicate-ownership violations. Five named rows; each is resolved when one implementation
 * remains and the other is a thin adapter or gone.
 */
function countDuplicateOwnership(): { readonly count: number; readonly rows: readonly { readonly capability: string; readonly present: boolean; readonly detail: string }[] } {
  const exists = (path: string): boolean => existsSync(join(repoRoot, path));
  const contains = (path: string, needle: string): boolean => exists(path) && readFileSync(join(repoRoot, path), "utf8").includes(needle);
  const rows = [
    {
      capability: "physics solver",
      present: contains("packages/physics/src/PhysicsWorld.ts", '"aura-js"') && contains("packages/physics/src/PhysicsWorld.ts", "cannon-es"),
      detail: "PhysicsWorld still declares both the cannon-es and aura-js backends"
    },
    {
      capability: "input",
      present: exists("packages/input/src/ActionMap.ts") && contains("packages/engine/src/agent-api/GameRuntime.ts", "createGameInput"),
      detail: "packages/input/ActionMap and GameRuntime.createGameInput both exist as live implementations"
    },
    {
      capability: "audio",
      present: exists("packages/audio/src/index.ts") && exists("packages/engine/src/game/GameAudio.ts"),
      detail: "packages/audio and engine/src/game/GameAudio both exist"
    },
    {
      capability: "vehicle motion",
      present: exists("packages/physics/src/VehicleMotion.ts") && contains("packages/engine/src/agent-api/GameGenreKits.ts", "heading"),
      detail: "packages/physics/VehicleMotion (force model) and game.racing's own kinematic integration both exist"
    },
    {
      capability: "game runtime",
      present: exists("packages/engine/src/agent-api/GameRuntime.ts") && exists("packages/engine/src/agent-api/GameGenreKits.ts"),
      detail: "GameRuntime plus per-kit integrators in GameGenreKits"
    }
  ];
  return { count: rows.filter((row) => row.present).length, rows };
}

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function main(): void {
  const sourceLines = countPackageSourceLines();
  const packageSourceLines = sourceLines.engine;
  const dependencies = countExternalRuntimeDependencies();
  const duplicates = countDuplicateOwnership();
  const current = {
    commit: currentCommit(),
    packageSourceLines,
    packages: countPackages(),
    rootExportSubpaths: countRootExportSubpaths(),
    externalRuntimeDependencies: dependencies.count,
    engineBarrelExports: countEngineBarrelExports(),
    duplicateOwnershipViolations: duplicates.count,
    routes: countRoutes(),
    templateScaffoldLines: sourceLines.templates
  };

  /*
   * These are RELEASE conditions, not per-commit ones. Reported every run so the trend is visible,
   * and only enforced at §10, because a phase that legitimately adds a tool before deleting a package
   * would otherwise be blocked from committing at all.
   */
  const checks: ReleaseCheck[] = [
    {
      id: "package-source-lines-lower-than-baseline",
      pass: current.packageSourceLines <= BASELINE.packageSourceLines,
      detail: `${current.packageSourceLines} vs baseline ${BASELINE.packageSourceLines} (delta ${current.packageSourceLines - BASELINE.packageSourceLines}) — release condition, reported per run. Definition: ${BASELINE.packageSourceLinesDefinition}`
    },
    {
      id: "r12-duplicate-ownership-zero",
      pass: current.duplicateOwnershipViolations === 0,
      detail: `${current.duplicateOwnershipViolations} of 5 duplicate-ownership rows still have two live implementations: ${duplicates.rows.filter((row) => row.present).map((row) => row.capability).join(", ") || "none"}`
    }
  ];

  writeReport(REPORT_PATH, "a3d-negative-complexity", checks, {
    rule: "§B.3 — 1.6 must shrink. Every phase reports what disappeared; a phase that only adds code has not done this document's job.",
    enforcement: "Reported every run; enforced as a release condition at PRD §10. Not a per-commit gate, because a phase may legitimately add a tool before deleting a package.",
    acceptableTrade: "Adding a mature backend such as Rapier ADDS a dependency while removing far more code. That trade is acceptable under §B.3 and must be stated, not hidden — which is why dependency names are listed rather than only counted.",
    baseline: BASELINE,
    current,
    delta: {
      packageSourceLines: current.packageSourceLines - BASELINE.packageSourceLines,
      packages: current.packages - BASELINE.packages,
      rootExportSubpaths: current.rootExportSubpaths - BASELINE.rootExportSubpaths,
      externalRuntimeDependencies: current.externalRuntimeDependencies - BASELINE.externalRuntimeDependencies,
      engineBarrelExports: current.engineBarrelExports - BASELINE.engineBarrelExports,
      duplicateOwnershipViolations: current.duplicateOwnershipViolations - BASELINE.duplicateOwnershipViolations,
      routes: current.routes - BASELINE.routes,
      templateScaffoldLines: current.templateScaffoldLines - BASELINE.templateScaffoldLines
    },
    externalRuntimeDependencyNames: dependencies.names,
    duplicateOwnershipRows: duplicates.rows
  });
  console.log(`engine src lines     : ${current.packageSourceLines} (baseline ${BASELINE.packageSourceLines}, delta ${current.packageSourceLines - BASELINE.packageSourceLines})`);
  console.log(`template scaffold    : ${current.templateScaffoldLines} (counted separately, not engine source)`);
  console.log(`packages             : ${current.packages} (baseline ${BASELINE.packages})`);
  console.log(`root export subpaths : ${current.rootExportSubpaths} (baseline ${BASELINE.rootExportSubpaths})`);
  console.log(`external runtime deps: ${current.externalRuntimeDependencies} [${dependencies.names.join(", ")}]`);
  console.log(`engine barrel exports: ${current.engineBarrelExports} (baseline ${BASELINE.engineBarrelExports})`);
  console.log(`R12 violations       : ${current.duplicateOwnershipViolations} of 5`);
  console.log(`routes               : ${current.routes} (baseline ${BASELINE.routes})`);
  console.log(`report: ${REPORT_PATH}`);
}

main();
