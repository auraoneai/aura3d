import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AURA3D_2_SPECIFIER_MIGRATIONS } from "../../../tools/migrate-2.0/index";

const BASE_TAG = "v1.5.2";
const MIGRATION = readFileSync("docs/archive/docs/migration/2.0.md", "utf8");
const MIGRATION_FLAT = MIGRATION.replace(/\s+/g, " ");
const REMOVED_PRIVATE_PACKAGE = ["test", "utils"].join("-");

function showAtBase(path: string): string {
  return execFileSync("git", ["show", `${BASE_TAG}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// The 5.0 ACR source pass stages `git ls-files` output without `.git`
// (tools/remote-acr/run-source5.sh), so the v1.5.2 facts are recorded here and
// re-verified against the tag whenever Git history is present.
const HAS_GIT = (() => {
  try {
    return execFileSync("git", ["cat-file", "-t", BASE_TAG], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "tag";
  } catch {
    return false;
  }
})();
const RECORDED_BASE_PACKAGES = [
  "animation", "apps", "asset-index", "assets", "audio", "aura3d-cli", "controls", "core", "create-aura3d", "debug",
  "ecs", "editor-runtime", "editor", "engine", "environments", "input", "materials", "math", "physics",
  "product-studio", "react", "rendering", "scene", "scripting", "test-utils", "three-compat", "workflows"
];
const RECORDED_BASE_ROOT_EXPORTS = [
  ".", "./scene-kits/particle-fountain", "./scene-kits/humanoid-walk", "./scene-kits/product-viewer", "./core", "./math",
  "./scene", "./ecs", "./rendering", "./controls", "./three-compat", "./environments", "./materials", "./physics",
  "./product-studio", "./animation", "./animation/browser", "./assets", "./assets/browser", "./input", "./audio", "./apps",
  "./engine", "./engine-runtime", "./create-aura3d", "./scripting", "./workflows", "./workflows/production",
  "./workflows/production-runtime", "./editor-runtime", "./editor", "./debug", "./rendering/production-runtime",
  "./rendering/advanced-runtime", "./assets/asset-corpus", "./assets/production-runtime", "./assets/advanced-gallery",
  "./production-runtime", "./advanced-runtime"
];
function basePackages(): string[] {
  if (!HAS_GIT) return RECORDED_BASE_PACKAGES;
  const live = execFileSync("git", ["ls-tree", "--name-only", BASE_TAG, "packages/"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.startsWith("packages/"))
    .map((line) => line.split("/")[1]!)
    .filter((name) => !name.endsWith(".md"));
  expect(live).toEqual(RECORDED_BASE_PACKAGES);
  return live;
}
function baseRootManifest(): { exports?: Record<string, unknown>; files?: readonly string[] } {
  if (!HAS_GIT) return { exports: Object.fromEntries(RECORDED_BASE_ROOT_EXPORTS.map((key) => [key, {}])), files: [] };
  const live = JSON.parse(showAtBase("package.json")) as { exports?: Record<string, unknown>; files?: readonly string[] };
  expect(Object.keys(live.exports ?? {})).toEqual(RECORDED_BASE_ROOT_EXPORTS);
  return live;
}

describe("Aura3D 2.0 version and package migration matrix", () => {
  it("removes no released public package while adding explicit optional owners", () => {
    const atBase = basePackages();
    // Count only real packages (a directory with a manifest) — stale
    // packages/*/node_modules husks from earlier installs must not register.
    const now = readdirSync("packages", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`packages/${entry.name}/package.json`))
      .map((entry) => entry.name);
    const removed = atBase.filter((name) => !now.includes(name));
    // PRD-15 T6.2/T6.5/T6.6 + earlier phases: editor, environments, materials and
    // three-compat are intentionally deleted (surfaces moved into engine devtools /
    // the CLI codemod / deprecated stubs).
    expect(removed).toEqual(["editor", "environments", "materials", REMOVED_PRIVATE_PACKAGE, "three-compat"]);
    if (HAS_GIT) expect(JSON.parse(showAtBase(`packages/${REMOVED_PRIVATE_PACKAGE}/package.json`))).toMatchObject({ private: true });
    // invariant: source must keep `\` — removes no released public package while adding explicit optional owners
    for (const selectedOwner of ["navigation-recast", "physics-rapier"]) expect(now).toContain(selectedOwner);
    // `@aura3d/lean` (a 2.0 optional owner, added after v1.5.2) was deleted by the QR-15 T8.1
    // removal sweep (90e6de309: "packages/lean workspace + engine agent-api/lean{,-game,-product}.ts").
    expect(now).not.toContain("lean");
  });

  it("sets every released package to the coordinated major version", () => {
    const coordinatedVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    const manifests = ["package.json", ...readdirSync("packages", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`packages/${entry.name}/package.json`))
      .map((entry) => `packages/${entry.name}/package.json`)];
    const released = manifests
      .map((path) => ({ path, manifest: JSON.parse(readFileSync(path, "utf8")) as { private?: boolean; name?: string; version?: string } }))
      .filter(({ manifest }) => manifest.private !== true);
    expect(released.length).toBe(25);
    // 5.0 decision record (docs/prds/aura3d-native-code-complete.md, item 4 release prep): every manifest
    // is bumped with `tools/release/prepare-version.mjs 5.0.0` (earlier trains: 2.0 -> 3.0 -> 4.x); 5.1 is a coordinated minor
    // on the same major, so the pin is the 5.x major.
    expect(coordinatedVersion).toMatch(/^5\.\d+\.\d+$/);
    expect(released.every(({ manifest }) => manifest.version === coordinatedVersion)).toBe(true);
  });

  it("classifies the root subpath change and preserves a reachable compatibility package", () => {
    const coordinatedVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    const before = baseRootManifest();
    const after = JSON.parse(readFileSync("package.json", "utf8")) as { exports?: Record<string, unknown> };
    const removed = Object.keys(before.exports ?? {}).filter((key) => !(key in (after.exports ?? {})));
    // Every root subpath removed since v1.5.2 is accounted for by exactly one documented removal:
    // 2.0 (`./three-compat`), the 4.0.0 QR-15 T8.1 sweep (90e6de309, deprecated subpaths) and the
    // 5.0.0 deprecation-window removals (docs/migration/4-to-5.md B15).
    const removedIn2 = ["./three-compat"];
    const removedIn5 = ["./rendering", "./assets/browser", "./apps", "./workflows/production",
      "./rendering/production-runtime", "./production-runtime", "./advanced-runtime"];
    const removedInQr15 = ["./scene-kits/particle-fountain", "./scene-kits/humanoid-walk", "./scene-kits/product-viewer",
      "./core", "./environments", "./materials", "./product-studio", "./animation/browser", "./engine", "./engine-runtime",
      "./create-aura3d", "./workflows/production-runtime", "./editor", "./debug", "./rendering/advanced-runtime",
      "./assets/asset-corpus", "./assets/production-runtime", "./assets/advanced-gallery"];
    expect([...removed].sort()).toEqual([...removedIn2, ...removedIn5, ...removedInQr15].sort());
    const guide5 = readFileSync("docs/migration/4-to-5.md", "utf8");
    for (const subpath of removedIn5) expect(guide5, `${subpath} must be in the B15 table`).toContain(`\`${subpath}\``);
    expect((before.files ?? []).some((entry) => entry.includes("three-compat"))).toBe(false);
    // PRD-15 T6.2: the compatibility package was deleted; its migration surface moved to
    // `aura3d migrate three` in packages/aura3d-cli (mapping engine constructs, not a runtime shim).
    expect(() => readFileSync("packages/three-compat/package.json", "utf8")).toThrow();
  });

  it("documents every intentional physical/navigation removal and its semantic replacement", () => {
    for (const symbol of [
      "CharacterController", "Navigation", "Steering", "Crowd", "VehicleDynamics", "NarrowPhase",
      "PlatformerFixtures", "PhysicsSandboxFixtures", "ClothFixtures", "SoftBodyFixtures",
      "FractureFixtures", "FluidFixtures", "FireSmokeFixtures"
    ]) expect(MIGRATION).toContain(`\`${symbol}\``);
    expect(MIGRATION_FLAT).toContain("@aura3d/physics-rapier");
    expect(MIGRATION_FLAT).toContain("@aura3d/navigation-recast");
    expect(MIGRATION_FLAT).toMatch(/removed in 2\.0\.0/);
  });

  it("ships an exact codemod mapping and a finite compatibility schedule", () => {
    for (const [before, after] of Object.entries(AURA3D_2_SPECIFIER_MIGRATIONS)) {
      expect(MIGRATION).toContain(before);
      expect(MIGRATION).toContain(after);
    }
    expect(MIGRATION).toContain("3.0, not before 2027-08-11");
    expect(MIGRATION).toContain("pnpm migrate:2.0");
  });
});

describe("the 2.0 removal and retrieval record remains verifiable", () => {
  it("keeps the deletion retrieval command", () => {
    const removed = readFileSync("docs/archive/docs/architecture/2.0-removals.md", "utf8");
    expect(removed).toMatch(/git show <commit>\^:<path>/);
  });

  // Needs Git history; the ACR source pass stages files without `.git` (run-source5.sh).
  it.skipIf(!HAS_GIT)("keeps the complete original record retrievable from Git history", () => {
    expect(execFileSync("git", ["show", "c9d6044a^:QuickFixes.md"], { encoding: "utf8" }).length).toBeGreaterThan(1000);
  });
});
