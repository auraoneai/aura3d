#!/usr/bin/env node
/**
 * @aura3d/cli packed-tarball smoke (5.6.0 A6 / release gate).
 *
 * Proves the CLI works from `npm install` in a project that is NOT the Aura3D repo:
 *   1. `pnpm pack` @aura3d/cli and (default) every workspace package it depends on, transitively, so the
 *      smoke tests the bytes that would be published (pass --registry-deps to take the deps from npm instead);
 *   2. create a temp npm project that depends on the CLI tarball (workspace deps pinned to their tarballs
 *      through `overrides`) and `npm install` it — no repo paths, no tsconfig paths, no tools/;
 *   3. write fixtures (tools/cli-packed-smoke/fixtures.ts, run from the repo with tsx);
 *   4. run the installed `aura3d` bin: --version, help --json, assets add + assets admit (G6 decodes the embedded
 *      PNG with sharp from the install), vfx validate-atlas, a monorepo-only verb (must fail fast, exit 2), and,
 *      when the verb is in `help --json`, assets convert / assets preview / animation import --dry-run /
 *      assets generate --dry-run (a verb that is not registered yet is SKIPPED with a message, never failed).
 *
 * Needs a built dist (`pnpm build`), network for npm install, and no browser. Run it on the remote runner for
 * the release gate; locally it is a few minutes.
 *
 *   node tools/cli-packed-smoke/index.mjs [--build] [--cli-dir packages/aura3d-cli] [--registry-deps]
 *                                         [--report tests/reports/cli-packed-smoke.json] [--keep-tmp]
 *                                         [--consumer-dir <dir>]   (re-run the checks in a kept, installed consumer)
 *
 * Exit 0 when every run check passes (skips allowed), 1 when any check fails, 2 on a usage/setup error.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (flag("--help") || flag("-h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

const cliDir = resolve(REPO, option("--cli-dir") ?? "packages/aura3d-cli");
const reportPath = option("--report") ? resolve(process.cwd(), option("--report")) : undefined;
const registryDeps = flag("--registry-deps");
const reuseConsumer = option("--consumer-dir") ? resolve(process.cwd(), option("--consumer-dir")) : undefined;
const keepTmp = flag("--keep-tmp") || reuseConsumer !== undefined;
const log = (line) => console.error(`[cli-packed-smoke] ${line}`);

function fail(message, code = 2) {
  log(message);
  process.exit(code);
}

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...options });
}

/** name -> { dir, pkg } for every workspace package under packages/. */
function workspacePackages() {
  const map = new Map();
  for (const name of readdirSync(join(REPO, "packages"))) {
    const file = join(REPO, "packages", name, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (pkg.name) map.set(pkg.name, { dir: join(REPO, "packages", name), pkg });
  }
  return map;
}

const workspaceSpec = (spec) => typeof spec === "string" && spec.startsWith("workspace:");

/** Transitive workspace dependencies of a package.json (runtime deps only). */
function workspaceClosure(pkg, workspace) {
  const seen = new Set();
  const visit = (current) => {
    for (const [name, spec] of Object.entries(current.dependencies ?? {})) {
      if (!workspaceSpec(spec) || seen.has(name)) continue;
      const entry = workspace.get(name);
      if (!entry) fail(`${current.name} depends on ${name} (${spec}) but no packages/* package has that name`);
      seen.add(name);
      visit(entry.pkg);
    }
  };
  visit(pkg);
  return [...seen].sort();
}

/** Packs a package dir; a dir outside the workspace gets its workspace: specs pinned to the workspace versions first. */
function pack(dir, outDir, workspace) {
  if (!existsSync(join(dir, "dist"))) fail(`${relative(REPO, dir) || dir}/dist is missing: run \`pnpm build\` first (or pass --build)`);
  const inside = !relative(join(REPO, "packages"), dir).startsWith("..") && !isAbsolute(relative(join(REPO, "packages"), dir));
  let out;
  if (inside) {
    out = sh("pnpm", ["pack", "--pack-destination", outDir], { cwd: dir });
  } else {
    const file = join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
        if (workspaceSpec(spec)) pkg[field][name] = workspace.get(name)?.pkg.version ?? fail(`unknown workspace dependency ${name}`);
      }
    }
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    out = sh("npm", ["pack", "--pack-destination", outDir, "--silent"], { cwd: dir });
  }
  const tgz = out.trim().split("\n").filter((line) => line.trim().endsWith(".tgz")).pop()?.trim();
  if (!tgz) fail(`could not read the tarball name from pack output in ${dir}:\n${out}`);
  return isAbsolute(tgz) ? tgz : join(outDir, tgz.split("/").pop());
}

