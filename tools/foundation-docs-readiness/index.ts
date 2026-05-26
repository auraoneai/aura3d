import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "README.md",
  "docs/project/competitive-positioning.md",
  "docs/project/threejs-parity-status.md",
  "docs/project/compatibility.md",
  "docs/project/known-limits.md",
  "docs/api/public-api.md",
  "docs/project/tutorials-basic-app.md",
  "docs/project/tutorials-asset-viewer.md",
  "docs/project/tutorials-product-configurator.md",
  "docs/project/tutorials-material-studio.md",
  "docs/project/tutorials-interactive-scene.md"
] as const;
const evidencePaths = [
  "tests/reports/foundation-app-suite",
  "tests/reports/foundation-examples",
  "tests/reports/foundation-external-consumer.json",
  "tests/reports/foundation-threejs-comparison.json"
] as const;
const fileChecks = requiredFiles.map((path) => ({ path, exists: existsSync(resolve(path)) }));
const docsText = requiredFiles
  .filter((path) => existsSync(resolve(path)))
  .map((path) => `\n--- ${path} ---\n${readFileSync(resolve(path), "utf8")}`)
  .join("\n");
const evidenceChecks = evidencePaths.map((path) => ({ path, mentioned: docsText.includes(path) }));
const requiredPhrases = [
  "supported workflows",
  "Three.js competitor",
  "not as a broad Three.js replacement",
  "not a Unity",
  "not an Unreal",
  "known gaps"
] as const;
const phraseChecks = requiredPhrases.map((phrase) => ({ phrase, present: docsText.toLowerCase().includes(phrase.toLowerCase()) }));
const forbiddenPositivePatterns = [
  /^A3D replaces Three\.js\.?$/im,
  /^A3D is broadly better than Three\.js\.?$/im,
  /^A3D replaces Unity\.?$/im,
  /^A3D replaces Unreal\.?$/im,
  /^A3D is production-ready\.?$/im,
  /^A3D has full glTF parity\.?$/im,
  /^A3D has full WebGPU parity\.?$/im
] as const;
const forbiddenHits = forbiddenPositivePatterns
  .map((pattern) => ({ pattern: pattern.source, hit: pattern.test(docsText) }))
  .filter((item) => item.hit);

const report = {
  schema: "a3d-foundation-docs-readiness",
  generatedAt: new Date().toISOString(),
  pass: fileChecks.every((file) => file.exists)
    && evidenceChecks.every((check) => check.mentioned)
    && phraseChecks.every((check) => check.present)
    && forbiddenHits.length === 0,
  fileChecks,
  evidenceChecks,
  phraseChecks,
  forbiddenHits
};

const reportPath = resolve("tests/reports/foundation-docs-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
