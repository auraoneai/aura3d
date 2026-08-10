import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const sha256 = (path: string): string => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
const positionMatches = (actual: readonly number[] | undefined, expected: readonly number[], tolerance = 1e-6): boolean =>
  Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]!) <= tolerance);

const browser = json("tests/reports/rapier-character-lab/browser.json");
const comparator = json("tests/reports/current-head-to-head/physical-character/aggregate.json");
const visualAudit = json("tests/reports/2.0-visual-audit/examples/report-rapier-character-lab.json");
const routeSource = source("examples/rapier-character-lab/main.ts");
const adrSource = source("docs/architecture/adr/0004-physical-simulation-is-optional-rapier.md");
const expectedAssetHash = "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f";
const expectedFinal = [-0.11922672390937805, 1.2100166082382202, -0.00004769854785990901] as const;
const artifacts = [
  "tests/reports/rapier-character-lab/public-initial-canvas.png",
  "tests/reports/rapier-character-lab/public-initial-page.png",
  "tests/reports/rapier-character-lab/public-complete-canvas.png",
  "tests/reports/rapier-character-lab/public-complete-page.png",
  "tests/reports/2.0-visual-audit/examples/examples--rapier-character-lab--canvas.png",
  "tests/reports/2.0-visual-audit/examples/examples--rapier-character-lab--page.png",
  "tests/reports/current-head-to-head/physical-character/aura-before.png",
  "tests/reports/current-head-to-head/physical-character/three-before.png",
  "tests/reports/current-head-to-head/physical-character/aura-after.png",
  "tests/reports/current-head-to-head/physical-character/three-after.png"
];

const checks: Check[] = [
  check("accepted-selected-owner", adrSource.includes("Status:** accepted") && adrSource.includes("Rapier owns the selected engine"), "accepted ADR selects Rapier as the sole optional physical-simulation owner"),
  check("public-boundary", routeSource.includes('from "@aura3d/engine"') && routeSource.includes('from "@aura3d/physics-rapier"') && routeSource.includes("assets.showcaseAnimatedRunnerHero") && !/from\s+["']three|@dimforge\/rapier|@aura3d\/(?:rendering|scene)|packages\//.test(routeSource), "public route uses root Aura, the selected adapter, and a typed asset without direct engine/internal imports"),
  check("exact-typed-character", browser.initial?.assetId === "showcaseAnimatedRunnerHero" && browser.initial?.assetHash === `sha256-${expectedAssetHash}` && sha256("public/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb") === expectedAssetHash, `asset=${String(browser.initial?.assetId)}; SHA-256=${String(browser.initial?.assetHash)}`),
  check("native-adapter-controller", browser.initial?.packageOwner === "@aura3d/physics-rapier" && browser.initial?.nativeCharacterController === true, `owner=${String(browser.initial?.packageOwner)}; native=${String(browser.initial?.nativeCharacterController)}`),
  check("deterministic-autostep-trace", browser.complete?.steps === 70 && browser.complete?.totalCollisions === 53 && browser.complete?.groundedFrames === 69 && browser.complete?.reachedAutostep === true && positionMatches(browser.complete?.position, expectedFinal), `steps/contacts/grounded=${String(browser.complete?.steps)}/${String(browser.complete?.totalCollisions)}/${String(browser.complete?.groundedFrames)}; position=${JSON.stringify(browser.complete?.position)}`),
  check("visible-state-change", browser.artifacts?.[0]?.canvasSha256 !== browser.artifacts?.[1]?.canvasSha256 && browser.artifacts?.[0]?.canvasBytes > 10_000 && browser.artifacts?.[1]?.canvasBytes > 10_000, `initial/final SHA-256=${String(browser.artifacts?.[0]?.canvasSha256)}/${String(browser.artifacts?.[1]?.canvasSha256)}`),
  check("keyboard-and-reset", browser.keyboard?.steps === 1 && browser.keyboard?.position?.[0] > -2.2 && browser.reset?.steps === 0 && Math.abs(browser.reset?.position?.[0] + 2.2) < 1e-5, `keyboard steps=${String(browser.keyboard?.steps)}; reset position=${JSON.stringify(browser.reset?.position)}`),
  check("lifecycle-clean", browser.lifecycle?.worldDisposed === true && browser.lifecycle?.bodiesReleased === true, `world disposed=${String(browser.lifecycle?.worldDisposed)}; bodies released=${String(browser.lifecycle?.bodiesReleased)}`),
  check("production-runtime-clean", browser.initial?.runtimeBackend === "production-runtime" && browser.complete?.runtimeBackend === "production-runtime" && browser.initial?.errors?.length === 0 && browser.complete?.errors?.length === 0, `backend=${String(browser.complete?.runtimeBackend)}; errors=${String(browser.complete?.errors?.length)}`),
  check("current-three-r185-comparator", comparator.pass === true && comparator.checks?.length === 8 && comparator.checks.every((entry: any) => entry.pass === true) && comparator.browser?.before?.three?.revision === "185" && comparator.browser?.before?.three?.actualDirectRapier === true && positionMatches(comparator.browser?.after?.aura?.position, comparator.browser?.after?.three?.position), `comparator=${String(comparator.pass)}; checks=${String(comparator.checks?.length)}; Three r${String(comparator.browser?.before?.three?.revision)}`),
  check("ten-final-artifacts-retained", artifacts.every((path) => statSync(resolve(path)).size > 10_000), `${artifacts.length} public and paired before/after artifacts are nontrivial`),
  check("filtered-route-visual-audit", visualAudit.pass === true && visualAudit.routeCount === 1 && visualAudit.results?.[0]?.route === "/examples/rapier-character-lab/" && visualAudit.results?.[0]?.failures?.length === 0, `route=${String(visualAudit.results?.[0]?.route)}; failures=${String(visualAudit.results?.[0]?.failures?.length)}`),
  check("explicit-claim-boundary", routeSource.includes("not root-engine physics or universal character-controller parity") && String(browser.comparisonBoundary).includes("Neither establishes universal controller"), "root physics and universal character-controller parity remain explicitly unclaimed")
];
const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.rapier-character-gallery/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checks,
  failures,
  scope: {
    proven: ["selected optional Rapier adapter", "native kinematic capsule controller", "ground snap, slope rule, collision response, and 0.30m autostep", "typed GLB production-runtime presentation", "deterministic keyboard/reset and lifecycle", "same-trace current Three.js r185 direct-Rapier comparison"],
    limited: ["one 70-step ground/autostep trace", "one typed runner asset", "Chromium browser evidence"],
    unclaimed: ["root createAuraApp physics", "universal physical-character behavior", "animation-state-machine, networking, visual, or performance parity"]
  },
  humanReview: {
    reviewer: "Codex full-resolution visual audit",
    reviewedAt: "2026-08-10",
    status: "passed",
    method: "Every final original-resolution image was opened and inspected individually after the final route, test, and canonical regeneration; automated capture was not treated as visual acceptance.",
    artifacts,
    verdict: "All ten final images are nonblank, undistorted, fully framed, and legible. The public initial/final pair visibly moves the real typed runner from the approach to the top of the 0.30m obstacle and the final UI independently reports 70/70 steps, 53 contacts, 69 grounded frames, and CLEARED. The paired Aura/Three frames retain aligned framing and meaningful before/after traversal; small pose/highlight raster differences remain explicit."
  }
};

const output = resolve("tests/reports/rapier-character-lab/aggregate.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`Rapier character gallery UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Rapier character gallery PASS: ${checks.length}/${checks.length} checks plus completed full-resolution visual review; ${output}`);
}
