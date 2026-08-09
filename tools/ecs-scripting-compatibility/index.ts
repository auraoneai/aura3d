import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "esbuild";

const outputPath = resolve("tests/reports/ecs-scripting-compatibility/report.json");
const online = process.argv.includes("--online");
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
const audit = JSON.parse(readFileSync("tests/reports/external-candidate-package-audit.json", "utf8"));
const previousReport = (() => {
  try { return JSON.parse(readFileSync(outputPath, "utf8")); } catch { return null; }
})();
const sourceFiles = (name: string) => tracked.filter((path) => path.startsWith(`packages/${name}/src/`) && path.endsWith(".ts"));
const sourceLines = (name: string) => sourceFiles(name).reduce((sum, path) => sum + readFileSync(path, "utf8").split("\n").length - 1, 0);
const consumers = (specifier: string) => tracked.filter((path) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(path) && !path.startsWith("tests/reports/") && !path.startsWith(`packages/${specifier.split("/").pop()}/`) && readFileSync(path, "utf8").includes(specifier));
async function bundle(specifier: string) {
  const result = await build({ stdin: { contents: `export * from "${specifier}"`, resolveDir: process.cwd(), sourcefile: "compat-cost.ts" }, bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, write: false, logLevel: "silent" });
  const bytes = Buffer.from(result.outputFiles[0]?.contents ?? []);
  return { rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length, caveat: "all-export browser bundle, not a tree-shaken application" };
}
function registryUse(name: string) {
  if (!online) return previousReport?.externalRegistryUse?.[name] ?? null;
  const encoded = encodeURIComponent(name);
  const metadata = JSON.parse(execFileSync("npm", ["view", name, "name", "version", "dist-tags", "--json"], { encoding: "utf8" }));
  const downloads = JSON.parse(execFileSync("curl", ["-fsSL", `https://api.npmjs.org/downloads/point/last-year/${encoded}`], { encoding: "utf8" }));
  return {
    observedAt: new Date().toISOString(),
    latestVersion: metadata.version,
    distTags: metadata["dist-tags"],
    lastYearDownloads: downloads.downloads,
    period: { start: downloads.start, end: downloads.end },
    caveat: "Registry downloads include CI, mirrors, and automated installs; they prove nonzero external distribution, not unique users or API-level usage."
  };
}
const recommendedSources = [
  "packages/engine/src/agent-api/lean.ts",
  "packages/engine/src/agent-api/lean-product.ts",
  "packages/engine/src/agent-api/lean-game.ts"
].filter((path) => tracked.includes(path));
const recommendedViolations = recommendedSources.filter((path) => /@aura3d\/(?:ecs|scripting)/.test(readFileSync(path, "utf8")));
const ecsConsumers = consumers("@aura3d/ecs");
const scriptingConsumers = consumers("@aura3d/scripting");
const report = {
  schema: "aura3d.ecs-scripting-compatibility/1.0",
  generatedAt: new Date().toISOString(),
  pass: recommendedViolations.length === 0 && ecsConsumers.length > 0 && scriptingConsumers.length > 0,
  decision: "Retain dedicated packages as optional compatibility/authoring layers; remove duplicate @aura3d/engine subpaths in 2.0; add no external adapter without a replacing workload.",
  ecs: { sourceFiles: sourceFiles("ecs").length, sourceLines: sourceLines("ecs"), browserCost: await bundle("@aura3d/ecs"), consumers: ecsConsumers },
  scripting: { sourceFiles: sourceFiles("scripting").length, sourceLines: sourceLines("scripting"), browserCost: await bundle("@aura3d/scripting"), consumers: scriptingConsumers },
  externalCandidates: {
    bitecs: audit.packages.find((entry: { name: string }) => entry.name === "bitecs"),
    miniplex: audit.packages.find((entry: { name: string }) => entry.name === "miniplex"),
    yuka: audit.packages.find((entry: { name: string }) => entry.name === "yuka")
  },
  externalRegistryUse: {
    "@aura3d/ecs": registryUse("@aura3d/ecs"),
    "@aura3d/scripting": registryUse("@aura3d/scripting")
  },
  recommendedEntryAudit: { sources: recommendedSources, violations: recommendedViolations },
  engineCompatibilitySubpaths: { retainedIn16: ["@aura3d/engine/ecs", "@aura3d/engine/scripting"], scheduledRemoval: "2.0.0", codemodMappings: { "@aura3d/engine/ecs": "@aura3d/ecs", "@aura3d/engine/scripting": "@aura3d/scripting" } },
  claimBoundary: "Compatibility and maintenance evidence only; retention is not competitive renderer capability."
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, decision: report.decision, recommendedEntryAudit: report.recommendedEntryAudit }, null, 2));
if (!report.pass) process.exitCode = 1;
