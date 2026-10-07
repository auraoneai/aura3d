import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseReport, isRecord, writeJson } from "../external-parity-reporting/index.js";

const reportPath = "tests/reports/external-parity-github-external-readiness.json" as const;

const sourceFiles = [
  "package.json",
  "docs/project/verification-evidence.md",
  ".github/workflows/external-parity-external-engine-baselines.yml",
  ".github/workflows/public-demo-deploy.yml",
  "tools/external-parity-github-external-readiness/index.ts",
  "tools/external-parity-external-evidence-readiness/index.ts",
  "tools/external-parity-external-host-doctor/index.ts",
] as const;

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[], cwd: string) => CommandResult;

export interface ExternalParityGithubExternalReadinessReport {
  readonly ok: boolean;
  readonly auditComplete: true;
  readonly githubExternalReady: boolean;
  readonly repo?: string;
  readonly currentBranch?: string;
  readonly defaultBranch?: string;
  readonly checks: {
    readonly remoteConfigured: GithubReadinessCheck;
    readonly currentBranchOnRemote: GithubReadinessCheck;
    readonly workflowsOnDefaultBranch: GithubReadinessCheck;
    readonly pagesConfigured: GithubReadinessCheck;
    readonly selfHostedRunners: GithubReadinessCheck;
    readonly actionsConfiguration: GithubReadinessCheck;
  };
  readonly blockers: readonly string[];
  readonly nextCommands: readonly string[];
  readonly reportPath: typeof reportPath;
}

export interface GithubReadinessCheck {
  readonly ready: boolean;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
}

