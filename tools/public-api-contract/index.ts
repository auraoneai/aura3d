import { execFileSync } from "node:child_process";
import ts from "typescript";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidatedReleasePlan, type ExactReleasePlan } from "../release/exact-release-plan.mjs";
import { expandExports } from "../public-surface-diff/index.js";
import { readPackageArchive, sha256, sha512, verifyPackedIdentity, type PackedPackage } from "../public-surface-diff/prepare-baseline.js";

interface Check { id: string; status: "passed" | "failed" | "not-applicable"; command: string[]; exitCode: number | null; detail: string }
function run(command: string, args: string[], cwd: string): { ok: boolean; exitCode: number; output: string } {
  try {
    return { ok: true, exitCode: 0, output: execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim() };
  } catch (error) {
    const failure = error as { status?: number; message?: string; stdout?: Buffer; stderr?: Buffer };
    return { ok: false, exitCode: failure.status ?? 1, output: `${failure.message ?? ""}\n${String(failure.stdout ?? "")}\n${String(failure.stderr ?? "")}`.trim().slice(-30_000) };
  }
}
function candidatePackages(plan: ExactReleasePlan): Map<string, PackedPackage> {
  const packages = new Map<string, PackedPackage>();
  for (const entry of plan.packages) {
    if (packages.has(entry.name)) throw new Error(`Duplicate candidate package ${entry.name}`);
    const bytes = readFileSync(resolve(entry.tarball));
    if (sha256(bytes) !== entry.sha256 || sha512(bytes) !== entry.integrity) throw new Error(`Candidate digest mismatch for ${entry.name}`);
    const pkg = readPackageArchive(bytes);
    verifyPackedIdentity(pkg, entry.name, entry.version);
    packages.set(entry.name, pkg);
  }
  return packages;
}
/** A script declaration file (no top-level import/export) only declares ambient
 * modules or globals; it cannot be the target of `import type * as ns`. */
function isModuleDeclaration(bytes: Buffer | undefined): boolean {
  if (!bytes) return true;
  return ts.isExternalModule(ts.createSourceFile("entry.d.ts", bytes.toString("utf8"), ts.ScriptTarget.Latest, false));
}
/** Explicitly enumerate each package's concrete exports, including wildcard
 * expansions. Assets and browser-only conditions are reported separately. */
export function contractConsumers(packages: Map<string, PackedPackage>): { specifier: string; declarations: boolean; ambient?: boolean; nodeImport: boolean; nodeRequire: boolean; nodeTypes: boolean; reason?: string }[] {
  const result: { specifier: string; declarations: boolean; ambient?: boolean; nodeImport: boolean; nodeRequire: boolean; nodeTypes: boolean; reason?: string }[] = [];
  for (const [name, pkg] of packages) for (const entry of expandExports(pkg)) {
    const keys = Object.keys(entry.conditions);
    const importable = keys.some((key) => key === "default" || key === "import" || key === "node" || key.startsWith("node/import") || key.startsWith("node/default"));
    const requireable = keys.some((key) => key === "require" || key === "node/require");
    const nodeTypes = keys.some((key) => key === "types" || key.startsWith("node/types") || key.startsWith("node/import/types") || key.startsWith("node/require/types"));
    const ambient = !entry.asset && entry.declarations.length > 0 && entry.declarations.every((path) => /\.d\.[cm]?ts$/.test(path) && !isModuleDeclaration(pkg.files.get(path)));
    result.push({ nodeTypes, ...(ambient ? { ambient } : {}), specifier: `${name}${entry.subpath === "." ? "" : entry.subpath.slice(1)}`, declarations: !entry.asset, nodeImport: !entry.asset && importable, nodeRequire: !entry.asset && requireable, ...(!entry.asset && !importable && !requireable ? { reason: "no Node import or require condition" } : entry.asset ? { reason: "non-code export" } : {}) });
  }
  return result.sort((a, b) => a.specifier.localeCompare(b.specifier));
}
/** Major versions named by a peer range such as `^18.0.0 || ^19.0.0`: the first
 * number of each comparator, never the minor or patch components. */
