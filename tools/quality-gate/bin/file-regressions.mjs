#!/usr/bin/env node
/**
 * File one `qr-ic-regression` GitHub issue per failed checkpoint item (T1.17).
 * Uses `gh` (GITHUB_TOKEN/GH_TOKEN); attribution = workflow run + item id.
 * Usage: node file-regressions.mjs --report metrics.json --label qr-ic-regression --run-id <id>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) =>
  arg.startsWith("--") ? [[arg.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]] : []
));
const report = JSON.parse(readFileSync(args.report ?? "metrics.json", "utf8"));
const label = args.label ?? "qr-ic-regression";
const runId = args["run-id"] ?? "unknown";
const failures = (report.items ?? []).filter((item) => item.status !== "ok" || (item.alignment && item.alignment.applicable && item.alignment.passed === false));

for (const item of failures) {
  const title = `[qr-ic] ${item.itemId}: ${item.status ?? "mask-misaligned"}`;
  const body = [
    `Item \`${item.itemId}\` failed in integrated checkpoint run ${runId}.`,
    "",
    `- status: ${item.status ?? "ok (metrics) — mask alignment failed"}`,
    `- alignment: ${JSON.stringify(item.alignment)}`,
    "",
    "Filed by `.github/workflows/quality-checkpoint.yml`. Triage per CONTRACTS §7."
  ].join("\n");
  try {
    execFileSync("gh", ["issue", "create", "--title", title, "--label", label, "--body", body], { stdio: "inherit" });
  } catch (error) {
    console.error(`issue create failed for ${item.itemId}: ${error.message}`);
  }
}
if (failures.length === 0) console.log("no regressions to file");
