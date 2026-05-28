import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const manifest = readJson("asset-manifest.json");
const source = readText("src/main.ts");
const server = readText("server/provider-proxy.mjs");
const readme = readText("README.md");
const packageJson = readJson("package.json");
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
const roles = new Set(assets.map((asset) => asset.role));
const browserSecretPattern = /import\.meta\.env\.VITE_[A-Z0-9_]*(?:API_KEY|KEY|TOKEN|SECRET)[A-Z0-9_]*/i;
const actualSecretPattern = /(sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,})/;
const combined = `${source}\n${server}\n${readme}`;

assert(manifest.schema === "aura3d-cinematic-asset-manifest/0.1", "asset manifest schema is missing or unsupported");
assert(roles.has("environment"), "asset manifest should include an environment role");
assert(roles.has("hero-prop"), "asset manifest should include a hero-prop role");
assert(roles.has("vfx"), "asset manifest should include a VFX role");
assert(roles.has("material"), "asset manifest should include a material role");
assert(source.includes("/api/scene") || source.includes("VITE_AURA_SCENE_PROXY_URL"), "client should call a server proxy endpoint");
assert(server.includes("redact") && server.includes("OPENAI_API_KEY") && server.includes("ANTHROPIC_API_KEY") && server.includes("GEMINI_API_KEY"), "server proxy should own and redact provider key configuration");
assert(server.includes("fixture") && server.includes("mock") && server.includes("live"), "server proxy should expose fixture, mock, and live modes");
assert(packageJson.scripts?.proxy === "node server/provider-proxy.mjs", "package.json should expose pnpm proxy");
assert(packageJson.scripts?.quality === "node scripts/quality-gate.mjs", "package.json should expose pnpm quality");
assert(!browserSecretPattern.test(source), "browser source should not read provider secret env variables");
assert(!actualSecretPattern.test(combined), "template contains a provider-key-shaped secret");

const report = {
  schema: "aura3d-cinematic-template-quality/0.1",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  providerMode: "fixture",
  backend: "server-proxy-template",
  evidence: {
    assetCount: assets.length,
    roles: [...roles],
    serverProxyScript: "server/provider-proxy.mjs",
    noBrowserApiKeys: !browserSecretPattern.test(source)
  },
  failures
};

const reportPath = resolve(root, "reports", "cinematic-template-quality.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(`quality gate passed: ${reportPath}`);
}