export function reactPeerMajors(range: string): number[] {
  const majors = new Set<number>();
  for (const comparator of range.split("||")) {
    const match = comparator.trim().match(/^(?:\^|~|>=?|=)?\s*v?(\d+)(?:\.|$|\s)/);
    if (match) majors.add(Number(match[1]));
  }
  return [...majors];
}
function peerProfiles(packages: Map<string, PackedPackage>): { name: string; dependencies: Record<string, string> }[] {
  const peers = new Map<string, string>();
  for (const pkg of packages.values()) for (const [name, range] of Object.entries(pkg.manifest.peerDependencies ?? {})) {
    if (name.startsWith("@aura3d/")) continue;
    if (pkg.manifest.peerDependenciesMeta?.[name]?.optional) continue;
    const old = peers.get(name);
    if (old && old !== range) throw new Error(`Conflicting peer ranges for ${name}: ${old}, ${range}`);
    peers.set(name, range);
  }
  const react = peers.get("react");
  peers.delete("react");
  const base = Object.fromEntries(peers);
  if (!react) return [{ name: "declared-peers", dependencies: base }];
  const majors = reactPeerMajors(react);
  if (!majors.length) throw new Error(`Cannot enumerate React peer majors from ${react}`);
  return majors.map((major) => ({ name: `react-${major}`, dependencies: { ...base, react: `^${major}.0.0`, "react-dom": `^${major}.0.0`, "@types/react": `^${major}.0.0`, "@types/react-dom": `^${major}.0.0` } }));
}
/** Aura3D packages whose public declarations name types from a third-party dependency, with that dependency's import
 * specifiers. Under NodeNext the dependency's own declarations must compile for the dependent's to. */
