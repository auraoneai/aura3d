import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(root, "reports", "cinematic-template-quality.json");
const failures = [];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const manifest = readJson("asset-manifest.json");
const source = readText("src/main.ts");
const readme = existsSync(resolve(root, "README.md")) ? readText("README.md") : "";
const packageJson = readJson("package.json");
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
const roles = new Set(assets.map((asset) => asset.role));
const combined = `${source}\n${readme}\n${JSON.stringify(packageJson)}`;

assert(manifest.schema === "aura3d-cinematic-asset-manifest/0.1", "asset manifest schema is missing or unsupported");
assert(assets.length >= 5, "asset manifest should include at least five cinematic assets");
assert(roles.has("hero-prop") || roles.has("character"), "asset manifest should include a hero role");
assert(roles.has("environment"), "asset manifest should include an environment role");
assert(roles.has("vfx"), "asset manifest should include a VFX role");
assert(roles.has("material"), "asset manifest should include a material role");
assert(source.includes("fixture") && source.includes("mock") && source.includes("proxy"), "template should expose fixture, mock, and proxy modes");
assert(source.includes("exportBundle"), "template should include export bundle support");
assert(packageJson.scripts?.quality === "node scripts/quality-gate.mjs", "package.json should expose pnpm quality");
const browserSecretEnvPattern = /import\.meta\.env\.VITE_[A-Z0-9_]*(?:API_KEY|KEY|TOKEN|SECRET)[A-Z0-9_]*/i;
assert(!browserSecretEnvPattern.test(source), "browser source should not read VITE API keys or secrets");
assert(!/(sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,})/.test(combined), "template contains a provider-key-shaped secret");

const report = {
  schema: "aura3d-cinematic-template-quality/0.1",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  providerMode: "fixture",
  backend: "template-canvas-fixture",
  evidence: {
    assetCount: assets.length,
    roles: [...roles],
    hasExportBundle: source.includes("exportBundle"),
    noBrowserApiKeys: !browserSecretEnvPattern.test(source)
  },
  failures
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(`quality gate passed: ${reportPath}`);
}
