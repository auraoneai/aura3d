import { existsCheck, fileIncludes, writeReport } from "../check-common";

const checks = [
  existsCheck("packages/aura3d-cli/package.json", "cli package"),
  fileIncludes("packages/aura3d-cli/src/index.ts", ["addAsset", "validateAssets", "writeTypedAssets", "checkDeploy", "initAgentFiles", "aura3d.assets/1.0"], "cli source"),
  fileIncludes("packages/aura3d-cli/src/cli.ts", ["assets add", "assets validate", "check-deploy", "init --agent all"], "cli command surface"),
  existsCheck("tests/unit/aura3d-cli/assets.test.ts", "asset cli tests")
];

writeReport("tests/reports/asset-cli.json", "aura3d-asset-cli", checks);
