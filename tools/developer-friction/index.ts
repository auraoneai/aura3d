/**
 * §B.2 — developer friction, measured beside performance.
 *
 * The PRD's reasoning: "Aura3D wins by making developers faster. That must be measured, not
 * asserted." Every field below is measured for **both** engines on the **same** scenario, because
 * a friction number without its Three.js counterpart is a number without a claim attached.
 *
 * ## Why it reuses the bundle-scenario entries
 *
 * `tools/bundle-scenarios/entries/` already holds one committed entry per engine per scenario,
 * built through one shared bundler config precisely so a bundle budget cannot be gamed by
 * changing what is in the file. Those same entries are the honest input for authored lines,
 * imports and dependencies: measuring friction on *different* files from the ones the bundle
 * budget uses would let the two reports describe different apps.
 *
 * ## What each field means, and what it deliberately does not
 *
 * - **authoredLines** — non-blank, non-comment lines a developer writes. Comments are excluded
 *   because the Aura3D entries carry long explanatory headers that would otherwise count as
 *   developer effort and flatter Aura3D.
 * - **imports** — `import` statements, i.e. how many module names a developer must know.
 * - **dependencies** — distinct npm packages the developer must install. `three` and
 *   `cannon-es` are two installs; `@aura3d/engine` is one.
 * - **typecheckMs** — `tsc --noEmit` on the scenario entry alone, so the number is compile time
 *   for what the developer wrote rather than for the whole monorepo.
 * - **installToFirstCubeMinutes** — NOT measured here, and reported as `unmeasured` with a
 *   reason. It requires a clean machine profile and a real registry install; producing it from a
 *   warm monorepo would be a fabricated number, which is exactly what R1 exists to stop.
 * - **startupMs** — likewise `unmeasured` here: first-frame time needs a browser, and
 *   `tests/browser/tier12-route-health.spec.ts` already measures real `readyTimeMs` per route.
 *   Pointing at that is honest; inventing a headless figure is not.
 *
 * R1 applies to this tool: a field that cannot be measured in this process is emitted as
 * `unmeasured` with a reason and is **never scored**.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

interface ScenarioEntries {
  readonly id: string;
  readonly label: string;
  readonly aura3d: string;
  readonly threejs: string;
}

const SCENARIOS: readonly ScenarioEntries[] = [
  {
    id: "scenario-1-core-primitive-scene",
    label: "Core primitive scene: renderer, scene graph, camera, one material, one cube",
    aura3d: "tools/bundle-scenarios/entries/scenario-1-aura3d.ts",
    threejs: "tools/bundle-scenarios/entries/scenario-1-threejs.ts"
  },
  {
    id: "scenario-2-product-viewer",
    label: "Product viewer: glTF, PBR, orbit controls, lighting, environment",
    aura3d: "tools/bundle-scenarios/entries/scenario-2-aura3d.ts",
    threejs: "tools/bundle-scenarios/entries/scenario-2-threejs.ts"
  },
  {
    id: "scenario-3-game-runtime",
    label: "Game runtime: input, animation, physics integration, game loop",
    aura3d: "tools/bundle-scenarios/entries/scenario-3-aura3d.ts",
    threejs: "tools/bundle-scenarios/entries/scenario-3-threejs.ts"
  }
];

/**
 * The four line-count comparisons already measured by the Three.js visual-parity gap report.
 *
 * Read from the report rather than restated, so the two cannot drift. The PRD cites these as the
 * §B.2 baseline; they cover different workflows from the three bundle scenarios, so both belong.
 */
function readGapReportLineCounts(): readonly { readonly workflow: string; readonly aura3dLines: number; readonly threejsLines: number }[] {
  const path = join(repoRoot, "tests/reports/external-parity-threejs-visual-parity/gap-report.md");
  if (!existsSync(path)) return [];
  const rows: { workflow: string; aura3dLines: number; threejsLines: number }[] = [];
  let workflow = "";
  let aura3dLines: number | undefined;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      workflow = heading[1]!.trim();
      aura3dLines = undefined;
      continue;
    }
    const a3d = /^-\s+A3D setup lines:\s*(\d+)/.exec(line);
    if (a3d) aura3dLines = Number(a3d[1]);
    const three = /^-\s+Three\.js setup lines:\s*(\d+)/.exec(line);
    if (three && aura3dLines !== undefined) {
      rows.push({ workflow, aura3dLines, threejsLines: Number(three[1]) });
      aura3dLines = undefined;
    }
  }
  return rows;
}

/** Non-blank, non-comment lines. See the header for why comments are excluded. */
function authoredLines(source: string): number {
  let inBlockComment = false;
  let count = 0;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlockComment = true;
      continue;
    }
    if (line.startsWith("//") || line.startsWith("*")) continue;
    count += 1;
  }
  return count;
}

function countImports(source: string): number {
  return (source.match(/^\s*import\s/gm) ?? []).length;
}

/**
 * Distinct npm packages a developer must install for this entry.
 *
 * Bare specifiers only: a relative import is the developer's own file, not an install. Scoped
 * names keep their scope (`@aura3d/engine`), and a subpath collapses to its package
 * (`three/examples/...` -> `three`), because a subpath is not a second install.
 */
function countDependencies(source: string): readonly string[] {
  const packages = new Set<string>();
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1]!;
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    const parts = specifier.split("/");
    packages.add(specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]!);
  }
  return [...packages].sort();
}

