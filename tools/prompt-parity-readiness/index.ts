import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { auditPromptSource, readPublicRootExports, type PromptSourceAudit } from "../../benchmark/runner/prompt-source-audit.mjs";

const REPORT_PATH = "tests/reports/prompt-parity-readiness.json";

interface PromptRun {
  readonly id: string;
  readonly promptId: string;
  readonly agent: string;
  readonly library: string;
  readonly promptDir: string;
  readonly sourceDir: string;
  readonly promptFile: string;
}

interface ReadinessCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly promptId?: string;
  readonly helper?: string;
  readonly detail: string;
  readonly evidence?: string;
}

export interface PromptParityReadinessReport {
  readonly schema: "a3d-prompt-parity-readiness";
  readonly generatedAt: string;
  readonly pass: boolean;
  readonly reportPath: string;
  readonly target: string;
  readonly auditedRuns: readonly PromptRun[];
  readonly checks: readonly ReadinessCheck[];
  readonly sourceAudits: readonly PromptSourceAudit[];
  readonly unavailablePublicImports: readonly PromptSourceAudit["unavailablePublicImports"][number][];
  readonly nonPublicSubpathImports: readonly PromptSourceAudit["nonPublicSubpathImports"][number][];
  readonly unsafeAssetReferences: readonly PromptSourceAudit["unsafeAssetReferences"][number][];
  readonly weakPromptHelpers: readonly ReadinessCheck[];
}