// ---------------------------------------------------------------------------

if (flag("--build")) {
  log("pnpm build …");
  const build = spawnSync("pnpm", ["build"], { cwd: REPO, stdio: "inherit" });
  if (build.status !== 0) fail("pnpm build failed", 1);
}

const cliPkg = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8"));
if (cliPkg.name !== "@aura3d/cli") fail(`${cliDir} is not @aura3d/cli (found ${cliPkg.name})`);
const workspace = workspacePackages();
const tmp = mkdtempSync(join(tmpdir(), "aura3d-cli-packed-"));
const tarballs = join(tmp, "tarballs");
const project = reuseConsumer ?? join(tmp, "consumer");
const home = join(tmp, "home");
mkdirSync(tarballs, { recursive: true });
mkdirSync(project, { recursive: true });
mkdirSync(home, { recursive: true });

const report = {
  schema: "aura3d.cli-packed-smoke/1",
  generatedAt: new Date().toISOString(),
  cli: { name: cliPkg.name, version: cliPkg.version, dir: relative(REPO, cliDir) || cliDir },
  depsFrom: registryDeps ? "npm-registry" : "local-tarballs",
  tarballs: {},
  checks: [],
  ok: false
};

let exitCode = 1;
try {
  if (reuseConsumer) {
    if (!existsSync(join(project, "node_modules", ".bin"))) throw new Error(`--consumer-dir ${project} has no installed node_modules`);
    report.checks.push({ id: "npm-install", status: "skip", detail: `reusing ${project}` });
  } else {
  log(`packing ${cliPkg.name}@${cliPkg.version} …`);
  const cliTgz = pack(cliDir, tarballs, workspace);
  report.tarballs[cliPkg.name] = relative(tmp, cliTgz);
  const overrides = {};
  if (!registryDeps) {
    for (const name of workspaceClosure(cliPkg, workspace)) {
      log(`packing ${name} …`);
      const tgz = pack(workspace.get(name).dir, tarballs, workspace);
      report.tarballs[name] = relative(tmp, tgz);
      overrides[name] = `file:${tgz}`;
    }
  }
  writeFileSync(join(project, "package.json"), `${JSON.stringify({
    name: "aura3d-cli-packed-consumer",
    private: true,
    type: "module",
    dependencies: { [cliPkg.name]: `file:${cliTgz}` },
    ...(Object.keys(overrides).length ? { overrides } : {})
  }, null, 2)}\n`);

  log("npm install (temp consumer project) …");
  const install = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: project, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (install.status !== 0) {
    report.checks.push({ id: "npm-install", status: "fail", detail: `${install.stdout}\n${install.stderr}`.trim().slice(-4000) });
    throw new Error("npm install failed");
  }
  report.checks.push({ id: "npm-install", status: "pass" });
  }

  log("writing fixtures …");
  const tsx = join(REPO, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const fixtures = spawnSync(tsx, ["--tsconfig", join(REPO, "tsconfig.base.json"), join(REPO, "tools/cli-packed-smoke/fixtures.ts"), project], { cwd: REPO, encoding: "utf8" });
  if (fixtures.status !== 0) {
    report.checks.push({ id: "fixtures", status: "fail", detail: `${fixtures.stdout}\n${fixtures.stderr}`.trim().slice(-4000) });
    throw new Error("fixture generation failed");
  }

  const bin = join(project, "node_modules", ".bin", process.platform === "win32" ? "aura3d.cmd" : "aura3d");
  // HOME is the temp dir and FAL_KEY is unset: no user config, no paid call can be authorised.
  const env = { ...process.env, HOME: home, USERPROFILE: home, FAL_KEY: "", NODE_NO_WARNINGS: "1" };
  delete env.FAL_KEY;
  const aura = (...args) => {
    const r = spawnSync(bin, args, { cwd: project, env, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" });
    return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
  const check = (id, fn) => {
    try {
      const result = fn();
      report.checks.push({ id, ...result });
      log(`${result.status.padEnd(4)} ${id}${result.detail && result.status !== "pass" ? ` — ${String(result.detail).split("\n")[0]}` : ""}`);
    } catch (error) {
      report.checks.push({ id, status: "fail", detail: String(error?.stack ?? error) });
      log(`fail ${id} — ${error?.message ?? error}`);
    }
  };
  const tail = (r) => `exit ${r.code}\n${r.stdout}\n${r.stderr}`.trim().slice(-3000);

  check("version", () => {
    const r = aura("--version");
    return r.code === 0 && r.stdout.trim() === cliPkg.version ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  let catalog;
  check("help-json", () => {
    const r = aura("help", "--json");
    catalog = JSON.parse(r.stdout);
    const names = catalog.commands.map((c) => c.name);
    const missing = ["assets add", "assets admit", "vfx validate-atlas", "help"].filter((n) => !names.includes(n));
    return r.code === 0 && catalog.schema === "aura3d.cli-help/1" && catalog.version === cliPkg.version && missing.length === 0
      ? { status: "pass", detail: `${names.length} commands, ${catalog.codemods.length} codemods` }
      : { status: "fail", detail: missing.length ? `missing ${missing.join(", ")}` : tail(r) };
  });
  const has = (name) => Boolean(catalog?.commands?.some((c) => c.name === name));
  const optional = (id, name, fn) => check(id, () => (has(name) ? fn() : { status: "skip", detail: `\`aura3d ${name}\` is not in this build's help --json yet` }));

  check("unknown-command-exit-2", () => {
    const r = aura("asets", "add");
    return r.code === 2 && r.stderr.includes("Did you mean") ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  check("monorepo-only-fails-fast", () => {
    const r = aura("perf", "gate", "--report", "report.json");
    return r.code === 2 && r.stderr.includes("monorepo-only") && !r.stderr.includes(" at ") ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  check("assets-admit-g6", () => {
    const add = aura("assets", "add", "crate.glb", "--name", "crate", "--type", "model", "--license", "CC0-1.0", "--source-page", "https://example.test/crate", "--author", "Smoke", "--role", "prop", "--quality", "candidate");
    if (add.code !== 0) return { status: "fail", detail: `assets add: ${tail(add)}` };
    // Release admission runs every measured gate; other gates may reject the box — G6 must be MEASURED (sharp loaded).
    const admit = aura("assets", "admit", "crate", "--quality", "release");
    const g6 = `${admit.stdout}\n${admit.stderr}`.split("\n").find((line) => line.trim().startsWith("G6 "));
    if (!g6) return { status: "fail", detail: `no G6 row: ${tail(admit)}` };
    return /decode unavailable|sharp is not installed/.test(g6) ? { status: "fail", detail: g6.trim() } : { status: "pass", detail: g6.trim() };
  });

  check("vfx-validate-atlas", () => {
    const r = aura("vfx", "validate-atlas", "atlas.json");
    return r.code === 0 && r.stdout.includes("atlas ok") ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  optional("assets-convert", "assets convert", () => {
    const r = aura("assets", "convert", "tri.obj", "--out", "converted.glb", "--json");
    return r.code === 0 && existsSync(join(project, "converted.glb")) ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  optional("assets-preview", "assets preview", () => {
    const r = aura("assets", "preview", "crate.glb", "--out", "views.png", "--json");
    const png = join(project, "views.png");
    const ok = r.code === 0 && existsSync(png) && readFileSync(png).subarray(1, 4).toString("ascii") === "PNG";
    return ok ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  optional("animation-import-dry-run", "animation import", () => {
    const r = aura("animation", "import", "walk.bvh", "--onto", "rig.glb", "--out", "hero.glb", "--dry-run", "--json");
    return r.code === 0 && !existsSync(join(project, "hero.glb")) ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  optional("assets-generate-dry-run", "assets generate", () => {
    const r = aura("assets", "generate", "a weathered wooden crate", "--name", "genCrate", "--dry-run", "--json");
    return r.code === 0 && /est/i.test(r.stdout) ? { status: "pass" } : { status: "fail", detail: tail(r) };
  });

  const failed = report.checks.filter((c) => c.status === "fail");
  report.ok = failed.length === 0;
  exitCode = report.ok ? 0 : 1;
} catch (error) {
  log(String(error?.message ?? error));
  report.error = String(error?.message ?? error);
  exitCode = 1;
} finally {
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    log(`report: ${reportPath}`);
  }
  if (keepTmp) log(`kept ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
}
const counts = report.checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
log(`${report.ok ? "OK" : "FAILED"} ${JSON.stringify(counts)}`);
process.exit(exitCode);
