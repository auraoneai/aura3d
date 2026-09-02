import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(new URL("../../.github/workflows/meshy-live-smoke.yml", import.meta.url));
const source = readFileSync(workflowPath, "utf8");

assert.match(source, /^on:\n  workflow_dispatch:/m);
for (const trigger of ["pull_request:", "pull_request_target:", "push:", "schedule:"]) {
  assert.ok(!source.includes(trigger), `workflow must not contain automatic trigger ${trigger}`);
}
assert.match(source, /permissions:\n  contents: read/);
assert.match(source, /concurrency:\n  group: meshy-live-smoke\n  cancel-in-progress: false/);
assert.match(source, /environment: meshy-live-smoke/);
assert.match(source, /run_paid_generation:[\s\S]*?type: boolean[\s\S]*?default: false/);
assert.match(source, /confirm_paid_generation:[\s\S]*?I AUTHORIZE MESHY SPEND/);
assert.match(source, /max_credits:[\s\S]*?type: number[\s\S]*?default: 0/);
assert.match(source, /MESHY_API_KEY: \$\{\{ secrets\.MESHY_API_KEY \}\}/);
assert.match(source, /if \[ -z "\$\{MESHY_API_KEY:-\}" \]/);
assert.match(source, /meshy auth status\n          meshy balance/);
assert.match(source, /npm install --global @meshy-ai\/cli@0\.2\.0/);
assert.match(source, /if: \$\{\{ inputs\.run_paid_generation \}\}[\s\S]*?MESHY_CONFIRMATION[\s\S]*?I AUTHORIZE MESHY SPEND/);
assert.match(source, /node-version: "24"/);
assert.match(source, /Number\.isFinite\(credits\) \|\| credits <= 0 \|\| credits > 30/);
assert.match(source, /Submit explicitly authorized paid smoke generation\n        if: \$\{\{ inputs\.run_paid_generation \}\}/);
assert.match(source, /meshy make "\$MESHY_PROMPT" --max-credits "\$MESHY_MAX_CREDITS" --async/);
assert.equal(source.match(/meshy make/g)?.length, 1, "only the gated paid step may generate");
assert.ok(!source.includes("--api-key"), "secret must not be passed in command arguments");
assert.ok(!source.includes("@latest"), "live dependencies must remain pinned");

console.log("meshy-live-smoke-workflow.test.mjs: static policy passed");
