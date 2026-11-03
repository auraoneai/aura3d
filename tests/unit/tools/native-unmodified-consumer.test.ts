import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditConsumerCopy, checkTemplate, consumerPreflight, prepareConsumerCopy } from "../../../tools/packed-consumer-check/index";
import { findUnresolvedInternalAuraImports, inspectPackageExportConditions, missingNativeChecks } from "../../../tools/package-install-smoke/index";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): { source: string; copy: string } {
  const root = mkdtempSync(join(tmpdir(), "native-untouched-consumer-"));
  roots.push(root);
  const source = join(root, "template");
  const copy = join(root, "consumer");
  mkdirSync(join(source, "src"), { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({
    name: "example-consumer", private: true, scripts: { build: "vite build" },
    dependencies: { "@aura3d/engine": "^4.0.0" }, devDependencies: { vite: "^7.0.0", typescript: "^5.0.0" }
  }, null, 2));
  writeFileSync(join(source, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }));
  writeFileSync(join(source, "src/index.ts"), 'import { scene } from "@aura3d/engine";\nexport const value = scene();\n');
  return { source, copy };
}

const replacement = { "@aura3d/engine": "file:/candidate.tgz" };

describe("untouched packed consumers", () => {
  it("records only the package substitution and leaves original inputs untouched", () => {
    const { source, copy } = fixture();
    const original = readFileSync(join(source, "package.json"), "utf8");
    prepareConsumerCopy(source, copy, "/candidate.tgz");
    expect(readFileSync(join(source, "package.json"), "utf8")).toBe(original);
    const changes = auditConsumerCopy(source, copy, replacement);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "package.json", allowed: true });
    expect(changes[0]?.beforeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(changes[0]?.afterSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(consumerPreflight(copy)).toEqual([]);
  });

  it("detects injected dependencies, configuration and changed source", () => {
    const { source, copy } = fixture();
    prepareConsumerCopy(source, copy, "/candidate.tgz");
    const manifest = JSON.parse(readFileSync(join(copy, "package.json"), "utf8"));
    manifest.devDependencies["@types/node"] = "latest";
    writeFileSync(join(copy, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(copy, "vite.config.ts"), "export default {};\n");
    writeFileSync(join(copy, "src/index.ts"), "export const fixed = true;\n");
    expect(auditConsumerCopy(source, copy, replacement).filter((change) => !change.allowed).map((change) => change.path))
      .toEqual(["package.json", "src/index.ts", "vite.config.ts"]);
  });

  it("fails early on missing declared dependencies, configuration, and skipped builds", () => {
    const { source, copy } = fixture();
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    delete manifest.devDependencies.typescript;
    writeFileSync(join(source, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(source, "src/index.ts"), 'import { readFile } from "node:fs";\nimport missing from "missing-lib";\n');
    rmSync(join(source, "tsconfig.json"));
    const result = checkTemplate(source, copy, "/candidate.tgz", new Set(["."]), {});
    expect(result.detail).toContain("typescript is not declared");
    expect(result.detail).toContain("tsconfig.json is missing");
    expect(result.detail).toContain("@types/node is not declared");
    expect(result.detail).toContain("dependency missing-lib is not declared");
    expect(result.steps.install).toBe("skip");

    const other = fixture();
    const skipped = checkTemplate(other.source, other.copy, "/candidate.tgz", new Set(["."]), { skipBuild: true });
    expect(skipped.detail).toContain("required build check was skipped");
    expect(skipped.steps.install).toBe("skip");
  });

  it("records install-generated lockfiles without accepting other repairs", () => {
    const { source, copy } = fixture();
    prepareConsumerCopy(source, copy, "/candidate.tgz");
    writeFileSync(join(copy, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(auditConsumerCopy(source, copy, replacement).find((c) => c.path === "pnpm-lock.yaml")?.allowed).toBe(false);
    expect(auditConsumerCopy(source, copy, replacement, { afterInstall: true }).find((c) => c.path === "pnpm-lock.yaml")?.allowed).toBe(true);
  });
});


describe("installed package conditions", () => {
  it("rejects missing, duplicate, failed or skipped required probes", () => {
    const names = ["optional peers absent, SSR and import conditions", "optional peers absent, browser export conditions", "install optional peers", "optional peers present, SSR and import conditions", "optional peers present, browser export conditions"];
    const checks = names.map((name) => ({ name, status: "pass" as const }));
    expect(missingNativeChecks(checks)).toEqual([]);
    expect(missingNativeChecks(checks.slice(1))).toHaveLength(1);
    expect(missingNativeChecks([...checks, checks[0]!])).toHaveLength(1);
    expect(missingNativeChecks(checks.map((check, i) => i === 2 ? { ...check, status: "not-run" as const } : check))).toHaveLength(1);
  });
  it("requires every conditional declaration and runtime target to be packed", () => {
    const root = mkdtempSync(join(tmpdir(), "native-export-conditions-"));
    roots.push(root);
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@aura3d/engine",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js", browser: "./dist/browser.js" }, "./feature/*": "./dist/features/*.js" }
    }));
    writeFileSync(join(root, "dist/index.js"), "export {};\n");
    writeFileSync(join(root, "dist/index.d.ts"), "export {};\n");
    const missing = inspectPackageExportConditions(root);
    expect(missing).toEqual(expect.arrayContaining([
      expect.stringContaining("missing export target ./dist/browser.js"),
      expect.stringContaining("wildcard target has no files")
    ]));
    mkdirSync(join(root, "dist/features"));
    writeFileSync(join(root, "dist/browser.js"), "export {};\n");
    writeFileSync(join(root, "dist/features/example.js"), "export {};\n");
    expect(inspectPackageExportConditions(root)).toEqual([]);
  });

  it("allows declared Aura3D dependencies but rejects undeclared workspace imports", () => {
    const root = mkdtempSync(join(tmpdir(), "native-package-deps-"));
    roots.push(root);
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { "@aura3d/scene": "1.0.0" } }));
    writeFileSync(join(root, "dist/index.js"), 'import "@aura3d/scene/math";\nimport "@aura3d/rendering";\n');
    expect(findUnresolvedInternalAuraImports(root)).toEqual(["dist/index.js -> @aura3d/rendering"]);
  });
});

