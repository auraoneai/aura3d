#!/usr/bin/env node
/** Read-only validation for registration-plan.json. Never invokes the CLI. */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const plan = JSON.parse(readFileSync(resolve(here, "registration-plan.json"), "utf8"));
const source = resolve(repoRoot, plan.asset.source);
const generator = resolve(repoRoot, plan.asset.generator);
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const failures = [
  ...(plan.status === "prepared-not-executed" ? [] : ["status"]),
  ...(plan.sharedCatalogWritesAuthorizedHere === false ? [] : ["shared-write-authorization"]),
  ...(plan.asset.id === "galleryShiftCutawayMuseumWorld" ? [] : ["one-id"]),
  ...(hash(source) === plan.asset.sha256 ? [] : ["asset-hash"]),
  ...(statSync(source).size === plan.asset.sizeBytes ? [] : ["asset-size"]),
  ...(hash(generator) === plan.asset.generatorSha256 ? [] : ["generator-hash"]),
  ...(plan.registrationCommand.filter((value) => value === "galleryShiftCutawayMuseumWorld").length === 1 ? [] : ["registration-id-count"]),
  ...(plan.probeConfig.orientation.upAxis === "+Y" ? [] : ["probe-up-axis"]),
  ...(plan.promotionSequenceOwnedByRoot.length === 6 ? [] : ["promotion-sequence"])
];

const receipt = {
  schema: "aura3d.gallery-shift.world-registration-plan-readiness/1.0",
  ready: failures.length === 0,
  executed: false,
  failures,
  asset: { id: plan.asset.id, sha256: hash(source), sizeBytes: statSync(source).size },
  generator: { path: plan.asset.generator, sha256: hash(generator) },
  sharedFilesWritten: []
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
