import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Aura3D106PublishedCliProofReport {
  readonly schema: "aura3d106-published-cli-proof";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly versions: Record<string, string>;
  readonly search: PublishedCliCommandProof;
  readonly badResolve: PublishedCliCommandProof;
  readonly blockers: readonly string[];
}

interface PublishedCliCommandProof {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly ok: boolean;
  readonly stdout: unknown;
  readonly stderr: string;
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d106/published-cli-catalog-proof.json";
const packages = ["@aura3d/engine", "@aura3d/cli", "@aura3d/asset-index", "create-aura3d"] as const;

export function createAura3D106PublishedCliProofReport(): Aura3D106PublishedCliProofReport {
  const versions = Object.fromEntries(packages.map((pkg) => [pkg, npmViewVersion(pkg)]));
  const search = runPublishedSearch();
  const badResolve = runBadResolve();
  const blockers = [...search.blockers.map((blocker) => `search: ${blocker}`), ...badResolve.blockers.map((blocker) => `bad-resolve: ${blocker}`)];
  return {
    schema: "aura3d106-published-cli-proof",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    versions,
    search,
    badResolve,
    blockers
  };
}

export function writeAura3D106PublishedCliProofReport(root: string, report: Aura3D106PublishedCliProofReport, outPath = defaultOutPath): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function runPublishedSearch(): PublishedCliCommandProof {
  const cwd = mkdtempSync(join(tmpdir(), "aura3d-published-cli-search-"));
  const command = ["npx", "-y", "@aura3d/cli@latest", "assets", "search", "animated humanoid fighting character", "--profile", "fighting-character", "--json"];
  const result = run(command, cwd);
  const blockers: string[] = [];
  const stdout = parseJson(result.stdout, blockers, "search stdout");
  const candidates = Array.isArray((stdout as { readonly candidates?: unknown }).candidates)
    ? ((stdout as { readonly candidates: readonly unknown[] }).candidates)
    : [];
  const rejectedCandidates = Array.isArray((stdout as { readonly rejectedCandidates?: unknown }).rejectedCandidates)
    ? ((stdout as { readonly rejectedCandidates: readonly unknown[] }).rejectedCandidates)
    : [];
  if (result.status !== 0) blockers.push(`published search exited ${String(result.status)}.`);
  if ((stdout as { readonly ok?: unknown }).ok !== true) blockers.push("published search did not return ok=true.");
  if ((stdout as { readonly profile?: unknown }).profile !== "fighting-character") {
    blockers.push("published search JSON does not prove the fighting-character profile was applied.");
  }
  if (candidates.length < 1) {
    const text = JSON.stringify(stdout).toLowerCase();
    if (
      rejectedCandidates.length < 1 ||
      !text.includes("no fighting-character-ready candidate") ||
      !text.includes("rejectionreasons")
    ) {
      blockers.push(`published search returned only ${candidates.length} candidate(s) without honest no-production-ready diagnostics.`);
    }
  }
  for (const candidate of candidates) {
    const record = candidate as { readonly profile?: { readonly name?: unknown; readonly suitable?: unknown }; readonly id?: unknown };
    if (record.profile?.name !== "fighting-character") blockers.push(`published candidate ${String(record.id)} is missing fighting-character profile diagnostics.`);
    if (record.profile?.suitable !== true) blockers.push(`published candidate ${String(record.id)} is not suitable but remained in candidates.`);
  }
  if (JSON.stringify(candidates).toLowerCase().includes("spider")) {
    blockers.push("published search still returns a spider candidate as a usable fighting-character candidate.");
  }
  return {
    command,
    cwd,
    exitCode: result.status,
    ok: blockers.length === 0,
    stdout,
    stderr: result.stderr,
    blockers
  };
}

function runBadResolve(): PublishedCliCommandProof {
  const cwd = mkdtempSync(join(tmpdir(), "aura3d-published-cli-resolve-"));
  const command = ["npx", "-y", "@aura3d/cli@latest", "assets", "resolve", "static aircraft", "--name", "badFighter", "--profile", "fighting-character", "--json"];
  const result = run(command, cwd);
  const blockers: string[] = [];
  const stdout = result.stdout.trim().length > 0 ? parseJson(result.stdout, blockers, "bad resolve stdout") : { raw: "" };
  if (result.status === 0 && (stdout as { readonly ok?: unknown }).ok === true) {
    blockers.push("published resolve accepted a static aircraft as a fighting-character asset.");
  }
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  const requiredDiagnostics = [
    {
      label: "non-humanoid",
      ok: /non-humanoid|not character-like|not a complete playable fighter|not character-like or humanoid/.test(text),
    },
    {
      label: "no embedded animation",
      ok: /no embedded animation|missing animation metadata|requires embedded animation clips|requires proven embedded animation clips/.test(text),
    },
    {
      label: "profile",
      ok: text.includes("fighting-character") || text.includes("profile"),
    },
  ];
  for (const diagnostic of requiredDiagnostics) {
    if (!diagnostic.ok) blockers.push(`published bad resolve output is missing rejection diagnostic: ${diagnostic.label}`);
  }
  return {
    command,
    cwd,
    exitCode: result.status,
    ok: blockers.length === 0,
    stdout,
    stderr: result.stderr,
    blockers
  };
}

function run(command: readonly string[], cwd: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 * 30 });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function parseJson(text: string, blockers: string[], label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    blockers.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return { raw: text };
  }
}

function npmViewVersion(pkg: string): string {
  return execFileSync("npm", ["view", pkg, "version"], { encoding: "utf8" }).trim();
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = createAura3D106PublishedCliProofReport();
  writeAura3D106PublishedCliProofReport(root, report, readOption("--out") ?? defaultOutPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