import { createHash } from "node:crypto";
import { copyTemplateHdris, TEMPLATE_ENVIRONMENT_PRESETS } from "../../../packages/create-aura3d/src/template-hdri";

function environmentFixture(): { root: string; hdri: string; project: string } {
  const root = mkdtempSync(join(tmpdir(), "native-template-environments-"));
  roots.push(root);
  const hdri = join(root, "hdri"), source = join(root, "aura-environments"), project = join(root, "project");
  mkdirSync(hdri); mkdirSync(source); mkdirSync(project);
  writeFileSync(join(hdri, "look.hdr"), "fixture");
  writeFileSync(join(hdri, "ATTRIBUTION.md"), "fixture attribution");
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  for (const name of TEMPLATE_ENVIRONMENT_PRESETS) {
    const specular = `${name}.specular.ktx2`, sh9 = `${name}.sh9.f32`;
    const a = `${name}-specular`, b = `${name}-sh9`;
    writeFileSync(join(source, specular), a); writeFileSync(join(source, sh9), b);
    writeFileSync(join(source, `${name}.manifest.json`), JSON.stringify({ name, specular, sh9, license: "CC0", sha256: { specular: sha(a), sh9: sha(b) } }));
  }
  return { root, hdri, project };
}

describe("template environment assets", () => {
  it("copies every verified promised preset and look HDRI into the scaffold", () => {
    const { hdri, project } = environmentFixture();
    const copied = copyTemplateHdris(hdri, project);
    expect(copied).toContain("public/hdri/look.hdr");
    for (const name of TEMPLATE_ENVIRONMENT_PRESETS) {
      for (const suffix of ["manifest.json", "specular.ktx2", "sh9.f32"]) {
        const path = `public/aura-environments/${name}.${suffix}`;
        expect(copied).toContain(path);
        expect(readFileSync(join(project, path)).byteLength).toBeGreaterThan(0);
      }
    }
  });

  it("fails before copying when an asset is missing or has been modified", () => {
    const missing = environmentFixture();
    rmSync(join(missing.root, "aura-environments", "outdoor.sh9.f32"));
    expect(() => copyTemplateHdris(missing.hdri, missing.project)).toThrow(/ENV_PRESET_UNAVAILABLE:outdoor/);
    expect(() => readFileSync(join(missing.project, "public/hdri/look.hdr"))).toThrow();
    const changed = environmentFixture();
    writeFileSync(join(changed.root, "aura-environments", "night.specular.ktx2"), "different");
    expect(() => copyTemplateHdris(changed.hdri, changed.project)).toThrow(/ENV_PRESET_INVALID:night.*digest mismatch/);
  });
});


