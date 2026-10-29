/**
 * The published consumer path, from nothing (PRD 03 gap 03:174; PRD 06 F0.1/F0.2): in a temporary folder outside the
 * repo, the way a new consumer starts, with the pinned 4.5.0 packages from the npm registry:
 *   npx -y create-aura3d@4.5.0 smoke --template mini-game --no-agent
 *   npm install
 *   npm run build                                   (the template's typecheck, then vite build)
 *   npx -y @aura3d/cli@4.5.0 check-deploy --dist dist
 *   npx -y @aura3d/cli@4.5.0 check-deploy --dist dist --browser --route / --browser-timeout 180000 --browser-settle 300000
 * Every step must exit 0 (the run stops at the first that does not), with one recorded exception: the --browser pass of
 * the 4.5.0 mini-game scaffold fails on 404s for the template's own demo media (its game-sfx-core pack and audio-codec
 * probes under /packs/ and /probes/, and the external Textures/colormap.png one Kenney GLB names), which the scaffold
 * does not ship. That is an upstream template defect (07 B32), not the SDK: those failures are listed in the record
 * and any other failure still fails the test. `npm ls @aura3d/engine @aura3d/cli --json` is
 * recorded, and the engine must resolve to 4.5.0; npm ls itself exits 1 here because the scaffold does not list the
 * CLI (consumers run it with npx), so its exit status is recorded, not gated. The browser pass loads the built site
 * from a static server in the scaffold's own Playwright Chromium (software WebGL2 on the runner) and fails on HTTP
 * errors, failed requests, uncaught errors and console errors. npm runs with the runner's pnpm and Playwright
 * variables removed, so it behaves as in a fresh shell.
 * Remote runner only (needs the npm registry): apps/veer-wonder-world/tools/remote-run.sh consumer-smoke
 * (estimated 8-12 min)
 *
 * Records: WWJSON consumer-smoke (the scaffold's file list, the dist summary, the npm ls versions and every step's
 * command, exit status, time and redacted output tail).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { emitJson, redact, runCommit } from "./wonder-world-lib";

const CREATE = "create-aura3d@4.5.0";
const CLI = "@aura3d/cli@4.5.0";
const ENGINE_VERSION = "4.5.0";
const MINUTE = 60_000;

interface StepResult {
  readonly name: string;
  readonly command: string;
  readonly status: number | null;
  readonly signal: string | null;
  readonly error: string | null;
  readonly seconds: number;
  readonly tail: string;
}

/** The environment of a fresh consumer shell: the runner's pnpm, npm-script and loader variables are left out. */
function consumerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(?:npm_|pnpm_|PNPM_|INIT_CWD$|NODE_OPTIONS$|NODE_PATH$)/.test(key)) continue;
    env[key] = value;
  }
  return { ...env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", npm_config_color: "false", npm_config_fund: "false", npm_config_audit: "false", npm_config_update_notifier: "false" };
}

/** Terminal colour codes, should a tool print them anyway. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g");

function clean(text: string, root: string): string {
  return redact(text.split(root).join("<tmp>").replace(ANSI, ""));
}

/** Runs one step; the record keeps its command, exit, time and a redacted output tail (stdout is returned for parsing). */
function runStep(name: string, cmd: string, args: readonly string[], cwd: string, timeoutMs: number, root: string): { readonly step: StepResult; readonly stdout: string } {
  const started = Date.now();
  const result = spawnSync(cmd, [...args], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: consumerEnv() });
  const out = clean(`${result.stdout ?? ""}\n${result.stderr ?? ""}`, root);
  const step: StepResult = {
    name,
    command: [cmd, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    error: result.error ? clean(result.error.message, root) : null,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    tail: out.split("\n").filter((line) => line.trim().length > 0).slice(-40).join("\n").slice(-4_000)
  };
  console.log(`consumer-smoke ${name}: exit ${String(step.status)} in ${step.seconds} s`);
  return { step, stdout: result.stdout ?? "" };
}

/** Files under `dir` (node_modules and .git left out), relative, with sizes. */
function fileList(dir: string): { readonly path: string; readonly bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push({ path: relative(dir, path).split("\\").join("/"), bytes: statSync(path).size });
    }
  };
  walk(dir);
  return out;
}

/**
 * --browser failures that come from the 4.5.0 mini-game template's own demo media, not from the SDK (07 B32): the
 * template plays its game-sfx-core pack and the audio-codec probes from /packs/ and /probes/, and one Kenney GLB names
 * an external Textures/colormap.png; the scaffold ships none of them.
 */
const UPSTREAM_TEMPLATE_404: readonly RegExp[] = [
  /^Route \S+ request failed with HTTP 404 \/packs\/game-sfx-core\/[\w.-]+\.m4a\.?$/,
  /^Route \S+ request failed with HTTP 404 \/probes\/probe-20ms\.[\w.]+\.?$/,
  /^Route \S+ request failed with HTTP 404 \/aura-assets\/Textures\/colormap\.png\.?$/
];

