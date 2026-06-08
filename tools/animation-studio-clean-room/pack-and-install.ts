import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join, relative } from "node:path";
import { runPackagingAudits, type CleanRoomAudit } from "./index.js";

/**
 * Animation Studio CLEAN-ROOM INSTALL via LOCAL TARBALLS — PRD Phase I1 execution.
 *
 * The honest blocker recorded against I1 is that the template pins `@aura3d/*@1.2.0`
 * which is NOT published, so a real `npm install` outside the monorepo fails (ETARGET).
 * Publishing to a registry is a release action this sandbox can't do. BUT we CAN simulate
 * a publish faithfully: `npm pack` every `@aura3d/*` package the template's dependency
 * closure needs into `.tgz` tarballs, copy the template to a fresh /tmp dir OUTSIDE the
 * monorepo, rewrite its `@aura3d/*` deps to `file:<tarball>`, and run a REAL `npm install`
 * (third-party deps still come from the public registry — only the unpublished aura
 * packages are swapped for local tarballs). Then typecheck, generate a prompt scene, and
 * render it at preview quality.
 *
 * This is a LEGITIMATE clean-room proof of consumption: no monorepo node_modules, no
 * workspace symlinks, no relative `../../dist` imports — the template resolves the aura
 * packages exactly as a published consumer would (through the tarball's package.json
 * `main`/`exports`). Wherever a deep import or missing export subpath would break a real
 * user, it breaks here too, and we report the exact specifier.
 *
 * It runs each step and reports the FIRST hard stop with the real error — it never fakes
 * a pass.
 */

export interface TarballCleanRoomReport {
  readonly schema: "animation-studio-clean-room-tarball/v1";
  readonly ok: boolean;
  readonly generatedAt: string;
  /** The last step that started before the run stopped (or "complete"). */
  readonly reached: string;
  /** Honest description of where/why it stopped, with the real error. */
  readonly stoppedAt: string | null;
  readonly steps: readonly TarballStep[];
  readonly audits: readonly CleanRoomAudit[];
  readonly tarballs: readonly string[];
  /** Where the clean-room project lives (kept for inspection unless --clean). */
  readonly projectDir: string;
}

export interface TarballStep {
  readonly id: string;
  readonly ran: boolean;
  readonly exitCode: number | null;
  readonly ok: boolean;
  readonly detail: string;
}

const TEMPLATE_REL = "packages/create-aura3d/templates/animation-studio";
/**
 * IMPORTANT topology, discovered by inspection (not assumed):
 *  - `@aura3d/engine` is NOT a `packages/*` dir. It is the ROOT monorepo package
 *    (`<root>/package.json`, name `@aura3d/engine`, version 1.2.0, private:false). It bundles
 *    the whole `dist/` and re-exports every subsystem via export subpaths
 *    (`./advanced-runtime`, `./production-runtime`, `./rendering`, `./scene`, `./assets/browser`…).
 *    The `packages/engine` dir publishes as `@aura3d/engine-runtime` (private) — a DIFFERENT
 *    package — so it must NOT be packed as `@aura3d/engine`.
 *  - The four OTHER template deps (`animation`, `assets`, `core`, `physics`) ARE standalone
 *    publishable `packages/*` dirs; their `workspace:*` closure pulls in `math`, `scene`,
 *    `rendering`. None of them depend on `@aura3d/engine`, so there is no pack cycle.
 */
const TEMPLATE_SIBLING_DEPS = ["animation", "assets", "core", "physics"] as const;

interface PackageInfo {
  readonly name: string; // publish name, e.g. "@aura3d/animation"
  readonly dir: string; // absolute path to the package dir to pack
  readonly pkg: Record<string, unknown>;
  /** True for the root mega-package published as @aura3d/engine. */
  readonly isRootEngine: boolean;
}

/** Walk the `@aura3d/*` dependency graph from the standalone sibling deps; return their closure. */
function resolveSiblingClosure(root: string): PackageInfo[] {
  const packagesDir = join(root, "packages");
  const seen = new Map<string, PackageInfo>();
  const visit = (shortName: string): void => {
    if (seen.has(shortName)) return;
    const dir = join(packagesDir, shortName);
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) throw new Error(`@aura3d/${shortName} package dir not found at ${dir}`);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    seen.set(shortName, { name: String(pkg.name), dir, pkg, isRootEngine: false });
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith("@aura3d/")) {
        const short = dep.slice("@aura3d/".length);
        if (short === "engine" || short === "engine-runtime") {
          throw new Error(`unexpected: sibling @aura3d/${shortName} depends on ${dep} (would create a pack cycle)`);
        }
        visit(short);
      }
    }
  };
  for (const name of TEMPLATE_SIBLING_DEPS) visit(name);
  return [...seen.values()];
}

