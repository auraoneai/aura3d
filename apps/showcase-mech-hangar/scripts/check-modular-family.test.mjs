import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const familyScript = resolve(scriptsDir, "check-modular-family.mjs");
const pairScript = resolve(scriptsDir, "verify-default-swap.mjs");

test("family gate is deterministic and blocks the current procedural spike", () => {
  const first = spawnSync(process.execPath, [familyScript], { encoding: "utf8" });
  const second = spawnSync(process.execPath, [familyScript], { encoding: "utf8" });
  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  const firstResult = JSON.parse(first.stdout);
  const secondResult = JSON.parse(second.stdout);
  assert.equal(firstResult.schema, "aura3d.mech-hangar.modular-family-gate/1.0");
  assert.equal(firstResult.pass, false);
  assert.equal(secondResult.pass, false);
  // The timestamp is intentionally omitted from the comparison; all gate
  // decisions and blocker codes must be stable across invocations.
  assert.deepEqual(
    { routeSourceSha256: firstResult.routeSourceSha256, blockers: firstResult.blockers },
    { routeSourceSha256: secondResult.routeSourceSha256, blockers: secondResult.blockers }
  );
  assert.ok(firstResult.blockers.some((entry) => entry.includes("procedural-box-cylinder-generator")));
  assert.ok(firstResult.blockers.some((entry) => entry.includes("route:route-hides-modular-family")));
});

test("default/swap verifier refuses fallback-only visual bindings", () => {
  const result = spawnSync(process.execPath, [pairScript], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, "aura3d.mech-hangar.default-swap-verification/1.0");
  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((entry) => entry.code === "modular-primary-binding-missing"));
  assert.ok(report.blockers.some((entry) => entry.code === "whole-body-fallback-is-visible-primary"));
});
