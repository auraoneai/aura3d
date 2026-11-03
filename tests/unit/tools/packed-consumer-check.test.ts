import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkTemplate,
  collectEngineSpecifiers,
  specifierAllowed
} from "../../../tools/packed-consumer-check/index";
import { loadValidatedReleasePlan } from "../../../tools/release/exact-release-plan.mjs";

const REPO_ROOT = resolve(__dirname, "../../..");
const FIXTURE = join(REPO_ROOT, "tools/packed-consumer-check/fixtures/repo-alias-only");
const ENGINE_NAME = "@aura3d/engine";

type CandidatePackage = {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly sha256: string;
  readonly integrity: string;
};
type CandidatePlan = { readonly packages: readonly CandidatePackage[] };
type SelectedArchive = { readonly path: string; readonly sha256: string; readonly version: string; readonly candidate: boolean };

/**
 * A source job must consume the already-verified candidate and may never
 * silently fall back to a new pack. The explicit standalone fallback keeps
 * this test useful to developers who have no staged release plan.
 */
function selectEngineArchive(options: {
  readonly root: string;
  readonly planPath: string | undefined;
  readonly sourceJob: boolean;
  readonly loadPlan: (root: string, planPath: string) => CandidatePlan | null;
  readonly packStandalone: () => SelectedArchive;
}): SelectedArchive {
  if (!options.planPath) {
    if (options.sourceJob) throw new Error("A3D_RELEASE_PLAN is required for the packed source consumer");
    return options.packStandalone();
  }
  // This loader validates staged source identity, package inventory, versions,
  // and both digests for every retained archive before one is selected.
  const plan = options.loadPlan(options.root, options.planPath);
  if (!plan || !Array.isArray(plan.packages)) throw new Error("Invalid exact release plan");
  const matches = plan.packages.filter((entry) => entry.name === ENGINE_NAME);
  if (matches.length !== 1) throw new Error("Exact release plan must contain one engine archive");
  const candidate = matches[0]!;
  const path = candidate.tarball;
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid engine candidate archive path");
  }
  const root = realpathSync(options.root);
  const archive = realpathSync(resolve(options.root, path));
  if (!archive.startsWith(root + sep)) throw new Error("Engine candidate archive escapes source root");
  const bytes = readFileSync(archive);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (!/^[a-f0-9]{64}$/.test(candidate.sha256) || sha256 !== candidate.sha256 || integrity !== candidate.integrity) {
    throw new Error("Engine candidate archive digest mismatch");
  }
  if (typeof candidate.version !== "string" || !candidate.version) throw new Error("Engine candidate version is missing");
  return { path: archive, sha256, version: candidate.version, candidate: true };
}