/** The closure to pack: the ROOT engine package + the standalone sibling closure. */
function resolveClosure(root: string): PackageInfo[] {
  const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  if (rootPkg.name !== "@aura3d/engine") {
    throw new Error(`expected root package to be @aura3d/engine, found ${String(rootPkg.name)}`);
  }
  const engine: PackageInfo = { name: "@aura3d/engine", dir: root, pkg: rootPkg, isRootEngine: true };
  return [engine, ...resolveSiblingClosure(root)];
}

/**
 * Pack a package as a publish-faithful tarball. `npm pack` does NOT rewrite `workspace:*`
 * specifiers (only `pnpm/yarn publish` does), and `file:` deps would re-point into the
 * monorepo — neither resolves in a clean room. So we stage a copy with its `@aura3d/*`
 * deps pinned to the concrete `1.2.0` version (matching what the template pins), pack THAT,
 * and let the template's `file:` deps satisfy those `1.2.0` ranges locally.
 */
function packPackage(info: PackageInfo, stageRoot: string, version: string): string {
  const outDir = join(stageRoot, "tarballs");
  mkdirSync(outDir, { recursive: true });

  // The ROOT engine package has no `@aura3d/*` deps to rewrite and a `files` allowlist that
  // already limits what ships (dist + templates). Pack it IN PLACE — copying the 12k-entry
  // monorepo tree would be wasteful and `files` makes the copy pointless anyway.
  const packCwd = info.isRootEngine ? info.dir : stageSiblingPackage(info, stageRoot, version);

  const out = execFileSync("npm", ["pack", "--pack-destination", outDir], {
    cwd: packCwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  // `npm pack` prints the produced filename on the last non-empty line.
  const file = out.trim().split("\n").map((l) => l.trim()).filter(Boolean).pop();
  if (!file) throw new Error(`npm pack produced no tarball for @aura3d/${info.name}`);
  const tarballPath = join(outDir, file);
  if (!existsSync(tarballPath)) throw new Error(`packed tarball missing: ${tarballPath}`);
  return tarballPath;
}

/** Stage a standalone sibling package with its `@aura3d/*` deps pinned to a concrete version. */
function stageSiblingPackage(info: PackageInfo, stageRoot: string, version: string): string {
  const short = info.name.replace("@aura3d/", "");
  const stageDir = join(stageRoot, "src-pkgs", short);
  rmSync(stageDir, { recursive: true, force: true });
  cpSync(info.dir, stageDir, {
    recursive: true,
    filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src)
  });
  const pkg = JSON.parse(readFileSync(join(stageDir, "package.json"), "utf8")) as Record<string, unknown>;
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith("@aura3d/")) deps[dep] = version;
  }
  pkg.version = version;
  writeFileSync(join(stageDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  return stageDir;
}

function step(id: string, fn: () => string): TarballStep {
  try {
    const detail = fn();
    return { id, ran: true, exitCode: 0, ok: true, detail };
  } catch (error) {
    const e = error as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const detail = tail(`${String(e.stdout ?? "")}\n${String(e.stderr ?? e.message ?? "error")}`);
    return { id, ran: true, exitCode: typeof e.status === "number" ? e.status : 1, ok: false, detail };
  }
}

function run(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  return tail(
    execFileSync(cmd, args, {
      cwd,
      env: env ?? process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 900_000
    })
  );
}

export interface PackInstallOptions {
  readonly version?: string;
  readonly projectDir?: string;
  readonly keep?: boolean;
  readonly prompt?: string;
  /** Add the consumer deps the template omits (@types/node, sharp) to the /tmp copy to probe deeper. */
  readonly shimConsumerDeps?: boolean;
}

export function runTarballCleanRoom(root = process.cwd(), options: PackInstallOptions = {}): TarballCleanRoomReport {
  const generatedAt = new Date().toISOString();
  const version = options.version ?? "1.2.0";
  const prompt = options.prompt ?? "two robots in a garage";
  const stageRoot = options.projectDir ?? "/tmp/aura-cleanroom";
  const projectDir = join(stageRoot, "animation-studio");
  const audits = runPackagingAudits(root);

  const steps: TarballStep[] = [];
  let reached = "audits";
  let stoppedAt: string | null = null;
  const tarballs: string[] = [];
  /** publish-name -> tarball path, built directly from the closure (no filename parsing). */
  const tarballByName = new Map<string, string>();

  // Fresh stage dir every run.
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });

  const pushAndCheck = (s: TarballStep): boolean => {
    steps.push(s);
    reached = s.id;
    if (!s.ok) stoppedAt = `${s.id} (exit ${s.exitCode}) — ${firstMeaningfulLine(s.detail)}`;
    return s.ok;
  };

  // Step 1 — pack the full @aura3d closure into tarballs (simulating publish).
  const closure = resolveClosure(root);
  const packStep = step("pack-tarballs", () => {
    for (const info of closure) {
      const path = packPackage(info, stageRoot, version);
      tarballs.push(path);
      tarballByName.set(info.name, path);
    }
    return `packed ${tarballs.length} @aura3d/* tarballs (closure: ${closure.map((c) => c.name).sort().join(", ")})`;
  });
  if (!pushAndCheck(packStep)) return finalize();

  // Step 2 — copy the template OUTSIDE the monorepo (no node_modules, no dist).
  const copyStep = step("copy-template", () => {
    cpSync(join(root, TEMPLATE_REL), projectDir, {
      recursive: true,
      filter: (src) => !/[\\/]node_modules([\\/]|$)|[\\/]dist([\\/]|$)/.test(src)
    });
    rmSync(join(projectDir, "package-lock.json"), { force: true });
    if (!existsSync(join(projectDir, "package.json"))) throw new Error("template package.json missing after copy");
    return `copied template to ${projectDir} (node_modules + dist + lockfile excluded)`;
  });
  if (!pushAndCheck(copyStep)) return finalize();

  // Step 3 — rewrite the template's @aura3d/* deps to file:<tarball> (the "published" packages).
  const rewriteStep = step("rewrite-deps", () => {
    const pkgPath = join(projectDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    const mapped: string[] = [];
    for (const dep of Object.keys(deps)) {
      if (!dep.startsWith("@aura3d/")) continue;
      const tgz = tarballByName.get(dep);
      if (!tgz) throw new Error(`no tarball for template dep ${dep} (closure miss)`);
      deps[dep] = `file:${tgz}`;
      mapped.push(`${dep} -> ${relative(stageRoot, tgz)}`);
    }
    // Also pin the indirect closure (math/scene/rendering and the engine's @loaders/cannon
    // are real deps) as resolvable file deps so npm can satisfy the 1.2.0 ranges the sibling
    // tarballs declare among themselves without reaching the registry for unpublished names.
    const overrides = (pkg.overrides ?? {}) as Record<string, string>;
    for (const [name, tgz] of tarballByName) overrides[name] = `file:${tgz}`;
    pkg.overrides = overrides;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    return `mapped ${mapped.length} direct deps to tarballs + ${tarballs.length} overrides:\n  ${mapped.join("\n  ")}`;
  });
  if (!pushAndCheck(rewriteStep)) return finalize();

  // Step 4 — REAL npm install in the clean room (aura from tarballs, rest from registry).
  const installStep = step("npm-install", () =>
    run("npm", ["install", "--no-audit", "--no-fund"], projectDir, cleanEnv())
  );
  if (!pushAndCheck(installStep)) return finalize();

  // OPTIONAL probe — add the real-world consumer deps the template OMITS (`@types/node`,
  // `sharp`), in the /tmp copy ONLY, so the run can proceed PAST the known template gaps to
  // discover any DEEPER blocker. This is logged as an explicit step so the report stays honest
  // that these are template defects, not silent fixes. Off by default (canonical run stops at
  // the first real gap). The template src is never edited — only this throwaway /tmp copy.
  if (options.shimConsumerDeps) {
    const shimStep = step("shim-consumer-deps", () => {
      run("npm", ["install", "--no-audit", "--no-fund", "--save-dev", "@types/node@^22", "sharp"], projectDir, cleanEnv());
      // The template's tsconfig pins types:["vite/client"], excluding node globals; add "node".
      const tsPath = join(projectDir, "tsconfig.json");
      const ts = JSON.parse(readFileSync(tsPath, "utf8")) as { compilerOptions?: { types?: string[] } };
      ts.compilerOptions = ts.compilerOptions ?? {};
      ts.compilerOptions.types = [...new Set([...(ts.compilerOptions.types ?? []), "node"])];
      writeFileSync(tsPath, `${JSON.stringify(ts, null, 2)}\n`);
      return "added @types/node + sharp and node to tsconfig types (TEMPLATE GAPS shimmed in /tmp copy only)";
    });
    if (!pushAndCheck(shimStep)) return finalize();
  }

  // Step 5 — typecheck the template as scaffolded.
  const typecheckStep = step("typecheck", () => run("npm", ["run", "typecheck"], projectDir, cleanEnv()));
  if (!pushAndCheck(typecheckStep)) return finalize();

  // Step 6 — generate a COMPLETE prompt scene (F2 path): animation-scene new --prompt ... --full.
  const sceneStep = step("scene-generate", () =>
    run("npm", ["run", "scene", "--", "new", "--prompt", prompt, "--full"], projectDir, cleanEnv())
  );
  if (!pushAndCheck(sceneStep)) return finalize();

  // Step 7 — render the generated scene at PREVIEW quality.
  const docPath = join(projectDir, "dist", "scene", "working.document.json");
  const renderStep = step("render-preview", () => {
    if (!existsSync(docPath)) {
      throw new Error(`generated document not found at ${docPath} — scene step did not persist a working document`);
    }
    return run("npm", ["run", "episode:render-3d"], projectDir, {
      ...cleanEnv(),
      AURA_QUALITY: "preview",
      AURA_LOW_FIDELITY: "1",
      AURA_PREVIEW_RANGE: "0-4",
      AURA_DOCUMENT: docPath
    });
  });
  if (!pushAndCheck(renderStep)) return finalize();

  function finalize(): TarballCleanRoomReport {
    const allOk = steps.every((s) => s.ok) && audits.every((a) => a.ok);
    if (!options.keep && allOk) {
      // keep the project for inspection by default; only auto-clean when explicitly asked
    }
    return {
      schema: "animation-studio-clean-room-tarball/v1",
      ok: allOk,
      generatedAt,
      reached: stoppedAt ? reached : "complete",
      stoppedAt,
      steps,
      audits,
      tarballs,
      projectDir
    };
  }

  return finalize();
}

