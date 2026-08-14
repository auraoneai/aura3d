import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AURA3D_2_SPECIFIER_MIGRATIONS } from "../../../tools/migrate-2.0/index";

const BASE_TAG = "v1.5.2";
const MIGRATION = readFileSync("MIGRATION-2.0.md", "utf8");
const MIGRATION_FLAT = MIGRATION.replace(/\s+/g, " ");
const REMOVED_PRIVATE_PACKAGE = ["test", "utils"].join("-");

function showAtBase(path: string): string {
  return execFileSync("git", ["show", `${BASE_TAG}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

describe("Aura3D 2.0 version and package migration matrix", () => {
  it("removes no released public package while adding explicit optional owners", () => {
    const atBase = execFileSync("git", ["ls-tree", "--name-only", BASE_TAG, "packages/"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.startsWith("packages/"))
      .map((line) => line.split("/")[1]!)
      .filter((name) => !name.endsWith(".md"));
    const now = readdirSync("packages", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const removed = atBase.filter((name) => !now.includes(name));
    expect(removed).toEqual([REMOVED_PRIVATE_PACKAGE]);
    expect(JSON.parse(showAtBase(`packages/${REMOVED_PRIVATE_PACKAGE}/package.json`))).toMatchObject({ private: true });
    for (const selectedOwner of ["lean", "navigation-recast", "physics-rapier"]) expect(now).toContain(selectedOwner);
  });

  it("sets every released package to the coordinated major version", () => {
    const coordinatedVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    const manifests = ["package.json", ...readdirSync("packages", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `packages/${entry.name}/package.json`)];
    const released = manifests
      .map((path) => ({ path, manifest: JSON.parse(readFileSync(path, "utf8")) as { private?: boolean; name?: string; version?: string } }))
      .filter(({ manifest }) => manifest.private !== true);
    expect(released.length).toBe(29);
    expect(coordinatedVersion).toMatch(/^2\.0\.\d+$/);
    expect(released.every(({ manifest }) => manifest.version === coordinatedVersion)).toBe(true);
  });

  it("classifies the root subpath change and preserves a reachable compatibility package", () => {
    const coordinatedVersion = JSON.parse(readFileSync("package.json", "utf8")).version as string;
    const before = JSON.parse(showAtBase("package.json")) as { exports?: Record<string, unknown>; files?: readonly string[] };
    const after = JSON.parse(readFileSync("package.json", "utf8")) as { exports?: Record<string, unknown> };
    const removed = Object.keys(before.exports ?? {}).filter((key) => !(key in (after.exports ?? {})));
    expect(removed).toEqual(["./three-compat"]);
    expect((before.files ?? []).some((entry) => entry.includes("three-compat"))).toBe(false);
    expect(JSON.parse(readFileSync("packages/three-compat/package.json", "utf8"))).toMatchObject({
      name: "@aura3d/three-compat",
      version: coordinatedVersion
    });
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
  it("keeps the deletion retrieval command and complete original record", () => {
    const removed = readFileSync("docs/architecture/2.0-removals.md", "utf8");
    expect(removed).toMatch(/git show <commit>\^:<path>/);
    expect(execFileSync("git", ["show", "c9d6044a^:QuickFixes.md"], { encoding: "utf8" }).length).toBeGreaterThan(1000);
  });
});
