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
 *    tsc, and missing/broken dist files fail vite build;
 *  - a dist URL rule (T0-20): no `new URL("*.ts", import.meta.url)` in the
 *    packed dist, and relative `*.worker.js` URL targets must be packed.
 *
 * CLI: `pnpm exec tsx --tsconfig tsconfig.base.json tools/packed-consumer-check/index.ts`
 *   --only <substr>     restrict to templates whose dir name contains <substr>
 *   --skip-build        run install + tsc only (no vite build)
 *   --keep-tmp          keep the temp dir for debugging
 *   --candidate-plan    use validated candidate archives, without repacking
 */

import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidatedReleasePlan } from "../release/exact-release-plan.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const ENGINE_PACKAGE = "@aura3d/engine";
const SKIP_DIRS = new Set(["node_modules", "dist", "test-results", "playwright-report", ".cache"]);

export interface ConsumerChange {
  readonly path: string;
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
  readonly allowed: boolean;
  readonly reason: string;
}

export interface TemplateCheckResult {
  readonly template: string;
  readonly steps: Record<"specifiers" | "install" | "typecheck" | "build", "pass" | "fail" | "skip" | "not-applicable">;
  readonly changes: readonly ConsumerChange[];
  readonly detail?: string;
}

type ConsumerPackage = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const HASH = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

/** Collect the original consumer files; generated output and installed dependencies are not inputs. */
function consumerFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.set(relative(root, path).split(sep).join("/"), readFileSync(path));
      else throw new Error(`Unsupported consumer input (not a regular file): ${path}`);
    }
  };
  walk(root);
  return files;
}

function substitutedPackage(original: ConsumerPackage, replacements: Readonly<Record<string, string>>): ConsumerPackage {
  const result = structuredClone(original);
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, value] of Object.entries(replacements)) {
      if (!name.startsWith("@aura3d/") || !value.startsWith("file:")) {
        throw new Error(`Only candidate Aura3D package substitutions are allowed: ${name}`);
      }
      if (Object.hasOwn(result[section] ?? {}, name)) result[section]![name] = value;
    }
  }
  return result;
}

/** Detect every changed input, allowing only explicit candidate substitutions and install-created locks. */
export function auditConsumerCopy(
  originalDir: string,
  copyDir: string,
  replacements: Readonly<Record<string, string>>,
  options: { readonly afterInstall?: boolean } = {}
): ConsumerChange[] {
  const original = consumerFiles(originalDir);
  const copy = consumerFiles(copyDir);
  const changes: ConsumerChange[] = [];
  for (const path of [...new Set([...original.keys(), ...copy.keys()])].sort()) {
    const before = original.get(path);
    const after = copy.get(path);
    const beforeSha256 = before ? HASH(before) : null;
    const afterSha256 = after ? HASH(after) : null;
    if (beforeSha256 === afterSha256) continue;
    let allowed = false;
    let reason = "consumer input changed outside the candidate substitution";
    if (path === "package.json" && before && after) {
      try {
        const expected = substitutedPackage(JSON.parse(before.toString("utf8")) as ConsumerPackage, replacements);
        const actual = JSON.parse(after.toString("utf8")) as ConsumerPackage;
        allowed = JSON.stringify(expected) === JSON.stringify(actual);
        if (allowed) reason = "candidate package specifiers substituted; manifest formatting normalized";
      } catch { /* malformed or unapproved substitutions fail closed */ }
    } else if (options.afterInstall && ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].includes(path) && after) {
      allowed = true;
      reason = "package manager generated or updated lockfile during install";
    }
    changes.push({ path, beforeSha256, afterSha256, allowed, reason });
  }
  return changes;
}

