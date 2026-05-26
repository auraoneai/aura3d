import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createAdvancedAssetCorpusSummary,
  writeAdvancedAssetCorpusReport
} from "../../packages/assets/src/AdvancedAssetCorpus";

const REPORT_PATH = "tests/reports/current-routes-assets.json";

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });

const summary = writeAdvancedAssetCorpusReport(REPORT_PATH);

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
  throw new Error(`CurrentRoutes asset corpus failed:\n${summary.failures.join("\n")}`);
}

const postCheck = createAdvancedAssetCorpusSummary();
if (!postCheck.pass) {
  throw new Error("CurrentRoutes asset corpus became invalid after report write.");
}
