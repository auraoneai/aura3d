import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createV8AssetCorpusSummary,
  writeV8AssetCorpusReport
} from "../../packages/assets/src/V8AssetCorpus";

const REPORT_PATH = "tests/reports/v8-assets.json";

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });

const summary = writeV8AssetCorpusReport(REPORT_PATH);

console.log(JSON.stringify({
  schema: summary.schema,
  pass: summary.pass,
  assetCount: summary.assetCount,
  environmentCount: summary.environmentCount,
  existingAssetCount: summary.existingAssetCount,
  shaVerifiedAssetCount: summary.shaVerifiedAssetCount,
  totalBytes: summary.totalBytes,
  totalTriangles: summary.totalTriangles,
  texturedPbrAssetCount: summary.texturedPbrAssetCount,
  animationAssetCount: summary.animationAssetCount,
  skinAssetCount: summary.skinAssetCount,
  morphAssetCount: summary.morphAssetCount,
  materialExtensionAssetCount: summary.materialExtensionAssetCount,
  classCoverage: summary.classCoverage,
  featureCoverage: summary.featureCoverage,
  reportPath: REPORT_PATH,
  failures: summary.failures
}, null, 2));

if (!summary.pass) {
  throw new Error(`V8 asset corpus failed:\n${summary.failures.join("\n")}`);
}

const postCheck = createV8AssetCorpusSummary();
if (!postCheck.pass) {
  throw new Error("V8 asset corpus became invalid after report write.");
}
