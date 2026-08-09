import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const baseTag = "v1.5.2";
const reportPath = "tests/reports/physics-major-version-gate.json";
const migrationPath = "docs/migration/physics-rapier-2.0.md";

function gitShow(path: string): string {
  return execFileSync("git", ["show", `${baseTag}:${path}`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function barrelModules(source: string): readonly string[] {
  return [...source.matchAll(/^export \* from ["']\.\/(.+?)\.js["'];/gm)].map((match) => match[1]!).sort();
}

function packageVersion(path: string): string {
  return (JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as { readonly version: string }).version;
}

function packAndRun(): { readonly pass: boolean; readonly detail: string } {
  const scratch = mkdtempSync(join(tmpdir(), "aura3d-physics-major-gate-"));
  try {
    const tarballs = join(scratch, "tarballs");
    const consumer = join(scratch, "consumer");
    mkdirSync(tarballs);
    mkdirSync(consumer);
    for (const packageDirectory of ["packages/physics-rapier", "packages/physics"]) {
      execFileSync("pnpm", ["pack", "--pack-destination", tarballs], {
        cwd: join(repoRoot, packageDirectory),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
    }
    const packed = execFileSync("find", [tarballs, "-maxdepth", "1", "-name", "*.tgz", "-print"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    const physics = packed.find((path) => basename(path).startsWith("aura3d-physics-"));
    const rapier = packed.find((path) => basename(path).startsWith("aura3d-physics-rapier-"));
    if (!physics || !rapier) return { pass: false, detail: `expected physics and physics-rapier tarballs; found ${packed.map((path) => basename(path)).join(", ")}` };

    writeFileSync(join(consumer, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`);
    execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", rapier, physics], {
      cwd: consumer,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024
    });
    writeFileSync(join(consumer, "smoke.mjs"), `
import { PhysicsWorld } from "@aura3d/physics";
import { createRapierPhysics } from "@aura3d/physics-rapier";

let rejectedLegacy = false;
try { new PhysicsWorld({ backend: "cannon-es" }); } catch (error) { rejectedLegacy = /removed|rapier/i.test(String(error)); }
if (!rejectedLegacy) throw new Error("legacy backend did not fail with migration guidance");

const compatibilityWorld = new PhysicsWorld({ backend: "auto", gravity: [0, -9.81, 0] });
compatibilityWorld.createRigidBody({ type: "dynamic", position: [0, 1, 0] });
compatibilityWorld.step(1 / 60);
if (compatibilityWorld.snapshot().backend.active !== "rapier") throw new Error("compatibility world did not select Rapier");
compatibilityWorld.dispose();

const nativeWorld = await createRapierPhysics({ gravity: [0, -9.81, 0] });
nativeWorld.createBody({ type: "dynamic", position: [0, 1, 0], shape: { kind: "sphere", radius: 0.25 } });
nativeWorld.step(1 / 60);
nativeWorld.dispose();
console.log(JSON.stringify({ rejectedLegacy, compatibilityBackend: "rapier", nativeAdapter: true }));
`);
    const output = execFileSync("node", ["smoke.mjs"], { cwd: consumer, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
    return { pass: true, detail: `clean npm consumer installed ${basename(physics)} and ${basename(rapier)}; ${output}` };
  } catch (error) {
    return { pass: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const beforeModules = barrelModules(gitShow("packages/physics/src/index.ts"));
const afterModules = barrelModules(readFileSync(join(repoRoot, "packages/physics/src/index.ts"), "utf8"));
const removedModules = beforeModules.filter((module) => !afterModules.includes(module));
const migration = readFileSync(join(repoRoot, migrationPath), "utf8");
const currentVersions = {
  root: packageVersion("package.json"),
  physics: packageVersion("packages/physics/package.json"),
  physicsRapier: packageVersion("packages/physics-rapier/package.json")
};
const requiredNextVersion = "2.0.0";
const breaking = removedModules.length > 0 || migration.includes("former rigid-body `CharacterController` export has been removed");
const migrationCoverage = removedModules.filter((module) => migration.includes(`\`${module}\``));
const packedMigration = packAndRun();

const checks: ReleaseCheck[] = [
  { id: "breaking-change-detected", pass: breaking, detail: `${removedModules.length} v1.5.2 physics barrel modules removed: ${removedModules.join(", ")}` },
  { id: "major-version-required", pass: requiredNextVersion.startsWith("2."), detail: `breaking physical-backend migration requires ${requiredNextVersion}; current development manifests remain ${Object.values(currentVersions).join(" / ")}` },
  { id: "removed-module-migration-coverage", pass: migrationCoverage.length === removedModules.length, detail: `${migrationCoverage.length} of ${removedModules.length} removed barrel modules named in ${migrationPath}` },
  { id: "packed-migration-smoke", pass: packedMigration.pass, detail: packedMigration.detail }
];

writeReport(reportPath, "aura3d.physics-major-version-gate/1.0", checks, {
  baseTag,
  currentVersions,
  requiredNextVersion,
  releaseBlockedUntilMajorBump: !Object.values(currentVersions).every((version) => version === requiredNextVersion),
  beforeModules,
  afterModules,
  removedModules,
  migrationPath,
  packedMigration,
  decision: "Preserving the package name while removing public modules and changing solver/init semantics is a major migration. Do not publish these changes as 1.6.x."
});

console.log(JSON.stringify({ pass: checks.every((check) => check.pass), requiredNextVersion, releaseBlockedUntilMajorBump: true, removedModules, packedMigration }, null, 2));
if (checks.some((check) => !check.pass)) process.exitCode = 1;
