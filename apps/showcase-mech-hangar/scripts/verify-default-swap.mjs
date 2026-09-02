/**
 * Verify the mandatory default-hangar visual pair without rewriting evidence.
 *
 * `mech-hangar-build.spec.ts` is the browser producer: it captures the initial
 * build, a valid slot swap, and source/asset-bound receipts.  This route-local
 * verifier is a cheap, deterministic follow-up gate for CI/release scripts. It
 * checks the receipt's producer and route hashes, retained PNG hashes, material
 * and occupancy thresholds, and—critically—that the visible bindings are the
 * four MH-2M modules rather than the Robotcand whole-body fallback.  It exits
 * non-zero until a real modular family is actually rendered as the primary
 * subject; a whole-body shell cannot satisfy the modular-family requirement.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const receiptPath = resolve(repoRoot, "tests/reports/mech-hangar/build-core-evidence.json");
const producer = "tests/browser/mech-hangar-build.spec.ts";
const report = existsSync(receiptPath) ? readJson(receiptPath) : null;
const ROUTE_SOURCE_FILES = [
  "apps/showcase-mech-hangar/src/arena/feel.ts",
  "apps/showcase-mech-hangar/src/arena/mech-fight.ts",
  "apps/showcase-mech-hangar/src/arena/rival.ts",
  "apps/showcase-mech-hangar/src/assembly.ts",
  "apps/showcase-mech-hangar/src/hangar-audio.ts",
  "apps/showcase-mech-hangar/src/hangar.ts",
  "apps/showcase-mech-hangar/src/hud.ts",
  "apps/showcase-mech-hangar/src/main.ts",
  "apps/showcase-mech-hangar/src/parts-catalog.ts",
  "apps/showcase-mech-hangar/src/parts-generated.ts",
  "apps/showcase-mech-hangar/src/stats.ts",
  "apps/showcase-mech-hangar/src/styles.css"
];
const requiredModularBindings = ["mechChassisA", "mechArmsA", "mechLegsA", "mechWeaponA"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function routeSourceSha256() {
  const hash = createHash("sha256");
  for (const file of ROUTE_SOURCE_FILES) {
    hash.update(file.replace("apps/showcase-mech-hangar/", "")).update("\0").update(readFileSync(resolve(repoRoot, file))).update("\0");
  }
  return hash.digest("hex");
}

function blocker(code, detail) {
  return { code, detail };
}

const blockers = [];
if (!report) blockers.push(blocker("receipt-missing", receiptPath));
if (report) {
  if (report.schema !== "aura3d.mech-hangar.browser-evidence/1.0" || report.pass !== true) blockers.push(blocker("receipt-not-passing", "build-core-evidence.json must be a passing browser receipt"));
  if (report.producer !== producer) blockers.push(blocker("producer-mismatch", String(report.producer)));
  if (report.producerSourceSha256 !== sha256File(resolve(repoRoot, producer))) blockers.push(blocker("producer-hash-stale", producer));
  const currentRouteHash = routeSourceSha256();
  if (report.routeSourceSha256 !== currentRouteHash) blockers.push(blocker("route-source-hash-stale", `${report.routeSourceSha256} != ${currentRouteHash}`));
  const artifacts = new Map((report.artifacts ?? []).map((entry) => [entry.path, entry.sha256]));
  for (const path of ["tests/reports/mech-hangar/hangar-default.png", "tests/reports/mech-hangar/hangar-swap.png"]) {
    if (!artifacts.has(path)) blockers.push(blocker("artifact-not-retained", path));
    else if (!existsSync(resolve(repoRoot, path)) || artifacts.get(path) !== sha256File(resolve(repoRoot, path))) blockers.push(blocker("artifact-hash-stale", path));
  }
  const visualChecks = report.details?.visualChecks ?? {};
  if (visualChecks.defaultAndSwapDiffer !== true) blockers.push(blocker("default-swap-not-different", "the valid slot swap did not change pixels"));
  for (const [label, composition] of [["default", visualChecks.defaultComposition], ["swap", visualChecks.swapComposition]]) {
    if (!composition) blockers.push(blocker(`${label}-composition-missing`, "composition metrics are required"));
    else {
      if (composition.clipped !== false) blockers.push(blocker(`${label}-composition-clipped`, "primary subject/world is clipped"));
      if (!(composition.foregroundCoverageRatio > 0.22)) blockers.push(blocker(`${label}-subject-too-small`, String(composition.foregroundCoverageRatio)));
      if (!(composition.distinctBuckets > 70)) blockers.push(blocker(`${label}-material-variation-too-flat`, String(composition.distinctBuckets)));
    }
  }
  const bindings = report.details?.visualPrimaryAssetBindings ?? [];
  const ids = new Set(bindings.map((entry) => String(entry.id)));
  for (const id of requiredModularBindings) if (!ids.has(id)) blockers.push(blocker("modular-primary-binding-missing", id));
  if (ids.has("robotcand")) blockers.push(blocker("whole-body-fallback-is-visible-primary", "Robotcand is not a modular MH-2M family"));
}

const result = {
  schema: "aura3d.mech-hangar.default-swap-verification/1.0",
  checkedReceipt: "tests/reports/mech-hangar/build-core-evidence.json",
  requiredModularBindings,
  blockers,
  pass: blockers.length === 0
};
console.log(JSON.stringify(result, null, 2));
if (!result.pass) {
  console.error(`MH-2M default/swap verifier: NO-GO (${blockers.length} blockers)`);
  console.error("The browser receipt is retained, but its current Robotcand fallback is not proof of a modular family.");
  process.exitCode = 1;
}