import { hashConsumerProject, validateSourceConsumerReport } from "../../../tools/package-clean-install/index";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src/index";
import type { ExactReleasePlan } from "../../../tools/release/exact-release-plan.mjs";

const mockedPlan = vi.hoisted(() => ({ current: null as ExactReleasePlan | null }));
vi.mock("../../../tools/release/exact-release-plan.mjs", () => ({
  loadValidatedReleasePlan: () => mockedPlan.current,
  inspectInstalledRelease: () => ({ packages: [{}] })
}));

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function sourceReportFixture() {
  const root = mkdtempSync(join(tmpdir(), "native-source-report-"));
  roots.push(root);
  const runId = "candidate-run", reportDir = join(root, "tests/reports/native-consumers", runId);
  const lockBytes = "lockfile-content", fingerprint = "a".repeat(64);
  writeFileSync(join(root, "pnpm-lock.yaml"), lockBytes);
  mkdirSync(join(root, "candidate"), { recursive: true });
  const archive = Buffer.from("candidate-tarball");
  writeFileSync(join(root, "candidate/engine.tgz"), archive);
  const candidate = { name: "@aura3d/engine", version: "1.0.0", tarball: "candidate/engine.tgz", sha256: sha256(archive), integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}` };
  const planFile = JSON.stringify({ version: "1.0.0", packages: [candidate] });
  writeFileSync(join(root, "candidate/plan.json"), planFile);
  const plan: ExactReleasePlan = { version: "1.0.0", source: { commit: "source", tree: "tree", fingerprint, lockfileSha256: sha256(lockBytes) }, reference: { path: "candidate/plan.json", sha256: sha256(planFile) }, packages: [candidate] };
  mockedPlan.current = plan;
  const names = [...CREATE_AURA3D_TEMPLATES, "react-import"];
  const checks: Array<{ id: string; project: string; command: string[]; status: string; exitCode: number; logPath: string }> = [];
  const launcherLog = `tests/reports/native-consumers/${runId}/logs/launcher-install.log`;
  mkdirSync(join(root, `tests/reports/native-consumers/${runId}/logs`), { recursive: true });
  writeFileSync(join(root, launcherLog), "ok");
  checks.push({ id: "launcher:install", project: "launcher", command: ["test", "install"], status: "passed", exitCode: 0, logPath: launcherLog });
  const projects = names.map((name) => {
    const isTemplate = name !== "react-import";
    const path = `tests/reports/native-consumers/${runId}/projects/${isTemplate ? `templates/${name}/demo` : name}`;
    const dir = join(root, path), installed = join(dir, "node_modules/@aura3d/engine");
    mkdirSync(join(dir, "src"), { recursive: true }); mkdirSync(join(dir, "dist")); mkdirSync(join(installed, "dist"), { recursive: true });
    const manifest = JSON.stringify({ name, dependencies: { "@aura3d/engine": "file:candidate" } });
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/@aura3d/engine": { version: candidate.version, integrity: candidate.integrity } } });
    writeFileSync(join(dir, "package.json"), manifest); writeFileSync(join(dir, "package-lock.json"), lock);
    writeFileSync(join(dir, "src/main.ts"), "source"); writeFileSync(join(dir, "dist/bundle.js"), "built");
    writeFileSync(join(installed, "package.json"), JSON.stringify({ name: candidate.name, version: candidate.version }));
    writeFileSync(join(installed, "dist/index.js"), "installed");
    for (const step of [...(isTemplate ? ["scaffold"] : []), "install", "build"]) {
      const logPath = `tests/reports/native-consumers/${runId}/logs/${name}-${step}.log`;
      mkdirSync(join(root, `tests/reports/native-consumers/${runId}/logs`), { recursive: true });
      writeFileSync(join(root, logPath), "ok");
      checks.push({ id: `${name}:${step}`, project: name, command: ["test", step], status: "passed", exitCode: 0, logPath });
    }
    return { template: name, kind: isTemplate ? "template" : "fixture", path, entry: "src/main.ts", manifestSha256: sha256(manifest), lockfileSha256: sha256(lock), projectSha256: hashConsumerProject(dir), installedPackages: [{ name: candidate.name, installPath: "node_modules/@aura3d/engine", version: candidate.version, sha256: candidate.sha256, integrity: candidate.integrity, contentsSha256: hashConsumerProject(installed) }], substitutions: [] };
  });
  const report = { schema: "aura3d.native-consumers/1", phase: "source", runId, pass: true, source: { revision: "source", stagedSourceSha256: fingerprint, lockfileSha256: sha256(lockBytes) }, candidate: { path: plan.reference.path, sha256: plan.reference.sha256, version: plan.version, packages: plan.packages }, toolVersions: { node: "v22", npm: "10" }, projects, checks, browser: CREATE_AURA3D_TEMPLATES.map((id) => ({ id, status: "not-run" })) };
  const reportPath = join(reportDir, "source.json");
  const save = () => writeFileSync(reportPath, JSON.stringify(report));
  save();
  return { root, plan, report, reportPath, save };
}

describe("retained source consumer report identity", () => {
  it("changes the retained hash for source, build and installed package bytes", () => {
    const { root, plan, report, reportPath } = sourceReportFixture();
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).not.toThrow();
    const first = report.projects[0]!, dir = join(root, first.path);
    const original = hashConsumerProject(dir);
    writeFileSync(join(dir, "dist/bundle.js"), "changed bundle");
    expect(hashConsumerProject(dir)).not.toBe(original);
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/Consumer project changed/);
    writeFileSync(join(dir, "dist/bundle.js"), "built");
    writeFileSync(join(dir, "src/main.ts"), "changed source");
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/Consumer project changed/);
    writeFileSync(join(dir, "src/main.ts"), "source");
    writeFileSync(join(dir, "node_modules/@aura3d/engine/dist/index.js"), "changed installed bytes");
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/Installed candidate changed/);
  });

  it("fails closed for a missing current plan, a mismatched candidate and skipped required checks", () => {
    const { root, plan, report, reportPath, save } = sourceReportFixture();
    mockedPlan.current = null;
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/Candidate plan or staged source changed/);
    mockedPlan.current = plan;
    report.candidate.version = "different"; save();
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/candidate does not match/);
    report.candidate.version = plan.version;
    report.checks[0]!.status = "not-run"; save();
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/checks failed or were skipped/);
    report.checks[0]!.status = "passed";
    report.projects.pop(); save();
    expect(() => validateSourceConsumerReport(root, reportPath, plan)).toThrow(/inventory is incomplete/);
  });
});
