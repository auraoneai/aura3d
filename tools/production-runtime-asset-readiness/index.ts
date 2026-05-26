import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createV6AssetCorpusSummary } from "../../packages/assets/src/asset-corpus";
import { createV6EnvironmentCorpusSummary } from "../../packages/environments/src/production-runtime";

const reportPath = resolve("tests/reports/production-runtime-asset-readiness.json");
const assetSummary = createV6AssetCorpusSummary();
const environmentSummary = createV6EnvironmentCorpusSummary();
const report = {
  schema: "a3d-production-runtime-asset-environment-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: assetSummary.pass && environmentSummary.pass,
  assetSummary,
  environmentSummary,
  gates: [
    {
      id: "real-glb-corpus",
      pass: assetSummary.pass,
      detail: assetSummary.pass ? `${assetSummary.assetCount} real GLB files verified and parsed` : assetSummary.failures.join("; ")
    },
    {
      id: "real-hdri-corpus",
      pass: environmentSummary.pass,
      detail: environmentSummary.pass ? `${environmentSummary.environmentCount} real HDRI files verified` : environmentSummary.failures.join("; ")
    },
    {
      id: "not-primitive-only",
      pass: assetSummary.primitiveOnlyRejected,
      detail: "GLB JSON chunks contain scene/material/animation complexity beyond primitive-only placeholder proof"
    },
    {
      id: "hdr-bound-to-flagships",
      pass: environmentSummary.unresolvedFlagshipBindings.length === 0 && environmentSummary.flagshipBindingCount >= 8,
      detail: "Every V6 flagship visual slot has a named HDR environment binding"
    }
  ]
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