describe("packed candidate selection", () => {
  let root: string;
  let engine: CandidatePackage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "a3d-candidate-selection-"));
    const bytes = Buffer.from("independent synthetic archive bytes");
    writeFileSync(join(root, "engine.tgz"), bytes);
    engine = {
      name: ENGINE_NAME, version: "1.2.3", tarball: "engine.tgz",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`
    };
  });
  afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it("uses the exact validated plan archive without repacking", () => {
    const loadPlan = vi.fn(() => ({ packages: [engine] }));
    const packStandalone = vi.fn((): SelectedArchive => { throw new Error("must not pack"); });
    const selected = selectEngineArchive({ root, planPath: "plan.json", sourceJob: true, loadPlan, packStandalone });
    expect(loadPlan).toHaveBeenCalledWith(root, "plan.json");
    expect(packStandalone).not.toHaveBeenCalled();
    expect(selected).toEqual({ path: realpathSync(join(root, "engine.tgz")), sha256: engine.sha256, version: "1.2.3", candidate: true });
  });

  it("rejects missing or invalid source plans without falling back to a pack", () => {
    const packStandalone = vi.fn((): SelectedArchive => { throw new Error("must not pack"); });
    expect(() => selectEngineArchive({ root, planPath: undefined, sourceJob: true, loadPlan: () => null, packStandalone })).toThrow(/A3D_RELEASE_PLAN/);
    expect(() => selectEngineArchive({ root, planPath: "bad.json", sourceJob: true, loadPlan: () => { throw new Error("source mismatch"); }, packStandalone })).toThrow(/source mismatch/);
    expect(() => selectEngineArchive({ root, planPath: "bad.json", sourceJob: true, loadPlan: () => null, packStandalone })).toThrow(/Invalid exact release plan/);
    expect(packStandalone).not.toHaveBeenCalled();
  });

  it("rejects changed bytes, wrong integrity, duplicate packages and unsafe paths", () => {
    const select = (entries: CandidatePackage[]) => selectEngineArchive({ root, planPath: "plan.json", sourceJob: true, loadPlan: () => ({ packages: entries }), packStandalone: () => { throw new Error("must not pack"); } });
    expect(() => select([])).toThrow(/one engine archive/);
    expect(() => select([engine, engine])).toThrow(/one engine archive/);
    expect(() => select([{ ...engine, integrity: "sha512-wrong" }])).toThrow(/digest mismatch/);
    expect(() => select([{ ...engine, tarball: "../engine.tgz" }])).toThrow(/archive path/);
    writeFileSync(join(root, "engine.tgz"), "changed bytes");
    expect(() => select([engine])).toThrow(/digest mismatch/);
  });

  it("allows an explicit standalone pack only outside a source job", () => {
    const fallback: SelectedArchive = { path: join(root, "engine.tgz"), sha256: engine.sha256, version: engine.version, candidate: false };
    const packStandalone = vi.fn(() => fallback);
    expect(selectEngineArchive({ root, planPath: undefined, sourceJob: false, loadPlan: () => null, packStandalone })).toBe(fallback);
    expect(packStandalone).toHaveBeenCalledOnce();
  });
});

describe("packed consumer check (PRD-15 T1.6)", () => {
  let tmp: string;
  let archive: SelectedArchive;
  let exportsKeys: ReadonlySet<string>;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "a3d-pack-fixture-"));
    const sourceJob = Boolean(process.env.AURA3D_SOURCE_MANIFEST || process.env.AURA3D_SOURCE_PROCESS_GUARD || process.env.NATIVE_RUN_ID);
    archive = selectEngineArchive({
      root: REPO_ROOT,
      planPath: process.env.A3D_RELEASE_PLAN,
      sourceJob,
      loadPlan: (root, path) => loadValidatedReleasePlan(root, path) as CandidatePlan | null,
      packStandalone: () => {
        execFileSync("pnpm", ["pack", "--pack-destination", tmp], { cwd: REPO_ROOT, stdio: "pipe" });
        const archives = readdirSync(tmp).filter((file) => file.endsWith(".tgz"));
        if (archives.length !== 1) throw new Error("Standalone pack did not produce exactly one archive");
        const path = join(tmp, archives[0]!);
        const version = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
        return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), version, candidate: false };
      }
    });
    const packed = JSON.parse(execFileSync("tar", ["-xOzf", archive.path, "package/package.json"], { encoding: "utf8" })) as {
      name?: string; version?: string; exports?: Record<string, unknown>;
    };
    if (packed.name !== ENGINE_NAME || packed.version !== archive.version || !packed.exports || typeof packed.exports !== "object") {
      throw new Error("Packed engine manifest does not match its selected candidate");
    }
    exportsKeys = new Set(Object.keys(packed.exports));
  }, 120_000);

  afterAll(() => {
    try {
      if (archive?.candidate && createHash("sha256").update(readFileSync(archive.path)).digest("hex") !== archive.sha256) {
        throw new Error("Engine candidate archive changed during the consumer check");
      }
    } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
  });

  it("rejects a specifier that exists only in repo tsconfig paths", () => {
    const specifiers = collectEngineSpecifiers(FIXTURE);
    expect(specifiers).toContain("@aura3d/engine/lanes");
    expect(specifierAllowed("@aura3d/engine/lanes", exportsKeys)).toBe(false);
    expect(specifierAllowed("@aura3d/engine", exportsKeys)).toBe(true);
    expect(specifierAllowed("@aura3d/engine/contracts", exportsKeys)).toBe(true);
  });

  it("checkTemplate fails the fixture at the specifier gate before any install", () => {
    const dest = join(tmp, "consumer-repo-alias-only");
    const result = checkTemplate(FIXTURE, dest, archive.path, exportsKeys, { skipBuild: true });
    expect(result.steps.specifiers).toBe("fail");
    expect(result.detail).toContain("@aura3d/engine/lanes");
    // Fails fast — no install/typecheck/build ran.
    expect(result.steps.install).toBe("skip");
  });
});