/** `tsc --noEmit` on one entry, so the number is the developer's file rather than the monorepo. */
function typecheckMs(entry: string): { readonly ms: number; readonly ok: boolean } {
  const started = Date.now();
  try {
    execFileSync(
      "npx",
      ["tsc", "--noEmit", "--skipLibCheck", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--strict", entry],
      { cwd: repoRoot, stdio: "pipe", encoding: "utf8" }
    );
    return { ms: Date.now() - started, ok: true };
  } catch {
    // A non-zero exit still yields a timing, and the entry compiling standalone is not the claim
    // being made here — the monorepo `pnpm typecheck` is what gates correctness.
    return { ms: Date.now() - started, ok: false };
  }
}

function measureEntry(relativePath: string) {
  const source = readFileSync(join(repoRoot, relativePath), "utf8");
  const dependencies = countDependencies(source);
  const compile = typecheckMs(relativePath);
  return {
    entry: relativePath,
    authoredLines: authoredLines(source),
    imports: countImports(source),
    dependencies,
    dependencyCount: dependencies.length,
    typecheckMs: compile.ms,
    typecheckClean: compile.ok
  };
}

function main(): void {
  const scenarios = SCENARIOS.map((scenario) => {
    const aura3d = measureEntry(scenario.aura3d);
    const threejs = measureEntry(scenario.threejs);
    return {
      id: scenario.id,
      label: scenario.label,
      aura3d,
      threejs,
      deltas: {
        authoredLines: aura3d.authoredLines - threejs.authoredLines,
        imports: aura3d.imports - threejs.imports,
        dependencies: aura3d.dependencyCount - threejs.dependencyCount,
        authoredLineRatio: Number((aura3d.authoredLines / Math.max(1, threejs.authoredLines)).toFixed(3))
      },
      aura3dFewerLines: aura3d.authoredLines < threejs.authoredLines,
      aura3dFewerDependencies: aura3d.dependencyCount <= threejs.dependencyCount
    };
  });

  const gapReport = readGapReportLineCounts();

  const report = {
    schema: "aura3d-developer-friction/1.0",
    generatedAt: new Date().toISOString(),
    method:
      "Measured on the committed bundle-scenario entries, one per engine per scenario, so friction and bundle size " +
      "describe the same apps. Authored lines exclude blanks and comments, because the Aura3D entries carry long " +
      "explanatory headers that would otherwise count as developer effort in Aura3D's favour.",
    scenarios,
    gapReportWorkflows: gapReport,
    unmeasured: [
      {
        field: "installToFirstCubeMinutes",
        reason:
          "Requires a clean machine profile and a real registry install. Producing it from a warm monorepo checkout " +
          "would be a fabricated number, which is what R1 exists to prevent. Measure during release rehearsal on a " +
          "clean profile, or leave unproven."
      },
      {
        field: "startupMsToFirstFrame",
        reason:
          "Needs a browser. Real per-route first-ready timings are already measured by " +
          "tests/browser/tier12-route-health.spec.ts (readyTimeMs, 35 Tier 1/2 routes); a headless approximation here " +
          "would be a second, weaker number competing with a real one."
      }
    ],
    summary: {
      scenariosWhereAura3dNeedsFewerLines: scenarios.filter((scenario) => scenario.aura3dFewerLines).length,
      scenariosWhereAura3dNeedsFewerOrEqualDependencies: scenarios.filter((scenario) => scenario.aura3dFewerDependencies).length,
      totalScenarios: scenarios.length,
      gapReportWorkflowsWhereAura3dNeedsFewerLines: gapReport.filter((row) => row.aura3dLines < row.threejsLines).length,
      gapReportWorkflows: gapReport.length
    }
  };

  const outputDirectory = join(repoRoot, "tests/reports");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "developer-friction.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("§B.2 developer friction — Aura3D vs Three.js, same scenario\n");
  for (const scenario of scenarios) {
    console.log(scenario.id);
    console.log(
      `  authored lines : ${scenario.aura3d.authoredLines} vs ${scenario.threejs.authoredLines}` +
        `  (${scenario.deltas.authoredLineRatio}x)`
    );
    console.log(`  imports        : ${scenario.aura3d.imports} vs ${scenario.threejs.imports}`);
    console.log(
      `  dependencies   : ${scenario.aura3d.dependencyCount} [${scenario.aura3d.dependencies.join(", ")}]` +
        ` vs ${scenario.threejs.dependencyCount} [${scenario.threejs.dependencies.join(", ")}]`
    );
    console.log(`  tsc --noEmit   : ${scenario.aura3d.typecheckMs}ms vs ${scenario.threejs.typecheckMs}ms`);
    console.log("");
  }
  for (const row of gapReport) {
    console.log(`  ${row.workflow}: ${row.aura3dLines} vs ${row.threejsLines} lines`);
  }
  console.log("");
  console.log(`fewer authored lines : ${report.summary.scenariosWhereAura3dNeedsFewerLines}/${report.summary.totalScenarios} scenarios, ${report.summary.gapReportWorkflowsWhereAura3dNeedsFewerLines}/${report.summary.gapReportWorkflows} gap-report workflows`);
  console.log(`unmeasured fields    : ${report.unmeasured.map((field) => field.field).join(", ")}`);
  console.log("\nreport: tests/reports/developer-friction.json");
}

main();
