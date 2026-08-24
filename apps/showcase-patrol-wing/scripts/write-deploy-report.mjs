import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const cli = resolve(repoRoot, "packages/aura3d-cli/dist/cli.js");
const modelIds = ["patrolWingPlane", "patrolWingDroneA", "patrolWingDroneB", "patrolWingPadBeacon"];
function run(args) {
  try { return JSON.parse(execFileSync("node", [cli, ...args], { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 })); }
  catch (error) { const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout ?? "") : ""; if (stdout) return JSON.parse(stdout); throw error; }
}
function files(directory) { return readdirSync(directory).sort().flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; }); }
function treeHash(directory) { const hash = createHash("sha256"); for (const path of files(directory)) hash.update(relative(directory, path)).update("\0").update(readFileSync(path)).update("\0"); return hash.digest("hex"); }
const dist = resolve(appDir, "dist"); const source = resolve(appDir, "src");
const common = ["check-deploy", "--dist", dist, "--release", "--source", source];
const modelResult = run([...common, ...modelIds.flatMap((id) => ["--asset", id])]);
const distResult = run([...common, "--no-assets"]);
const producer = "apps/showcase-patrol-wing/scripts/write-deploy-report.mjs";
const report = {
  schema: "aura3d.patrol-wing.deploy/1.0", generatedAt: new Date().toISOString(), producer,
  producerSourceSha256: createHash("sha256").update(readFileSync(resolve(repoRoot, producer))).digest("hex"),
  cli: "packages/aura3d-cli/dist/cli.js", cliSourceSha256: createHash("sha256").update(readFileSync(cli)).digest("hex"),
  distTreeSha256: treeHash(dist), sourceTreeSha256: treeHash(source),
  checks: {
    strictModels: { command: "check-deploy --release --source apps/showcase-patrol-wing/src --asset <4 typed models>", ok: modelResult.ok === true, assetCount: modelResult.manifest?.assets?.length ?? 0, assets: (modelResult.manifest?.assets ?? []).map((asset) => ({ id: asset.id, hash: asset.hash, quality: asset.quality, role: asset.role })), warnings: modelResult.warnings ?? [], failures: modelResult.failures ?? [] },
    strictDistAndSource: { command: "check-deploy --release --source apps/showcase-patrol-wing/src --no-assets", ok: distResult.ok === true, warnings: distResult.warnings ?? [], failures: distResult.failures ?? [] }
  },
  audioBoundary: "Eleven deterministic synthesized WAV cues are typed candidate-quality CC0 assets; model-oriented release bounds validation is intentionally not applied to audio.",
  pass: modelResult.ok === true && distResult.ok === true && (modelResult.manifest?.assets?.length ?? 0) === modelIds.length
};
writeFileSync(resolve(appDir, "deploy-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, models: report.checks.strictModels.assetCount, modelWarnings: report.checks.strictModels.warnings.length, distWarnings: report.checks.strictDistAndSource.warnings.length }));
if (!report.pass) process.exitCode = 1;

