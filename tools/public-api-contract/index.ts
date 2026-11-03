import { execFileSync } from "node:child_process";
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
/** Explicitly enumerate each package's concrete exports, including wildcard
 * expansions. Assets and browser-only conditions are reported separately. */
export function contractConsumers(packages: Map<string, PackedPackage>): { specifier: string; declarations: boolean; nodeImport: boolean; nodeRequire: boolean; nodeTypes: boolean; reason?: string }[] {
  const result: { specifier: string; declarations: boolean; nodeImport: boolean; nodeRequire: boolean; nodeTypes: boolean; reason?: string }[] = [];
  for (const [name, pkg] of packages) for (const entry of expandExports(pkg)) {
    const keys = Object.keys(entry.conditions);
    const importable = keys.some((key) => key === "default" || key === "import" || key === "node" || key.startsWith("node/import") || key.startsWith("node/default"));
    const requireable = keys.some((key) => key === "require" || key === "node/require");
    const nodeTypes = keys.some((key) => key === "types" || key.startsWith("node/types") || key.startsWith("node/import/types") || key.startsWith("node/require/types"));
    result.push({ nodeTypes, specifier: `${name}${entry.subpath === "." ? "" : entry.subpath.slice(1)}`, declarations: !entry.asset, nodeImport: !entry.asset && importable, nodeRequire: !entry.asset && requireable, ...(!entry.asset && !importable && !requireable ? { reason: "no Node import or require condition" } : entry.asset ? { reason: "non-code export" } : {}) });
  }
  return result.sort((a, b) => a.specifier.localeCompare(b.specifier));
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
  const majors = [...new Set([...react.matchAll(/(?:\^|~|>=?)?\s*(\d+)\./g)].map((m) => Number(m[1])))];
  if (!majors.length) throw new Error(`Cannot enumerate React peer majors from ${react}`);
  return majors.map((major) => ({ name: `react-${major}`, dependencies: { ...base, react: `^${major}.0.0`, "react-dom": `^${major}.0.0`, "@types/react": `^${major}.0.0`, "@types/react-dom": `^${major}.0.0` } }));
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
      const typed = consumers.filter((consumer) => consumer.declarations && (mode === "Bundler" || consumer.nodeImport || consumer.nodeRequire || consumer.nodeTypes));
      const source = typed.map((consumer, index) => `import type * as api${index} from ${JSON.stringify(consumer.specifier)};\ntype Consumer${index} = typeof api${index};`).join("\n");
      writeFileSync(join(project, `consumer.${mode}.ts`), `${source}\n`);
      for (const excluded of consumers.filter((consumer) => consumer.declarations && !typed.includes(consumer))) checks.push({ id: `${profile.name}:types:${mode}:${excluded.specifier}`, status: "not-applicable", command: [], exitCode: null, detail: "Package declares no Node type, import or require condition" });
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
}
