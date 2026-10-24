import { execFileSync } from "node:child_process";
import { test } from "@playwright/test";

/**
 * Remote scoring for the cold-start authoring trial (tools/agent-eval). Remote only: software WebGL2.
 * AURA3D_RUN_ID encodes the batch and shard: `agenteval-<batch>-s<i>of<n>`.
 */
test("agent-eval snapshot scoring", async () => {
  test.setTimeout(3_300_000);
  const runId = process.env.AURA3D_RUN_ID ?? "";
  const match = /^agenteval-(.+)-s(\d+)of(\d+)$/.exec(runId);
  if (!match) throw new Error(`AURA3D_RUN_ID must look like agenteval-<batch>-s<i>of<n>, got "${runId}"`);
  const [, batch, shard, shards] = match;
  execFileSync("node", ["tools/agent-eval/remote/score-all.mjs", `/repo/tools/agent-eval/_stage/${batch}`, `${shard}/${shards}`], {
    stdio: "inherit",
    timeout: 3_200_000
  });
});