const UPSTREAM_TYPE_DEPENDENCIES: Record<string, readonly string[]> = {
  "@aura3d/navigation-recast": ["recast-navigation", "recast-navigation/generators"]
};
/** Dependents whose upstream type dependency fails `tsc` under NodeNext on its own, with the evidence line. */
function upstreamNodeNextDefects(project: string, packageNames: readonly string[]): Map<string, string> {
  const defects = new Map<string, string>();
  for (const [name, specifiers] of Object.entries(UPSTREAM_TYPE_DEPENDENCIES)) {
    if (!packageNames.includes(name)) continue;
    writeFileSync(join(project, "upstream-probe.ts"), `${specifiers.map((specifier, index) => `import type * as up${index} from ${JSON.stringify(specifier)};\nexport type Up${index} = typeof up${index};`).join("\n")}\n`);
    writeFileSync(join(project, "tsconfig.upstream-probe.json"), `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: false }, include: ["upstream-probe.ts"] }, null, 2)}\n`);
    const result = run("npm", ["exec", "tsc", "--", "-p", "tsconfig.upstream-probe.json"], project);
    if (result.ok) continue;
    const evidence = result.output.split("\n").find((line) => /error TS\d+/.test(line))?.trim().slice(0, 240) ?? "tsc failed";
    defects.set(name, `Upstream declarations of ${specifiers.join(", ")} do not compile under NodeNext on their own (${evidence}); not an Aura3D defect`);
  }
  return defects;
}
export async function runPublicApiContract(plan: ExactReleasePlan, workspace: string): Promise<{ pass: boolean; checks: Check[]; consumers: ReturnType<typeof contractConsumers> }> {
  const packages = candidatePackages(plan), consumers = contractConsumers(packages), profiles = peerProfiles(packages);
  if (!consumers.length || !profiles.length) throw new Error("Candidate exports or peer profiles are empty");
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  const checks: Check[] = [];
  for (const profile of profiles) {
    const project = join(workspace, profile.name);
    mkdirSync(project, { recursive: true });
    const dependencies = { ...Object.fromEntries(plan.packages.map((pkg) => [pkg.name, `file:${resolve(pkg.tarball)}`])), ...profile.dependencies };
    writeFileSync(join(project, "package.json"), `${JSON.stringify({ name: `aura3d-api-${profile.name}`, private: true, type: "module", dependencies, devDependencies: { typescript: "^5.8.3" } }, null, 2)}\n`);
    const installCommand = ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"];
    const installed = run(installCommand[0]!, installCommand.slice(1), project);
    checks.push({ id: `${profile.name}:install`, status: installed.ok ? "passed" : "failed", command: installCommand, exitCode: installed.exitCode, detail: installed.output });
    if (!installed.ok) {
      checks.push({ id: `${profile.name}:types:NodeNext`, status: "failed", command: [], exitCode: null, detail: "Required check not run because installation failed" });
      checks.push({ id: `${profile.name}:types:Bundler`, status: "failed", command: [], exitCode: null, detail: "Required check not run because installation failed" });
      for (const consumer of consumers) for (const condition of ["import", "require"] as const) {
        const required = condition === "import" ? consumer.nodeImport : consumer.nodeRequire;
        checks.push({ id: `${profile.name}:${condition}:${consumer.specifier}`, status: required ? "failed" : "not-applicable", command: [], exitCode: null, detail: required ? "Required check not run because installation failed" : consumer.reason ?? `${condition} condition not declared` });
      }
      continue;
    }
    // Confirm the installed lock points at every exact tarball, rather than an
    // identically versioned registry package.
    const lock = JSON.parse(readFileSync(join(project, "package-lock.json"), "utf8")) as { packages?: Record<string, { version?: string; integrity?: string }> };
    for (const pkg of plan.packages) {
      const entry = lock.packages?.[`node_modules/${pkg.name}`];
      const ok = entry?.version === pkg.version && entry.integrity === pkg.integrity;
      checks.push({ id: `${profile.name}:identity:${pkg.name}`, status: ok ? "passed" : "failed", command: ["inspect", "package-lock.json"], exitCode: ok ? 0 : 1, detail: ok ? `${pkg.version} ${pkg.sha256}` : "Installed version or integrity differs from candidate archive" });
    }
    writeFileSync(join(project, "public-valid.ts"), `import { camera, compilePromptPlan, createAuraApp, defineAuraAssets, definePromptPlan, effects, interactions, lights, material, model, promptPlanToScene, promptRecipes, scene, timeline } from "@aura3d/engine";
import { AuraCanvas, Camera, Effect, Lights, Model, Scene, productViewerScene } from "@aura3d/react";
void [camera, compilePromptPlan, createAuraApp, defineAuraAssets, definePromptPlan, effects, interactions, lights, material, model, promptPlanToScene, promptRecipes, scene, timeline, AuraCanvas, Camera, Effect, Lights, Model, Scene, productViewerScene];
`);
    writeFileSync(join(project, "public-negative.ts"), `import { camera, defineAuraAssets, model } from "@aura3d/engine";
const assets = defineAuraAssets({ product: { type: "model", format: "glb", url: "/product.glb", bounds: [1, 1, 1], hash: "sha256-product" } } as const);
// @ts-expect-error Model inputs require typed asset references.
model("product");
// @ts-expect-error Missing asset keys are not legal.
model(assets.missingAsset);
// @ts-expect-error Camera distance is numeric.
camera.orbit({ distance: "near" });
`);
    for (const mode of ["NodeNext", "Bundler"]) {
      // A dependency whose own declarations are invalid under NodeNext makes every
      // dependent's declarations unusable there, whatever Aura3D ships. The exception
      // is probed per run (the upstream must itself fail in this very install), so a
      // fixed upstream release re-enables the check without a code change.
      const upstreamDefective = mode === "NodeNext" ? upstreamNodeNextDefects(project, plan.packages.map((pkg) => pkg.name)) : new Map<string, string>();
      const isUpstreamDefective = (specifier: string) => [...upstreamDefective.keys()].some((name) => specifier === name || specifier.startsWith(`${name}/`));
      const typed = consumers.filter((consumer) => consumer.declarations && (mode === "Bundler" || consumer.nodeImport || consumer.nodeRequire || consumer.nodeTypes) && !isUpstreamDefective(consumer.specifier));
      for (const consumer of consumers.filter((item) => item.declarations && isUpstreamDefective(item.specifier))) {
        const name = [...upstreamDefective.keys()].find((candidate) => consumer.specifier === candidate || consumer.specifier.startsWith(`${candidate}/`))!;
        checks.push({ id: `${profile.name}:types:${mode}:${consumer.specifier}`, status: "not-applicable", command: [], exitCode: null, detail: upstreamDefective.get(name)! });
      }
      // Ambient (script) declaration entrypoints are loaded with a types reference,
      // which fails when the exported `types` target does not resolve.
      const references = typed.filter((consumer) => consumer.ambient).map((consumer) => `/// <reference types=${JSON.stringify(consumer.specifier)} />`).join("\n");
      const source = `${references}\n${typed.filter((consumer) => !consumer.ambient).map((consumer, index) => `import type * as api${index} from ${JSON.stringify(consumer.specifier)};\ntype Consumer${index} = typeof api${index};`).join("\n")}`;
      writeFileSync(join(project, `consumer.${mode}.ts`), `${source}\n`);
      for (const excluded of consumers.filter((consumer) => consumer.declarations && !typed.includes(consumer) && !isUpstreamDefective(consumer.specifier))) checks.push({ id: `${profile.name}:types:${mode}:${excluded.specifier}`, status: "not-applicable", command: [], exitCode: null, detail: "Package declares no Node type, import or require condition" });
      const config = { compilerOptions: { target: "ES2022", module: mode === "NodeNext" ? "NodeNext" : "ESNext", moduleResolution: mode, ...(mode === "Bundler" ? { customConditions: ["browser"] } : {}), strict: true, noEmit: true, skipLibCheck: false }, include: [`consumer.${mode}.ts`, "public-valid.ts", "public-negative.ts"] };
      writeFileSync(join(project, `tsconfig.${mode}.json`), `${JSON.stringify(config, null, 2)}\n`);
      const command = ["npm", "exec", "tsc", "--", "-p", `tsconfig.${mode}.json`];
      const result = run(command[0]!, command.slice(1), project);
      checks.push({ id: `${profile.name}:types:${mode}`, status: result.ok ? "passed" : "failed", command, exitCode: result.exitCode, detail: result.output || `${typed.length} declaration entrypoints compile` });
    }
    for (const consumer of consumers) {
      for (const condition of ["import", "require"] as const) {
        const required = condition === "import" ? consumer.nodeImport : consumer.nodeRequire;
        if (!required) { checks.push({ id: `${profile.name}:${condition}:${consumer.specifier}`, status: "not-applicable", command: [], exitCode: null, detail: consumer.reason ?? `${condition} condition not declared` }); continue; }
        const script = condition === "import" ? `await import(${JSON.stringify(consumer.specifier)});` : `require(${JSON.stringify(consumer.specifier)});`;
        const command = ["node", "--input-type", condition === "import" ? "module" : "commonjs", "-e", script];
        const result = run(command[0]!, command.slice(1), project);
        checks.push({ id: `${profile.name}:${condition}:${consumer.specifier}`, status: result.ok ? "passed" : "failed", command, exitCode: result.exitCode, detail: result.output });
      }
    }
  }
  return { pass: checks.length > 0 && profiles.every((profile) => checks.some((check) => check.id === `${profile.name}:install` && check.status === "passed")) && checks.every((check) => check.status !== "failed"), checks, consumers };
}
/** One line per failing check (capped), each followed by the leading lines of its
 * output, so a failing contract is diagnosable from the console alone. */
