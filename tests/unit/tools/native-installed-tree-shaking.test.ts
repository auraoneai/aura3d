import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build, type Metafile } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { SLICES, assertIsolatedInputs, assertOptionalExternals, copyVerifiedProject, main as measureInstalledTree, resolveSourceReportFile, measureSlice, retainedEngineSubtrees, retainedPackages } from "../../../tools/installed-tree-shaking/index";
import { hashConsumerProject, type NativeConsumerProject } from "../../../tools/package-clean-install/index";
import { renderBundleSizeMarkdown } from "../../../tools/bundle-size/markdown.mjs";
import { validateBundleCandidate, validateTreeCandidate } from "../../../tools/release/package-acceptance.mjs";
import { validateBudgetContinuity } from "../../../tools/release/budget-continuity.mjs";

const scratch: string[] = [];
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), "aura-tree-test-")); scratch.push(dir); return dir; };
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const write = (root: string, path: string, text: string): void => { const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function consumerFixture(): { root: string; project: NativeConsumerProject } {
  const root = temp();
  const path = "project";
  write(root, `${path}/package.json`, '{"name":"fixture"}');
  write(root, `${path}/package-lock.json`, '{"lockfileVersion":3}');
  write(root, `${path}/src/main.js`, "export const main = true;");
  write(root, `${path}/node_modules/@aura3d/engine/package.json`, '{"name":"@aura3d/engine"}');
  write(root, `${path}/node_modules/@aura3d/engine/index.js`, "export const engine = true;");
  write(root, `${path}/node_modules/wrapper/node_modules/@aura3d/engine/package.json`, '{"name":"@aura3d/engine"}');
  write(root, `${path}/node_modules/wrapper/node_modules/@aura3d/engine/index.js`, "export const nested = true;");
  const projectPath = join(root, path);
  const installPaths = ["node_modules/@aura3d/engine", "node_modules/wrapper/node_modules/@aura3d/engine"];
  return { root, project: {
    template: "fixture", kind: "fixture", path, entry: "src/main.js",
    manifestSha256: sha(readFileSync(join(projectPath, "package.json"), "utf8")),
    lockfileSha256: sha(readFileSync(join(projectPath, "package-lock.json"), "utf8")),
    projectSha256: hashConsumerProject(projectPath),
    installedPackages: installPaths.map(installPath => ({ name: "@aura3d/engine", installPath, version: "1.0.0", sha256: "a", integrity: "b", contentsSha256: hashConsumerProject(join(projectPath, installPath)) })),
    substitutions: []
  } };
}

type SliceId = "root" | "game-addon" | "react";
type OptionalBackend = "physics-rapier" | "navigation-recast";

/** Build and measure a copied consumer with a nested installed engine. */
async function measuredConsumerFixture(id: SliceId, backend?: OptionalBackend, retainBackend = false, dynamicBackend = false, backendInRoot = false) {
  const root = temp();
  const projectPath = "project";
  const projectRoot = join(root, projectPath);
  const engine = `${projectPath}/node_modules/@aura3d/engine`;
  const nestedEngine = `${projectPath}/node_modules/wrapper/node_modules/@aura3d/engine`;
  write(root, `${projectPath}/package.json`, '{"name":"fixture","type":"module"}');
  write(root, `${projectPath}/package-lock.json`, '{"lockfileVersion":3}');
  write(root, `${engine}/package.json`, '{"name":"@aura3d/engine","type":"module","sideEffects":false,"exports":{".":"./dist/engine/public/index.js","./game":"./dist/game/index.js","./react":"./dist/react/index.js"}}');
  const rootBackendExport = backend && backendInRoot
    ? dynamicBackend
      ? `export const backend = () => import("../../${backend}/index.js");`
      : `export { backend } from "../../${backend}/index.js";`
    : "";
  write(root, `${engine}/dist/engine/public/index.js`, `export { used } from "../agent-api/index.js"; export const unused = "public-unused"; ${rootBackendExport}`);
  if (backend && backendInRoot) write(root, `${engine}/dist/${backend}/index.js`, "export const backend = globalThis.optionalBackend;");
  write(root, `${engine}/dist/engine/agent-api/index.js`, 'export const used = globalThis.rootEngine; export const unused = "agent-unused";');
  write(root, `${engine}/dist/game/index.js`, "export const game = globalThis.gameAddon;");
  write(root, `${engine}/dist/react/index.js`, "export const reactEngine = globalThis.reactEngine;");
  write(root, `${projectPath}/node_modules/@aura3d/react/package.json`, '{"name":"@aura3d/react","type":"module","sideEffects":false,"exports":"./index.js"}');
  write(root, `${projectPath}/node_modules/@aura3d/react/index.js`, 'import { reactEngine } from "@aura3d/engine/react"; export const adapter = globalThis.makeAdapter(reactEngine);');
  write(root, `${projectPath}/node_modules/wrapper/package.json`, '{"name":"wrapper","type":"module","sideEffects":false,"exports":"./index.js"}');
  write(root, `${projectPath}/node_modules/wrapper/index.js`, 'export { nested, backend } from "@aura3d/engine";');
  write(root, `${nestedEngine}/package.json`, '{"name":"@aura3d/engine","type":"module","sideEffects":false,"exports":"./dist/index.js"}');
  const backendExport = backend
    ? dynamicBackend
      ? `export const backend = () => import("./${backend}/index.js");`
      : `export { backend } from "./${backend}/index.js";`
    : "export const backend = globalThis.unusedBackend;";
  write(root, `${nestedEngine}/dist/index.js`, `export const nested = globalThis.nestedEngine; ${backendExport}`);
  if (backend) write(root, `${nestedEngine}/dist/${backend}/index.js`, "export const backend = globalThis.optionalBackend;");

  const backendUse = retainBackend ? (dynamicBackend ? ", backend()" : ", backend") : "";
  const wrapperImport = retainBackend && !backendInRoot ? "nested, backend" : "nested";
  const engineImport = retainBackend && backendInRoot ? "used, backend" : "used";
  const entry = id === "react"
    ? `import { adapter } from "@aura3d/react"; ${backend ? `import { ${wrapperImport} } from "wrapper";` : ""} console.log(adapter${backend ? ", nested" : ""}${backendUse});`
    : `import { ${engineImport} } from "@aura3d/engine"; import { ${wrapperImport} } from "wrapper"; ${id === "game-addon" ? 'import { game } from "@aura3d/engine/game";' : ""} console.log(used, nested${id === "game-addon" ? ", game" : ""}${backendUse});`;
  write(root, `${projectPath}/src/main.js`, entry);
  const installPaths = ["node_modules/@aura3d/engine", "node_modules/wrapper/node_modules/@aura3d/engine", "node_modules/@aura3d/react"];
  const project: NativeConsumerProject = {
    template: "fixture", kind: "fixture", path: projectPath, entry: "src/main.js",
    manifestSha256: sha(readFileSync(join(projectRoot, "package.json"), "utf8")),
    lockfileSha256: sha(readFileSync(join(projectRoot, "package-lock.json"), "utf8")),
    projectSha256: hashConsumerProject(projectRoot),
    installedPackages: installPaths.map(installPath => ({ name: installPath.endsWith("/react") ? "@aura3d/react" : "@aura3d/engine", installPath, version: "1.0.0", sha256: "a", integrity: "b", contentsSha256: hashConsumerProject(join(projectRoot, installPath)) })),
    substitutions: []
  };
  const slice = SLICES.find(row => row.id === id);
  if (!slice) throw new Error(`Missing slice ${id}`);
  const work = join(root, "work");
  mkdirSync(work);
  return measureSlice(root, project, slice, work);
}

describe("isolated installed consumers", () => {
  it("checks every nested candidate installation in the copied project", () => {
    const { root, project } = consumerFixture();
    expect(() => copyVerifiedProject(root, project, join(root, "copy"))).not.toThrow();
    write(root, "project/node_modules/wrapper/node_modules/@aura3d/engine/index.js", "tampered");
    expect(() => copyVerifiedProject(root, project, join(root, "copy2"))).toThrow(/Copied installed package differs/);
  });

  it("rejects an escaping installed path and symlinked dependencies", () => {
    const { root, project } = consumerFixture();
    project.installedPackages[0]!.installPath = "../outside";
    expect(() => copyVerifiedProject(root, project, join(root, "copy"))).toThrow(/Invalid installed package path/);
    const isolated = join(root, "isolated");
    mkdirSync(isolated);
    const outside = join(root, "outside.js");
    writeFileSync(outside, "export {};");
    symlinkSync(outside, join(isolated, "linked.js"));
    expect(() => assertIsolatedInputs(isolated, ["linked.js"])).toThrow(/outside isolated project/);
  });

  it("bundles a genuine local consumer while excluding unused and game exports", async () => {
    const root = temp();
    write(root, "package.json", '{"type":"module"}');
    write(root, "node_modules/@aura3d/engine/package.json", '{"name":"@aura3d/engine","type":"module","sideEffects":false,"exports":{".":"./dist/index.js","./game":"./dist/game/index.js"}}');
    write(root, "node_modules/@aura3d/engine/dist/index.js", 'export const used = "used-value"; export const unused = "unused-sentinel";');
    write(root, "node_modules/@aura3d/engine/dist/game/index.js", 'export const game = "game-sentinel";');
    write(root, "src/main.js", 'import { used } from "@aura3d/engine"; console.log(used);');
    const result = await build({ absWorkingDir: root, entryPoints: ["src/main.js"], outfile: join(root, "out.js"), bundle: true, platform: "browser", format: "esm", treeShaking: true, minify: true, write: false, metafile: true });
    assertIsolatedInputs(root, Object.keys(result.metafile!.inputs));
    const output = result.outputFiles![0]!.text;
    expect(output).toContain("used-value");
    expect(output).not.toContain("unused-sentinel");
    expect(output).not.toContain("game-sentinel");
    expect(retainedPackages(result.metafile!)["@aura3d/engine"]).toBeGreaterThan(0);
    expect(retainedEngineSubtrees(result.metafile!).game ?? 0).toBe(0);
  });

  it("attributes nested outputs to the innermost package and counts game subtrees", () => {
    const metafile = { inputs: {}, outputs: { "out.js": { bytes: 100, imports: [], exports: [], inputs: {
      "node_modules/wrapper/node_modules/@aura3d/engine/dist/game/index.js": { bytesInOutput: 60 },
      "node_modules/wrapper/index.js": { bytesInOutput: 40 }
    } } } } as Metafile;
    expect(retainedPackages(metafile)).toEqual({ "@aura3d/engine": 60, wrapper: 40 });
    expect(retainedEngineSubtrees(metafile)).toEqual({ game: 60 });
  });

  it("attributes adapter subtrees to the innermost engine across nested paths and chunks", () => {
    const metafile = { inputs: {}, outputs: {
      "out.js": { bytes: 100, imports: [], exports: [], inputs: {
        "node_modules/wrapper/node_modules/@aura3d/engine/dist/physics-rapier/index.js": { bytesInOutput: 12 },
        "node_modules/wrapper/node_modules/@aura3d/engine/dist/physics-rapier/node_modules/helper/index.js": { bytesInOutput: 7 },
        "node_modules\\wrapper\\node_modules\\@aura3d\\engine\\dist\\navigation-recast\\index.js": { bytesInOutput: 8 },
        "node_modules/@aura3d/engine/dist/game/index.js": { bytesInOutput: 9 }
      } },
      "chunk.js": { bytes: 5, imports: [], exports: [], inputs: {
        "node_modules/wrapper/node_modules/@aura3d/engine/dist/physics-rapier/index.js": { bytesInOutput: 5 }
      } }
    } } as Metafile;
    expect(retainedPackages(metafile)).toEqual({ "@aura3d/engine": 34, helper: 7 });
    expect(retainedEngineSubtrees(metafile)).toEqual({ "physics-rapier": 17, "navigation-recast": 8, game: 9 });
  });

  it.each([
    ["root", "physics-rapier", false, true],
    ["root", "physics-rapier", false, false],
    ["root", "navigation-recast", false, false],
    ["game-addon", "physics-rapier", true, true],
    ["game-addon", "physics-rapier", true, false],
    ["game-addon", "navigation-recast", false, false],
    ["react", "physics-rapier", false, false],
    ["react", "navigation-recast", false, false]
  ] as const)("rejects retained %s slice adapter %s (dynamic: %s, top-level: %s)", async (id, backend, dynamic, backendInRoot) => {
    const result = await measuredConsumerFixture(id, backend, true, dynamic, backendInRoot);
    const checks = Object.fromEntries(result.checks.map(check => [check.id, check]));
    const measurement = result.measurement as { retainedPackages: Record<string, number>; retainedEngineSubtrees: Record<string, number>; chunks: string[] };
    expect(measurement.retainedPackages["@aura3d/engine"]).toBeGreaterThan(0);
    expect(measurement.retainedPackages[`@aura3d/${backend}`] ?? 0).toBe(0);
    expect(measurement.retainedEngineSubtrees[backend]).toBeGreaterThan(0);
    expect(checks[`${id}-excludes-optional-packages`]?.pass).toBe(true);
    expect(checks[`${id}-excludes-optional-backend-subtrees`]).toMatchObject({ pass: false, detail: expect.stringContaining(backend) });
    expect(result.checks.filter(check => !check.pass).map(check => check.id)).toEqual([`${id}-excludes-optional-backend-subtrees`]);
    if (dynamic) expect(measurement.chunks.length).toBeGreaterThan(1);
  });

  it.each([
    ["root", "physics-rapier"],
    ["game-addon", "navigation-recast"],
    ["react", undefined]
  ] as const)("allows the intended %s slice and unused optional adapters", async (id, backend) => {
    const result = await measuredConsumerFixture(id, backend);
    const measurement = result.measurement as { retainedEngineSubtrees: Record<string, number> };
    expect(result.checks.filter(check => !check.pass)).toEqual([]);
    if (backend) expect(measurement.retainedEngineSubtrees[backend] ?? 0).toBe(0);
    if (id === "game-addon") expect(measurement.retainedEngineSubtrees.game).toBeGreaterThan(0);
    if (id === "react") expect(measurement.retainedEngineSubtrees.react).toBeGreaterThan(0);
  });

  it.each(["root", "react"] as const)("keeps a lazily loaded navigation-recast adapter external in the %s slice (finalize-dist internalizes the optional peer)", async id => {
    const result = await measuredConsumerFixture(id, "navigation-recast", true, true, false);
    const measurement = result.measurement as { retainedEngineSubtrees: Record<string, number>; externalDynamicImports: string[] };
    expect(result.checks.filter(check => !check.pass)).toEqual([]);
    expect(measurement.retainedEngineSubtrees["navigation-recast"] ?? 0).toBe(0);
    expect(measurement.externalDynamicImports).toContain("@aura3d/navigation-recast");
  });

  it("permits only asynchronous documented optional peers and Node-only dynamic branches as externals", () => {
    const graph = (path: string, kind: string) => ({ inputs: {}, outputs: { "out.js": { bytes: 1, inputs: {}, exports: [], imports: [{ path, kind, external: true }] } } } as Metafile);
    expect(assertOptionalExternals(graph("@aura3d/navigation-recast", "dynamic-import"))).toEqual(["@aura3d/navigation-recast"]);
    expect(() => assertOptionalExternals(graph("@aura3d/navigation-recast", "import-statement"))).toThrow(/Unexpected external/);
    // @gltf-transform/core reaches node:fs / node:path only through a dynamic import that a browser never runs.
    expect(assertOptionalExternals(graph("node:fs", "dynamic-import"))).toEqual(["node:fs"]);
    expect(assertOptionalExternals(graph("node:path", "dynamic-import"))).toEqual(["node:path"]);
    expect(() => assertOptionalExternals(graph("node:fs", "import-statement"))).toThrow(/Unexpected external/);
    expect(() => assertOptionalExternals(graph("node:child_process", "dynamic-import"))).toThrow(/Unexpected external/);
    expect(() => assertOptionalExternals(graph("left-pad", "dynamic-import"))).toThrow(/Unexpected external/);
  });

  it("rejects an output directory outside retained reports before measuring", async () => {
    const previous = process.env.NATIVE_REPORT_DIR;
    try {
      process.env.NATIVE_REPORT_DIR = "../outside";
      await expect(measureInstalledTree([], temp())).rejects.toThrow(/path under tests\/reports/);
    } finally {
      if (previous === undefined) delete process.env.NATIVE_REPORT_DIR;
      else process.env.NATIVE_REPORT_DIR = previous;
    }
  });
});

describe("candidate-bound reports", () => {
  const planRef = { path: "candidate/plan.json", sha256: "a".repeat(64) };
  const plan = { version: "1.0.0", source: { commit: "revision", fingerprint: "b".repeat(64), lockfileSha256: "c".repeat(64) }, packages: [{ name: "@aura3d/engine", version: "1.0.0", sha256: "d".repeat(64) }] };
  const candidate = { status: "bound" as const, releasePlan: planRef, version: plan.version, source: plan.source };

  it("requires the report candidate to match the current plan and source", () => {
    expect(() => validateBundleCandidate({ candidate }, planRef, plan)).not.toThrow();
    expect(() => validateBundleCandidate({ candidate: { ...candidate, version: "old" } }, planRef, plan)).toThrow(/candidate binding/);
    expect(() => validateBundleCandidate({ candidate: { ...candidate, source: { ...plan.source, fingerprint: "old" } } }, planRef, plan)).toThrow(/candidate binding/);
  });

  it("rejects a modified or mismatched source report", () => {
    const root = temp();
    const path = "tests/reports/native-consumers/run-1/source.json";
    const source = { schema: "aura3d.native-consumers/1", phase: "source", pass: true, runId: "run-1", source: { revision: plan.source.commit, stagedSourceSha256: plan.source.fingerprint, lockfileSha256: plan.source.lockfileSha256 }, candidate: { ...planRef, version: plan.version, packages: plan.packages } };
    const bytes = JSON.stringify(source);
    write(root, path, bytes);
    const report = { schema: "aura3d.installed-tree-shaking/2", candidate, sourceReport: { path, sha256: sha(bytes), runId: "run-1" } };
    expect(() => validateTreeCandidate(root, report, planRef, plan)).not.toThrow();
    write(root, path, `${bytes} `);
    expect(() => validateTreeCandidate(root, report, planRef, plan)).toThrow(/source report changed/);
    source.candidate.sha256 = "f".repeat(64);
    const different = JSON.stringify(source);
    write(root, path, different);
    expect(() => validateTreeCandidate(root, { ...report, sourceReport: { ...report.sourceReport, sha256: sha(different) } }, planRef, plan)).toThrow(/different candidate/);
  });

  it("prints candidate identity and never labels an unbound observation as a release pass", () => {
    const rows = [{ label: "fixture", jsBytes: 100, gzipBytes: 50, budget: 100, enforced: true, sizeLimitPassed: true }];
    expect(renderBundleSizeMarkdown(rows, candidate)).toContain(planRef.sha256);
    expect(renderBundleSizeMarkdown(rows, candidate)).toContain("| pass |");
    expect(renderBundleSizeMarkdown(rows)).toContain("within budget (unbound)");
    expect(renderBundleSizeMarkdown(rows)).not.toContain("| pass |");
    expect(renderBundleSizeMarkdown(rows, candidate, "tests/reports/native-capabilities/run/bundle-size.json")).toContain("`tests/reports/native-capabilities/run/bundle-size.json`");
  });

  it("enforces the current four starter budgets without Git metadata", () => {
    const root = temp();
    const path = "tools/bundle-size/index.ts";
    const source = readFileSync(path, "utf8");
    write(root, "package.json", '{"version":"4.7.1"}');
    write(root, path, source);
    const result = validateBudgetContinuity(root);
    const limits = Object.fromEntries(result.baselineTargets.map((target: { id: string; budget: number }) => [target.id, target.budget]));
    expect([limits["core-agent-api"], limits["template-product-viewer"], limits["template-cinematic-scene"], limits["template-mini-game"]]).toEqual([2_056_000, 1_796_000, 1_804_000, 1_910_000]);
    expect(result.baselineEncoding).toBe("static-target-contract");
    write(root, path, source.replace("budget: 2_056_000", "budget: 2_056_001"));
    expect(() => validateBudgetContinuity(root)).toThrow(/Increased bundle budget: core-agent-api/);
  });
});

describe("installed tree-shaking source report path", () => {
  it("accepts the source report as source5-run.sh passes it, relative or absolute, inside the source root", () => {
    const root = temp();
    write(root, "tests/reports/native-consumers/run-1/source.json", "{}");
    const relative = "tests/reports/native-consumers/run-1/source.json";
    expect(resolveSourceReportFile(root, relative)).toBe(join(root, relative));
    expect(resolveSourceReportFile(root, join(root, relative))).toBe(join(root, relative));
  });

  it("names a missing report as missing (the clean-install step did not write it) rather than as outside the root", () => {
    const root = temp();
    expect(() => resolveSourceReportFile(root, "tests/reports/native-consumers/run-1/source.json"))
      .toThrow(/Source report not found: tests\/reports\/native-consumers\/run-1\/source\.json.*package-clean-install/);
  });

  it("rejects a report outside the source root, including through a symlink", () => {
    const root = temp(), outside = temp();
    write(outside, "source.json", "{}");
    expect(() => resolveSourceReportFile(root, join(outside, "source.json"))).toThrow("Source report must be inside the source root");
    mkdirSync(join(root, "tests/reports"), { recursive: true });
    symlinkSync(join(outside, "source.json"), join(root, "tests/reports/link.json"));
    expect(() => resolveSourceReportFile(root, "tests/reports/link.json")).toThrow("Source report must be inside the source root");
  });
});