const promptHelperRules = [
  { promptId: "prompt-01", helper: "prefabs.physicsPlayground or public physics helper", pattern: /\bprefabs\s*\.\s*physicsPlayground\b|\bphysics\s*\./ },
  { promptId: "prompt-06", helper: "prefabs.miniGolfHole or public mini-golf helper", pattern: /\bprefabs\s*\.\s*miniGolfHole\b|\bminiGolf\b|\bphysics\s*\./ },
  { promptId: "prompt-07", helper: "prefabs.materialSwatches or material lab helper", pattern: /\bprefabs\s*\.\s*materialSwatches\b|\bmaterialLab\b/ },
  { promptId: "prompt-08", helper: "prefabs.cityBlock or city state helper", pattern: /\bprefabs\s*\.\s*cityBlock\b|\bcityBlock\b/ },
  { promptId: "prompt-10", helper: "typed sneaker asset via assets.sneaker", pattern: /\bassets\s*\.\s*sneaker\b|\bassets\s*\[\s*["']sneaker["']\s*\]/ }
] as const;

export function collectPromptParityReadiness(options: { readonly repoRoot?: string; readonly target?: string; readonly reportPath?: string } = {}): PromptParityReadinessReport {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const target = options.target ? resolve(repoRoot, options.target) : latestBenchmarkRound(repoRoot);
  const reportPath = options.reportPath ?? REPORT_PATH;
  const publicRootExports = readPublicRootExports(repoRoot);
  const runs = discoverAuraPromptRuns(repoRoot, target);
  const sourceAudits = runs.map((run) =>
    auditPromptSource({
      repoRoot,
      promptDir: run.promptDir,
      sourceDir: run.sourceDir,
      promptFile: run.promptFile,
      publicRootExports,
      writeReport: false
    })
  );

  const checks: ReadinessCheck[] = [
    {
      id: "target-has-aura-prompt-runs",
      pass: runs.length > 0,
      detail: runs.length > 0 ? `Found ${runs.length} Aura prompt source directories under ${relative(repoRoot, target)}` : `No Aura prompt source directories found under ${relative(repoRoot, target)}`
    }
  ];

  for (const [index, run] of runs.entries()) {
    const audit = sourceAudits[index];
    checks.push({
      id: `source-audit:${run.id}`,
      pass: audit.pass,
      promptId: run.promptId,
      detail: audit.pass ? "Generated source imports and prompt 10 asset usage passed audit." : audit.failures.join("; "),
      evidence: relative(repoRoot, run.sourceDir)
    });
    checks.push(...helperChecksForRun(run));
  }

  const unavailablePublicImports = sourceAudits.flatMap((audit) => audit.unavailablePublicImports);
  const nonPublicSubpathImports = sourceAudits.flatMap((audit) => audit.nonPublicSubpathImports);
  const unsafeAssetReferences = sourceAudits.flatMap((audit) => audit.unsafeAssetReferences);
  const weakPromptHelpers = checks.filter((check) => check.id.startsWith("prompt-helper:") && !check.pass);
  const pass = checks.every((check) => check.pass);

  return {
    schema: "a3d-prompt-parity-readiness",
    generatedAt: new Date().toISOString(),
    pass,
    reportPath,
    target: relative(repoRoot, target),
    auditedRuns: runs,
    checks,
    sourceAudits,
    unavailablePublicImports,
    nonPublicSubpathImports,
    unsafeAssetReferences,
    weakPromptHelpers
  };
}

function helperChecksForRun(run: PromptRun): ReadinessCheck[] {
  const rule = promptHelperRules.find((entry) => entry.promptId === run.promptId);
  if (!rule) return [];
  const text = readGeneratedAppText(run.sourceDir);
  return [
    {
      id: `prompt-helper:${run.id}`,
      pass: rule.pattern.test(text),
      promptId: run.promptId,
      helper: rule.helper,
      detail: rule.pattern.test(text)
        ? `${run.promptId} uses ${rule.helper}.`
        : `${run.promptId} is weak: missing ${rule.helper}.`,
      evidence: relative(process.cwd(), run.sourceDir)
    }
  ];
}

function discoverAuraPromptRuns(repoRoot: string, target: string): PromptRun[] {
  if (!existsSync(target)) return [];
  const promptDirs = walkDirs(target).filter((dir) => /(?:^|\/)prompt-\d{2}$/.test(relative(repoRoot, dir).replaceAll("\\", "/")) && existsSync(join(dir, "source")));
  return promptDirs
    .map((promptDir): PromptRun | null => {
      const sourceDir = join(promptDir, "source");
      const metadata = readJson(join(promptDir, "run-metadata.json")) as { agent?: string; library?: string; promptFile?: string } | null;
      const rel = relative(repoRoot, promptDir).replaceAll("\\", "/");
      const parts = rel.split("/");
      const runId = parts.at(-2) ?? "unknown-run";
      const promptId = parts.at(-1) ?? "unknown-prompt";
      const library = metadata?.library ?? (runId.includes("aura3d") ? "Aura3D" : "");
      if (library !== "Aura3D" && !runId.includes("aura3d")) return null;
      return {
        id: `${runId}/${promptId}`,
        promptId,
        agent: metadata?.agent ?? runId.split("-")[0] ?? "unknown",
        library: "Aura3D",
        promptDir,
        sourceDir,
        promptFile: metadata?.promptFile ?? inferPromptFile(repoRoot, promptId)
      };
    })
    .filter((run): run is PromptRun => Boolean(run))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function latestBenchmarkRound(repoRoot: string): string {
  const runsDir = join(repoRoot, "benchmark/runs");
  const rounds = existsSync(runsDir)
    ? readdirSync(runsDir)
        .map((entry) => ({ entry, match: entry.match(/^round-(\d+)$/) }))
        .filter((entry): entry is { entry: string; match: RegExpMatchArray } => Boolean(entry.match))
        .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))
    : [];
  return rounds[0] ? join(runsDir, rounds[0].entry) : runsDir;
}

function inferPromptFile(repoRoot: string, promptId: string): string {
  const promptNumber = promptId.match(/\d{2}/)?.[0];
  if (!promptNumber) return "";
  const prompt = readdirSync(join(repoRoot, "benchmark/prompts")).find((entry) => entry.startsWith(`${promptNumber}-`));
  return prompt ? `benchmark/prompts/${prompt}` : "";
}

function readGeneratedAppText(sourceDir: string): string {
  const src = join(sourceDir, "src");
  if (!existsSync(src)) return "";
  return walkFiles(src)
    .filter((file) => /\.(?:ts|tsx|js|jsx|css|html)$/.test(file) && !file.endsWith("src/aura-assets.ts"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function walkDirs(root: string, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (existsSync(path) && statSync(path).isDirectory()) {
      acc.push(path);
      walkDirs(path, acc);
    }
  }
  return acc;
}

function walkFiles(root: string, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) walkFiles(path, acc);
    else acc.push(path);
  }
  return acc;
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length);
  const report = collectPromptParityReadiness({ target: targetArg });
  const outPath = resolve(report.reportPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
}
