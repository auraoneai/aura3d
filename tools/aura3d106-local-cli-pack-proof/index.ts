import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export interface Aura3D106LocalCliPackProofReport {
  readonly schema: "aura3d106-local-cli-pack-proof";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packDir: string;
  readonly consumerDir: string;
  readonly tarballs: {
    readonly assetIndex: string;
    readonly cli: string;
  };
  readonly cliPackedDependency: string | null;
  readonly install: CommandProof;
  readonly search: CommandProof;
  readonly badResolve: CommandProof;
  readonly blockers: readonly string[];
}

interface CommandProof {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stdout: unknown;
  readonly stderr: string;
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d106/local-cli-catalog-pack-proof.json";

export function createAura3D106LocalCliPackProofReport(root = process.cwd()): Aura3D106LocalCliPackProofReport {
  const packDir = mkdtempSync(join(tmpdir(), "aura3d106-cli-pack-"));
  const consumerDir = mkdtempSync(join(tmpdir(), "aura3d106-cli-consumer-"));
  const assetIndex = packPackage(root, "packages/asset-index", packDir, "aura3d-asset-index-*.tgz");
  const cli = packPackage(root, "packages/aura3d-cli", packDir, "aura3d-cli-*.tgz");
  const cliPackedDependency = readPackedCliAssetIndexDependency(cli);
  const install = installPackedCli(consumerDir, assetIndex, cli);
  const search = runPackedSearch(consumerDir);
  const badResolve = runPackedBadResolve(consumerDir);
  const blockers = [
    ...(cliPackedDependency && !cliPackedDependency.startsWith("workspace:")
      ? []
      : [`packed @aura3d/cli dependency is not publishable: ${cliPackedDependency ?? "missing"}`]),
    ...install.blockers.map((blocker) => `install: ${blocker}`),
    ...search.blockers.map((blocker) => `search: ${blocker}`),
    ...badResolve.blockers.map((blocker) => `bad-resolve: ${blocker}`)
  ];

  return {
    schema: "aura3d106-local-cli-pack-proof",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    packDir,
    consumerDir,
    tarballs: { assetIndex, cli },
    cliPackedDependency,
    install,
    search,
    badResolve,
    blockers
  };
}

export function writeAura3D106LocalCliPackProofReport(root: string, report: Aura3D106LocalCliPackProofReport, outPath = defaultOutPath): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function packPackage(root: string, packageDir: string, packDir: string, pattern: string): string {
  execFileSync("pnpm", ["pack", "--pack-destination", packDir, "--silent"], {
    cwd: join(root, packageDir),
    encoding: "utf8",
    stdio: "pipe"
  });
  const prefix = pattern.replace("*.tgz", "");
  const tarball = readdirSync(packDir)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".tgz"))
    .sort()
    .at(-1);
  if (!tarball) throw new Error(`Failed to locate packed tarball for ${packageDir}`);
  return join(packDir, tarball);
}

function readPackedCliAssetIndexDependency(cliTarball: string): string | null {
  const manifestText = execFileSync("tar", ["-xOf", cliTarball, "package/package.json"], { encoding: "utf8" });
  const manifest = JSON.parse(manifestText) as { readonly dependencies?: Record<string, string> };
  return manifest.dependencies?.["@aura3d/asset-index"] ?? null;
}

function installPackedCli(consumerDir: string, assetIndexTarball: string, cliTarball: string): CommandProof {
  execFileSync("npm", ["init", "-y", "--silent"], { cwd: consumerDir, encoding: "utf8" });
  const command = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", assetIndexTarball, cliTarball];
  const result = run(command, consumerDir);
  const blockers: string[] = [];
  if (result.status !== 0) blockers.push(`clean install exited ${String(result.status)}.`);
  const text = `${result.stdout}\n${result.stderr}`;
  if (/EUNSUPPORTEDPROTOCOL|workspace:/i.test(text)) blockers.push("clean install saw workspace protocol output.");
  return {
    command,
    cwd: consumerDir,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    blockers
  };
}

function runPackedSearch(consumerDir: string): CommandProof {
  const command = [
    "./node_modules/.bin/aura3d",
    "assets",
    "search",
    "animated humanoid fighting character",
    "--profile",
    "fighting-character",
    "--json"
  ];
  const result = run(command, consumerDir);
  const blockers: string[] = [];
  const stdout = parseJson(result.stdout, blockers, "packed search stdout");
  const candidates = Array.isArray((stdout as { readonly candidates?: unknown }).candidates)
    ? ((stdout as { readonly candidates: readonly unknown[] }).candidates)
    : [];
  const rejectedCandidates = Array.isArray((stdout as { readonly rejectedCandidates?: unknown }).rejectedCandidates)
    ? ((stdout as { readonly rejectedCandidates: readonly unknown[] }).rejectedCandidates)
    : [];
  if (result.status !== 0) blockers.push(`packed search exited ${String(result.status)}.`);
  if ((stdout as { readonly ok?: unknown }).ok !== true) blockers.push("packed search did not return ok=true.");
  if ((stdout as { readonly profile?: unknown }).profile !== "fighting-character") blockers.push("packed search did not report profile=fighting-character.");
  if (candidates.length < 1) {
    const text = JSON.stringify(stdout).toLowerCase();
    if (
      rejectedCandidates.length < 1 ||
      !text.includes("no fighting-character-ready candidate") ||
      !text.includes("rejectionreasons")
    ) {
      blockers.push("packed search returned no profile-ready fighting-character candidates without honest rejection diagnostics.");
    }
  }
  for (const candidate of candidates) {
    const record = candidate as { readonly profile?: { readonly name?: unknown; readonly suitable?: unknown }; readonly title?: unknown; readonly id?: unknown };
    if (record.profile?.name !== "fighting-character") blockers.push(`candidate ${String(record.id)} is missing fighting-character profile diagnostics.`);
    if (record.profile?.suitable !== true) blockers.push(`candidate ${String(record.id)} is not suitable but remained in candidates.`);
  }
  if (JSON.stringify(candidates).toLowerCase().includes("spider")) {
    blockers.push("packed search usable candidates still include spider results.");
  }
  return {
    command,
    cwd: consumerDir,
    exitCode: result.status,
    stdout,
    stderr: result.stderr,
    blockers
  };
}

function runPackedBadResolve(consumerDir: string): CommandProof {
  const command = [
    "./node_modules/.bin/aura3d",
    "assets",
    "resolve",
    "static aircraft",
    "--name",
    "badFighter",
    "--profile",
    "fighting-character",
    "--json"
  ];
  const result = run(command, consumerDir);
  const blockers: string[] = [];
  const stdout = result.stdout.trim().length > 0 ? parseJson(result.stdout, blockers, "packed bad resolve stdout") : { raw: "" };
  if (result.status === 0 && (stdout as { readonly ok?: unknown }).ok === true) {
    blockers.push("packed resolve accepted static aircraft as a fighting-character asset.");
  }
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  for (const token of ["fighting-character", "animation", "character", "aircraft"]) {
    if (!text.includes(token)) blockers.push(`packed bad resolve output is missing diagnostic token: ${token}`);
  }
  return {
    command,
    cwd: consumerDir,
    exitCode: result.status,
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

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = createAura3D106LocalCliPackProofReport(root);
  writeAura3D106LocalCliPackProofReport(root, report, readOption("--out") ?? defaultOutPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
