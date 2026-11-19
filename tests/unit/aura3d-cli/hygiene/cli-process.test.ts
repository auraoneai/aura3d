/**
 * @aura3d/cli 5.6.0 A6 — the CLI process: --version, exit codes (0 ok / 1 failure / 2 usage + unknown with
 * "did you mean"), help --json, and `--help` never runs (or writes from) any verb. Runs src/cli.ts through tsx;
 * every invocation runs once in beforeAll through a small pool (see CLI_POOL).
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const repo = join(__dirname, "../../../..");
const tsx = join(repo, "node_modules/.bin/tsx");
const cli = join(repo, "packages/aura3d-cli/src/cli.ts");

interface Run { readonly code: number; readonly stdout: string; readonly stderr: string }

function run(args: readonly string[], cwd: string): Promise<Run> {
  return new Promise((resolve) => {
    execFile(tsx, ["--tsconfig", join(repo, "tsconfig.base.json"), cli, ...args], { cwd, encoding: "utf8", timeout: 110_000, env: { ...process.env, NODE_NO_WARNINGS: "1" } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

function listFiles(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else out[relative(dir, path)] = stat.mtimeMs;
    }
  };
  walk(dir);
  return out;
}

/** A small consumer project: manifest, typed module, an animation-studio style package.json with a lockfile. */
function consumerProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "a3d-cli-proc-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module", scripts: { scene: "node -e \"console.log('scene ran')\"" } }, null, 2));
  writeFileSync(join(dir, "package-lock.json"), "{}");
  writeFileSync(join(dir, "aura.assets.json"), JSON.stringify({ version: 1, outputDir: "public/aura-assets", assetBasePath: "/aura-assets/", typesFile: "src/aura-assets.ts", assets: [] }, null, 2));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/aura-assets.ts"), "// user edited\nexport const assets = {};\n");
  return dir;
}

const HELP_WRITERS: readonly (readonly string[])[] = [
  ["assets", "typegen", "--help"],
  ["assets", "thumbnail", "--help"],
  ["assets", "resolve", "robot", "--name", "robot", "--help"],
  ["assets", "add", "model.glb", "--name", "x", "-h"],
  ["assets", "admit", "hero", "--help"],
  ["init", "--agent", "all", "--help"],
  ["animation", "scene", "new", "--help"],
  ["codemod", "renderer-imports", "src/**/*.ts", "--write", "--help"],
  ["assets", "repair-skin", "x.glb", "--help"],
  ["meshy", "ledger", "reserve", "--help"]
];

let project: string;
let before: Record<string, number>;
const results = new Map<string, Run>();
const CLI_POOL = Math.max(2, Math.min(4, availableParallelism()));

beforeAll(async () => {
  project = consumerProject();
  before = listFiles(project);
  const empty = mkdtempSync(join(tmpdir(), "a3d-cli-empty-"));
  writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "empty", private: true, scripts: { build: "vite build" } }));
  const jobs: [string, readonly string[], string][] = [
    ["version", ["--version"], project],
    ["version-json", ["--version", "--json"], project],
    ["unknown", ["asets", "add"], project],
    ["unknown-sub", ["assets", "budget"], project],
    ["usage", ["assets", "inspect"], project],
    ["help-json", ["help", "--json"], project],
    ["help-cmd", ["help", "assets", "repair-skin"], project],
    ["help-unknown", ["help", "nope"], project],
    ["bare", [], project],
    ["group", ["look"], project],
    ["anim-missing", ["animation", "plan"], empty],
    ["anim-dry", ["animation", "scene", "cast", "add", "--dry-run"], project],
    ...HELP_WRITERS.map((args): [string, readonly string[], string] => [`help:${args.join(" ")}`, args, project])
  ];
  // Each tsx cold start transforms the whole CLI graph (~3 CPU-s, ~250 MB). All 22 at once on the 2-vCPU ACR runner
  // (next to the other vitest worker) thrashed until every process hit the 110 s kill (exit 143), so cap concurrency.
  let next = 0;
  await Promise.all(Array.from({ length: CLI_POOL }, async () => {
    while (next < jobs.length) {
      const [key, args, cwd] = jobs[next++]!;
      results.set(key, await run(args, cwd));
    }
  }));
}, 300_000);

describe("aura3d CLI process", () => {
  it("--version prints the package version", () => {
    // invariant: the CLI's --version must print packages/aura3d-cli/package.json's version; the toContain checks are on the spawned process output, not on source text.
    const pkg = JSON.parse(readFileSync(join(repo, "packages/aura3d-cli/package.json"), "utf8")) as { version: string };
    expect(results.get("version")).toMatchObject({ code: 0, stdout: `${pkg.version}\n` });
    expect(JSON.parse(results.get("version-json")!.stdout)).toEqual({ name: "@aura3d/cli", version: pkg.version });
  });

  it("unknown commands exit 2 with did-you-mean", () => {
    const unknown = results.get("unknown")!;
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("Did you mean: aura3d assets add");
    const sub = results.get("unknown-sub")!;
    expect(sub.code).toBe(2);
    expect(sub.stderr).toContain('unknown command "assets budget"');
    expect(results.get("help-unknown")!.code).toBe(2);
  });

  it("usage errors exit 2", () => {
    const usage = results.get("usage")!;
    expect(usage.code).toBe(2);
    expect(usage.stderr).toMatch(/^Usage: aura3d assets inspect/);
  });

  it("help --json is the full catalog; help <cmd> prints full usage; bare and group help exit 0", () => {
    const catalog = JSON.parse(results.get("help-json")!.stdout) as { schema: string; commands: { name: string; flags: string[] }[] };
    expect(catalog.schema).toBe("aura3d.cli-help/1");
    expect(catalog.commands.map((c) => c.name)).toEqual(expect.arrayContaining(["assets add", "vfx validate-atlas", "perf gate", "animation scene"]));
    const repair = results.get("help-cmd")!;
    expect(repair.code).toBe(0);
    expect(repair.stdout).toContain("--refit-skeleton");
    expect(results.get("bare")).toMatchObject({ code: 0 });
    expect(results.get("bare")!.stdout).toContain("aura3d help [command ...] [--json]");
    expect(results.get("group")!.stdout).toContain("aura3d look capture");
  });

  it("animation verbs check the npm script exists and use the project's package manager", () => {
    const missing = results.get("anim-missing")!;
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('has none (scripts: build)');
    const dry = results.get("anim-dry")!;
    expect(dry.code).toBe(0);
    const report = JSON.parse(dry.stdout) as { runner: string; scriptFound: boolean; commandLine: string[] };
    expect(report).toMatchObject({ runner: "npm", scriptFound: true, commandLine: ["npm", "run", "scene", "--", "cast", "add"] });
  });

  it("--help prints usage, exits 0 and writes nothing for every verb", () => {
    for (const args of HELP_WRITERS) {
      const result = results.get(`help:${args.join(" ")}`)!;
      expect(result.code, args.join(" ")).toBe(0);
      expect(result.stdout, args.join(" ")).toContain(`aura3d ${args[0]}`);
    }
    expect(listFiles(project)).toEqual(before);
    expect(readFileSync(join(project, "src/aura-assets.ts"), "utf8")).toBe("// user edited\nexport const assets = {};\n");
  });
});