export function failureLines(checks: readonly Check[], cap: number): string[] {
  const lines: string[] = [];
  const failed = checks.filter((check) => check.status === "failed");
  for (const check of failed) {
    const detail = check.detail.split("\n").map((line) => line.trim()).filter((line) => line && !/^Command failed:/.test(line)).slice(0, 6);
    lines.push(`FAILED ${check.id}${check.exitCode === null ? "" : ` (exit ${check.exitCode})`}`, ...detail.map((line) => `    ${line.slice(0, 300)}`));
  }
  if (lines.length <= cap) return lines;
  return [...lines.slice(0, cap - 1), `... ${failed.length} failing checks in total; see the report for the rest`];
}
function option(name: string): string | undefined { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const planPath = option("--candidate-plan") ?? process.env.A3D_RELEASE_PLAN;
  if (!planPath) throw new Error("Usage: public-api-contract --candidate-plan <verified-plan> [--out <report>]");
  const plan = loadValidatedReleasePlan(process.cwd(), planPath);
  if (!plan) throw new Error("Validated candidate plan required");
  const reportPath = resolve(option("--out") ?? "tests/reports/public-api-contract.json");
  const workspace = resolve("tests/reports/public-api-contract-workspace");
  const result = await runPublicApiContract(plan, workspace);
  const report = { schema: "aura3d.public-api-contract/2", generatedAt: new Date().toISOString(), candidate: plan.reference, source: plan.source, workspace, packages: plan.packages.map(({ name, version, tarball, sha256: digest }) => ({ name, version, tarball, sha256: digest })), ...result };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
  console.log(`packed public API contract: ${result.pass ? "PASS" : "FAIL"}; ${result.consumers.length} entrypoints`);
  if (!result.pass) for (const line of failureLines(result.checks, 200)) console.log(line);
}