export function createExternalParityGithubExternalReadinessReport(root = process.cwd(), runner: CommandRunner = defaultCommandRunner): ExternalParityGithubExternalReadinessReport {
  const remoteUrl = runText(runner, root, "git", ["config", "--get", "remote.origin.url"]);
  const repo = parseGithubRepo(remoteUrl.stdout) ?? process.env.A3D_GITHUB_REPOSITORY;
  const currentBranchResult = runText(runner, root, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const currentBranch = currentBranchResult.status === 0 ? currentBranchResult.stdout.trim() : undefined;
  const defaultBranch = repo ? githubDefaultBranch(root, runner, repo) : undefined;
  const remoteConfigured = checkRemote(remoteUrl, repo);
  const currentBranchOnRemote = repo && currentBranch
    ? checkCurrentBranchOnRemote(root, runner, currentBranch)
    : {
      ready: false,
      evidence: [],
      blockers: ["GitHub repo or current branch could not be resolved."],
    };
  const workflowsOnDefaultBranch = repo && defaultBranch
    ? checkWorkflowsOnDefaultBranch(root, runner, repo, defaultBranch)
    : {
      ready: false,
      evidence: [],
      blockers: ["GitHub repo or default branch could not be resolved."],
    };
  const pagesConfigured = repo
    ? checkPages(root, runner, repo)
    : {
      ready: false,
      evidence: [],
      blockers: ["GitHub repo could not be resolved for Pages API check."],
    };
  const selfHostedRunners = repo
    ? checkSelfHostedRunners(root, runner, repo)
    : {
      ready: false,
      evidence: [],
      blockers: ["GitHub repo could not be resolved for Actions runner API check."],
    };
  const actionsConfiguration = repo
    ? checkActionsConfiguration(root, runner, repo)
    : {
      ready: false,
      evidence: [],
      blockers: ["GitHub repo could not be resolved for Actions variables/secrets API checks."],
    };
  const checks = {
    remoteConfigured,
    currentBranchOnRemote,
    workflowsOnDefaultBranch,
    pagesConfigured,
    selfHostedRunners,
    actionsConfiguration,
  };
  const blockers = Object.entries(checks).flatMap(([id, check]) => check.blockers.map((blocker) => `${id}: ${blocker}`));
  const report = {
    ...baseReport(root, {
      ok: true,
      command: "pnpm audit:external-parity-github-external-readiness",
      runIdPrefix: "external-parity-github-external-readiness",
      sourceFiles,
    }),
    auditComplete: true as const,
    githubExternalReady: blockers.length === 0,
    repo,
    currentBranch,
    defaultBranch,
    checks,
    blockers,
    nextCommands: blockers.length === 0 ? [
      "gh workflow run public-demo-deploy.yml --repo <owner/repo> --ref <default-branch>",
      "gh workflow run external-parity-external-engine-baselines.yml --repo <owner/repo> --ref <default-branch> -f engine=all",
      "pnpm ingest:public-demo-deployment-reports path/to/public-demo-deployment-reports",
      "pnpm ingest:external-parity-external-baseline-artifacts path/to/external-parity-unity-baseline-evidence path/to/external-parity-unreal-baseline-evidence path/to/external-parity-external-baseline-final-audits",
      "pnpm preflight:external-parity-parity:after-external-evidence",
    ] : blockedNextCommands(repo, defaultBranch, currentBranch),
    reportPath,
  };
  writeJson(root, reportPath, report);
  return report;
}

function checkRemote(remoteUrl: CommandResult, repo: string | undefined): GithubReadinessCheck {
  const evidence = [
    ...(remoteUrl.status === 0 ? [`remote.origin.url=${remoteUrl.stdout.trim()}`] : []),
    ...(repo ? [`repo=${repo}`] : []),
  ];
  const blockers = [
    ...(remoteUrl.status === 0 ? [] : ["remote.origin.url is not configured."]),
    ...(repo ? [] : ["remote.origin.url is not a GitHub repository URL and A3D_GITHUB_REPOSITORY is not set."]),
  ];
  return { ready: blockers.length === 0, evidence, blockers };
}

function checkCurrentBranchOnRemote(root: string, runner: CommandRunner, currentBranch: string): GithubReadinessCheck {
  const result = runText(runner, root, "git", ["ls-remote", "--heads", "origin", currentBranch]);
  const exists = result.status === 0 && result.stdout.trim().length > 0;
  return {
    ready: exists,
    evidence: [`currentBranch=${currentBranch}`, ...(exists ? [`remoteHead=${result.stdout.trim().split(/\s+/)[1] ?? currentBranch}`] : [])],
    blockers: exists ? [] : [`current branch ${currentBranch} is not present on origin; push it before opening the external-evidence PR.`],
  };
}

function checkWorkflowsOnDefaultBranch(root: string, runner: CommandRunner, repo: string, defaultBranch: string): GithubReadinessCheck {
  const required = [
    ".github/workflows/external-parity-external-engine-baselines.yml",
    ".github/workflows/public-demo-deploy.yml",
  ] as const;
  const results = required.map((path) => ({
    path,
    result: runText(runner, root, "gh", ["api", `repos/${repo}/contents/${path}?ref=${defaultBranch}`]),
  }));
  const workflowList = runText(runner, root, "gh", ["workflow", "list", "--repo", repo]);
  const workflowListText = workflowList.stdout;
  const workflowsDiscoverable =
    workflowList.status === 0 &&
    workflowListText.includes("external-parity-external-engine-baselines") &&
    workflowListText.includes("public-demo-deploy");
  const blockers = [
    ...results.flatMap(({ path, result }) => result.status === 0 ? [] : [`${path} is not readable on default branch ${defaultBranch}.`]),
    ...(workflowsDiscoverable
      ? []
      : ["gh workflow list does not show both External parity external evidence workflows as discoverable."]),
  ];
  const evidence = [
    `defaultBranch=${defaultBranch}`,
    ...results.map(({ path, result }) => `${path}@${defaultBranch}=${result.status === 0 ? "present" : "missing"}`),
    ...(workflowList.status === 0 ? [`workflowList=${compactLines(workflowList.stdout)}`] : [`workflowListError=${workflowList.stderr.trim() || "failed"}`]),
  ];
  return { ready: blockers.length === 0, evidence, blockers };
}

function checkPages(root: string, runner: CommandRunner, repo: string): GithubReadinessCheck {
  const result = runJson(root, runner, "gh", ["api", `repos/${repo}/pages`]);
  const url = typeof result.json?.html_url === "string" ? result.json.html_url : undefined;
  const ready = result.ok && typeof url === "string" && url.startsWith("https://");
  return {
    ready,
    evidence: [
      ...(url ? [`pagesUrl=${url}`] : []),
      ...(typeof result.json?.status === "string" ? [`pagesStatus=${result.json.status}`] : []),
    ],
    blockers: ready ? [] : ["GitHub Pages is not configured with a durable HTTPS URL for public deployment smoke evidence."],
  };
}

function checkSelfHostedRunners(root: string, runner: CommandRunner, repo: string): GithubReadinessCheck {
  const result = runJson(root, runner, "gh", ["api", `repos/${repo}/actions/runners`]);
  const runners = Array.isArray(result.json?.runners) ? result.json.runners.filter(isRecord) : [];
  const labels = runners.flatMap((entry) => Array.isArray(entry.labels)
    ? entry.labels.filter(isRecord).map((label) => typeof label.name === "string" ? label.name : "").filter(Boolean)
    : []);
  const hasUnity = labels.includes("unity");
  const hasUnreal = labels.includes("unreal");
  return {
    ready: result.ok && hasUnity && hasUnreal,
    evidence: [`runnerCount=${runners.length}`, `labels=${[...new Set(labels)].sort().join(",") || "none"}`],
    blockers: [
      ...(result.ok ? [] : ["GitHub Actions runners API could not be read."]),
      ...(hasUnity ? [] : ["No self-hosted runner labeled unity is registered."]),
      ...(hasUnreal ? [] : ["No self-hosted runner labeled unreal is registered."]),
    ],
  };
}

function checkActionsConfiguration(root: string, runner: CommandRunner, repo: string): GithubReadinessCheck {
  const variables = runJson(root, runner, "gh", ["api", `repos/${repo}/actions/variables`]);
  const secrets = runJson(root, runner, "gh", ["api", `repos/${repo}/actions/secrets`]);
  const variableNames = Array.isArray(variables.json?.variables)
    ? variables.json.variables.filter(isRecord).map((entry) => typeof entry.name === "string" ? entry.name : "").filter(Boolean)
    : [];
  const secretNames = Array.isArray(secrets.json?.secrets)
    ? secrets.json.secrets.filter(isRecord).map((entry) => typeof entry.name === "string" ? entry.name : "").filter(Boolean)
    : [];
  const configuredNames = new Set([...variableNames, ...secretNames]);
  const requiredNames = ["A3D_UNITY_EDITOR", "A3D_UNREAL_EDITOR"] as const;
  const missing = requiredNames.filter((name) => !configuredNames.has(name));
  return {
    ready: variables.ok && secrets.ok && missing.length === 0,
    evidence: [
      `variables=${variableNames.sort().join(",") || "none"}`,
      `secrets=${secretNames.sort().join(",") || "none"}`,
      "A3D_RUN_UNITY_UNREAL_CLI_SMOKE is set to true inside .github/workflows/external-parity-external-engine-baselines.yml.",
    ],
    blockers: [
      ...(variables.ok ? [] : ["GitHub Actions variables API could not be read."]),
      ...(secrets.ok ? [] : ["GitHub Actions secrets API could not be read."]),
      ...missing.map((name) => `${name} is not configured as an Actions variable or secret.`),
    ],
  };
}

function githubDefaultBranch(root: string, runner: CommandRunner, repo: string): string | undefined {
  const result = runJson(root, runner, "gh", ["repo", "view", repo, "--json", "defaultBranchRef"]);
  const ref = isRecord(result.json?.defaultBranchRef) ? result.json.defaultBranchRef : {};
  return typeof ref.name === "string" ? ref.name : undefined;
}

function runText(runner: CommandRunner, root: string, command: string, args: readonly string[]): CommandResult {
  return runner(command, args, root);
}

function runJson(root: string, runner: CommandRunner, command: string, args: readonly string[]): { readonly ok: boolean; readonly json?: Record<string, unknown>; readonly result: CommandResult } {
  const result = runText(runner, root, command, args);
  if (result.status !== 0) return { ok: false, result };
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    return { ok: isRecord(parsed), json: isRecord(parsed) ? parsed : undefined, result };
  } catch {
    return { ok: false, result };
  }
}

