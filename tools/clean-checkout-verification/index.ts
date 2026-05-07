import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, freemem, platform, release, totalmem, type } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CleanCheckoutReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly releaseRunId: string;
  readonly blockers: readonly string[];
  readonly git: {
    readonly sha: string | null;
    readonly branch: string | null;
    readonly dirty: boolean;
    readonly dirtyFiles: readonly string[];
  };
  readonly packageManager: {
    readonly pnpmVersion: string | null;
  };
  readonly environment: {
    readonly nodeVersion: string;
    readonly os: string;
    readonly platform: NodeJS.Platform;
    readonly release: string;
    readonly arch: string;
    readonly cpuModel: string;
    readonly cpuCount: number;
    readonly totalMemoryBytes: number;
    readonly freeMemoryBytes: number;
  };
  readonly browser: {
    readonly playwrightVersion: string | null;
    readonly chromiumVersion: string | null;
    readonly firefoxVersion: string | null;
    readonly webkitVersion: string | null;
  };
  readonly gpu: {
    readonly available: boolean;
    readonly renderer: string | null;
    readonly vendor: string | null;
    readonly reason?: string;
  };
  readonly reproduction: {
    readonly cleanCheckout: boolean;
    readonly independentMachineOrAgent: boolean;
    readonly evidence: string | null;
    readonly blockers: readonly string[];
  };
}

const reportPath = "tests/reports/clean-checkout.json";

export function createCleanCheckoutReport(root = process.cwd()): CleanCheckoutReport {
  const gitStatus = run(root, "git", ["status", "--porcelain"]);
  const dirtyFiles = gitStatus.status === 0 ? gitStatus.stdout.split(/\r?\n/).filter(Boolean) : [];
  const gitAvailable = gitStatus.status === 0;
  const cleanCheckout = gitAvailable && dirtyFiles.length === 0;
  const independentEvidence = process.env.G3D_INDEPENDENT_REPRODUCTION_EVIDENCE?.trim() || null;
  const independentMachineOrAgent = process.env.G3D_INDEPENDENT_REPRODUCTION === "1" && independentEvidence !== null;
  const blockers = [
    ...(gitAvailable ? [] : ["Not a git checkout or git status failed."]),
    ...(dirtyFiles.length === 0 ? [] : [`Workspace is dirty (${dirtyFiles.length} changed paths).`])
  ];
  const reproductionBlockers = [
    ...(cleanCheckout ? [] : ["Local workspace is not a clean checkout."]),
    ...(independentMachineOrAgent ? [] : ["Independent machine or agent reproduction evidence is not recorded."])
  ];
  const cpuList = cpus();
  const playwrightVersion = run(root, "pnpm", ["exec", "playwright", "--version"]).stdout.trim() || null;
  return {
    ok: cleanCheckout,
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-clean-checkout-run",
    blockers,
    git: {
      sha: run(root, "git", ["rev-parse", "HEAD"]).stdout.trim() || null,
      branch: run(root, "git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || null,
      dirty: !cleanCheckout,
      dirtyFiles
    },
    packageManager: {
      pnpmVersion: run(root, "pnpm", ["--version"]).stdout.trim() || null
    },
    environment: {
      nodeVersion: process.version,
      os: type(),
      platform: platform(),
      release: release(),
      arch: process.arch,
      cpuModel: cpuList[0]?.model ?? "unknown",
      cpuCount: cpuList.length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem()
    },
    browser: {
      playwrightVersion,
      chromiumVersion: null,
      firefoxVersion: null,
      webkitVersion: null
    },
    gpu: {
      available: false,
      renderer: null,
      vendor: null,
      reason: "GPU renderer/vendor collection is only available from browser/WebGL probes; this Node command records unavailable state explicitly."
    },
    reproduction: {
      cleanCheckout,
      independentMachineOrAgent,
      evidence: independentEvidence,
      blockers: reproductionBlockers
    }
  };
}

export function writeCleanCheckoutReport(root = process.cwd(), report = createCleanCheckoutReport(root)): void {
  const path = join(root, reportPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

function run(root: string, command: string, args: readonly string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 1024 * 1024
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createCleanCheckoutReport();
  writeCleanCheckoutReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    sha: report.git.sha,
    dirty: report.git.dirty,
    dirtyFiles: report.git.dirtyFiles.length,
    blockers: report.blockers,
    independentMachineOrAgent: report.reproduction.independentMachineOrAgent,
    pnpmVersion: report.packageManager.pnpmVersion,
    playwrightVersion: report.browser.playwrightVersion,
    releaseRunId: report.releaseRunId
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
