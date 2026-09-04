#!/usr/bin/env node
/**
 * `check:asset-screening`: release gate for the asset-quality pipeline.
 *
 * Wires `screen:assets` verdicts into the release: it fails when the hero
 * intent stops declaring `reject-and-fail`, when the green hero subset loses
 * its retained selection, or when the known-bad hero intent gains a selection
 * (a wrong hero admitted is worse than a missing one). Refusals are correct --
 * the turbo-hero-vehicle report must keep selecting nothing -- so this gate
 * locks the refusal in rather than treating it as a failure.
 *
 * Offline and deterministic: it reads the retained reports under
 * `tests/reports/asset-screening/` instead of re-hitting the network. A fresh
 * `screen:assets` pass that changes those reports re-arms this gate
 * automatically.
 *
 * Usage: node tools/asset-screening/gate.mjs [--root <repo>]
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const root = resolve(flag("--root") ?? process.cwd());

const failures = [];
const notes = [];

function check(condition, failure, note) {
  if (condition) {
    if (note) notes.push(note);
  } else {
    failures.push(failure);
  }
}

// 1. The hero intent must keep failing loudly. A wrong hero is worse than a
// missing one, so any fallback softening is a release blocker.
const heroIntentPath = resolve(root, "tools/asset-screening/intents/hero-vehicle.json");
if (!existsSync(heroIntentPath)) {
  failures.push(`missing hero intent ${heroIntentPath}`);
} else {
  const intent = JSON.parse(readFileSync(heroIntentPath, "utf8"));
  check(
    intent.fallbackPolicy === "reject-and-fail",
    `hero intent fallbackPolicy is "${intent.fallbackPolicy ?? "unset"}", expected "reject-and-fail"`,
    `hero intent declares fallbackPolicy=reject-and-fail`,
  );
}

// 2. The green hero subset must retain a selection: the proof that the
// pipeline can still land a hero (the gate is not "refuse everything").
const greenReportPath = resolve(root, "tests/reports/asset-screening/hero-vehicle-mini-cooper-race-car.json");
if (!existsSync(greenReportPath)) {
  failures.push(`missing green hero report ${greenReportPath}; run screen:assets to retain one`);
} else {
  const report = JSON.parse(readFileSync(greenReportPath, "utf8"));
  const selectedId = report.selected?.candidate?.id;
  check(
    typeof selectedId === "string" && selectedId.length > 0,
    `green hero report selects nothing; the pipeline refuses everything`,
    `green hero report selects ${selectedId}`,
  );
}

// 3. The known-bad hero screen must keep refusing: turbo-hero-vehicle selects
// nothing because no candidate survived admission. A selection here means a
// visually-wrong hero got admitted and the gate must go red.
const refusalReportPath = resolve(root, "tests/reports/asset-screening/turbo-hero-vehicle.json");
if (!existsSync(refusalReportPath)) {
  failures.push(`missing refusal report ${refusalReportPath}; run screen:assets to retain one`);
} else {
  const report = JSON.parse(readFileSync(refusalReportPath, "utf8"));
  check(
    report.selected == null,
    `refusal report selects ${report.selected?.candidate?.id ?? "unknown"}; a bad hero was admitted`,
    `refusal report selects nothing (${report.candidates?.length ?? 0} candidates, all rejected with reasons)`,
  );
}

for (const note of notes) console.log(`ok: ${note}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`gate failed: ${failure}`);
  process.exit(1);
}
console.log("asset-screening gate: green");
