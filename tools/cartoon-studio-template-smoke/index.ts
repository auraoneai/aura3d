import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

export interface CartoonStudioTemplateSmokeReport {
  readonly schema: "cartoon-studio-template-smoke/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly templateDir: string;
  readonly sourceChecks: readonly CartoonStudioTemplateSourceCheck[];
  readonly commandEvidence: readonly CartoonStudioCommandEvidence[];
  readonly blockers: readonly string[];
}

export interface CartoonStudioTemplateSourceCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface CartoonStudioCommandEvidence {
  readonly id: string;
  readonly command: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly skipped?: boolean;
}

export interface CartoonStudioTemplateSmokeOptions {
  readonly out?: string;
  readonly generatedAt?: string;
  readonly executeExternal?: boolean;
}

const defaultOut = "tests/reports/aura3d11/cartoon-template-smoke.json";
const templateDir = "packages/create-aura3d/templates/cartoon-studio";
const requiredEpisodeScripts = ["episode:plan", "episode:preview", "episode:render", "episode:package", "episode:review", "episode:verify"] as const;

export function createCartoonStudioTemplateSmokeReport(root = process.cwd(), options: CartoonStudioTemplateSmokeOptions = {}): CartoonStudioTemplateSmokeReport {
  const sourceChecks = createSourceChecks(root);
  const commandEvidence: CartoonStudioCommandEvidence[] = [];
  if (options.executeExternal) commandEvidence.push(...runExternalSmoke(root));
  else {
    commandEvidence.push({
      id: "external-clean-project-smoke",
      command: ["npx", "create-aura3d@latest", "<tmp>", "--template", "cartoon-studio"],
      cwd: root,
      exitCode: null,
      stdoutTail: "",
      stderrTail: "",
      skipped: true
    });
  }
  const blockers = [
    ...sourceChecks.filter((check) => !check.ok).map((check) => `${check.id}: ${check.detail}`),
    ...commandEvidence.filter((entry) => entry.exitCode !== 0 && !entry.skipped).map((entry) => `${entry.id}: command failed with ${entry.exitCode}`)
  ];
  return {
    schema: "cartoon-studio-template-smoke/v1",
    ok: blockers.length === 0,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    templateDir,
    sourceChecks,
    commandEvidence,
    blockers
  };
}

