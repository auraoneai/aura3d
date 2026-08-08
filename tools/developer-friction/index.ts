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
 * - **typecheckMs** — median of three fresh `tsc --noEmit` processes on the scenario entry alone,
 *   so the number is compile time for what the developer wrote rather than for the monorepo. The
 *   individual samples are retained because process startup and filesystem cache make one run noisy.
 * - **installToFirstCubeMinutes** — read from the isolated release-rehearsal measurement. Aura3D
 *   uses the actual packed release candidate and Three.js uses the public registry; both retain
 *   three cold-cache and three warm-cache samples through a browser-verified non-blank cube.
 * - **runtimeStartupToFirstFrameMs** — read from the real-browser, dual-engine production-path
 *   benchmark. It starts immediately before runtime construction and ends only after the first
 *   verified non-blank frame. Bundle download and module evaluation are explicitly excluded.
 *
 * R1 applies to this tool: a field that cannot be measured in this process is emitted as
 * `unmeasured` with a reason and is **never scored**.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const startupReportPath = join(repoRoot, "tests/reports/developer-startup/report.json");
const installReportPath = join(repoRoot, "tests/reports/install-to-first-cube.json");

interface StartupReport {
  readonly schema: "aura3d-developer-startup/1.0";
  readonly measurement: string;
  readonly methodology: {
    readonly sessions: number;
    readonly publicEntries: { readonly aura3d: string; readonly threejs: string };
    readonly identicalCanvas: { readonly width: number; readonly height: number };
    readonly identicalCameraAndContent: boolean;
    readonly nonBlankPixelFloor: number;
  };
  readonly environment: Readonly<Record<string, unknown>>;
  readonly aura3d: {
    readonly runtimeStartupToFirstFrameMs: Readonly<Record<string, number>>;
    readonly sessions: readonly { readonly nonBlankPixels: number }[];
  };
  readonly threejs: {
    readonly runtimeStartupToFirstFrameMs: Readonly<Record<string, number>>;
    readonly sessions: readonly { readonly nonBlankPixels: number }[];
  };
}

interface InstallReport {
  readonly schema: "aura3d-install-to-first-cube/1.0";
  readonly pass: boolean;
  readonly measurement: string;
  readonly methodology: Readonly<Record<string, unknown>>;
  readonly environment: Readonly<Record<string, unknown>>;
  readonly artifacts: Readonly<Record<string, unknown>>;
  readonly samples: readonly {
    readonly engine: "aura3d" | "threejs";
    readonly cacheState: "cold" | "warm";
    readonly installToFirstCubeMs: number;
    readonly verifiedChangedPixels: number;
  }[];
  readonly summary: Record<"cold" | "warm", Record<"aura3d" | "threejs", {
    readonly sampleCount: number;
    readonly samplesMs: readonly number[];
    readonly medianMs: number;
    readonly medianMinutes: number;
    readonly varianceMs2: number;
  }>>;
}

function readStartupReport(): StartupReport {
  if (!existsSync(startupReportPath)) {
    throw new Error(
      "Missing real-browser startup evidence. Run `pnpm bench:production-path` before generating developer friction."
    );
  }
  const report = JSON.parse(readFileSync(startupReportPath, "utf8")) as StartupReport;
  if (
    report.schema !== "aura3d-developer-startup/1.0" ||
    report.methodology.sessions < 3 ||
    !report.methodology.identicalCameraAndContent ||
    report.aura3d.sessions.some((session) => session.nonBlankPixels <= report.methodology.nonBlankPixelFloor) ||
    report.threejs.sessions.some((session) => session.nonBlankPixels <= report.methodology.nonBlankPixelFloor)
  ) {
    throw new Error("Developer startup evidence is incomplete or does not prove a non-blank dual-engine browser frame.");
  }
  return report;
}

