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
 * Members of the `PhysicsBackend` union in `packages/physics/src/PhysicsWorld.ts`.
 *
 * This is the declaration that decides how many solvers a caller can select, so counting it
 * measures the R12 physics row directly. Returns `-1` when the declaration cannot be found,
 * which reports as a violation rather than passing silently on a renamed type.
 */
function countPhysicsBackends(): number {
  const path = join(repoRoot, "packages/physics/src/PhysicsWorld.ts");
  if (!existsSync(path)) return -1;
  const match = /^export type PhysicsBackend = ([^;]+);/m.exec(readFileSync(path, "utf8"));
  if (!match) return -1;
  return match[1]!.split("|").filter((member) => member.trim().length > 0).length;
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
      /*
       * WS-4.3 resolved this row by deleting the second solver, so the check has to change
       * shape or it would go green on a comment.
       *
       * The old form asked whether `PhysicsWorld.ts` contains the string `"aura-js"`. It
       * still does — in the doc comment on `PhysicsBackend` that records *why* there is one
       * backend, and in the error message thrown when a 1.5.x caller passes the removed
       * value. Both are the fix, not the violation. A substring check cannot tell a
       * surviving implementation from a tombstone.
       *
       * What actually constitutes the violation is a second *selectable* solver, so the
       * check now reads the `PhysicsBackend` union — the one declaration that decides how
       * many solvers a caller can ask for — and counts its members. One member, one owner.
       * A substring check would also have been satisfied by the prose two paragraphs up in
       * this very file, which is the trap being avoided.
       */
      capability: "physics solver",
      present: countPhysicsBackends() !== 1,
      detail: `PhysicsBackend declares ${countPhysicsBackends()} selectable solvers; R12 allows one`
    },
    {
      /*
       * WS-3.1 — the definition of this violation is corrected, not the code, and the reasoning matters.
       *
       * The PRD listed `packages/input` vs `GameRuntime.createGameInput` as duplicate ownership. Measured,
       * they are not: **no file in packages/, apps/ or examples/ imports both** (asserted by
       * `tests/unit/input/input-service-ownership.test.ts`). They serve disjoint consumers —
       * `createGameInput` serves game routes with action mapping, buffering and combos, while
       * `packages/input` serves `packages/controls` and the camera apps with `InputSnapshot` as a DATA TYPE.
       * Deleting either would break its own consumers to satisfy a count.
       *
       * R12's actual words are "no duplicate runtime implementations ... every capability has exactly one
       * owner". Two services with no shared consumer are not competing for a capability. So this now
       * detects the real violation shape: a file that wires BOTH, which is the moment they start competing.
       *
       * What WS-3.1 did find and remove was a genuine violation this coarser check could not see:
       * `createGameInputController`, 175 lines inside `agent-api/index.ts` with **zero consumers**, holding
       * its own `window` keyboard listeners and a weaker `update()` with no press history. Two functions in
       * one file, one of them dead — invisible to a package-level comparison.
       */
      capability: "input",
      present: (() => {
        for (const root of ["apps", "examples", "packages"]) {
          const directory = join(repoRoot, root);
          if (!existsSync(directory)) continue;
          const stack = [directory];
          while (stack.length > 0) {
            const current = stack.pop()!;
            for (const entry of readdirSync(current)) {
              if (entry === "node_modules" || entry === "dist") continue;
              const child = join(current, entry);
              if (statSync(child).isDirectory()) { stack.push(child); continue; }
              if (!/\.tsx?$/.test(entry)) continue;
              // The definition site and the barrel re-export are not consumers.
              if (child.endsWith("GameRuntime.ts") || child.endsWith("agent-api/index.ts")) continue;
              const source = readFileSync(child, "utf8");
              if (/from\s+["'`]@aura3d\/input["'`]/.test(source) && /\bgame\.input\(|createGameInput\(/.test(source)) return true;
            }
          }
        }
        return false;
      })(),
      detail: "A file wiring BOTH @aura3d/input and game.input() would mean the two services compete for one consumer. None does (verified across apps/, examples/, packages/), so they are disjoint layers rather than duplicate implementations — see tests/unit/input/input-service-ownership.test.ts. WS-3.1 removed the real duplicate: createGameInputController, 175 dead lines with its own keyboard listeners."
    },
    {
      /*
       * WS-3.2 — corrected the same way the input row was, and for the same reason.
       *
       * The PRD listed `packages/audio` vs `engine/src/game/GameAudio.ts` as duplicate ownership. Measured,
       * their consumers are disjoint and their concepts are disjoint: `packages/audio` owns the GRAPH
       * (context lifecycle, mixer, buses, effects, spatialization), `GameAudio` owns CUES and the evidence
       * the route-health harnesses read. Neither exposes the other's surface — asserted in
       * `tests/unit/audio/audio-characterization.test.ts`.
       *
       * So co-existence is not the violation. The violation was that `GameAudio` reimplemented the graph:
       * its own `context.createGain()`, its own volume/mute fields, its own gain disposal. That is now
       * delegated to `AudioBus`, leaving exactly one implementation of bus routing in the repository.
       *
       * This therefore detects the real shape: `GameAudio` building gain nodes itself instead of going
       * through `@aura3d/audio`. If anyone reintroduces a hand-rolled graph there, the row reopens.
       */
      capability: "audio",
      present: (() => {
        const path = join(repoRoot, "packages/engine/src/game/GameAudio.ts");
        if (!existsSync(path)) return false;
        const source = readFileSync(path, "utf8");
        // Bus routing must come from the graph owner.
        if (!/from\s+["'`]@aura3d\/audio["'`]/.test(source)) return true;
        if (!source.includes("new AudioBus(")) return true;
        /*
         * Scope the gain-node check to the factory body. `playDefaultCue` legitimately creates a
         * per-cue envelope gain, which is a VOICE, not a bus — `packages/audio` has no equivalent, so
         * counting it would force a false violation that could only be "fixed" by deleting the envelope.
         * The violation is a gain node built for BUS routing, which lives inside `createGameAudio`.
         */
        const start = source.indexOf("export function createGameAudio");
        const end = source.indexOf("function playDefaultCue");
        if (start < 0 || end < 0) return true;
        return source.slice(start, end).includes(".createGain()");
      })(),
      detail:
        "GameAudio must not build its own gain graph; it delegates bus routing to AudioBus from @aura3d/audio. packages/audio owns the graph, GameAudio owns cues + evidence, and their consumer sets are disjoint (see tests/unit/audio/audio-characterization.test.ts), so co-existence is layering rather than duplicate ownership. Reopens if a hand-rolled createGain() returns to GameAudio."
    },
    {
      capability: "vehicle motion",
      present: (() => {
        const source = readFileSync(join(repoRoot, "packages/engine/src/agent-api/GameGenreKits.ts"), "utf8");
        const start = source.indexOf("export function createGameRacingKit");
        const end = source.indexOf("const FALLING_BLOCK_SHAPES", start);
        if (start < 0 || end < 0) return true;
        const racing = source.slice(start, end);
        return !racing.includes("createGameArcadeVehicle")
          || !racing.includes("motion.step(step")
          || /state\.position\.[xy]\s*\+\s*Math\.(?:cos|sin)/.test(racing)
          || /state\.heading\s*\+\s*steer/.test(racing);
      })(),
      detail: "game.racing delegates arcade pose integration to GameRuntime.createGameArcadeVehicle; the force-based VehicleMotion contract remains a distinct physics capability (ADR 0003)"
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
