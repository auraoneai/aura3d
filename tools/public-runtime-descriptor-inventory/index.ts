import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const outputPath = resolve("tests/reports/public-runtime-descriptor-inventory/report.json");
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
const existingTracked = tracked.filter((path) => existsSync(path));
const candidates = existingTracked.filter((path) => /^packages\/[^/]+\/src\/.+(?:Fixture|Fixtures|Evidence|Capability|Platform|Reference)\.tsx?$/.test(path));
const runtimeContract = new Set([
  "packages/engine/src/agent-api/AssetEvidence.ts",
  "packages/engine/src/agent-api/GameEvidence.ts",
  "packages/engine/src/agent-api/PromptAnimationEvidence.ts",
  "packages/engine/src/agent-api/PlatformerMotion.ts",
  "packages/rendering/src/EnvironmentPlatform.ts",
  "packages/rendering/src/cinematic/CinematicEvidence.ts"
]);
const publicDataContract = new Set([
  "packages/rendering/src/PbrReference.ts"
]);

function references(path: string): string[] {
  const stem = basename(path).replace(/\.tsx?$/, "");
  const packageRoot = path.split("/").slice(0, 2).join("/");
  return existingTracked.filter((candidate) => {
    if (candidate === path || !/\.(?:ts|tsx|js|mjs|cjs)$/.test(candidate) || candidate.startsWith("tests/reports/")) return false;
    const source = readFileSync(candidate, "utf8");
    if (!source.includes(stem)) return false;
    if (candidate === `${packageRoot}/src/index.ts`) return false;
    return true;
  });
}

const modules = candidates.map((path) => {
  const source = readFileSync(path, "utf8");
  const refs = references(path);
  const fixtureNamed = /Fixtures?\.tsx?$/.test(path);
  const packageSourceBarrel = `packages/${path.split("/")[1]}/src/index.ts`;
  const classification = runtimeContract.has(path)
    ? "real-runtime-or-mounted-evidence"
    : publicDataContract.has(path)
      ? "public-data-contract"
      : fixtureNamed
        ? "test-or-evidence-fixture"
        : "misleading-descriptor-review";
  const booleanClaimFields = [...source.matchAll(/readonly\s+([A-Za-z_$][\w$]*)\??:\s*(?:true|boolean)/g)].map((match) => match[1]!);
  return {
    path,
    package: path.split("/")[1],
    lines: source.split("\n").length - 1,
    classification,
    publicBarrelExport: existsSync(packageSourceBarrel)
      && readFileSync(packageSourceBarrel, "utf8").includes(basename(path).replace(/\.tsx?$/, "")),
    nonBarrelSourceConsumers: refs,
    zeroNonBarrelSourceConsumers: refs.length === 0,
    booleanClaimFields,
    rejectsUnmountedBooleanClaims: fixtureNamed && booleanClaimFields.length > 0,
    disposition: runtimeContract.has(path) || publicDataContract.has(path) ? "retain" : refs.length === 0 ? "delete-after-r8" : "migrate-consumers-then-delete"
  };
});
const unclassified = modules.filter((entry) => entry.classification === "misleading-descriptor-review");
const report = {
  schema: "aura3d.public-runtime-descriptor-inventory/1.0",
  generatedAt: new Date().toISOString(),
  pass: unclassified.length === 0,
  patterns: ["*Fixture", "*Fixtures", "*Evidence", "*Capability", "*Platform", "*Reference"],
  summary: {
    modules: modules.length,
    lines: modules.reduce((sum, entry) => sum + entry.lines, 0),
    retainedRuntimeOrContracts: modules.filter((entry) => entry.disposition === "retain").length,
    deleteAfterR8: modules.filter((entry) => entry.disposition === "delete-after-r8").length,
    migrateThenDelete: modules.filter((entry) => entry.disposition === "migrate-consumers-then-delete").length,
    unclassified: unclassified.length,
    booleanClaimModulesRejectedAsRuntimeProof: modules.filter((entry) => entry.rejectsUnmountedBooleanClaims).length
  },
  modules,
  unclassified,
  rule: "A fixture object's boolean fields never establish runtime capability. Only mounted behavior and derived evidence may support a public claim.",
  claimBoundary: "Inventory and deletion queue only; retained runtime contracts still require their own mounted browser evidence."
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, summary: report.summary, unclassified: report.unclassified.map((entry) => entry.path) }, null, 2));
if (!report.pass) process.exitCode = 1;