export function writeCartoonStudioTemplateSmokeReport(root: string, report: CartoonStudioTemplateSmokeReport, out = defaultOut): void {
  const absoluteOut = join(root, out);
  mkdirSync(dirname(absoluteOut), { recursive: true });
  writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`);
}

function createSourceChecks(root: string): CartoonStudioTemplateSourceCheck[] {
  const checks: CartoonStudioTemplateSourceCheck[] = [];
  const packagePath = join(templateDir, "package.json");
  const packageJson = readJsonIfPresent(join(root, packagePath)) as { scripts?: Record<string, string> } | null;
  checks.push({
    id: "cartoon-studio-package-json",
    ok: Boolean(packageJson),
    detail: `${packagePath} must exist and parse.`
  });
  const scripts = packageJson?.scripts ?? {};
  for (const script of requiredEpisodeScripts) {
    checks.push({
      id: `script:${script}`,
      ok: typeof scripts[script] === "string" && scripts[script].trim().length > 0,
      detail: `${packagePath} must define ${script}.`
    });
  }
  checks.push({
    id: "episode-verify-composes-gates",
    ok: typeof scripts["episode:verify"] === "string" && /episode:(?:render|package|review)|cartoon-studio|motion|visual|package/.test(scripts["episode:verify"] ?? ""),
    detail: "episode:verify must run render/package/review or cartoon-studio quality gates."
  });

  const studioSource = [
    join(templateDir, "src/main.ts"),
    join(templateDir, "src/render-plan.ts"),
    join(templateDir, "README.md")
  ].map((path) => readText(root, path)).join("\n");
  checks.push({
    id: "public-api-only",
    ok: !/\bfrom\s+["']three(?:["'/])|three\/(?:examples|addons)|\bGLTFLoader\b|\bTHREE\./.test(studioSource),
    detail: "cartoon-studio must use public @aura3d/engine APIs, not three/GLTFLoader."
  });
  checks.push({
    id: "typed-assets",
    ok: /model\s*\(\s*assets\.miko(?:\s*[),])/.test(studioSource)
      && /model\s*\(\s*assets\.luma(?:\s*[),])/.test(studioSource)
      && /model\s*\(\s*assets\.moonGarden(?:\s*[),])/.test(studioSource),
    detail: "cartoon-studio must consume miko, luma, and moonGarden through typed assets."
  });
  checks.push({
    id: "asset-manifest",
    ok: existsSync(join(root, templateDir, "aura.assets.json")),
    detail: "cartoon-studio must include aura.assets.json so assets validate-cartoon can prove the typed starter assets."
  });

  const releaseFacingText = [
    join(templateDir, "package.json"),
    join("packages/create-aura3d/templates/cartoon-channel/package.json")
  ].map((path) => `${path}\n${readText(root, path)}`).join("\n");
  checks.push({
    id: "no-image-puppet-release-facing-script",
    ok: !/record:image-puppet|view=image-puppet|cartoon-image-puppet-animation\.webm/i.test(releaseFacingText),
    detail: "Release-facing template scripts/docs must not present image-puppet output as a route or proof artifact."
  });
  checks.push({
    id: "source-only-not-publish-proof",
    ok: !/publishReady\s*:\s*true[\s\S]{0,200}sourceOnly\s*:\s*true|sourceOnly\s*:\s*true[\s\S]{0,200}publishReady\s*:\s*true/.test(studioSource),
    detail: "sourceOnly evidence must not be marked publish-ready."
  });
  return checks;
}

function runExternalSmoke(root: string): CartoonStudioCommandEvidence[] {
  const tempRoot = mkdtempSync(join(tmpdir(), "aura3d11-cartoon-smoke-"));
  const projectDir = join(tempRoot, "moon-garden");
  const commands: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ["scaffold", ["node", join(root, "packages/create-aura3d/dist/cli.js"), projectDir, "--template", "cartoon-studio"], root],
    ["install", ["npm", "install", "--ignore-scripts"], projectDir],
    ["asset-validate-cartoon", ["node", join(root, "packages/aura3d-cli/dist/cli.js"), "assets", "validate-cartoon", "--episode", "--require-license", "--no-placeholders", "--json"], projectDir],
    ["episode-plan", ["npm", "run", "episode:plan"], projectDir],
    ["episode-preview", ["npm", "run", "episode:preview"], projectDir],
    ["episode-package", ["npm", "run", "episode:package"], projectDir],
    ["episode-review", ["npm", "run", "episode:review"], projectDir],
    ["build", ["npm", "run", "build"], projectDir],
    ["test", ["npm", "test"], projectDir]
  ];
  const evidence: CartoonStudioCommandEvidence[] = [];
  try {
    for (const [id, command, cwd] of commands) evidence.push(runCommand(id, command, cwd));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  return evidence;
}

function runCommand(id: string, command: readonly string[], cwd: string): CartoonStudioCommandEvidence {
  try {
    const stdout = execFileSync(command[0] ?? "", command.slice(1), {
      cwd,
      env: cleanExternalCommandEnv(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000
    });
    return {
      id,
      command,
      cwd,
      exitCode: 0,
      stdoutTail: tail(stdout),
      stderrTail: ""
    };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      id,
      command,
      cwd,
      exitCode: typeof failure.status === "number" ? failure.status : 1,
      stdoutTail: tail(String(failure.stdout ?? "")),
      stderrTail: tail(String(failure.stderr ?? ""))
    };
  }
}

function cleanExternalCommandEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  delete env.TSX_TSCONFIG;
  return env;
}

function tail(value: string, max = 4000): string {
  return value.length > max ? value.slice(value.length - max) : value;
}

function readText(root: string, path: string): string {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function readJsonIfPresent(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv: readonly string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const currentScript = process.argv[1] ? relative(process.cwd(), process.argv[1]) : "";
if (currentScript.endsWith("tools/cartoon-studio-template-smoke/index.ts") || currentScript.endsWith("tools/cartoon-studio-template-smoke/index.js")) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = createCartoonStudioTemplateSmokeReport(root, {
    executeExternal: args["execute-external"] === true
  });
  writeCartoonStudioTemplateSmokeReport(root, report, typeof args.out === "string" ? args.out : defaultOut);
  if (!report.ok) {
    console.error(report.blockers.join("\n"));
    process.exitCode = 1;
  }
}