function parseGithubRepo(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim();
  const https = /^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/u.exec(trimmed);
  if (https) return https[1];
  const ssh = /^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/u.exec(trimmed);
  return ssh?.[1];
}

function defaultCommandRunner(command: string, args: readonly string[], cwd: string): CommandResult {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8" });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function compactLines(value: string): string {
  return value.trim().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).join(" | ");
}

function blockedNextCommands(repo: string | undefined, defaultBranch: string | undefined, currentBranch: string | undefined): readonly string[] {
  return [
    "git status --short",
    ...(currentBranch ? [`git push origin ${currentBranch}`] : ["git push origin <current-branch>"]),
    `Open and merge a PR that lands the External parity workflow files on ${defaultBranch ?? "the default branch"}.`,
    "Enable GitHub Pages for the repository.",
    "Register self-hosted GitHub Actions runners labeled unity and unreal.",
    "Configure A3D_UNITY_EDITOR and A3D_UNREAL_EDITOR as Actions variables or secrets.",
    repo && defaultBranch ? `gh workflow run public-demo-deploy.yml --repo ${repo} --ref ${defaultBranch}` : "gh workflow run public-demo-deploy.yml --repo <owner/repo> --ref <default-branch>",
    repo && defaultBranch ? `gh workflow run external-parity-external-engine-baselines.yml --repo ${repo} --ref ${defaultBranch} -f engine=all` : "gh workflow run external-parity-external-engine-baselines.yml --repo <owner/repo> --ref <default-branch> -f engine=all",
    "pnpm preflight:external-parity-parity:after-external-evidence",
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = createExternalParityGithubExternalReadinessReport();
  console.log(JSON.stringify({
    ok: report.ok,
    githubExternalReady: report.githubExternalReady,
    repo: report.repo,
    currentBranch: report.currentBranch,
    defaultBranch: report.defaultBranch,
    blockers: report.blockers,
    report: report.reportPath,
    nextCommands: report.nextCommands,
  }, null, 2));
}