/** The JSON report check-deploy prints on stdout (the outermost object), or null when there is none. */
function deployReport(stdout: string): { readonly ok: boolean; readonly failures: readonly string[] } | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null || !("failures" in parsed) || !Array.isArray(parsed.failures)) return null;
    const failures = parsed.failures.filter((item): item is string => typeof item === "string");
    return { ok: "ok" in parsed && parsed.ok === true, failures };
  } catch {
    return null;
  }
}

/** The version npm ls reports for a direct dependency, or null when the tree does not have it. */
function lsVersion(tree: unknown, name: string): string | null {
  if (typeof tree !== "object" || tree === null || !("dependencies" in tree)) return null;
  const dependencies: unknown = tree.dependencies;
  if (typeof dependencies !== "object" || dependencies === null || !(name in dependencies)) return null;
  const entry: unknown = Object.entries(dependencies).find(([key]) => key === name)?.[1];
  if (typeof entry !== "object" || entry === null || !("version" in entry)) return null;
  return typeof entry.version === "string" ? entry.version : null;
}

test("create-aura3d@4.5.0 mini-game: scaffold, install, build and check-deploy pass (--browser: nothing beyond the template's known missing demo media)", async () => {
  test.setTimeout(40 * MINUTE);
  const root = mkdtempSync(join(tmpdir(), "ww-consumer-"));
  const app = join(root, "smoke");
  const steps: StepResult[] = [];
  const record: Record<string, unknown> = { runId: process.env["AURA3D_RUN_ID"] ?? null, commit: runCommit(), create: CREATE, cli: CLI, node: process.version, template: "mini-game", steps };
  const gate = ({ step }: { readonly step: StepResult }): void => {
    steps.push(step);
    expect(step.status, `${step.name} (${step.command}) exits 0:\n${step.tail}`).toBe(0);
  };
  try {
    gate(runStep("create", "npx", ["-y", CREATE, "smoke", "--template", "mini-game", "--no-agent"], root, 10 * MINUTE, root));
    expect(existsSync(join(app, "package.json")), "the scaffold has a package.json").toBe(true);
    record["scaffold"] = fileList(app);

    gate(runStep("install", "npm", ["install", "--no-audit", "--no-fund"], app, 20 * MINUTE, root));
    const ls = runStep("npm ls", "npm", ["ls", "@aura3d/engine", "@aura3d/cli", "--json"], app, 2 * MINUTE, root);
    steps.push(ls.step);
    let tree: unknown = null;
    try {
      tree = JSON.parse(ls.stdout || "null");
    } catch {
      tree = null;
    }
    const versions = { "@aura3d/engine": lsVersion(tree, "@aura3d/engine"), "@aura3d/cli": lsVersion(tree, "@aura3d/cli") };
    record["npmLs"] = { status: ls.step.status, versions, note: "npm ls exits 1 when a named package is not in the tree; the scaffold runs the CLI through npx." };
    expect(versions["@aura3d/engine"], "the scaffold installs @aura3d/engine 4.5.0").toBe(ENGINE_VERSION);

    gate(runStep("build", "npm", ["run", "build"], app, 15 * MINUTE, root));
    const dist = join(app, "dist");
    expect(existsSync(join(dist, "index.html")), "the build writes dist/index.html").toBe(true);
    const distFiles = fileList(dist);
    record["dist"] = { files: distFiles.length, bytes: distFiles.reduce((sum, file) => sum + file.bytes, 0), list: distFiles.slice(0, 200) };

    gate(runStep("check-deploy", "npx", ["-y", CLI, "check-deploy", "--dist", "dist"], app, 10 * MINUTE, root));
    // A 300 s settle: on software WebGL2 a shorter one closes the page while the template's largest GLB still downloads.
    const browser = runStep(
      "check-deploy --browser",
      "npx",
      ["-y", CLI, "check-deploy", "--dist", "dist", "--browser", "--route", "/", "--browser-timeout", "180000", "--browser-settle", "300000"],
      app,
      20 * MINUTE,
      root
    );
    steps.push(browser.step);
    const report = deployReport(browser.stdout);
    expect(report, `check-deploy --browser prints its JSON report:\n${browser.step.tail}`).not.toBeNull();
    const failures = report?.failures ?? [];
    const upstream = failures.filter((failure) => UPSTREAM_TEMPLATE_404.some((pattern) => pattern.test(failure)));
    const other = failures.filter((failure) => !upstream.includes(failure));
    record["browser"] = { status: browser.step.status, failures: failures.length, upstreamTemplate404: upstream.map((failure) => clean(failure, root)), other: other.map((failure) => clean(failure, root)) };
    expect(other, "check-deploy --browser finds nothing beyond the template's known missing demo media (07 B32)").toEqual([]);
    expect(browser.step.status === 0 || upstream.length > 0, `check-deploy --browser exits 0 or fails only on the known template media:\n${browser.step.tail}`).toBe(true);
    record["passed"] = true;
  } finally {
    emitJson("consumer-smoke", record);
    rmSync(root, { recursive: true, force: true });
  }
});