/** Validate declared inputs before an install; a harness never supplies missing packages or config. */
export function consumerPreflight(dir: string): string[] {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return ["consumer package.json is missing"];
  let pkg: ConsumerPackage;
  try { pkg = JSON.parse(readFileSync(path, "utf8")) as ConsumerPackage; }
  catch { return ["consumer package.json is invalid"]; }
  const deps = Object.assign({}, ...DEPENDENCY_SECTIONS.map((section) => pkg[section] ?? {})) as Record<string, string>;
  const errors: string[] = [];
  if (!deps[ENGINE_PACKAGE]) errors.push(`${ENGINE_PACKAGE} is not declared`);
  if (!pkg.scripts?.build?.trim()) errors.push("required build script is missing");
  const files = consumerFiles(dir);
  const typed = [...files.keys()].some((name) => /\.[cm]?tsx?$/.test(name) && !name.endsWith(".d.ts"));
  if (typed && !deps.typescript) errors.push("typescript is not declared");
  if (typed && !existsSync(join(dir, "tsconfig.json"))) errors.push("tsconfig.json is missing");
  // The build command runs from the consumer; using a workspace binary would conceal a missing dependency.
  if (/\bvite\b/.test(pkg.scripts?.build ?? "") && !deps.vite) errors.push("vite is not declared");
  for (const [name, bytes] of files) {
    if (!/\.[cm]?[jt]sx?$/.test(name)) continue;
    const source = bytes.toString("utf8");
    const matches = source.matchAll(/(?:\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?|\b(?:import|require)\s*\()\s*["']([^"']+)["']/g);
    for (const match of matches) {
      const specifier = match[1]!;
      if (/^(?:[./#]|[a-z]+:)/i.test(specifier) && !specifier.startsWith("node:")) continue;
      const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
      if (BUILTINS.has(packageName.replace(/^node:/, ""))) {
        if (/\.[cm]?tsx?$/.test(name) && !deps["@types/node"]) errors.push(`${name}: @types/node is not declared for ${specifier}`);
      } else if (!deps[packageName] && packageName !== pkgName(pkg)) {
        errors.push(`${name}: dependency ${packageName} is not declared`);
      }
    }
  }
  return [...new Set(errors)];
}

function pkgName(pkg: ConsumerPackage): string | undefined {
  return (pkg as ConsumerPackage & { name?: string }).name;
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
  const key = `.${sub}`;
  return exportsKeys.has(key) || [...exportsKeys].some((pattern) => {
    if (!pattern.includes("*")) return false;
    const [prefix, suffix, ...extra] = pattern.split("*");
    return extra.length === 0 && key.startsWith(prefix!) && key.endsWith(suffix!) && key.length >= prefix!.length + suffix!.length;
  });
}

export interface DistUrlViolation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: "typescript-source" | "missing-worker";
}

const NEW_URL_RE = /new\s+URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url/g;

/**
 * T0-20 dist URL rule: every `new URL("<rel>", import.meta.url)` inside the
 * packed `dist/` must point at emitted JavaScript. A `.ts`/`.tsx`/`.mts`/`.cts`
 * target is a source file the tarball never ships (the retarget worker
 * regression), and a relative `*.worker.js` target must exist beside its
 * caller. Returned paths are relative to `distDir`.
 */
export function findDistUrlViolations(distDir: string): readonly DistUrlViolation[] {
  const violations: DistUrlViolation[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      const file = relative(distDir, path).split(sep).join("/");
      for (const match of readFileSync(path, "utf8").matchAll(NEW_URL_RE)) {
        const specifier = match[2]!;
        if (/\.[mc]?tsx?$/.test(specifier)) {
          violations.push({ file, specifier, reason: "typescript-source" });
        } else if (/^\.{1,2}\//.test(specifier) && /\.worker\.[mc]?js$/.test(specifier) && !existsSync(join(dirname(path), specifier))) {
          violations.push({ file, specifier, reason: "missing-worker" });
        }
      }
    }
  };
  if (existsSync(distDir)) walk(distDir);
  return violations;
}

function checkTarballDistUrls(tarball: string, extractDir: string): readonly DistUrlViolation[] {
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", extractDir], { stdio: "pipe" });
  return findDistUrlViolations(join(extractDir, "package/dist"));
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

export function packTarballAt(pkgDir: string, tmp: string): string {
  const before = new Set(readdirSync(tmp).filter((f) => f.endsWith(".tgz")));
  execFileSync("pnpm", ["pack", "--pack-destination", tmp], { cwd: pkgDir, stdio: "pipe" });
  const tarball = readdirSync(tmp).find((f) => f.endsWith(".tgz") && !before.has(f));
  if (!tarball) throw new Error(`pnpm pack produced no tarball for ${pkgDir}`);
  return join(tmp, tarball);
}

function packEngineTarball(tmp: string): string {
  return packTarballAt(REPO_ROOT, tmp);
}

export function prepareConsumerCopy(templateDir: string, dest: string, tarball: string, extraDeps?: Readonly<Record<string, string>>): void {
  if (existsSync(dest)) throw new Error(`consumer destination already exists: ${dest}`);
  const replacements = { [ENGINE_PACKAGE]: `file:${tarball}`, ...(extraDeps ?? {}) };
  cpSync(templateDir, dest, { recursive: true, filter: (src) => !SKIP_DIRS.has(basename(src)) });
  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as ConsumerPackage;
  writeFileSync(pkgPath, `${JSON.stringify(substitutedPackage(pkg, replacements), null, 2)}\n`);
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
  options: { readonly skipBuild?: boolean; readonly extraDeps?: Readonly<Record<string, string>> }
): TemplateCheckResult {
  const template = basename(templateDir);
  const steps: TemplateCheckResult["steps"] = { specifiers: "skip", install: "skip", typecheck: "skip", build: "skip" };
  let changes: ConsumerChange[] = [];
  const replacements = { [ENGINE_PACKAGE]: `file:${tarball}`, ...(options.extraDeps ?? {}) };
  const fail = (detail: string): TemplateCheckResult => ({ template, steps, changes, detail });
  try {
    prepareConsumerCopy(templateDir, dest, tarball, options.extraDeps);
    changes = auditConsumerCopy(templateDir, dest, replacements);
  } catch (error) { return fail(`consumer preparation failed: ${String(error)}`); }
  const unauthorized = changes.filter((change) => !change.allowed);
  if (unauthorized.length) return fail(`unauthorized harness changes: ${unauthorized.map((change) => change.path).join(", ")}`);

  const badSpecifiers = [...collectEngineSpecifiers(dest)].filter((s) => !specifierAllowed(s, exportsKeys));
  steps.specifiers = badSpecifiers.length === 0 ? "pass" : "fail";
  if (badSpecifiers.length > 0) return fail(`repo-alias-only specifiers not in packed exports: ${badSpecifiers.join(", ")}`);
  const preflight = consumerPreflight(dest);
  if (preflight.length) return fail(`consumer preflight failed: ${preflight.join("; ")}`);
  if (options.skipBuild) return fail("required build check was skipped (--skip-build)");

  let failure = step("install", dest, "pnpm", ["install", "--offline=false"]);
  steps.install = failure ? "fail" : "pass";
  if (!failure) {
    const typed = [...consumerFiles(dest).keys()].some((name) => /\.[cm]?tsx?$/.test(name) && !name.endsWith(".d.ts"));
    if (typed) {
      if (!existsSync(join(dest, "node_modules/.bin/tsc"))) failure = "typecheck failed: installed typescript executable is missing";
      else failure = step("typecheck", dest, "pnpm", ["exec", "tsc", "--noEmit"]);
      steps.typecheck = failure ? "fail" : "pass";
    } else steps.typecheck = "not-applicable";
    if (!failure) {
      failure = step("build", dest, "pnpm", ["run", "build"]);
      steps.build = failure ? "fail" : "pass";
    }
  }
  try {
    changes = auditConsumerCopy(templateDir, dest, replacements, { afterInstall: true });
    const unexpected = changes.filter((change) => !change.allowed);
    if (unexpected.length) failure = `${failure ? `${failure}; ` : ""}unauthorized harness changes: ${unexpected.map((change) => change.path).join(", ")}`;
  } catch (error) { failure = `${failure ? `${failure}; ` : ""}consumer audit failed: ${String(error)}`; }
  return failure ? fail(failure) : { template, steps, changes };

}

function main(): void {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const skipBuild = args.includes("--skip-build");
  const keepTmp = args.includes("--keep-tmp");

  const extraDirs: string[] = [];
  const extraPkgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--extra-dir") extraDirs.push(args[++i]!);
    if (args[i] === "--extra-pkg") extraPkgs.push(args[++i]!);
  }

  const templates = [...collectTemplateDirs(), ...extraDirs].filter((t) => !only || basename(t).includes(only));
  const tmp = mkdtempSync(join(tmpdir(), "a3d-pack-check-"));
  console.log(`packed-consumer-check: ${templates.length} templates, temp dir ${tmp}`);

  const planIndex = args.indexOf("--candidate-plan");
  if (planIndex >= 0 && !args[planIndex + 1]) throw new Error("--candidate-plan requires a validated release plan path");
  const candidatePath = planIndex >= 0 ? args[planIndex + 1] : process.env.A3D_RELEASE_PLAN;
  const candidate = candidatePath ? loadValidatedReleasePlan(REPO_ROOT, candidatePath) : null;
  const engine = candidate?.packages.find((item) => item.name === ENGINE_PACKAGE);
  if (candidate && !engine) throw new Error(`Candidate plan does not contain ${ENGINE_PACKAGE}`);
  const tarball = engine ? resolve(REPO_ROOT, engine.tarball) : packEngineTarball(tmp);
  const exportsKeys = readTarballExports(tarball, join(tmp, "tarball-meta"));
  console.log(`tarball ${basename(tarball)} with ${exportsKeys.size} export keys`);
  const urlViolations = checkTarballDistUrls(tarball, join(tmp, "tarball-full"));
  for (const v of urlViolations) {
    console.error(`FAIL dist-url ${v.file} — new URL("${v.specifier}", import.meta.url): ${v.reason}`);
  }

  // `--extra-pkg <dir>:<specifier>` packs additional workspace packages and
  // rewrites that specifier to its tarball in consumer package.json files
  // (PRD-15 T4.7: fixtures may depend on additional workspace packages.)
  const extraDeps: Record<string, string> = {};
  if (candidate) {
    for (const item of candidate.packages) if (item.name.startsWith("@aura3d/") && item.name !== ENGINE_PACKAGE) extraDeps[item.name] = `file:${resolve(REPO_ROOT, item.tarball)}`;
    if (extraPkgs.length) throw new Error("--extra-pkg is not allowed with a validated candidate plan; all substitutions come from that plan");
  }
  for (const entry of extraPkgs) {
    const sep = entry.lastIndexOf(":");
    const dir = entry.slice(0, sep);
    const specifier = entry.slice(sep + 1);
    const packed = packTarballAt(join(REPO_ROOT, dir), tmp);
    extraDeps[specifier] = `file:${packed}`;
    console.log(`extra package ${specifier} → ${basename(packed)}`);
  }

  const results: TemplateCheckResult[] = [];
  for (const templateDir of templates) {
    // Unique dest per template dir: templates/<name> and
    // packages/create-aura3d/templates/<name> can share a basename — the
    // second copy would inherit the first's generated pnpm-lock.yaml and
    // fail frozen-lockfile on dep drift (observed on cinematic-scene).
    const dest = join(tmp, `consumer-${templateDir.replaceAll("/", "_")}`);
    rmSync(dest, { recursive: true, force: true });
    const result = checkTemplate(join(REPO_ROOT, templateDir), dest, tarball, exportsKeys, { skipBuild, extraDeps });
    results.push(result);
    console.log(`${result.detail ? "FAIL" : "PASS"} ${result.template}${result.detail ? ` — ${result.detail}` : ""}`);
    for (const change of result.changes) console.log(`  ${change.allowed ? "RECORDED" : "UNAUTHORIZED"} ${change.path}: ${change.reason} (${change.beforeSha256 ?? "missing"} -> ${change.afterSha256 ?? "missing"})`);
  }

  const failures = results.filter((r) => r.detail);
  if (templates.length === 0) { console.error("packed-consumer-check: no templates selected"); process.exitCode = 1; }
  if (!keepTmp) rmSync(tmp, { recursive: true, force: true });
  if (urlViolations.length > 0) {
    console.error(`packed-consumer-check: ${urlViolations.length} dist new URL(...) references point at TypeScript sources or missing workers`);
    process.exitCode = 1;
  }
  if (failures.length > 0) {
    console.error(`packed-consumer-check: ${failures.length}/${results.length} templates failed`);
    process.exitCode = 1;
  } else if (urlViolations.length === 0 && templates.length > 0) {
    console.log(`packed-consumer-check: all ${results.length} templates pass`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
