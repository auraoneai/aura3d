/**
 * PRD-15 T1.6 — packed-consumer check.
 *
 * `pnpm pack` the root package, then for every template the package ships
 * (root `files` entries under templates/) and every create-aura3d scaffold
 * template: copy it to a temp dir, rewrite its `@aura3d/engine` dependency to
 * `file:<tarball>`, `pnpm install`, `tsc --noEmit`, and `vite build`.
 *
 * Two failure modes are covered:
 *  - a specifier gate: any `@aura3d/engine*` import that only resolves through
 *    this repo's tsconfig paths (e.g. `@aura3d/engine/lanes`) fails fast, since
 *    the packed tarball's `exports` map is the only truth consumers see;
 *  - the install/build pipeline itself: names missing from the packed "." fail
 *    tsc, and missing/broken dist files fail vite build.
 *
 * CLI: `pnpm exec tsx --tsconfig tsconfig.base.json tools/packed-consumer-check/index.ts`
 *   --only <substr>     restrict to templates whose dir name contains <substr>
 *   --skip-build        run install + tsc only (no vite build)
 *   --keep-tmp          keep the temp dir for debugging
 */

import { execFileSync, execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ENGINE_PACKAGE = "@aura3d/engine";
const SKIP_DIRS = new Set(["node_modules", "dist", "test-results", "playwright-report", ".cache"]);

interface TemplateCheckResult {
  readonly template: string;
  readonly steps: Record<"specifiers" | "install" | "typecheck" | "build", "pass" | "fail" | "skip">;
  readonly detail?: string;
}

function collectTemplateDirs(): readonly string[] {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { files?: string[] };
  const filesTemplates = (pkg.files ?? [])
    .filter((f) => f.startsWith("templates/") && statSync(join(REPO_ROOT, f)).isDirectory());
  const scaffoldRoot = join(REPO_ROOT, "packages/create-aura3d/templates");
  const scaffoldTemplates = readdirSync(scaffoldRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `packages/create-aura3d/templates/${d.name}`);
  return [...filesTemplates, ...scaffoldTemplates].sort();
}

/** Every `@aura3d/engine*` specifier referenced by source files under dir. */
export function collectEngineSpecifiers(dir: string): ReadonlySet<string> {
  const specifiers = new Set<string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(current, entry.name));
        continue;
      }
      if (!/\.(ts|tsx|mts|cts|js|mjs)$/.test(entry.name)) continue;
      const source = readFileSync(join(current, entry.name), "utf8");
      for (const match of source.matchAll(/(?:from|import)\s*[\s(]*["'`](@aura3d\/engine[^"'`]*)["'`]/g)) {
        specifiers.add(match[1]!);
      }
    }
  };
  walk(dir);
  return specifiers;
}

/**
 * Does the tarball's `exports` map permit this specifier? The map's literal
 * keys are the only permitted specifiers — a name existing only in the repo's
 * tsconfig paths must fail here (the T1.6 fixture proves it).
 */
export function specifierAllowed(specifier: string, exportsKeys: ReadonlySet<string>): boolean {
  if (specifier === ENGINE_PACKAGE) return exportsKeys.has(".") || [...exportsKeys].some((k) => !k.startsWith("."));
  const sub = specifier.slice(ENGINE_PACKAGE.length);
  if (!sub.startsWith("/")) return false;
  return exportsKeys.has(`.${sub}`);
}

function readTarballExports(tarball: string, extractDir: string): ReadonlySet<string> {
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", extractDir, "package/package.json"], { stdio: "pipe" });
  const packed = JSON.parse(readFileSync(join(extractDir, "package/package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
    main?: string;
  };
  const keys = new Set(Object.keys(packed.exports ?? {}));
  if (packed.main && keys.size === 0) keys.add(".");
  return keys;
}

function packEngineTarball(tmp: string): string {
  execFileSync("pnpm", ["pack", "--pack-destination", tmp], { cwd: REPO_ROOT, stdio: "pipe" });
  const tarball = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack produced no tarball");
  return join(tmp, tarball);
}

export function prepareConsumerCopy(templateDir: string, dest: string, tarball: string): void {
  cpSync(templateDir, dest, {
    recursive: true,
    filter: (src) => !SKIP_DIRS.has(basename(src))
  });
  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const section of [pkg.dependencies, pkg.devDependencies]) {
    if (section?.[ENGINE_PACKAGE]) section[ENGINE_PACKAGE] = `file:${tarball}`;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  // Consumers stand alone — pnpm refuses install-time build scripts without
  // explicit approval (ERR_PNPM_IGNORED_BUILDS). Mirror the root workspace's
  // allowBuilds list so esbuild (vite's optimizer) can run its postinstall.
  writeFileSync(join(dest, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  sharp: true\n");
}

function step(label: string, cwd: string, command: string, args: readonly string[]): string | undefined {
  try {
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return undefined;
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return `${label} failed: ${stdout.slice(-400)}${stderr.slice(-2500)}`;
  }
}

export function checkTemplate(
  templateDir: string,
  dest: string,
  tarball: string,
  exportsKeys: ReadonlySet<string>,
  options: { readonly skipBuild?: boolean }
): TemplateCheckResult {
  const template = basename(templateDir);
  const steps: TemplateCheckResult["steps"] = { specifiers: "skip", install: "skip", typecheck: "skip", build: "skip" };

  prepareConsumerCopy(templateDir, dest, tarball);

  const badSpecifiers = [...collectEngineSpecifiers(dest)].filter((s) => !specifierAllowed(s, exportsKeys));
  steps.specifiers = badSpecifiers.length === 0 ? "pass" : "fail";
  if (badSpecifiers.length > 0) {
    return { template, steps, detail: `repo-alias-only specifiers not in packed exports: ${badSpecifiers.join(", ")}` };
  }

  let failure = step("install", dest, "pnpm", ["install", "--offline=false"]);
  steps.install = failure ? "fail" : "pass";
  if (!failure) {
    // `tsc --noEmit` only makes sense against the template's own tsconfig —
    // without one there is no project to check (vite build below is the
    // bundler-level check for those templates).
    const hasTsc = existsSync(join(dest, "node_modules/.bin/tsc")) && existsSync(join(dest, "tsconfig.json"));
    const hasVite = existsSync(join(dest, "node_modules/.bin/vite"));
    if (!hasTsc) {
      steps.typecheck = "skip";
    } else {
      failure = step("typecheck", dest, "pnpm", ["exec", "tsc", "--noEmit"]);
      steps.typecheck = failure ? "fail" : "pass";
    }
    if (!failure && !options.skipBuild) {
      if (!hasVite || !existsSync(join(dest, "index.html"))) {
        steps.build = "skip";
      } else {
        failure = step("build", dest, "pnpm", ["exec", "vite", "build"]);
        steps.build = failure ? "fail" : "pass";
      }
    }
  }

  return failure ? { template, steps, detail: failure } : { template, steps };
}

function main(): void {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const skipBuild = args.includes("--skip-build");
  const keepTmp = args.includes("--keep-tmp");

  const templates = collectTemplateDirs().filter((t) => !only || basename(t).includes(only));
  const tmp = mkdtempSync(join(tmpdir(), "a3d-pack-check-"));
  console.log(`packed-consumer-check: ${templates.length} templates, temp dir ${tmp}`);

  const tarball = packEngineTarball(tmp);
  const exportsKeys = readTarballExports(tarball, join(tmp, "tarball-meta"));
  console.log(`tarball ${basename(tarball)} with ${exportsKeys.size} export keys`);

  const results: TemplateCheckResult[] = [];
  for (const templateDir of templates) {
    const dest = join(tmp, `consumer-${basename(templateDir)}`);
    const result = checkTemplate(join(REPO_ROOT, templateDir), dest, tarball, exportsKeys, { skipBuild });
    results.push(result);
    console.log(`${result.detail ? "FAIL" : "PASS"} ${result.template}${result.detail ? ` — ${result.detail}` : ""}`);
  }

  const failures = results.filter((r) => r.detail);
  if (!keepTmp) execSync(`rm -rf "${tmp}"`);
  if (failures.length > 0) {
    console.error(`packed-consumer-check: ${failures.length}/${results.length} templates failed`);
    process.exitCode = 1;
  } else {
    console.log(`packed-consumer-check: all ${results.length} templates pass`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
