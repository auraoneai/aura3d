#!/usr/bin/env node
// Poll npm until every package in the plan is visible with the plan's integrity.
//   node tools/release/poll-registry.mjs --plan <plan.json> --version 5.0.2 [--expect 25] [--timeout-min 30]
import { readFileSync } from "node:fs";
import { pollRound, registryState } from "./release-helpers.mjs";

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };
const [planPath, version] = [arg("--plan"), arg("--version")];
if (!planPath || !version) { console.error("usage: poll-registry.mjs --plan P --version V [--expect N] [--timeout-min M]"); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const expect = Number(arg("--expect", 25));
if (plan.packages.length !== expect) throw new Error(`expected ${expect} packages, plan has ${plan.packages.length}`);
const deadline = Date.now() + Number(arg("--timeout-min", 30)) * 60_000, t0 = Date.now();
for (;;) {
  const res = await pollRound(plan, version);
  const { state, bad } = registryState(res);
  console.log(`${Math.round((Date.now() - t0) / 1000)}s ok ${res.length - bad.length}/${res.length}${bad.length ? " pending: " + bad.map(([n, s]) => `${n}(${s})`).join(" ") : ""}`);
  if (state === "ok") { console.log("REGISTRY_OK"); break; }
  if (state === "mismatch") { console.log("REGISTRY_INTEGRITY_MISMATCH"); process.exit(2); }
  if (Date.now() > deadline) { console.log("REGISTRY_TIMEOUT"); process.exit(1); }
  await new Promise((r) => setTimeout(r, 20000));
}