/** A clean env: no monorepo tsconfig / NODE_PATH / pnpm workspace bleed-through. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  delete env.TSX_TSCONFIG;
  delete env.NODE_PATH;
  delete env.npm_config_workspace;
  delete env.npm_config_workspaces;
  delete env.PNPM_HOME;
  return env;
}

function tail(value: string, max = 6000): string {
  return value.length > max ? value.slice(value.length - max) : value;
}
function firstMeaningfulLine(value: string): string {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  // Prefer a line that looks like a real error over generic npm noise.
  const errLine = lines.find((l) => /error|ETARGET|ENOENT|cannot|fail|exception|not found|Could not/i.test(l));
  return (errLine ?? lines[lines.length - 1] ?? "").slice(0, 260);
}

function listTopLevel(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  /tools[\\/]animation-studio-clean-room[\\/]pack-and-install\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const report = runTarballCleanRoom(root, {
    version: typeof args.version === "string" ? args.version : undefined,
    prompt: typeof args.prompt === "string" ? args.prompt : undefined,
    projectDir: typeof args.dir === "string" ? args.dir : undefined,
    keep: args.keep === true,
    shimConsumerDeps: args["shim-consumer-deps"] === true
  });

  console.log("=== STATIC PACKAGING AUDITS ===");
  for (const a of report.audits) console.log(`${a.ok ? "PASS" : "FAIL"} ${a.id} — ${a.detail}`);

  console.log("\n=== TARBALL CLEAN-ROOM EXECUTION ===");
  console.log(`packed tarballs: ${report.tarballs.length}`);
  for (const s of report.steps) {
    console.log(`${s.ok ? "ok  " : "STOP"} ${s.id}${s.exitCode != null ? ` (exit ${s.exitCode})` : ""}`);
    if (!s.ok) console.log(`     ${firstMeaningfulLine(s.detail)}`);
  }
  console.log(`\nreached: ${report.reached}`);
  if (report.stoppedAt) console.log(`stopped at: ${report.stoppedAt}`);
  console.log(`project dir (kept for inspection): ${report.projectDir} [${listTopLevel(report.projectDir).join(", ")}]`);

  // Persist a machine-readable report alongside the other clean-room evidence.
  const outDir = join(root, "tests/reports/animation-studio");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "clean-room-tarball.json"), `${JSON.stringify(report, null, 2)}\n`);

  if (report.stoppedAt) {
    console.error("\nCLEAN-ROOM (TARBALL) STOPPED — see stopped-at line above for the exact blocker.");
    process.exitCode = 1;
  } else {
    console.log("\nCLEAN-ROOM (TARBALL) SUCCESS — install + typecheck + scene + preview render all ran from local tarballs.");
  }
}
