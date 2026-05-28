import { existsCheck, fileIncludes, writeReport } from "../check-common";

const checks = [
  fileIncludes("packages/aura3d-cli/src/index.ts", ["assetBasePath", "checkDeploy", "Deploy check missing hashed asset"], "deployment cli"),
  fileIncludes("docs/agents/deployment.md", ["check-deploy", "--public-path", "Cloudflare", "Netlify", "Vercel"], "deployment docs"),
  existsCheck("tests/unit/aura3d-cli/deployment.test.ts", "deployment tests")
];

writeReport("tests/reports/agent-deployment.json", "aura3d-agent-deployment", checks);