function readInstallReport(): InstallReport {
  if (!existsSync(installReportPath)) {
    throw new Error(
      "Missing install-to-first-cube evidence. Run `pnpm measure:install-to-first-cube` from an isolated release profile."
    );
  }
  const report = JSON.parse(readFileSync(installReportPath, "utf8")) as InstallReport;
  if (
    report.schema !== "aura3d-install-to-first-cube/1.0" ||
    !report.pass ||
    report.samples.length !== 12 ||
    report.samples.some((sample) => sample.installToFirstCubeMs <= 0 || sample.verifiedChangedPixels <= 1_000) ||
    (["cold", "warm"] as const).some((state) =>
      (["aura3d", "threejs"] as const).some((engine) => report.summary[state][engine].sampleCount < 3)
    )
  ) {
    throw new Error("Install-to-first-cube evidence is incomplete or does not prove both engines in cold and warm profiles.");
  }
  return report;
}

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

/** Three fresh `tsc --noEmit` processes; report the median and retain all samples. */
function typecheckMs(entry: string): { readonly ms: number; readonly samplesMs: readonly number[]; readonly ok: boolean } {
  const samplesMs: number[] = [];
  let ok = true;
  for (let sample = 0; sample < 3; sample += 1) {
    const started = Date.now();
    try {
      execFileSync(
        "npx",
        ["tsc", "--noEmit", "--skipLibCheck", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--strict", entry],
        { cwd: repoRoot, stdio: "pipe", encoding: "utf8" }
      );
    } catch {
      // A non-zero exit still yields a timing, and the entry compiling standalone is not the claim
      // being made here — the monorepo `pnpm typecheck` is what gates correctness.
      ok = false;
    }
    samplesMs.push(Date.now() - started);
  }
  const ordered = [...samplesMs].sort((left, right) => left - right);
  return { ms: ordered[Math.floor(ordered.length / 2)]!, samplesMs, ok };
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
    typecheckSamplesMs: compile.samplesMs,
    typecheckClean: compile.ok
  };
}

function main(): void {
  const startup = readStartupReport();
  const install = readInstallReport();
  const unmeasured: readonly { readonly field: string; readonly reason: string }[] = [];
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
    runtimeStartupToFirstFrame: {
      source: "tests/reports/developer-startup/report.json",
      measurement: startup.measurement,
      methodology: startup.methodology,
      environment: startup.environment,
      aura3d: startup.aura3d.runtimeStartupToFirstFrameMs,
      threejs: startup.threejs.runtimeStartupToFirstFrameMs
    },
    installToFirstCube: {
      source: "tests/reports/install-to-first-cube.json",
      measurement: install.measurement,
      methodology: install.methodology,
      environment: install.environment,
      artifacts: install.artifacts,
      summary: install.summary,
      samples: install.samples
    },
    unmeasured,
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
    console.log(
      `  tsc --noEmit   : ${scenario.aura3d.typecheckMs}ms [${scenario.aura3d.typecheckSamplesMs.join(", ")}]` +
        ` vs ${scenario.threejs.typecheckMs}ms [${scenario.threejs.typecheckSamplesMs.join(", ")}]`
    );
    console.log("");
  }
  for (const row of gapReport) {
    console.log(`  ${row.workflow}: ${row.aura3dLines} vs ${row.threejsLines} lines`);
  }
  console.log("");
  console.log(`fewer authored lines : ${report.summary.scenariosWhereAura3dNeedsFewerLines}/${report.summary.totalScenarios} scenarios, ${report.summary.gapReportWorkflowsWhereAura3dNeedsFewerLines}/${report.summary.gapReportWorkflows} gap-report workflows`);
  console.log(
    `runtime startup      : ${startup.aura3d.runtimeStartupToFirstFrameMs.median}ms Aura3D vs ` +
      `${startup.threejs.runtimeStartupToFirstFrameMs.median}ms Three.js (median of ${startup.methodology.sessions} browser sessions)`
  );
  console.log(
    `cold install→cube    : ${install.summary.cold.aura3d.medianMs}ms Aura3D vs ` +
      `${install.summary.cold.threejs.medianMs}ms Three.js (median of ${install.summary.cold.aura3d.sampleCount})`
  );
  console.log(
    `warm install→cube    : ${install.summary.warm.aura3d.medianMs}ms Aura3D vs ` +
      `${install.summary.warm.threejs.medianMs}ms Three.js (median of ${install.summary.warm.aura3d.sampleCount})`
  );
  console.log(`unmeasured fields    : ${report.unmeasured.map((field) => field.field).join(", ")}`);
  console.log("\nreport: tests/reports/developer-friction.json");
}

main();
