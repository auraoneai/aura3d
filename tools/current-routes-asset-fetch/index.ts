import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { listCurrentRoutesFlagshipAssets } from "../../packages/assets/src/threejs-example-parity/index";

const REPORT_PATH = "tests/reports/current-routes-assets.json";

const usedAssetIds = readUsedWowRouteAssetIds();
const assets = listCurrentRoutesFlagshipAssets().filter((asset) => usedAssetIds.has(asset.id));
const entries = assets.map((asset) => {
  const absolutePath = resolve(asset.localPath);
  const exists = existsSync(absolutePath);
  const bytes = exists ? statSync(absolutePath).size : 0;
  const sha256 = exists ? createHash("sha256").update(readFileSync(absolutePath)).digest("hex") : null;
  return {
    id: asset.id,
    name: asset.name,
    localPath: asset.localPath,
    role: asset.role,
    license: asset.license,
    expectedFeatures: asset.expectedFeatures,
    exists,
    bytes,
    sha256
  };
});

const failures = [
  ...(entries.length !== usedAssetIds.size ? [`resolved asset count ${entries.length} does not match used route asset count ${usedAssetIds.size}`] : []),
  ...entries.filter((entry) => !entry.exists).map((entry) => `${entry.id} is missing at ${entry.localPath}`),
  ...entries.filter((entry) => entry.exists && entry.bytes <= 0).map((entry) => `${entry.id} is empty at ${entry.localPath}`)
];

const report = {
  schema: "a3d-current-routes-assets",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "Current root-registry WOW showcase assets resolve from the active Aura3D route asset manifest.",
  usedAssetIds: [...usedAssetIds].sort(),
  assetCount: entries.length,
  existingAssetCount: entries.filter((entry) => entry.exists).length,
  totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
  entries,
  failures
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  schema: report.schema,
  pass: report.pass,
  assetCount: report.assetCount,
  existingAssetCount: report.existingAssetCount,
  totalBytes: report.totalBytes,
  reportPath: REPORT_PATH,
  failures
}, null, 2));

if (!report.pass) {
  throw new Error(`CurrentRoutes asset fetch failed:\n${failures.join("\n")}`);
}

function readUsedWowRouteAssetIds(): Set<string> {
  const root = resolve("apps");
  const ids = new Set<string>();
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("wow-") || dir.name === "wow-common") continue;
    const mainPath = join(root, dir.name, "src", "main.ts");
    if (!existsSync(mainPath)) continue;
    const text = readFileSync(mainPath, "utf8");
    const match = text.match(/\bassetId:\s*"([^"]+)"/);
    if (match?.[1]) ids.add(match[1]);
  }
  return ids;
}
