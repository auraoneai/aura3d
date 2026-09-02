import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const familyScript = resolve(scriptsDir, "check-modular-family.mjs");
const pairScript = resolve(scriptsDir, "verify-default-swap.mjs");

test("family gate is deterministic and accepts the authored MH-2M family", () => {
  const first = spawnSync(process.execPath, [familyScript], { encoding: "utf8" });
  const second = spawnSync(process.execPath, [familyScript], { encoding: "utf8" });
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  const firstResult = JSON.parse(first.stdout);
  const secondResult = JSON.parse(second.stdout);
  assert.equal(firstResult.schema, "aura3d.mech-hangar.modular-family-gate/1.0");
  assert.equal(firstResult.pass, true);
  assert.equal(secondResult.pass, true);
  assert.equal(firstResult.requiredPartCount, 16);
  assert.equal(firstResult.partResults.filter((part) => part.failures.length === 0).length, 16);
  assert.deepEqual(firstResult.blockers, []);
  assert.deepEqual(secondResult.blockers, []);
  // The timestamp is intentionally omitted from the comparison; all gate
  // decisions and blocker codes must be stable across invocations.
  assert.deepEqual(
    { routeSourceSha256: firstResult.routeSourceSha256, blockers: firstResult.blockers },
    { routeSourceSha256: secondResult.routeSourceSha256, blockers: secondResult.blockers }
  );
});

test("default/swap verifier accepts the four typed visual bindings", () => {
  const result = spawnSync(process.execPath, [pairScript], { encoding: "utf8" });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, "aura3d.mech-hangar.default-swap-verification/1.0");
  assert.equal(report.pass, true);
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.requiredModularBindings, ["mechChassisA", "mechArmsA", "mechLegsA", "mechWeaponA"]);
});
