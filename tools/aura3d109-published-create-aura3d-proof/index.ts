import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

interface CommandProof {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

interface PublishedCreateAura3DProofReport {
  readonly schema: "aura3d109-published-create-aura3d-proof";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly packageName: "create-aura3d";
  readonly version: string;
  readonly template: "fighting-game";
  readonly projectDir: string;
  readonly engineDependency: string | null;
  readonly files: readonly string[];
  readonly commands: readonly CommandProof[];
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d109/published-create-aura3d-proof.json";
const expectedFiles = [
  "README.md",
  "index.html",
  "package.json",
  "playwright.config.ts",
  "src/aura-assets.ts",
  "src/game/fighters.ts",
  "src/game/moves.ts",
  "src/game/stage.ts",
  "src/main.ts",
  "src/styles.css",
  "tests/gameplay-smoke.spec.ts",
  "tests/route-health.spec.ts",
  "tsconfig.json"
] as const;

function readVersion(root: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "packages/create-aura3d/package.json"), "utf8")) as {
    readonly version?: string;
  };
  if (!pkg.version) throw new Error("packages/create-aura3d/package.json has no version.");
  return pkg.version;
}

function runCommand(command: readonly string[], cwd: string): CommandProof {
  try {
    const stdout = execFileSync(command[0]!, command.slice(1), {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180_000
    });
    return { command, cwd, ok: true, stdout: stdout.slice(-4000), stderr: "" };
  } catch (error) {
    const err = error as { readonly stdout?: Buffer | string; readonly stderr?: Buffer | string; readonly message?: string };
    return {
      command,
      cwd,
      ok: false,
      stdout: String(err.stdout ?? "").slice(-4000),
      stderr: String(err.stderr ?? "").slice(-4000),
      error: err.message ?? String(error)
    };
  }
}

function run(root: string, outPath = defaultOutPath): PublishedCreateAura3DProofReport {
  const version = readVersion(root);
  const workdir = mkdtempSync(join(tmpdir(), "aura3d-published-create-"));
  const projectDir = join(workdir, "fighter");
  const blockers: string[] = [];
  const commands: CommandProof[] = [];

  const scaffold = runCommand(["npx", "-y", `create-aura3d@${version}`, "fighter", "--template", "fighting-game"], workdir);
  commands.push(scaffold);
  if (!scaffold.ok) blockers.push(`Published create-aura3d@${version} failed to scaffold fighting-game.`);

  const presentFiles = expectedFiles.filter((file) => existsSync(join(projectDir, file)));
  for (const file of expectedFiles) {
    if (!presentFiles.includes(file)) blockers.push(`Scaffold is missing ${file}.`);
  }

  let engineDependency: string | null = null;
  const scaffoldPackagePath = join(projectDir, "package.json");
  if (existsSync(scaffoldPackagePath)) {
    const pkg = JSON.parse(readFileSync(scaffoldPackagePath, "utf8")) as {
      readonly dependencies?: Record<string, string>;
      readonly scripts?: Record<string, string>;
    };
    engineDependency = pkg.dependencies?.["@aura3d/engine"] ?? null;
    if (engineDependency !== version) {
      blockers.push(`Scaffold dependency @aura3d/engine is ${String(engineDependency)} instead of ${version}.`);
    }
    for (const script of ["build", "test"]) {
      if (!pkg.scripts?.[script]) blockers.push(`Scaffold package.json is missing ${script} script.`);
    }
  } else {
    blockers.push("Scaffold package.json is missing.");
  }

  if (existsSync(projectDir)) {
    const install = runCommand(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], projectDir);
    commands.push(install);
    if (!install.ok) blockers.push("Scaffold npm install failed.");

    const build = runCommand(["npm", "run", "build"], projectDir);
    commands.push(build);
    if (!build.ok) blockers.push("Scaffold npm run build failed.");

    const test = runCommand(["npm", "run", "test"], projectDir);
    commands.push(test);
    if (!test.ok) blockers.push("Scaffold npm run test failed.");
  }

  const report: PublishedCreateAura3DProofReport = {
    schema: "aura3d109-published-create-aura3d-proof",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    packageName: "create-aura3d",
    version,
    template: "fighting-game",
    projectDir,
    engineDependency,
    files: presentFiles,
    commands,
    blockers
  };

  const absoluteOut = join(root, outPath);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;
const report = run(process.cwd(), outPath);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
